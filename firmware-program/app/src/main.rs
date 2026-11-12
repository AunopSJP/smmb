#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use eframe::egui::{
    self, Align, Align2, Color32, FontData, FontDefinitions, FontFamily, FontId, Frame, Layout,
    Margin, RichText, Sense, Stroke, StrokeKind, Vec2,
};
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

const APP_TITLE: &str = "SMMB Firmware Flasher";
const TARGET_BOARD: &str = "ESP32-CAM (AI-Thinker)";
const SUPPORTED_CAMERA: &str = "OV2640";
const FLASH_BAUD: &str = "460800";
const BOOTLOADER_OFFSET: &str = "0x1000";
const PARTITION_OFFSET: &str = "0x8000";
const BOOT_APP0_OFFSET: &str = "0xe000";
const APP_OFFSET: &str = "0x10000";
const REFRESH_INTERVAL: Duration = Duration::from_secs(2);
const CONTENT_WIDTH: f32 = 1240.0;
/// Below this window width the UI switches to the compact (phone-like) layout.
const COMPACT_BELOW: f32 = 600.0;
/// Two cards side by side only when the page is at least this wide.
const TWO_COLUMN_FROM: f32 = 760.0;

static COMPACT: AtomicBool = AtomicBool::new(false);

fn compact() -> bool {
    COMPACT.load(Ordering::Relaxed)
}

const CARD_H_ID: &str = "card_h";
const CARD_H_NEXT_ID: &str = "card_h_next";

/// Minimum inner height so side-by-side cards end at the same line.
fn card_min_height(ui: &egui::Ui) -> f32 {
    ui.ctx()
        .data(|d| d.get_temp::<f32>(egui::Id::new(CARD_H_ID)))
        .unwrap_or(0.0)
}

fn report_card_height(ui: &egui::Ui, height: f32) {
    let id = egui::Id::new(CARD_H_NEXT_ID);
    ui.ctx().data_mut(|d| {
        let current = d.get_temp::<f32>(id).unwrap_or(0.0);
        d.insert_temp(id, current.max(height));
    });
}

/// Height of the board/firmware lists: grows with the window, clamped.
fn list_height(ui: &egui::Ui) -> f32 {
    (ui.ctx().content_rect().height() * 0.26).clamp(120.0, 320.0)
}
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// ---- Design tokens -------------------------------------------------------
// Warm neutral surfaces + the SMMB deep red as the single accent.
const BG: Color32 = Color32::from_rgb(243, 241, 237);
const SURFACE: Color32 = Color32::from_rgb(255, 255, 255);
const SURFACE_MUTED: Color32 = Color32::from_rgb(249, 247, 244);
const BORDER: Color32 = Color32::from_rgb(228, 223, 216);
const BORDER_STRONG: Color32 = Color32::from_rgb(201, 193, 183);
const TEXT: Color32 = Color32::from_rgb(31, 29, 27);
const TEXT_SECONDARY: Color32 = Color32::from_rgb(104, 97, 89);
const TEXT_MUTED: Color32 = Color32::from_rgb(111, 103, 94);
const BRAND: Color32 = Color32::from_rgb(142, 44, 51);
const BRAND_SOFT: Color32 = Color32::from_rgb(247, 235, 235);
const SUCCESS: Color32 = Color32::from_rgb(28, 111, 75);
const SUCCESS_SOFT: Color32 = Color32::from_rgb(232, 244, 238);
const WARN: Color32 = Color32::from_rgb(138, 90, 18);
const WARN_SOFT: Color32 = Color32::from_rgb(251, 242, 223);
const ERROR: Color32 = Color32::from_rgb(165, 51, 47);
const ERROR_SOFT: Color32 = Color32::from_rgb(251, 236, 234);
const HEADER: Color32 = Color32::from_rgb(33, 30, 27);
const HEADER_PILL: Color32 = Color32::from_rgb(49, 44, 39);
const HEADER_TEXT: Color32 = Color32::from_rgb(250, 247, 243);
const HEADER_MUTED: Color32 = Color32::from_rgb(190, 181, 171);

#[derive(Clone)]
struct BoardPort {
    port: String,
    description: String,
    instance_id: String,
    likely_esp32: bool,
}

#[derive(Clone)]
enum IdentifyPhase {
    WaitingForUnplug { initial: Vec<BoardPort> },
    WaitingForReplug { board: BoardPort },
    Done { board: BoardPort },
}

#[derive(Clone, Copy, PartialEq)]
enum FlashState {
    Ready,
    Running,
    Success,
    Failed,
}

#[derive(Clone, Copy, PartialEq)]
enum Operation {
    Flash,
    Erase,
}

#[derive(Clone)]
struct SupportFiles {
    bootloader: PathBuf,
    partitions: PathBuf,
    boot_app0: Option<PathBuf>,
}

struct FlashFile {
    address: &'static str,
    path: PathBuf,
}

#[derive(Default)]
struct UiActions {
    select_board: Option<usize>,
    select_firmware: Option<usize>,
    refresh_boards: bool,
    refresh_firmwares: bool,
    pick_custom_firmware: bool,
    select_custom_firmware: bool,
    clear_custom_firmware: bool,
    open_firmware_folder: bool,
    start_flash: bool,
    toggle_erase_confirm: bool,
    cancel_erase: bool,
    confirm_erase: bool,
    start_identify_wizard: bool,
    cancel_identify_wizard: bool,
}

struct FirmwareApp {
    boards: Vec<BoardPort>,
    firmwares: Vec<PathBuf>,
    firmware_dir: Option<PathBuf>,
    support_files: Option<SupportFiles>,
    selected_board: Option<usize>,
    selected_firmware: Option<usize>,
    custom_firmware: Option<PathBuf>,
    use_custom_firmware: bool,
    pick_rx: Option<Receiver<Option<PathBuf>>>,
    last_refresh: Instant,
    state: FlashState,
    operation: Option<Operation>,
    last_operation_full: bool,
    started_at: Option<Instant>,
    message: String,
    hint: String,
    confirm_erase: bool,
    result_rx: Option<Receiver<Result<String, String>>>,
    identify_phase: Option<IdentifyPhase>,
    board_scan_rx: Option<Receiver<Vec<BoardPort>>>,
    demo_mode: bool,
    screenshot_path: Option<PathBuf>,
    rendered_frames: u32,
    screenshot_requested: bool,
    logo: egui::TextureHandle,
}

impl FirmwareApp {
    fn new(
        context: &eframe::CreationContext<'_>,
        screenshot_path: Option<PathBuf>,
        demo_mode: bool,
    ) -> Self {
        configure_fonts(&context.egui_ctx);
        configure_style(&context.egui_ctx);

        let (firmwares, firmware_dir) = find_firmwares();
        let support_files = find_support_files(firmware_dir.as_deref());
        let boards = if demo_mode { demo_boards() } else { Vec::new() };
        let selected_board = if demo_mode && !boards.is_empty() {
            Some(0)
        } else {
            None
        };
        let selected_firmware = (!firmwares.is_empty()).then_some(0);
        let board_scan_rx = if demo_mode {
            None
        } else {
            Some(spawn_board_scan())
        };

        let mut app = Self {
            boards,
            firmwares,
            firmware_dir,
            support_files,
            selected_board,
            selected_firmware,
            custom_firmware: None,
            use_custom_firmware: false,
            pick_rx: None,
            last_refresh: Instant::now(),
            state: FlashState::Ready,
            operation: None,
            last_operation_full: false,
            started_at: None,
            message: String::new(),
            hint: String::new(),
            confirm_erase: false,
            result_rx: None,
            identify_phase: None,
            board_scan_rx,
            demo_mode,
            screenshot_path,
            rendered_frames: 0,
            screenshot_requested: false,
            logo: load_logo(&context.egui_ctx),
        };
        app.message = app.idle_message();
        app
    }

    fn selected_board(&self) -> Option<&BoardPort> {
        self.selected_board.and_then(|index| self.boards.get(index))
    }

    fn set_custom_firmware(&mut self, path: PathBuf) {
        match validate_firmware_file(&path) {
            Ok(()) => {
                self.custom_firmware = Some(path);
                self.use_custom_firmware = true;
                self.identify_phase = None;
                self.reset_result();
            }
            Err(message) => {
                self.state = FlashState::Failed;
                self.operation = None;
                self.message = message;
                self.hint = "เลือกไฟล์ .bin ของแอป (firmware) ที่คอมไพล์แล้ว".to_owned();
            }
        }
    }

    fn poll_pick(&mut self) {
        let Some(receiver) = &self.pick_rx else {
            return;
        };
        match receiver.try_recv() {
            Ok(Some(path)) => {
                self.pick_rx = None;
                self.set_custom_firmware(path);
            }
            Ok(None) | Err(mpsc::TryRecvError::Disconnected) => self.pick_rx = None,
            Err(mpsc::TryRecvError::Empty) => {}
        }
    }

    fn selected_firmware(&self) -> Option<&Path> {
        if self.use_custom_firmware {
            return self.custom_firmware.as_deref();
        }
        self.selected_firmware
            .and_then(|index| self.firmwares.get(index))
            .map(PathBuf::as_path)
    }

    fn idle_message(&self) -> String {
        if self.boards.is_empty() {
            "เสียบบอร์ดด้วยสาย USB เพื่อเริ่มต้น".to_owned()
        } else if self.selected_board().is_none() {
            "เลือกบอร์ดที่ต้องการแฟลช".to_owned()
        } else if self.selected_firmware().is_none() {
            "เลือกเวอร์ชันเฟิร์มแวร์".to_owned()
        } else {
            "พร้อมแฟลช — ตรวจสอบบอร์ดและเวอร์ชัน แล้วกดเริ่มแฟลช".to_owned()
        }
    }

    fn refresh_boards(&mut self) {
        if self.demo_mode || self.board_scan_rx.is_some() {
            return;
        }
        self.board_scan_rx = Some(spawn_board_scan());
        self.last_refresh = Instant::now();
    }

    fn poll_board_scan(&mut self) {
        let scanned_boards = self
            .board_scan_rx
            .as_ref()
            .and_then(|receiver| receiver.try_recv().ok());
        let Some(boards) = scanned_boards else { return };

        self.board_scan_rx = None;
        self.last_refresh = Instant::now();

        // A scan may have started just before a flash/erase operation. Never
        // re-order or clear the board selection while that operation runs.
        if self.state == FlashState::Running {
            return;
        }

        let previous_port = self.selected_board().map(|board| board.port.clone());
        self.boards = boards;
        self.selected_board = previous_port
            .as_ref()
            .and_then(|port| self.boards.iter().position(|board| &board.port == port))
            .or_else(|| auto_select_board(&self.boards));
        let current_port = self.selected_board().map(|board| board.port.clone());

        if previous_port != current_port && self.state != FlashState::Running {
            self.reset_result();
        }
        self.advance_identify_wizard();
    }

