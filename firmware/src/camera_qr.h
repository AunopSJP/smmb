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
};

/** อ่าน QR ภายใน timeoutMs — ได้ข้อความแรกที่ถอดได้ */
QrRead cameraScanQr(uint32_t timeoutMs);

/** ภาพ JPEG 1 เฟรม (ไว้ดูว่ากล้องเห็นอะไร · ผู้เรียกต้อง free(*out)) */
bool cameraSnapshotJpeg(uint8_t** out, size_t* len);
