#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use eframe::egui::{self, Align, Color32, FontData, FontDefinitions, FontFamily, FontId, Frame, Layout, Margin, RichText, Stroke, Vec2};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

const APP_TITLE: &str = "SMMB Firmware Flasher";
const LATEST_FIRMWARE_VERSION: &str = "0.2.11";
const TARGET_BOARD: &str = "ESP32-CAM (AI-Thinker)";
const SUPPORTED_CAMERA: &str = "OV2640";
const FLASH_BAUD: &str = "460800";
const APP_OFFSET: &str = "0x10000";
const REFRESH_INTERVAL: Duration = Duration::from_secs(2);

#[derive(Clone)]
struct BoardPort {
    port: String,
    description: String,
}

#[derive(PartialEq)]
enum FlashState {
    Ready,
    Flashing,
    Success,
    Failed,
}

struct FirmwareApp {
    boards: Vec<BoardPort>,
    firmwares: Vec<PathBuf>,
    selected_board: Option<usize>,
    selected_firmware: Option<usize>,
    last_refresh: Instant,
    state: FlashState,
    progress: f32,
    message: String,
    result_rx: Option<Receiver<Result<String, String>>>,
    board_scan_rx: Option<Receiver<Vec<BoardPort>>>,
    screenshot_path: Option<PathBuf>,
    rendered_frames: u32,
    screenshot_requested: bool,
}

