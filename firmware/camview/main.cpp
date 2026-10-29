// SMMB — เฟิร์มแวร์ "ดูกล้องล้วน ๆ" ไว้ทดสอบกล้อง (แยกจากเฟิร์มแวร์ตู้ตัวจริง)
// ต่อ Wi-Fi (ใช้ค่าที่ตู้ตัวจริงบันทึกไว้ใน NVS) → สตรีมภาพดิบ MJPEG จากเซนเซอร์ · ไม่มี backend/สแกน/long-poll/ส่งอะไรออกเน็ต
// หน้าดู + แผงปรับค่า: http://<IP>/  ·  สตรีม: http://<IP>:81/stream  ·  สถานะ: /stat  ·  ปรับ: /set?size=xga&q=8&sharp=2 ...
// (ในวง LAN เท่านั้น ไม่มีรหัส) · ค่าเริ่มต้น native: JPEG ฮาร์ดแวร์ของเซนเซอร์ ไม่ปรับอะไรเพิ่ม
// build/flash:  pio run -e camview -t upload   (เฟิร์มแวร์ตู้ตัวจริง: pio run -e esp32cam -t upload)
#include <Arduino.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_camera.h>
#include <img_converters.h>

#include "board.h"
#include "quirc/quirc.h"

static WebServer web(80);
static WiFiServer streamSrv(81);

struct Cfg {
  String size = "xga";
  int q = 10;        // JPEG 4..30 (เลขน้อย = คมกว่า ไฟล์ใหญ่กว่า)
  int xclk = 20;     // MHz
  int sharp = 0;     // -2..2
  int contrast = 0;  // -2..2
  int bright = 0;    // -2..2
  int sat = 0;       // -2..2
  int ae = 0;        // -2..2
  int gain = 6;      // เพดานเกน 0=2x .. 6=128x (6 = ค่าเริ่มต้นของเซนเซอร์)
  bool mirror = false;
  bool flip = false;
  int fps = 0;       // จำกัด FPS (0 = เต็มที่)
  bool qr = true;    // ตรวจจับ QR + วาดกรอบ
  int qrms = 300;    // ตรวจทุกกี่ ms (100..2000)
};
static Cfg cfg;

static float fpsNow = 0;
static uint32_t kbPerFrame = 0;
static uint16_t frameW = 0, frameH = 0;
static bool needRestart = true;  // ตั้งค่ากล้องใหม่ทั้งชุด (เปลี่ยน xclk)
static bool needApply = false;   // ปรับค่าสด ๆ (ไม่ต้องเริ่มกล้องใหม่)

static framesize_t sizeEnum() {
  if (cfg.size == "qvga") return FRAMESIZE_QVGA;
  if (cfg.size == "vga") return FRAMESIZE_VGA;
  if (cfg.size == "svga") return FRAMESIZE_SVGA;
  if (cfg.size == "sxga") return FRAMESIZE_SXGA;
  if (cfg.size == "uxga") return FRAMESIZE_UXGA;
  return FRAMESIZE_XGA;
}

static void saveCfg() {
  Preferences p;
  if (!p.begin("camview", false)) return;
  p.putString("size", cfg.size);
  p.putInt("q", cfg.q);
  p.putInt("xclk", cfg.xclk);
  p.putInt("sharp", cfg.sharp);
  p.putInt("contrast", cfg.contrast);
  p.putInt("bright", cfg.bright);
  p.putInt("sat", cfg.sat);
  p.putInt("ae", cfg.ae);
  p.putInt("gain", cfg.gain);
  p.putBool("mir", cfg.mirror);
  p.putBool("flip", cfg.flip);
  p.putInt("fps", cfg.fps);
  p.putBool("qr", cfg.qr);
  p.putInt("qrms", cfg.qrms);
  p.end();
}

static void loadCfg() {
  Preferences p;
  if (!p.begin("camview", true)) return;
  cfg.size = p.getString("size", "xga");
  cfg.q = p.getInt("q", 10);
  cfg.xclk = p.getInt("xclk", 20);
  cfg.sharp = p.getInt("sharp", 0);
  cfg.contrast = p.getInt("contrast", 0);
  cfg.bright = p.getInt("bright", 0);
  cfg.sat = p.getInt("sat", 0);
  cfg.ae = p.getInt("ae", 0);
  cfg.gain = p.getInt("gain", 6);
  cfg.mirror = p.getBool("mir", false);
  cfg.flip = p.getBool("flip", false);
  cfg.fps = p.getInt("fps", 0);
  cfg.qr = p.getBool("qr", true);
  cfg.qrms = p.getInt("qrms", 300);
  p.end();
}

