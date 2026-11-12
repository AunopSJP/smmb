// เฟิร์มแวร์ตู้ SMMB (ESP32-CAM) — ลำดับการทำงานตาม docs/HARDWARE_FIRMWARE_GUIDE.md §4
//
// เปิดเครื่อง → (ไม่มี Wi-Fi / ไม่ได้ตั้งตู้ → โหมดตั้งค่า) → ต่อ Wi-Fi → POST boot
// → ลูป: อยู่ใน awake_s หลัง boot หรือในเวลาตรวจ → ถือ long-poll รองาน
//        ไม่ใช่ → ถึงเวลารายงาน → report · แล้วหลับลึกจนถึงเหตุการณ์ถัดไป
//
// คำสั่งทาง Serial (115200): พิมพ์ help

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <driver/rtc_io.h>
#include <esp_sleep.h>

#include <SmmbLink.h> // ทุกอย่างที่คุยกับเซิร์ฟเวอร์ (lib/smmb_link) — ไฟล์นี้เหลือแค่ฮาร์ดแวร์ + ลำดับเปิด/หลับ
#include "board.h"
#include "buzzer.h"
#include "camera_qr.h"
#include "debugview.h"
#include "portal.h"
#include "settings.h"
#include <esp_task_wdt.h>

// stack ของ loop: TLS + JSON + ถอด QR ต้องการมากกว่าค่าเริ่มต้น 8 KB
SET_LOOP_TASK_STACK_SIZE(16 * 1024);

// ── ค่าที่อยู่รอดตอนหลับลึก ───────────────────────────────────────────────
// (awakeUntil + ตัวนับ อยู่ใน linkRtc ของไลบรารี)
RTC_DATA_ATTR static uint32_t lastReportDay = 0; // วันที่ (เวลาไทย นับจาก epoch) ที่รายงานแล้ว

// ── เวลา ───────────────────────────────────────────────────────────────
static uint32_t localDay(uint32_t utc) { return (utc + TZ_OFFSET_S) / 86400; }
static uint16_t localMinute(uint32_t utc) { return ((utc + TZ_OFFSET_S) % 86400) / 60; }

static bool inWindow(uint32_t utc)
{
  uint16_t m = localMinute(utc);
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
    if (m >= boxConfig.winStart[i] && m < boxConfig.winEnd[i])
      return true;
  return false;
}

static bool shouldListen()
{
  // Bench/demo override: a persistent sleep-off setting keeps the board online for QR-triggered jobs.
  if (!settings.sleep || settings.debugCam)
    return true;
  uint32_t now = nowUtc();
  if (!now)
    return false;
  return now < linkRtc.awakeUntil || inWindow(now);
}

/** วินาทีถึงเหตุการณ์ถัดไป (ต้นช่วงเวลาตรวจ − 60 วิ หรือ เวลารายงาน) */
static uint32_t secondsToNextEvent(uint32_t now)
{
  uint16_t m = localMinute(now);
  uint32_t secOfDay = (now + TZ_OFFSET_S) % 86400;
  uint32_t best = 24 * 3600;
  auto consider = [&](uint16_t targetMin, int32_t earlyS)
  {
    int32_t target = (int32_t)targetMin * 60 - earlyS;
    int32_t diff = target - (int32_t)secOfDay;
    if (diff <= 0)
      diff += 86400;
    if ((uint32_t)diff < best)
      best = diff;
  };
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
    consider(boxConfig.winStart[i], WAKE_BEFORE_WINDOW_S);
  consider(boxConfig.reportAt, 0);
  (void)m;
  return max<uint32_t>(best, 30);
}