impl FirmwareApp {
    fn new(context: &eframe::CreationContext<'_>, screenshot_path: Option<PathBuf>) -> Self {
        configure_fonts(&context.egui_ctx);
        configure_style(&context.egui_ctx);
        let firmwares = find_firmwares();
        let (board_sender, board_receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let _ = board_sender.send(find_boards());
        });
        Self {
            selected_board: None,
            selected_firmware: (!firmwares.is_empty()).then_some(0),
            boards: Vec::new(),
            firmwares,
            last_refresh: Instant::now(),
            state: FlashState::Ready,
            progress: 0.0,
            message: format!("พร้อมอัปเดตเฟิร์มแวร์เวอร์ชัน {LATEST_FIRMWARE_VERSION}"),
            result_rx: None,
            board_scan_rx: Some(board_receiver),
            screenshot_path,
            rendered_frames: 0,
            screenshot_requested: false,
        }
    }

    fn refresh_boards(&mut self) {
        if self.board_scan_rx.is_some() {
            return;
        }
        let (sender, receiver) = mpsc::channel();
        self.board_scan_rx = Some(receiver);
        self.last_refresh = Instant::now();
        std::thread::spawn(move || {
            let _ = sender.send(find_boards());
        });
    }

    fn poll_board_scan(&mut self) {
        let scanned_boards = self.board_scan_rx.as_ref().and_then(|receiver| receiver.try_recv().ok());
        if let Some(boards) = scanned_boards {
            let previous = self.selected_board.and_then(|index| self.boards.get(index)).map(|board| board.port.clone());
            self.boards = boards;
            self.selected_board = previous
                .and_then(|port| self.boards.iter().position(|board| board.port == port))
                .or_else(|| (!self.boards.is_empty()).then_some(0));
            self.board_scan_rx = None;
            self.last_refresh = Instant::now();
        }
    }

    fn start_flash(&mut self) {
        let Some(board) = self.selected_board.and_then(|index| self.boards.get(index)).cloned() else {
            self.state = FlashState::Failed;
            self.message = "ไม่พบบอร์ด กรุณาตรวจสาย USB และกดรีเฟรช".to_owned();
            return;
        };
        let Some(firmware) = self.selected_firmware.and_then(|index| self.firmwares.get(index)).cloned() else {
            self.state = FlashState::Failed;
            self.message = "ไม่พบไฟล์เฟิร์มแวร์ที่เลือก".to_owned();
            return;
        };
        let (sender, receiver) = mpsc::channel();
        self.result_rx = Some(receiver);
        self.state = FlashState::Flashing;
        self.progress = 0.15;
        self.message = format!("กำลังแฟลช {} ไปยัง {} กรุณาอย่าถอดสาย", firmware_name(&firmware), board.port);
        std::thread::spawn(move || {
            let result = run_esptool(&board.port, &firmware);
            let _ = sender.send(result);
        });
    }

    fn poll_flash(&mut self) {
        if self.state == FlashState::Flashing {
            self.progress = (self.progress + 0.003).min(0.9);
        }
        let result = self.result_rx.as_ref().and_then(|receiver| receiver.try_recv().ok());
        if let Some(result) = result {
            self.result_rx = None;
            match result {
                Ok(summary) => {
                    self.state = FlashState::Success;
                    self.progress = 1.0;
                    self.message = summary;
                }
                Err(error) => {
                    self.state = FlashState::Failed;
                    self.progress = 0.0;
                    self.message = error;
                }
            }
        }
    }

    fn card(frame_color: Color32) -> Frame {
        Frame::new()
            .fill(frame_color)
            .corner_radius(14)
            .stroke(Stroke::new(1.0, Color32::from_rgb(222, 228, 235)))
            .inner_margin(Margin::same(20))
    }

    fn step_header(ui: &mut egui::Ui, number: &str, title: &str, complete: bool) {
        ui.horizontal(|ui| {
            let circle_color = if complete { Color32::from_rgb(31, 151, 106) } else { Color32::from_rgb(43, 102, 211) };
            Frame::new().fill(circle_color).corner_radius(15).inner_margin(Margin::symmetric(9, 4)).show(ui, |ui| {
                ui.label(RichText::new(number).color(Color32::WHITE).strong());
            });
            ui.add_space(8.0);
            ui.label(RichText::new(title).size(18.0).strong().color(Color32::from_rgb(32, 43, 57)));
        });
    }

    fn draw(&mut self, root: &mut egui::Ui) {
        Frame::new().fill(Color32::from_rgb(26, 45, 73)).inner_margin(Margin::symmetric(32, 18)).show(root, |ui| {
            ui.horizontal(|ui| {
                Frame::new().fill(Color32::from_rgb(60, 124, 225)).corner_radius(10).inner_margin(Margin::same(10)).show(ui, |ui| {
                    ui.label(RichText::new("⚡").size(24.0).color(Color32::WHITE));
                });
                ui.add_space(10.0);
                ui.vertical(|ui| {
                    ui.label(RichText::new(APP_TITLE).size(22.0).strong().color(Color32::WHITE));
                    ui.label(RichText::new(format!("{TARGET_BOARD} · กล้อง {SUPPORTED_CAMERA}")).size(13.0).color(Color32::from_rgb(186, 202, 224)));
                });
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.label(RichText::new(format!("● Firmware {LATEST_FIRMWARE_VERSION}")).color(Color32::from_rgb(116, 226, 176)));
                });
            });
        });

        Frame::new().fill(Color32::from_rgb(244, 247, 251)).inner_margin(Margin::symmetric(32, 24)).show(root, |ui| {
            ui.set_max_width(980.0);
            ui.horizontal(|ui| {
                ui.label(RichText::new("อัปเดตเฟิร์มแวร์").size(28.0).strong().color(Color32::from_rgb(24, 36, 51)));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.label(RichText::new("ใช้เวลาประมาณ 1–2 นาที").color(Color32::from_rgb(105, 116, 130)));
                });
            });
            ui.label(RichText::new("ทำตาม 3 ขั้นตอนด้านล่าง โดยอย่าถอดสายระหว่างกำลังแฟลช").size(14.0).color(Color32::from_rgb(105, 116, 130)));
            ui.add_space(18.0);

            ui.columns(2, |columns| {
                Self::card(Color32::WHITE).show(&mut columns[0], |ui| {
                    Self::step_header(ui, "1", "เลือกบอร์ด", self.selected_board.is_some());
                    ui.add_space(13.0);
                    if self.boards.is_empty() {
                        Frame::new().fill(Color32::from_rgb(247, 249, 252)).corner_radius(10).inner_margin(Margin::same(16)).show(ui, |ui| {
                            ui.label(RichText::new("ยังไม่พบบอร์ดที่เชื่อมต่อ").strong().color(Color32::from_rgb(71, 82, 96)));
                            ui.label(RichText::new("เสียบบอร์ดด้วยสาย USB แล้วกดรีเฟรช").size(13.0).color(Color32::from_rgb(118, 128, 141)));
                        });
                    } else {
                        for (index, board) in self.boards.iter().enumerate() {
                            let selected = self.selected_board == Some(index);
                            if ui.selectable_label(selected, RichText::new(format!("{}   {}", board.port, board.description)).size(14.0)).clicked() {
                                self.selected_board = Some(index);
                            }
                        }
                    }
                    ui.add_space(10.0);
                    if ui.add_sized([130.0, 34.0], egui::Button::new("↻  รีเฟรชบอร์ด")).clicked() {
                        self.refresh_boards();
                    }
                });

                Self::card(Color32::WHITE).show(&mut columns[1], |ui| {
                    Self::step_header(ui, "2", "เลือกเวอร์ชัน", self.selected_firmware.is_some());
                    ui.add_space(13.0);
                    if self.firmwares.is_empty() {
                        ui.colored_label(Color32::from_rgb(190, 72, 72), format!("ไม่พบไฟล์ firmware-{LATEST_FIRMWARE_VERSION}.bin"));
                    } else {
                        for (index, firmware) in self.firmwares.iter().enumerate() {
                            let selected = self.selected_firmware == Some(index);
                            let latest = version_numbers(firmware) == version_numbers_from_text(LATEST_FIRMWARE_VERSION);
                            let label = if latest { format!("{}   • เวอร์ชันล่าสุด", firmware_name(firmware)) } else { firmware_name(firmware) };
                            if ui.selectable_label(selected, RichText::new(label).size(14.0)).clicked() {
                                self.selected_firmware = Some(index);
                            }
                        }
                    }
                    ui.add_space(10.0);
                    ui.label(RichText::new(format!("เวอร์ชันที่แนะนำ: {LATEST_FIRMWARE_VERSION}")).size(12.0).color(Color32::from_rgb(118, 128, 141)));
                });
            });

            ui.add_space(16.0);
            Self::card(Color32::WHITE).show(ui, |ui| {
                Self::step_header(ui, "3", "แฟลชเฟิร์มแวร์", self.state == FlashState::Success);
                ui.add_space(14.0);
                Frame::new().fill(Color32::from_rgb(255, 248, 229)).corner_radius(9).inner_margin(Margin::same(12)).show(ui, |ui| {
                    ui.label(RichText::new("กดปุ่ม IO0 ค้างไว้ กดปุ่ม RST 1 ครั้ง แล้วปล่อย IO0 เพื่อเข้าโหมดแฟลช").color(Color32::from_rgb(126, 87, 20)).strong());
                });
                ui.add_space(14.0);
                ui.add(egui::ProgressBar::new(self.progress).desired_width(f32::INFINITY).animate(self.state == FlashState::Flashing));
                ui.add_space(8.0);
                let message_color = match self.state {
                    FlashState::Success => Color32::from_rgb(24, 139, 91),
                    FlashState::Failed => Color32::from_rgb(190, 63, 63),
                    _ => Color32::from_rgb(83, 94, 109),
                };
                ui.label(RichText::new(&self.message).color(message_color));
                ui.add_space(14.0);
                ui.horizontal(|ui| {
                    let enabled = self.state != FlashState::Flashing && self.selected_board.is_some() && self.selected_firmware.is_some();
                    if ui.add_enabled(enabled, egui::Button::new(RichText::new("⚡  เริ่มแฟลชเฟิร์มแวร์").size(16.0).color(Color32::WHITE)).fill(Color32::from_rgb(43, 102, 211)).min_size(Vec2::new(230.0, 44.0))).clicked() {
                        self.start_flash();
                    }
                    if self.state == FlashState::Success {
                        ui.label(RichText::new("✓ เสร็จเรียบร้อย กดปุ่ม RST 1 ครั้งเพื่อเริ่มใช้งาน").color(Color32::from_rgb(24, 139, 91)).strong());
                    }
                });
            });
        });
    }
}

