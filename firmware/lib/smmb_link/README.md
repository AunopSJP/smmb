# smmb_link — ส่วนที่ตู้คุยกับเซิร์ฟเวอร์ (สำหรับทีม Hardware)

ไลบรารีนี้รวม**ทุกอย่างที่รับและส่งกับเซิร์ฟเวอร์**ไว้ที่เดียว ทีม Hardware **ไม่ต้องแก้ไฟล์ในโฟลเดอร์นี้**
งานของทีมคือเขียนส่วนฮาร์ดแวร์ (กล้อง เสียง ไฟ Wi-Fi การหลับ) แล้วต่อเข้ากับไลบรารีผ่าน `LinkHooks`

หัวไฟล์เดียวที่ต้องอ่านคือ [`src/SmmbLink.h`](src/SmmbLink.h)

## ในไลบรารีมีอะไร

| ไฟล์ | หน้าที่ |
|---|---|
| `SmmbLink.h` | API สาธารณะ: hooks, ฟังก์ชันหลัก, ชนิดข้อมูล |
| `link_signer.cpp` | ลายเซ็น HMAC-SHA256 + nonce + self-test (ค่าเทียบตามโปรโตคอล §1.1) |
| `link_http.cpp` | HTTPS + header ลายเซ็น · ตั้งนาฬิกาจาก `X-Server-Time` · OTA จากเซิร์ฟเวอร์ (ตรวจขนาด + sha256) |
| `link_protocol.cpp` | boot · report · events · long-poll · งานตรวจ/ทดสอบ (`ready` → `result`) · คำสั่ง `wifi_reset` / `beep` / `ota` · ภาพสดของงานทดสอบ |
| `link_ota.cpp` | แฟลชผ่าน Wi-Fi ในวง LAN ด้วย PlatformIO (ใช้ตอนพัฒนา) |
| `link_ca_roots.h` | ใบรับรองราก Let's Encrypt (ISRG X1/X2) |

ส่วนที่**ไม่อยู่**ในไลบรารี (อยู่ใน `firmware/src/` ทีม Hardware แก้ได้):
- กล้อง/อ่าน QR (`camera_qr.*`) · buzzer (`buzzer.*`) · ขาบอร์ด (`include/board.h`)
- ต่อ Wi-Fi และหน้าตั้งค่า `MAILBOX-xxxxxx` (`portal.*`, `settings.*`)
- การหลับลึก เวลาตรวจ คำสั่ง serial และลำดับ setup/loop (`main.cpp`)

## วิธีต่อ (ดูตัวอย่างจริงใน `src/main.cpp` → `linkSetup()`)

```cpp
#include <SmmbLink.h>

static LinkCredentials creds() { return {settings.url, settings.boxId, settings.secret}; }
static LinkScan scan(uint32_t ms) { /* อ่าน QR ภายใน ms แล้วคืน {ok, text, ms} */ }

void setup() {
  // ... โหลดค่าจาก flash ก่อน (รวม config ที่จำไว้ → linkParseConfig(json, boxConfig))
  LinkHooks h;
  h.credentials   = creds;          // ต้องมี
  h.cameraStart   = cameraStart;    // ต้องมี
  h.cameraStop    = cameraStop;     // ต้องมี
  h.scanQr        = scan;           // ต้องมี
  h.cameraAutoFlash = cameraAutoFlash;     // ไม่บังคับ
  h.setPreviewSink  = cameraSetPreviewSink; // ไม่บังคับ (ภาพสดของงานทดสอบ)
  h.beep          = beepByName;     // "ready" "pass" "retry" "fail" "error" "wifi"
  h.saveConfig    = saveConfigToFlash;  // จำ config ไว้ใช้ตอนเปิดเครื่องรอบหน้า
  h.wifiReset     = forgetWifiAndRestart; // เจ้าของบ้านกด "เปลี่ยน Wi-Fi" ในเว็บ
  linkBegin(h, FW_VERSION);

  connectWifi();
  linkBoot();          // POST /v1/box/boot → ตั้งนาฬิกา + config + awake_s
}

void loop() {
  linkLanOtaStart(apName());            // ไม่บังคับ
  if (linkLanOtaBusy()) return;
  // ถึงเวลารายงานรายวัน → linkReport()
  switch (linkPollOnce(25)) {           // ได้งาน → ทำงานจนจบในนี้เลย
    case LinkPoll::Idle: case LinkPoll::Handled: break;      // ถามต่อทันที
    case LinkPoll::AuthFailed: delay(30000); break;          // ตรวจ box_id / secret / URL
    case LinkPoll::Offline: reconnectWifi(); delay(30000); break;
  }
}
```

