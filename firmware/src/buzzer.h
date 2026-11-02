#pragma once
// เสียงบอกสถานะ (ตู้ไม่มีไฟสถานะ) — ตรงกับคู่มือ §9 และข้อความในแอปเจ้าหน้าที่/ช่าง
void buzzerInit();
void beepReady();     // สั้น 1 : ออนไลน์ / ได้งาน กล้องพร้อม
void beepPass();      // สั้น 2
void beepRetry();     // ยาว 1
void beepFail();      // ยาว 3
void beepError();     // ยาว 1 + สั้น 2 : ต่อ Wi-Fi/เซิร์ฟเวอร์ไม่ได้ · 401
void beepWifiReset(); // สั้น 3 ครั้งถี่ ๆ : รับคำสั่งเปลี่ยน Wi-Fi จากเว็บ
// ส่งเสียงตามชื่อรูปแบบ (ready|pass|retry|fail|error|wifi) — ใช้กับคำสั่ง beep จากเว็บและคำสั่ง serial · ชื่อไม่รู้จัก = false
bool beepByName(const char *name);
