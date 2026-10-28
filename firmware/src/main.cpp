// เฟิร์มแวร์ตู้ SMMB (ESP32-CAM) — ลำดับการทำงานตาม docs/HARDWARE_FIRMWARE_GUIDE.md §4
//
// เปิดเครื่อง → (ไม่มี Wi-Fi / ไม่ได้ตั้งตู้ → โหมดตั้งค่า) → ต่อ Wi-Fi → POST boot
// → ลูป: อยู่ใน awake_s หลัง boot หรือในเวลาตรวจ → ถือ long-poll รองาน
//        ไม่ใช่ → ถึงเวลารายงาน → report · แล้วหลับลึกจนถึงเหตุการณ์ถัดไป
//
// คำสั่งทาง Serial (115200): พิมพ์ help

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <WiFi.h>
#include <driver/rtc_io.h>
#include <esp_sleep.h>

#include "api.h"
#include "board.h"
#include "buzzer.h"
#include "camera_qr.h"
#include "portal.h"
#include "settings.h"
#include "signer.h"

// stack ของ loop: TLS + JSON + ถอด QR ต้องการมากกว่าค่าเริ่มต้น 8 KB
SET_LOOP_TASK_STACK_SIZE(16 * 1024);

// ── ค่าที่อยู่รอดตอนหลับลึก ───────────────────────────────────────────────
RTC_DATA_ATTR static uint32_t awakeUntil = 0;   // ถือ long-poll ถึงเวลานี้ (UTC) แม้นอกเวลาตรวจ
RTC_DATA_ATTR static uint32_t lastReportDay = 0;  // วันที่ (เวลาไทย นับจาก epoch) ที่รายงานแล้ว
RTC_DATA_ATTR static uint32_t wakeCount = 0, jobsDone = 0, scanFail = 0, wifiFail = 0;

static bool booted = false;  // ส่ง boot สำเร็จแล้วในรอบไฟนี้

// ── เวลา ───────────────────────────────────────────────────────────────
static uint32_t localDay(uint32_t utc) { return (utc + TZ_OFFSET_S) / 86400; }
static uint16_t localMinute(uint32_t utc) { return ((utc + TZ_OFFSET_S) % 86400) / 60; }

static bool inWindow(uint32_t utc) {
  uint16_t m = localMinute(utc);
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
    if (m >= boxConfig.winStart[i] && m < boxConfig.winEnd[i]) return true;
  return false;
}

static bool shouldListen() {
  uint32_t now = nowUtc();
  if (!now) return false;
  return now < awakeUntil || inWindow(now);
}

/** วินาทีถึงเหตุการณ์ถัดไป (ต้นช่วงเวลาตรวจ − 60 วิ หรือ เวลารายงาน) */
static uint32_t secondsToNextEvent(uint32_t now) {
  uint16_t m = localMinute(now);
  uint32_t secOfDay = (now + TZ_OFFSET_S) % 86400;
  uint32_t best = 24 * 3600;
  auto consider = [&](uint16_t targetMin, int32_t earlyS) {
    int32_t target = (int32_t)targetMin * 60 - earlyS;
    int32_t diff = target - (int32_t)secOfDay;
    if (diff <= 0) diff += 86400;
    if ((uint32_t)diff < best) best = diff;
  };
  for (uint8_t i = 0; i < boxConfig.windowCount; i++) consider(boxConfig.winStart[i], WAKE_BEFORE_WINDOW_S);
  consider(boxConfig.reportAt, 0);
  (void)m;
  return max<uint32_t>(best, 30);
}

// ── Wi-Fi ──────────────────────────────────────────────────────────────
static bool wifiConnect() {
  if (WiFi.status() == WL_CONNECTED) return true;
  if (!settingsHasWifi()) return false;
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(true);  // modem sleep ระหว่างรอ long-poll
  if (wifiJoin(nullptr)) {
    Serial.printf("[wifi] connected \"%s\" IP %s RSSI %d ch %d\n", settings.wifiSsid.c_str(), WiFi.localIP().toString().c_str(),
                  WiFi.RSSI(), WiFi.channel());
    return true;
  }
  wifiFail++;
  Serial.printf("[wifi] connect failed (status %d)\n", (int)WiFi.status());
  return false;
}

