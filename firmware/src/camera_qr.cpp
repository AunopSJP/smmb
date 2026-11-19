#include "camera_qr.h"

#include <esp_camera.h>
#include <esp_task_wdt.h>

#include "board.h"
#include "settings.h"
#include "quirc/quirc.h"
#include "qr_scan.h"
#include "img_converters.h"
#include <ArduinoJson.h>

#include "debugview.h"

// กรอบกลางภาพที่ใช้อ่านรอบปกติ (สัดส่วนของเฟรม · 480×400 บน VGA) — เฟรมเต็มสแกนทุก QR_FULL_FRAME_INTERVAL เฟรม
static inline int centerWidth(int frameW) { return frameW * 3 / 4; }
static inline int centerHeight(int frameH) { return frameH * 5 / 6; }
static constexpr uint8_t QR_FULL_FRAME_INTERVAL = 4;

static bool running = false;
static struct quirc* qr = nullptr;
static struct quirc* qrFull = nullptr;
static bool flashOn = false;

// 0.2.32: ส่วนสแกน QR ทั้งหมดในไฟล์นี้เป็นของ 0.2.25 (ผู้ใช้สั่ง 2026-11-19 — รุ่นนั้นสแกนได้ดี) · ส่วนที่เพิ่มคือโหมดถ่ายใบหน้าด้านล่าง
// โหมดถ่ายใบหน้า (Snapface): ความละเอียดสูงกว่าโหมดสแกน · ขนาดไฟล์ต้องไม่เกินที่เซิร์ฟเวอร์รับ (85 KB)
static constexpr framesize_t PHOTO_FRAME_SIZE = FRAMESIZE_XGA;  // 1024×768
static constexpr int PHOTO_QUALITY = 6;                         // วัดบนบอร์ดจริง: ~35 KB · เกินขนาดแล้วค่อยลด
static constexpr int PHOTO_QUALITY_STEP = 3;
static constexpr int PHOTO_QUALITY_MAX = 22;
static constexpr size_t PHOTO_MAX_BYTES = 80000;
static constexpr uint8_t PHOTO_SETTLE_FRAMES = 12;  // ให้แสงอัตโนมัติและสมดุลสีนิ่งก่อนถ่าย
static constexpr uint32_t PHOTO_SETTLE_MAX_MS = 2500;
static constexpr uint8_t PHOTO_FRAMES = 3;          // ถ่ายกี่เฟรมแล้วเลือกเฟรมที่ได้รายละเอียดมากสุด
static constexpr uint8_t PHOTO_MAX_GRABS = 10;
static bool photoMode = false;
static int photoQuality = PHOTO_QUALITY;

bool cameraRunning() { return running; }

// ── ภาพตัวอย่าง ─────────────────────────────────────────────────────────
static bool held = false;
static bool scanning = false;
static uint8_t* prevBuf = nullptr;
static size_t prevCap = 0;
static uint16_t prevW = 0, prevH = 0;
static uint8_t prevBrightness = 0;
static float prevFps = 0;
static uint32_t prevAt = 0, shapeAt = 0, decodeAt = 0;
static bool prevShape = false;
static char prevText[48] = "";
static uint16_t scanFrames = 0, scanShapes = 0;

void cameraHold(bool hold) { held = hold; }
bool cameraScanning() { return scanning; }

// ภาพเทาที่ใช้ประมวลผล — กล้องส่ง JPEG ฮาร์ดแวร์ (เบา เร็ว) แล้วถอดเป็นเทาเอง · โหมดเทาตรง ๆ ใช้ buf ของเฟรมเลย
struct GrayImg {
  const uint8_t* px = nullptr;
  int w = 0;
  int h = 0;
};
static uint8_t* rgbBuf = nullptr;
static uint8_t* grayBuf = nullptr;
static size_t grayCap = 0;