    fn refresh_firmwares(&mut self) {
        let previous_name = self.selected_firmware().map(firmware_file_name);
        let (firmwares, firmware_dir) = find_firmwares();
        self.support_files = find_support_files(firmware_dir.as_deref());
        self.firmwares = firmwares;
        self.firmware_dir = firmware_dir;
        self.selected_firmware = previous_name
            .and_then(|name| {
                self.firmwares
                    .iter()
                    .position(|path| firmware_file_name(path) == name)
            })
            .or_else(|| (!self.firmwares.is_empty()).then_some(0));
        if self.state != FlashState::Running {
            self.reset_result();
        }
    }

    fn start_operation(&mut self, operation: Operation) {
        if self.state == FlashState::Running || self.demo_mode || self.identify_waiting() {
            return;
        }

        let Some(port) = self.selected_board().map(|board| board.port.clone()) else {
            self.state = FlashState::Failed;
            self.operation = Some(operation);
            self.message = "ยังไม่ได้เลือกบอร์ด".to_owned();
            self.hint = "เสียบสาย USB แล้วเลือกพอร์ตของบอร์ดก่อนลองใหม่".to_owned();
            return;
        };

        let files = match operation {
            Operation::Flash => {
                let Some(firmware) = self.selected_firmware().map(Path::to_path_buf) else {
                    self.state = FlashState::Failed;
                    self.operation = Some(operation);
                    self.message = "ยังไม่ได้เลือกเวอร์ชันเฟิร์มแวร์".to_owned();
                    self.hint = "เลือกเวอร์ชันที่ต้องการจากรายการก่อนลองใหม่".to_owned();
                    return;
                };
                let mut files = Vec::new();
                if let Some(support) = &self.support_files {
                    files.push(FlashFile {
                        address: BOOTLOADER_OFFSET,
                        path: support.bootloader.clone(),
                    });
                    files.push(FlashFile {
                        address: PARTITION_OFFSET,
                        path: support.partitions.clone(),
                    });
                    if let Some(boot_app0) = &support.boot_app0 {
                        files.push(FlashFile {
                            address: BOOT_APP0_OFFSET,
                            path: boot_app0.clone(),
                        });
                    }
                }
                files.push(FlashFile {
                    address: APP_OFFSET,
                    path: firmware,
                });
                files
            }
            Operation::Erase => Vec::new(),
        };
        let full_flash = files.len() > 1;

        let (sender, receiver) = mpsc::channel();
        self.result_rx = Some(receiver);
        self.state = FlashState::Running;
        self.operation = Some(operation);
        self.last_operation_full = full_flash;
        self.started_at = Some(Instant::now());
        self.confirm_erase = false;
        self.identify_phase = None;
        self.hint.clear();
        self.message = match operation {
            Operation::Flash => format!(
                "กำลัง{} {} ไปยัง {port} — อย่าถอดสาย USB",
                if full_flash {
                    "แฟลชเต็มรูปแบบ"
                } else {
                    "แฟลชเฉพาะแอป"
                },
                files
                    .last()
                    .map(|file| firmware_label(&file.path))
                    .unwrap_or_default()
            ),
            Operation::Erase => format!("กำลังล้างข้อมูลบนบอร์ด {port} — อย่าถอดสาย USB"),
        };

        std::thread::spawn(move || {
            let result = run_esptool(&port, &files, operation);
            let _ = sender.send(result);
        });
    }

    fn poll_operation(&mut self) {
        let result = self
            .result_rx
            .as_ref()
            .and_then(|receiver| receiver.try_recv().ok());
        let Some(result) = result else { return };

        self.result_rx = None;
        self.started_at = None;
        let operation = self.operation.unwrap_or(Operation::Flash);
        match result {
            Ok(summary) => {
                self.state = FlashState::Success;
                self.message = summary;
                self.hint = match operation {
                    Operation::Flash if self.last_operation_full => {
                        "กด RST 1 ครั้ง — หากยังไม่ได้ตั้งค่า จะแจกไวไฟ MAILBOX-xxxxxx · กด 'กระพริบไฟทดสอบ' เพื่อยืนยันบอร์ด"
                            .to_owned()
                    }
                    Operation::Flash => {
                        "กด RST 1 ครั้ง — ถ้าบอร์ดไม่บูต แสดงว่าขาด bootloader/partition ให้แฟลชแบบเต็มรูปแบบ"
                            .to_owned()
                    }
                    Operation::Erase => {
                        "ข้อมูลทั้งหมดถูกลบแล้ว — บอร์ดจะยังไม่บูต/ไม่แจกไวไฟ จนกว่าจะแฟลชเฟิร์มแวร์ใหม่".to_owned()
                    }
                };
            }
            Err(error) => {
                self.state = FlashState::Failed;
                self.message = match operation {
                    Operation::Flash => "แฟลชไม่สำเร็จ".to_owned(),
                    Operation::Erase => "ล้างข้อมูลไม่สำเร็จ".to_owned(),
                };
                self.hint = error;
            }
        }
    }

    fn identify_waiting(&self) -> bool {
        matches!(
            &self.identify_phase,
            Some(IdentifyPhase::WaitingForUnplug { .. } | IdentifyPhase::WaitingForReplug { .. })
        )
    }

    fn identify_missing_count(&self) -> usize {
        match &self.identify_phase {
            Some(IdentifyPhase::WaitingForUnplug { initial }) => initial
                .iter()
                .filter(|old| {
                    !self
                        .boards
                        .iter()
                        .any(|new| new.instance_id == old.instance_id)
                })
                .count(),
            _ => 0,
        }
    }

    fn start_identify_wizard(&mut self) {
        if self.demo_mode || self.boards.is_empty() || self.state == FlashState::Running {
            return;
        }
        self.identify_phase = Some(IdentifyPhase::WaitingForUnplug {
            initial: self.boards.clone(),
        });
        self.confirm_erase = false;
    }

    fn cancel_identify_wizard(&mut self) {
        self.identify_phase = None;
    }

    fn advance_identify_wizard(&mut self) {
        let Some(phase) = self.identify_phase.clone() else {
            return;
        };
        let next = advance_identify_phase(&phase, &self.boards);
        if let Some(IdentifyPhase::Done { board }) = &next {
            if let Some(index) = self
                .boards
                .iter()
                .position(|current| current.instance_id == board.instance_id)
            {
                self.selected_board = Some(index);
                self.confirm_erase = false;
            }
        }
        self.identify_phase = next;
    }

    fn reset_result(&mut self) {
        if self.state == FlashState::Running {
            return;
        }
        self.state = FlashState::Ready;
        self.operation = None;
        self.started_at = None;
        self.confirm_erase = false;
        self.message = self.idle_message();
        self.hint.clear();
    }

    fn apply_actions(&mut self, actions: UiActions) {
        if let Some(index) = actions.select_board {
            if self.selected_board != Some(index) {
                self.selected_board = Some(index);
                self.confirm_erase = false;
                self.identify_phase = None;
                self.reset_result();
            }
        }
        if let Some(index) = actions.select_firmware {
            if self.selected_firmware != Some(index) || self.use_custom_firmware {
                self.use_custom_firmware = false;
                self.selected_firmware = Some(index);
                self.identify_phase = None;
                self.reset_result();
            }
        }
        if actions.pick_custom_firmware && self.pick_rx.is_none() {
            self.pick_rx = Some(spawn_file_picker());
        }
        if actions.select_custom_firmware
            && self.custom_firmware.is_some()
            && !self.use_custom_firmware
        {
            self.use_custom_firmware = true;
            self.identify_phase = None;
            self.reset_result();
        }
        if actions.clear_custom_firmware {
            self.custom_firmware = None;
            self.use_custom_firmware = false;
            self.reset_result();
        }
        if actions.refresh_boards {
            self.refresh_boards();
        }
        if actions.refresh_firmwares {
            self.refresh_firmwares();
        }
        if actions.open_firmware_folder {
            if let Some(directory) = self.firmware_dir.clone() {
                open_folder(&directory);
            }
        }
        if actions.toggle_erase_confirm {
            self.confirm_erase = !self.confirm_erase;
        }
        if actions.cancel_erase {
            self.confirm_erase = false;
        }
        if actions.start_flash {
            self.start_operation(Operation::Flash);
        }
        if actions.confirm_erase {
            self.start_operation(Operation::Erase);
        }
        if actions.start_identify_wizard {
            self.start_identify_wizard();
        }
        if actions.cancel_identify_wizard {
            self.cancel_identify_wizard();
        }
    }

