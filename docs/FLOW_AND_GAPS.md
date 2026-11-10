# SMMB — ผลตรวจโฟลวและช่องว่าง (Flow & Gap Audit)

> ตรวจเมื่อ **2026-11-10 09:05–09:30 (ไทย)** · commit `8e748bb` · working tree สะอาด
> ผู้ตรวจ: agent (read-only — ไม่ได้แก้โค้ด) · วิธีตรวจ: `node scripts/project-guardian.mjs --full` + อ่านโค้ดเส้นทางหลัก + ยิง health/หน้าเว็บ production + build production เทียบ hash
> **เอกสารนี้ไม่ใช่สเปกฟีเจอร์** — เป็นรายการงานค้างที่ยืนยันด้วยหลักฐาน พร้อมเกณฑ์เสร็จ (DoD) เพื่อใช้สั่งงานรอบถัดไป
> อัปเดตเอกสารนี้ทุกครั้งที่ตรวจใหญ่ · ถ้าข้อไหนแก้แล้วให้เปลี่ยนสถานะเป็น ✅ พร้อมวันที่และหลักฐาน

---

## 1. คำตัดสิน

**โฟลวหลักใช้งานได้จริงและเสถียรแล้ว** — build / lint / unit test เขียวหมด, production ตอบ `postgres up, redis up, push up`
**แต่ยังไม่พร้อมเปิดบ้านนำร่อง** — ติดเรื่อง hardware จริง, การ deploy, การทดสอบ UI, และการสำรองข้อมูล (ไม่ใช่ปัญหาคุณภาพโค้ด)

### ผลตรวจอัตโนมัติ (2026-11-10T02:09Z)

| การตรวจ | ผล | สรุป |
|---|---|---|
| Git working tree | ✅ | สะอาด · `main@8e748bb` |
| Registry ↔ routes | ✅ | 99 หน้า · built 96 · ไม่มีรหัส/path ซ้ำ |
| Tabs | ✅ | 24 รายการอ้างรหัสถูกต้อง |
| 3-mode coverage | ⚠️ | 2 ไฟล์ไม่มี marker → **W-15** |
| i18n ไทย/อังกฤษ | ✅ | ครบทุก `i18n.t({ th, en })` |
| Hardcoded secrets | ✅ | ไม่พบ |
| Migrations | ✅ | 34 ไฟล์ · ล่าสุด `0033` · เลขไม่ซ้ำ |
| TODO/FIXME | ℹ️ | ไม่พบ |
| Frontend build / unit | ✅ | 15.3s / 21.0s |
| Backend build / lint / unit | ✅ | 8.7s / 3.0s / 5.7s |

### สถานะ production (ยิงจริง 2026-11-10 09:11 ไทย)

| จุด | ผล |
|---|---|
| `https://hub.sjp-dev.net/smmb/` | 200 |
| `/smmb-api/api/health/live` | 200 |
| `/smmb-api/api/health` | 200 · `postgres=up, redis=up, push=up` · uptime ~16 ชม. |
| bundle ที่เสิร์ฟ | `main-UN2RDMWN.js` |
| bundle จาก HEAD (`build:hub`) | `main-RESLRBDK.js` → **ไม่ตรง (W-02)** |

---

## 2. โฟลวที่ยืนยันแล้วว่าทำงาน (ห้ามรื้อ)