static bool toGray(camera_fb_t* fb, GrayImg& g) {
  if (fb->format == PIXFORMAT_GRAYSCALE) {
    g.px = fb->buf;
    g.w = (int)fb->width;
    g.h = (int)fb->height;
    return true;
  }
  if (fb->format != PIXFORMAT_JPEG) return false;
  const size_t n = (size_t)fb->width * fb->height;
  if (grayCap < n) {
    free(grayBuf);
    free(rgbBuf);
    grayBuf = (uint8_t*)ps_malloc(n);
    rgbBuf = (uint8_t*)ps_malloc(n * 3);
    grayCap = grayBuf && rgbBuf ? n : 0;
  }
  if (!grayCap) return false;
  if (!fmt2rgb888(fb->buf, fb->len, PIXFORMAT_JPEG, rgbBuf)) return false;
  for (size_t i = 0; i < n; i++) grayBuf[i] = (rgbBuf[3 * i] + 2 * rgbBuf[3 * i + 1] + rgbBuf[3 * i + 2]) >> 2;  // ไม่ขึ้นกับลำดับ R/B
  g.px = grayBuf;
  g.w = (int)fb->width;
  g.h = (int)fb->height;
  return true;
}

static void previewStore(const GrayImg& g, bool shape, const String& text) {
  const size_t need = (size_t)g.w * g.h;
  if (!prevBuf || prevCap < need) {
    free(prevBuf);
    prevBuf = (uint8_t*)ps_malloc(need);
    prevCap = prevBuf ? need : 0;
  }
  if (!prevBuf) return;
  memcpy(prevBuf, g.px, need);
  prevW = g.w;
  prevH = g.h;
  uint32_t sum = 0, n = 0;
  for (size_t y = g.h / 4; y < (size_t)g.h * 3 / 4; y += 8)
    for (size_t x = g.w / 4; x < (size_t)g.w * 3 / 4; x += 8) {
      sum += g.px[y * g.w + x];
      n++;
    }
  prevBrightness = n ? sum / n : 0;
  const uint32_t now = millis();
  if (prevAt) {
    const float inst = 1000.0f / max<uint32_t>(1, now - prevAt);
    prevFps = prevFps ? prevFps * 0.7f + inst * 0.3f : inst;
  }
  prevAt = now;
  prevShape = shape;
  if (shape) shapeAt = now;
  if (text.length()) {
    decodeAt = now;
    strlcpy(prevText, text.c_str(), sizeof(prevText));
  }
}

bool cameraPreviewJpeg(uint8_t** out, size_t* len) {
  if (!prevBuf || !prevW) return false;
  return fmt2jpg(prevBuf, (size_t)prevW * prevH, prevW, prevH, PIXFORMAT_GRAYSCALE, 70, out, len);
}

String cameraPreviewJson() {
  JsonDocument d;
  const uint32_t now = millis();
  d["w"] = prevW;
  d["h"] = prevH;
  d["brightness"] = prevBrightness;
  d["fps"] = (int)(prevFps * 10) / 10.0;
  d["scanning"] = scanning;
  d["flash"] = flashOn;
  d["frame_age_ms"] = prevAt ? now - prevAt : -1;
  d["shape_ago_ms"] = shapeAt ? (int32_t)(now - shapeAt) : -1;
  d["decode_ago_ms"] = decodeAt ? (int32_t)(now - decodeAt) : -1;
  d["text"] = prevText;
  d["scan_frames"] = scanFrames;
  d["scan_shapes"] = scanShapes;
  d["crop_w"] = centerWidth(prevW);
  d["crop_h"] = centerHeight(prevH);
  String out;
  serializeJson(d, out);
  return out;
}