// ── คำตอบที่มี config ─────────────────────────────────────────────────────
static void absorbConfig(const String& body) {
  JsonDocument doc;
  if (deserializeJson(doc, body)) return;
  uint32_t ver = doc["config_ver"] | 0u;
  if (!doc["config"].isNull()) {
    String cfg;
    serializeJson(doc["config"], cfg);
    if (configApplyJson(cfg, ver))
      Serial.printf("[config] v%u · %u window(s) · report %02u:%02u\n", ver, boxConfig.windowCount, boxConfig.reportAt / 60,
                    boxConfig.reportAt % 60);
  } else if (ver) {
    configSetVersionOnly(ver);
  }
  uint32_t awake = doc["awake_s"] | 0u;
  if (awake && nowUtc()) awakeUntil = nowUtc() + awake;
}

static void onAuthFailed(const ApiResult& r) {
  JsonDocument doc;
  deserializeJson(doc, r.body);
  Serial.printf("[auth] 401 reason=%s — check box_id / device_secret / URL\n", (const char*)(doc["reason"] | "?"));
  beepError();
}

static const char* resetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "power_on";
    case ESP_RST_DEEPSLEEP: return "deep_sleep";
    case ESP_RST_BROWNOUT: return "brownout";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_SW: return "software";
    case ESP_RST_EXT: return "external";
    default: return "other";
  }
}

// ── boot / report ──────────────────────────────────────────────────────
static bool sendBoot() {
  JsonDocument doc;
  doc["fw"] = FW_VERSION;
  doc["config_ver"] = boxConfig.ver;
  doc["reset_reason"] = resetReason();
  doc["rssi"] = WiFi.RSSI();
  doc["wifi_ch"] = WiFi.channel();
  String body;
  serializeJson(doc, body);
  // ต่อไม่ได้ → ลอง 3 ครั้ง ห่าง 5 / 15 / 45 วิ
  const uint32_t backoff[] = {0, 5000, 15000, 45000};
  for (uint32_t wait : backoff) {
    if (wait) delay(wait);
    ApiResult r = apiCall("POST", "/v1/box/boot", body);
    if (r.status == 200) {
      absorbConfig(r.body);
      booted = true;
      Serial.printf("[boot] ok · awake until +%ds\n", (int)(awakeUntil > nowUtc() ? awakeUntil - nowUtc() : 0));
      beepReady();
      return true;
    }
    if (r.status == 401) {
      onAuthFailed(r);
      return false;
    }
  }
  beepError();
  return false;
}

static bool sendReport() {
  JsonDocument doc;
  doc["fw"] = FW_VERSION;
  doc["config_ver"] = boxConfig.ver;
  doc["rssi"] = WiFi.RSSI();
  doc["temp_c"] = (int)temperatureRead();
  doc["wake_count"] = wakeCount;
  doc["jobs_done"] = jobsDone;
  doc["scan_fail"] = scanFail;
  doc["wifi_fail"] = wifiFail;
  doc["uptime_s"] = (uint32_t)(millis() / 1000);
  String body;
  serializeJson(doc, body);
  const uint32_t backoff[] = {0, 5000, 15000, 45000};
  for (uint32_t wait : backoff) {
    if (wait) delay(wait);
    ApiResult r = apiCall("POST", "/v1/box/report", body);
    if (r.status == 200) {
      absorbConfig(r.body);
      lastReportDay = localDay(nowUtc());
      jobsDone = scanFail = wifiFail = 0;
      return true;
    }
    if (r.status == 401) {
      onAuthFailed(r);
      return false;
    }
  }
  return false;
}

static void sendEvent(const char* type, const char* jobId = nullptr) {
  JsonDocument doc;
  doc["type"] = type;
  if (jobId) doc["job_id"] = jobId;
  String body;
  serializeJson(doc, body);
  const ApiResult result = apiCall("POST", "/v1/box/events", body, 1500);
  if (result.status != 200) Serial.printf("[diag] %s delivery failed (%d)\n", type, result.status);
}

