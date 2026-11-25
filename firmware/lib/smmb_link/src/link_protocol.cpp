// ลำดับคุยกับเซิร์ฟเวอร์: boot · report · events · long-poll · งานตรวจ/ทดสอบ · คำสั่งจากเว็บ
// ฮาร์ดแวร์ทั้งหมดเรียกผ่าน linkHooks (กล้อง เสียง ไฟ Wi-Fi) — ไฟล์นี้ไม่แตะขาบอร์ดตรง ๆ
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_task_wdt.h>
#include <mbedtls/base64.h>

#include "link_internal.h"

BoxConfig boxConfig;
int32_t linkLastClockDeltaS = 0;     // ผลต่างนาฬิกาตอนซิงก์ล่าสุด (ดู SmmbLink.h)
bool linkLastClockDeltaValid = false;
RTC_DATA_ATTR LinkRtc linkRtc;
LinkHooks linkHooks;
const char *linkFw = "0.0.0";
static bool booted = false;

void linkBegin(const LinkHooks &hooks, const char *fwVersion)
{
  linkHooks = hooks;
  linkFw = fwVersion;
}

LinkCredentials linkCred() { return linkHooks.credentials ? linkHooks.credentials() : LinkCredentials(); }

void linkBeep(const char *pattern)
{
  if (linkHooks.beep)
    linkHooks.beep(pattern);
}

void linkBeepErrorQuiet()
{
  static const uint32_t QUIET_MS = 10UL * 60 * 1000;
  static uint32_t last = 0;
  const uint32_t now = millis();
  if (last && now - last < QUIET_MS)
    return;
  last = now ? now : 1;
  linkBeep("error");
}

bool linkBooted() { return booted; }

const char *linkResetReason()
{
  switch (esp_reset_reason())
  {
  case ESP_RST_POWERON:
    return "power_on";
  case ESP_RST_DEEPSLEEP:
    return "deep_sleep";
  case ESP_RST_BROWNOUT:
    return "brownout";
  case ESP_RST_PANIC:
    return "panic";
  case ESP_RST_INT_WDT:
  case ESP_RST_TASK_WDT:
  case ESP_RST_WDT:
    return "watchdog";
  case ESP_RST_SW:
    return "software";
  case ESP_RST_EXT:
    return "external";
  default:
    return "other";
  }
}

// ── config ─────────────────────────────────────────────────────────────
static uint16_t hhmm(const char *s)
{
  if (!s || strlen(s) != 5 || s[2] != ':')
    return 0xFFFF;
  int h = atoi(s), m = atoi(s + 3);
  if (h < 0 || h > 23 || m < 0 || m > 59)
    return 0xFFFF;
  return h * 60 + m;
}

bool linkParseConfig(const String &json, BoxConfig &out)
{
  JsonDocument doc;
  if (deserializeJson(doc, json))
    return false;
  BoxConfig c;
  c.ver = out.ver;
  JsonArray w = doc["windows"].as<JsonArray>();
  for (JsonArray pair : w)
  {
    if (c.windowCount >= LINK_MAX_WINDOWS)
      break;
    uint16_t s = hhmm(pair[0] | ""), e = hhmm(pair[1] | "");
    if (s == 0xFFFF || e == 0xFFFF || s >= e)
      continue;
    c.winStart[c.windowCount] = s;
    c.winEnd[c.windowCount] = e;
    c.windowCount++;
  }
  uint16_t r = hhmm(doc["report_at"] | "");
  if (r != 0xFFFF)
    c.reportAt = r;
  c.scanTimeoutS = constrain((int)(doc["scan_timeout_s"] | 20), 5, 60);
  c.maxAttempts = constrain((int)(doc["max_attempts"] | 3), 1, 5);
  c.flashWhenDark = doc["flash_when_dark"] | true;
  c.longpollWaitS = constrain((int)(doc["longpoll_wait_s"] | 50), 10, 55);
  c.wifiPowerSave = doc["wifi_power_save"] | false;
  c.sleepOutsideWindow = doc["sleep_outside_window"] | false;
  out = c;
  return true;
}

