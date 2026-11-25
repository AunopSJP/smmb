#pragma once
#include <Arduino.h>
#include <SmmbLink.h> // BoxConfig + boxConfig (ค่าจากเซิร์ฟเวอร์)

// ค่าที่เก็บถาวรใน NVS (ปิดเปิดเครื่องแล้วยังอยู่)
struct Settings
{
  String wifiSsid;
  String wifiPass;
  String url;              // เช่น https://hub.sjp-dev.net/smmb-api (ไม่มี / ท้าย)
  String boxId;            // BX-00003
  String secret;           // device_secret hex 64 ตัว
  bool sleep = false;      // false (ค่าเริ่มต้น) = ถือ long-poll ตลอด → สแกน QR แล้วตู้ตอบทันที · true = หลับลึกตามเวลาตรวจ (ประหยัดไฟ แต่ปลุกไม่ได้)
  uint8_t camQ = 12;       // คุณภาพ JPEG ของเซนเซอร์ 4..30 (เลขน้อย = คมกว่า ไฟล์ใหญ่กว่า) · 0.2.32: 12 ตาม 0.2.25
  uint8_t camFlip = 1;    // (0.2.48) กลับภาพที่เซนเซอร์: บิต 1 = กลับบน-ล่าง (vflip) · บิต 2 = กลับซ้าย-ขวา (hmirror) · 3 = หมุน 180° (ตู้ติดตั้งแบบกลับหัว) · 0 = ไม่กลับ
  int8_t camSharp = 2;     // sharpness ของเซนเซอร์ -3..3 · ค่าเริ่มต้น +2 (ขอบ QR คมขึ้น · 0.2.39)
  bool camJpeg = true;     // true = กล้องส่ง JPEG ฮาร์ดแวร์แล้วถอดเป็นเทา (เบา ได้ FPS สูง) · false = เทาดิบ (หนัก ช้า)
  String camSize = "qvga"; // qvga | vga | svga | xga (ปรับด้วยคำสั่ง cam size) · 0.2.32: QVGA ตาม 0.2.25 ที่สแกนได้ดี
  uint8_t camXclk = 10;    // MHz — 0.2.33: 10 กินไฟน้อยกว่า 20 (ตู้ไฟตกตอนเปิดกล้อง) · ภาพ/ความเร็วอ่าน QR ไม่ต่างในโหมด JPEG
  int8_t camAe = 0;        // -2..2 ลดค่าลบ = ภาพมืดลง (กันจอมือถือสว่างจนแสงเกิน)
  uint8_t psMode = 0;      // Wi-Fi modem sleep: 0 = อัตโนมัติ (เปิดเมื่อสัญญาณแรง ปิดเองถ้าต่อล้มเหลว) · 1 = เปิดเสมอ · 2 = ปิดเสมอ (ค่าเซิร์ฟเวอร์ wifi_power_save=true บังคับเปิดทุกกรณี)
  bool debugCam = false;   // true = เปิดหน้าเว็บดูภาพกล้อง (ทดสอบเท่านั้น · debugview.h)
  // 0.2.45 จังหวะของตัวส่งเสียง LTE-5061J (ปรับด้วย `siren period/lead` ทาง serial): ติ๊ดซ้ำทุก period ms · ติ๊ดแรกดังหลังจ่ายไฟ lead ms
  uint16_t sirenPeriodMs = 800;
  uint16_t sirenLeadMs = 150;
};

extern Settings settings;

void settingsLoad();
void settingsSave();
bool settingsProvisioned(); // มี url + box + secret
bool settingsHasWifi();
void settingsForgetWifi();
/** เปลี่ยน Wi-Fi จากเว็บ: เก็บ Wi-Fi เดิมไว้สำรอง แล้วลืมของเดิม (ตั้งใหม่ไม่ทัน → settingsRestoreWifi) */
void settingsStashWifi();
bool settingsRestoreWifi(); // true = มี Wi-Fi สำรองและกู้คืนแล้ว
void settingsClearStashedWifi();

/** จำ config ที่เซิร์ฟเวอร์ส่งมา (LinkHooks.saveConfig) — settingsLoad โหลดคืนให้ */
void settingsSaveConfig(const String &configJson, uint32_t ver);

/** "MAILBOX-000003" จาก box_id · ยังไม่ตั้ง box → ใช้ MAC */
String apName();

/** เก็บเหตุผลล่าสุดที่ Wi-Fi หลุด/ต่อไม่ได้ (ไว้บอกช่างว่าเพราะอะไร) */
void wifiDiagInit();
uint8_t wifiLastReason();
void wifiClearReason();
const char *wifiReasonText(uint8_t reason); // ภาษาไทยสำหรับหน้าตั้งค่า
/** ต่อ Wi-Fi ตาม settings · ลอง 2 รอบ รอบละ 30 วิ · true = ต่อได้ */
bool wifiJoin(void (*idle)());
