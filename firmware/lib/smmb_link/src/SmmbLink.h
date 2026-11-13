#pragma once
// ─────────────────────────────────────────────────────────────────────────────
// SmmbLink — ทุกอย่างที่ตู้ "คุยกับเซิร์ฟเวอร์" อยู่ในไลบรารีนี้ที่เดียว
//   ลายเซ็น HMAC · HTTPS · นาฬิกาจากเซิร์ฟเวอร์ · boot / report / events · long-poll
//   งานตรวจ/ทดสอบ (ready → result) · คำสั่งจากเว็บ (wifi_reset / beep / ota) · อัปเดตเฟิร์มแวร์
//
// ทีม Hardware: ไม่ต้องแก้ไฟล์ในไลบรารีนี้ — เขียนฝั่งฮาร์ดแวร์ (กล้อง เสียง Wi-Fi หลับลึก) แล้วต่อผ่าน LinkHooks
// สัญญากับเซิร์ฟเวอร์: docs/SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md · คู่มือ: lib/smmb_link/README.md
// แก้สูตรลายเซ็น = แก้ link_signer.cpp + backend/src/box/box-crypto.ts + โปรโตคอล §1.1 พร้อมกัน
// ─────────────────────────────────────────────────────────────────────────────
#include <Arduino.h>

// ── ค่าที่ต้องเขียนลงบอร์ด (ต่อ 1 ตู้) ─────────────────────────────────────────
struct LinkCredentials
{
  String url;    // เช่น https://hub.sjp-dev.net/smmb-api (ไม่มี / ท้าย · path ถูกนำไปเซ็นด้วย)
  String boxId;  // BX-00003
  String secret; // device_secret hex 64 ตัว (ห้ามพิมพ์ลง log)
};

// ── ค่าจากเซิร์ฟเวอร์ (config ในคำตอบ boot / report / long-poll) ──────────────
#define LINK_MAX_WINDOWS 8
struct BoxConfig
{
  uint32_t ver = 0;
  uint8_t windowCount = 0;
  uint16_t winStart[LINK_MAX_WINDOWS]; // นาทีนับจากเที่ยงคืน (เวลาไทย)
  uint16_t winEnd[LINK_MAX_WINDOWS];
  uint16_t reportAt = 23 * 60 + 30;
  uint8_t scanTimeoutS = 20;
  uint8_t maxAttempts = 3;
  bool flashWhenDark = true;
  uint8_t longpollWaitS = 50;
  /** ประหยัดไฟ Wi-Fi (modem sleep) — ค่าเริ่มต้นปิด (เสถียรกว่าบน Wi-Fi อ่อน) · เซิร์ฟเวอร์ตั้งเฉพาะตู้ที่สัญญาณดี */
  bool wifiPowerSave = false;
};
/** config ปัจจุบัน (ไลบรารีอัปเดตเองเมื่อเซิร์ฟเวอร์ส่งมา · ฝั่งแอปโหลดค่าที่จำไว้ตอนเปิดเครื่องด้วย linkParseConfig) */
extern BoxConfig boxConfig;
/** แปลง JSON object "config" → BoxConfig (ไม่แตะ ver) · false = รูปแบบผิด */
bool linkParseConfig(const String &json, BoxConfig &out);

// ── ค่าที่อยู่รอดตอนหลับลึก (เก็บใน RTC memory ของไลบรารี) ─────────────────────
struct LinkRtc
{
  uint32_t awakeUntil = 0; // UTC — ถือ long-poll ถึงเวลานี้แม้นอกเวลาตรวจ (จาก awake_s ของ boot)
  uint32_t wakeCount = 0;  // ฝั่งแอปนับ (ทุกครั้งที่ setup())
  uint32_t jobsDone = 0;   // ไลบรารีนับ · ล้างหลัง report สำเร็จ
  uint32_t scanFail = 0;   // ไลบรารีนับ · ล้างหลัง report สำเร็จ
  uint32_t wifiFail = 0;   // ฝั่งแอปนับ (ต่อ Wi-Fi ไม่ได้) · ล้างหลัง report สำเร็จ
};
extern LinkRtc linkRtc;

