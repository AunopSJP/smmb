#include "api.h"

#include <HTTPClient.h>
#include <Update.h>
#include <esp_task_wdt.h>
#include <mbedtls/sha256.h>
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

  http.setReuse(false);  // Connection: close — ให้เซิร์ฟเวอร์ปิดหลังตอบ ไม่ค้าง keep-alive
  http.setConnectTimeout((uint16_t)min<uint32_t>(timeoutMs, 10000));
  http.setTimeout((uint16_t)min<uint32_t>(timeoutMs, 65000));
  static const char* headerKeys[] = {"X-Server-Time"};
  http.collectHeaders(headerKeys, 1);
  http.addHeader("X-Box-Id", settings.boxId);
  http.addHeader("X-Timestamp", String(ts));
  http.addHeader("X-Nonce", nonce);
  http.addHeader("X-Signature", sig);

  const unsigned long startedAt = millis();
  const bool trace = strcmp(method, "GET") == 0;  // long-poll: พิมพ์ขั้นตอนไว้หาจุดที่ค้าง
  if (trace) Serial.printf("[trace] GET start · wifi %d · rssi %d\n", (int)WiFi.status(), WiFi.RSSI());
  int code;
  if (strcmp(method, "GET") == 0) {
    code = http.GET();
  } else {
    http.addHeader("Content-Type", "application/json");
    code = http.POST(body);
  }
  if (trace) Serial.printf("[trace] GET returned %d after %lu ms\n", code, millis() - startedAt);
  if (code > 0) {
    r.status = code;
    // 204 ไม่มี body — getString() จะวนรอจนเซิร์ฟเวอร์ปิดการเชื่อมต่อ (ไม่มี timeout ในลูปนั้น) ทำให้ตู้ค้างหลัง long-poll หมดเวลา
    if (code != 204 && http.getSize() != 0) r.body = http.getString();
    r.serverTime = (uint32_t)strtoul(http.header("X-Server-Time").c_str(), nullptr, 10);
    // ตั้งนาฬิกาเฉพาะคำขอสั้น ๆ: server ตั้ง X-Server-Time ตอนเริ่มรับคำขอ ถ้า long-poll รอ 50 วิ ค่านี้เก่า 50 วิ → นาฬิกาถอยทุกรอบจน clock_skew
    // (นาฬิกาตู้เดินจากคริสตัลอยู่แล้ว เพี้ยนไม่ถึงวินาทีต่อชั่วโมง · boot / report / ready / result ตั้งใหม่ให้ตลอด)
    // (ถ้ายังไม่เคยตั้งนาฬิกา ตั้งเสมอ แม้คำขอแรกจะช้า เช่น จับมือ TLS บน Wi-Fi อ่อน — ไม่งั้นคำขอถัดไปเซ็นด้วยเวลาผิดแล้วโดน clock_skew)
    if (r.serverTime && (!clockSet() || millis() - startedAt < 5000)) clockSetFrom(r.serverTime);
  } else {
    Serial.printf("[api] %s %s → %s\n", method, signedPath.c_str(), http.errorToString(code).c_str());
  }
  http.end();
  if (trace) Serial.printf("[trace] GET done after %lu ms\n", millis() - startedAt);
  if (code > 0) {
    // ไม่พิมพ์ลายเซ็น/รหัสลับลง log
    Serial.printf("[api] %s %s → %d %s\n", method, signedPath.c_str(), code, r.body.substring(0, 160).c_str());
  }
  return r;
}

bool apiDownloadFirmware(const String& version, size_t size, const String& sha256Hex) {
  if (WiFi.status() != WL_CONNECTED || !clockSet() || size < 64 * 1024 || sha256Hex.length() != 64) return false;
  const String suffix = "/v1/box/firmware/" + version;
  const String url = urlBase(settings.url) + suffix;
  const uint32_t ts = nowUtc();
  const String nonce = newNonce();
  const String sig = signRequest(settings.secret, "GET", urlPathPrefix(settings.url) + suffix, ts, nonce, "");

  const bool https = settings.url.startsWith("https://");
  WiFiClientSecure secure;
  WiFiClient plain;
  HTTPClient http;
  if (https) secure.setCACert(CA_ROOTS);
  if (!(https ? http.begin(secure, url) : http.begin(plain, url))) return false;
  http.setReuse(false);
  http.setConnectTimeout(10000);
  http.setTimeout(20000);
  http.addHeader("X-Box-Id", settings.boxId);
  http.addHeader("X-Timestamp", String(ts));
  http.addHeader("X-Nonce", nonce);
  http.addHeader("X-Signature", sig);

  const int code = http.GET();
  if (code != 200 || (size_t)http.getSize() != size) {
    Serial.printf("[ota] download refused: HTTP %d size %d (expected %u)\n", code, http.getSize(), (unsigned)size);
    http.end();
    return false;
  }
  if (!Update.begin(size, U_FLASH)) {
    Serial.printf("[ota] Update.begin failed: %s\n",Update.errorString());
    http.end();
    return false;
  }
  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  mbedtls_sha256_starts(&sha, 0);
  WiFiClient* stream = http.getStreamPtr();
  uint8_t buf[1460];
  size_t got = 0;
  unsigned long lastData = millis();
  uint8_t lastPct = 255;
  bool ok = true;
  while (got < size) {
    esp_task_wdt_reset();
    const size_t avail = stream->available();
    if (!avail) {
      if (!stream->connected() || millis() - lastData > 20000) {
        Serial.println("[ota] download stalled");
        ok = false;
        break;
      }
      delay(5);
      continue;
    }
    const size_t n = stream->readBytes(buf, min(avail, min(sizeof(buf), size - got)));
    if (!n) continue;
    lastData = millis();
    if (Update.write(buf, n) != n) {
      Serial.printf("[ota] flash write failed: %s\n",Update.errorString());
      ok = false;
      break;
    }
    mbedtls_sha256_update(&sha, buf, n);
    got += n;
    const uint8_t pct = got * 100 / size;
    if (pct / 10 != lastPct / 10) Serial.printf("[ota] %u%%\n",pct);
    lastPct = pct;
  }
  http.end();
  uint8_t digest[32];
  mbedtls_sha256_finish(&sha, digest);
  mbedtls_sha256_free(&sha);
  if (ok) {
    char hex[65];
    for (int i = 0; i < 32; i++) snprintf(hex + i * 2, 3, "%02x", digest[i]);
    if (!sha256Hex.equalsIgnoreCase(hex)) {
      Serial.println("[ota] sha256 mismatch — discarded");
      ok = false;
    }
  }
  if (!ok) {
    Update.abort();
    return false;
  }
  if (!Update.end(false)) {  // ตรวจรูปแบบอิมเมจ + สลับพาร์ทิชันบูต
    Serial.printf("[ota] Update.end failed: %s\n",Update.errorString());
    return false;
  }
  return true;
}
