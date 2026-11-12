#include "portal.h"

#include <DNSServer.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_task_wdt.h>

#include "board.h"
#include "buzzer.h"
#include "settings.h"

void cliPoll(); // main.cpp — คำสั่งทาง Serial ใช้ได้ระหว่างอยู่ในโหมดตั้งค่า

static WebServer server(80);
static DNSServer dns;
static String networksHtml;
static String lastError;
static bool done = false;
// ตู้ที่ตั้งค่าครบแล้ว (url + box + secret) → หน้าเว็บแก้ได้แค่ Wi-Fi
// SoftAP ไม่มีรหัสผ่าน และตู้ตั้งอยู่หน้าบ้าน — ถ้าไม่ล็อก คนแถวนั้นทำให้ตู้หลุด Wi-Fi แล้วเปลี่ยน URL ไปเซิร์ฟเวอร์ปลอมได้
// ช่างเปลี่ยนค่าอุปกรณ์ได้ทางสาย Serial เท่านั้น (url / box / secret / factory)
static bool deviceLocked = false;

/** https ได้เสมอ · http ได้เฉพาะเครื่องในวง LAN (ทดสอบบอร์ดกับ dev:mock) — กันชี้ตู้ไปเซิร์ฟเวอร์ภายนอกแบบไม่เข้ารหัส */
static bool urlAllowed(const String &url)
{
  if (url.startsWith("https://"))
    return url.length() > 8;
  if (!url.startsWith("http://"))
    return false;
  String host = url.substring(7);
  int end = host.length();
  for (int i = 0; i < (int)host.length(); i++)
    if (host[i] == ':' || host[i] == '/')
    {
      end = i;
      break;
    }
  host = host.substring(0, end);
  host.toLowerCase();
  if (host.endsWith(".local") || host.startsWith("10.") || host.startsWith("192.168."))
    return true;
  if (host.startsWith("172."))
  {
    int second = host.substring(4).toInt();
    return second >= 16 && second <= 31;
  }
  return false;
}

static String esc(const String &s)
{
  String o;
  for (char c : s)
  {
    if (c == '<')
      o += "&lt;";
    else if (c == '>')
      o += "&gt;";
    else if (c == '&')
      o += "&amp;";
    else if (c == '"')
      o += "&quot;";
    else
      o += c;
  }
  return o;
}

static void scanNetworks()
{
  int n = WiFi.scanNetworks(false, false);
  networksHtml = "<option value=''>— เลือก Wi-Fi จากรายการ —</option>";
  for (int i = 0; i < n && i < 20; i++)
  {
    String ssid = WiFi.SSID(i);
    if (!ssid.length() || networksHtml.indexOf(">" + esc(ssid) + "<") >= 0)
      continue;
    int ch = WiFi.channel(i);
    networksHtml += "<option value=\"" + esc(ssid) + "\"" + (ssid == settings.wifiSsid ? " selected" : "") + ">" + esc(ssid) +
                    "</option>";
    (void)ch; // ESP32 รุ่นนี้เห็นเฉพาะ 2.4 GHz อยู่แล้ว
  }
  WiFi.scanDelete();
}

// เซิร์ฟเวอร์ตั้งต้น — ช่าง/คนตั้งค่าไม่ต้องพิมพ์ URL เอง (แก้ได้ด้วย -DDEFAULT_SERVER_URL=\"...\" ใน platformio.ini)
#ifndef DEFAULT_SERVER_URL
#define DEFAULT_SERVER_URL "https://hub.sjp-dev.net/smmb-api"
#endif