// ── ผลอ่าน QR จากกล้อง (ฝั่งฮาร์ดแวร์คืนค่านี้) ──────────────────────────────
struct LinkScan
{
  bool ok = false;
  String text;           // ข้อความใน QR ตามที่อ่านได้ (ไม่ต้องตรวจ/ถอด — เซิร์ฟเวอร์ตัดสิน)
  uint32_t ms = 0;       // ใช้เวลาอ่านกี่ ms
  uint16_t frames = 0;   // จำนวนเฟรมที่ลอง (ไว้วินิจฉัย · ไม่มีใส่ 0)
  uint16_t qrShapes = 0; // เห็นรูปร่าง QR กี่ครั้ง (ไว้วินิจฉัย · ไม่มีใส่ 0)
};

// ── จุดต่อกับฮาร์ดแวร์ — ทีม Hardware เขียนฟังก์ชันเหล่านี้ ─────────────────────
// ช่องที่ไม่ใส่ (nullptr) = ไม่มีฟีเจอร์นั้น ไลบรารีข้ามให้ (ยกเว้นที่เขียนว่า "ต้องมี")
struct LinkHooks
{
  LinkCredentials (*credentials)() = nullptr;           // ต้องมี · อ่านค่าล่าสุดทุกครั้ง (แก้จาก serial/portal ได้ทันที)
  bool (*cameraStart)() = nullptr;                      // ต้องมี · เปิดกล้อง (เปิดเฉพาะตอนมีงาน)
  void (*cameraStop)() = nullptr;                       // ต้องมี
  LinkScan (*scanQr)(uint32_t timeoutMs) = nullptr;     // ต้องมี · อ่าน QR ภายในเวลา ได้ข้อความแรกที่ถอดได้
  bool (*cameraAutoFlash)(bool allowed) = nullptr;      // เปิดไฟถ้ามืดและ allowed · คืนว่าไฟเปิดอยู่ไหม
  /** ภาพสดเฉพาะงานทดสอบ: ไลบรารีส่ง sink มา ให้เรียก sink(jpeg,len) ทุก intervalMs ระหว่างสแกน · sink=nullptr = หยุด
   *  งานตรวจจริงไลบรารีส่ง nullptr เสมอ (ตู้ไม่ส่งภาพตอนเจ้าหน้าที่ตรวจ) */
  void (*setPreviewSink)(void (*sink)(const uint8_t *jpeg, size_t len), uint32_t intervalMs) = nullptr;
  /** Snapface: ถ่าย JPEG 1 เฟรมขณะกล้องยังเปิดอยู่ (ไลบรารีจะ free(*out) เอง) · ≤ 85 KB (เช่น VGA คุณภาพ 12–15)
   *  ไลบรารีเรียกหลังงานตรวจผ่าน โดยหน่วงเวลาสุ่ม 1.5–4 วิ (ตอนเจ้าหน้าที่ลดมือถือลง) · ห้ามมีเสียง/ไฟบอกตอนถ่าย
   *  ไม่ใส่ = ไม่ส่งรูป (ตรวจผ่านได้ตามปกติ) */
  bool (*snapshotJpeg)(uint8_t **out, size_t *len) = nullptr;
  /** ส่งเสียง: "ready" "pass" "retry" "fail" "error" "wifi" (+ ชื่ออื่นจากคำสั่ง beep ของเว็บ) · false = ไม่รู้จักชื่อ */
  bool (*beep)(const char *pattern) = nullptr;
  void (*saveConfig)(const String &json, uint32_t ver) = nullptr; // จำ config ลง flash (โหลดคืนตอนเปิดเครื่อง)
  /** เจ้าของบ้านกด "เปลี่ยน Wi-Fi" ในเว็บ (ไลบรารี ack เซิร์ฟเวอร์แล้ว): ลืม Wi-Fi แล้วรีสตาร์ตเข้าโหมดตั้งค่า · ไม่ควร return */
  void (*wifiReset)() = nullptr;
};

/** เรียกครั้งเดียวใน setup() ก่อนใช้ฟังก์ชันอื่น · fwVersion = เวอร์ชันที่รายงานเซิร์ฟเวอร์ (ต้องตรงกับชื่อไฟล์ที่อัปโหลด OTA) */
void linkBegin(const LinkHooks &hooks, const char *fwVersion);