// ── ตรวจจับ QR (quirc) แล้วส่งพิกัดมุมไปวาดกรอบที่หน้าเว็บ ─────────────────────────────
// ถอด JPEG แบบย่อ (1/2, 1/4, 1/8) ให้กว้างไม่เกิน ~400 พิกเซล → เบาพอจะตรวจทุก 100–2000 ms โดย FPS ไม่ตกมาก
struct QrInfo {
  bool found = false;
  bool decoded = false;
  bool mirrored = false;
  String text;
  float corner[4][2] = {{0, 0}, {0, 0}, {0, 0}, {0, 0}};  // 0..1 เทียบทั้งภาพ
  uint32_t ms = 0;     // เวลาที่ใช้ตรวจรอบล่าสุด
  uint32_t at = 0;     // millis() ตอนตรวจ
  uint32_t seenAt = 0; // millis() ที่เห็น QR ครั้งล่าสุด
  uint16_t gw = 0, gh = 0;
  uint32_t runs = 0, hits = 0;
};
static QrInfo qrInfo;
static struct quirc* quircCtx = nullptr;
static uint8_t* grayBuf = nullptr;
static const size_t GRAY_CAP = 400 * 300;
static struct quirc_code qcode;
static struct quirc_data qdata;
static uint32_t tDetectTotal = 0, tSendTotal = 0;  // รวมต่อรอบสถิติ (ไว้คำนวณ CPU busy)

struct JpgCtx {
  const uint8_t* buf;
  size_t len;
  uint8_t* gray;
  int gw, gh;
};
static size_t jpgRead(void* arg, size_t index, uint8_t* buf, size_t len) {
  JpgCtx* c = (JpgCtx*)arg;
  if (index >= c->len) return 0;
  if (index + len > c->len) len = c->len - index;
  if (buf) memcpy(buf, c->buf + index, len);
  return len;
}
static bool jpgWrite(void* arg, uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint8_t* data) {
  JpgCtx* c = (JpgCtx*)arg;
  if (!data) {  // เริ่ม/จบ: เริ่มบอกขนาดภาพผลลัพธ์
    if (x == 0 && y == 0) {
      c->gw = w;
      c->gh = h;
      if ((size_t)w * h > GRAY_CAP) return false;
    }
    return true;
  }
  for (uint16_t j = 0; j < h && y + j < c->gh; j++) {
    uint8_t* row = c->gray + (size_t)(y + j) * c->gw + x;
    const uint8_t* src = data + (size_t)j * w * 3;
    for (uint16_t i = 0; i < w && x + i < c->gw; i++) row[i] = (src[3 * i] + 2 * src[3 * i + 1] + src[3 * i + 2]) >> 2;  // ไม่ขึ้นกับลำดับ R/B
  }
  return true;
}