static const char PAGE_HEAD[] = R"HTML(<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#9A2F36"><title>ตั้งค่า Wi-Fi · SMMB</title>
<style>
:root{--brand:#9A2F36;--brand-dark:#6F1F25;--bg:#F3F1ED;--surface:#fff;--text:#1F1D1B;--muted:#6F675E;--border:#E4DFD8;--danger:#A5332F;--success:#1C6F4B}
*{box-sizing:border-box}
body{margin:0;padding:20px 16px 40px;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans Thai",sans-serif;line-height:1.55}
.wrap{max-width:520px;margin:0 auto}
.brand{display:flex;align-items:center;gap:12px;margin:8px 0 16px}
.logo{width:44px;height:44px;border-radius:12px;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:800;font-size:20px;flex:none}
h1{font-size:22px;line-height:1.3;margin:0}h2{font-size:18px;line-height:1.3;margin:0 0 6px}
.sub{color:var(--muted);font-size:14px;margin:3px 0 0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px;margin:14px 0}
.steps{display:flex;gap:8px;margin:14px 0}
.step{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px;font-size:12px;color:var(--muted)}
.step b{display:block;color:var(--brand);font-size:16px}
label{display:block;margin:14px 0 6px;font-weight:700;font-size:14px}
input,select{width:100%;padding:13px 14px;font-size:16px;border:1.5px solid var(--border);border-radius:12px;background:#fff;color:var(--text)}
input:focus,select:focus{outline:2px solid var(--brand);outline-offset:1px;border-color:var(--brand)}
.hint{color:var(--muted);font-size:12.5px;margin:6px 0 0}
.alert{background:#FBECEA;color:var(--danger);border:1px solid #F0C9C5;border-radius:12px;padding:12px 14px;font-weight:700}
.ok{background:#E8F4EE;color:var(--success);border:1px solid #C5E3D4;border-radius:12px;padding:12px 14px;font-weight:700}
button{width:100%;margin-top:18px;padding:15px;font-size:16px;font-weight:800;border:0;border-radius:12px;background:var(--brand);color:#fff;font-family:inherit}
button:active{background:var(--brand-dark)}
.manual{background:#FBF2DF;color:#8A5A12;border:1px solid #EAD8B0;border-radius:12px;padding:12px 14px;font-size:13px;margin:14px 0}
.manual b{display:block}
details{margin-top:14px}summary{cursor:pointer;font-weight:700;color:var(--brand)}
.muted{color:var(--muted);font-size:13px}a{color:var(--brand);font-weight:700}
.pw{display:flex;gap:8px}.pw input{flex:1}.pw button{width:auto;margin:0;padding:0 14px;font-size:13px;background:var(--surface);color:var(--brand);border:1.5px solid var(--border)}
@media(max-width:380px){h1{font-size:20px}.steps{display:none}body{padding:16px 12px 32px}}
</style></head><body><div class="wrap">)HTML";

static void handleRoot()
{
  String h = PAGE_HEAD;
  h += "<div class=brand><div class=logo>S</div><div><h1>ตั้งค่า Wi-Fi ให้ตู้</h1><p class=sub>" + esc(apName()) +
       " · ไม่ต้องใช้อินเทอร์เน็ต</p></div></div>";
  h += "<div class=manual><b>ไม่เด้งเข้าหน้านี้อัตโนมัติ?</b>เปิด Chrome หรือ Samsung Internet แล้วพิมพ์ <b>http://192.168.4.1</b></div>";
  if (lastError.length())
    h += "<div class=alert>" + esc(lastError) + "</div>";
  h += "<div class=steps><div class=step><b>1</b>เลือก Wi-Fi บ้าน</div><div class=step><b>2</b>ใส่รหัส</div><div class=step><b>3</b>กดเชื่อมต่อ</div></div>";
  h += "<form method=post action=/save class=card>";
  h += "<label for=ssid>Wi-Fi บ้าน (2.4 GHz)</label><select id=ssid name=ssid>" + networksHtml +
       "<option value=''>— พิมพ์ชื่อเองด้านล่าง —</option></select>";
  h += "<label for=ssid2>หรือพิมพ์ชื่อ Wi-Fi</label><input id=ssid2 name=ssid2 autocomplete=off autocapitalize=none autocorrect=off spellcheck=false placeholder='ชื่อ Wi-Fi ที่ไม่เห็นในรายการ'>";
  h += "<label for=pass>รหัส Wi-Fi</label><div class=pw><input id=pass name=pass type=password autocomplete=off placeholder='รหัสผ่าน Wi-Fi'><button type=button id=pwbtn onclick=togglePw()>แสดง</button></div>";
  h += "<p class=hint>ตู้รองรับ Wi-Fi 2.4 GHz เท่านั้น · ถ้าไม่เห็นชื่อ Wi-Fi ให้พิมพ์เอง</p>";
  if (deviceLocked)
  {
    // ล็อกอุปกรณ์แล้ว: หน้านี้แก้ได้เฉพาะ Wi-Fi
  }
  else
  {
    h += "<details><summary>ตั้งค่าอุปกรณ์ (ช่าง)</summary>";
    h += "<label for=url>URL เซิร์ฟเวอร์</label><input id=url name=url value=\"" +
         esc(settings.url.length() ? settings.url : String(DEFAULT_SERVER_URL)) +
         "\" placeholder='https://hub.sjp-dev.net/smmb-api'>";
    h += "<label for=box>รหัสตู้ (box_id)</label><input id=box name=box value=\"" + esc(settings.boxId) +
         "\" placeholder='BX-00003'>";
    h += "<label for=secret>รหัสลับประจำตู้ (device_secret)</label><input id=secret name=secret autocomplete=off placeholder='" +
         String(settings.secret.length() == 64 ? "ตั้งไว้แล้ว — เว้นว่าง = ใช้ค่าเดิม" : "64 ตัว จากหลังบ้าน") + "'>";
    h += "<p class=hint>ได้จากหลังบ้าน → ตู้ → รายละเอียดตู้ · URL ต้องเป็น https:// (http:// ได้เฉพาะเครื่องในวง LAN)</p></details>";
  }
  h += "<button type=submit>เชื่อมต่อ Wi-Fi</button></form>";
  if (deviceLocked)
  {
    h += "<div class=card><p class=muted>ตู้ " + esc(settings.boxId) +
         " ตั้งค่าอุปกรณ์ครบแล้ว — หน้านี้เปลี่ยนได้เฉพาะ Wi-Fi · เปลี่ยนเซิร์ฟเวอร์/รหัสตู้ต้องต่อสาย Serial</p></div>";
  }
  h += "<p class=muted>เฟิร์มแวร์ " FW_VERSION " · ถ้าเชื่อมต่อไม่สำเร็จ ให้กลับมาเปิดหน้านี้ใหม่</p>";
  h += "<script>function togglePw(){var p=document.getElementById('pass'),b=document.getElementById('pwbtn');if(p.type==='password'){p.type='text';b.textContent='ซ่อน'}else{p.type='password';b.textContent='แสดง'}}</script>";
  h += "</div></body></html>";
  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  server.send(200, "text/html; charset=utf-8", h);
}

static void handleSave()
{
  String ssid = server.arg("ssid2").length() ? server.arg("ssid2") : server.arg("ssid");
  ssid.trim();
  // ตู้ที่ล็อกแล้ว: ไม่สนค่าอุปกรณ์ที่ส่งมา (กันคนยิง POST /save ตรง ๆ โดยไม่ผ่านหน้าเว็บ)
  String url = deviceLocked ? String() : server.arg("url");
  String box = deviceLocked ? String() : server.arg("box");
  String secret = deviceLocked ? String() : server.arg("secret");
  url.trim();
  while (url.endsWith("/"))
    url.remove(url.length() - 1);
  box.trim();
  box.toUpperCase();
  secret.trim();
  secret.toLowerCase();
  if (!ssid.length())
  {
    lastError = "เลือกหรือพิมพ์ชื่อ Wi-Fi ก่อน";
    server.sendHeader("Location", "/");
    server.send(302);
    return;
  }
  if (url.length() && !urlAllowed(url))
  {
    lastError = "URL เซิร์ฟเวอร์ต้องขึ้นต้นด้วย https:// (http:// ได้เฉพาะเครื่องในวง LAN)";
    server.sendHeader("Location", "/");
    server.send(302);
    return;
  }
  if (box.length() && !box.startsWith("BX-"))
  {
    lastError = "รหัสตู้ต้องขึ้นต้นด้วย BX-";
    server.sendHeader("Location", "/");
    server.send(302);
    return;
  }
  if (secret.length() && secret.length() != 64)
  {
    lastError = "รหัสลับต้องยาว 64 ตัว";
    server.sendHeader("Location", "/");
    server.send(302);
    return;
  }
  settings.wifiSsid = ssid;
  settings.wifiPass = server.arg("pass");
  if (url.length())
    settings.url = url;
  else if (!settings.url.length())
    settings.url = DEFAULT_SERVER_URL; // เว้นว่าง = ใช้เซิร์ฟเวอร์ตั้งต้น (ไม่งั้นตู้ค้างในโหมดตั้งค่าเพราะ URL ว่าง)
  if (box.length())
    settings.boxId = box;
  if (secret.length())
    settings.secret = secret;
  // บันทึกทันที — ต่อ Wi-Fi ไม่ผ่านก็ไม่ต้องกรอกรหัสตู้/รหัสลับซ้ำ
  settingsSave();

  String h = PAGE_HEAD;
  h += "<div class=brand><div class=logo>S</div><div><h1>กำลังเชื่อมต่อ Wi-Fi</h1><p class=sub>" + esc(apName()) +
       "</p></div></div>";
  h += "<div class=ok>กำลังเชื่อมต่อ \"" + esc(ssid) + "\"…</div>";
  h += "<div class=card><p>ถ้าสำเร็จ สัญญาณ " + esc(apName()) +
       " จะหายไป และบอร์ดจะเริ่มทำงาน — ให้มือถือกลับไปใช้เน็ตปกติ</p>";
  h += "<p>ถ้าไม่สำเร็จ หน้านี้จะกลับมาให้ลองใหม่</p>";
  h += "<p class=hint>หน้านี้จะลองโหลดใหม่ใน 20 วินาที — ถ้า Wi-Fi หายไป ถือว่าสำเร็จ · ถ้ายังเชื่อมต่อไม่เสร็จ ให้รอแล้วเปิด http://192.168.4.1 อีกครั้ง</p>";
  h += "<p><a href=\"/\">กลับไปหน้าตั้งค่า</a></p></div>";
  h += "<script>setTimeout(function(){location.href='/'},20000)</script>";
  h += "</div></body></html>";
  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  server.send(200, "text/html; charset=utf-8", h);
  delay(300);

  Serial.printf("[portal] trying Wi-Fi \"%s\"\n", ssid.c_str());
  wifiJoin([]
           { dns.processNextRequest(); });
  if (WiFi.status() == WL_CONNECTED)
  {
    settingsSave();
    lastError = "";
    done = true;
    Serial.printf("[portal] connected, IP %s\n", WiFi.localIP().toString().c_str());
  }
  else
  {
    uint8_t reason = wifiLastReason();
    lastError = String("ต่อ \"") + ssid + "\" ไม่ได้: " + wifiReasonText(reason) + " (รหัส " + String(reason) + ")";
    Serial.printf("[portal] connect failed (status %d, reason %u %s)\n", (int)WiFi.status(), reason, wifiReasonText(reason));
    WiFi.disconnect(false);
    beepError();
  }
}

static void redirectHome()
{
  const String target = String("http://") + WiFi.softAPIP().toString() + "/";
  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  server.sendHeader("Connection", "close");
  server.sendHeader("Location", target);
  String body = "<!doctype html><html lang=th><head><meta charset=utf-8><meta http-equiv=refresh content=\"0;url=" +
                target + "\"></head><body style=\"font-family:sans-serif;padding:20px\"><a href=\"" + target +
                "\">เปิดหน้าตั้งค่า Wi-Fi</a></body></html>";
  server.send(302, "text/html; charset=utf-8", body);
}

bool runSetupPortal(unsigned long timeoutMs)
{
  done = false;
  lastError = "";
  deviceLocked = settingsProvisioned();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP_STA);
  scanNetworks();
  const String ap = apName();
  WiFi.softAP(ap.c_str());
  delay(200);
  dns.start(53, "*", WiFi.softAPIP());
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  // Captive portal probes: Android/Samsung, iOS, Windows → redirect to setup
  server.on("/generate_204", HTTP_GET, redirectHome);
  server.on("/gen_204", HTTP_GET, redirectHome);
  server.on("/hotspot-detect.html", HTTP_GET, redirectHome);
  server.on("/library/test/success.html", HTTP_GET, redirectHome);
  server.on("/connecttest.txt", HTTP_GET, redirectHome);
  server.on("/ncsi.txt", HTTP_GET, redirectHome);
  server.on("/redirect", HTTP_GET, redirectHome);
  server.on("/success.txt", HTTP_GET, redirectHome);
  server.on("/canonical.html", HTTP_GET, redirectHome);
  server.on("/captiveportal.html", HTTP_GET, redirectHome);
  server.onNotFound(redirectHome);
  server.begin();
  Serial.printf("[portal] setup mode: join Wi-Fi \"%s\" then open http://%s\n", ap.c_str(), WiFi.softAPIP().toString().c_str());

  unsigned long start = millis();
  while (!done && millis() - start < timeoutMs)
  {
    esp_task_wdt_reset(); // โหมดตั้งค่าอาจนานถึง 10 นาที (ถ้าลูปหลักเปิด watchdog อยู่)
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

static void()
{
}