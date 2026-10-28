#include "api.h"

#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <sys/time.h>

#include "ca_roots.h"
#include "settings.h"
#include "signer.h"

// เวลาเก็บใน system clock ของ ESP32 (อยู่รอดตอนหลับลึก) — ก่อนตั้งครั้งแรกจะเป็นค่าน้อย ๆ ใกล้ 0
static const uint32_t SANE_EPOCH = 1700000000;

uint32_t nowUtc() {
  time_t t = time(nullptr);
  return t > SANE_EPOCH ? (uint32_t)t : 0;
}

bool clockSet() { return nowUtc() != 0; }

void clockSetFrom(uint32_t serverTime) {
  if (serverTime < SANE_EPOCH) return;
  struct timeval tv = {(time_t)serverTime, 0};
  settimeofday(&tv, nullptr);
}

/** path ที่ต้องเซ็น = path ของ url (เช่น /smmb-api) + suffix */
static String urlPathPrefix(const String& url) {
  int scheme = url.indexOf("://");
  int slash = url.indexOf('/', scheme < 0 ? 0 : scheme + 3);
  if (slash < 0) return "";
  String p = url.substring(slash);
  while (p.endsWith("/")) p.remove(p.length() - 1);
  return p;
}

static String urlBase(const String& url) {
  String u = url;
  while (u.endsWith("/")) u.remove(u.length() - 1);
  return u;
}

ApiResult apiCall(const char* method, const String& suffix, const String& body, uint32_t timeoutMs) {
  ApiResult r;
  if (WiFi.status() != WL_CONNECTED) return r;

  const String url = urlBase(settings.url) + suffix;
  const String signedPath = urlPathPrefix(settings.url) + suffix;
  // boot ยอมให้นาฬิกาเพี้ยน — ก่อนตั้งเวลาครั้งแรกส่ง 0 ไม่ได้ (header ผิดรูปแบบ) จึงส่งเวลาคร่าว ๆ ไปก่อน
  const uint32_t ts = clockSet() ? nowUtc() : SANE_EPOCH;
  const String nonce = newNonce();
  const String sig = signRequest(settings.secret, method, signedPath, ts, nonce, body);

  const bool https = settings.url.startsWith("https://");
  WiFiClientSecure secure;
  WiFiClient plain;
  HTTPClient http;
  if (https) secure.setCACert(CA_ROOTS);
  const bool ok = https ? http.begin(secure, url) : http.begin(plain, url);
  if (!ok) return r;

  http.setConnectTimeout((uint16_t)min<uint32_t>(timeoutMs, 10000));
  http.setTimeout((uint16_t)min<uint32_t>(timeoutMs, 65000));
  static const char* headerKeys[] = {"X-Server-Time"};
  http.collectHeaders(headerKeys, 1);
  http.addHeader("X-Box-Id", settings.boxId);
  http.addHeader("X-Timestamp", String(ts));
  http.addHeader("X-Nonce", nonce);
  http.addHeader("X-Signature", sig);

  int code;
  if (strcmp(method, "GET") == 0) {
    code = http.GET();
  } else {
    http.addHeader("Content-Type", "application/json");
    code = http.POST(body);
  }
  if (code > 0) {
    r.status = code;
    r.body = http.getString();
    r.serverTime = (uint32_t)strtoul(http.header("X-Server-Time").c_str(), nullptr, 10);
    if (r.serverTime) clockSetFrom(r.serverTime);
  } else {
    Serial.printf("[api] %s %s → %s\n", method, signedPath.c_str(), http.errorToString(code).c_str());
  }
  http.end();
  if (code > 0) {
    // ไม่พิมพ์ลายเซ็น/รหัสลับลง log
    Serial.printf("[api] %s %s → %d %s\n", method, signedPath.c_str(), code, r.body.substring(0, 160).c_str());
  }
  return r;
}