| flow | หลักฐาน |
|---|---|
| เจ้าของบ้าน: สมัคร → ผูกตู้ (QR เปิดใช้/รหัส) → หน้าหลักสถานะ → SOS → ประวัติ → ขอช่าง | `frontend/src/app/pages/owner/`, `backend/src/box/owner-box.controller.ts`, `backend/src/sos/` |
| เจ้าหน้าที่: รออนุมัติ → เปิดแจ้งเตือน (`PUSH_REQUIRED`) → สรุปงานตามโซน/เวลาตรวจ → สแกน QR → ตู้ตื่น → badge QR 15 วิ → server ตัดสิน pass/retry/fail (3 ครั้ง) | `backend/src/inspection/inspection.service.ts`, `backend/src/box/job-hub.ts`, `frontend/src/app/pages/officer/officer-check.ts` |
| หัวหน้า: โซน + เวลาตรวจ + บ้าน + เจ้าหน้าที่ · บ้านต้องรอเจ้าของยืนยัน → ภาพรวมวันนี้/ประวัติ | `backend/src/agency/`, migration `0025` |
| ไรเดอร์: ไม่มีบัญชี · `/public/*` · ticket 10 นาที ใช้ครั้งเดียว · 5 ครั้ง/ชม./ตู้ | `backend/src/rider/` |
| แอดมิน/ช่าง: ลงทะเบียนตู้ + QR 3 ใบ → ปลุก/ทดสอบกล้อง → อนุมัติหน่วยงาน → เคส QR → log/แพ็ก/OTA | `backend/src/admin/`, `backend/src/box/admin-box.service.ts` |
| ตู้: HMAC ทุกคำขอ + nonce · boot/report/long-poll/ready/result/events · snapshot หลังตรวจผ่าน | `backend/src/box/box-protocol.service.ts`, `docs/SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md` |
| งานเบื้องหลัง: ตู้หลุด 3 นาที · เงียบ 26 ชม. · QR health รายวัน · ล้าง session | `backend/src/scheduler/scheduler.service.ts` |

**จุดที่ตรวจโค้ดแล้วไม่พบข้อผิดพลาด (อย่าแก้โดยไม่มีเหตุ):** badge QR รีเฟรชเมื่อเหลือ ≤6 วิ (TTL 15 วิ) จึงไม่หลุดช่วง · `stripPathPrefix` ไม่ตัด path ที่ตู้เซ็น · mapper ทุก endpoint · error code ครบตาม `api.md §15`

---

## 3. งานที่ต้องทำ

| ID | ระดับ | เรื่อง | สถานะ |
|---|---|---|---|
| W-01 | 🔴 P0 | ตู้จริง (ESP32-CAM) ยังไม่เคยรันกับระบบ | ⬜ |
| W-02 | 🔴 P0 | production ไม่ตรงกับ HEAD + ไม่มีสคริปต์ deploy/rollback | ⬜ |
| W-03 | 🔴 P0 | ไม่มี browser E2E (Playwright) | ⬜ |
| W-04 | 🔴 P0 | ยังไม่ตัดสินโดเมนจริงก่อนพิมพ์ QR ตู้ | ⬜ (รอผู้ใช้ตัดสิน) |
| W-05 | 🔴 P0 | backup ยังเป็นเอกสาร ไม่มีระบบ/ไม่เคยซ้อม restore | ⬜ |
| W-06 | 🟠 P1 | ไม่มี uptime monitor / alert นอกเครื่อง | ⬜ |
| W-07 | 🟠 P1 | CI ไม่รัน e2e (98 เคส) | ⬜ |
| W-08 | 🟠 P1 | frontend ไม่มี lint เลย | ⬜ |
| W-09 | 🟠 P1 | single-instance (JobHub in-memory) ไม่มี guard ตอน boot | ⬜ |
| W-10 | 🟠 P1 | PDPA / ระยะเก็บ log+รูป ยังไม่ตัดสิน | ⬜ (รอผู้ใช้ตัดสิน) |
| W-11 | 🟠 P1 | Web Push ยังไม่ยืนยันถึงมือถือจริง (SOS พึ่ง push) | ⬜ |
| W-12 | 🟠 P1 | `IMPLEMENTATION_STATUS.md` ล้าสมัยแล้ว | ⬜ |
| W-13 | 🟡 P2 | README ว่าง 2 ไบต์ | ⬜ |
| W-14 | 🟡 P2 | ไม่มี tag/release/CHANGELOG + version ไม่ผูกกัน | ⬜ |
| W-15 | 🟡 P2 | 3-mode marker ขาด 2 ไฟล์ | ⬜ |
| W-16 | 🟡 P2 | `backend/.mockdb-*` ค้าง 23 โฟลเดอร์ | ⬜ |
| W-17 | 🟡 P2 | ไม่มีทางดู long-poll/คิวงานสด (JobHub มีแต่ไม่มี route) | ⬜ |
| W-18 | 🟡 P2 | nginx ยังไม่เปิด HSTS/CSP | ⬜ |

---

### W-01 🔴 P0 — ตู้จริงยังไม่เคยรันกับระบบ

