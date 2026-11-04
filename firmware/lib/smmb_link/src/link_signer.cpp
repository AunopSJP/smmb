#include "signer.h"

#include <esp_random.h>
#include <mbedtls/md.h>

static String toHex(const uint8_t* in, size_t n) {
  static const char* h = "0123456789abcdef";
  String out;
  out.reserve(n * 2);
  for (size_t i = 0; i < n; i++) {
    out += h[in[i] >> 4];
    out += h[in[i] & 15];
  }
  return out;
}

String sha256Hex(const String& data) {
  uint8_t d[32];
  mbedtls_md(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), (const uint8_t*)data.c_str(), data.length(), d);
  return toHex(d, 32);
}

String signRequest(const String& secret, const char* method, const String& path, uint32_t ts, const String& nonce, const String& body) {
  String msg = String(method) + "|" + path + "|" + String(ts) + "|" + nonce + "|" + sha256Hex(body);
  uint8_t mac[32];
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), (const uint8_t*)secret.c_str(), secret.length(),
                  (const uint8_t*)msg.c_str(), msg.length(), mac);
  return toHex(mac, 32);
}

String newNonce() {
  uint8_t b[6];
  esp_fill_random(b, sizeof(b));
  return toHex(b, sizeof(b));
}

bool signerSelfTest(bool verbose) {
  const String secret = "65dafb799784ed3b28d608b1f06bc7201ab8097735360ae35682f339428ea35f";
  const String body = "{\"fw\":\"1.0.3\",\"config_ver\":0,\"battery_pct\":87}";
  String a = signRequest(secret, "POST", "/v1/box/boot", 1761123456, "9f2c41ab77e0", body);
  String b = signRequest(secret, "GET", "/v1/box/jobs?wait=50", 1761123500, "a1b2c3d4e5f6", "");
  bool okA = a == "ba685f7b6f384ac1b514ef80e43e8bbe70f4c9bda93ded8205f1889f9b0f7ff8";
  bool okB = b == "86c6520798d17a12cf2af3d156f02f1a361cb5ac3138245135d6176bd901de6c";
  if (verbose) {
    Serial.printf("[selftest] boot sig %s %s\n", okA ? "OK " : "BAD", a.c_str());
    Serial.printf("[selftest] jobs sig %s %s\n", okB ? "OK " : "BAD", b.c_str());
  }
  return okA && okB;
}
