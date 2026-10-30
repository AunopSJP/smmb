#pragma once
#include <Arduino.h>

// เรียก API ของตู้ /v1/box/* พร้อมลายเซ็น (docs/HARDWARE_FIRMWARE_GUIDE.md §6–7)
struct ApiResult {
  int status = 0;     // 0 = ต่อไม่ได้ / timeout
  String body;        // JSON (ว่างได้ เช่น 204)
  uint32_t serverTime = 0;
};

/** method "GET"/"POST" · suffix เช่น "/v1/box/boot" หรือ "/v1/box/jobs?wait=50" · body "" สำหรับ GET */
ApiResult apiCall(const char* method, const String& suffix, const String& body, uint32_t timeoutMs = 15000);

/** เวลาปัจจุบัน (UTC วินาที) — ตั้งจากเซิร์ฟเวอร์ทุกครั้งที่ได้คำตอบ · 0 = ยังไม่เคยตั้ง */
uint32_t nowUtc();
bool clockSet();
void clockSetFrom(uint32_t serverTime);

/** OTA: โหลดเฟิร์มแวร์ `version` จากเซิร์ฟเวอร์ (GET /v1/box/firmware/<version> เซ็นลายเซ็น) ลงพาร์ทิชันอัปเดต
 *  ตรวจขนาด + sha256 ก่อนยืนยัน (ไม่ตรง = ไม่สลับพาร์ทิชัน) · true = ลงเสร็จ พร้อมรีสตาร์ต */
bool apiDownloadFirmware(const String& version, size_t size, const String& sha256Hex);