/** รับ config_ver / config / awake_s จากคำตอบ */
static void absorbConfig(JsonVariantConst doc)
{
  uint32_t ver = doc["config_ver"] | 0u;
  if (!doc["config"].isNull())
  {
    String cfg;
    serializeJson(doc["config"], cfg);
    BoxConfig c;
    if (linkParseConfig(cfg, c))
    {
      c.ver = ver;
      boxConfig = c;
      if (WiFi.status() == WL_CONNECTED)
      {
        // เปลี่ยนทันทีที่ได้ค่าใหม่ — ถ้าฮาร์ดแวร์มีตัวตัดสินเอง (โหมดอัตโนมัติ) ให้มันเลือก
        if (linkHooks.wifiPowerSaveChanged)
          linkHooks.wifiPowerSaveChanged();
        else
          WiFi.setSleep(boxConfig.wifiPowerSave);
      }
      if (linkHooks.saveConfig)
        linkHooks.saveConfig(cfg, ver);
      Serial.printf("[config] v%u · %u window(s) · report %02u:%02u\n", ver, boxConfig.windowCount, boxConfig.reportAt / 60,
                    boxConfig.reportAt % 60);
    }
  }
  else if (ver)
  {
    boxConfig.ver = ver; // เซิร์ฟเวอร์ไม่ส่ง config มา = ของเราตรงอยู่แล้ว
  }
  uint32_t awake = doc["awake_s"] | 0u;
  if (awake && nowUtc())
    linkRtc.awakeUntil = nowUtc() + awake;
}

static void onAuthFailed(const LinkResponse &r)
{
  JsonDocument doc;
  deserializeJson(doc, r.body);
  Serial.printf("[auth] 401 reason=%s — check box_id / device_secret / URL\n", (const char *)(doc["reason"] | "?"));
  linkBeepErrorQuiet(); // วนซ้ำทุก 30 วิถ้ารหัสผิด → ไม่ร้องรัว
}

// ── events ─────────────────────────────────────────────────────────────
static bool postEvent(JsonDocument &doc, uint32_t timeoutMs)
{
  String body;
  serializeJson(doc, body);
  const LinkResponse r = linkRequest("POST", "/v1/box/events", body, timeoutMs);
  if (r.status != 200)
    Serial.printf("[diag] %s delivery failed (%d)\n", (const char *)(doc["type"] | "?"), r.status);
  return r.status == 200;
}

void linkEvent(const char *type, const char *jobId)
{
  JsonDocument doc;
  doc["type"] = type;
  if (jobId)
    doc["job_id"] = jobId;
  postEvent(doc, 1500);
}

bool linkEventRaw(const String &jsonBody, uint32_t timeoutMs)
{
  const LinkResponse r = linkRequest("POST", "/v1/box/events", jsonBody, timeoutMs);
  if (r.status != 200)
    Serial.printf("[diag] raw event delivery failed (%d)\n", r.status);
  return r.status == 200;
}

/** ตอบรับคำสั่ง — ต้องสำเร็จก่อนทำคำสั่งเสมอ (ไม่งั้นเซิร์ฟเวอร์ไม่รู้ว่าตู้รับแล้ว) */
static bool ackCommand(const char *type, const char *id, int tries)
{
  JsonDocument doc;
  doc["type"] = type;
  doc["command_id"] = id;
  for (int i = 0; i < tries; i++)
  {
    if (i)
      delay(1000);
    if (postEvent(doc, 3000))
      return true;
  }
  return false;
}