impl eframe::App for FirmwareApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        ui.painter().rect_filled(ui.max_rect(), 0.0, Color32::from_rgb(244, 247, 251));
        if self.last_refresh.elapsed() >= REFRESH_INTERVAL && self.state != FlashState::Flashing {
            self.refresh_boards();
        }
        self.poll_board_scan();
        self.poll_flash();
        self.draw(ui);
        self.rendered_frames += 1;

        if self.screenshot_path.is_some() && self.rendered_frames >= 120 && !self.screenshot_requested {
            self.screenshot_requested = true;
            ctx.send_viewport_cmd(egui::ViewportCommand::Screenshot(Default::default()));
        }
        if self.screenshot_requested {
            let screenshot = ctx.input(|input| input.events.iter().find_map(|event| {
                if let egui::Event::Screenshot { image, .. } = event { Some(image.clone()) } else { None }
            }));
            if let (Some(image), Some(path)) = (screenshot, self.screenshot_path.as_ref()) {
                if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
                let mut pixels = Vec::with_capacity(image.pixels.len() * 4);
                for color in &image.pixels { pixels.extend_from_slice(&color.to_array()); }
                let _ = image::save_buffer(path, &pixels, image.width() as u32, image.height() as u32, image::ColorType::Rgba8);
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            }
        }
        ctx.request_repaint();
    }
}