static camera_config_t makeConfig() {
  camera_config_t c = {};
  c.pin_pwdn = CAM_PIN_PWDN;
  c.pin_reset = CAM_PIN_RESET;
  c.pin_xclk = CAM_PIN_XCLK;
  c.pin_sccb_sda = CAM_PIN_SIOD;
  c.pin_sccb_scl = CAM_PIN_SIOC;
  c.pin_d7 = CAM_PIN_D7;
  c.pin_d6 = CAM_PIN_D6;
  c.pin_d5 = CAM_PIN_D5;
  c.pin_d4 = CAM_PIN_D4;
  c.pin_d3 = CAM_PIN_D3;
  c.pin_d2 = CAM_PIN_D2;
  c.pin_d1 = CAM_PIN_D1;
  c.pin_d0 = CAM_PIN_D0;
  c.pin_vsync = CAM_PIN_VSYNC;
  c.pin_href = CAM_PIN_HREF;
  c.pin_pclk = CAM_PIN_PCLK;
  // 10 MHz: 20 MHz ทำให้ภาพมีเส้นขีด (DMA ไม่ทัน EV-EOF-OVF ตอน Wi-Fi ทำงาน) — ทดสอบบนบอร์ดจริง 2026-10-28
  c.xclk_freq_hz = (uint32_t)settings.camXclk * 1000000u;
  c.ledc_timer = LEDC_TIMER_0;
  c.ledc_channel = LEDC_CHANNEL_0;
  // ขาวดำ VGA: QR ประจำตัว (~100 ตัวอักษร) จากจอมือถือระยะ 15–30 ซม. ต้องการความละเอียดพอสมควร
  c.pixel_format = settings.camJpeg ? PIXFORMAT_JPEG : PIXFORMAT_GRAYSCALE;
  c.frame_size = settings.camSize == "qvga" ? FRAMESIZE_QVGA
                 : settings.camSize == "svga" ? FRAMESIZE_SVGA
                 : settings.camSize == "xga"  ? FRAMESIZE_XGA
                                              : FRAMESIZE_VGA;
  c.jpeg_quality = settings.camQ;  // เลขน้อย = คมกว่า (ค่าเริ่มต้น 6)
  c.fb_count = 2;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;
  return c;
}

bool cameraStart() {
  if (running) return true;
  photoMode = false;
  camera_config_t c = makeConfig();
  esp_err_t err = esp_camera_init(&c);
  // กล้องหาไม่เจอชั่วคราว (ไฟตก/เซนเซอร์ค้าง) → ปิด-เปิดขา PWDN แล้วลองใหม่ 2 ครั้งก่อนยอมแพ้
  for (int retry = 0; err != ESP_OK && retry < 2; retry++) {
    Serial.printf("[cam] init failed 0x%x — power-cycling the sensor (retry %d)\n", err, retry + 1);
    pinMode(CAM_PIN_PWDN, OUTPUT);
    digitalWrite(CAM_PIN_PWDN, HIGH);
    delay(100);
    digitalWrite(CAM_PIN_PWDN, LOW);
    delay(300);
    err = esp_camera_init(&c);
  }
  if (err != ESP_OK) {
    Serial.printf("[cam] init failed 0x%x\n", err);
    return false;
  }
  if (!qr) qr = quirc_new();
  if (!qrFull) qrFull = quirc_new();
  if (!qr || !qrFull) {
    Serial.println("[cam] quirc_new failed (no memory)");
    esp_camera_deinit();
    return false;
  }
  // ภาพ native ตามสเก็ตช์ esp32-cam-qvga15: ไม่กลับภาพ/ไม่เร่ง contrast (ภาพกลับซ้าย-ขวาถอดได้ด้วยการลองกลับด้านใน scanFrame) · sharpness/ae ปรับได้ด้วย cam
  if (sensor_t* sen = esp_camera_sensor_get()) {
    sen->set_sharpness(sen, settings.camSharp);
    if (settings.camAe != 0) sen->set_ae_level(sen, settings.camAe);
    sen->set_vflip(sen, settings.camFlip & 1);
    sen->set_hmirror(sen, (settings.camFlip >> 1) & 1);
  }
  running = true;
  // ทิ้ง 8 เฟรมแรก: เซนเซอร์เพิ่งตื่น ปรับแสงอัตโนมัติยังไม่นิ่ง — cameraAutoFlash วัดความสว่างจากเฟรมถัดไป (ทิ้งแค่ 2 ค่าที่วัดเชื่อไม่ได้)
  for (int i = 0; i < 8; i++) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }
  return true;
}