// ── คำสั่งจากเซิร์ฟเวอร์ ───────────────────────────────────────────────────
static void handleCommand(JsonVariantConst cmd)
{
  if (cmd.isNull())
    return;
  const char *type = cmd["type"] | "";
  const char *id = cmd["id"] | "";
  if (!*id)
    return;

  if (strcmp(type, "ota") == 0)
  {
    // อัปเดตเฟิร์มแวร์ — ลองครั้งเดียวต่อการเปิดเครื่อง (ล้มเหลวแล้วไม่วนโหลดซ้ำจนแบตหมด)
    static bool tried = false;
    const String ver = cmd["version"] | "";
    if (tried || !ver.length() || ver == linkFw)
      return;
    tried = true;
    // เวอร์ชันที่เคยลงไปแล้วแต่ตู้ยังรายงานเป็นอย่างอื่น = ไฟล์ที่อัปโหลดมี FW_VERSION ไม่ตรงชื่อ → อย่าลงซ้ำวนไปเรื่อย ๆ
    Preferences p;
    p.begin("smmb", false);
    const bool already = p.getString("otatry", "") == ver;
    p.end();
    if (already)
    {
      Serial.printf("[cmd] ota: %s was already installed once but the box still reports %s — name mismatch, skipping\n", ver.c_str(), linkFw);
      linkEvent("ota_failed");
      return;
    }
    Serial.printf("[cmd] ota: %s -> %s (%u bytes)\n", linkFw, ver.c_str(), (unsigned)(cmd["size"] | 0u));
    if (linkInstallFirmware(ver, cmd["size"] | 0u, cmd["sha256"] | ""))
    {
      // จำไว้ "หลังลงสำเร็จ" เท่านั้น — ถ้าบันทึกก่อนโหลดแล้วโหลดล้ม บูตรอบหน้าจะเข้าใจผิดว่าลงไปแล้วและข้ามตลอดไป
      p.begin("smmb", false);
      p.putString("otatry", ver);
      p.end();
      Serial.println("[cmd] ota: done — rebooting");
      delay(300);
      ESP.restart();
    }
    linkEvent("ota_failed");
    return;
  }

  if (strcmp(type, "beep") == 0)
  {
    // ทดสอบเสียงจากเว็บ — ack ก่อน (ไม่สำเร็จ = ยังไม่ส่งเสียง รอรับใหม่) · ไม่ซ้ำรหัสเดิม
    static String lastBeepId;
    if (lastBeepId == id)
      return;
    if (!ackCommand("beep", id, 1))
    {
      Serial.println("[cmd] beep: ack failed — will retry on next poll");
      return;
    }
    lastBeepId = id;
    const char *pattern = cmd["pattern"] | "";
    Serial.printf("[cmd] beep: %s\n", pattern);
    if (!linkHooks.beep || !linkHooks.beep(pattern))
      Serial.println("[cmd] beep: unknown pattern");
    return;
  }

  if (strcmp(type, "standby") == 0)
  {
    if (!ackCommand("standby", id, 3))
    {
      Serial.println("[cmd] standby: ack failed — will retry on next poll");
      return;
    }
    Serial.println("[cmd] standby: stay awake for QR scans");
    if (linkHooks.standby)
      linkHooks.standby();
    return;
  }

  if (strcmp(type, "wifi_reset") == 0)
  {
    if (!ackCommand("wifi_reset", id, 3))
    {
      Serial.println("[cmd] wifi_reset: ack failed — will retry on next poll");
      return;
    }
    Serial.println("[cmd] wifi_reset: forget Wi-Fi, back to setup mode");
    linkBeep("wifi");
    if (linkHooks.wifiReset)
      linkHooks.wifiReset();
  }
}

// ── boot / report ──────────────────────────────────────────────────────
/** ส่งซ้ำ 0 / 5 / 15 / 45 วิ · 401 หยุดทันที */
static LinkResponse postWithBackoff(const char *suffix, const String &body)
{
  static const uint32_t backoff[] = {0, 5000, 15000, 45000};
  LinkResponse r;
  for (uint32_t wait : backoff)
  {
    if (wait)
      delay(wait);
    r = linkRequest("POST", suffix, body);
    if (r.status == 200 || r.status == 401)
      break;
  }
  if (r.status == 401)
    onAuthFailed(r);
  return r;
}