static void sendCameraScanEvent(const String& jobId, uint8_t attempt, const QrRead& read) {
  JsonDocument doc;
  doc["type"] = "camera_scan_result";
  doc["job_id"] = jobId;
  doc["attempt"] = attempt;
  doc["frames"] = read.frames;
  doc["qr_shapes"] = read.qrShapes;
  doc["read_ok"] = read.ok;
  doc["read_ms"] = read.ms;
  String body;
  serializeJson(doc, body);
  const ApiResult result = apiCall("POST", "/v1/box/events", body, 1500);
  if (result.status != 200) Serial.printf("[diag] camera_scan_result delivery failed (%d)\n", result.status);
}

// ── งานปลุกตู้ (ตรวจ / ทดสอบ) §8 ─────────────────────────────────────────
static void runJob(JsonObject job) {
  String jobId = job["job_id"] | "";
  String type = job["type"] | "";
  uint8_t attemptMax = job["attempt_max"] | boxConfig.maxAttempts;
  uint8_t scanTimeoutS = job["scan_timeout_s"] | boxConfig.scanTimeoutS;
  if (!jobId.length()) return;
  const bool cameraTest = type == "test";
  Serial.printf("[job] %s %s · %u tries × %us\n", type.c_str(), jobId.c_str(), attemptMax, scanTimeoutS);
  const unsigned long t0 = millis();

  if (cameraTest) sendEvent("camera_test_started", jobId.c_str());
  if (!cameraStart()) {
    sendEvent("camera_error", cameraTest ? jobId.c_str() : nullptr);
    beepError();
    return;
  }
  bool flash = cameraAutoFlash(boxConfig.flashWhenDark);
  beepReady();
  ApiResult ready = apiCall("POST", "/v1/box/jobs/" + jobId + "/ready", flash ? "{\"flash\":true}" : "{\"flash\":false}");
  Serial.printf("[job] ready after %lu ms\n", millis() - t0);
  if (ready.status != 200) {
    cameraStop();
    if (ready.status == 401) onAuthFailed(ready);
    return;  // 410 = งานหมดอายุ / 404 = ไม่ใช่งานของตู้นี้ → กลับไปรอ
  }
  if (cameraTest) {
    JsonDocument diagnostic;
    diagnostic["type"] = "camera_ready";
    diagnostic["job_id"] = jobId;
    diagnostic["width"] = 640;
    diagnostic["height"] = 480;
    String body;
    serializeJson(diagnostic, body);
    const ApiResult sent = apiCall("POST", "/v1/box/events", body, 1500);
    if (sent.status != 200) Serial.printf("[diag] camera_ready delivery failed (%d)\n", sent.status);
  }

  for (uint8_t attempt = 1; attempt <= attemptMax; attempt++) {
    QrRead q = cameraScanQr((uint32_t)scanTimeoutS * 1000);
    JsonDocument doc;
    doc["attempt"] = attempt;
    doc["read_ok"] = q.ok;
    if (q.ok) doc["qr_text"] = q.text.substring(0, 1024);
    else doc["qr_text"] = nullptr;
    doc["read_ms"] = q.ms;
    doc["flash"] = flash;
    String body;
    serializeJson(doc, body);
    ApiResult r = apiCall("POST", "/v1/box/jobs/" + jobId + "/result", body);
    if (r.status != 200) {
      // ส่งผลไม่ได้ → ทิ้ง ไม่เก็บไว้ส่งทีหลัง (ไม่มีโหมดออฟไลน์)
      scanFail++;
      if (r.status == 401) onAuthFailed(r);
      else beepError();
      break;
    }
    if (cameraTest) sendCameraScanEvent(jobId, attempt, q);
    JsonDocument res;
    deserializeJson(res, r.body);
    String status = res["status"] | "";
    if (status == "pass") {
      beepPass();
      jobsDone++;
      break;
    }
    if (status == "retry") {
      beepRetry();
      continue;
    }
    beepFail();
    scanFail++;
    break;
  }
  cameraStop();
}