// ── Wi-Fi ──────────────────────────────────────────────────────────────
static bool wifiConnect()
{
  if (WiFi.status() == WL_CONNECTED)
    return true;
  if (!settingsHasWifi())
    return false;
  WiFi.mode(WIFI_STA);
  // ค่าเริ่มต้นปิด modem sleep: บน Wi-Fi อ่อนโหมดประหยัดไฟทำให้แพ็กเก็ตหายจน TLS ค้าง (ตู้หลุดออนไลน์)
  // แอดมินเปิดได้เฉพาะตู้ที่สัญญาณดี (config `wifi_power_save`) — กินไฟน้อยลงมาก ตู้ยังถือ long-poll ตื่นทันทีเมื่อสแกน
  WiFi.setSleep(boxConfig.wifiPowerSave);
  if (wifiJoin(nullptr))
  {
    Serial.printf("[wifi] connected \"%s\" IP %s RSSI %d ch %d\n", settings.wifiSsid.c_str(), WiFi.localIP().toString().c_str(),
                  WiFi.RSSI(), WiFi.channel());
    return true;
  }
  linkRtc.wifiFail++;
  Serial.printf("[wifi] connect failed (status %d)\n", (int)WiFi.status());
  return false;
}

// ── ต่อฮาร์ดแวร์เข้ากับไลบรารี (LinkHooks) ─────────────────────────────────
static LinkCredentials hookCredentials() { return {settings.url, settings.boxId, settings.secret}; }

static LinkScan hookScanQr(uint32_t timeoutMs)
{
  const QrRead q = cameraScanQr(timeoutMs);
  LinkScan r;
  r.ok = q.ok;
  r.text = q.text;
  r.ms = q.ms;
  r.frames = q.frames;
  r.qrShapes = q.qrShapes;
  return r;
}

static void hookWifiReset()
{
  settingsStashWifi(); // เก็บ Wi-Fi เดิมไว้ ตั้งใหม่ไม่ทันในเวลา → กลับไปใช้ของเดิม
  delay(300);
  ESP.restart(); // เปิดใหม่ → ไม่มี Wi-Fi → โหมดตั้งค่า (ปล่อย MAILBOX-xxxxxx)
}

static void linkSetup()
{
  LinkHooks h;
  h.credentials = hookCredentials;
  h.cameraStart = cameraStart;
  h.cameraStop = cameraStop;
  h.scanQr = hookScanQr;
  h.cameraAutoFlash = cameraAutoFlash;
  h.setPreviewSink = cameraSetPreviewSink;
  h.snapshotJpeg = cameraSnapshotJpeg; // Snapface หลังตรวจผ่าน
  h.beep = beepByName;
  h.saveConfig = settingsSaveConfig;
  h.wifiReset = hookWifiReset;
  linkBegin(h, FW_VERSION);
}

static bool sendBoot() { return linkBoot(); }

static bool sendReport()
{
  if (!linkReport())
    return false;
  lastReportDay = localDay(nowUtc());
  return true;
}

void cliPoll(); // ประกาศล่วงหน้า (นิยามด้านล่าง)
static void waitWithCli(unsigned long ms);

/** ถือ long-poll 1 รอบ · ต่อไม่ได้ / 401 → รอ 30 วิ (ระหว่างนั้นพิมพ์คำสั่ง serial ได้) */
static void pollOnce()
{
  // เปิดหน้าดูกล้องอยู่ → ถือ long-poll สั้น ๆ เพื่อให้เว็บเซิร์ฟเวอร์ของตู้ตอบทัน
  switch (linkPollOnce(settings.debugCam ? 3 : 25))
  {
  case LinkPoll::Idle:
  case LinkPoll::Handled:
    return;
  case LinkPoll::AuthFailed:
    waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  case LinkPoll::Offline:
    if (WiFi.status() != WL_CONNECTED)
      wifiConnect();
    waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  }
}