bool linkBoot()
{
  JsonDocument doc;
  doc["fw"] = linkFw;
  doc["config_ver"] = boxConfig.ver;
  doc["reset_reason"] = linkResetReason();
  // 0.2.44: รหัสดิบของ esp_reset_reason() — "watchdog" รวม 3 แบบไว้ด้วยกัน: 5 ESP_RST_INT_WDT (ค้างในไดรเวอร์/interrupt) · 6 ESP_RST_TASK_WDT (ลูปไม่ขยับ 180 วิ) · 7 ESP_RST_WDT (อื่น ๆ)
  doc["reset_code"] = (int)esp_reset_reason();
  doc["rssi"] = WiFi.RSSI();
  doc["wifi_ch"] = WiFi.channel();
  String body;
  serializeJson(doc, body);
  const LinkResponse r = postWithBackoff("/v1/box/boot", body);
  if (r.status != 200)
  {
    if (r.status != 401)
      linkBeepErrorQuiet();
    return false;
  }
  JsonDocument res;
  deserializeJson(res, r.body);
  absorbConfig(res);
  booted = true;
  if (linkRtc.photoStep)
  {
    // 0.2.41: รอบก่อนตู้รีเซ็ตระหว่างถ่าย/ส่งรูป Snapface → บอกว่าตายที่ขั้นไหน
    JsonDocument d;
    d["type"] = "photo_crash";
    d["step"] = linkRtc.photoStep;
    d["reset"] = linkResetReason();
    d["reset_code"] = (int)esp_reset_reason();
    linkRtc.photoStep = 0;
    postEvent(d, 1500);
  }
  Serial.printf("[boot] ok · awake until +%ds\n", (int)(linkRtc.awakeUntil > nowUtc() ? linkRtc.awakeUntil - nowUtc() : 0));
  linkBeep("ready");
  handleCommand(res["command"]);
  return true;
}

bool linkReport()
{
  JsonDocument doc;
  doc["fw"] = linkFw;
  doc["config_ver"] = boxConfig.ver;
  doc["rssi"] = WiFi.RSSI();
  doc["temp_c"] = (int)temperatureRead();
  doc["wake_count"] = linkRtc.wakeCount;
  doc["jobs_done"] = linkRtc.jobsDone;
  doc["scan_fail"] = linkRtc.scanFail;
  doc["wifi_fail"] = linkRtc.wifiFail;
  doc["uptime_s"] = (uint32_t)(millis() / 1000);
  String body;
  serializeJson(doc, body);
  const LinkResponse r = postWithBackoff("/v1/box/report", body);
  if (r.status != 200)
    return false;
  JsonDocument res;
  deserializeJson(res, r.body);
  absorbConfig(res);
  linkRtc.jobsDone = linkRtc.scanFail = linkRtc.wifiFail = 0;
  handleCommand(res["command"]);
  return true;
}

// ── งานปลุกตู้ (ตรวจ / ทดสอบ) ─────────────────────────────────────────────
// ภาพสดระหว่างงานทดสอบ → POST /v1/box/preview (base64 ใน JSON) · เซิร์ฟเวอร์รับเฉพาะงาน test
static String previewJobId;
static void previewSink(const uint8_t *jpeg, size_t len)
{
  const size_t outCap = ((len + 2) / 3) * 4 + 4;
  char *b64 = (char *)malloc(outCap);
  if (!b64)
    return;
  size_t outLen = 0;
  if (mbedtls_base64_encode((unsigned char *)b64, outCap, &outLen, jpeg, len) == 0)
  {
    String body;
    body.reserve(outLen + 64);
    body = "{\"job_id\":\"" + previewJobId + "\",\"jpeg_b64\":\"";
    body.concat(b64, outLen);
    body += "\"}";
    linkRequest("POST", "/v1/box/preview", body, 4000);
  }
  free(b64);
}

static void setPreview(bool on)
{
  if (linkHooks.setPreviewSink)
    linkHooks.setPreviewSink(on ? previewSink : nullptr, 2500);
}

static const uint32_t PHOTO_DELAY_MIN_MS = 3000;  // เวลาให้แอปขึ้นหน้าถัดไปและเจ้าหน้าที่ลดมือถือลง ไม่บังหน้า
static const uint32_t PHOTO_DELAY_SPREAD_MS = 1500;
static const uint32_t PHOTO_UPLOAD_TIMEOUT_MS = 20000;  // รูปใหญ่สุด ~107 KB หลัง base64 บน Wi-Fi อ่อน