/** ถือ long-poll 1 รอบ */
static void pollOnce() {
  uint8_t wait = boxConfig.longpollWaitS ? boxConfig.longpollWaitS : 50;
  ApiResult r = apiCall("GET", "/v1/box/jobs?wait=" + String(wait), "", (uint32_t)wait * 1000 + 10000);
  if (r.status == 204) return;
  if (r.status == 200) {
    JsonDocument doc;
    if (deserializeJson(doc, r.body)) return;
    uint32_t ver = doc["config_ver"] | 0u;
    if (!doc["job"].isNull()) runJob(doc["job"].as<JsonObject>());
    // เวลาตรวจ/ค่าตั้งเปลี่ยน → ขอค่าใหม่ผ่าน report
    if (ver && ver != boxConfig.ver) sendReport();
    return;
  }
  if (r.status == 401) {
    onAuthFailed(r);
    delay(RETRY_IN_WINDOW_MS);
    return;
  }
  // ต่อไม่ได้ / 5xx → ลองใหม่ทุก 30 วิ
  if (WiFi.status() != WL_CONNECTED) wifiConnect();
  delay(RETRY_IN_WINDOW_MS);
}

// ── หลับลึก ────────────────────────────────────────────────────────────
static void sleepUntilNextEvent() {
  uint32_t now = nowUtc();
  uint32_t s = secondsToNextEvent(now);
  if (!settings.sleep) {
    static unsigned long lastMsg = 0;
    if (millis() - lastMsg > 60000) {
      Serial.printf("[sleep] (sleep off) next event in %u s — staying awake\n", s);
      lastMsg = millis();
    }
    delay(1000);
    return;
  }
  Serial.printf("[sleep] deep sleep %u s\n", s);
  Serial.flush();
  cameraStop();
  ledcWrite(7, 0);
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  // ไฟแฟลช GPIO4 ลอยตอนหลับ → ล็อกให้ดับ
  digitalWrite(PIN_FLASH_LED, LOW);
  rtc_gpio_hold_en((gpio_num_t)PIN_FLASH_LED);
  esp_sleep_enable_timer_wakeup((uint64_t)s * 1000000ULL);
  esp_deep_sleep_start();
}

// ── คำสั่งทาง Serial ─────────────────────────────────────────────────────
static String cliLine;

static void printStatus() {
  uint32_t now = nowUtc();
  Serial.printf("fw %s · box %s · url %s · secret %s · wifi \"%s\" (%s)\n", FW_VERSION, settings.boxId.c_str(), settings.url.c_str(),
                settings.secret.length() == 64 ? "set" : "MISSING", settings.wifiSsid.c_str(),
                WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "offline");
  Serial.printf("clock %s · local %02u:%02u · config v%u windows %u · in window %s · awake left %d s · sleep %s\n",
                now ? "set" : "NOT SET", now ? localMinute(now) / 60 : 0, now ? localMinute(now) % 60 : 0, boxConfig.ver,
                boxConfig.windowCount, now && inWindow(now) ? "yes" : "no", (int)(awakeUntil > now ? awakeUntil - now : 0),
                settings.sleep ? "on" : "off");
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
    Serial.printf("  window %02u:%02u-%02u:%02u\n", boxConfig.winStart[i] / 60, boxConfig.winStart[i] % 60, boxConfig.winEnd[i] / 60,
                  boxConfig.winEnd[i] % 60);
}

