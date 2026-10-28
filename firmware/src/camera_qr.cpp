#include "camera_qr.h"

#include <esp_camera.h>

#include "board.h"
#include "quirc/quirc.h"
#include "img_converters.h"

static bool running = false;
static struct quirc* qr = nullptr;
static bool flashOn = false;

bool cameraRunning() { return running; }

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
  if (!qr) {
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
  if (!running) return;
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

QrRead cameraScanQr(uint32_t timeoutMs) {
  QrRead r;
  if (!running) return r;
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
    if (quirc_resize(qr, fb->width, fb->height) < 0) {
      esp_camera_fb_return(fb);
      Serial.println("[cam] quirc_resize failed (no memory)");
      break;
    }
    int w = 0, h = 0;
    uint8_t* img = quirc_begin(qr, &w, &h);
    memcpy(img, fb->buf, (size_t)w * h);
    esp_camera_fb_return(fb);
    quirc_end(qr);
    String text;
    bool found = quirc_count(qr) > 0;
    if (found) framesWithShape++;
    if (found && !decodeAll(text)) {
      // ภาพกลับด้านซ้าย-ขวา (กระจก) ถอดไม่ได้ → กลับภาพแล้วลองอีกครั้ง
      img = quirc_begin(qr, &w, &h);
      for (int y = 0; y < h; y++) {
        uint8_t* row = img + (size_t)y * w;
        for (int x = 0; x < w / 2; x++) std::swap(row[x], row[w - 1 - x]);
      }
      quirc_end(qr);
      decodeAll(text);
      lastErr = lastDecodeErr;
    }
    if (text.length()) {
      r.ok = true;
      r.text = text;
      r.ms = millis() - start;
      Serial.printf("[cam] QR in %u ms after %d frames: %.60s\n", r.ms, frames, text.c_str());
      return r;
    }
  }
  r.ms = millis() - start;
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
