// ลำดับคุยกับเซิร์ฟเวอร์: boot · report · events · long-poll · งานตรวจ/ทดสอบ · คำสั่งจากเว็บ
// ฮาร์ดแวร์ทั้งหมดเรียกผ่าน linkHooks (กล้อง เสียง ไฟ Wi-Fi) — ไฟล์นี้ไม่แตะขาบอร์ดตรง ๆ
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>
#include <mbedtls/base64.h>

#include "link_internal.h"

BoxConfig boxConfig;
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
  linkBeep("error");
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
  doc["rssi"] = WiFi.RSSI();
  doc["wifi_ch"] = WiFi.channel();
  String body;
  serializeJson(doc, body);
  const LinkResponse r = postWithBackoff("/v1/box/boot", body);
  if (r.status != 200)
  {
    if (r.status != 401)
      linkBeep("error");
    return false;
  }
  JsonDocument res;
  deserializeJson(res, r.body);
  absorbConfig(res);
  booted = true;
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
  setPreview(cameraTest);
  if (cameraTest)
    linkEvent("camera_test_started", jobId.c_str());
  if (!linkHooks.cameraStart())
  {
    setPreview(false);
    linkEvent("camera_error", cameraTest ? jobId.c_str() : nullptr);
    linkBeep("error");
    return;
  }
  const bool flash = linkHooks.cameraAutoFlash ? linkHooks.cameraAutoFlash(boxConfig.flashWhenDark) : false;
  linkBeep("ready");
  const LinkResponse ready = linkRequest("POST", "/v1/box/jobs/" + jobId + "/ready", flash ? "{\"flash\":true}" : "{\"flash\":false}");
  Serial.printf("[job] ready after %lu ms\n", millis() - t0);
  if (ready.status != 200)
  {
    linkHooks.cameraStop();
    setPreview(false);
    if (ready.status == 401)
      onAuthFailed(ready);
    return; // 410 = งานหมดอายุ / 404 = ไม่ใช่งานของตู้นี้ → กลับไปรอ
  }
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
    const LinkResponse r = linkRequest("POST", "/v1/box/jobs/" + jobId + "/result", body);
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