void flashOff() {
  digitalWrite(PIN_FLASH_LED, LOW);
  flashOn = false;
}

/** PWDN = HIGH → เซนเซอร์ OV2640 หลับ (กินไฟต่ำมาก) · esp_camera_init ดึงลง LOW เองตอนเปิดกล้อง */
void cameraSensorSleep() {
  pinMode(CAM_PIN_PWDN, OUTPUT);
  digitalWrite(CAM_PIN_PWDN, HIGH);
}

void cameraStop() {
  flashOff();
  if (!running || held) return;
  esp_camera_deinit();
  running = false;
  photoMode = false;
  cameraSensorSleep();
}

bool cameraAutoFlash(bool allowed) {
  if (!running || !allowed) {
    flashOff();
    return false;
  }
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return flashOn;
  GrayImg g;
  if (!toGray(fb, g)) {
    esp_camera_fb_return(fb);
    return flashOn;
  }
  // ค่าความสว่างเฉลี่ยตรงกลางภาพ (สุ่มทุก 8 พิกเซล)
  uint32_t sum = 0, n = 0;
  for (size_t y = g.h / 4; y < (size_t)g.h * 3 / 4; y += 8)
    for (size_t x = g.w / 4; x < (size_t)g.w * 3 / 4; x += 8) {
      sum += g.px[y * g.w + x];
      n++;
    }
  esp_camera_fb_return(fb);
  uint32_t avg = n ? sum / n : 255;
  bool dark = avg < 45;
  digitalWrite(PIN_FLASH_LED, dark ? HIGH : LOW);
  flashOn = dark;
  Serial.printf("[cam] brightness %u → flash %s\n", avg, dark ? "on" : "off");
  return flashOn;
}

/** สถานะถอดล่าสุด (ไว้บอกสาเหตุตอนสแกนไม่ติด) */
static quirc_decode_error_t lastDecodeErr = QUIRC_SUCCESS;

// quirc_code ×2 + quirc_data ~17 KB — ไว้นอก stack (stack ของ loop มี 8 KB เคยล้นจนบอร์ดรีสตาร์ต)
static struct quirc_code code;
static struct quirc_code flippedCode;
static struct quirc_data data;

// ผลวินิจฉัยของการสแกนรอบนี้ — ส่งขึ้นหน้า D04 ตอนอ่านไม่ได้ (scan_diag)
static int lastShapePx = 0;       // ความกว้างรูปทรง QR ที่ใหญ่สุดในภาพ (px) · QR ประจำตัว 29 โมดูล ควร ≥ ~100 px
static uint8_t lastBright = 0;    // ความสว่างเฉลี่ยกลางภาพเฟรมล่าสุด
static int lastQrPath = 0;        // เส้นทางที่ถอดได้ครั้งล่าสุด (QR_PATH_*) · 2/4 = ภาพกระจก
static int lastQrPass = 0;        // 1 = รอบแรก · 2 = รอบสอง (ลับขอบ)

/** ความสว่างเฉลี่ยกลางภาพ (สุ่มทุก 8 พิกเซล) */
static uint8_t frameBrightness(const GrayImg& g) {
  uint32_t sum = 0, n = 0;
  for (size_t y = g.h / 4; y < (size_t)g.h * 3 / 4; y += 8)
    for (size_t x = g.w / 4; x < (size_t)g.w * 3 / 4; x += 8) {
      sum += g.px[y * g.w + x];
      n++;
    }
  return n ? sum / n : 0;
}

static const char* qrPathName(int path) {
  switch (path) {
    case QR_PATH_PLAIN: return "plain";
    case QR_PATH_MIRROR: return "mirrored";
    case QR_PATH_GRAY: return "gray-sampled";
    case QR_PATH_GRAY_MIRROR: return "gray-sampled mirrored";
    default: return "-";
  }
}

