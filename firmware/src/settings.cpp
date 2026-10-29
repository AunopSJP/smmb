#include "settings.h"

#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>

Settings settings;
BoxConfig boxConfig;

static Preferences prefs;

static uint16_t hhmm(const char* s) {
  if (!s || strlen(s) != 5 || s[2] != ':') return 0xFFFF;
  int h = atoi(s), m = atoi(s + 3);
  if (h < 0 || h > 23 || m < 0 || m > 59) return 0xFFFF;
  return h * 60 + m;
}

static bool parseConfig(const String& json, BoxConfig& out) {
  JsonDocument doc;
  if (deserializeJson(doc, json)) return false;
  BoxConfig c;
  c.ver = out.ver;
  JsonArray w = doc["windows"].as<JsonArray>();
  for (JsonArray pair : w) {
    if (c.windowCount >= MAX_WINDOWS) break;
    uint16_t s = hhmm(pair[0] | ""), e = hhmm(pair[1] | "");
    if (s == 0xFFFF || e == 0xFFFF || s >= e) continue;
    c.winStart[c.windowCount] = s;
    c.winEnd[c.windowCount] = e;
    c.windowCount++;
  }
  uint16_t r = hhmm(doc["report_at"] | "");
  if (r != 0xFFFF) c.reportAt = r;
  c.scanTimeoutS = constrain((int)(doc["scan_timeout_s"] | 20), 5, 60);
  c.maxAttempts = constrain((int)(doc["max_attempts"] | 3), 1, 5);
  c.flashWhenDark = doc["flash_when_dark"] | true;
  c.longpollWaitS = constrain((int)(doc["longpoll_wait_s"] | 50), 10, 55);
  out = c;
  return true;
}

void settingsLoad() {
  prefs.begin("smmb", true);
  settings.wifiSsid = prefs.getString("ssid", "");
  settings.wifiPass = prefs.getString("pass", "");
  settings.url = prefs.getString("url", "");
  settings.boxId = prefs.getString("box", "");
  settings.secret = prefs.getString("secret", "");
  settings.sleep = prefs.getBool("dsleep", false);  // ค่าเริ่มต้น = ไม่หลับลึก (คีย์ใหม่ — ค่า "sleep" เก่าที่เคยเป็น true ไม่ถูกใช้)
  settings.debugCam = prefs.getBool("dbgcam", false);
  settings.camSize = prefs.getString("camsz", "vga");
  settings.camXclk = prefs.getUChar("camxc", 10);
  settings.camAe = (int8_t)prefs.getChar("camae", 0);
  String cfg = prefs.getString("cfg", "");
  uint32_t ver = prefs.getUInt("cfgver", 0);
  prefs.end();
  boxConfig = BoxConfig();
  if (cfg.length() && parseConfig(cfg, boxConfig)) boxConfig.ver = ver;
}

void settingsSave() {
  prefs.begin("smmb", false);
  prefs.putString("ssid", settings.wifiSsid);
  prefs.putString("pass", settings.wifiPass);
  prefs.putString("url", settings.url);
  prefs.putString("box", settings.boxId);
  prefs.putString("secret", settings.secret);
  prefs.putBool("dsleep", settings.sleep);
  prefs.putBool("dbgcam", settings.debugCam);
  prefs.putString("camsz", settings.camSize);
  prefs.putUChar("camxc", settings.camXclk);
  prefs.putChar("camae", settings.camAe);
  prefs.end();
}

bool settingsProvisioned() {
  return settings.url.startsWith("http") && settings.boxId.startsWith("BX-") && settings.secret.length() == 64;
}

bool settingsHasWifi() { return settings.wifiSsid.length() > 0; }

void settingsForgetWifi() {
  settings.wifiSsid = "";
  settings.wifiPass = "";
  settingsSave();
}

void settingsStashWifi() {
  prefs.begin("smmb", false);
  prefs.putString("ssid_prev", settings.wifiSsid);
  prefs.putString("pass_prev", settings.wifiPass);
  prefs.end();
  settingsForgetWifi();
}