// Snapface (✅ ผู้ใช้สั่ง 2026-11-05): หลังตรวจผ่าน ตู้ถ่ายรูปเจ้าหน้าที่ 1 รูป ณ เวลาสุ่ม แล้วส่ง
// POST /v1/box/jobs/:id/photo { jpeg_b64 } — ไม่มีเสียง/ไฟบอก · ส่งไม่ได้ก็ทิ้ง (ไม่เก็บไว้ส่งทีหลัง)
static void sendInspectionPhoto(const String &jobId)
{
  if (!linkHooks.snapshotJpeg)
    return;
  // 0.2.41: รายงานผลขึ้น D04 (photo_diag) ทุกครั้ง · ขั้นที่ทำอยู่จดไว้ใน RTC เผื่อตู้รีเซ็ตกลางทาง (บูตถัดไปส่ง photo_crash)
  const unsigned long startedAt = millis();
  size_t len = 0;
  int httpStatus = 0;
  const char *outcome = "ok";
  auto finish = [&]()
  {
    linkRtc.photoStep = 0;
    JsonDocument d;
    d["type"] = "photo_diag";
    d["job_id"] = jobId;
    d["outcome"] = outcome;
    d["bytes"] = (uint32_t)len;
    d["http"] = httpStatus;
    d["free_heap"] = (uint32_t)ESP.getFreeHeap();
    d["ms"] = (uint32_t)(millis() - startedAt); // 0.2.44: เวลาตั้งแต่ตรวจผ่านจนจบช่วงถ่าย/ส่งรูป
    postEvent(d, 1500);
  };
  // 0.2.44: จดขั้นลง RTC อย่างเดียว — เลิกส่ง photo_step ขึ้นเซิร์ฟเวอร์ทุกขั้น (HTTPS เพิ่ม 4 ครั้งทำให้งานตรวจนานจน watchdog รีเซ็ตตู้ รูปจึงไม่ถึง)
  // ตู้รีเซ็ตกลางทาง → บูตถัดไปยังส่ง photo_crash บอกขั้นได้เหมือนเดิม · แต่ละขั้นมีกำหนดจบของตัวเอง จึงป้อน watchdog ที่ต้นขั้น
  auto stepEvent = [&](uint8_t step)
  {
    linkRtc.photoStep = step;
    esp_task_wdt_reset();
  };
  // 0.2.42: ปิดไฟแฟลชระหว่างรอจังหวะสุ่ม (LED ร้อน + กินกระแส ~0.3 A) แล้วค่อยวัดแสงใหม่ก่อนถ่ายจริง
  if (linkHooks.cameraAutoFlash)
    linkHooks.cameraAutoFlash(false);
  stepEvent(1);
  if (linkHooks.preparePhoto && !linkHooks.preparePhoto())
    Serial.println("[job] photo: prepare failed - using scan mode");
  stepEvent(2);
  const uint32_t waitMs = PHOTO_DELAY_MIN_MS + esp_random() % PHOTO_DELAY_SPREAD_MS;
  const uint32_t spentMs = millis() - startedAt;
  if (spentMs < waitMs)
    delay(waitMs - spentMs);
  uint8_t *jpeg = nullptr;
  stepEvent(3);
  if (linkHooks.cameraAutoFlash)
    linkHooks.cameraAutoFlash(boxConfig.flashWhenDark);
  const bool captured = linkHooks.snapshotJpeg(&jpeg, &len) && jpeg;
  linkHooks.cameraStop(); // ถ่ายเสร็จปิดกล้องและไฟทันที ไม่ต้องเปิดค้างระหว่างส่งรูป
  if (!captured)
  {
    Serial.println("[job] photo: snapshot failed");
    outcome = "snapshot_failed";
    finish();
    return;
  }
  if (len == 0 || len > 85000)
  {
    Serial.printf("[job] photo: size %u B out of range - dropped\n", (unsigned)len);
    free(jpeg);
    outcome = "size_out_of_range";
    finish();
    return;
  }
  stepEvent(4);
  // เข้ารหัส base64 ลง String ทีละช่วงเล็ก ๆ — ไม่ต้องมีบัฟเฟอร์ base64 ก้อนใหญ่ซ้อนกับ body (heap ภายในของ ESP32-CAM น้อย)
  String body;
  if (!body.reserve(((len + 2) / 3) * 4 + 24))
  {
    Serial.printf("[job] photo: no heap for %u B body (free %u, largest %u) - dropped\n", (unsigned)len, (unsigned)ESP.getFreeHeap(),
                  (unsigned)ESP.getMaxAllocHeap());
    free(jpeg);
    outcome = "no_heap";
    finish();
    return;
  }
  body = "{\"jpeg_b64\":\"";
  char chunk[1025];
  bool ok = true;
  for (size_t off = 0; off < len && ok; off += 768)
  {
    size_t n = len - off < 768 ? len - off : 768, outLen = 0;
    ok = mbedtls_base64_encode((unsigned char *)chunk, sizeof chunk, &outLen, jpeg + off, n) == 0;
    if (ok)
      body.concat(chunk, outLen);
  }
  free(jpeg); // คืนหน่วยความจำก่อนส่ง
  if (!ok)
  {
    Serial.println("[job] photo: base64 failed");
    outcome = "base64_failed";
    finish();
    return;
  }
  body += "\"}";
  stepEvent(5);
  const LinkResponse r = linkRequest("POST", "/v1/box/jobs/" + jobId + "/photo", body, PHOTO_UPLOAD_TIMEOUT_MS);
  esp_task_wdt_reset();
  Serial.printf("[job] photo %u B -> %d · %lu ms after pass\n", (unsigned)len, r.status, millis() - startedAt);
  httpStatus = r.status;
  if (r.status != 200)
    outcome = "upload_failed";
  finish();
}