// ── หลับลึก ────────────────────────────────────────────────────────────
static void sleepUntilNextEvent()
{
  uint32_t now = nowUtc();
  uint32_t s = secondsToNextEvent(now);
  if (!settings.sleep || settings.debugCam)
  {
    static unsigned long lastMsg = 0;
    if (millis() - lastMsg > 60000)
    {
      Serial.printf("[sleep] (sleep off) next event in %u s — staying awake\n", s);
      lastMsg = millis();
    }
    unsigned long t = millis();
    while (millis() - t < 1000)
    {
      debugViewPoll();
      delay(10);
    }
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

static void printStatus()
{
  uint32_t now = nowUtc();
  Serial.printf("fw %s · box %s · url %s · secret %s · wifi \"%s\" (%s)\n", FW_VERSION, settings.boxId.c_str(), settings.url.c_str(),
                settings.secret.length() == 64 ? "set" : "MISSING", settings.wifiSsid.c_str(),
                WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "offline");
  Serial.printf("clock %s · local %02u:%02u · config v%u windows %u · in window %s · awake left %d s · sleep %s\n",
                now ? "set" : "NOT SET", now ? localMinute(now) / 60 : 0, now ? localMinute(now) % 60 : 0, boxConfig.ver,
                boxConfig.windowCount, now && inWindow(now) ? "yes" : "no", (int)(linkRtc.awakeUntil > now ? linkRtc.awakeUntil - now : 0),
                settings.sleep ? "on" : "off");
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
    Serial.printf("  window %02u:%02u-%02u:%02u\n", boxConfig.winStart[i] / 60, boxConfig.winStart[i] % 60, boxConfig.winEnd[i] / 60,
                  boxConfig.winEnd[i] % 60);
}

static void runCommand(String line)
{
  line.trim();
  if (!line.length())
    return;
  int sp = line.indexOf(' ');
  String cmd = sp < 0 ? line : line.substring(0, sp);
  String arg = sp < 0 ? "" : line.substring(sp + 1);
  arg.trim();
  cmd.toLowerCase();

  if (cmd == "help")
  {
    Serial.println(
        "commands:\n"
        "  status                 show settings / clock / config\n"
        "  wifi <ssid> <pass>     set home Wi-Fi (ssid without spaces; use the portal for others)\n"
        "  url <https://...>      server base URL, e.g. https://hub.sjp-dev.net/smmb-api\n"
        "  box <BX-00003>         box id\n"
        "  secret <64 hex>        device secret (not echoed)\n"
        "  sleep on|off           off (default) = always long-poll so a scan wakes the box at once; on = scheduled deep sleep (saves power, cannot be woken)\n"
        "  selftest               check request signing against the guide's test vectors\n"
        "  boot                   send POST /v1/box/boot now\n"
        "  report                 send POST /v1/box/report now\n"
        "  beep [ready|pass|retry|fail|error|wifi]  play a buzzer pattern (default ready)\n"
        "  identify               blink the flash LED (find this board)\n"
        "  scan [sec]             open the camera and try to read a QR (no server)\n"
        "  debugcam on|off        live camera page http://<box ip>/?k=<key> (test only, off by default)\n"
        "  camweb [sec]           the same page, temporarily (default 120 s)\n"
        "  portal                 start the Wi-Fi setup portal\n"
        "  forget                 forget Wi-Fi and restart\n"
        "  factory                erase ALL saved settings (Wi-Fi, url, box, secret, camera, config) and restart as a new board\n"
        "  reboot");
  }
  else if (cmd == "status")
  {
    printStatus();
  }
  else if (cmd == "wifi")
  {
    int s2 = arg.indexOf(' ');
    settings.wifiSsid = s2 < 0 ? arg : arg.substring(0, s2);
    settings.wifiPass = s2 < 0 ? "" : arg.substring(s2 + 1);
    settingsSave();
    Serial.printf("wifi set to \"%s\" — reboot to apply\n", settings.wifiSsid.c_str());
  }
  else if (cmd == "url")
  {
    while (arg.endsWith("/"))
      arg.remove(arg.length() - 1);
    settings.url = arg;
    settingsSave();
    Serial.printf("url = %s\n", settings.url.c_str());
  }
  else if (cmd == "box")
  {
    arg.toUpperCase();
    settings.boxId = arg;
    settingsSave();
    Serial.printf("box = %s\n", settings.boxId.c_str());
  }
  else if (cmd == "secret")
  {
    arg.toLowerCase();
    if (arg.length() != 64)
    {
      Serial.println("secret must be 64 hex characters");
      return;
    }
    settings.secret = arg;
    settingsSave();
    Serial.println("secret saved");
  }
  else if (cmd == "sleep")
  {
    settings.sleep = arg != "off";
    settingsSave();
    Serial.printf("sleep %s\n", settings.sleep ? "on" : "off");
  }
  else if (cmd == "selftest")
  {
    Serial.println(linkSelfTest(true) ? "selftest PASS" : "selftest FAIL");
  }
  else if (cmd == "boot")
  {
    if (wifiConnect())
      sendBoot();
  }
  else if (cmd == "report")
  {
    if (wifiConnect())
      sendReport();
  }
  else if (cmd == "scan")
  {
    uint32_t sec = arg.length() ? arg.toInt() : 20;
    if (cameraStart())
    {
      cameraAutoFlash(boxConfig.flashWhenDark);
      QrRead q = cameraScanQr(sec * 1000);
      Serial.printf("scan: %s\n", q.ok ? q.text.c_str() : "(nothing)");
      cameraStop();
    }
  }
  else if (cmd == "debugcam")
  {
    // หน้าเว็บดูภาพกล้องตอนทดสอบ — ปิดเป็นค่าเริ่มต้น (กล้องตู้มองถนน) · เก็บค่าถาวร
    if (arg == "on" || arg == "off")
    {
      settings.debugCam = arg == "on";
      settingsSave();
      if (settings.debugCam)
      {
        if (WiFi.status() == WL_CONNECTED)
          debugViewStart();
        else
          Serial.println("debugcam on — จะเปิดเมื่อต่อ Wi-Fi ได้");
      }
      else
      {
        debugViewStop();
        Serial.println("debugcam off");
      }
    }
    else
    {
      Serial.printf("debugcam %s%s\n", settings.debugCam ? "on" : "off", debugViewRunning() ? (String(" · ") + debugViewUrl()).c_str() : "");
    }
  }
  else if (cmd == "camweb")
  {
    // ทางลัด: เปิดหน้าดูกล้องชั่วคราว N วินาที (ไม่เก็บค่า) — ปิดเองเมื่อครบเวลา
    // camweb [วินาที] [scan] — ค่าเริ่มต้น "ดูภาพอย่างเดียว": ไม่ถอดรหัส QR ไม่คุยกับเซิร์ฟเวอร์ · ใส่ scan = ให้หาและถอดรหัส QR ด้วย
    uint32_t sec = arg.toInt() > 0 ? arg.toInt() : 120;
    cameraPreviewDecode(arg.indexOf("scan") >= 0);
    if (WiFi.status() != WL_CONNECTED)
    {
      Serial.println("camweb: ยังไม่ต่อ Wi-Fi");
    }
    else
    {
      const bool wasRunning = debugViewRunning();
      debugViewStart();
      Serial.printf("camweb: เปิด %s (%u วิ)\n", debugViewUrl().c_str(), sec);
      unsigned long t = millis();
      while (millis() - t < sec * 1000UL)
      {
        debugViewPoll();
        debugViewIdleCheck();
        cliPoll();
        delay(5);
      }
      if (!wasRunning && !settings.debugCam)
        debugViewStop();
      cameraPreviewDecode(true);
      Serial.println("camweb: ปิดแล้ว");
    }
  }
  else if (cmd == "camraw")
  {
    rawViewRun(arg.toInt() > 0 ? arg.toInt() : 300); // ภาพสดดิบ MJPEG ไม่ผ่านตัวกรอง/ถอดรหัส
  }
  else if (cmd == "snap")
  {
    cameraDumpFrame(); // ดูภาพที่กล้องเห็น (python แปลง hex เป็นรูป)
  }
  else if (cmd == "portal")
  {
    debugViewStop();
    if (runSetupPortal(PORTAL_TIMEOUT_MS))
      ESP.restart();
  }
  else if (cmd == "forget")
  {
    settingsForgetWifi();
    ESP.restart();
  }
  else if (cmd == "factory")
  {
    // คืนเป็นบอร์ดใหม่: ลบทุกอย่างที่จำไว้ (Wi-Fi · url · box · secret · ค่ากล้อง · config) แล้วเข้าโหมดตั้งค่า
    Preferences wipe;
    wipe.begin("smmb", false);
    wipe.clear();
    wipe.end();
    Serial.println("[factory] all saved settings erased - restarting into setup mode");
    delay(300);
    ESP.restart();
  }
  else if (cmd == "cam")
  {
    // cam size qvga|vga|svga|xga · cam xclk 10|20 · cam ae -2..2 — ปรับกล้องโดยไม่ต้องแฟลชใหม่ (มีผลหลังรีบูต)
    int sp2 = arg.indexOf(' ');
    String what = sp2 < 0 ? arg : arg.substring(0, sp2);
    String val = sp2 < 0 ? "" : arg.substring(sp2 + 1);
    val.trim();
    if (what == "size" && (val == "qvga" || val == "vga" || val == "svga" || val == "xga"))
      settings.camSize = val;
    else if (what == "xclk" && (val == "10" || val == "20"))
      settings.camXclk = val.toInt();
    else if (what == "bench")
      cameraBench();
    else if (what == "q" && val.toInt() >= 4 && val.toInt() <= 30)
      settings.camQ = val.toInt();
    else if (what == "sharp" && val.toInt() >= -2 && val.toInt() <= 2)
      settings.camSharp = val.toInt();
    else if (what == "flip" && val.toInt() >= 0 && val.toInt() <= 3)
      settings.camFlip = val.toInt(); // 0 ไม่กลับ · 1 บน-ล่าง · 2 ซ้าย-ขวา · 3 หมุน 180°
    else if (what == "fmt" && (val == "jpeg" || val == "gray"))
      settings.camJpeg = val == "jpeg";
    else if (what == "ae" && val.toInt() >= -2 && val.toInt() <= 2)
      settings.camAe = val.toInt();
    else
      Serial.println("usage: cam size qvga|vga|svga|xga · cam xclk 10|20 · cam fmt jpeg|gray · cam q 4..30 · cam sharp -2..2 · cam ae -2..2");
    settingsSave();
    Serial.printf("cam size=%s xclk=%uMHz fmt=%s q=%u sharp=%d ae=%d — applies on next camera start\n", settings.camSize.c_str(), settings.camXclk, settings.camJpeg ? "jpeg" : "gray", settings.camQ, settings.camSharp, settings.camAe);
  }
  else if (cmd == "beep")
  {
    String name = arg.length() ? arg : "ready";
    name.toLowerCase();
    if (!beepByName(name.c_str()))
      Serial.println("usage: beep [ready|pass|retry|fail|error|wifi]");
  }
  else if (cmd == "identify")
  {
    Serial.println("[identify] blink flash LED");
    for (int i = 0; i < 6; i++)
    {
      digitalWrite(PIN_FLASH_LED, HIGH);
      delay(120);
      digitalWrite(PIN_FLASH_LED, LOW);
      delay(120);
    }
  }
  else if (cmd == "reboot")
  {
    ESP.restart();
  }
  else
  {
    Serial.println("unknown command — type help");
  }
}

void cliPoll()
{
  while (Serial.available())
  {
    char c = (char)Serial.read();
    if (c == '\r')
      continue;
    if (c == '\n')
    {
      String line = cliLine;
      cliLine = "";
      runCommand(line);
    }
    else if (cliLine.length() < 200)
    {
      cliLine += c;
    }
  }
}

/** รอคำสั่ง Serial ระหว่าง delay (ให้พิมพ์คำสั่งได้ตลอด) */
static void waitWithCli(unsigned long ms)
{
  unsigned long t = millis();
  while (millis() - t < ms)
  {
    esp_task_wdt_reset();
    cliPoll();
    debugViewPoll();
    delay(20);
  }
}

// ── setup / loop ───────────────────────────────────────────────────────
void setup()
{
  Serial.begin(115200);
  rtc_gpio_hold_dis((gpio_num_t)PIN_FLASH_LED);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, LOW);
  buzzerInit();
  linkRtc.wakeCount++;
  delay(200);
  Serial.printf("\n\nSMMB box firmware %s · reset %s · type 'help'\n", FW_VERSION, linkResetReason());

  settingsLoad();
  linkSetup();
  wifiDiagInit();
  if (!linkSelfTest(false))
    Serial.println("!! signer self-test FAILED — requests will be rejected");

  const bool fromSleep = esp_reset_reason() == ESP_RST_DEEPSLEEP;

  // ให้เวลาพิมพ์คำสั่งตั้งค่าตอนเปิดเครื่อง (เช่น url / box / secret) ก่อนเริ่มทำงาน
  if (!fromSleep)
    waitWithCli(1500);

  // ยังไม่ได้ตั้ง → โหมดตั้งค่า (รอจนตั้งสำเร็จ)
  while (!settingsHasWifi() || !settingsProvisioned())
  {
    if (!settingsProvisioned())
      Serial.println("[setup] box not provisioned (url / box / secret) — use the portal or serial commands");
    if (runSetupPortal(PORTAL_TIMEOUT_MS) && settingsProvisioned())
    {
      settingsClearStashedWifi();
      break;
    }
    // เจ้าของสั่งเปลี่ยน Wi-Fi แต่ตั้งใหม่ไม่ทันในเวลา → กลับไปใช้ Wi-Fi เดิม (กันตู้หลุดออนไลน์ถาวร)
    if (settingsRestoreWifi())
    {
      Serial.println("[setup] no new Wi-Fi in time — back to the previous Wi-Fi");
      break;
    }
  }

  if (!wifiConnect())
  {
    beepError();
    if (fromSleep)
    {
      // ตื่นมาแล้วต่อไม่ได้ → หลับแล้วลองรอบถัดไป
      sleepUntilNextEvent();
      return;
    }
    // เปิดเครื่องแล้วต่อ Wi-Fi เดิมไม่ได้ → โหมดตั้งค่า (ระหว่างนั้นยังลองต่อ Wi-Fi เดิมได้จากหน้าเว็บ)
    if (!runSetupPortal(PORTAL_TIMEOUT_MS))
      ESP.restart();
  }

  if (!fromSleep || !clockSet())
    sendBoot();

  // กันค้างเงียบ: ถ้าลูปหลักไม่ขยับเกิน 180 วิ (เช่น TLS/Wi-Fi ค้าง) ให้รีเซ็ตตัวเอง แทนที่จะรอคนถอดไฟ
  // (รอบเดียวของลูปที่นานที่สุด = long-poll 55 วิ หรือสแกน 3 × 20 วิ จึงเผื่อไว้)
  esp_task_wdt_init(180, true);
  esp_task_wdt_add(nullptr);
}

void loop()
{
  esp_task_wdt_reset();
  cliPoll();
  if (linkLanOtaBusy())
  {
    delay(50);
    return;
  }
  linkLanOtaStart(apName());
  if (settings.debugCam && WiFi.status() == WL_CONNECTED)
  {
    debugViewStart();
    debugViewPoll();
    debugViewIdleCheck();
  }
  if (WiFi.status() != WL_CONNECTED && !wifiConnect())
  {
    beepError();
    waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  }
  if (!linkBooted() && !clockSet())
  {
    if (!sendBoot())
      waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  }
  uint32_t now = nowUtc();
  // รายงานรายวัน: ถึงเวลาแล้ววันนี้ยังไม่ได้รายงาน
  if (now && localMinute(now) >= boxConfig.reportAt && lastReportDay != localDay(now))
  {
    sendReport();
    return;
  }
  if (shouldListen())
  {
    pollOnce();
    return;
  }
  sleepUntilNextEvent();
}
