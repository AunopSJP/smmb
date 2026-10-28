#pragma once
// เสียงบอกสถานะ (ตู้ไม่มีไฟสถานะ) — ตรงกับคู่มือ §9 และข้อความในแอปเจ้าหน้าที่/ช่าง
void buzzerInit();
void beepReady();  // สั้น 1 : ออนไลน์ / ได้งาน กล้องพร้อม
void beepPass();   // สั้น 2
void beepRetry();  // ยาว 1
void beepFail();   // ยาว 3
void beepError();  // ยาว 1 + สั้น 2 : ต่อ Wi-Fi/เซิร์ฟเวอร์ไม่ได้ · 401