static void detectQr(camera_fb_t* fb) {
  if (fb->format != PIXFORMAT_JPEG) return;
  if (!quircCtx) quircCtx = quirc_new();
  if (!grayBuf) grayBuf = (uint8_t*)ps_malloc(GRAY_CAP);
  if (!quircCtx || !grayBuf) return;
  const uint32_t t0 = millis();
  int k = 0;
  while (k < 3 && (fb->width >> k) > 400) k++;
  JpgCtx c = {fb->buf, fb->len, grayBuf, 0, 0};
  if (esp_jpg_decode(fb->len, (jpg_scale_t)k, jpgRead, jpgWrite, &c) != ESP_OK || !c.gw || !c.gh) return;
  if (quirc_resize(quircCtx, c.gw, c.gh) < 0) return;
  int w = 0, h = 0;
  uint8_t* img = quirc_begin(quircCtx, &w, &h);
  memcpy(img, grayBuf, (size_t)w * h);
  quirc_end(quircCtx);

  bool found = false, decoded = false, mirrored = false;
  String text;
  float cx[4] = {0}, cy[4] = {0};
  if (quirc_count(quircCtx) > 0) {
    found = true;
    quirc_extract(quircCtx, 0, &qcode);
    for (int i = 0; i < 4; i++) {
      cx[i] = qcode.corners[i].x;
      cy[i] = qcode.corners[i].y;
    }
    if (quirc_decode(&qcode, &qdata) == QUIRC_SUCCESS) {
      decoded = true;
      text = String((const char*)qdata.payload).substring(0, 60);
    } else {
      // ภาพกลับซ้าย-ขวา → ลองถอดรหัสภาพกลับด้านอีกครั้ง
      img = quirc_begin(quircCtx, &w, &h);
      for (int y = 0; y < h; y++) {
        uint8_t* row = img + (size_t)y * w;
        for (int x = 0; x < w / 2; x++) std::swap(row[x], row[w - 1 - x]);
      }
      quirc_end(quircCtx);
      if (quirc_count(quircCtx) > 0) {
        quirc_extract(quircCtx, 0, &qcode);
        if (quirc_decode(&qcode, &qdata) == QUIRC_SUCCESS) {
          decoded = true;
          mirrored = true;
          text = String((const char*)qdata.payload).substring(0, 60);
          for (int i = 0; i < 4; i++) {
            cx[i] = w - 1 - qcode.corners[i].x;
            cy[i] = qcode.corners[i].y;
          }
        }
      }
    }
  }
  qrInfo.runs++;
  qrInfo.found = found;
  qrInfo.decoded = decoded;
  qrInfo.mirrored = mirrored;
  qrInfo.text = text;
  qrInfo.gw = w;
  qrInfo.gh = h;
  if (found) {
    for (int i = 0; i < 4; i++) {
      qrInfo.corner[i][0] = cx[i] / w;
      qrInfo.corner[i][1] = cy[i] / h;
    }
    qrInfo.hits++;
    qrInfo.seenAt = millis();
  }
  qrInfo.at = millis();
  qrInfo.ms = millis() - t0;
  tDetectTotal += qrInfo.ms;
}

// ปรับค่าที่เซนเซอร์ทันที — ตัวไหนเซนเซอร์รุ่นนี้ไม่รองรับ (pointer ว่าง) จะข้ามไป · caps ใน /stat บอกว่าตัวไหนใช้ได้
static void applyLive() {
  sensor_t* s = esp_camera_sensor_get();
  if (!s) return;
  if (s->set_framesize) s->set_framesize(s, sizeEnum());
  if (s->set_quality) s->set_quality(s, cfg.q);
  if (s->set_sharpness) s->set_sharpness(s, cfg.sharp);
  if (s->set_contrast) s->set_contrast(s, cfg.contrast);
  if (s->set_brightness) s->set_brightness(s, cfg.bright);
  if (s->set_saturation) s->set_saturation(s, cfg.sat);
  if (s->set_ae_level) s->set_ae_level(s, cfg.ae);
  if (s->set_gainceiling) s->set_gainceiling(s, (gainceiling_t)cfg.gain);
  if (s->set_hmirror) s->set_hmirror(s, cfg.mirror ? 1 : 0);
  if (s->set_vflip) s->set_vflip(s, cfg.flip ? 1 : 0);
}

static bool cameraRestart() {
  esp_camera_deinit();
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
  c.xclk_freq_hz = (uint32_t)cfg.xclk * 1000000u;
  c.ledc_timer = LEDC_TIMER_0;
  c.ledc_channel = LEDC_CHANNEL_0;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_UXGA;  // จองบัฟเฟอร์ขนาดใหญ่สุดไว้ก่อน แล้วลดขนาดสด ๆ ได้โดยไม่ต้องเริ่มกล้องใหม่
  c.jpeg_quality = cfg.q;
  c.fb_count = 2;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;
  esp_err_t err = esp_camera_init(&c);
  for (int retry = 0; err != ESP_OK && retry < 2; retry++) {  // ปิด-เปิดเซนเซอร์แล้วลองใหม่
    Serial.printf("camera init failed 0x%x — power-cycling (retry %d)\n", err, retry + 1);
    pinMode(CAM_PIN_PWDN, OUTPUT);
    digitalWrite(CAM_PIN_PWDN, HIGH);
    delay(100);
    digitalWrite(CAM_PIN_PWDN, LOW);
    delay(300);
    err = esp_camera_init(&c);
  }
  if (err != ESP_OK) {
    Serial.printf("camera init failed 0x%x\n", err);
    return false;
  }
  applyLive();
  Serial.printf("camera ok: size=%s q=%d xclk=%dMHz sharp=%d contrast=%d bright=%d sat=%d ae=%d gain=%d mirror=%d flip=%d fps_cap=%d\n", cfg.size.c_str(),
                cfg.q, cfg.xclk, cfg.sharp, cfg.contrast, cfg.bright, cfg.sat, cfg.ae, cfg.gain, cfg.mirror, cfg.flip, cfg.fps);
  return true;
}

