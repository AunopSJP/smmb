#pragma once
// ขาและค่าคงที่ของบอร์ด ESP32-CAM (AI-Thinker) — แก้ที่นี่ที่เดียวถ้าต่อวงจรต่างไป

#define FW_VERSION "0.1.0"

// Buzzer (ผู้ใช้ต่อที่ GPIO13 · 2026-10-28)
#define PIN_BUZZER 13
#define BUZZER_FREQ_HZ 2700

// ไฟแฟลชบนบอร์ด (LED ขาว) — ใช้เป็นไฟส่องกล้องตอนมืด (flash_when_dark)
#define PIN_FLASH_LED 4

// ปุ่ม IO0 (บนบอร์ดเสริม/จัมเปอร์แฟลช) — กดค้าง 5 วิตอนเปิดเครื่อง = ลบ Wi-Fi เข้าโหมดตั้งค่า
#define PIN_RESET_WIFI 0
#define RESET_HOLD_MS 5000

// กล้อง AI-Thinker
#define CAM_PIN_PWDN 32
#define CAM_PIN_RESET -1
#define CAM_PIN_XCLK 0
#define CAM_PIN_SIOD 26
#define CAM_PIN_SIOC 27
#define CAM_PIN_D7 35
#define CAM_PIN_D6 34
#define CAM_PIN_D5 39
#define CAM_PIN_D4 36
#define CAM_PIN_D3 21
#define CAM_PIN_D2 19
#define CAM_PIN_D1 18
#define CAM_PIN_D0 5
#define CAM_PIN_VSYNC 25
#define CAM_PIN_HREF 23
#define CAM_PIN_PCLK 22

// เวลาไทย = UTC+7 ตลอดปี (ไม่มี DST)
#define TZ_OFFSET_S (7 * 3600)

// โปรโตคอล (docs/HARDWARE_FIRMWARE_GUIDE.md)
#define WIFI_CONNECT_TIMEOUT_MS 20000
#define WAKE_BEFORE_WINDOW_S 60   // ตื่นก่อนต้นช่วงเวลาตรวจ
#define RETRY_IN_WINDOW_MS 30000  // ต่อไม่ได้ระหว่างเวลาตรวจ ลองใหม่ทุก 30 วิ
#define PORTAL_TIMEOUT_MS (10UL * 60 * 1000)
