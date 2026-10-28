#pragma once
#include <Arduino.h>

// ลายเซ็นคำขอ — สูตรตาม docs/HARDWARE_FIRMWARE_GUIDE.md §6 (= backend/src/box/box-crypto.ts)
// X-Signature = hex(HMAC-SHA256(key = device_secret เป็นสตริง ASCII 64 ไบต์,
//                               METHOD|PATH|TIMESTAMP|NONCE|sha256hex(BODY)))

String sha256Hex(const String& data);
String signRequest(const String& secret, const char* method, const String& path, uint32_t ts, const String& nonce, const String& body);
String newNonce();

/** เทียบกับค่าตัวอย่างในคู่มือ — true = สูตรถูก */
bool signerSelfTest(bool verbose);