    fn draw_header(&self, ui: &mut egui::Ui) {
        Frame::new()
            .fill(HEADER)
            .inner_margin(Margin::symmetric(0, if compact() { 8 } else { 12 }))
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                centered(ui, CONTENT_WIDTH, |ui| {
                    ui.horizontal(|ui| {
                        let logo_size = if compact() { 32.0 } else { 40.0 };
                        ui.add(
                            egui::Image::new(&self.logo)
                                .fit_to_exact_size(Vec2::splat(logo_size))
                                .corner_radius(9),
                        );
                        ui.add_space(12.0);
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new(if compact() { "SMMB Flasher" } else { APP_TITLE })
                                    .size(if compact() { 16.0 } else { 19.0 })
                                    .strong()
                                    .color(HEADER_TEXT),
                            );
                            if !compact() {
                                ui.label(
                                    RichText::new(format!(
                                        "{TARGET_BOARD} · กล้อง {SUPPORTED_CAMERA}"
                                    ))
                                    .size(12.5)
                                    .color(HEADER_MUTED),
                                );
                            }
                        });
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            let (status_label, status_color) = if self.identify_waiting() {
                                ("กำลังระบุบอร์ด", Color32::from_rgb(232, 180, 90))
                            } else {
                                match self.state {
                                    FlashState::Running => ("กำลังทำงาน", WARN),
                                    FlashState::Success => {
                                        ("สำเร็จ", Color32::from_rgb(116, 226, 176))
                                    }
                                    FlashState::Failed => {
                                        ("มีปัญหา", Color32::from_rgb(245, 153, 148))
                                    }
                                    FlashState::Ready if self.boards.is_empty() => {
                                        ("รอเชื่อมต่อบอร์ด", HEADER_MUTED)
                                    }
                                    FlashState::Ready => {
                                        ("พร้อมใช้งาน", Color32::from_rgb(116, 226, 176))
                                    }
                                }
                            };
                            Frame::new()
                                .fill(HEADER_PILL)
                                .corner_radius(100)
                                .inner_margin(Margin::symmetric(12, 6))
                                .show(ui, |ui| {
                                    ui.horizontal(|ui| {
                                        ui.label(
                                            RichText::new(status_label)
                                                .size(12.0)
                                                .color(status_color),
                                        );
                                        dot(ui, status_color);
                                    });
                                });
                            if self.demo_mode && !compact() {
                                Frame::new()
                                    .fill(HEADER_PILL)
                                    .corner_radius(100)
                                    .inner_margin(Margin::symmetric(12, 6))
                                    .show(ui, |ui| {
                                        ui.label(
                                            RichText::new("โหมดตัวอย่าง")
                                                .size(12.0)
                                                .color(HEADER_MUTED),
                                        );
                                    });
                            }
                        });
                    });
                });
            });
    }

    fn draw_body(&self, ui: &mut egui::Ui, actions: &mut UiActions) {
        ui.add_space(if compact() { 10.0 } else { 16.0 });
        centered(ui, CONTENT_WIDTH, |ui| {
            let page_width = ui.available_width();
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("แฟลชเฟิร์มแวร์")
                            .size(if compact() { 22.0 } else { 28.0 })
                            .strong()
                            .color(TEXT),
                    );
                    ui.label(
                        RichText::new("เลือกบอร์ด · เลือกเวอร์ชัน · เริ่มแฟลช")
                            .size(13.5)
                            .color(TEXT_SECONDARY),
                    );
                });
                if !compact() {
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.label(
                            RichText::new("ใช้เวลาประมาณ 1–2 นาที")
                                .size(12.5)
                                .color(TEXT_SECONDARY),
                        );
                    });
                }
            });

            ui.add_space(if compact() { 10.0 } else { 16.0 });
            let two_columns = page_width >= TWO_COLUMN_FROM;
            ui.ctx().data_mut(|d| {
                let next = d
                    .get_temp::<f32>(egui::Id::new(CARD_H_NEXT_ID))
                    .unwrap_or(0.0);
                d.insert_temp(egui::Id::new(CARD_H_ID), if two_columns { next } else { 0.0 });
                d.insert_temp(egui::Id::new(CARD_H_NEXT_ID), 0.0f32);
            });
            if !two_columns {
                // Narrow window: stack the cards instead of squeezing two columns.
                self.draw_board_card(ui, actions);
                ui.add_space(12.0);
                self.draw_firmware_card(ui, actions);
            } else {
                ui.columns(2, |columns| {
                    self.draw_board_card(&mut columns[0], actions);
                    self.draw_firmware_card(&mut columns[1], actions);
                });
            }
            ui.add_space(12.0);
            self.draw_result_strip(ui);
            ui.add_space(16.0);
        });
    }

    fn draw_result_strip(&self, ui: &mut egui::Ui) {
        if self.identify_waiting() {
            Frame::new()
                .fill(WARN_SOFT)
                .corner_radius(10)
                .stroke(Stroke::new(1.0, WARN))
                .inner_margin(Margin::symmetric(14, 11))
                .show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.horizontal(|ui| {
                        let (rect, _) = ui.allocate_exact_size(Vec2::splat(22.0), Sense::hover());
                        ui.painter().circle_filled(rect.center(), 11.0, WARN);
                        ui.painter().text(
                            rect.center(),
                            Align2::CENTER_CENTER,
                            "i",
                            FontId::new(12.0, FontFamily::Proportional),
                            Color32::WHITE,
                        );
                        ui.add_space(8.0);
                        ui.label(
                            RichText::new("กำลังระบุบอร์ด — ทำตามขั้นตอนในการ์ด 'เลือกบอร์ด'")
                                .size(13.0)
                                .strong()
                                .color(WARN),
                        );
                    });
                });
            return;
        }

        match self.state {
            FlashState::Running => running_banner(
                ui,
                &self.message,
                self.started_at
                    .map(|started| started.elapsed().as_secs())
                    .unwrap_or(0),
            ),
            FlashState::Success => result_banner(ui, true, &self.message, &self.hint),
            FlashState::Failed => result_banner(ui, false, &self.message, &self.hint),
            FlashState::Ready => {
                let ready = self.selected_board().is_some() && self.selected_firmware().is_some();
                ready_banner(ui, &self.message, ready);
            }
        }
    }

    fn draw_board_card(&self, ui: &mut egui::Ui, actions: &mut UiActions) {
        card().show(ui, |ui| {
            ui.set_min_height(card_min_height(ui));
            let hint = if self.boards.is_empty() {
                "รอเชื่อมต่อ".to_owned()
            } else {
                format!("พบ {} บอร์ด", self.boards.len())
            };
            section_title(ui, "เลือกบอร์ด", &hint);
            ui.label(
                RichText::new("เสียบสาย USB แล้วเลือกพอร์ตที่ตรงกับบอร์ด")
                    .size(12.5)
                    .color(TEXT_SECONDARY),
            );
            ui.add_space(10.0);

            ui.allocate_ui_with_layout(
                Vec2::new(ui.available_width(), list_height(ui)),
                Layout::top_down(Align::Min),
                |ui| {
                    if self.boards.is_empty() {
                        let clicked = empty_state(
                            ui,
                            "USB",
                            "ยังไม่พบบอร์ด",
                            "เสียบสาย USB แล้วรอสักครู่ ระบบค้นหาบอร์ดที่เชื่อมต่ออยู่อัตโนมัติทุก 2 วินาที",
                            "ค้นหาอีกครั้ง",
                        );
                        if clicked {
                            actions.refresh_boards = true;
                        }
                    } else {
                        egui::ScrollArea::vertical()
                            .max_height(list_height(ui))
                            .auto_shrink([false, true])
                            .show(ui, |ui| {
                                ui.spacing_mut().item_spacing.y = 6.0;
                                for (index, board) in self.boards.iter().enumerate() {
                                    let selected = self.selected_board == Some(index);
                                    let response = board_row(ui, board, selected);
                                    if response.clicked()
                                        && self.state != FlashState::Running
                                        && !self.identify_waiting()
                                    {
                                        actions.select_board = Some(index);
                                    }
                                }
                            });
                    }
                },
            );

            ui.add_space(8.0);
            if let Some(phase) = &self.identify_phase {
                identify_wizard_panel(ui, phase, self.identify_missing_count(), actions);
            } else {
                ui.horizontal(|ui| {
                    if !self.boards.is_empty()
                        && ui
                            .add_enabled(
                                self.state != FlashState::Running,
                                secondary_button("ค้นหาอีกครั้ง", Vec2::new(136.0, 34.0)),
                            )
                            .clicked()
                    {
                        actions.refresh_boards = true;
                    }
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.label(
                            RichText::new("แสดงเฉพาะบอร์ด USB ที่เชื่อมต่ออยู่")
                                .size(12.0)
                                .color(TEXT_MUTED),
                        );
                    });
                });
                if !self.boards.is_empty() {
                    ui.add_space(6.0);
                    let width = ui.available_width();
                    let can_identify = !self.demo_mode
                        && self.state != FlashState::Running
                        && !self.identify_waiting();
                    if ui
                        .add_enabled(
                            can_identify,
                            secondary_button("ระบุบอร์ดด้วยการถอด/เสียบ USB", Vec2::new(width, 36.0)),
                        )
                        .on_hover_text(
                            "ใช้ยืนยันว่า COM port ที่เห็นคือบอร์ดตัวที่คุณถืออยู่ โดยไม่แฟลชหรือแก้โค้ดบอร์ด",
                        )
                        .clicked()
                    {
                        actions.start_identify_wizard = true;
                    }
                }
            }
            report_card_height(ui, ui.min_rect().height());
        });
    }

    fn draw_firmware_card(&self, ui: &mut egui::Ui, actions: &mut UiActions) {
        card().show(ui, |ui| {
            ui.set_min_height(card_min_height(ui));
            let latest = self.firmwares.first().map(|path| firmware_label(path));
            let hint = match &latest {
                Some(version) => format!("แนะนำ {version}"),
                None => "ไม่พบไฟล์".to_owned(),
            };
            section_title(ui, "เลือกเวอร์ชัน", &hint);
            ui.label(
                RichText::new("ไฟล์จากโฟลเดอร์ firmware ข้างโปรแกรม")
                    .size(12.5)
                    .color(TEXT_SECONDARY),
            );
            ui.add_space(10.0);

            ui.allocate_ui_with_layout(
                Vec2::new(ui.available_width(), list_height(ui)),
                Layout::top_down(Align::Min),
                |ui| {
                    if self.firmwares.is_empty() {
                        let clicked = empty_state(
                            ui,
                            "BIN",
                            "ไม่พบไฟล์เฟิร์มแวร์",
                            "วางไฟล์ firmware-<เวอร์ชัน>.bin ไว้ในโฟลเดอร์ firmware",
                            "ค้นหาใหม่",
                        );
                        if clicked {
                            actions.refresh_firmwares = true;
                        }
                    } else {
                        egui::ScrollArea::vertical()
                            .max_height(list_height(ui))
                            .auto_shrink([false, true])
                            .show(ui, |ui| {
                                ui.spacing_mut().item_spacing.y = 6.0;
                                let grid_columns = if ui.available_width() >= 360.0 { 2 } else { 1 };
                                ui.columns(grid_columns, |columns| {
                                    for (column_index, column) in columns.iter_mut().enumerate() {
                                        let mut index = column_index;
                                        while index < self.firmwares.len() {
                                            let selected = !self.use_custom_firmware
                                                && self.selected_firmware == Some(index);
                                            let response = firmware_grid_row(
                                                column,
                                                &self.firmwares[index],
                                                index == 0,
                                                selected,
                                            );
                                            if response.clicked()
                                                && self.state != FlashState::Running
                                                && !self.identify_waiting()
                                            {
                                                actions.select_firmware = Some(index);
                                            }
                                            index += grid_columns;
                                        }
                                    }
                                });
                            });
                    }
                },
            );

            ui.add_space(8.0);
            let idle = self.state != FlashState::Running && !self.identify_waiting();
            if let Some(path) = &self.custom_firmware {
                ui.horizontal(|ui| {
                    let row_width = (ui.available_width() - 76.0).max(120.0);
                    ui.allocate_ui(Vec2::new(row_width, 0.0), |ui| {
                        let response =
                            custom_firmware_row(ui, path, self.use_custom_firmware);
                        if response.clicked() && idle {
                            actions.select_custom_firmware = true;
                        }
                    });
                    if ui
                        .add_enabled(idle, text_button("ล้าง", ERROR))
                        .on_hover_text("เอาไฟล์จากเครื่องออกจากรายการ")
                        .clicked()
                    {
                        actions.clear_custom_firmware = true;
                    }
                });
                ui.add_space(6.0);
            }
            {
                let picking = self.pick_rx.is_some();
                let label = if picking {
                    "กำลังเปิดหน้าต่างเลือกไฟล์…"
                } else {
                    "เลือกไฟล์ .bin จากเครื่อง…"
                };
                let width = ui.available_width();
                if ui
                    .add_enabled(
                        idle && !picking && !self.demo_mode,
                        secondary_button(label, Vec2::new(width, 36.0)),
                    )
                    .on_hover_text("เลือกไฟล์เฟิร์มแวร์ (.bin) จากที่ใดก็ได้ในเครื่อง")
                    .clicked()
                {
                    actions.pick_custom_firmware = true;
                }
            }
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                if !self.firmwares.is_empty()
                    && ui
                        .add_enabled(
                            self.state != FlashState::Running,
                            secondary_button("ค้นหาใหม่", Vec2::new(110.0, 34.0)),
                        )
                        .clicked()
                {
                    actions.refresh_firmwares = true;
                }
                if ui
                    .add_enabled(
                        self.firmware_dir.is_some(),
                        text_button("เปิดโฟลเดอร์", Color32::from_rgb(142, 44, 51)),
                    )
                    .clicked()
                {
                    actions.open_firmware_folder = true;
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if !self.firmwares.is_empty() {
                        ui.label(
                            RichText::new(format!("{} เวอร์ชัน", self.firmwares.len()))
                                .size(12.0)
                                .color(TEXT_MUTED),
                        );
                    }
                });
            });
            report_card_height(ui, ui.min_rect().height());
        });
    }

    fn draw_action_bar_panel(&self, root: &mut egui::Ui, actions: &mut UiActions) {
        let frame = Frame::new()
            .fill(SURFACE)
            .inner_margin(Margin::symmetric(
                if compact() { 10 } else { 24 },
                if compact() { 8 } else { 12 },
            ))
            .stroke(Stroke::new(1.0, BORDER));
        egui::Panel::bottom("action_bar")
            .frame(frame)
            .show(root, |ui| {
                centered(ui, CONTENT_WIDTH, |ui| {
                    ui.set_width(ui.available_width());
                    if self.confirm_erase {
                        self.draw_erase_confirmation_bar(ui, actions);
                    } else {
                        self.draw_normal_action_bar(ui, actions);
                    }
                });
            });
    }

    fn draw_normal_action_bar(&self, ui: &mut egui::Ui, actions: &mut UiActions) {
        let board_text = self
            .selected_board()
            .map(|board| board.port.clone())
            .unwrap_or_else(|| "ยังไม่เลือกบอร์ด".to_owned());
        let firmware_text = self
            .selected_firmware()
            .map(firmware_label)
            .unwrap_or_else(|| "ยังไม่เลือกเวอร์ชัน".to_owned());
        let mode_text = if self.support_files.is_some() {
            "แฟลชเต็มรูปแบบ"
        } else {
            "แฟลชเฉพาะแอป"
        };
        let mode_color = if self.support_files.is_some() {
            SUCCESS
        } else {
            WARN
        };
        let wide = ui.available_width() >= 720.0;

        let summary = |ui: &mut egui::Ui| {
            if self.identify_waiting() {
                ui.label(
                    RichText::new("กำลังระบุบอร์ด — ทำตามขั้นตอนในการ์ด 'เลือกบอร์ด'")
                        .size(12.5)
                        .strong()
                        .color(WARN),
                );
                return;
            }
            let board_ready = self.selected_board().is_some();
            let firmware_ready = self.selected_firmware().is_some();
            chip(
                ui,
                &board_text,
                if board_ready { BRAND } else { TEXT_MUTED },
                if board_ready {
                    BRAND_SOFT
                } else {
                    SURFACE_MUTED
                },
            );
            chip(
                ui,
                &firmware_text,
                if firmware_ready { BRAND } else { TEXT_MUTED },
                if firmware_ready {
                    BRAND_SOFT
                } else {
                    SURFACE_MUTED
                },
            );
            ui.label(RichText::new(mode_text).size(12.0).color(mode_color));
        };

        if wide {
            ui.horizontal(|ui| {
                summary(ui);
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    self.draw_action_buttons(ui, actions, 190.0, 176.0);
                });
            });
        } else {
            ui.horizontal_wrapped(|ui| summary(ui));
            ui.add_space(8.0);
            let width = ((ui.available_width() - 8.0) / 2.0).max(140.0);
            ui.horizontal(|ui| {
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    self.draw_action_buttons(ui, actions, width, width);
                });
            });
        }
    }

    fn draw_action_buttons(
        &self,
        ui: &mut egui::Ui,
        actions: &mut UiActions,
        flash_width: f32,
        erase_width: f32,
    ) {
        let can_flash = self.selected_board().is_some()
            && self.selected_firmware().is_some()
            && self.state != FlashState::Running
            && !self.demo_mode
            && !self.identify_waiting();
        let can_erase = self.selected_board().is_some()
            && self.state != FlashState::Running
            && !self.demo_mode
            && !self.identify_waiting();
        let label = if self.state == FlashState::Success && self.operation == Some(Operation::Flash)
        {
            "แฟลชอีกครั้ง"
        } else if self.state == FlashState::Running {
            "กำลังทำงาน…"
        } else {
            "เริ่มแฟลช"
        };
        // Right-to-left: the primary action lands on the far right.
        if ui
            .add_enabled(can_flash, primary_button(label, flash_width, can_flash))
            .clicked()
        {
            actions.start_flash = true;
        }
        if ui
            .add_enabled(
                can_erase,
                danger_outline_button("ล้างข้อมูลบอร์ด", erase_width, can_erase),
            )
            .clicked()
        {
            actions.toggle_erase_confirm = true;
        }
    }

    fn draw_erase_confirmation_bar(&self, ui: &mut egui::Ui, actions: &mut UiActions) {
        let board = self
            .selected_board()
            .map(|board| board.port.clone())
            .unwrap_or_else(|| "บอร์ดที่เลือก".to_owned());
        let wide = ui.available_width() >= 720.0;
        Frame::new()
            .fill(ERROR_SOFT)
            .corner_radius(10)
            .stroke(Stroke::new(1.0, ERROR))
            .inner_margin(Margin::symmetric(14, 10))
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                if wide {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new(format!("ล้างข้อมูลบอร์ด {board}?"))
                                    .size(14.0)
                                    .strong()
                                    .color(ERROR),
                            );
                            ui.label(
                                RichText::new(
                                    "เฟิร์มแวร์และข้อมูลทั้งหมดจะหาย บอร์ดจะไม่บูต/ไม่แจกไวไฟจนกว่าจะแฟลชใหม่",
                                )
                                .size(12.0)
                                .color(TEXT_SECONDARY),
                            );
                        });
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if ui.add(danger_button("ยืนยันล้างข้อมูล", 164.0)).clicked()
                            {
                                actions.confirm_erase = true;
                            }
                            if ui
                                .add(secondary_button("ยกเลิก", Vec2::new(84.0, 38.0)))
                                .clicked()
                            {
                                actions.cancel_erase = true;
                            }
                        });
                    });
                } else {
                    ui.label(
                        RichText::new(format!("ล้างข้อมูลบอร์ด {board}?"))
                            .size(14.0)
                            .strong()
                            .color(ERROR),
                    );
                    ui.label(
                        RichText::new(
                            "เฟิร์มแวร์และข้อมูลทั้งหมดจะหาย บอร์ดจะไม่บูต/ไม่แจกไวไฟจนกว่าจะแฟลชใหม่",
                        )
                        .size(12.0)
                        .color(TEXT_SECONDARY),
                    );
                    ui.add_space(6.0);
                    ui.horizontal(|ui| {
                        if ui.add(danger_button("ยืนยันล้างข้อมูล", 164.0)).clicked()
                        {
                            actions.confirm_erase = true;
                        }
                        if ui
                            .add(secondary_button("ยกเลิก", Vec2::new(84.0, 38.0)))
                            .clicked()
                        {
                            actions.cancel_erase = true;
                        }
                    });
                }
            });
    }

    fn draw(&mut self, root: &mut egui::Ui) {
        self.poll_board_scan();
        self.poll_operation();
        self.poll_pick();

        let scan_interval = if self.identify_waiting() {
            Duration::from_secs(1)
        } else {
            REFRESH_INTERVAL
        };
        if !self.demo_mode
            && self.state != FlashState::Running
            && self.last_refresh.elapsed() >= scan_interval
        {
            self.refresh_boards();
        }

        // Scale the whole UI up on large screens. Decide from the physical
        // width (points x zoom) so the choice cannot flip-flop after zooming.
        let ctx = root.ctx().clone();
        let zoom = ctx.zoom_factor();
        let physical = root.available_width() * zoom;
        let wanted = if physical >= 2200.0 {
            1.5
        } else if physical >= 1700.0 {
            1.25
        } else {
            1.0
        };
        if (wanted - zoom).abs() > 0.01 {
            ctx.set_zoom_factor(wanted);
        }
        COMPACT.store(root.available_width() < COMPACT_BELOW, Ordering::Relaxed);
        let mut actions = UiActions::default();
        // Reserve the bottom action bar first, then draw the header and the
        // scrollable dashboard in the remaining space.
        self.draw_action_bar_panel(root, &mut actions);
        self.draw_header(root);
        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show(root, |ui| {
                self.draw_body(ui, &mut actions);
            });
        self.apply_actions(actions);
    }
}