- **อาการ:** ทั้งเส้นตรวจตู้พิสูจน์ด้วย `npm run box:sim` เท่านั้น · การ flash ครั้งล่าสุดล้มเหลว (COM17 ไม่ตอบ bootloader)
- **หลักฐาน:** `docs/IMPLEMENTATION_STATUS.md` §"ข้อจำกัดที่เหลือ" (28 ต.ค.) · `docs/HARDWARE_FIRMWARE_GUIDE.md` §8 (เช็กลิสต์ 12 ข้อ)
- **งาน:** bench test 1 วันตามเช็กลิสต์ 12 ข้อ · เก็บตัวเลข `wake_ms`, เราเตอร์ตัด long-poll กี่วิ, อ่าน QR กลางคืน/แดดจ้า, ความร้อน/แบต, เสียง Buzzer
- **DoD:** มีตารางผลทดสอบ 12 ข้อพร้อมตัวเลขจริง + ระบุข้อที่ไม่ผ่านและแผนแก้
- **ความเสี่ยง:** ถ้าบอร์ดมีปัญหาเรื่องไฟ/กล้อง/deep sleep ระบบหลังบ้านที่สมบูรณ์จะดูเหมือนพังทั้งหมด

### W-02 🔴 P0 — production ไม่ตรงกับ HEAD

- **อาการ:** prod เสิร์ฟ `main-UN2RDMWN.js` · build จาก HEAD `8e748bb` ได้ `main-RESLRBDK.js` · `config.json` บน prod ไม่มีคีย์ `devTools` แต่ `build:hub` เขียน `{"apiBase":"/smmb-api","devTools":false}`
- **หลักฐาน:** ยิง `https://hub.sjp-dev.net/smmb/` เทียบกับ `frontend/dist/smmb-web/browser/` หลัง `npm run build:hub` · uptime prod เริ่ม ~9 พ.ย. 17:00 (หลัง commit สุดท้าย 16:59) จึงเป็นการ deploy ครั้งก่อนหน้า ไม่ใช่ HEAD
- **งาน:**
  1. `scripts/deploy.sh` — build:hub → rsync ไป `/var/www/smmb/` → เทียบ hash ที่เสิร์ฟกับ dist → restart backend → `curl health` → ล้มเหลวให้ rollback จาก `dist.prev/`
  2. เก็บ dist รุ่นก่อนไว้ 1 ชุดเสมอ
  3. guardian เพิ่มการตรวจ "deployed hash == dist hash" (opt-in ด้วย env)
- **DoD:** deploy 1 คำสั่ง · ถ้า hash ไม่ตรงสคริปต์ exit ≠ 0 · rollback ทดสอบแล้ว 1 ครั้ง
- **ไฟล์:** `scripts/deploy.sh` (ใหม่), `scripts/project-guardian.mjs`, `docs/DEPLOY_UBUNTU.md` §12

### W-03 🔴 P0 — ไม่มี browser E2E

- **อาการ:** ไม่มี Playwright/Cypress · guardian รันแค่ unit · เอกสารยอมรับว่า "ยังไม่มีผล browser-driven smoke test"
- **งาน:** Playwright 5 เส้น (ใช้ `box:sim` เป็นตู้):
  1. owner: ล็อกอิน → ผูกตู้ → เห็นสถานะบนหน้าหลัก
  2. officer: สแกน QR → badge QR → pass (กับ `box:sim live`)
  3. rider: เปิด `/b/<token>` → ticket → ใช้ซ้ำต้องได้ 410
  4. SOS: เจ้าของกด → เจ้าหน้าที่เห็น → รับงาน (2 browser context)
  5. admin: ลงทะเบียนตู้ → QR 3 ใบ → ปลุกตู้ผ่าน simulator
- **DoD:** `npm run e2e:web` ผ่านในเครื่องเดียวด้วย `dev:mock` · รันใน CI ได้ · merge block เมื่อ fail
- **ไฟล์:** `frontend/e2e/*.spec.ts` (ใหม่), `playwright.config.ts`, `package.json`

### W-04 🔴 P0 — โดเมนจริงก่อนพิมพ์ QR (รอผู้ใช้ตัดสิน)

