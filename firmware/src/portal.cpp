#include "portal.h"

#include <DNSServer.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_task_wdt.h>

#include "board.h"
#include "buzzer.h"
#include "settings.h"

void cliPoll();  // main.cpp — คำสั่งทาง Serial ใช้ได้ระหว่างอยู่ในโหมดตั้งค่า

static WebServer server(80);
static DNSServer dns;
static String networksHtml;
static String lastError;
static bool done = false;

static String esc(const String& s) {
  String o;
  for (char c : s) {
    if (c == '<') o += "&lt;";
    else if (c == '>') o += "&gt;";
    else if (c == '&') o += "&amp;";
    else if (c == '"') o += "&quot;";
    else o += c;
  }
  return o;
}

static void scanNetworks() {
  int n = WiFi.scanNetworks(false, false);
  networksHtml = "";
  for (int i = 0; i < n && i < 20; i++) {
    String ssid = WiFi.SSID(i);
    if (!ssid.length() || networksHtml.indexOf(">" + esc(ssid) + "<") >= 0) continue;
    int ch = WiFi.channel(i);
    networksHtml += "<option value=\"" + esc(ssid) + "\"" + (ssid == settings.wifiSsid ? " selected" : "") + ">" + esc(ssid) +
                    "</option>";
    (void)ch;  // ESP32 รุ่นนี้เห็นเฉพาะ 2.4 GHz อยู่แล้ว
  }
  WiFi.scanDelete();
}