impl eframe::App for FirmwareApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        ui.painter().rect_filled(ui.max_rect(), 0.0, BG);
        ui.style_mut().visuals.panel_fill = BG;
        self.draw(ui);
        self.rendered_frames += 1;

        if self.screenshot_path.is_some()
            && self.rendered_frames >= 120
            && !self.screenshot_requested
        {
            self.screenshot_requested = true;
            ctx.send_viewport_cmd(egui::ViewportCommand::Screenshot(Default::default()));
        }
        if self.screenshot_requested {
            let screenshot = ctx.input(|input| {
                input.events.iter().find_map(|event| {
                    if let egui::Event::Screenshot { image, .. } = event {
                        Some(image.clone())
                    } else {
                        None
                    }
                })
            });
            if let (Some(image), Some(path)) = (screenshot, self.screenshot_path.as_ref()) {
                if let Some(parent) = path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let mut pixels = Vec::with_capacity(image.pixels.len() * 4);
                for color in &image.pixels {
                    pixels.extend_from_slice(&color.to_array());
                }
                let _ = image::save_buffer(
                    path,
                    &pixels,
                    image.width() as u32,
                    image.height() as u32,
                    image::ColorType::Rgba8,
                );
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            }
        }

        if self.screenshot_path.is_some()
            || self.state == FlashState::Running
            || self.board_scan_rx.is_some()
        {
            ctx.request_repaint();
        } else {
            ctx.request_repaint_after(Duration::from_millis(500));
        }
    }
}

// ---- Small UI helpers ----------------------------------------------------

const LOGO_PNG: &[u8] = include_bytes!("../assets/logo-192.png");
const ICON_PNG: &[u8] = include_bytes!("../assets/logo-256.png");

fn load_logo(ctx: &egui::Context) -> egui::TextureHandle {
    let image = image::load_from_memory(LOGO_PNG)
        .map(|decoded| decoded.to_rgba8())
        .unwrap_or_else(|_| image::RgbaImage::new(1, 1));
    let size = [image.width() as usize, image.height() as usize];
    ctx.load_texture(
        "smmb-logo",
        egui::ColorImage::from_rgba_unmultiplied(size, image.as_raw()),
        egui::TextureOptions::LINEAR,
    )
}