static float tSendAvg = 0, tDetectAvg = 0, tGrabAvg = 0;
static int busyPct = 0;

static String stateJson() {
  sensor_t* s = esp_camera_sensor_get();
  String j = "{\"w\":" + String(frameW) + ",\"h\":" + frameH + ",\"fps\":" + String(fpsNow, 1) + ",\"kb\":" + kbPerFrame + ",\"rssi\":" + WiFi.RSSI();
  j += ",\"size\":\"" + cfg.size + "\",\"q\":" + cfg.q + ",\"xclk\":" + cfg.xclk + ",\"sharp\":" + cfg.sharp + ",\"contrast\":" + cfg.contrast;
  j += ",\"bright\":" + String(cfg.bright) + ",\"sat\":" + cfg.sat + ",\"ae\":" + cfg.ae + ",\"gain\":" + cfg.gain;
  j += String(",\"mirror\":") + (cfg.mirror ? "true" : "false") + ",\"flip\":" + (cfg.flip ? "true" : "false") + ",\"fpscap\":" + cfg.fps;
  j += String(",\"caps\":{\"sharp\":") + ((s && s->set_sharpness) ? "true" : "false") + ",\"contrast\":" + ((s && s->set_contrast) ? "true" : "false") +
       ",\"bright\":" + ((s && s->set_brightness) ? "true" : "false") + ",\"sat\":" + ((s && s->set_saturation) ? "true" : "false") + ",\"ae\":" +
       ((s && s->set_ae_level) ? "true" : "false") + ",\"gain\":" + ((s && s->set_gainceiling) ? "true" : "false") + "}";
  j += String(",\"sensor_pid\":") + (s ? s->id.PID : 0);
  // ตรวจจับ QR
  const uint32_t now = millis();
  j += String(",\"qr\":{\"on\":") + (cfg.qr ? "true" : "false") + ",\"ms_every\":" + cfg.qrms + ",\"found\":" +
       ((qrInfo.found && now - qrInfo.at < 3000) ? "true" : "false") + ",\"decoded\":" + ((qrInfo.decoded && now - qrInfo.at < 3000) ? "true" : "false") +
       ",\"mirrored\":" + (qrInfo.mirrored ? "true" : "false") + ",\"detect_ms\":" + qrInfo.ms + ",\"age_ms\":" + (qrInfo.at ? now - qrInfo.at : -1) +
       ",\"seen_ago_ms\":" + (qrInfo.seenAt ? (int32_t)(now - qrInfo.seenAt) : -1) + ",\"runs\":" + qrInfo.runs + ",\"hits\":" + qrInfo.hits +
       ",\"gray\":\"" + qrInfo.gw + "x" + qrInfo.gh + "\",\"text\":\"";
  for (size_t i = 0; i < qrInfo.text.length(); i++) {  // escape ข้อความ
    const char ch = qrInfo.text[i];
    if (ch == '"' || ch == '\\') j += '\\';
    if ((uint8_t)ch >= 32) j += ch;
  }
  j += "\",\"corners\":[";
  for (int i = 0; i < 4; i++) j += String(i ? "," : "") + "[" + String(qrInfo.corner[i][0], 4) + "," + String(qrInfo.corner[i][1], 4) + "]";
  j += "]}";
  // ทรัพยากรของ ESP
  j += String(",\"sys\":{\"cpu_mhz\":") + getCpuFrequencyMhz() + ",\"temp_c\":" + String(temperatureRead(), 0) + ",\"uptime_s\":" + (now / 1000) +
       ",\"heap_free\":" + ESP.getFreeHeap() + ",\"heap_min\":" + ESP.getMinFreeHeap() + ",\"heap_max_block\":" + ESP.getMaxAllocHeap() +
       ",\"heap_size\":" + ESP.getHeapSize() + ",\"psram_free\":" + ESP.getFreePsram() + ",\"psram_size\":" + ESP.getPsramSize() +
       ",\"stack_free\":" + uxTaskGetStackHighWaterMark(nullptr) + ",\"wifi_ch\":" + WiFi.channel() + ",\"busy_pct\":" + busyPct + ",\"t_send_ms\":" +
       String(tSendAvg, 1) + ",\"t_detect_ms\":" + String(tDetectAvg, 1) + ",\"t_grab_ms\":" + String(tGrabAvg, 1) + ",\"sketch_kb\":" +
       (ESP.getSketchSize() / 1024) + "}}";
  return j;
}

