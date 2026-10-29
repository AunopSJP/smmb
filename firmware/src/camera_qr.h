#pragma once
#include <Arduino.h>

// กล้อง + อ่าน QR (quirc) — เปิดกล้องเฉพาะตอนมีงาน (ประหยัดไฟ)
bool cameraStart();
void cameraStop();
bool cameraRunning();

/** เปิดไฟแฟลชถ้าภาพมืดและอนุญาต · คืนว่าเปิดไฟอยู่ไหม */
bool cameraAutoFlash(bool allowed);
void flashOff();

struct QrRead {
  bool ok = false;
  String text;
  uint32_t ms = 0;
  uint16_t frames = 0;
  uint16_t qrShapes = 0;
};

/**
 * ส่งภาพสดออกไปดู (เฉพาะงานทดสอบ): ระหว่างสแกนจะเข้ารหัสเฟรมเป็น JPEG ทุก intervalMs แล้วเรียก sink · sink = nullptr ปิด
 * งานตรวจจริงของเจ้าหน้าที่ห้ามเปิด — ตู้แค่อ่าน QR แล้วส่งข้อความ ไม่ส่งภาพ
 */
void cameraSetPreviewSink(void (*sink)(const uint8_t* jpeg, size_t len), uint32_t intervalMs);

/** อ่าน QR ภายใน timeoutMs — ได้ข้อความแรกที่ถอดได้ */
QrRead cameraScanQr(uint32_t timeoutMs);

/** พิมพ์ 1 เฟรม (ย่อครึ่ง เทา) เป็น hex ทาง Serial ไว้ดูว่ากล้องเห็นอะไร/โฟกัสชัดไหม (คำสั่ง snap) */
void cameraDumpFrame();

/** ภาพ JPEG 1 เฟรม (ไว้ดูว่ากล้องเห็นอะไร · ผู้เรียกต้อง free(*out)) */
bool cameraSnapshotJpeg(uint8_t** out, size_t* len);

// ── ภาพตัวอย่างสำหรับหน้าดูกล้อง (debugview) ───────────────────────────────────
/** ถือกล้องไว้ (cameraStop จะไม่ปิดกล้อง ปิดแค่ไฟแฟลช) — ใช้ตอนมีคนเปิดหน้าดูกล้องอยู่ */
void cameraHold(bool hold);
bool cameraScanning();
/** จับ 1 เฟรมแล้วเก็บเป็นภาพตัวอย่าง (ตอนไม่ได้สแกน) — true = ได้ภาพ */
bool cameraPreviewTick();
/** JPEG ของภาพตัวอย่างล่าสุด (ผู้เรียกต้อง free(*out)) */
bool cameraPreviewJpeg(uint8_t** out, size_t* len);
/** สถานะล่าสุดเป็น JSON: ความสว่าง · fps · เห็นรูปร่าง QR · ถอดได้ · กรอบที่ใช้อ่าน */
String cameraPreviewJson();