fn window_icon() -> Option<egui::IconData> {
    let image = image::load_from_memory(ICON_PNG).ok()?.to_rgba8();
    Some(egui::IconData {
        width: image.width(),
        height: image.height(),
        rgba: image.into_raw(),
    })
}

fn configure_fonts(ctx: &egui::Context) {
    let font_paths = [
        r"C:\Windows\Fonts\LeelawUI.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
    ];
    let Some((_, bytes)) = font_paths
        .iter()
        .find_map(|path| fs::read(path).ok().map(|bytes| (*path, bytes)))
    else {
        return;
    };
    let mut fonts = FontDefinitions::default();
    fonts
        .font_data
        .insert("thai".to_owned(), FontData::from_owned(bytes).into());
    fonts
        .families
        .entry(FontFamily::Proportional)
        .or_default()
        .insert(0, "thai".to_owned());
    ctx.set_fonts(fonts);
}

fn configure_style(ctx: &egui::Context) {
    // The whole UI is painted light; force the light style even when Windows
    // is in dark mode (otherwise strong text inherits the dark theme's white).
    ctx.set_theme(egui::Theme::Light);
    let mut style = (*ctx.style_of(egui::Theme::Light)).clone();
    style.spacing.item_spacing = Vec2::new(8.0, 6.0);
    style.spacing.button_padding = Vec2::new(14.0, 7.0);
    style.visuals.panel_fill = BG;
    style.visuals.override_text_color = Some(TEXT);
    style.visuals.selection.bg_fill = BRAND_SOFT;
    style.visuals.selection.stroke = Stroke::new(1.0, BRAND);
    style.visuals.disabled_alpha = 0.7;
    style.visuals.window_fill = SURFACE;
    style.visuals.extreme_bg_color = SURFACE_MUTED;
    style.visuals.faint_bg_color = SURFACE_MUTED;
    // `RichText::strong()` uses the active-widget foreground color. Without
    // this it inherits the default light theme's white and becomes invisible.
    style.visuals.widgets.noninteractive.fg_stroke.color = TEXT;
    style.visuals.widgets.inactive.fg_stroke.color = TEXT;
    style.visuals.widgets.hovered.fg_stroke.color = TEXT;
    style.visuals.widgets.active.fg_stroke.color = TEXT;
    style.visuals.widgets.open.fg_stroke.color = TEXT;
    style.visuals.widgets.inactive.bg_fill = SURFACE;
    style.visuals.widgets.hovered.bg_fill = SURFACE_MUTED;
    style.visuals.widgets.active.bg_fill = BRAND_SOFT;
    style.visuals.widgets.inactive.weak_bg_fill = SURFACE_MUTED;
    style.visuals.widgets.hovered.weak_bg_fill = Color32::from_rgb(245, 241, 236);
    style.visuals.widgets.active.weak_bg_fill = BRAND_SOFT;
    style.visuals.widgets.inactive.bg_stroke = Stroke::new(1.0, BORDER);
    style.visuals.widgets.hovered.bg_stroke = Stroke::new(1.0, BORDER_STRONG);
    style.visuals.widgets.active.bg_stroke = Stroke::new(1.0, BRAND);
    style.text_styles.insert(
        egui::TextStyle::Body,
        FontId::new(14.0, FontFamily::Proportional),
    );
    style.text_styles.insert(
        egui::TextStyle::Button,
        FontId::new(14.0, FontFamily::Proportional),
    );
    style.text_styles.insert(
        egui::TextStyle::Small,
        FontId::new(12.0, FontFamily::Proportional),
    );
    style.text_styles.insert(
        egui::TextStyle::Heading,
        FontId::new(22.0, FontFamily::Proportional),
    );
    style.text_styles.insert(
        egui::TextStyle::Monospace,
        FontId::new(14.0, FontFamily::Monospace),
    );
    ctx.set_style_of(egui::Theme::Light, style);
}

fn centered(ui: &mut egui::Ui, max_width: f32, add_contents: impl FnOnce(&mut egui::Ui)) {
    // Outer column is centered; contents get an inner horizontal padding so
    // card strokes/rounded corners never sit on the clip boundary.
    let available = ui.available_width();
    let width = max_width.min(available).max(0.0);
    let space = ((available - width) * 0.5).max(0.0);
    let padding = 6.0;
    let inner_width = (width - padding * 2.0).max(0.0);
    ui.horizontal(|ui| {
        ui.add_space(space);
        ui.vertical(|ui| {
            ui.set_width(width);
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 0.0;
                ui.add_space(padding);
                ui.vertical(|ui| {
                    ui.set_width(inner_width);
                    add_contents(ui);
                });
                ui.add_space(padding);
            });
        });
    });
}

fn card() -> Frame {
    Frame::new()
        .fill(SURFACE)
        .corner_radius(16)
        .stroke(Stroke::new(1.0, BORDER))
        .inner_margin(Margin::same(if compact() { 14 } else { 20 }))
}

fn dot(ui: &mut egui::Ui, color: Color32) {
    let (rect, _) = ui.allocate_exact_size(Vec2::splat(8.0), Sense::hover());
    ui.painter().circle_filled(rect.center(), 4.0, color);
}

fn section_title(ui: &mut egui::Ui, title: &str, hint: &str) {
    ui.horizontal(|ui| {
        ui.label(RichText::new(title).size(17.5).strong().color(TEXT));
        if !hint.is_empty() {
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.label(RichText::new(hint).size(12.0).color(TEXT_SECONDARY));
            });
        }
    });
}

fn chip(ui: &mut egui::Ui, text: &str, foreground: Color32, background: Color32) {
    Frame::new()
        .fill(background)
        .corner_radius(100)
        .inner_margin(Margin::symmetric(8, 3))
        .show(ui, |ui| {
            ui.label(RichText::new(text).size(12.0).strong().color(foreground));
        });
}

fn secondary_button(label: &str, min_size: Vec2) -> egui::Button<'static> {
    egui::Button::new(RichText::new(label).size(13.0).color(TEXT))
        .fill(SURFACE_MUTED)
        .stroke(Stroke::new(1.0, BORDER_STRONG))
        .corner_radius(8)
        .min_size(min_size)
}

fn primary_button(label: &str, width: f32, enabled: bool) -> egui::Button<'static> {
    let (fill, text_color) = if enabled {
        (BRAND, Color32::WHITE)
    } else {
        (SURFACE_MUTED, TEXT_MUTED)
    };
    egui::Button::new(RichText::new(label).size(15.0).strong().color(text_color))
        .fill(fill)
        .stroke(if enabled {
            Stroke::NONE
        } else {
            Stroke::new(1.0, BORDER)
        })
        .corner_radius(10)
        .min_size(Vec2::new(width, 44.0))
}

fn danger_outline_button(label: &str, width: f32, enabled: bool) -> egui::Button<'static> {
    let color = if enabled { ERROR } else { TEXT_MUTED };
    egui::Button::new(RichText::new(label).size(13.0).strong().color(color))
        .fill(SURFACE)
        .stroke(Stroke::new(1.0, if enabled { ERROR } else { BORDER }))
        .corner_radius(10)
        .min_size(Vec2::new(width, 44.0))
}

fn danger_button(label: &str, width: f32) -> egui::Button<'static> {
    egui::Button::new(
        RichText::new(label)
            .size(13.0)
            .strong()
            .color(Color32::WHITE),
    )
    .fill(ERROR)
    .stroke(Stroke::NONE)
    .corner_radius(8)
    .min_size(Vec2::new(width, 38.0))
}

fn text_button(label: &str, color: Color32) -> egui::Button<'static> {
    egui::Button::new(RichText::new(label).size(12.5).color(color))
        .fill(Color32::TRANSPARENT)
        .stroke(Stroke::NONE)
        .corner_radius(6)
        .min_size(Vec2::new(0.0, 34.0))
}

fn advance_identify_phase(phase: &IdentifyPhase, boards: &[BoardPort]) -> Option<IdentifyPhase> {
    match phase {
        IdentifyPhase::WaitingForUnplug { initial } => {
            let mut missing: Vec<BoardPort> = initial
                .iter()
                .filter(|old| {
                    !boards
                        .iter()
                        .any(|current| current.instance_id == old.instance_id)
                })
                .cloned()
                .collect();
            if missing.len() == 1 {
                Some(IdentifyPhase::WaitingForReplug {
                    board: missing.remove(0),
                })
            } else {
                Some(phase.clone())
            }
        }
        IdentifyPhase::WaitingForReplug { board } => {
            if let Some(current) = boards
                .iter()
                .find(|current| current.instance_id == board.instance_id)
            {
                Some(IdentifyPhase::Done {
                    board: current.clone(),
                })
            } else {
                Some(phase.clone())
            }
        }
        IdentifyPhase::Done { board } => {
            if boards
                .iter()
                .any(|current| current.instance_id == board.instance_id)
            {
                Some(phase.clone())
            } else {
                None
            }
        }
    }
}

fn identify_wizard_panel(
    ui: &mut egui::Ui,
    phase: &IdentifyPhase,
    missing_count: usize,
    actions: &mut UiActions,
) {
    let done = matches!(phase, IdentifyPhase::Done { .. });
    let (title, body, background, foreground) = match phase {
        IdentifyPhase::WaitingForUnplug { .. } => (
            "ระบุบอร์ด: ขั้นที่ 1",
            "ถอดสาย USB ของบอร์ดที่ต้องการออก แล้วรอ 2–3 วินาที".to_owned(),
            WARN_SOFT,
            WARN,
        ),
        IdentifyPhase::WaitingForReplug { board } => (
            "ระบุบอร์ด: ขั้นที่ 2",
            format!("เสียบ {} กลับช่องเดิม แล้วรอ 2–3 วินาที", board.port),
            WARN_SOFT,
            WARN,
        ),
        IdentifyPhase::Done { board } => (
            "ยืนยันบอร์ดแล้ว",
            format!("{} · {}\nเลือกบอร์ดนี้ให้แล้ว", board.port, board.description),
            SUCCESS_SOFT,
            SUCCESS,
        ),
    };

    Frame::new()
        .fill(background)
        .corner_radius(10)
        .stroke(Stroke::new(1.0, foreground))
        .inner_margin(Margin::symmetric(12, 10))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.label(RichText::new(title).size(13.5).strong().color(foreground));
            ui.add(egui::Label::new(RichText::new(body).size(12.0).color(TEXT_SECONDARY)).wrap());
            if missing_count > 1 {
                ui.label(
                    RichText::new(format!(
                        "พบว่าถอดออก {missing_count} บอร์ด — เสียบกลับให้เหลือตัวเดียว"
                    ))
                    .size(12.0)
                    .color(WARN),
                );
            }
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                let label = if done {
                    "ใช้บอร์ดนี้"
                } else {
                    "ยกเลิก"
                };
                let width = if done { 118.0 } else { 88.0 };
                if ui
                    .add(secondary_button(label, Vec2::new(width, 32.0)))
                    .clicked()
                {
                    actions.cancel_identify_wizard = true;
                }
            });
        });
}