fn configure_fonts(ctx: &egui::Context) {
    let font_paths = [r"C:\Windows\Fonts\tahoma.ttf", r"C:\Windows\Fonts\LeelawUI.ttf"];
    let Some((_, bytes)) = font_paths.iter().find_map(|path| fs::read(path).ok().map(|bytes| (*path, bytes))) else { return; };
    let mut fonts = FontDefinitions::default();
    fonts.font_data.insert("thai".to_owned(), FontData::from_owned(bytes).into());
    fonts.families.entry(FontFamily::Proportional).or_default().insert(0, "thai".to_owned());
    ctx.set_fonts(fonts);
}

fn configure_style(ctx: &egui::Context) {
    let mut style = (*ctx.style_of(egui::Theme::Light)).clone();
    style.spacing.item_spacing = Vec2::new(10.0, 8.0);
    style.visuals.selection.bg_fill = Color32::from_rgb(225, 236, 252);
    style.visuals.selection.stroke = Stroke::new(1.0, Color32::from_rgb(43, 102, 211));
    style.text_styles.insert(egui::TextStyle::Body, FontId::new(14.0, FontFamily::Proportional));
    ctx.set_style_of(egui::Theme::Light, style);
}

fn find_boards() -> Vec<BoardPort> {
    let script = "Get-CimInstance Win32_SerialPort | ForEach-Object { \"$($_.DeviceID)|$($_.Name)\" }";
    let Ok(output) = Command::new("powershell").args(["-NoProfile", "-Command", script]).output() else { return Vec::new(); };
    String::from_utf8_lossy(&output.stdout).lines().filter_map(|line| {
        let (port, description) = line.trim().split_once('|')?;
        (!port.is_empty()).then(|| BoardPort { port: port.to_owned(), description: description.to_owned() })
    }).collect()
}

