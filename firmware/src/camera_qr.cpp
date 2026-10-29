#include "camera_qr.h"

#include <esp_camera.h>

#include "board.h"
#include "quirc/quirc.h"
#include "img_converters.h"
#include <ArduinoJson.h>

#include "debugview.h"

static constexpr int QR_CENTER_WIDTH = 480;
static constexpr int QR_CENTER_HEIGHT = 400;
static constexpr uint8_t QR_FULL_FRAME_INTERVAL = 4;

static bool running = false;
static struct quirc* qr = nullptr;
static struct quirc* qrFull = nullptr;
static bool flashOn = false;

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

static void previewStore(camera_fb_t* fb, bool shape, const String& text) {
  const size_t need = (size_t)fb->width * fb->height;
  if (!prevBuf || prevCap < need) {
    free(prevBuf);
    prevBuf = (uint8_t*)ps_malloc(need);
    prevCap = prevBuf ? need : 0;
  }
  if (!prevBuf) return;
  memcpy(prevBuf, fb->buf, need);
  prevW = fb->width;
  prevH = fb->height;
  uint32_t sum = 0, n = 0;
  for (size_t y = fb->height / 4; y < fb->height * 3 / 4; y += 8)
    for (size_t x = fb->width / 4; x < fb->width * 3 / 4; x += 8) {
      sum += fb->buf[y * fb->width + x];
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
  d["crop_w"] = min<int>(prevW, QR_CENTER_WIDTH);
  d["crop_h"] = min<int>(prevH, QR_CENTER_HEIGHT);
  String out;
  serializeJson(d, out);
  return out;
}

bool cameraStart() {
  if (running) return true;
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
  c.xclk_freq_hz = 10000000;
  c.ledc_timer = LEDC_TIMER_0;
  c.ledc_channel = LEDC_CHANNEL_0;
  // ขาวดำ VGA: QR ประจำตัว (~100 ตัวอักษร) จากจอมือถือระยะ 15–30 ซม. ต้องการความละเอียดพอสมควร
  c.pixel_format = PIXFORMAT_GRAYSCALE;
  c.frame_size = FRAMESIZE_VGA;
  c.jpeg_quality = 12;
  c.fb_count = 2;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;
  esp_err_t err = esp_camera_init(&c);
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
  // ภาพจากเซนเซอร์บนบอร์ดนี้กลับซ้าย-ขวา → กลับให้ถูกที่เซนเซอร์ (QR กลับด้านถอดไม่ได้)
  if (sensor_t* sen = esp_camera_sensor_get()) {
    sen->set_hmirror(sen, 1);
    sen->set_sharpness(sen, 2);
    sen->set_contrast(sen, 1);
  }
  running = true;
  // ทิ้ง 2 เฟรมแรก (รับแสงยังไม่นิ่ง)
  for (int i = 0; i < 2; i++) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }
  return true;
}

void flashOff() {
  digitalWrite(PIN_FLASH_LED, LOW);
  flashOn = false;
}

void cameraStop() {
  flashOff();
  if (!running || held) return;
  esp_camera_deinit();
  running = false;
}