fn empty_state(ui: &mut egui::Ui, badge: &str, title: &str, body: &str, button: &str) -> bool {
    let mut clicked = false;
    Frame::new()
        .fill(SURFACE_MUTED)
        .corner_radius(12)
        .inner_margin(Margin::same(14))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical_centered(|ui| {
                let (rect, _) = ui.allocate_exact_size(Vec2::splat(36.0), Sense::hover());
                ui.painter()
                    .circle_filled(rect.center(), 18.0, Color32::from_rgb(238, 233, 227));
                ui.painter().text(
                    rect.center(),
                    Align2::CENTER_CENTER,
                    badge,
                    FontId::new(11.0, FontFamily::Monospace),
                    TEXT_SECONDARY,
                );
                ui.add_space(6.0);
                ui.label(RichText::new(title).size(15.0).strong().color(TEXT));
                ui.add_space(2.0);
                ui.add(
                    egui::Label::new(RichText::new(body).size(12.0).color(TEXT_SECONDARY)).wrap(),
                );
                ui.add_space(8.0);
                if ui
                    .add(secondary_button(button, Vec2::new(136.0, 32.0)))
                    .clicked()
                {
                    clicked = true;
                }
            });
        });
    clicked
}

fn board_row(ui: &mut egui::Ui, board: &BoardPort, selected: bool) -> egui::Response {
    let fill = if selected { BRAND_SOFT } else { SURFACE_MUTED };
    let stroke = if selected {
        Stroke::new(1.5, BRAND)
    } else {
        Stroke::new(1.0, BORDER)
    };
    let response = Frame::new()
        .fill(fill)
        .corner_radius(12)
        .stroke(stroke)
        .inner_margin(Margin::symmetric(14, 10))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                radio_mark(ui, selected);
                ui.add_space(10.0);
                ui.vertical(|ui| {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(&board.port).size(15.5).strong().monospace());
                        if board.likely_esp32 {
                            chip(ui, "ESP32", SUCCESS, SUCCESS_SOFT);
                        }
                    });
                    ui.add(
                        egui::Label::new(
                            RichText::new(&board.description)
                                .size(12.0)
                                .color(TEXT_SECONDARY),
                        )
                        .truncate(),
                    );
                });
                if selected {
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.label(RichText::new("เลือกแล้ว").size(12.0).strong().color(BRAND));
                    });
                }
            });
        })
        .response;
    let response = response
        .interact(Sense::click())
        .on_hover_cursor(egui::CursorIcon::PointingHand);
    if response.hovered() && !selected {
        ui.painter().rect_stroke(
            response.rect,
            12,
            Stroke::new(1.0, BRAND),
            StrokeKind::Inside,
        );
    }
    response
}

fn firmware_grid_row(
    ui: &mut egui::Ui,
    firmware: &Path,
    latest: bool,
    selected: bool,
) -> egui::Response {
    let fill = if selected { BRAND_SOFT } else { SURFACE_MUTED };
    let stroke = if selected {
        Stroke::new(1.5, BRAND)
    } else {
        Stroke::new(1.0, BORDER)
    };
    let response = Frame::new()
        .fill(fill)
        .corner_radius(10)
        .stroke(stroke)
        .inner_margin(Margin::symmetric(10, 6))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                radio_mark(ui, selected);
                ui.add_space(8.0);
                ui.label(
                    RichText::new(firmware_label(firmware))
                        .size(15.0)
                        .strong()
                        .monospace(),
                );
                if latest {
                    chip(ui, "แนะนำ", BRAND, BRAND_SOFT);
                }
            });
        })
        .response;
    let response = response
        .interact(Sense::click())
        .on_hover_cursor(egui::CursorIcon::PointingHand)
        .on_hover_text(format!(
            "{} · {}",
            firmware_file_name(firmware),
            file_size_label(firmware)
        ));
    if response.hovered() && !selected {
        ui.painter().rect_stroke(
            response.rect,
            10,
            Stroke::new(1.0, BRAND),
            StrokeKind::Inside,
        );
    }
    response
}

fn custom_firmware_row(ui: &mut egui::Ui, path: &Path, selected: bool) -> egui::Response {
    let fill = if selected { BRAND_SOFT } else { SURFACE_MUTED };
    let stroke = if selected {
        Stroke::new(1.5, BRAND)
    } else {
        Stroke::new(1.0, BORDER)
    };
    let response = Frame::new()
        .fill(fill)
        .corner_radius(10)
        .stroke(stroke)
        .inner_margin(Margin::symmetric(10, 8))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                radio_mark(ui, selected);
                ui.add_space(8.0);
                ui.vertical(|ui| {
                    ui.horizontal(|ui| {
                        chip(ui, "ไฟล์จากเครื่อง", BRAND, BRAND_SOFT);
                        ui.label(
                            RichText::new(file_size_label(path))
                                .size(12.0)
                                .color(TEXT_MUTED),
                        );
                    });
                    ui.add(
                        egui::Label::new(
                            RichText::new(firmware_file_name(path))
                                .size(13.5)
                                .strong()
                                .monospace(),
                        )
                        .truncate(),
                    );
                });
            });
        })
        .response;
    response
        .interact(Sense::click())
        .on_hover_cursor(egui::CursorIcon::PointingHand)
        .on_hover_text(path.display().to_string())
}

fn radio_mark(ui: &mut egui::Ui, selected: bool) {
    let (rect, _) = ui.allocate_exact_size(Vec2::splat(20.0), Sense::hover());
    let center = rect.center();
    if selected {
        ui.painter().circle_filled(center, 9.0, BRAND);
        ui.painter().circle_filled(center, 3.2, Color32::WHITE);
    } else {
        ui.painter()
            .circle_stroke(center, 8.0, Stroke::new(1.5, BORDER_STRONG));
    }
}

fn paint_check(painter: &egui::Painter, center: egui::Pos2, color: Color32) {
    let stroke = Stroke::new(2.0, color);
    painter.line_segment(
        [
            center + egui::vec2(-4.5, 0.0),
            center + egui::vec2(-1.0, 3.5),
        ],
        stroke,
    );
    painter.line_segment(
        [
            center + egui::vec2(-1.0, 3.5),
            center + egui::vec2(5.0, -4.5),
        ],
        stroke,
    );
}

fn paint_info(painter: &egui::Painter, center: egui::Pos2, color: Color32) {
    let stroke = Stroke::new(2.0, color);
    painter.circle_filled(center + egui::vec2(0.0, -4.0), 1.3, color);
    painter.line_segment(
        [
            center + egui::vec2(0.0, -0.5),
            center + egui::vec2(0.0, 5.0),
        ],
        stroke,
    );
}

fn ready_banner(ui: &mut egui::Ui, message: &str, ready: bool) {
    let (background, foreground) = if ready {
        (SUCCESS_SOFT, SUCCESS)
    } else {
        (SURFACE_MUTED, TEXT_SECONDARY)
    };
    Frame::new()
        .fill(background)
        .corner_radius(10)
        .stroke(Stroke::new(1.0, if ready { SUCCESS } else { BORDER }))
        .inner_margin(Margin::symmetric(14, 11))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                let (rect, _) = ui.allocate_exact_size(Vec2::splat(22.0), Sense::hover());
                ui.painter().circle_filled(rect.center(), 11.0, foreground);
                if ready {
                    paint_check(ui.painter(), rect.center(), Color32::WHITE);
                } else {
                    paint_info(ui.painter(), rect.center(), Color32::WHITE);
                }
                ui.add_space(8.0);
                ui.add(
                    egui::Label::new(RichText::new(message).size(13.0).strong().color(foreground))
                        .wrap(),
                );
            });
        });
}

fn running_banner(ui: &mut egui::Ui, message: &str, elapsed_seconds: u64) {
    Frame::new()
        .fill(WARN_SOFT)
        .corner_radius(10)
        .inner_margin(Margin::symmetric(14, 12))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                ui.add(egui::Spinner::new().size(18.0).color(WARN));
                ui.add_space(8.0);
                ui.vertical(|ui| {
                    ui.add(
                        egui::Label::new(RichText::new(message).size(13.5).strong().color(WARN))
                            .wrap(),
                    );
                    ui.label(
                        RichText::new(format!(
                            "กำลังทำงาน {elapsed_seconds} วินาที — โดยปกติใช้เวลา 1–2 นาที"
                        ))
                        .size(12.0)
                        .color(TEXT_SECONDARY),
                    );
                });
            });
        });
}

fn result_banner(ui: &mut egui::Ui, success: bool, message: &str, hint: &str) {
    let (background, foreground) = if success {
        (SUCCESS_SOFT, SUCCESS)
    } else {
        (ERROR_SOFT, ERROR)
    };
    Frame::new()
        .fill(background)
        .corner_radius(10)
        .inner_margin(Margin::symmetric(14, 12))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                let (rect, _) = ui.allocate_exact_size(Vec2::splat(24.0), Sense::hover());
                ui.painter().circle_filled(rect.center(), 12.0, foreground);
                if success {
                    paint_check(ui.painter(), rect.center(), Color32::WHITE);
                } else {
                    let stroke = Stroke::new(2.0, Color32::WHITE);
                    ui.painter().line_segment(
                        [
                            rect.center() + egui::vec2(0.0, -5.0),
                            rect.center() + egui::vec2(0.0, 3.0),
                        ],
                        stroke,
                    );
                    ui.painter().circle_filled(
                        rect.center() + egui::vec2(0.0, 6.0),
                        1.3,
                        Color32::WHITE,
                    );
                }
                ui.add_space(10.0);
                ui.vertical(|ui| {
                    ui.add(
                        egui::Label::new(RichText::new(message).size(14.0).strong().color(foreground))
                            .wrap(),
                    );
                    if !hint.is_empty() {
                        ui.add(
                            egui::Label::new(RichText::new(hint).size(12.0).color(TEXT_SECONDARY))
                                .wrap(),
                        );
                    }
                });
            });
        });
}

// ---- Board discovery -----------------------------------------------------

fn demo_boards() -> Vec<BoardPort> {
    vec![
        BoardPort {
            port: "COM3".to_owned(),
            description: "USB-SERIAL CH340 (COM3)".to_owned(),
            instance_id: r"USB\VID_1A86&PID_7523\DEMO1".to_owned(),
            likely_esp32: true,
        },
        BoardPort {
            port: "COM7".to_owned(),
            description: "Silicon Labs CP210x USB to UART Bridge (COM7)".to_owned(),
            instance_id: r"USB\VID_10C4&PID_EA60\DEMO2".to_owned(),
            likely_esp32: true,
        },
    ]
}

fn spawn_board_scan() -> Receiver<Vec<BoardPort>> {
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = sender.send(find_boards());
    });
    receiver
}