- **อาการ:** เอกสารใช้ `hub.sjp-dev.net` · QR ที่พิมพ์ติดตู้แล้วเปลี่ยนโดเมนไม่ได้
- **หลักฐาน:** `docs/smmb-design.md` §5.1, §15 (❓ ชื่อโดเมนจริง) · CLAUDE.md กฎข้อ 8
- **งาน:** ตัดสินโดเมน + ทางเลือกที่แนะนำ: จดโดเมนสั้นสำหรับ QR แล้ว redirect ไปเว็บแอปจริง (ย้ายเซิร์ฟเวอร์ได้โดยไม่ต้องพิมพ์ QR ใหม่)
- **DoD:** ระบุโดเมนใน `.env` ของ prod (`PUBLIC_BASE_URL`, `QR_ALLOWED_HOSTS`) + พิมพ์ QR ทดสอบ 1 ตู้แล้วสแกนผ่านมือถือจริง

### W-05 🔴 P0 — backup ยังไม่มีระบบ

- **อาการ:** มีเพียง cron ตัวอย่างในเอกสาร · ไม่มี off-site · ไม่มีหลักฐานซ้อม restore
- **หลักฐาน:** `docs/DEPLOY_UBUNTU.md` §11
- **งาน:** ติดตั้ง cron จริง · คัดลอกออกนอกเครื่อง (S3/rsync) · ซ้อม `pg_restore` ลงฐานทดสอบ · สำรอง `.env` · เก็บภาพ Snapface 30 วัน (อยู่ใน Postgres `bytea` แล้วจึงติดไปกับ dump)
- **DoD:** ระบุวันที่ซ้อม restore สำเร็จ + ขนาดไฟล์สำรอง + ที่เก็บ off-site (ไม่ใส่ค่าลับในเอกสาร)

### W-06 🟠 P1 — ไม่มี monitoring/alert

- **อาการ:** ไม่พบ uptime monitor ในโปรเจ็ค · guardian CI แค่ทิ้ง artifact ใน Actions · Redis ล่ม = rate limit **fail-open** เงียบ ๆ
- **หลักฐาน:** `.github/workflows/project-guardian.yml` · `backend/src/rate-limit/rate-limit.guard.ts` (log warn แล้วปล่อยผ่าน)
- **งาน:** monitor ภายนอกยิง `/smmb-api/api/health` ทุก 1 นาที → แจ้งเตือน (อีเมล/webhook) เมื่อ ≠200 · แยกเตือนเมื่อ `redis=down`
- **DoD:** ตัด Redis ชั่วคราวใน dev แล้วได้แจ้งเตือนจริง 1 ครั้ง (บันทึกเวลา)

### W-07 🟠 P1 — CI ไม่รัน e2e

- **งาน:** เพิ่ม job `e2e` ใน `.github/workflows/` พร้อม `services: postgres:17`, `redis:7` · ตั้ง `DB_POOL_MAX=1` ตามข้อจำกัด mock · รัน `npm run migrate && npm run seed:dev && npm run test:e2e`
- **DoD:** PR แรกที่รันแล้ว e2e เขียว · ถ้าล้มเห็น log ชัด

### W-08 🟠 P1 — frontend ไม่มี lint

- **อาการ:** `frontend/package.json` ไม่มี script `lint` · มีแค่ prettier · guardian lint เฉพาะ backend
- **งาน:** เพิ่ม oxlint (ให้ตรงกับ backend) + script `lint` + เรียกใน guardian
- **DoD:** `npm run lint` ที่ frontend ผ่าน · guardian รายงานผลแยกบรรทัด

### W-09 🟠 P1 — single-instance ไม่มี guard

- **อาการ:** `JobHub` เก็บ waiter ใน memory · ถ้าเผลอรัน 2 process ตู้ที่ถือ poll กับตัวสร้างงานอาจคนละตัว → งานไม่ถูกปลุก เงียบ ๆ
- **หลักฐาน:** `backend/src/box/job-hub.ts` (comment ระบุเอง)
- **งาน:** ตอน bootstrap `SELECT pg_try_advisory_lock(<key>)` · ถ้าไม่ได้ lock → log error + exit 1 เว้นแต่ตั้ง `ALLOW_MULTI_INSTANCE=1`
- **DoD:** รัน 2 process พร้อมกันแล้วตัวที่สองออกทันทีพร้อมข้อความชัด