bool cameraAutoFlash(bool allowed) {
  if (!running || !allowed) {
    flashOff();
    return false;
  }
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return flashOn;
  // ค่าความสว่างเฉลี่ยตรงกลางภาพ (สุ่มทุก 8 พิกเซล)
  uint32_t sum = 0, n = 0;
  for (size_t y = fb->height / 4; y < fb->height * 3 / 4; y += 8)
    for (size_t x = fb->width / 4; x < fb->width * 3 / 4; x += 8) {
      sum += fb->buf[y * fb->width + x];
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

/** ถอด QR ใน quirc ตอนนี้ · ok = ได้ข้อความ */
static quirc_decode_error_t lastDecodeErr = QUIRC_SUCCESS;

// quirc_code + quirc_data ~13 KB — ไว้นอก stack (stack ของ loop มี 8 KB เคยล้นจนบอร์ดรีสตาร์ต)
static struct quirc_code code;
static struct quirc_data data;

static bool decodeAll(String& out) {
  int count = quirc_count(qr);
  for (int i = 0; i < count; i++) {
    quirc_extract(qr, i, &code);
    quirc_decode_error_t e = quirc_decode(&code, &data);
    if (e != QUIRC_SUCCESS) lastDecodeErr = e;
    if (e == QUIRC_SUCCESS) {
      out = String((const char*)data.payload).substring(0, data.payload_len);
      return true;
    }
  }
  return false;
}

static bool scanFrame(camera_fb_t* fb, struct quirc* decoder, bool fullFrame, String& text, bool& foundShape) {
  const int frameWidth = static_cast<int>(fb->width);
  const int frameHeight = static_cast<int>(fb->height);
  const int scanWidth = fullFrame ? frameWidth : min(frameWidth, QR_CENTER_WIDTH);
  const int scanHeight = fullFrame ? frameHeight : min(frameHeight, QR_CENTER_HEIGHT);
  const int offsetX = (frameWidth - scanWidth) / 2;
  const int offsetY = (frameHeight - scanHeight) / 2;
  if (quirc_resize(decoder, scanWidth, scanHeight) < 0) return false;

  int width = 0;
  int height = 0;
  uint8_t* image = quirc_begin(decoder, &width, &height);
  for (int y = 0; y < height; y++) {
    memcpy(image + static_cast<size_t>(y) * width,
           fb->buf + static_cast<size_t>(offsetY + y) * frameWidth + offsetX,
           width);
  }
  quirc_end(decoder);
  foundShape = quirc_count(decoder) > 0;
  if (!foundShape) return false;

  struct quirc* previous = qr;
  qr = decoder;
  const bool decoded = decodeAll(text);
  if (!decoded) {
    // บางเลนส์ให้ภาพกลับซ้าย-ขวา จึงลองถอดภาพกลับด้านอีกครั้ง
    image = quirc_begin(decoder, &width, &height);
    for (int y = 0; y < height; y++) {
      uint8_t* row = image + static_cast<size_t>(y) * width;
      for (int x = 0; x < width / 2; x++) std::swap(row[x], row[width - 1 - x]);
    }
    quirc_end(decoder);
    decodeAll(text);
  }
  qr = previous;
  return text.length() > 0;
}

// ธง scanning ต้องลงให้ทุกทางออกของ cameraScanQr
struct ScanGuard {
  ScanGuard() { scanning = true; scanFrames = scanShapes = 0; }
  ~ScanGuard() { scanning = false; }
};

bool cameraPreviewTick() {
  if (!running) return false;
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return false;
  String text;
  bool found = false;
  scanFrame(fb, qr, false, text, found);
  previewStore(fb, found, text);
  esp_camera_fb_return(fb);
  return true;
}

QrRead cameraScanQr(uint32_t timeoutMs) {
  QrRead r;
  if (!running) return r;
  ScanGuard guard;
  const uint32_t start = millis();
  int frames = 0, framesWithShape = 0;
  quirc_decode_error_t lastErr = QUIRC_SUCCESS;
  while (millis() - start < timeoutMs) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
      delay(20);
      continue;
    }
    frames++;
    String text;
    bool found = false;
    const bool fullFrame = frames % QR_FULL_FRAME_INTERVAL == 0;
    const bool decoded = scanFrame(fb, fullFrame ? qrFull : qr, fullFrame, text, found);
    previewStore(fb, found, text);
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
      Serial.printf("[cam] QR in %u ms after %d frames: %.60s\n", r.ms, frames, text.c_str());
      return r;
    }
  }
  r.ms = millis() - start;
  r.frames = static_cast<uint16_t>(frames);
  r.qrShapes = static_cast<uint16_t>(framesWithShape);
  Serial.printf("[cam] no QR in %u ms (%d frames · frames with a QR shape: %d · last decode error: %s)\n", r.ms, frames, framesWithShape,
                lastErr ? quirc_strerror(lastErr) : "-");
  return r;
}

bool cameraSnapshotJpeg(uint8_t** out, size_t* len) {
  bool started = !running && cameraStart();
  if (!running) return false;
  camera_fb_t* fb = esp_camera_fb_get();
  bool ok = fb && frame2jpg(fb, 80, out, len);
  if (fb) esp_camera_fb_return(fb);
  if (started) cameraStop();
  return ok;
}