// ภาพลับขอบสำหรับรอบสองของ qrScanGray (จองใน PSRAM ครั้งเดียว โตตามกรอบที่ใหญ่สุด)
static uint8_t* sharpBuf = nullptr;
static size_t sharpCap = 0;

/**
 * อ่าน QR จากกรอบภาพเทา — กระบวนการทั้งหมดอยู่ใน qr_scan.h (ทดสอบบนคอมด้วย quirc ตัวเดียวกับในตู้ ดู firmware/test/qr_host)
 * ภาพจากกล้องตู้เป็นภาพกระจก → ตัวอ่านกลับด้านเอง · สุ่มจากภาพเทาเมื่อภาพเบลอ · รอบสองลับขอบเมื่อเจอ QR แต่ถอดไม่ได้
 */
static bool scanFrame(const GrayImg& g, struct quirc* decoder, bool fullFrame, String& text, bool& foundShape) {
  const int frameWidth = g.w;
  const int frameHeight = g.h;
  const int scanWidth = fullFrame ? frameWidth : centerWidth(frameWidth);
  const int scanHeight = fullFrame ? frameHeight : centerHeight(frameHeight);
  const int offsetX = (frameWidth - scanWidth) / 2;
  const int offsetY = (frameHeight - scanHeight) / 2;
  const size_t need = static_cast<size_t>(scanWidth) * scanHeight;
  if (sharpCap < need) {
    free(sharpBuf);
    sharpBuf = static_cast<uint8_t*>(ps_malloc(need));
    sharpCap = sharpBuf ? need : 0;
  }

  QrScanInfo info;
  const int path = qrScanGray(decoder, g.px + static_cast<size_t>(offsetY) * frameWidth + offsetX, frameWidth, scanWidth, scanHeight,
                              sharpCap ? sharpBuf : nullptr, &code, &flippedCode, &data, &info);
  foundShape = info.grids > 0;
  lastShapePx = max(lastShapePx, info.widestPx);
  if (!path) {
    if (info.grids > 0) lastDecodeErr = QUIRC_ERROR_DATA_ECC;
    return false;
  }
  lastQrPath = path;
  lastQrPass = info.pass;
  text = String((const char*)data.payload).substring(0, data.payload_len);
  return text.length() > 0;
}

// ธง scanning ต้องลงให้ทุกทางออกของ cameraScanQr
struct ScanGuard {
  ScanGuard() { scanning = true; scanFrames = scanShapes = 0; }
  ~ScanGuard() { scanning = false; }
};

static bool previewDecode = true;
void cameraPreviewDecode(bool on) { previewDecode = on; }

bool cameraPreviewTick() {
  if (!running) return false;
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return false;
  String text;
  bool found = false;
  GrayImg g;
  const bool ok = toGray(fb, g);
  if (ok) {
    if (previewDecode) scanFrame(g, qr, false, text, found);
    previewStore(g, found, text);
  }
  esp_camera_fb_return(fb);
  return ok;
}

static void (*previewSink)(const uint8_t*, size_t) = nullptr;
static uint32_t previewIntervalMs = 2500;

void cameraSetPreviewSink(void (*sink)(const uint8_t*, size_t), uint32_t intervalMs) {
  previewSink = sink;
  previewIntervalMs = intervalMs;
}