## กติกาที่ไลบรารีทำให้แล้ว (ห้ามทำซ้ำ/ห้ามเปลี่ยนฝั่งแอป)

- **ตัดสินผลที่เซิร์ฟเวอร์เท่านั้น** — ตู้ส่ง `qr_text` ตามที่อ่านได้ ไม่ตรวจ/ไม่ถอดเอง
- **ไม่มีโหมดออฟไลน์** — ส่งผลไม่ได้ = ทิ้ง ไม่เก็บไว้ส่งทีหลัง
- **ack ก่อนทำคำสั่งเสมอ** (`wifi_reset`, `beep`) — ack ไม่ผ่าน = ยังไม่ทำ รอรับใหม่รอบหน้า
- **OTA ลองครั้งเดียวต่อการเปิดเครื่อง** + ตรวจ sha256 ก่อนสลับพาร์ทิชัน · `FW_VERSION` ในไฟล์ที่อัปโหลดต้องตรงกับชื่อเวอร์ชันบนเว็บ
- **งานตรวจจริงไม่ส่งภาพ** — ภาพสด (`/v1/box/preview`) เปิดเฉพาะงาน `test`
- **ไม่พิมพ์ลายเซ็น / device_secret ลง log**
- นาฬิกาตั้งจากคำขอสั้นเท่านั้น (long-poll ทำให้เวลาเก่า → `clock_skew`)

## ข้อกำหนดของ hooks

| hook | เรียกเมื่อ | ต้องทำ |
|---|---|---|
| `credentials()` | ทุกคำขอ | คืนค่าล่าสุด (แก้จาก serial/portal แล้วมีผลทันที) |
| `cameraStart()` / `cameraStop()` | ต้น/ท้ายงาน | เปิดกล้องเฉพาะตอนมีงาน · false = เปิดไม่ได้ (ไลบรารีส่ง `camera_error`) |
| `scanQr(ms)` | แต่ละครั้งที่ลอง (สูงสุด `attempt_max`) | อ่านภายในเวลา คืน QR แรกที่ถอดได้ · ห้ามบล็อกเกิน `ms` มาก (watchdog 180 วิ) |
| `cameraAutoFlash(allowed)` | หลังเปิดกล้อง | เปิดไฟถ้ามืดและ `allowed` · คืนว่าไฟเปิดไหม |
| `setPreviewSink(sink, ms)` | งาน `test` เท่านั้น | ระหว่างสแกนเรียก `sink(jpeg, len)` ทุก `ms` · `sink=nullptr` = หยุด |
| `beep(pattern)` | สถานะต่าง ๆ + คำสั่ง beep จากเว็บ | รูปแบบเสียงตามคู่มือ §9 · ชื่อไม่รู้จัก = false |
| `saveConfig(json, ver)` | เซิร์ฟเวอร์ส่ง config ใหม่ | จำลง flash · ตอนเปิดเครื่องโหลดคืนด้วย `linkParseConfig` แล้วตั้ง `boxConfig.ver` |
| `wifiReset()` | คำสั่ง `wifi_reset` (ack แล้ว) | ลืม Wi-Fi (ควรเก็บของเดิมสำรองไว้) แล้วรีสตาร์ตเข้าโหมดตั้งค่า |

## ค่าที่อยู่รอดตอนหลับลึก

`linkRtc` (อยู่ใน RTC memory): `awakeUntil` ไลบรารีตั้งจาก `awake_s` ของ boot · แอปนับ `wakeCount` และ `wifiFail` · ไลบรารีนับ `jobsDone` / `scanFail` และล้างหลัง report สำเร็จ

## ทดสอบ

- serial `selftest` → ลายเซ็นต้อง PASS (ไม่ผ่าน = ทุกคำขอโดน 401)
- ตู้จำลองฝั่งเซิร์ฟเวอร์: `npm --prefix backend run box:sim -- live`
- เช็กลิสต์บอร์ด: `docs/HARDWARE_FIRMWARE_GUIDE.md` §11

## เมื่อเซิร์ฟเวอร์เปลี่ยนโปรโตคอล

แก้ในไลบรารีนี้ที่เดียว (ทีม Software) + `docs/SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md` + `docs/HARDWARE_FIRMWARE_GUIDE.md`
แก้สูตรลายเซ็น = แก้ `link_signer.cpp` + `backend/src/box/box-crypto.ts` + โปรโตคอล §1.1 พร้อมกัน