### W-10 🟠 P1 — PDPA / retention (รอผู้ใช้ตัดสิน)

- **อาการ:** เก็บเบอร์โทร, รูปใบหน้า (Snapface 30 วัน), `data_access_log_tb` · ยังไม่มี privacy policy / ระยะเก็บ log ที่เป็นทางการ
- **หลักฐาน:** `docs/smmb-design.md` §15 (❓ ระยะเวลาเก็บ log / ข้อความในข้อตกลง / นโยบายความเป็นส่วนตัว — ต้องทำก่อนเปิดทดลองจริง)
- **งาน:** ตัดสินระยะเก็บ log แต่ละชนิด + เขียน privacy policy + ใส่ในหน้าข้อตกลง (`docs/terms-*.md` → `gen-terms.mjs`)
- **DoD:** มีเอกสารนโยบาย + migration ข้อตกลงฉบับใหม่ที่ผู้ใช้ต้องกดยอมรับ

### W-11 🟠 P1 — Web Push ยังไม่ยืนยันถึงมือถือจริง

- **อาการ:** health ตอบ `push: up` แต่ `up` = ตั้ง VAPID key ครบเท่านั้น (ดู `backend/src/health/`) · SOS พึ่ง push + poll
- **งาน:** ทดสอบ Android Chrome และ iPhone (add to home screen) · วัดเวลาถึงมือถือตอน SOS · บันทึกกรณีจอปิด/เน็ตช้า
- **DoD:** ตารางผลทดสอบ 2 เครื่อง × 3 สถานะ (จอเปิด/จอปิด/เครื่องหลับ) พร้อมตัวเลขวินาที

### W-12 🟠 P1 — `IMPLEMENTATION_STATUS.md` ล้าสมัย

- **อาการ:** ระบุ "ค่าการแสดงผลเก็บใน localStorage … ไม่ sync ข้ามเครื่อง" แต่โค้ดมี `frontend/src/app/core/prefs-sync.ts` + `PATCH /me` แล้ว · ระบุวันที่ 28 ต.ค. ทั้งที่โค้ดถึง 9 พ.ย.
- **งาน:** เขียนสถานะใหม่จาก source จริง แล้วชี้มาที่เอกสารนี้สำหรับงานค้าง
- **DoD:** ไม่มีข้อความที่ขัดกับโค้ด (ตรวจด้วยการ grep ทุกข้ออ้าง)

### W-13 🟡 P2 — README ว่าง

- **งาน:** quickstart 10 บรรทัด: `npm run dev:mock` · `npm --prefix frontend start` · บัญชี `demo1234` · `box:sim` · `guardian` · ชี้ไป `CLAUDE.md` + เอกสารนี้
- **DoD:** คนใหม่รันระบบขึ้นได้ใน 5 นาทีโดยไม่ถามใคร

### W-14 🟡 P2 — ไม่มี tag/release

- **อาการ:** ไม่มี tag เลย · backend `0.0.1`, frontend `0.0.0`, firmware `0.2.9`
- **งาน:** tag `v0.1.0` · `CHANGELOG.md` · ผูกเวอร์ชันที่แสดงใน health หรือหน้าแอดมิน (OTA ใช้ค่านี้)
- **DoD:** `git describe` ตรงกับที่หน้าแอดมินแสดง

### W-15 🟡 P2 — 3-mode marker ขาด 2 ไฟล์

- **ไฟล์:** `frontend/src/app/pages/auth/auth-parts.ts`, `frontend/src/app/pages/error-screen.ts`
- **งาน:** เพิ่ม marker ที่เหมาะสม หรือใส่ allowlist ใน guardian (ถ้าเป็น component ย่อยที่ไม่ต้องมีโหมด)
- **DoD:** guardian กลับเป็น ✅

### W-16 🟡 P2 — `.mockdb-*` ค้าง 23 โฟลเดอร์

