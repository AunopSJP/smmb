# ส่งต่องาน SMMB ให้ Codex — สถานะ ณ 2026-10-28 (เย็น)

> อ่านไฟล์นี้ก่อน แล้วอ่าน [`CLAUDE.md`](../CLAUDE.md) (กฎที่ห้ามละเมิด) · ตอบผู้ใช้เป็น**ภาษาไทย** · ผู้ใช้ commit / push เอง (อย่า commit ถ้าไม่ได้สั่ง)

---

## 1. โปรเจกต์คืออะไร

**Smart Mailbox (SMMB)** — ตู้หน้าบ้าน ESP32-CAM + เว็บแอปตัวเดียว (PWA) ใช้ได้ทุกบทบาท

- **เจ้าหน้าที่ (ตำรวจ / รปภ.)** มาตรวจบ้านแบบพิสูจน์ได้ว่ามาจริง: สแกน QR หน้าตู้ในแอป → เซิร์ฟเวอร์ปลุกตู้ → แอปแสดง QR ประจำตัว (เปลี่ยนทุก 30 วิ) → กล้องตู้อ่าน → **เซิร์ฟเวอร์ตัดสิน** → แจ้งเจ้าของบ้าน
- **ไรเดอร์** สแกน QR หน้าตู้ / พิมพ์รหัส → แจ้งเจ้าของบ้านว่ามีของมาส่ง (ไม่มีบัญชี)
- **เจ้าของบ้าน** ผูกตู้ · ดูประวัติ · กด **SOS** ถึงเจ้าหน้าที่ในโซน (ส่งเป็นขั้น 0 / 30 / 60 วิ)
- **หัวหน้าหน่วยงาน** อนุมัติลูกทีม · จัดโซน + เวลาตรวจ + บ้าน · ดูภาพรวม/ประวัติ
- **แอดมิน (+ ช่างติดตั้ง)** ลงทะเบียนตู้ · พิมพ์ QR · ทดสอบปลุกตู้ · อนุมัติหน่วยงาน · จัดการผู้ใช้

| ส่วน | โฟลเดอร์ | เทคโนโลยี |
|---|---|---|
| Backend | `backend/` | NestJS 12 (ESM) · PostgreSQL · Redis (rate limit เท่านั้น) |
| Web app | `frontend/` | Angular 22 PWA · Web Push |
| เฟิร์มแวร์ตู้ | `firmware/` | ESP32-CAM AI-Thinker · PlatformIO · Arduino core 2.0.17 |
| เอกสาร | `docs/` | ดูข้อ 7 |

---

## 2. สถานะตอนนี้