static void sendJson(const String& body) {
  web.sendHeader("Access-Control-Allow-Origin", "*");
  web.sendHeader("Cache-Control", "no-store");
  web.send(200, "application/json", body);
}

static bool argInt(const char* name, int lo, int hi, int& out) {
  if (!web.hasArg(name)) return false;
  const int v = web.arg(name).toInt();
  if (v < lo || v > hi) return false;
  out = v;
  return true;
}

static void handleSet() {
  int v;
  bool changed = false, restart = false;
  if (web.hasArg("size")) {
    const String sz = web.arg("size");
    if (sz == "qvga" || sz == "vga" || sz == "svga" || sz == "xga" || sz == "sxga" || sz == "uxga") {
      cfg.size = sz;
      changed = true;
    }
  }
  if (argInt("q", 4, 30, v)) { cfg.q = v; changed = true; }
  if (argInt("xclk", 10, 20, v) && (v == 10 || v == 20)) {
    restart = restart || v != cfg.xclk;
    cfg.xclk = v;
    changed = true;
  }
  if (argInt("sharp", -2, 2, v)) { cfg.sharp = v; changed = true; }
  if (argInt("contrast", -2, 2, v)) { cfg.contrast = v; changed = true; }
  if (argInt("bright", -2, 2, v)) { cfg.bright = v; changed = true; }
  if (argInt("sat", -2, 2, v)) { cfg.sat = v; changed = true; }
  if (argInt("ae", -2, 2, v)) { cfg.ae = v; changed = true; }
  if (argInt("gain", 0, 6, v)) { cfg.gain = v; changed = true; }
  if (argInt("mirror", 0, 1, v)) { cfg.mirror = v; changed = true; }
  if (argInt("flip", 0, 1, v)) { cfg.flip = v; changed = true; }
  if (argInt("fps", 0, 60, v)) { cfg.fps = v; changed = true; }
  if (argInt("qr", 0, 1, v)) { cfg.qr = v; changed = true; }
  if (argInt("qrms", 100, 2000, v)) { cfg.qrms = v; changed = true; }
  if (changed) {
    saveCfg();
    if (restart) needRestart = true;
    else needApply = true;
  }
  sendJson(stateJson());
}

