#pragma once
#include <stdint.h>
// เสียงบอกสถานะ (ตู้ไม่มีไฟสถานะ) — ตรงกับคู่มือ §9 และข้อความในแอปเจ้าหน้าที่/ช่าง
// 0.2.45: ตัวส่งเสียง LTE-5061J ติ๊ดตามจังหวะของมันเอง → ทุกรูปแบบนับเป็น "จำนวนติ๊ด" (ดู buzzer.cpp)
void buzzerInit();
void buzzerOff();
void buzzerHoldOffForSleep(); // ปิดเสียงและล็อกขาไว้ตลอดช่วงหลับลึก
void beepReady();     // 1 ติ๊ด : ออนไลน์ / ได้งาน กล้องพร้อม
void beepPass();      // 2 ติ๊ด
void beepRetry();     // 1 ติ๊ด : อ่านไม่ผ่าน กล้องพร้อมอ่านอีกครั้ง
void beepFail();      // 4 ติ๊ด
void beepError();     // 1 ติ๊ด · เว้น · 2 ติ๊ด : ต่อ Wi-Fi/เซิร์ฟเวอร์ไม่ได้ · 401
void beepWifiReset(); // 3 ติ๊ด : รับคำสั่งเปลี่ยน Wi-Fi จากเว็บ
// ส่งเสียงตามชื่อรูปแบบ (ready|pass|retry|fail|error|wifi) — ใช้กับคำสั่ง beep จากเว็บและคำสั่ง serial · ชื่อไม่รู้จัก = false
bool beepByName(const char *name);
// ปรับจังหวะบนโต๊ะ (คำสั่ง serial `siren`): จ่ายไฟค้างตามเวลา · ดังให้ครบ n ติ๊ด
void sirenHold(uint32_t ms);
void sirenTicks(uint8_t n);