### อัปเดตล่าสุด 2026-10-28
- ปรับ QR ประจำตัวในหน้าเจ้าหน้าที่ให้กว้างสูงสุด 320 px และใช้ error correction ระดับ L เพื่อให้กล้องอ่านง่ายขึ้น
- เฟิร์มแวร์สแกนภาพบริเวณกลาง 480×400 px เป็นหลัก และสแกนเต็มภาพทุก 4 เฟรมเพื่อรองรับการเล็งคลาดเคลื่อน
- Build ผ่าน: `npm run build -- --configuration development` ใน `frontend/` และ PlatformIO `pio run` ใน `firmware/`
- เชื่อมโหมด mock ผ่าน API ได้ครบทั้ง boot → long-poll → งานทดสอบ → ready → pass และโฟลวตรวจ → ready → QR ประจำตัว → pass ด้วย `box-sim`
- รอบนี้ไม่พบพอร์ต Serial ของบอร์ดในเครื่อง จึงยังไม่ได้แฟลช/ยืนยันผลอ่าน QR ด้วยกล้องจริง การปรับกล้องต้องทดสอบบนบอร์ดก่อนสรุปผล
- **เพิ่มหน้าเฝ้าดูสถานะกล้องใน D04** — firmware และ `box-sim` ส่ง `camera_test_started`, `camera_ready`, `camera_scan_result` ผ่าน HMAC `/v1/box/events` เฉพาะงานทดสอบ · backend map จาก `box_report_tb` ให้ D04 รีเฟรชทุก 5 วิ · แสดงผลเปิดกล้อง/จำนวนเฟรม/QR ที่พบ/ผลอ่าน/เวลา · ไม่ส่งภาพและไม่เปลี่ยน flow ตรวจจริง
- ตรวจเชื่อม mock หลังเพิ่ม telemetry: simulator งานทดสอบได้ `pass`; event ล่าสุดใน `GET /api/v1/admin/boxes/BX-00001` ถูก map เป็น `camera_diagnostics` พร้อม `frames`, `qr_shapes`, `read_ok`, `read_ms`
- Build หลังเพิ่ม telemetry ผ่าน: backend `npm run build` · frontend `npm run build -- --configuration development` · firmware `pio run`
- **เตรียมทางเข้าเดโมตู้จริง** — `/demo` เลือกบัญชี seed แล้วล็อกอินผ่าน Backend แทนการเปลี่ยน role ในหน่วยความจำอย่างเดียว · `dev:mock` เลือก IP วงแลนสำหรับ URL QR ให้มือถือ (กำหนด `SMMB_DEMO_HOST` ได้) · frontend เพิ่ม `npm run start:demo` ให้มือถือในวงแลนเปิดเว็บได้ · คู่มือลำดับนำเสนออยู่ที่ `docs/SALES_DEMO_GUIDE.md`
- **ข้อจำกัดก่อนวันนำเสนอ** — หน้าสแกน QR ใน browser มือถือต้อง HTTPS ที่เชื่อถือ; local HTTP ยังใช้ให้ ESP32 ติดต่อ Backend และให้กล้องบนบอร์ดสแกน QR ได้ · รอบนี้ยังไม่มีบอร์ดต่อ Serial เพื่อยืนยัน optical scan บน hardware จริง
- **อัปเดต flow เดโม/QR 2026-10-28** — `dev:mock` เติมประวัติตรวจ/ส่งของ/SOS ให้ `BX-00001` เมื่อไม่มีรายการชนิดนั้นแล้ว; เปิดซ้ำไม่สร้างซ้ำและไม่ล้างข้อมูลทีม · ตรวจ PGlite ใหม่ได้ 1 รายการต่อชนิด และ restart แล้วยัง 1 รายการต่อชนิด
- เพิ่ม E2E QR ข้าม role: เจ้าหน้าที่รายงาน QR ฉีก → แอดมินแจ้งเจ้าของ → เจ้าของยืนยันย้ายใบสำรอง → แอดมินออกใบใหม่และปิดเคส · เจอและแก้ version/token ชนหลังเลื่อน QR จาก slot 2 ไป slot 1 · E2E inspection 9/9, backend build และ lint ผ่าน
- รีเซ็ตตู้ที่ D04 คือคืน `config_override` ไปค่า default เพิ่ม config generation และส่งให้บอร์ดเมื่อ long-poll/เชื่อมต่อรอบถัดไป; คง Wi-Fi, device secret, owner, QR และประวัติไว้ · QR registration ดู/พิมพ์ซ้ำได้ใน D04; QR ที่สูญหายต้อง reissue เพื่อ revoke ใบเดิม

### ✅ ซอฟต์แวร์และ backend mock (commit ฐาน `339afb0 Before Hareware Coding`)
- Backend ครบทุกเฟส: auth · หน่วยงาน · โซน · ตู้ (`/v1/box/*` HMAC + long-poll) · ตรวจตู้ · ไรเดอร์ · SOS · แจ้งเตือน · `/agency/today` · `/agency/logs` · `POST /admin/boxes/:id/device-secret` · คำตอบ boot มี `awake_s: 900`
- หน้าเว็บ flow หลักของทุกบทบาทต่อ API จริง; H15/H15-b/H15-c เป็นข้อเสนอสมาชิกในบ้านที่ยังไม่ทำตาม `docs/api.md` §4.6 · หลักฐานและข้อจำกัดปัจจุบันอยู่ใน `docs/IMPLEMENTATION_STATUS.md`
- โหมด mock `npm run dev:mock` (ไม่ต้องมี Postgres/Redis) + บัญชีทดสอบ 1 คน/บทบาท + ตู้จำลอง `npm run box:sim -- live`
- หลักฐานตรวจ: backend unit 66/66 · frontend 60/60 · E2E flow 94/94; readiness test ต้องมี Redis ซึ่งไม่มีในเครื่องทดสอบ · ดูข้อจำกัดเต็มใน `docs/IMPLEMENTATION_STATUS.md`
- คู่มือเฟิร์มแวร์ `docs/HARDWARE_FIRMWARE_GUIDE.md`