fn find_firmwares() -> Vec<PathBuf> {
    let candidates = [PathBuf::from("../firmware"), PathBuf::from("../../firmware"), PathBuf::from("firmware")];
    let Some(directory) = candidates.iter().find(|path| path.is_dir()) else { return Vec::new(); };
    let mut files: Vec<PathBuf> = fs::read_dir(directory).ok().into_iter().flatten().filter_map(Result::ok).map(|entry| entry.path())
        .filter(|path| path.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.starts_with("firmware-") && name.ends_with(".bin"))).collect();
    files.sort_by(|left, right| version_numbers(right).cmp(&version_numbers(left)));
    files
}

fn version_numbers(path: &Path) -> Vec<u32> {
    firmware_name(path).trim_start_matches("firmware-").trim_end_matches(".bin").split('.').filter_map(|part| part.parse().ok()).collect()
}

fn version_numbers_from_text(version: &str) -> Vec<u32> {
    version.split('.').filter_map(|part| part.parse().ok()).collect()
}

fn firmware_name(path: &Path) -> String {
    path.file_name().and_then(|name| name.to_str()).unwrap_or("firmware.bin").to_owned()
}

fn run_esptool(port: &str, firmware: &Path) -> Result<String, String> {
    let firmware_path = firmware.canonicalize().map_err(|error| format!("เปิดไฟล์เฟิร์มแวร์ไม่ได้: {error}"))?;
    let attempts = [("python", vec!["-m", "esptool"]), ("py", vec!["-m", "esptool"])];
    for (program, prefix) in attempts {
        let mut command = Command::new(program);
        command.args(prefix).args(["--chip", "esp32", "--port", port, "--baud", FLASH_BAUD, "write_flash", "--flash_mode", "dio", "--flash_freq", "40m", APP_OFFSET]).arg(&firmware_path);
        match command.output() {
            Ok(output) if output.status.success() => return Ok(format!("แฟลช {} สำเร็จแล้ว", firmware_name(&firmware_path))),
            Ok(output) => {
                let details = String::from_utf8_lossy(&output.stderr);
                if !details.contains("No module named") {
                    return Err(format!("แฟลชไม่สำเร็จ: {}", details.lines().last().unwrap_or("ตรวจการต่อบอร์ดแล้วลองใหม่")));
                }
            }
            Err(_) => continue,
        }
    }
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        let platformio_root = PathBuf::from(profile).join(".platformio");
        let python = platformio_root.join("penv/Scripts/python.exe");
        let esptool = platformio_root.join("packages/tool-esptoolpy/esptool.py");
        if python.is_file() && esptool.is_file() {
            let output = Command::new(python).arg(esptool).args(["--chip", "esp32", "--port", port, "--baud", FLASH_BAUD, "write_flash", "--flash_mode", "dio", "--flash_freq", "40m", APP_OFFSET]).arg(&firmware_path).output()
                .map_err(|error| format!("เปิดเครื่องมือแฟลชไม่ได้: {error}"))?;
            if output.status.success() {
                return Ok(format!("แฟลช {} สำเร็จแล้ว", firmware_name(&firmware_path)));
            }
            let details = String::from_utf8_lossy(&output.stderr);
            return Err(format!("แฟลชไม่สำเร็จ: {}", details.lines().last().unwrap_or("ตรวจการต่อบอร์ดแล้วลองใหม่")));
        }
    }
    Err("ไม่พบเครื่องมือ esptool ในเครื่อง กรุณาติดตั้ง PlatformIO/esptool ก่อนใช้งาน".to_owned())
}

fn main() -> eframe::Result {
    let mut arguments = std::env::args().skip(1);
    let mut screenshot_path = None;
    while let Some(argument) = arguments.next() {
        if argument == "--screenshot" { screenshot_path = arguments.next().map(PathBuf::from); }
    }
    let viewport = egui::ViewportBuilder::default().with_title(APP_TITLE).with_inner_size([1080.0, 820.0]).with_min_inner_size([880.0, 700.0]);
    eframe::run_native(APP_TITLE, eframe::NativeOptions { viewport, ..Default::default() }, Box::new(move |context| Ok(Box::new(FirmwareApp::new(context, screenshot_path)))))
}