QrRead cameraScanQr(uint32_t timeoutMs) {
  QrRead r;
  if (!running) return r;
  ScanGuard guard;
  lastShapePx = 0;
  lastBright = 0;
  const uint32_t start = millis();
  int frames = 0, framesWithShape = 0;
  uint32_t lastPreviewAt = start;  // ภาพแรกส่งหลังสแกนไปแล้ว 1 ช่วง
  quirc_decode_error_t lastErr = QUIRC_SUCCESS;
  while (millis() - start < timeoutMs) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
      delay(20);
      continue;
    }
    frames++;
    if (previewSink && millis() - lastPreviewAt >= previewIntervalMs) {
      if (fb->format == PIXFORMAT_JPEG) {
        previewSink(fb->buf, fb->len);  // JPEG ของเซนเซอร์ส่งตรง ไม่เข้ารหัสซ้ำ
      } else {
        uint8_t* jpg = nullptr;
        size_t jpgLen = 0;
        if (frame2jpg(fb, 40, &jpg, &jpgLen) && jpg) {
          previewSink(jpg, jpgLen);
          free(jpg);
        }
      }
      // นับช่วงจาก "ส่งเสร็จ": การส่ง 1 ภาพ (HTTPS ใหม่) กิน 2–4 วิ ถ้านับจากตอนเริ่มส่ง จะถึงกำหนดส่งอีกทันที กล้องแทบไม่ได้อ่าน QR
      lastPreviewAt = millis();
    }
    String text;
    bool found = false;
    GrayImg g;
    if (!toGray(fb, g)) {
      esp_camera_fb_return(fb);
      delay(20);
      continue;
    }
    lastBright = frameBrightness(g);
    const bool fullFrame = frames % QR_FULL_FRAME_INTERVAL == 0;
    const bool decoded = scanFrame(g, fullFrame ? qrFull : qr, fullFrame, text, found);
    previewStore(g, found, text);
    esp_camera_fb_return(fb);
    scanFrames = frames;
    debugViewPoll();  // ให้หน้าดูกล้องยังตอบได้ระหว่างอ่าน QR
    if (found) framesWithShape++;
    scanShapes = framesWithShape;
    if (found && !decoded) lastErr = lastDecodeErr;
    if (text.length()) {
      r.ok = true;
      r.text = text;
      r.ms = millis() - start;
      r.frames = static_cast<uint16_t>(frames);
      r.qrShapes = static_cast<uint16_t>(framesWithShape);
      r.widestPx = static_cast<uint16_t>(lastShapePx);
      r.brightness = lastBright;
      Serial.printf("[cam] QR in %u ms after %d frames · width %d px · %s%s\n", r.ms, frames, lastShapePx, lastQrPass == 2 ? "sharpened · " : "",
                    qrPathName(lastQrPath));
      return r;
    }
  }
  r.ms = millis() - start;
  r.frames = static_cast<uint16_t>(frames);
  r.qrShapes = static_cast<uint16_t>(framesWithShape);
  r.widestPx = static_cast<uint16_t>(lastShapePx);
  r.brightness = lastBright;
  r.err = lastErr ? quirc_strerror(lastErr) : "";
  Serial.printf("[cam] no QR in %u ms (%d frames · frames with a QR shape: %d · widest %d px · brightness %u · last decode error: %s)\n", r.ms, frames,
                framesWithShape, lastShapePx, (unsigned)lastBright, lastErr ? quirc_strerror(lastErr) : "-");
  return r;
}

// ── ถ่ายใบหน้า (Snapface) ─────────────────────────────────────────────────
/** ทิ้งเฟรมที่ถ่ายด้วยค่าก่อนหน้า · หยุดทันทีถ้ากล้องไม่ส่งภาพ */
static void discardFrames(uint8_t count) {
  for (uint8_t i = 0; i < count; i++) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) return;
    esp_camera_fb_return(fb);
  }
}

