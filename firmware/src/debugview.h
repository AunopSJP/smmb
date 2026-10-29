#pragma once
#include <Arduino.h>

// หน้าเว็บดูภาพกล้องของตู้ตอนทดสอบ (เปิดด้วยคำสั่ง Serial `debugcam on`)
// http://<IP ตู้>/?k=<รหัส>  — ภาพสด + กรอบที่ใช้อ่าน QR + ความสว่าง + เห็น/ถอด QR ได้ไหม + คำแนะนำ
// ⚠️ กล้องตู้มองถนนหน้าบ้าน: ปิดไว้เป็นค่าเริ่มต้น · ต้องมีรหัส ?k= (8 ตัวจาก sha256 ของ device_secret) · ใช้ตอนทดสอบเท่านั้น

void debugViewStart();  // เปิดเว็บเซิร์ฟเวอร์ (ทำซ้ำได้) — ต้องต่อ Wi-Fi แล้ว
void debugViewStop();
void debugViewPoll();   // เรียกบ่อย ๆ ใน loop / ระหว่างสแกน
bool debugViewRunning();
/** สตรีมภาพดิบ MJPEG จากกล้อง (พอร์ต 80) นาน sec วินาที · ไม่ถอดรหัส QR ไม่คุยเซิร์ฟเวอร์ · พิมพ์ FPS ทาง Serial */
void rawViewRun(uint32_t sec);
/** มีคนเปิดหน้าอยู่ใน 20 วิที่ผ่านมาไหม */
bool debugViewHasViewer();
/** ปิดกล้องที่ถืออยู่เมื่อไม่มีใครดูแล้ว (เรียกใน loop) */
void debugViewIdleCheck();
String debugViewUrl();