static bool inspectPassFlag = false;
bool linkTakeInspectPass()
{
  const bool v = inspectPassFlag;
  inspectPassFlag = false;
  return v;
}

static void runJob(JsonObjectConst job)
{
  const String jobId = job["job_id"] | "";
  const String type = job["type"] | "";
  const uint8_t attemptMax = job["attempt_max"] | boxConfig.maxAttempts;
  const uint8_t scanTimeoutS = job["scan_timeout_s"] | boxConfig.scanTimeoutS;
  if (!jobId.length() || !linkHooks.cameraStart || !linkHooks.cameraStop || !linkHooks.scanQr)
    return;
  const bool cameraTest = type == "test";
  Serial.printf("[job] %s %s · %u tries × %us\n", type.c_str(), jobId.c_str(), attemptMax, scanTimeoutS);
  const unsigned long t0 = millis();

  previewJobId = jobId;
  // 0.2.35: งานตรวจจริงที่แอดมินเปิดโหมดดูภาพสดไว้ (เซิร์ฟเวอร์ใส่ preview:true) ส่งภาพสดระหว่างสแกนเหมือนงานทดสอบ
  const bool livePreview = job["preview"] | false;
  setPreview(cameraTest || livePreview);
  if (cameraTest)
    linkEvent("camera_test_started", jobId.c_str());
  // 0.2.34: ส่งเสียง "พร้อม" ก่อนเปิดกล้อง — ไซเรนกิน ~0.5 A ถ้าดังพร้อมกล้อง+Wi-Fi บนแหล่งจ่าย 3.7 V / 1 A กระแสเกินลิมิต ไฟตก ตู้รีเซ็ตก่อนส่ง ready
  // เสียงดังจบ (beep บล็อกจนจบ) แล้วค่อยเปิดกล้อง · ได้ยินเสียง = ตู้ตื่นและรับงานแล้วเสมอ
  linkBeep("ready");
  delay(200); // 0.2.33: ให้วิทยุ Wi-Fi/ไซเรนหยุดดึงกระแสก่อน แล้วค่อยเปิดกล้อง ไม่ให้กระแสพุ่งซ้อนกัน
  if (!linkHooks.cameraStart())
  {
    setPreview(false);
    linkEvent("camera_error", cameraTest ? jobId.c_str() : nullptr);
    linkBeep("error");
    return;
  }
  // 0.2.33: แจ้งเซิร์ฟเวอร์ก่อน แล้วค่อยเปิดไฟแฟลช (LED บนบอร์ดดึงกระแสสูง)
  esp_task_wdt_reset(); // 0.2.44: เริ่มนับใหม่ตอนรับงาน (long-poll ที่ส่งงานมาอาจรอไปแล้วเกือบ 30 วิ)
  const LinkResponse ready = linkRequest("POST", "/v1/box/jobs/" + jobId + "/ready", "{\"flash\":false}");
  Serial.printf("[job] ready after %lu ms\n", millis() - t0);
  if (ready.status != 200)
  {
    linkHooks.cameraStop();
    setPreview(false);
    if (ready.status == 401)
      onAuthFailed(ready);
    return; // 410 = งานหมดอายุ / 404 = ไม่ใช่งานของตู้นี้ → กลับไปรอ
  }
  const bool flash = linkHooks.cameraAutoFlash ? linkHooks.cameraAutoFlash(boxConfig.flashWhenDark) : false;
  if (cameraTest)
  {
    JsonDocument d;
    d["type"] = "camera_ready";
    d["job_id"] = jobId;
    d["width"] = 640;
    d["height"] = 480;
    postEvent(d, 1500);
  }

  for (uint8_t attempt = 1; attempt <= attemptMax; attempt++)
  {
    esp_task_wdt_reset(); // 0.2.44: สแกน/ส่งผลแต่ละรอบมีกำหนดจบของตัวเอง → นับ watchdog ต่อรอบ ไม่ใช่รวมทั้งงาน (เดิมรวมเกิน 180 วิได้ = ตู้รีเซ็ตกลางงาน)
    const LinkScan q = linkHooks.scanQr((uint32_t)scanTimeoutS * 1000);
    JsonDocument doc;
    doc["attempt"] = attempt;
    doc["read_ok"] = q.ok;
    if (q.ok)
      doc["qr_text"] = q.text.substring(0, 1024);
    else
      doc["qr_text"] = nullptr;
    doc["read_ms"] = q.ms;
    doc["flash"] = flash;
    String body;
    serializeJson(doc, body);
    LinkResponse r = linkRequest("POST", "/v1/box/jobs/" + jobId + "/result", body);
    // เน็ตสะดุด/เซิร์ฟเวอร์ตอบ 5xx → ส่งซ้ำอีก 2 ครั้ง (backend ตอบผลเดิมถ้า job+attempt ซ้ำ จึงไม่นับซ้ำ)
    // 401/4xx ไม่ลองซ้ำ · ไม่เก็บไว้ส่งทีหลัง (ไม่มีโหมดออฟไลน์) · รอรวม ≤ ~3 วิ ซึ่ง job ถูกขยายอายุหลัง ready แล้ว
    for (uint8_t retry = 0; retry < 2 && (r.status <= 0 || r.status >= 500); retry++)
    {
      Serial.printf("[job] result POST failed (%d) — retry %u/2\n", r.status, (unsigned)(retry + 1));
      delay(1000);
      r = linkRequest("POST", "/v1/box/jobs/" + jobId + "/result", body);
    }
    esp_task_wdt_reset();
    if (r.status != 200)
    {
      // ส่งผลไม่ได้ → ทิ้ง ไม่เก็บไว้ส่งทีหลัง (ไม่มีโหมดออฟไลน์)
      linkRtc.scanFail++;
      if (r.status == 401)
        onAuthFailed(r);
      else
        linkBeep("error");
      break;
    }
    // 0.2.36: อ่านไม่ได้ในงานตรวจจริง → ส่งผลวินิจฉัย (ตัวเลขล้วน ไม่มีภาพ) ขึ้นหน้า D04 เพื่อหาสาเหตุ · best-effort ไม่เปลี่ยนผล /result
    if (!cameraTest && !q.ok)
    {
      JsonDocument d;
      d["type"] = "scan_diag";
      d["job_id"] = jobId;
      d["attempt"] = attempt;
      d["frames"] = q.frames;
      d["qr_shapes"] = q.qrShapes;
      d["widest_px"] = q.widestPx;
      d["brightness"] = q.brightness;
      d["read_ms"] = q.ms;
      d["decode_err"] = q.err;
      postEvent(d, 3000);
    }
    if (cameraTest)
    {
      JsonDocument d;
      d["type"] = "camera_scan_result";
      d["job_id"] = jobId;
      d["attempt"] = attempt;
      d["frames"] = q.frames;
      d["qr_shapes"] = q.qrShapes;
      d["read_ok"] = q.ok;
      d["read_ms"] = q.ms;
      postEvent(d, 1500);
    }
    JsonDocument res;
    deserializeJson(res, r.body);
    const String status = res["status"] | "";
    if (status == "pass")
    {
      linkBeep("pass");
      linkRtc.jobsDone++;
      if (type == "inspect")
      {
        sendInspectionPhoto(jobId);
        inspectPassFlag = true; // ตรวจผ่านแล้ว → ฝั่งแอปพาตู้ไปหลับ (ไม่ต้องถือสายรอจนหมดช่วง)
      }
      break;
    }
    if (status == "retry")
    {
      linkBeep("retry");
      continue;
    }
    linkBeep("fail");
    linkRtc.scanFail++;
    break;
  }
  linkHooks.cameraStop();
  setPreview(false);
}