### ⚪ เฟิร์มแวร์ `firmware/` — compile ผ่าน แต่ยังไม่ได้ยืนยันกับบอร์ดจริง

| เรื่อง | ผล |
|---|---|
| PlatformIO build (`esp32cam`) | ✅ compile ผ่าน · ยังไม่ใช่หลักฐานว่า firmware ทำงานบนชิป |
| Upload ผ่าน COM17 | ❌ `Failed to connect to ESP32: No serial data received` |
| รุ่นบอร์ดและ boot → Wi-Fi → HMAC → long-poll → camera QR | ⚪ ยังไม่ยืนยันบนฮาร์ดแวร์ · Windows เห็น FTDI `0403:6001` แต่ยังระบุรุ่นบอร์ดไม่ได้ |
| ปลุกจาก deep sleep ด้วย QR สติกเกอร์ | ❌ ทำไม่ได้โดยตรง · ต้องคง network long-poll ไว้หรือเพิ่ม wake input/วงจร |

ก่อน upload ต้องต่อ IO0 ลง GND แล้ว reset เพื่อเข้า download mode ตาม `docs/HARDWARE_FIRMWARE_GUIDE.md`; เก็บผล simulator แยกจากผลทดสอบบอร์ดจริง

---

## 3. งานที่ต้องทำต่อ (เรียงตามความสำคัญ)

### 3.1 🔴 ยืนยันความเร็วและความชัวร์ของการอ่าน QR บนบอร์ดจริง
อาการ: ระหว่างตรวจ log ขึ้น `frames with a QR shape: 0` ทุกครั้ง (31–32 เฟรม/20 วิ) · ตอนดูภาพด้วย `camweb` กล้องเห็น QR บนจอชัดพอสมควร (QR กว้าง ~100 px ในภาพ 640×480)
⚠️ ยังสรุปไม่ได้ว่าเป็นที่กล้อง/ตัวถอด: ภาพที่ดึงหลังการตรวจครั้งสุดท้ายเห็นแค่ผนัง/เพดาน — ผู้ใช้ถือบอร์ดด้วยมือ กล้องอาจไม่ได้หันไปที่จอตลอด · **เริ่มจากยึดบอร์ดให้นิ่ง หันตรงไปที่ QR แล้วเช็กด้วย `camweb` ก่อนทุกครั้ง** · รอบที่สำเร็จ (19 วิ) คือ QR บนจอมือถือ
สิ่งที่แก้ไปแล้ว: stack ล้นตอนถอด (ย้าย `quirc_code/quirc_data` ออกนอก stack + loop stack 16 KB) · ภาพมีเส้นขีด (XCLK 20→10 MHz, `fb_count = 2`) · ภาพกลับซ้าย-ขวา (`set_hmirror(1)`)
ปรับในโค้ดแล้ว (รอแฟลชและวัดกับบอร์ด):
1. QR บนหน้า O06 ขยายจาก 280 เป็น 320 px และลด error correction จาก M เป็น L ให้โมดูลใหญ่ขึ้น
2. quirc อ่านกรอบกลาง 480×400 px เป็นหลัก และอ่านเต็ม VGA ทุก 4 เฟรม เผื่อ QR ไม่อยู่กลางภาพ
3. Build ผ่านทั้ง firmware และ frontend; API mock ผ่าน flow งานทดสอบและตรวจตู้ด้วย `box-sim`
สิ่งที่ควรวัดบนบอร์ด:
- ตรวจว่า `set_hmirror(1)` กลับภาพถูกทางจริงด้วย `camweb` — ถ้ากลับผิด quirc อาจหา finder pattern ได้แต่ถอดไม่ได้
- ทำ threshold / เพิ่ม contrast ก่อนส่ง quirc หากจอมือถือมีแสงจ้าหรือ moiré · ลอง `set_gainceiling`, `set_aec_value`
- ปรับโฟกัสเลนส์ OV2640 ให้คมที่ 15–30 ซม.
- วัดผลด้วย `scan 20` ทาง Serial และ `debugcam on` (หน้าเว็บภาพสด + กรอบอ่าน QR + คำแนะนำ — เปิด URL ที่ตู้พิมพ์ใน Serial, ต้องมี `?k=`)
เป้า: อ่าน QR ประจำตัวบนจอมือถือได้ภายใน 2–3 วิ ระยะ 15–30 ซม.