bool settingsRestoreWifi() {
  prefs.begin("smmb", false);
  const String ssid = prefs.getString("ssid_prev", "");
  const String pass = prefs.getString("pass_prev", "");
  prefs.remove("ssid_prev");
  prefs.remove("pass_prev");
  prefs.end();
  if (!ssid.length()) return false;
  settings.wifiSsid = ssid;
  settings.wifiPass = pass;
  settingsSave();
  return true;
}

void settingsClearStashedWifi() {
  prefs.begin("smmb", false);
  prefs.remove("ssid_prev");
  prefs.remove("pass_prev");
  prefs.end();
}

bool configApplyJson(const String& json, uint32_t ver) {
  BoxConfig c;
  if (!parseConfig(json, c)) return false;
  c.ver = ver;
  boxConfig = c;
  prefs.begin("smmb", false);
  prefs.putString("cfg", json);
  prefs.putUInt("cfgver", ver);
  prefs.end();
  return true;
}

void configSetVersionOnly(uint32_t ver) {
  // เซิร์ฟเวอร์ไม่ส่ง config มา = ของเราตรงอยู่แล้ว
  boxConfig.ver = ver;
}

static volatile uint8_t lastReason = 0;

void wifiDiagInit() {
  WiFi.onEvent(
      [](WiFiEvent_t, WiFiEventInfo_t info) {
        lastReason = info.wifi_sta_disconnected.reason;
        Serial.printf("[wifi] disconnected, reason %u (%s)\n", lastReason, wifiReasonText(lastReason));
      },
      ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
}

uint8_t wifiLastReason() { return lastReason; }
void wifiClearReason() { lastReason = 0; }

const char* wifiReasonText(uint8_t r) {
  switch (r) {
    case 0: return "หมดเวลา (ยังไม่ได้รับคำตอบจากเราเตอร์)";
    case 2:    // AUTH_EXPIRE
    case 15:   // 4WAY_HANDSHAKE_TIMEOUT
    case 202:  // AUTH_FAIL
    case 204:  // HANDSHAKE_TIMEOUT
      return "รหัส Wi-Fi ไม่ถูกต้อง";
    case 201: return "หา Wi-Fi นี้ไม่เจอ (ต้องเป็น 2.4 GHz และอยู่ใกล้พอ)";
    case 203: return "เราเตอร์ไม่ยอมรับการเชื่อมต่อ (เช็ก WPA3 อย่างเดียว / กรอง MAC)";
    case 200: return "สัญญาณหาย (beacon timeout)";
    case 205: return "เชื่อมต่อแล้วหลุด";
    default: return "ต่อไม่ได้";
  }
}

bool wifiJoin(void (*idle)()) {
  for (int round = 0; round < 2; round++) {
    wifiClearReason();
    WiFi.disconnect(false, false);
    delay(200);
    WiFi.begin(settings.wifiSsid.c_str(), settings.wifiPass.c_str());
    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 30000) {
      if (idle) idle();
      delay(100);
      // รหัสผิด / หาไม่เจอ → ไม่ต้องรอครบ 30 วิ
      uint8_t r = wifiLastReason();
      if (r == 201 || r == 202 || r == 15 || r == 2) break;
    }
    if (WiFi.status() == WL_CONNECTED) return true;
    Serial.printf("[wifi] join round %d failed: status %d reason %u (%s)\n", round + 1, (int)WiFi.status(), wifiLastReason(),
                  wifiReasonText(wifiLastReason()));
  }
  return false;
}

String apName() {
  String digits;
  for (char ch : settings.boxId)
    if (isdigit(ch)) digits += ch;
  if (digits.length()) {
    while (digits.length() < 6) digits = "0" + digits;
    return "MAILBOX-" + digits.substring(digits.length() - 6);
  }
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[16];
  snprintf(buf, sizeof(buf), "MAILBOX-%02X%02X%02X", mac[3], mac[4], mac[5]);
  return buf;
}