fn find_boards() -> Vec<BoardPort> {
    // `-PresentOnly` + `Status OK` keeps devices that are plugged in right now.
    // Only USB serial devices are returned, so old/phantom COM ports and
    // motherboard or Bluetooth ports never appear.
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Get-PnpDevice -Class Ports -PresentOnly -ErrorAction Stop |
    Where-Object { $_.Present -ne $false -and $_.Status -ne 'Error' } |
    ForEach-Object {
      $name = [string]$_.FriendlyName
      if ($name -match '\((COM\d+)\)') {
        "{0}`t{1}`t{2}" -f $matches[1], $name, [string]$_.InstanceId
      }
    }
} catch {
  Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($_.DeviceID -and $_.PNPDeviceID) {
        "{0}`t{1}`t{2}" -f $_.DeviceID, $_.Name, $_.PNPDeviceID
      }
    }
}
"#;
    let mut command = Command::new("powershell");
    command.args([
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        script,
    ]);
    hide_child_window(&mut command);
    let Ok(output) = command.output() else {
        return Vec::new();
    };

    let mut boards: Vec<BoardPort> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let line = line.trim_start_matches('\u{feff}');
            let mut fields = line.trim().splitn(3, '\t');
            let port = fields.next()?.trim();
            let description = fields.next()?.trim();
            let instance_id = fields.next().unwrap_or_default().trim();
            if port.is_empty() || description.is_empty() {
                return None;
            }
            let identity = format!("{description} {instance_id}").to_ascii_lowercase();
            let is_usb =
                instance_id.to_ascii_lowercase().starts_with("usb\\") || identity.contains("usb");
            if !is_usb {
                return None;
            }
            let likely_esp32 = [
                "esp32",
                "cp210",
                "ch340",
                "ch341",
                "ch343",
                "ch910",
                "ftdi",
                "ft232",
                "silicon labs",
                "usb serial",
                "usb-serial",
                "usb jtag",
                "wch",
            ]
            .iter()
            .any(|keyword| identity.contains(keyword));
            Some(BoardPort {
                port: port.to_owned(),
                description: description.to_owned(),
                instance_id: instance_id.to_owned(),
                likely_esp32,
            })
        })
        .collect();

    boards.sort_by(|left, right| {
        (!left.likely_esp32, port_number(&left.port))
            .cmp(&(!right.likely_esp32, port_number(&right.port)))
    });
    let mut unique: Vec<BoardPort> = Vec::with_capacity(boards.len());
    for board in boards {
        if !unique.iter().any(|existing| existing.port == board.port) {
            unique.push(board);
        }
    }
    unique
}

fn auto_select_board(boards: &[BoardPort]) -> Option<usize> {
    if boards.len() == 1 {
        return Some(0);
    }
    let mut likely = boards
        .iter()
        .enumerate()
        .filter(|(_, board)| board.likely_esp32);
    match (likely.next(), likely.next()) {
        (Some((index, _)), None) => Some(index),
        _ => None,
    }
}

fn port_number(port: &str) -> u32 {
    port.trim_start_matches("COM").parse().unwrap_or(u32::MAX)
}

// ---- Firmware discovery --------------------------------------------------

/// Opens the Windows "open file" dialog in a helper thread and returns the
/// chosen path (None when cancelled or unavailable).
fn spawn_file_picker() -> Receiver<Option<PathBuf>> {
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = sender.send(pick_file_dialog());
    });
    receiver
}

fn pick_file_dialog() -> Option<PathBuf> {
    let script = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; \
        Add-Type -AssemblyName System.Windows.Forms; \
        $f=New-Object System.Windows.Forms.Form -Property @{TopMost=$true}; \
        $d=New-Object System.Windows.Forms.OpenFileDialog; \
        $d.Title='เลือกไฟล์เฟิร์มแวร์ (.bin)'; \
        $d.Filter='Firmware (*.bin)|*.bin|ทุกไฟล์ (*.*)|*.*'; \
        if($d.ShowDialog($f) -eq 'OK'){ Write-Output $d.FileName }";
    let mut command = Command::new("powershell");
    command.args(["-NoProfile", "-STA", "-NonInteractive", "-Command", script]);
    hide_child_window(&mut command);
    let output = command.output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().map(str::trim).find(|line| !line.is_empty())?;
    Some(PathBuf::from(line))
}

/// Cheap sanity checks before a user-chosen file can be flashed at 0x10000.
fn validate_firmware_file(path: &Path) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|_| "เปิดไฟล์ที่เลือกไม่ได้".to_owned())?;
    if !metadata.is_file() {
        return Err("สิ่งที่เลือกไม่ใช่ไฟล์".to_owned());
    }
    let is_bin = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("bin"));
    if !is_bin {
        return Err("ไฟล์ที่เลือกต้องเป็นนามสกุล .bin".to_owned());
    }
    if metadata.len() < 64 * 1024 {
        return Err("ไฟล์เล็กเกินไป ไม่น่าใช่เฟิร์มแวร์ของแอป".to_owned());
    }
    if metadata.len() > 3 * 1024 * 1024 {
        return Err("ไฟล์ใหญ่เกิน 3 MB ไม่พอดีกับพาร์ทิชันแอป".to_owned());
    }
    let mut magic = [0u8; 1];
    let first = fs::File::open(path)
        .and_then(|mut file| std::io::Read::read_exact(&mut file, &mut magic))
        .map(|_| magic[0]);
    if first.ok() != Some(0xE9) {
        return Err("ไฟล์นี้ไม่ใช่อิมเมจ ESP32 (ไบต์แรกต้องเป็น 0xE9)".to_owned());
    }
    Ok(())
}

fn find_firmwares() -> (Vec<PathBuf>, Option<PathBuf>) {
    let mut first_existing_directory = None;
    for directory in firmware_directories() {
        if !directory.is_dir() {
            continue;
        }
        if first_existing_directory.is_none() {
            first_existing_directory = Some(directory.clone());
        }
        let mut files: Vec<PathBuf> = fs::read_dir(&directory)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("firmware-") && name.ends_with(".bin"))
            })
            .collect();
        if !files.is_empty() {
            files.sort_by(|left, right| version_numbers(right).cmp(&version_numbers(left)));
            return (files, Some(directory));
        }
    }
    (Vec::new(), first_existing_directory)
}

fn find_support_files(firmware_dir: Option<&Path>) -> Option<SupportFiles> {
    let mut directories = Vec::new();
    if let Some(directory) = firmware_dir {
        directories.push(directory.to_path_buf());
    }
    directories.extend(firmware_directories());

    let find = |name: &str| {
        directories
            .iter()
            .map(|directory| directory.join(name))
            .find(|path| path.is_file())
    };

    Some(SupportFiles {
        bootloader: find("bootloader.bin")?,
        partitions: find("partitions.bin")?,
        boot_app0: find("boot_app0.bin"),
    })
}

fn firmware_directories() -> Vec<PathBuf> {
    let mut directories = Vec::new();
    if let Ok(executable) = std::env::current_exe() {
        if let Some(executable_directory) = executable.parent() {
            directories.push(executable_directory.join("firmware"));
            if let Some(parent) = executable_directory.parent() {
                directories.push(parent.join("firmware"));
                if let Some(grandparent) = parent.parent() {
                    directories.push(grandparent.join("firmware"));
                }
            }
        }
    }
    directories.push(PathBuf::from("firmware"));
    directories.push(PathBuf::from("../firmware"));
    directories.push(PathBuf::from("../../firmware"));
    directories
}

fn version_numbers(path: &Path) -> Vec<u32> {
    firmware_label(path)
        .split('.')
        .filter_map(|part| part.parse().ok())
        .collect()
}

fn firmware_label(path: &Path) -> String {
    firmware_file_name(path)
        .trim_start_matches("firmware-")
        .trim_end_matches(".bin")
        .to_owned()
}

fn firmware_file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("firmware.bin")
        .to_owned()
}

fn file_size_label(path: &Path) -> String {
    let bytes = fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{:.0} KB", bytes as f64 / 1024.0)
    }
}

fn open_folder(path: &Path) {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer");
        command.arg(path);
        let _ = command.spawn();
    }
}

// ---- esptool runner ------------------------------------------------------

fn run_esptool(port: &str, files: &[FlashFile], operation: Operation) -> Result<String, String> {
    let prepared: Vec<(String, PathBuf)> = files
        .iter()
        .map(|file| {
            let path = file
                .path
                .canonicalize()
                .map_err(|error| format!("เปิดไฟล์ {} ไม่ได้: {error}", file.path.display()))?;
            Ok((file.address.to_owned(), path))
        })
        .collect::<Result<_, String>>()?;

    let mut last_error = None;
    for (program, prefix) in esptool_attempts() {
        for new_style in [true, false] {
            let output = match build_esptool_command(
                &program, &prefix, port, &prepared, new_style, operation,
            )
            .output()
            {
                Ok(output) => output,
                Err(error) => {
                    last_error = Some(format!(
                        "เปิดเครื่องมือแฟลชไม่ได้ ({}) — ตรวจว่าติดตั้ง Python/esptool หรือ PlatformIO แล้ว: {error}",
                        program.display()
                    ));
                    break;
                }
            };

            let raw = command_output_text(&output);
            let lower = raw.to_ascii_lowercase();
            if output.status.success() {
                let verified = lower.contains("verified") || raw.contains("Hash of data");
                return Ok(match operation {
                    Operation::Flash => {
                        let version = prepared
                            .last()
                            .map(|(_, path)| firmware_label(path))
                            .unwrap_or_default();
                        let mode = if prepared.len() > 1 {
                            "แฟลชเต็มรูปแบบ"
                        } else {
                            "แฟลชเฉพาะแอป"
                        };
                        format!(
                            "{mode} {version} ลง {port} สำเร็จ{}",
                            if verified {
                                " — ตรวจสอบข้อมูลบนบอร์ดแล้ว"
                            } else {
                                ""
                            }
                        )
                    }
                    Operation::Erase => format!("ล้างข้อมูลบอร์ด {port} สำเร็จ"),
                });
            }
            if lower.contains("no module named") {
                last_error = Some(format!(
                    "ไม่พบโมดูล esptool ใน {} — ติดตั้งด้วยคำสั่ง: {} -m pip install esptool",
                    program.display(),
                    program.display()
                ));
                break;
            }
            if lower.contains("python was not found") || lower.contains("app execution aliases") {
                // Microsoft Store placeholder named `python`; try `py` or PlatformIO next.
                last_error = Some(format!(
                    "{} ไม่ใช่ Python ที่ใช้งานได้ — กำลังมองหา Python/esptool ตัวอื่น",
                    program.display()
                ));
                break;
            }

            if new_style && is_unsupported_command(&lower) {
                // Older esptool versions only know the underscore command names.
                continue;
            }

            return Err(translate_esptool_error(&raw, port));
        }
    }

    Err(last_error.unwrap_or_else(|| {
        "ไม่พบเครื่องมือ esptool ในเครื่อง — ติดตั้ง Python + esptool หรือ PlatformIO ก่อนใช้งาน".to_owned()
    }))
}