- **อาการ:** กินพื้นที่ + ทำให้หา path สับสน (gitignore ถูกแล้ว ไม่ได้ track)
- **งาน:** `npm run mock:clean` ลบทุกโฟลเดอร์ยกเว้น `.mockdb` · เตือนใน README
- **DoD:** รันแล้วเหลือเฉพาะฐานที่ใช้อยู่

### W-17 🟡 P2 — ไม่มีทางดู long-poll/คิวสด

- **อาการ:** `JobHub.waiting` มีแต่ไม่มี route · เวลา debug ตู้ "ตื่นหรือยัง" ต้องดู log
- **งาน:** `GET /admin/diagnostics/box-jobs` (แอดมิน) คืนจำนวน waiter ต่อตู้ + งานที่เปิดอยู่ · เขียน audit
- **DoD:** ระหว่าง `box:sim live` เห็น waiter = 1

### W-18 🟡 P2 — nginx ยังไม่เปิด HSTS/CSP

- **หลักฐาน:** `deploy/nginx-smmb.conf` บรรทัด 71–72 (HSTS ยัง comment) · ไม่มี CSP
- **งาน:** เปิด HSTS เมื่อแน่ใจว่า HTTPS ตลอด · เพิ่ม CSP ที่ไม่บล็อก Leaflet/รูป base64/service worker · ทดสอบว่า PWA ติดตั้งได้
- **DoD:** ไม่มี CSP violation ใน console ระหว่างเดิน 5 flow หลัก

---

## 4. ยังไม่ยืนยัน (ต้องเก็บหลักฐานเพิ่ม — อย่าถือว่าผ่าน)

| ข้อ | สถานะ |
|---|---|
| Flash บอร์ดจริงสำเร็จหรือยัง | หลักฐานล่าสุด 28 ต.ค. บอกล้มเหลว — ยังไม่ได้ลองซ้ำ |
| ระยะเวลาเก็บ log / privacy policy | ยังไม่ตัดสิน (W-10) |
| Redis จริงใน production ทน restart ได้แค่ไหน | health up แต่ไม่ได้ทดสอบfailover |
| พฤติกรรม long-poll เมื่อเราเตอร์ตัดที่ 30/60 วิ | ต้องวัดกับบอร์ดจริง (W-01) |
| Snapshot 30 วันแล้วลบจริง | มี migration แต่ยังไม่มีหลักฐานว่างานลบทำงาน |
| การกู้คืนจาก backup | ยังไม่เคยซ้อม (W-05) |

---

## 5. ลำดับที่แนะนำ

**รอบ 1 — ปิดช่อง "เทสต์ผ่านแต่ของจริงพัง" (1–2 วัน)**
W-02 (deploy+drift) → W-08 (frontend lint) → W-13 (README) → W-16 (mock:clean) → W-09 (advisory lock)

**รอบ 2 — มั่นใจก่อนเปิดบ้านนำร่อง (3–5 วัน)**
W-03 (Playwright 5 เส้น) → W-07 (e2e ใน CI) → W-05 (backup+ซ้อม restore) → W-06 (monitor)

**รอบ 3 — ของจริง + กฎหมาย**
W-01 (bench test บอร์ด) → W-04 (โดเมน) → W-11 (push มือถือจริง) → W-10 (PDPA/retention)

**เก็บกวาดต่อเนื่อง:** W-12, W-14, W-15, W-17, W-18

---

## 6. วิธีตรวจซ้ำ

```powershell
# ตรวจสุขภาพทั้งชุด (เขียนรายงานที่ reports/)
node scripts/project-guardian.mjs --full

# ตรวจ drift ระหว่าง production กับ HEAD (ทำมือจนกว่า W-02 จะเสร็จ)
npm --prefix frontend run build:hub
(Invoke-WebRequest https://hub.sjp-dev.net/smmb/ -UseBasicParsing).Content -match 'main-[A-Z0-9]+\.js'
Get-ChildItem frontend\dist\smmb-web\browser -Filter 'main-*.js'

# health production
Invoke-WebRequest https://hub.sjp-dev.net/smmb-api/api/health -UseBasicParsing | Select-Object -Expand Content
```

> หมายเหตุ: `reports/` อยู่ใน `.gitignore` — รายงานดิบจะไม่ติดไปกับ repo จึงต้องสรุปผลลงเอกสารนี้ทุกครั้ง