static const char PAGE_HEAD[] = R"HTML(<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ตั้ง Wi-Fi ให้ตู้</title>
<style>body{font-family:sans-serif;margin:0;padding:16px;max-width:480px;margin:auto;background:#fafafa;color:#222}
h1{font-size:1.3rem;color:#D7141E}label{display:block;margin:12px 0 4px;font-weight:700}
input,select{width:100%;box-sizing:border-box;padding:12px;font-size:1rem;border:1.5px solid #ccc;border-radius:10px}
button{width:100%;margin-top:18px;padding:14px;font-size:1.05rem;font-weight:700;border:0;border-radius:12px;background:#D7141E;color:#fff}
.box{background:#fff;padding:14px;border-radius:12px;margin:12px 0}.muted{color:#777;font-size:.85rem}.err{color:#C81E1E;font-weight:700}
details summary{font-weight:700;cursor:pointer}</style></head><body>)HTML";

static void handleRoot() {
  String h = PAGE_HEAD;
  h += "<h1>ตั้ง Wi-Fi ให้ตู้ " + esc(apName()) + "</h1>";
  h += "<p class=muted>หน้านี้มาจากตู้ ไม่ต้องใช้เน็ต · ตู้ใช้ได้เฉพาะ Wi-Fi 2.4 GHz</p>";
  if (lastError.length()) h += "<p class=err>" + esc(lastError) + "</p>";
  h += "<form method=post action=/save><div class=box>";
  h += "<label>Wi-Fi บ้าน</label><select name=ssid>" + networksHtml + "<option value=''>— พิมพ์ชื่อเอง —</option></select>";
  h += "<label>หรือพิมพ์ชื่อ Wi-Fi</label><input name=ssid2 autocomplete=off placeholder='ถ้าไม่เห็นในรายการ'>";
  h += "<label>รหัส Wi-Fi</label><input name=pass type=password autocomplete=off>";
  h += "</div><details class=box><summary>ตั้งค่าอุปกรณ์ (ช่าง)</summary>";
  h += "<label>URL เซิร์ฟเวอร์</label><input name=url value=\"" + esc(settings.url) + "\" placeholder='https://hub.sjp-dev.net/smmb-api'>";
  h += "<label>รหัสตู้ (box_id)</label><input name=box value=\"" + esc(settings.boxId) + "\" placeholder='BX-00003'>";
  h += "<label>รหัสลับประจำตู้ (device_secret)</label><input name=secret autocomplete=off placeholder='" +
       String(settings.secret.length() == 64 ? "ตั้งไว้แล้ว — เว้นว่าง = ใช้ค่าเดิม" : "64 ตัว จากหลังบ้าน") + "'>";
  h += "<p class=muted>ได้จากหลังบ้าน → ตู้ → รายละเอียดตู้</p></details>";
  h += "<button>เชื่อมต่อ</button></form><p class=muted>firmware " FW_VERSION "</p></body></html>";
  server.send(200, "text/html; charset=utf-8", h);
}

static void handleSave() {
  String ssid = server.arg("ssid2").length() ? server.arg("ssid2") : server.arg("ssid");
  ssid.trim();
  String url = server.arg("url"), box = server.arg("box"), secret = server.arg("secret");
  url.trim();
  box.trim();
  box.toUpperCase();
  secret.trim();
  secret.toLowerCase();
  if (!ssid.length()) {
    lastError = "เลือกหรือพิมพ์ชื่อ Wi-Fi ก่อน";
    server.sendHeader("Location", "/");
    server.send(302);
    return;
  }
  if (secret.length() && secret.length() != 64) {
    lastError = "รหัสลับต้องยาว 64 ตัว";
    server.sendHeader("Location", "/");
    server.send(302);
    return;
  }
  settings.wifiSsid = ssid;
  settings.wifiPass = server.arg("pass");
  if (url.length()) settings.url = url;
  if (box.length()) settings.boxId = box;
  if (secret.length()) settings.secret = secret;
  // บันทึกทันที — ต่อ Wi-Fi ไม่ผ่านก็ไม่ต้องกรอกรหัสตู้/รหัสลับซ้ำ
  settingsSave();

  String h = PAGE_HEAD;
  h += "<h1>กำลังเชื่อมต่อ " + esc(ssid) + "…</h1><p>ถ้าสำเร็จ ตู้จะปี๊บ 1 ครั้ง และสัญญาณ " + esc(apName()) +
       " จะหายไป — ให้มือถือกลับไปใช้เน็ตปกติ แล้วดูในแอปช่างว่า \"ตู้ต่อเน็ตแล้ว\"</p>"
       "<p>ถ้าไม่สำเร็จ ตู้จะปี๊บยาว 1 + สั้น 2 แล้วกลับมาหน้านี้ (เปิด 192.168.4.1 อีกครั้ง)</p></body></html>";
  server.send(200, "text/html; charset=utf-8", h);
  delay(300);

  Serial.printf("[portal] trying Wi-Fi \"%s\"\n", ssid.c_str());
  wifiJoin([] { dns.processNextRequest(); });
  if (WiFi.status() == WL_CONNECTED) {
    settingsSave();
    lastError = "";
    done = true;
    Serial.printf("[portal] connected, IP %s\n", WiFi.localIP().toString().c_str());
  } else {
    uint8_t reason = wifiLastReason();
    lastError = String("ต่อ \"") + ssid + "\" ไม่ได้: " + wifiReasonText(reason) + " (รหัส " + String(reason) + ")";
    Serial.printf("[portal] connect failed (status %d, reason %u %s)\n", (int)WiFi.status(), reason, wifiReasonText(reason));
    WiFi.disconnect(false);
    beepError();
  }
}

static void redirectHome() {
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/");
  server.send(302, "text/plain", "");
}

bool runSetupPortal(unsigned long timeoutMs) {
  done = false;
  lastError = "";
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP_STA);
  scanNetworks();
  const String ap = apName();
  WiFi.softAP(ap.c_str());
  delay(200);
  dns.start(53, "*", WiFi.softAPIP());
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  // หน้าเช็กเน็ตของ Android / iPhone / Windows → เด้งมาหน้านี้
  server.on("/generate_204", redirectHome);
  server.on("/hotspot-detect.html", redirectHome);
  server.on("/connecttest.txt", redirectHome);
  server.onNotFound(redirectHome);
  server.begin();
  Serial.printf("[portal] setup mode: join Wi-Fi \"%s\" then open http://%s\n", ap.c_str(), WiFi.softAPIP().toString().c_str());

  unsigned long start = millis();
  while (!done && millis() - start < timeoutMs) {
    esp_task_wdt_reset();  // โหมดตั้งค่าอาจนานถึง 10 นาที (ถ้าลูปหลักเปิด watchdog อยู่)
    dns.processNextRequest();
    server.handleClient();
    cliPoll();
    delay(5);
  }
  server.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  return done;
}