fn esptool_attempts() -> Vec<(PathBuf, Vec<String>)> {
    let mut attempts = vec![
        (
            PathBuf::from("python"),
            vec!["-m".to_owned(), "esptool".to_owned()],
        ),
        (
            PathBuf::from("py"),
            vec!["-m".to_owned(), "esptool".to_owned()],
        ),
    ];
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        let platformio_root = PathBuf::from(profile).join(".platformio");
        let python = platformio_root
            .join("penv")
            .join("Scripts")
            .join("python.exe");
        let esptool = platformio_root
            .join("packages")
            .join("tool-esptoolpy")
            .join("esptool.py");
        if python.is_file() && esptool.is_file() {
            attempts.push((python, vec![esptool.to_string_lossy().into_owned()]));
        }
    }
    attempts
}

fn build_esptool_command(
    program: &Path,
    prefix: &[String],
    port: &str,
    files: &[(String, PathBuf)],
    new_style: bool,
    operation: Operation,
) -> Command {
    let mut command = Command::new(program);
    command
        .args(prefix)
        .args(["--chip", "esp32", "--port", port, "--baud", FLASH_BAUD]);
    match operation {
        Operation::Flash => {
            let (name, flash_mode, flash_freq, flash_size) = if new_style {
                (
                    "write-flash",
                    "--flash-mode",
                    "--flash-freq",
                    "--flash-size",
                )
            } else {
                (
                    "write_flash",
                    "--flash_mode",
                    "--flash_freq",
                    "--flash_size",
                )
            };
            command.args([
                name, flash_mode, "dio", flash_freq, "40m", flash_size, "4MB",
            ]);
            for (address, path) in files {
                command.arg(address).arg(path);
            }
        }
        Operation::Erase => {
            command.arg(if new_style {
                "erase-flash"
            } else {
                "erase_flash"
            });
        }
    }
    hide_child_window(&mut command);
    command
}

fn is_unsupported_command(lower: &str) -> bool {
    lower.contains("invalid choice")
        || lower.contains("no such command")
        || lower.contains("unrecognized arguments")
        || lower.contains("unknown command")
}

fn command_output_text(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stderr.trim().is_empty() {
        stdout.into_owned()
    } else if stdout.trim().is_empty() {
        stderr.into_owned()
    } else {
        format!("{stdout}\n{stderr}")
    }
}

fn translate_esptool_error(raw: &str, port: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("doesn't exist")
        || lower.contains("does not exist")
        || lower.contains("filenotfounderror")
    {
        return format!("ไม่พบพอร์ต {port} — ตรวจสาย USB ว่าเสียบอยู่ แล้วลองใหม่");
    }
    if lower.contains("access is denied")
        || lower.contains("permissionerror")
        || lower.contains("could not open port")
        || lower.contains("serial port busy")
        || lower.contains("port is busy")
    {
        return format!("เปิดพอร์ต {port} ไม่ได้ — ปิดโปรแกรมอื่นที่ใช้พอร์ตนี้แล้วลองใหม่");
    }
    if lower.contains("failed to connect")
        || lower.contains("timed out waiting for packet")
        || lower.contains("wrong boot mode")
        || lower.contains("no serial data received")
    {
        return "เชื่อมต่อบอร์ดไม่ได้ — กดปุ่ม BOOT (IO0) ค้างไว้ กด RST 1 ครั้ง แล้วปล่อย BOOT จากนั้นลองแฟลชอีกครั้ง"
            .to_owned();
    }
    if lower.contains("no module named") {
        return "ไม่พบโมดูล esptool — ติดตั้งด้วยคำสั่ง: python -m pip install esptool".to_owned();
    }

    let detail = raw
        .lines()
        .map(str::trim)
        .map(|line| {
            line.strip_prefix("python : ")
                .or_else(|| line.strip_prefix("py : "))
                .unwrap_or(line)
                .trim()
        })
        .filter(|line| !line.is_empty())
        .filter(|line| !line.to_ascii_lowercase().starts_with("warning:"))
        .filter(|line| !line.starts_with("At line:"))
        .filter(|line| !line.starts_with("+"))
        .filter(|line| !line.contains("CategoryInfo"))
        .filter(|line| !line.contains("FullyQualifiedErrorId"))
        .last()
        .unwrap_or("ตรวจสาย USB แล้วลองใหม่");

    format!("{detail} — ตรวจสาย USB และลองแฟลชอีกครั้ง")
}

fn hide_child_window(command: &mut Command) {
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argument_strings(command: &Command) -> Vec<String> {
        command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect()
    }

    fn test_files() -> Vec<(String, PathBuf)> {
        vec![
            ("0x1000".to_owned(), PathBuf::from("bootloader.bin")),
            ("0x8000".to_owned(), PathBuf::from("partitions.bin")),
            ("0xe000".to_owned(), PathBuf::from("boot_app0.bin")),
            ("0x10000".to_owned(), PathBuf::from("firmware-0.2.11.bin")),
        ]
    }

    #[test]
    fn full_flash_command_has_all_offsets() {
        let command = build_esptool_command(
            Path::new("python"),
            &["-m".to_owned(), "esptool".to_owned()],
            "COM3",
            &test_files(),
            true,
            Operation::Flash,
        );
        assert_eq!(
            argument_strings(&command).join(" "),
            "-m esptool --chip esp32 --port COM3 --baud 460800 write-flash \
             --flash-mode dio --flash-freq 40m --flash-size 4MB \
             0x1000 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin \
             0x10000 firmware-0.2.11.bin"
        );
    }

    #[test]
    fn legacy_flash_command_uses_legacy_names() {
        let command = build_esptool_command(
            Path::new("python"),
            &["-m".to_owned(), "esptool".to_owned()],
            "COM3",
            &test_files(),
            false,
            Operation::Flash,
        );
        let arguments = argument_strings(&command).join(" ");
        assert!(arguments.contains("write_flash"));
        assert!(arguments.contains("--flash_mode dio"));
        assert!(arguments.contains("--flash_freq 40m"));
        assert!(arguments.contains("--flash_size 4MB"));
        assert!(arguments.contains("0x1000 bootloader.bin"));
        assert!(arguments.contains("0x10000 firmware-0.2.11.bin"));
    }

    #[test]
    fn erase_command_uses_expected_name() {
        let new_command = build_esptool_command(
            Path::new("python"),
            &["-m".to_owned(), "esptool".to_owned()],
            "COM3",
            &[],
            true,
            Operation::Erase,
        );
        assert_eq!(
            argument_strings(&new_command).last().map(String::as_str),
            Some("erase-flash")
        );

        let legacy_command = build_esptool_command(
            Path::new("python"),
            &["-m".to_owned(), "esptool".to_owned()],
            "COM3",
            &[],
            false,
            Operation::Erase,
        );
        assert_eq!(
            argument_strings(&legacy_command).last().map(String::as_str),
            Some("erase_flash")
        );
    }

    #[test]
    fn firmware_versions_sort_newest_first() {
        let mut files = vec![
            PathBuf::from("firmware-0.2.9.bin"),
            PathBuf::from("firmware-0.2.11.bin"),
            PathBuf::from("firmware-0.2.10.bin"),
        ];
        files.sort_by(|left, right| version_numbers(right).cmp(&version_numbers(left)));
        assert_eq!(
            files
                .iter()
                .map(|path| firmware_label(path))
                .collect::<Vec<_>>(),
            vec!["0.2.11", "0.2.10", "0.2.9"]
        );
    }

    fn test_board(port: &str, instance_id: &str) -> BoardPort {
        BoardPort {
            port: port.to_owned(),
            description: format!("USB serial ({port})"),
            instance_id: instance_id.to_owned(),
            likely_esp32: true,
        }
    }

    #[test]
    fn identify_wizard_follows_unplug_and_replug() {
        let board = test_board("COM3", r"USB\VID_1A86&PID_7523\A");
        let phase = IdentifyPhase::WaitingForUnplug {
            initial: vec![board.clone()],
        };

        let unplugged = advance_identify_phase(&phase, &[]).expect("phase");
        assert!(matches!(
            &unplugged,
            IdentifyPhase::WaitingForReplug { board } if board.port == "COM3"
        ));

        let replugged = advance_identify_phase(&unplugged, &[board]).expect("phase");
        assert!(matches!(
            &replugged,
            IdentifyPhase::Done { board } if board.port == "COM3"
        ));
    }

    #[test]
    fn identify_wizard_waits_when_multiple_boards_disappear() {
        let left = test_board("COM3", r"USB\VID_1A86&PID_7523\A");
        let right = test_board("COM7", r"USB\VID_10C4&PID_EA60\B");
        let phase = IdentifyPhase::WaitingForUnplug {
            initial: vec![left, right],
        };

        let next = advance_identify_phase(&phase, &[]).expect("phase");
        assert!(matches!(next, IdentifyPhase::WaitingForUnplug { .. }));
    }

    #[test]
    fn identify_wizard_clears_when_confirmed_board_is_removed() {
        let board = test_board("COM3", r"USB\VID_1A86&PID_7523\A");
        let phase = IdentifyPhase::Done {
            board: board.clone(),
        };

        assert!(advance_identify_phase(&phase, &[board]).is_some());
        assert!(advance_identify_phase(&phase, &[]).is_none());
    }
}

fn main() -> eframe::Result {
    let mut arguments = std::env::args().skip(1);
    let mut screenshot_path = None;
    let mut demo_mode = false;
    let mut small_window = false;
    let mut wide_window = false;
    let mut custom_size: Option<[f32; 2]> = None;
    let mut custom_firmware: Option<PathBuf> = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--screenshot" => screenshot_path = arguments.next().map(PathBuf::from),
            "--demo" => demo_mode = true,
            "--small" => small_window = true,
            "--wide" => wide_window = true,
            "--custom-firmware" => custom_firmware = arguments.next().map(PathBuf::from),
            "--size" => {
                custom_size = arguments.next().and_then(|value| {
                    let (w, h) = value.split_once('x')?;
                    Some([w.parse().ok()?, h.parse().ok()?])
                });
            }
            _ => {}
        }
    }
    let viewport = egui::ViewportBuilder::default()
        .with_title(APP_TITLE)
        .with_inner_size(if let Some(size) = custom_size {
            size
        } else if small_window {
            [760.0, 640.0]
        } else if wide_window {
            [1536.0, 864.0]
        } else {
            [1080.0, 820.0]
        })
        .with_min_inner_size([340.0, 480.0]);
    let viewport = match window_icon() {
        Some(icon) => viewport.with_icon(icon),
        None => viewport,
    };
    eframe::run_native(
        APP_TITLE,
        eframe::NativeOptions {
            viewport,
            ..Default::default()
        },
        Box::new(move |context| {
            let mut app = FirmwareApp::new(context, screenshot_path, demo_mode);
            if let Some(path) = custom_firmware {
                app.set_custom_firmware(path);
            }
            Ok(Box::new(app))
        }),
    )
}