// ── long-poll ──────────────────────────────────────────────────────────
LinkPoll linkPollOnce(uint8_t maxWaitS)
{
  uint8_t wait = boxConfig.longpollWaitS ? boxConfig.longpollWaitS : 50;
  if (wait > maxWaitS)
    wait = maxWaitS; // คำขอที่ค้างนานบน Wi-Fi อ่อนมีโอกาสค้างสูง · เซิร์ฟเวอร์ถือว่าออนไลน์ถ้าถามภายใน 2×wait
  if (wait < 1)
    wait = 1;
  const LinkResponse r =
      linkRequest("GET", "/v1/box/jobs?wait=" + String(wait) + "&config_ver=" + String(boxConfig.ver), "", (uint32_t)wait * 1000 + 10000);
  // คำขอซิงก์สั้น (wait ≤ 2): ตั้งนาฬิกาเสมอ — linkRequest ข้ามคำขอที่นานเกิน 5 วิ ซึ่งนับรวม TLS handshake
  // บน Wi-Fi ช้าจึงไม่ได้ซิงก์เลยและนาฬิกาเพี้ยนสะสมข้ามรอบหลับ · X-Server-Time ประทับตอนเซิร์ฟเวอร์เริ่มรับคำขอ (หลัง handshake)
  // 204 = รอครบ wait วิ แล้วจึงตอบ → เวลาจริง ≈ ค่าที่ประทับ + wait
  if (wait <= 2 && r.serverTime && (r.status == 204 || r.status == 200))
  {
    const uint32_t truth = r.serverTime + (r.status == 204 ? wait : 0);
    const uint32_t before = nowUtc(); // เวลาในตู้ก่อนตั้ง — จดผลต่างไว้ให้ฝั่งแอปวินิจฉัยนาฬิกาเพี้ยน (ความละเอียด ±1–2 วิ จากเวลาเดินทางของคำขอ)
    linkLastClockDeltaValid = before != 0;
    linkLastClockDeltaS = before ? (int32_t)(truth - before) : 0;
    clockSetFrom(truth);
  }
  Serial.printf("[poll] %d · heap %u · rssi %d · up %lus\n", r.status, (unsigned)ESP.getFreeHeap(), WiFi.RSSI(), millis() / 1000);
  if (r.status == 204)
    return LinkPoll::Idle;
  if (r.status == 200)
  {
    JsonDocument doc;
    if (deserializeJson(doc, r.body))
      return LinkPoll::Handled;
    const uint32_t ver = doc["config_ver"] | 0u;
    if (!doc["config"].isNull())
      absorbConfig(doc);
    handleCommand(doc["command"]);
    if (!doc["job"].isNull())
      runJob(doc["job"].as<JsonObjectConst>());
    // backend รุ่นก่อนที่ยังไม่ส่ง config ทาง long-poll → ดึงผ่าน report
    if (ver && ver != boxConfig.ver)
      linkReport();
    return LinkPoll::Handled;
  }
  if (r.status == 401)
  {
    onAuthFailed(r);
    return LinkPoll::AuthFailed;
  }
  return LinkPoll::Offline;
}