static void runCommand(String line) {
  line.trim();
  if (!line.length()) return;
  int sp = line.indexOf(' ');
  String cmd = sp < 0 ? line : line.substring(0, sp);
  String arg = sp < 0 ? "" : line.substring(sp + 1);
  arg.trim();
  cmd.toLowerCase();

  if (cmd == "help") {
    Serial.println(
        "commands:\n"
        "  status                 show settings / clock / config\n"
        "  wifi <ssid> <pass>     set home Wi-Fi (ssid without spaces; use the portal for others)\n"
        "  url <https://...>      server base URL, e.g. https://hub.sjp-dev.net/smmb-api\n"
        "  box <BX-00003>         box id\n"
        "  secret <64 hex>        device secret (not echoed)\n"
        "  sleep on|off           deep sleep between events (off = stay awake for testing)\n"
        "  selftest               check request signing against the guide's test vectors\n"
        "  boot                   send POST /v1/box/boot now\n"
        "  report                 send POST /v1/box/report now\n"
        "  scan [sec]             open the camera and try to read a QR (no server)\n"
        "  camweb [sec]           view the box camera at http://<box ip>/ (adjust distance / angle)\n"
        "  portal                 start the Wi-Fi setup portal\n"
        "  forget                 forget Wi-Fi and restart\n"
        "  reboot");
  } else if (cmd == "status") {
    printStatus();
  } else if (cmd == "wifi") {
    int s2 = arg.indexOf(' ');
    settings.wifiSsid = s2 < 0 ? arg : arg.substring(0, s2);
    settings.wifiPass = s2 < 0 ? "" : arg.substring(s2 + 1);
    settingsSave();
    Serial.printf("wifi set to \"%s\" — reboot to apply\n", settings.wifiSsid.c_str());
  } else if (cmd == "url") {
    while (arg.endsWith("/")) arg.remove(arg.length() - 1);
    settings.url = arg;
    settingsSave();
    Serial.printf("url = %s\n", settings.url.c_str());
  } else if (cmd == "box") {
    arg.toUpperCase();
    settings.boxId = arg;
    settingsSave();
    Serial.printf("box = %s\n", settings.boxId.c_str());
  } else if (cmd == "secret") {
    arg.toLowerCase();
    if (arg.length() != 64) {
      Serial.println("secret must be 64 hex characters");
      return;
    }
    settings.secret = arg;
    settingsSave();
    Serial.println("secret saved");
  } else if (cmd == "sleep") {
    settings.sleep = arg != "off";
    settingsSave();
    Serial.printf("sleep %s\n", settings.sleep ? "on" : "off");
  } else if (cmd == "selftest") {
    Serial.println(signerSelfTest(true) ? "selftest PASS" : "selftest FAIL");
  } else if (cmd == "boot") {
    if (wifiConnect()) sendBoot();
  } else if (cmd == "report") {
    if (wifiConnect()) sendReport();
  } else if (cmd == "scan") {
    uint32_t sec = arg.length() ? arg.toInt() : 20;
    if (cameraStart()) {
      cameraAutoFlash(boxConfig.flashWhenDark);
      QrRead q = cameraScanQr(sec * 1000);
      Serial.printf("scan: %s\n", q.ok ? q.text.c_str() : "(nothing)");
      cameraStop();
    }
  } else if (cmd == "camweb") {
    // ดูภาพจากกล้องตู้ผ่านเบราว์เซอร์ในวง LAN (ไว้ปรับระยะ/มุม) — เปิดค้าง N วินาที
    uint32_t sec = arg.length() ? arg.toInt() : 120;
    WebServer web(80);
    web.on("/", [&web] {
      web.send(200, "text/html",
               "<html><body style='margin:0;background:#000'><img id=i style='width:100%'><script>"
               "setInterval(()=>{document.getElementById('i').src='/snap.jpg?'+Date.now()},700)</script></body></html>");
    });
    web.on("/snap.jpg", [&web] {
      uint8_t* jpg = nullptr;
      size_t len = 0;
      if (!cameraSnapshotJpeg(&jpg, &len)) {
        web.send(500, "text/plain", "camera error");
        return;
      }
      web.send_P(200, "image/jpeg", (const char*)jpg, len);
      free(jpg);
    });
    web.begin();
    cameraStart();
    Serial.printf("camweb: open http://%s/ for %u s\n", WiFi.localIP().toString().c_str(), sec);
    unsigned long t = millis();
    while (millis() - t < sec * 1000UL) {
      web.handleClient();
      delay(5);
    }
    web.stop();
    cameraStop();
    Serial.println("camweb: stopped");
  } else if (cmd == "portal") {
    if (runSetupPortal(PORTAL_TIMEOUT_MS)) ESP.restart();
  } else if (cmd == "forget") {
    settingsForgetWifi();
    ESP.restart();
  } else if (cmd == "reboot") {
    ESP.restart();
  } else {
    Serial.println("unknown command — type help");
  }
}