/** สลับกล้องจากโหมดสแกนเป็นโหมดถ่ายใบหน้า · ไฟส่อง (ถ้าเปิดอยู่จากตอนสแกน) คงไว้ตามเดิม */
bool cameraPreparePhoto() {
  if (running) {
    esp_camera_deinit();
    running = false;
  }
  photoMode = false;
  camera_config_t c = makeConfig();
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = PHOTO_FRAME_SIZE;
  c.jpeg_quality = PHOTO_QUALITY;
  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    pinMode(CAM_PIN_PWDN, OUTPUT);
    digitalWrite(CAM_PIN_PWDN, HIGH);
    delay(100);
    digitalWrite(CAM_PIN_PWDN, LOW);
    delay(300);
    err = esp_camera_init(&c);
  }
  if (err != ESP_OK) {
    Serial.printf("[cam] photo mode init failed 0x%x\n", err);
    return false;
  }
  if (sensor_t* sen = esp_camera_sensor_get()) {
    sen->set_whitebal(sen, 1);
    sen->set_awb_gain(sen, 1);
    sen->set_exposure_ctrl(sen, 1);
    sen->set_gain_ctrl(sen, 1);
    sen->set_gainceiling(sen, GAINCEILING_8X);
    sen->set_vflip(sen, settings.camFlip & 1);
    sen->set_hmirror(sen, (settings.camFlip >> 1) & 1);
  }
  running = true;
  photoMode = true;
  photoQuality = PHOTO_QUALITY;
  const uint32_t start = millis();
  for (uint8_t i = 0; i < PHOTO_SETTLE_FRAMES && millis() - start < PHOTO_SETTLE_MAX_MS; i++) {
    esp_task_wdt_reset();
    discardFrames(1);
  }
  return true;
}

/** ถ่ายหลายเฟรมแล้วเก็บ JPEG ที่ใหญ่สุด (รายละเอียดมากสุด = เบลอน้อยสุด) · เกินขนาดที่ส่งได้ → ลดคุณภาพแล้วถ่ายใหม่ */
static bool capturePhoto(uint8_t** out, size_t* len) {
  uint8_t* best = (uint8_t*)ps_malloc(PHOTO_MAX_BYTES);
  if (!best) return false;
  size_t bestLen = 0;
  uint8_t kept = 0;
  sensor_t* sen = esp_camera_sensor_get();
  for (uint8_t grab = 0; grab < PHOTO_MAX_GRABS && kept < PHOTO_FRAMES; grab++) {
    esp_task_wdt_reset();
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) continue;
    const bool isJpeg = fb->format == PIXFORMAT_JPEG && fb->len > 2 && fb->buf[0] == 0xFF && fb->buf[1] == 0xD8;
    if (isJpeg && fb->len <= PHOTO_MAX_BYTES) {
      kept++;
      if (fb->len > bestLen) {
        memcpy(best, fb->buf, fb->len);
        bestLen = fb->len;
      }
      esp_camera_fb_return(fb);
      continue;
    }
    esp_camera_fb_return(fb);
    if (isJpeg && sen && photoQuality < PHOTO_QUALITY_MAX) {
      photoQuality = min(photoQuality + PHOTO_QUALITY_STEP, PHOTO_QUALITY_MAX);
      sen->set_quality(sen, photoQuality);
      discardFrames(2);
    }
  }
  if (!bestLen) {
    free(best);
    return false;
  }
  *out = best;
  *len = bestLen;
  Serial.printf("[cam] photo %u B · quality %d · frames %u\n", (unsigned)bestLen, photoQuality, kept);
  return true;
}

bool cameraSnapshotJpeg(uint8_t** out, size_t* len) {
  if (running && photoMode) return capturePhoto(out, len);
  bool started = !running && cameraStart();
  if (!running) return false;
  camera_fb_t* fb = esp_camera_fb_get();
  bool ok = false;
  if (fb && fb->format == PIXFORMAT_JPEG) {
    *out = (uint8_t*)malloc(fb->len);
    if (*out) {
      memcpy(*out, fb->buf, fb->len);
      *len = fb->len;
      ok = true;
    }
  } else if (fb) {
    ok = frame2jpg(fb, 80, out, len);
  }
  if (fb) esp_camera_fb_return(fb);
  if (started) cameraStop();
  return ok;
}