// ── ลำดับงานหลัก (เรียกจาก setup/loop ของแอป) ───────────────────────────────
/** POST /v1/box/boot (ลองซ้ำ 0/5/15/45 วิ) · ตั้งนาฬิกา + รับ config + awake_s + คำสั่ง · true = สำเร็จ */
bool linkBoot();
/** ส่ง boot สำเร็จแล้วในรอบไฟนี้ */
bool linkBooted();
/** เสียง error ของ "ปัญหาเชื่อมต่อที่วนซ้ำเอง" (Wi-Fi หลุด / boot ไม่ผ่าน / 401) — ร้องครั้งแรกแล้วเว้น 10 นาที
 *  ไม่ใช้กับ error ระหว่างงานตรวจ (เจ้าหน้าที่ยืนอยู่หน้าตู้ ต้องได้ยินทุกครั้ง) */
void linkBeepErrorQuiet();
/** POST /v1/box/report (รายงานรายวัน + ดึง config) · true = สำเร็จ (ตัวนับใน linkRtc ถูกล้าง) */
bool linkReport();

enum class LinkPoll
{
  Idle,       // 204 ไม่มีงาน — ถามต่อได้ทันที
  Handled,    // ได้งาน/คำสั่ง/config แล้วทำเสร็จ — ถามต่อได้ทันที
  AuthFailed, // 401 (box_id / secret / URL ผิด หรือนาฬิกาเพี้ยน) — รอแล้วค่อยลองใหม่
  Offline,    // ต่อไม่ได้ / timeout / 5xx — ตรวจ Wi-Fi รอแล้วลองใหม่ (ไม่เก็บไว้ส่งทีหลัง)
};
/** long-poll GET /v1/box/jobs 1 รอบ (ถือสายสูงสุด maxWaitS วิ) · ได้งาน → ทำงานจนจบในฟังก์ชันนี้ */
LinkPoll linkPollOnce(uint8_t maxWaitS = 25);

/** POST /v1/box/events แบบสั้น เช่น "camera_error" · jobId ไม่บังคับ */
void linkEvent(const char *type, const char *jobId = nullptr);

/** สาเหตุที่รีเซ็ตครั้งล่าสุด (power_on / deep_sleep / brownout / watchdog …) — ส่งไปกับ boot */
const char *linkResetReason();

// ── นาฬิกา (ตั้งจาก X-Server-Time · ตู้ไม่มี RTC/NTP) ─────────────────────────
uint32_t nowUtc(); // 0 = ยังไม่เคยตั้ง
bool clockSet();
void clockSetFrom(uint32_t serverTime);

// ── อัปเดตเฟิร์มแวร์ ────────────────────────────────────────────────────────
/** OTA จากเซิร์ฟเวอร์ (คำสั่ง "ota" ไลบรารีเรียกเอง): โหลด GET /v1/box/firmware/<version> เซ็นลายเซ็น
 *  ตรวจขนาด + sha256 ก่อนสลับพาร์ทิชัน · true = ลงเสร็จ ผู้เรียกต้องรีสตาร์ต */
bool linkInstallFirmware(const String &version, size_t size, const String &sha256Hex);
/** แฟลชผ่าน Wi-Fi ในวง LAN ด้วย PlatformIO (espota · รหัสจาก ota.local.ini → -DOTA_PASS) · ไม่ตั้งรหัส = ปิด
 *  เรียกซ้ำได้ ทำงานครั้งแรกที่ต่อ Wi-Fi ได้ · hostname เช่น "mailbox-000003" */
void linkLanOtaStart(const String &hostname);
/** true ระหว่างกำลังรับเฟิร์มแวร์ทาง LAN — ลูปหลักควรหยุดคุยกับเซิร์ฟเวอร์ */
bool linkLanOtaBusy();

// ── ระดับล่าง (ปกติไม่ต้องใช้ — ไว้ทดสอบ/เพิ่ม endpoint) ─────────────────────────
struct LinkResponse
{
  int status = 0; // 0 = ต่อไม่ได้ / timeout
  String body;    // JSON (ว่างได้ เช่น 204)
  uint32_t serverTime = 0;
};
/** method "GET"/"POST" · suffix เช่น "/v1/box/boot" · body "" สำหรับ GET · เซ็น + ใส่ header ให้ */
LinkResponse linkRequest(const char *method, const String &suffix, const String &body, uint32_t timeoutMs = 15000);

String sha256Hex(const String &data);
String linkSign(const String &secret, const char *method, const String &path, uint32_t ts, const String &nonce, const String &body);
String linkNonce();
/** เทียบลายเซ็นกับค่าตัวอย่างในโปรโตคอล §1.1 · true = สูตรถูก */
bool linkSelfTest(bool verbose);