void cliPoll() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      String line = cliLine;
      cliLine = "";
      runCommand(line);
    } else if (cliLine.length() < 200) {
      cliLine += c;
    }
  }
}

/** รอคำสั่ง Serial ระหว่าง delay (ให้พิมพ์คำสั่งได้ตลอด) */
static void waitWithCli(unsigned long ms) {
  unsigned long t = millis();
  while (millis() - t < ms) {
    cliPoll();
    delay(20);
  }
}

// ── setup / loop ───────────────────────────────────────────────────────
static bool resetButtonHeld() {
  pinMode(PIN_RESET_WIFI, INPUT_PULLUP);
  if (digitalRead(PIN_RESET_WIFI) != LOW) return false;
  unsigned long t = millis();
  while (millis() - t < RESET_HOLD_MS) {
    if (digitalRead(PIN_RESET_WIFI) != LOW) return false;
    delay(20);
  }
  return true;
}

void setup() {
  Serial.begin(115200);
  rtc_gpio_hold_dis((gpio_num_t)PIN_FLASH_LED);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, LOW);
  buzzerInit();
  wakeCount++;
  delay(200);
  Serial.printf("\n\nSMMB box firmware %s · reset %s · type 'help'\n", FW_VERSION, resetReason());

  settingsLoad();
  wifiDiagInit();
  if (!signerSelfTest(false)) Serial.println("!! signer self-test FAILED — requests will be rejected");

  const bool fromSleep = esp_reset_reason() == ESP_RST_DEEPSLEEP;
  if (!fromSleep && resetButtonHeld()) {
    Serial.println("[reset] IO0 held 5 s → forget Wi-Fi");
    settingsForgetWifi();
    if (WiFi.status() == WL_CONNECTED) sendEvent("wifi_reset_button");
  }

  // ให้เวลาพิมพ์คำสั่งตั้งค่าตอนเปิดเครื่อง (เช่น url / box / secret) ก่อนเริ่มทำงาน
  if (!fromSleep) waitWithCli(1500);

  // ยังไม่ได้ตั้ง → โหมดตั้งค่า (รอจนตั้งสำเร็จ)
  while (!settingsHasWifi() || !settingsProvisioned()) {
    if (!settingsProvisioned()) Serial.println("[setup] box not provisioned (url / box / secret) — use the portal or serial commands");
    if (runSetupPortal(PORTAL_TIMEOUT_MS) && settingsProvisioned()) break;
  }

  if (!wifiConnect()) {
    beepError();
    if (fromSleep) {
      // ตื่นมาแล้วต่อไม่ได้ → หลับแล้วลองรอบถัดไป
      sleepUntilNextEvent();
      return;
    }
    // เปิดเครื่องแล้วต่อ Wi-Fi เดิมไม่ได้ → โหมดตั้งค่า (ระหว่างนั้นยังลองต่อ Wi-Fi เดิมได้จากหน้าเว็บ)
    if (!runSetupPortal(PORTAL_TIMEOUT_MS)) ESP.restart();
  }

  if (!fromSleep || !clockSet()) sendBoot();
}

void loop() {
  cliPoll();
  if (WiFi.status() != WL_CONNECTED && !wifiConnect()) {
    beepError();
    waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  }
  if (!booted && !clockSet()) {
    if (!sendBoot()) waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  }
  uint32_t now = nowUtc();
  // รายงานรายวัน: ถึงเวลาแล้ววันนี้ยังไม่ได้รายงาน
  if (now && localMinute(now) >= boxConfig.reportAt && lastReportDay != localDay(now)) {
    sendReport();
    return;
  }
  if (shouldListen()) {
    pollOnce();
    return;
  }
  sleepUntilNextEvent();
}