static const char PAGE[] PROGMEM = R"HTML(<!doctype html><meta charset="utf-8"><title>SMMB camera view</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;background:#000;color:#ddd;font:13px system-ui,sans-serif;height:100%}
#wrap{display:flex;height:100%}#view{flex:1;display:flex;align-items:center;justify-content:center;min-width:0}
img{display:block;max-width:100%;max-height:100vh}#box{position:relative;line-height:0}#ov{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.kv{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;font:12px monospace}.kv b{color:#fff;font-weight:400;text-align:right}.bar{height:6px;background:#333;border-radius:3px;margin:1px 0 3px}.bar i{display:block;height:100%;background:#0f0;border-radius:3px}
#panel{width:280px;background:#111;padding:10px 12px;overflow:auto;border-left:1px solid #333}
#st{position:fixed;left:8px;top:8px;color:#0f0;font:13px monospace;background:#000a;padding:3px 7px;border-radius:4px}
h3{margin:12px 0 4px;font-size:12px;color:#8cf;text-transform:uppercase}
label{display:block;margin:7px 0 1px}label span{float:right;color:#0f0;font-family:monospace}
input[type=range],select{width:100%}button{margin:2px 2px 0 0;padding:5px 8px;background:#223;color:#fff;border:1px solid #446;border-radius:6px;cursor:pointer}
button:hover{background:#335}.na{opacity:.4}
@media(max-width:700px){#wrap{flex-direction:column}#panel{width:auto;max-height:45vh}}
</style>
<div id="st">connecting…</div>
<div id="wrap"><div id="view"><div id="box"><img id="v"><canvas id="ov"></canvas></div></div><div id="panel">
<h3>Presets</h3>
<button data-p="size=qvga&q=8&sharp=0&contrast=0&bright=0&sat=0&ae=0&gain=6&fps=0">Fast QVGA</button>
<button data-p="size=vga&q=8&sharp=1&fps=0">VGA</button>
<button data-p="size=svga&q=8&sharp=1&fps=0">SVGA</button>
<button data-p="size=xga&q=6&sharp=2&fps=0">XGA sharp</button>
<button data-p="size=sxga&q=6&sharp=2&fps=0">SXGA</button>
<button data-p="size=xga&q=10&xclk=20&sharp=0&contrast=0&bright=0&sat=0&ae=0&gain=6&mirror=0&flip=0&fps=0">Native (reset)</button>
<h3>Size / speed</h3>
<label>Frame size<select id="size"><option>qvga</option><option>vga</option><option>svga</option><option>xga</option><option>sxga</option><option>uxga</option></select></label>
<label>FPS cap <span id="o_fps"></span><select id="fps"><option value="0">max</option><option>30</option><option>25</option><option>20</option><option>15</option><option>10</option><option>5</option><option>2</option></select></label>
<label>Sensor clock<select id="xclk"><option value="20">20 MHz</option><option value="10">10 MHz</option></select></label>
<h3>Sharpness / quality</h3>
<label>JPEG quality (low = sharper) <span id="o_q"></span><input type="range" id="q" min="4" max="30" step="1"></label>
<label>Sharpness <span id="o_sharp"></span><input type="range" id="sharp" min="-2" max="2" step="1"></label>
<label>Contrast <span id="o_contrast"></span><input type="range" id="contrast" min="-2" max="2" step="1"></label>
<h3>Light / colour</h3>
<label>Brightness <span id="o_bright"></span><input type="range" id="bright" min="-2" max="2" step="1"></label>
<label>Exposure level <span id="o_ae"></span><input type="range" id="ae" min="-2" max="2" step="1"></label>
<label>Saturation <span id="o_sat"></span><input type="range" id="sat" min="-2" max="2" step="1"></label>
<label>Gain ceiling (0=2x … 6=128x) <span id="o_gain"></span><input type="range" id="gain" min="0" max="6" step="1"></label>
<h3>QR detect (quirc on the ESP)</h3>
<label><input type="checkbox" id="qr"> detect + outline</label>
<label>Detect every <span id="o_qrms"></span><input type="range" id="qrms" min="100" max="2000" step="100"></label>
<div class="kv" id="qrkv"></div>
<h3>ESP resources</h3>
<div class="kv" id="sys"></div>
<h3>Orientation</h3>
<label><input type="checkbox" id="mirror"> mirror left-right</label>
<label><input type="checkbox" id="flip"> flip upside-down</label>
<p id="note" style="color:#999"></p>
</div></div>
<script>
const $=id=>document.getElementById(id),h=location.hostname;
const proxied=location.port&&location.port!=='80';
const v=$('v');const src=()=>proxied?'/stream?'+Date.now():'http://'+h+':81/stream?'+Date.now();
v.src=src();v.onerror=()=>setTimeout(()=>{v.src=src()},1500);
const nums=['q','sharp','contrast','bright','sat','ae','gain','qrms'];let busy=false,t=null;
function show(s){
 $('st').textContent='native '+s.w+'x'+s.h+' · '+s.fps+' fps · '+s.kb+' KB/frame · q'+s.q+' · '+s.xclk+'MHz · '+s.rssi+' dBm';
 if(busy)return;
 $('size').value=s.size;$('fps').value=String(s.fpscap);$('xclk').value=String(s.xclk);
 nums.forEach(k=>{$(k).value=s[k];$('o_'+k).textContent=s[k]});
 $('mirror').checked=s.mirror;$('flip').checked=s.flip;$('qr').checked=s.qr.on;$('qrms').value=s.qr.ms_every;$('o_qrms').textContent=s.qr.ms_every+' ms';
 kv('qrkv',[['state',s.qr.on?(s.qr.decoded?'DECODED':s.qr.found?'pattern found':'searching…'):'off'],['text',s.qr.text||'-'],['mirrored',s.qr.mirrored],['detect time',s.qr.detect_ms+' ms'],['gray size',s.qr.gray],['hits / runs',s.qr.hits+' / '+s.qr.runs]]);
 const y=s.sys,kb=n=>(n/1024).toFixed(0)+' KB';
 kv('sys',[['CPU',y.cpu_mhz+' MHz'],['CPU busy',y.busy_pct+' %'],['temp',y.temp_c+' °C'],['heap free',kb(y.heap_free)+' / '+kb(y.heap_size)],['heap min',kb(y.heap_min)],['largest block',kb(y.heap_max_block)],['PSRAM free',kb(y.psram_free)+' / '+kb(y.psram_size)],['stack free',y.stack_free+' B'],['grab wait',y.t_grab_ms+' ms'],['send',y.t_send_ms+' ms'],['QR detect',y.t_detect_ms+' ms'],['Wi-Fi ch / dBm',y.wifi_ch+' / '+s.rssi],['uptime',Math.floor(y.uptime_s/60)+' min '+(y.uptime_s%60)+' s'],['firmware',y.sketch_kb+' KB']]);
 draw(s.qr);
 const na=Object.keys(s.caps).filter(k=>!s.caps[k]);
 $('note').textContent=na.length?('sensor 0x'+s.sensor_pid.toString(16)+' has no: '+na.join(', ')):'sensor 0x'+s.sensor_pid.toString(16);
}
const poll=()=>fetch('/stat').then(r=>r.json()).then(show).catch(()=>{$('st').textContent='box unreachable'});
setInterval(poll,500);poll();
function send(q){busy=true;clearTimeout(t);fetch('/set?'+q).then(r=>r.json()).then(s=>{busy=false;show(s)}).catch(()=>{busy=false})}
['size','fps','xclk'].forEach(k=>$(k).onchange=()=>send(k+'='+$(k).value));
nums.forEach(k=>{$(k).oninput=()=>{$('o_'+k).textContent=$(k).value;busy=true;clearTimeout(t);t=setTimeout(()=>send(k+'='+$(k).value),250)}});
['mirror','flip','qr'].forEach(k=>$(k).onchange=()=>send(k+'='+($(k).checked?1:0)));
function kv(id,rows){$(id).innerHTML=rows.map(r=>'<span>'+r[0]+'</span><b>'+r[1]+'</b>').join('')}
const ov=$('ov'),cx=ov.getContext('2d');
function draw(q){
 const w=v.clientWidth,h=v.clientHeight;if(!w||!h)return;
 if(ov.width!==w||ov.height!==h){ov.width=w;ov.height=h}
 cx.clearRect(0,0,w,h);
 if(!q.on||!q.found)return;
 const col=q.decoded?'#00ff66':'#ffcc00',p=q.corners.map(c=>[c[0]*w,c[1]*h]);
 cx.lineJoin='round';
 cx.lineWidth=7;cx.strokeStyle='#000a';cx.beginPath();p.forEach((c,i)=>i?cx.lineTo(c[0],c[1]):cx.moveTo(c[0],c[1]));cx.closePath();cx.stroke();
 cx.lineWidth=3;cx.strokeStyle=col;cx.stroke();
 p.forEach((c,i)=>{cx.fillStyle=i===0?'#f0f':col;cx.beginPath();cx.arc(c[0],c[1],i===0?7:4,0,7);cx.fill()});
 cx.font='bold 14px monospace';cx.fillStyle=col;cx.shadowColor='#000';cx.shadowBlur=4;
 cx.fillText(q.decoded?('QR '+q.text.slice(0,32)):'QR pattern (not decoded)',Math.min(...p.map(c=>c[0])),Math.max(10,Math.min(...p.map(c=>c[1]))-8));cx.shadowBlur=0;
}
document.querySelectorAll('button[data-p]').forEach(b=>b.onclick=()=>send(b.dataset.p));
</script>)HTML";

static void serialPoll();

static void serveStream(WiFiClient& c) {
  c.print("HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=frame\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
  uint32_t frames = 0, bytes = 0, mark = millis(), lastSent = 0, lastDetect = 0, grabTotal = 0, detects = 0;
  while (c.connected()) {
    web.handleClient();
    serialPoll();
    if (needRestart) {
      needRestart = false;
      needApply = false;
      if (!cameraRestart()) {
        delay(1000);
        continue;
      }
    }
    if (needApply) {
      needApply = false;
      applyLive();
    }
    if (cfg.fps > 0) {  // จำกัด FPS
      const uint32_t gap = 1000 / cfg.fps;
      while (millis() - lastSent < gap) {
        web.handleClient();
        delay(1);
      }
    }
    const uint32_t tg0 = millis();
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
      delay(5);
      continue;
    }
    const uint32_t tg1 = millis();
    c.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", (unsigned)fb->len);
    c.write(fb->buf, fb->len);
    c.print("\r\n");
    lastSent = millis();
    const uint32_t tg2 = millis();
    tSendTotal += tg2 - tg1;
    grabTotal += tg1 - tg0;
    frameW = fb->width;
    frameH = fb->height;
    bytes += fb->len;
    frames++;
    if (cfg.qr && millis() - lastDetect >= (uint32_t)cfg.qrms) {  // ตรวจจากเฟรมเดียวกับที่เพิ่งส่ง
      lastDetect = millis();
      detectQr(fb);
      detects++;
    }
    esp_camera_fb_return(fb);
    if (millis() - mark >= 1000) {
      const uint32_t win = millis() - mark;
      fpsNow = frames * 1000.0f / win;
      kbPerFrame = bytes / frames / 1024;
      tSendAvg = (float)tSendTotal / frames;
      tGrabAvg = (float)grabTotal / frames;
      tDetectAvg = detects ? (float)tDetectTotal / detects : 0;
      busyPct = (int)min<uint32_t>(100, (tSendTotal + tDetectTotal) * 100 / win);  // เวลาที่ CPU ทำงานจริง (ส่ง + ตรวจ QR) ต่อวินาที
      tSendTotal = tDetectTotal = grabTotal = 0;
      detects = 0;
      static uint32_t lastPrint = 0;
      if (millis() - lastPrint > 3000) {
        lastPrint = millis();
        Serial.printf("%ux%u · %.1f fps · %u KB/frame · rssi %d\n", frameW, frameH, fpsNow, kbPerFrame, WiFi.RSSI());
      }
      frames = bytes = 0;
      mark = millis();
    }
  }
  c.stop();
}

static void serialPoll() {
  static String line;
  while (Serial.available()) {
    const char ch = Serial.read();
    if (ch == '\r') continue;
    if (ch != '\n') {
      if (line.length() < 80) line += ch;
      continue;
    }
    line.trim();
    if (line == "status") {
      Serial.println(stateJson());
    } else if (line == "reboot") {
      ESP.restart();
    } else if (line.length()) {
      Serial.println("commands: status · reboot  (ปรับค่าทั้งหมดที่หน้าเว็บ http://<IP>/)");
    }
    line = "";
  }
}

static void connectWifi() {
  Preferences p;
  String ssid, pass;
  if (p.begin("smmb", true)) {  // ใช้ Wi-Fi ที่ตู้ตัวจริงบันทึกไว้
    ssid = p.getString("ssid", "");
    pass = p.getString("pass", "");
    p.end();
  }
  if (!ssid.length()) Serial.println("no saved Wi-Fi — flash the main firmware (-e esp32cam) and set Wi-Fi first");
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  if (ssid.length()) WiFi.begin(ssid.c_str(), pass.c_str());
  uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED) {
    serialPoll();
    delay(100);
    if (ssid.length() && millis() - t > 20000) {
      Serial.println("Wi-Fi connect timeout — retrying");
      WiFi.disconnect();
      WiFi.begin(ssid.c_str(), pass.c_str());
      t = millis();
    }
  }
  Serial.printf("Wi-Fi %s · IP %s · RSSI %d\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
}

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, LOW);
  Serial.println("\nSMMB camview — camera only (no backend)");
  loadCfg();
  connectWifi();
  web.on("/", HTTP_GET, [] { web.send_P(200, "text/html; charset=utf-8", PAGE); });
  web.on("/stat", HTTP_GET, [] { sendJson(stateJson()); });
  web.on("/set", HTTP_GET, handleSet);
  web.begin();
  streamSrv.begin();
  Serial.printf("OPEN  http://%s/   (stream http://%s:81/stream)\n", WiFi.localIP().toString().c_str(), WiFi.localIP().toString().c_str());
}

void loop() {
  web.handleClient();
  serialPoll();
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(2000);
    return;
  }
  if (needRestart) {
    needRestart = false;
    needApply = false;
    cameraRestart();
  }
  if (needApply) {
    needApply = false;
    applyLive();
  }
  WiFiClient c = streamSrv.available();
  if (c) {
    c.setTimeout(2);
    for (uint32_t t = millis(); millis() - t < 1000;) {  // ทิ้ง header
      const String h = c.readStringUntil('\n');
      if (h.length() <= 1) break;
    }
    serveStream(c);
  }
  delay(5);
}