void cameraDumpFrame() {
  const bool wasRunning = cameraRunning();
  if (!wasRunning && !cameraStart()) {
    Serial.println("snap: camera start failed");
    return;
  }
  for (int i = 0; i < 4; i++) {  // ให้แสงนิ่งก่อน
    camera_fb_t* skip = esp_camera_fb_get();
    if (skip) esp_camera_fb_return(skip);
  }
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("snap: no frame");
  } else {
    GrayImg g;
    if (!toGray(fb, g)) {
      Serial.println("snap: cannot decode frame");
      esp_camera_fb_return(fb);
      if (!wasRunning) cameraStop();
      return;
    }
    const int step = (g.w + 319) / 320;  // ย่อให้กว้างไม่เกิน 320
    const int w = g.w / step, h = g.h / step;
    Serial.printf("SNAP %d %d\n", w, h);
    char line[2 * 320 + 2];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) sprintf(line + 2 * x, "%02x", g.px[(y * step) * g.w + x * step]);
      Serial.println(line);
    }
    Serial.println("SNAPEND");
    esp_camera_fb_return(fb);
  }
  if (!wasRunning) cameraStop();
}

// ── ภาพดิบ (ไว้ดูกล้องจริง ๆ ไม่ผ่านตัวกรอง) ──────────────────────────────
// JPEG ฮาร์ดแวร์ของเซนเซอร์เอง: ไม่กลับภาพ ไม่ปรับ sharpness/contrast/ae ไม่แปลงเทา ไม่เข้ารหัสซ้ำ
bool cameraRawBegin() {
  if (running) {
    esp_camera_deinit();
    running = false;
  }
  camera_config_t c = makeConfig();
  c.pixel_format = PIXFORMAT_JPEG;
  c.jpeg_quality = settings.camQ;
  c.fb_count = 2;
  c.grab_mode = CAMERA_GRAB_LATEST;
  const esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) Serial.printf("[cam] raw init failed 0x%x\n", err);
  // ภาพดิบ: ใช้ sharpness/ae ชุดเดียวกับตอนสแกนเพื่อให้เห็นตรงกัน (ไม่กลับภาพ ไม่ปรับ contrast)
  if (err == ESP_OK) {
    if (sensor_t* sen = esp_camera_sensor_get()) {
      sen->set_sharpness(sen, settings.camSharp);
      sen->set_ae_level(sen, settings.camAe);
      sen->set_vflip(sen, settings.camFlip & 1);
      sen->set_hmirror(sen, (settings.camFlip >> 1) & 1);
    }
  }
  return err == ESP_OK;
}

void cameraRawEnd() { esp_camera_deinit(); }

void cameraBench() {
  const char* sizes[] = {"qvga", "vga", "svga"};
  const String keep = settings.camSize;
  for (const char* sz : sizes) {
    settings.camSize = sz;
    if (running) {
      esp_camera_deinit();
      running = false;
    }
    if (!cameraStart()) {
      Serial.printf("bench %s: camera failed\n", sz);
      continue;
    }
    uint32_t tGrab = 0, tGray = 0, tQr = 0;
    int n = 0, shapes = 0, decoded = 0, w = 0, h = 0;
    for (int i = 0; i < 12; i++) {
      esp_task_wdt_reset();
      const uint32_t t0 = millis();
      camera_fb_t* fb = esp_camera_fb_get();
      const uint32_t t1 = millis();
      if (!fb) continue;
      GrayImg g;
      const bool ok = toGray(fb, g);
      const uint32_t t2 = millis();
      String text;
      bool found = false;
      if (ok) {
        w = g.w;
        h = g.h;
        scanFrame(g, qr, false, text, found);
      }
      const uint32_t t3 = millis();
      esp_camera_fb_return(fb);
      tGrab += t1 - t0;
      tGray += t2 - t1;
      tQr += t3 - t2;
      n++;
      if (found) shapes++;
      if (text.length()) decoded++;
    }
    if (n) {
      const float perFrame = (float)(tGrab + tGray + tQr) / n;
      Serial.printf("bench %s %dx%d: grab %u ms · jpeg->gray %u ms · quirc %u ms · total %.0f ms = %.1f fps · QR shape %d/%d · decoded %d\n", sz, w, h,
                    tGrab / n, tGray / n, tQr / n, perFrame, 1000.0f / perFrame, shapes, n, decoded);
    }
    esp_camera_deinit();
    running = false;
  }
  settings.camSize = keep;  // ไม่บันทึก
}