### 3.2 อัปเดต hub ให้ใช้โค้ดล่าสุด แล้วย้ายบอร์ดไปต่อ hub
1. ตรวจ diff และให้ผู้ใช้ออกคำสั่ง deploy ก่อนเปลี่ยน server/domain · push โค้ดเฉพาะหลังผู้ใช้สั่ง
2. บนเครื่อง server หลังได้รับอนุมัติ: หยุด `smmb-mock`, pull โค้ด, รัน `npm ci` ใน `backend/` และ `frontend/`, แล้ว `npm --prefix frontend run build:hub` เพื่อ build production พร้อมตั้ง base/API และปิด dev tools ในขั้นตอนเดียว
3. สำรองเว็บเดิมก่อนคัดลอกเนื้อหา `frontend/dist/smmb-web/browser/` ไปยัง `root`/`alias` ของ `/smmb/` ตาม nginx config จริง
4. start `smmb-mock` ใหม่ · systemd เรียก `npm run dev:mock` ซึ่ง build backend และ apply migrations ที่ยังขาด (รวม 0011–0014) ผ่าน `runMigrations()` แบบ transaction; **ห้ามใส่ `--reset`** เพราะจะล้างข้อมูลเดโมบน hub
5. ตรวจ `journalctl -u smmb-mock`, `https://hub.sjp-dev.net/smmb-api/api/health/live`, asset hash ของหน้าเว็บ และ login/flow ของทุกบทบาทก่อนนำบอร์ดไปต่อ hub
6. ล็อกอินแอดมินบน hub → ตู้ → BX-00001 → "ดูรหัสลับประจำตู้" → ผู้ใช้กรอกในหน้า 192.168.4.1 ของตู้ (URL `https://hub.sjp-dev.net/smmb-api`) — **ห้ามส่งรหัสลับในแชต**
7. ทดสอบตามเช็กลิสต์ `docs/HARDWARE_FIRMWARE_GUIDE.md` §11

### 3.3 ทดสอบส่วนเฟิร์มแวร์ที่ยังไม่ได้ลอง
- หลับลึก: ตั้ง `sleep on` + ตู้ที่ `windows` สั้น ๆ → ตื่นก่อนต้นช่วง 60 วิ → long-poll → หมดช่วงแล้วหลับ · รายงานรายวัน (`report_at`)
- ไฟแฟลช GPIO4 ตอนมืด (`flash_when_dark`) · ปิด Wi-Fi เราเตอร์ระหว่างเวลาตรวจแล้วต่อกลับเอง · กด IO0 ค้าง 5 วิ = ลบ Wi-Fi
- ⚠️ **GPIO0 = ขา XCLK ของกล้อง** — ถ้ายังมีสายจาก IO0 (ใช้ตอนแฟลช) ห้อยแตะ GND กล้องจะ `Camera probe failed 0x105` (เจอแล้ว) · ปุ่ม "IO0 ค้าง 5 วิ" ใช้ได้เฉพาะตอนเปิดเครื่องก่อนเปิดกล้อง

