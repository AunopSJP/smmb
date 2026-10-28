#pragma once
#include <Arduino.h>

// ค่าที่เก็บถาวรใน NVS (ปิดเปิดเครื่องแล้วยังอยู่)
struct Settings {
  String wifiSsid;
  String wifiPass;
  String url;     // เช่น https://hub.sjp-dev.net/smmb-api (ไม่มี / ท้าย)
  String boxId;   // BX-00003
  String secret;  // device_secret hex 64 ตัว
  bool sleep = true;  // false = ไม่หลับลึก (ไว้ทดสอบ/ดู log)
};

// ค่าจากเซิร์ฟเวอร์ (config ในคำตอบ boot/report)
#define MAX_WINDOWS 8
struct BoxConfig {
  uint32_t ver = 0;
  uint8_t windowCount = 0;
  uint16_t winStart[MAX_WINDOWS];  // นาทีนับจากเที่ยงคืน (เวลาไทย)
  uint16_t winEnd[MAX_WINDOWS];
  uint16_t reportAt = 23 * 60 + 30;
  uint8_t scanTimeoutS = 20;
  uint8_t maxAttempts = 3;
  bool flashWhenDark = true;
  uint8_t longpollWaitS = 50;
};

extern Settings settings;
extern BoxConfig boxConfig;

void settingsLoad();
void settingsSave();
bool settingsProvisioned();      // มี url + box + secret
bool settingsHasWifi();
void settingsForgetWifi();

/** เก็บ config จาก JSON ที่เซิร์ฟเวอร์ส่ง (object "config") + เวอร์ชัน */
bool configApplyJson(const String& configJson, uint32_t ver);
void configSetVersionOnly(uint32_t ver);

/** "MAILBOX-000003" จาก box_id · ยังไม่ตั้ง box → ใช้ MAC */
String apName();

/** เก็บเหตุผลล่าสุดที่ Wi-Fi หลุด/ต่อไม่ได้ (ไว้บอกช่างว่าเพราะอะไร) */
void wifiDiagInit();
uint8_t wifiLastReason();
void wifiClearReason();
const char* wifiReasonText(uint8_t reason);  // ภาษาไทยสำหรับหน้าตั้งค่า
/** ต่อ Wi-Fi ตาม settings · ลอง 2 รอบ รอบละ 30 วิ · true = ต่อได้ */
bool wifiJoin(void (*idle)());
