#pragma once
// ขาและค่าคงที่ของบอร์ด ESP32-CAM (AI-Thinker) — แก้ที่นี่ที่เดียวถ้าต่อวงจรต่างไป

#define FW_VERSION "0.2.47"

// 1 = จดเหตุการณ์ตัดสินใจของรอบตื่น (ตื่น/ถือสาย/ซิงก์นาฬิกา/หลับ) แล้วส่งเป็น event `awake_trace` ก่อนหลับ · ใช้ตามหาว่าทำไมตู้ไม่หลับหลังพ้นเวลาตรวจ
// ไม่ต้องต่อ serial (เปิดดูที่เว็บแอดมิน D04 "รายงานจากตู้ล่าสุด") · แก้ปัญหาเสร็จแล้วตั้ง 0 เพื่อไม่ให้ตู้ส่งเพิ่ม
#define SMMB_TRACE 1

// เสียง: GPIO13 (ผู้ใช้ต่อ 2026-10-28)
// วงจร 2026-10-29: GPIO13 → TRIG ของ DUAL MOSFET OUT → ตัวส่งเสียง LTE-5061
// LTE-5061 มีเสียง+ไฟกระพริบในตัว → MOSFET แค่จ่าย/ตัดไฟ
// BUZZER_ACTIVE 1 = เปิด/ปิดขาตรง ๆ (วงจรนี้) · 0 = PWM ความถี่ BUZZER_FREQ_HZ (buzzer แบบ passive ที่ต่อตรง)
#define PIN_BUZZER 13
#define BUZZER_ACTIVE 1
#define BUZZER_FREQ_HZ 2700

// ไฟแฟลชบนบอร์ด (LED ขาว) — ใช้เป็นไฟส่องกล้องตอนมืด (flash_when_dark)
#define PIN_FLASH_LED 4

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
#define WAKE_BEFORE_WINDOW_S 120  // ตื่นก่อนต้นช่วงเวลาตรวจ 2 นาที (✅ ผู้ใช้สั่ง 2026-11-17 · เผื่อต่อ Wi-Fi ช้า + นาฬิกาเพี้ยนเล็กน้อย)
#define GIVE_UP_AWAKE_MS (5UL * 60 * 1000) // เปิดเครื่องแล้ว boot/Wi-Fi ไม่ผ่านนานเท่านี้ (ยังไม่มีนาฬิกา) → หลับแล้วค่อยลองใหม่ กันแบตหมดเพราะตื่นค้าง
#define SLEEP_HOP_MAX_S 1800      // หลับต่อรอบไม่เกิน 30 นาที — ตื่นมาซิงก์เวลา + รับ config/คำสั่งใหม่ (กันหลับยาวแล้วไม่รู้ว่าแอดมิน/หัวหน้าเปลี่ยนเวลาตรวจ)
#define SLEEP_HOP_FINAL_S 600     // เหลือเวลาถึงเหตุการณ์ถัดไปไม่เกินนี้ = หลับรวดเดียว · มากกว่านี้ = หลับครึ่งทาง ตื่นมาซิงก์นาฬิกา แล้วค่อยหลับต่อ
#define RETRY_IN_WINDOW_MS 30000  // ต่อไม่ได้ระหว่างเวลาตรวจ ลองใหม่ทุก 30 วิ
#define PORTAL_TIMEOUT_MS (10UL * 60 * 1000)