### 3.4 งานค้างฝั่ง backend / เว็บ (ทำเมื่อผู้ใช้สั่ง)
- หน้าที่ยังเป็นข้อเสนอ: H15 สมาชิกในบ้าน · งานเบื้องหลัง: แจ้งเจ้าของบ้านเมื่อตู้ไม่ออนไลน์ตอนเริ่มเวลาตรวจ / ตู้เงียบเกิน 26 ชม.
- ยังไม่เคยรันกับ **PostgreSQL + Redis จริง** (ทุกอย่างทดสอบบน PGlite)
- ก่อนเปิดให้ใช้จริง: ปิด `devTools` · เลิกใช้บัญชี `demo1234` · เอา `SKIP_PUSH_REQUIRED` ออก (ใช้แค่โหมด mock) · backend รันได้ทีละตัว (`JobHub` อยู่ในหน่วยความจำ)
- ❓ รอคำตอบผู้ใช้/ทีมฮาร์ดแวร์: ชื่อ SoftAP `MAILBOX-<6 หลักท้าย box_id>` ใช้ได้ไหม · รูปแบบเสียง Buzzer

---

## 4. วิธีรัน

```bash
# backend โหมด mock (ไม่ต้องมี DB) — พิมพ์ URL วงแลน + device_secret ของ BX-00001/BX-00002 ตอนเริ่ม
cd backend && npm install && npm run dev:mock          # --reset = ล้างข้อมูล mock
# เว็บ (dev) — http://localhost:4200 · proxy /api → :3000
npm --prefix frontend start
# ตู้จำลอง (เหมือนบอร์ดจริง)
cd backend && npm run box:sim -- live --url http://localhost:3000 --box BX-00001 --secret <64 hex>
```

บัญชีทดสอบ (โหมด mock · รหัส `demo1234`): แอดมิน `0800000001` · เจ้าของบ้าน `0812345678` (บ้าน 99/9 ผูก BX-00001) · หัวหน้า `0823456789` · เจ้าหน้าที่ `0834567890` · BX-00002 ยังไม่ผูก · โซน "สาย 1 (ทั้งวัน)" 00:00–23:59

**เทสต์**
```bash
cd backend && npx vitest run                                   # unit
# e2e ต้องมี Postgres ที่ migrate + seed แล้ว (ดู README) · DATABASE_URL=... DB_POOL_MAX=1
cd backend && npm run migrate && npm run seed:dev && npx vitest run --config ./vitest.config.e2e.ts
cd frontend && npx ng test --watch=false && npx ng build --configuration development
cd backend && npm run lint
```

**เฟิร์มแวร์** (PlatformIO อยู่ที่ `%USERPROFILE%\.platformio\penv\Scripts\pio.exe` — ไม่อยู่ใน PATH)
```bash
cd firmware && pio run                               # build
# แฟลช: ต่อ IO0 ลง GND → กด RST → แล้วรัน (สาย FTDI รีเซ็ตเข้าโหมดแฟลชเองไม่ได้)
pio run -t upload --upload-port COM17
# หลังแฟลช: ถอดสาย IO0 ออก (สำคัญ — ข้อ 3.3) → กด RST
pio device monitor -p COM17 -b 115200                # พิมพ์ help
```
คำสั่ง Serial: `status` · `selftest` · `url` / `box` / `secret` / `wifi` · `sleep on|off` · `boot` · `report` · `scan [วิ]` · `debugcam on|off` · `camweb [วิ]` · `portal` · `forget` · `reboot` — ระหว่างถือ long-poll (สูงสุด ~50 วิ) คำสั่งจะรอจนรอบนั้นจบ

---

## 5. แผนที่โค้ด

**firmware/** (ใหม่)
| ไฟล์ | ทำอะไร |
|---|---|
| `include/board.h` | ขา (Buzzer 13 · แฟลช 4 · กล้อง AI-Thinker) · ค่าคงที่ · `FW_VERSION` |
| `src/main.cpp` | ลำดับงานหลัก (boot → long-poll / report / หลับลึก) · งานปลุกตู้ `runJob` · คำสั่ง Serial |
| `src/api.cpp` | เรียก `/v1/box/*` + header ลายเซ็น · HTTPS (`ca_roots.h`) · ตั้งนาฬิกาจาก `X-Server-Time` |
| `src/signer.cpp` | สูตรลายเซ็น + self-test (ค่าตัวอย่างเดียวกับคู่มือ §6) |
| `src/settings.cpp` | ค่าใน NVS (Wi-Fi · url · box · secret · config) · `apName()` · วินิจฉัย Wi-Fi |
| `src/portal.cpp` | โหมดตั้งค่า SoftAP + captive portal |
| `src/camera_qr.cpp` | กล้อง (ขาวดำ VGA) · quirc ถอด QR · ไฟแฟลชอัตโนมัติ · snapshot JPEG |
| `src/buzzer.cpp` | รูปแบบเสียง (คู่มือ §9) |
| `src/ca_roots.h` | ISRG Root X1 + X2 (สาธารณะ) — **ห้ามปักหมุดใบ leaf** |

**backend/src/**: `box/` (API ตู้ · แอดมินตู้ · งานปลุก `box-job.service.ts` · `job-hub.ts`) · `inspection/` · `rider/` · `sos/` · `agency/` (หัวหน้า + โซน + `agency-today.service.ts`) · `admin/` · `auth/` · `push/` · migration `sql/migrations/0001–0010`
**frontend/src/app/**: `screens/registry.ts` (ทุกหน้าจอ) · `app.routes.ts` (`BUILT` + guard) · `core/*-api.ts` · `pages/<บทบาท>/` · `shared/box-test.ts` · `shared/qr-scanner.ts` · `shared/qr-image.ts`

---

## 6. กับดักที่เจอแล้ว (อย่าเจอซ้ำ)

- **สูตรลายเซ็นอยู่ 4 ที่**: โปรโตคอล §1.1 · `backend/src/box/box-crypto.ts` (+ spec) · `firmware/src/signer.cpp` · คู่มือเฟิร์มแวร์ §6 — แก้ที่เดียวไม่ได้
- คีย์ HMAC = `device_secret` เป็น**สตริง ASCII 64 ตัว** (ไม่แปลง hex) · PATH ที่เซ็น**รวม prefix** (`/smmb-api/v1/box/...` บน hub)
- `device_secret` ต่างกันในแต่ละ server (คิดจาก `BOX_MASTER_KEY`) · ห้ามพิมพ์ลง log / แชต
- Backend: body ของตู้อ่านด้วย `@BoxBody()` ไม่ใช่ `@Body()` · โหมด mock มี DB connection เดียว → ใน transaction ส่ง `db` ต่อเสมอ ห้ามใช้ `this.pool` (ค้าง) · ห้ามแก้ migration ที่มีอยู่ — เขียนไฟล์ใหม่
- Frontend: guard ต้อง `inject()` **ก่อน** `await` · client ตัดสินจาก `code` ของ error เท่านั้น · ข้อความต้องมีไทย + อังกฤษ
- เฟิร์มแวร์: loop stack ต้อง ≥ 16 KB (quirc) · กล้อง XCLK 20 MHz ภาพมีเส้นขีด → ใช้ 10 MHz · IO0 = XCLK
- ห้ามเขียน (ผู้ใช้ตัดแล้ว): ปุ่มหน้าตู้ / `POST /v1/box/deliveries` · ไฟสถานะ (ใช้ Buzzer) · GPS · ปุ่มปลุกตู้ · สมาชิกในบ้าน `H15` · MQTT · LINE · OTP · การชำระเงิน

---

## 7. เอกสาร

| ไฟล์ | ใช้ตอนไหน |
|---|---|
| `CLAUDE.md` | กฎทั้งหมด + สถานะแต่ละเฟส (อ่านก่อนแก้อะไร) |
| `docs/HANDOFF.md` | ประวัติการตัดสินใจทั้งหมด |
| `docs/api.md` | สัญญาทุก endpoint + error code (แก้ endpoint → แก้ไฟล์นี้ด้วย) |
| `docs/smmb-design.md` | การออกแบบ (state machine ตรวจตู้ · SOS) |
| `docs/SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md` | โปรโตคอลตู้ฉบับเต็ม |
| `docs/HARDWARE_FIRMWARE_GUIDE.md` | คู่มือเฟิร์มแวร์ (ให้ทีมฮาร์ดแวร์) + เช็กลิสต์ทดสอบบอร์ด §11 |
| `docs/CODEX_SERVER_SETUP.txt` | ตั้ง/อัปเดต server hub (systemd `smmb-mock`) |
| `README.md` | วิธีรันทั้งหมด |
