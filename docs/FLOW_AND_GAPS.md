# SMMB — ผลตรวจโฟลวและช่องว่าง (Flow & Gap Audit)

> ตรวจเมื่อ **2026-11-10 09:05–09:30 (ไทย)** · commit `8e748bb` · working tree สะอาด
> **อัปเดตรอบที่ 2: 2026-11-10 (ไทย)** — เก็บงาน W-08/W-09/W-13/W-15/W-16/W-17 แล้ว (commit `99b14e3`, `5279344`)
> **อัปเดตรอบที่ 3: 2026-11-10 (ไทย)** — ตรวจ UX/โฟลวทุกโหมด + ทุกบทบาท แล้วแก้ชุดใหญ่ (ดู §3.1) · migration ใหม่ `0034`–`0036` (ทดสอบกับ PGlite ผ่าน) · frontend build `main-WBMGQQNF.js` · test 83 (frontend) + 81 (backend) ผ่านหมด
> **อัปเดตรอบที่ 4: 2026-11-10 (ไทย) — deploy + nginx แล้ว** · commit `05e540b` ขึ้น production ผ่าน Docker Compose (host นี้ไม่มี user `smmb`) · เว็บเสิร์ฟ `main-WBMGQQNF.js` ตรงกับ dist · `config.json` มี `devTools:false` · health 200 `ok` (postgres/redis/push up) · migration ล่าสุด `0036_admin_audit.sql` → **ปิด W-02 (drift)** · nginx: header ครบ + **CSP บังคับใช้ + HSTS 1 วัน** → **ปิด W-18** · ยังค้าง: ซ้อม rollback, backup/monitor
> ผู้ตรวจ: agent (read-only สำหรับผลตรวจรอบแรก) · วิธีตรวจ: `node scripts/project-guardian.mjs --full` + อ่านโค้ดเส้นทางหลัก + ยิง health/หน้าเว็บ production + build production เทียบ hash
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
| 3-mode coverage | ✅ | ไม่มีไฟล์ตกหล่น (allowlist เฉพาะ component ย่อย) |
| i18n ไทย/อังกฤษ | ✅ | ครบทุก `i18n.t({ th, en })` |
| Hardcoded secrets | ✅ | ไม่พบ |
| Migrations | ✅ | 37 ไฟล์ · ล่าสุด `0036` · เลขไม่ซ้ำ · `0034`–`0036` ทดสอบกับ PGlite ผ่าน (index ซ้ำถูกลบ · purge ต้องมี flag · audit append-only) |
| TODO/FIXME | ℹ️ | ไม่พบ |
| Frontend build / unit / lint | ✅ | build + 83 unit + oxlint ผ่าน |
| Backend build / lint / unit | ✅ | build + lint (exit 0) + 81 unit ผ่าน |

### สถานะ production (ยิงจริง 2026-11-10 09:11 ไทย · ตรวจซ้ำหลัง deploy 12:18 ไทย)

| จุด | ผล |
|---|---|
| `https://hub.sjp-dev.net/smmb/` | 200 |
| `/smmb-api/api/health/live` | 200 |
| `/smmb-api/api/health` | 200 · `postgres=up, redis=up, push=up` · uptime ~16 ชม. |
| bundle ที่เสิร์ฟ | `main-WBMGQQNF.js` (ตรวจซ้ำ 10 พ.ย. 2026 หลัง deploy `05e540b`) |
| bundle จาก HEAD (`build:hub`) | `main-WBMGQQNF.js` → **ตรงกัน (ปิด W-02)** |
| `config.json` บน prod | `{"apiBase":"/smmb-api","devTools":false}` ✅ |
| health หลัง deploy | 200 · `status:"ok"` · postgres/redis/push = up |
| migration ล่าสุด | `0036_admin_audit.sql` |

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
| W-01 | 🔴 P0 | ตู้จริง (ESP32-CAM) ยังไม่เคยรันกับระบบ | ⬜ (ฮาร์ดแวร์) |
| W-02 | 🔴 P0 | production ไม่ตรงกับ HEAD + สคริปต์ deploy/rollback | ✅ 10 พ.ย. (deploy `05e540b` · hash ตรง · health 200 · migration 0036) · เหลือซ้อม rollback |
| W-03 | 🔴 P0 | ไม่มี browser E2E (Playwright) | ✅ 12 พ.ย. 2026 — `npm --prefix frontend run e2e:web` · 9 เทสต์ (5 เส้นหลัก + 3 regression) · ผ่าน 3/3 รอบติดกัน 58.0/58.0/60 วินาที (ดู 3.2-c รอบ 9) · ยังไม่ใส่ CI = W-07 |
| W-04 | 🔴 P0 | ยังไม่ตัดสินโดเมนจริงก่อนพิมพ์ QR ตู้ | ⬜ (รอผู้ใช้ตัดสิน) |
| W-05 | 🔴 P0 | backup ยังเป็นเอกสาร ไม่มีระบบ/ไม่เคยซ้อม restore | ⬜ (เซิร์ฟเวอร์) |
| W-06 | 🟠 P1 | ไม่มี uptime monitor / alert นอกเครื่อง | ⬜ (เซิร์ฟเวอร์) |
| W-07 | 🟠 P1 | CI ไม่รัน e2e (98 เคส) | ⬜ (ต่อจาก W-03) |
| W-08 | 🟠 P1 | frontend ไม่มี lint เลย | ✅ 10 พ.ย. (oxlint + guardian) |
| W-09 | 🟠 P1 | single-instance (JobHub in-memory) ไม่มี guard ตอน boot | ✅ 10 พ.ย. (advisory lock) |
| W-10 | 🟠 P1 | PDPA / ระยะเก็บ log+รูป ยังไม่ตัดสิน | 🟡 ใส่ retention ตามข้อตกลงในโค้ดแล้ว (log 1 ปี · security/รายงาน 90 วัน · session 30 วัน · รูป 30 วัน) · รอผู้ใช้ยืนยัน + privacy policy |
| W-11 | 🟠 P1 | Web Push ยังไม่ยืนยันถึงมือถือจริง (SOS พึ่ง push) | ⬜ (ทดสอบเครื่องจริง) |
| W-12 | 🟠 P1 | `IMPLEMENTATION_STATUS.md` ล้าสมัยแล้ว | ✅ 10 พ.ย. (ขึ้น banner historical) |
| W-13 | 🟡 P2 | README ว่าง 2 ไบต์ | ✅ 10 พ.ย. |
| W-14 | 🟡 P2 | ไม่มี tag/release/CHANGELOG + version ไม่ผูกกัน | 🟡 มี CHANGELOG · รอ tag `v0.1.0` |
| W-15 | 🟡 P2 | 3-mode marker ขาด 2 ไฟล์ | ✅ 10 พ.ย. (allowlist) |
| W-16 | 🟡 P2 | `backend/.mockdb-*` ค้าง 23 โฟลเดอร์ | ✅ 10 พ.ย. (คืน 940.6 MB) |
| W-17 | 🟡 P2 | ไม่มีทางดู long-poll/คิวงานสด | ✅ 10 พ.ย. (`GET /admin/diagnostics/box-jobs`) |
| W-18 | 🟡 P2 | nginx ยังไม่เปิด HSTS/CSP | ✅ 10 พ.ย. CSP บังคับใช้ + HSTS 1 วัน บน prod · เหลือใส่ HSTS ซ้ำใน `location /smmb/` |

---

### W-01 🔴 P0 — ตู้จริงยังไม่เคยรันกับระบบ

- **อาการ:** ทั้งเส้นตรวจตู้พิสูจน์ด้วย `npm run box:sim` เท่านั้น · การ flash ครั้งล่าสุดล้มเหลว (COM17 ไม่ตอบ bootloader)
- **หลักฐาน:** `docs/IMPLEMENTATION_STATUS.md` §"ข้อจำกัดที่เหลือ" (28 ต.ค.) · `docs/HARDWARE_FIRMWARE_GUIDE.md` §8 (เช็กลิสต์ 12 ข้อ)
- **งาน:** bench test 1 วันตามเช็กลิสต์ 12 ข้อ · เก็บตัวเลข `wake_ms`, เราเตอร์ตัด long-poll กี่วิ, อ่าน QR กลางคืน/แดดจ้า, ความร้อน/แบต, เสียง Buzzer
- **DoD:** มีตารางผลทดสอบ 12 ข้อพร้อมตัวเลขจริง + ระบุข้อที่ไม่ผ่านและแผนแก้
- **ความเสี่ยง:** ถ้าบอร์ดมีปัญหาเรื่องไฟ/กล้อง/deep sleep ระบบหลังบ้านที่สมบูรณ์จะดูเหมือนพังทั้งหมด

### W-02 🔴 P0 — production ไม่ตรงกับ HEAD

- **✅ ตัดสิน 10 พ.ย. 2026 (ผู้ใช้):** deploy **ด้วยมือเท่านั้น** — `git pull` บนเซิร์ฟเวอร์ แล้วสั่ง Codex รัน `scripts/deploy.sh` · **ไม่ทำ auto-deploy** (GitHub Actions / self-hosted runner / systemd timer) เพราะยุ่งยากเกินความจำเป็นของทีมขนาดนี้ · ห้ามเสนอซ้ำ

- **สถานะ 10 พ.ย. 2026 (deploy แล้ว):** ✅ commit `05e540b` ขึ้น production ผ่าน **Docker Compose** (host นี้ไม่มี user `smmb` จึงไม่ใช้ `sudo -u smmb`/`scripts/deploy.sh` ตรง ๆ)
  - เว็บเสิร์ฟ `main-WBMGQQNF.js` = hash ใน `frontend/dist/smmb-web/browser/index.html` ✅ (guardian: `Deploy drift — prod = dist`)
  - `config.json` บน prod = `{"apiBase":"/smmb-api","devTools":false}` ✅
  - health 200 · `status:"ok"` · postgres/redis/push = up ✅
  - migration ล่าสุด `0036_admin_audit.sql` ✅
  - **ยังเหลือ:** ซ้อม rollback 1 ครั้ง (ช่วง maintenance) — ยังไม่เคยทดสอบบน host นี้
- **อาการเดิม (ก่อน deploy):** prod เสิร์ฟ `main-WFSM5UAM.js` · build จาก HEAD ได้ `main-RESLRBDK.js` (ตรวจซ้ำ 10 พ.ย.) · `config.json` บน prod ไม่มีคีย์ `devTools` แต่ `build:hub` เขียน `{"apiBase":"/smmb-api","devTools":false}`
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

- **สถานะ 10 พ.ย. 2026:** ✅ เพิ่ม `npm --prefix frontend run lint` (oxlint + tsgolint) และ guardian รัน lint frontend แล้ว · แก้ warning ทั้งหมด (unused imports, template string type, spread string) จนผ่าน 0 warning
- **DoD:** `npm run lint` ที่ frontend ผ่าน · guardian รายงานผลแยกบรรทัด

### W-09 🟠 P1 — single-instance ไม่มี guard

- **สถานะ 10 พ.ย. 2026:** ✅ เพิ่ม `InstanceLock` ถือ `pg_try_advisory_lock` ตลอดอายุโปรเซส · process ที่สอง log error แล้ว `exit(1)` · ข้ามได้ด้วย `ALLOW_MULTI_INSTANCE=1` · บังคับใช้เฉพาะ `NODE_ENV=production` (PGlite dev ใช้ทีละ connection จึงถือ lock ไม่ได้) · ทดสอบ guard ได้ด้วย production + PostgreSQL จริง
- **DoD:** รัน 2 process พร้อมกันแล้วตัวที่สองออกทันทีพร้อมข้อความชัด

### W-10 🟠 P1 — PDPA / retention

- **สถานะ 10 พ.ย. 2026:** 🟡 ใส่ retention ใน `scheduler.service.ts` ตามข้อตกลงแล้ว — session 30 วัน · รูปยืนยัน 30 วัน · `scan_log_tb`/`data_access_log_tb`/`notification_tb`/`user_device_tb` 1 ปี · `box_auth_log_tb`/`box_report_tb` 90 วัน
  - log ยัง append-only: การลบของ scheduler ต้อง `SET LOCAL app.allow_log_purge='on'` ใน transaction เท่านั้น (migration `0035`) — แอปลบเองไม่ได้
- **ยังค้าง (ตัดสินใจ):** ข้อความ privacy policy + ระยะที่ประกาศในหน้าข้อตกลง (`docs/terms-*.md` → `gen-terms.mjs` → migration ข้อตกลงฉบับใหม่)
- **DoD:** เอกสารนโยบายตรงกับค่าคงที่ใน `scheduler.service.ts` + ผู้ใช้กดยอมรับฉบับใหม่

### W-11 🟠 P1 — Web Push ยังไม่ยืนยันถึงมือถือจริง

- **อาการ:** health ตอบ `push: up` แต่ `up` = ตั้ง VAPID key ครบเท่านั้น (ดู `backend/src/health/`) · SOS พึ่ง push + poll
- **งาน:** ทดสอบ Android Chrome และ iPhone (add to home screen) · วัดเวลาถึงมือถือตอน SOS · บันทึกกรณีจอปิด/เน็ตช้า
- **DoD:** ตารางผลทดสอบ 2 เครื่อง × 3 สถานะ (จอเปิด/จอปิด/เครื่องหลับ) พร้อมตัวเลขวินาที

### W-12 🟠 P1 — `IMPLEMENTATION_STATUS.md` ล้าสมัย

- **อาการ:** ระบุ "ค่าการแสดงผลเก็บใน localStorage … ไม่ sync ข้ามเครื่อง" แต่โค้ดมี `frontend/src/app/core/prefs-sync.ts` + `PATCH /me` แล้ว · ระบุวันที่ 28 ต.ค. ทั้งที่โค้ดถึง 9 พ.ย.
- **งาน:** เขียนสถานะใหม่จาก source จริง แล้วชี้มาที่เอกสารนี้สำหรับงานค้าง
- **DoD:** ไม่มีข้อความที่ขัดกับโค้ด (ตรวจด้วยการ grep ทุกข้ออ้าง)

### W-13 🟡 P2 — README ว่าง

- **สถานะ 10 พ.ย. 2026:** ✅ เขียน quickstart (dev:mock, frontend, บัญชีเดโม, box:sim, guardian, mock:clean) + ชี้ไป `CLAUDE.md`/`FLOW_AND_GAPS.md`
- **DoD:** คนใหม่รันระบบขึ้นได้ใน 5 นาทีโดยไม่ถามใคร

### W-14 🟡 P2 — ไม่มี tag/release

- **อาการ:** ไม่มี tag เลย · backend `0.0.1`, frontend `0.0.0`, firmware `0.2.9`
- **งาน:** tag `v0.1.0` · `CHANGELOG.md` · ผูกเวอร์ชันที่แสดงใน health หรือหน้าแอดมิน (OTA ใช้ค่านี้)
- **DoD:** `git describe` ตรงกับที่หน้าแอดมินแสดง

### W-15 🟡 P2 — 3-mode marker ขาด 2 ไฟล์

- **สถานะ 10 พ.ย. 2026:** ✅ เพิ่ม allowlist ใน guardian สำหรับ `auth-parts.ts` / `error-screen.ts` (component ย่อย/หน้าสาธารณะที่ไม่ต้องมีโหมด)
- **DoD:** guardian กลับเป็น ✅

### W-16 🟡 P2 — `.mockdb-*` ค้าง 23 โฟลเดอร์

- **สถานะ 10 พ.ย. 2026:** ✅ เพิ่ม `npm --prefix backend run mock:clean` (เก็บ `.mockdb`, `--all` ลบหมด, `--dry-run` ดูก่อน) · รันจริงแล้วคืนพื้นที่ 940.6 MB / 21 โฟลเดอร์
- **DoD:** รันแล้วเหลือเฉพาะฐานที่ใช้อยู่

### W-17 🟡 P2 — ไม่มีทางดู long-poll/คิวสด

- **สถานะ 10 พ.ย. 2026:** ✅ เพิ่ม `GET /api/v1/admin/diagnostics/box-jobs` (แอดมิน) คืน `waiting`, `waiting_by_box`, `open_jobs` · ยังไม่มี UI (ใช้ curl/หน้า diagnostics ในอนาคต)
- **DoD:** ระหว่าง `box:sim live` เห็น waiter = 1

### W-18 ✅ P2 — nginx HSTS/CSP (ปิดแล้ว)

- **สถานะ 10 พ.ย. 2026:** ✅ **ปิดแล้ว** — header ครบ + CSP **บังคับใช้** + HSTS `max-age=86400` บน production
  - ไฟล์จริงบน host: `deploy/nginx-hub.conf` (bind-mount เข้า container **`smmb-edge-proxy-1`**) — ไม่ใช่ `deploy/nginx-smmb.conf` ที่อยู่ใน repo
  - สำรองเดิม: `deploy/nginx-hub.conf.bak-20261110` (ก่อนใส่ header) · `deploy/nginx-hub.conf.bak-20261110-csp` (ก่อนบังคับ CSP/HSTS)
  - ตรวจจากเครื่อง dev: `/smmb/` + `/smmb/index.html` + `/smmb/config.json` มี `Content-Security-Policy` (ไม่มี `-Report-Only`) · index มี `Strict-Transport-Security: max-age=86400` · `box/jobs?wait=1` = 401
  - ⚠️ **จุดเล็กที่ควรเก็บ:** `location /smmb/` ยังไม่มี HSTS (เพราะมี `add_header` เอง) — เพิ่ม `add_header Strict-Transport-Security "max-age=86400" always;` ใน location นั้นด้วย (แก้ใน repo snippet ให้แล้ว)
  - ⚠️ **บทเรียน (10 พ.ย. 2026):** CSP `script-src 'self'` บล็อก inline script ของ Angular ที่สลับ critical CSS (`media="print"` → `all`) → global CSS ไม่โหลด การ์ด/ปุ่มเสียสไตล์ · แก้โดยเพิ่ม `'sha256-LMY6wYoFV9I4wWzxaq1N/dTpl4iurQktw706UCHK3vM='` ใน `script-src` (ทั้ง 2 location) · ถ้าอัปเกรด Angular ต้องคำนวณ hash ใหม่
  - ⚠️ **เพิ่ม 10 พ.ย.:** ต้องมี `blob:` ใน `style-src` ด้วย (มี stylesheet ที่โหลดผ่าน `blob:` — ถ้าไม่ให้ จะขึ้น violation และบางสไตล์หาย)
  - ✅ **แผนที่ (10 พ.ย. 2026):** เปลี่ยนมาโหลด tile ผ่าน backend `GET /api/v1/map-tiles/:z/:x/:y` (same-origin · cache ในหน่วยความจำ · OSM→CARTO ฝั่ง server) — CSP ไม่ต้องเปิดโดเมนแผนที่ภายนอกแล้ว · เซิร์ฟเวอร์ต้องออกเน็ตไป OSM/CARTO ได้ (ตรวจแล้ว 200)
  - ฟอนต์ self-host แล้ว (`public/fonts/`) — CSP ตัด `fonts.googleapis.com`/`gstatic.com` ออกได้
  - `401 GET /api/v1/me` ใน console = session หมดอายุ/ยังไม่ล็อกอิน — build ใหม่จะพาไปหน้าเข้าสู่ระบบพร้อม `next`; ถ้ายังค้างให้ล้าง service worker แล้วล็อกอินใหม่
  - Cloudflare Web Analytics (`static.cloudflareinsights.com`) ถูก CSP บล็อก — เลือกอย่างใดอย่างหนึ่ง: ปิดใน Cloudflare dashboard (แนะนำ) หรืออนุญาต origin ใน `script-src` + `connect-src` (ทำใน repo แล้ว)
- **ข้อควรระวัง:** ไฟล์จริง `deploy/nginx-hub.conf` ไม่มีใน git repo — ควร commit เข้า repo หรือเก็บสำรอง ไม่งั้นเครื่องอื่น/คนใหม่จะไม่เห็นค่าจริง
- **หลักฐานเดิม:** `deploy/nginx-smmb.conf` บรรทัด 71–72 (HSTS comment) · ไม่มี CSP · `location = /smmb/index.html` ทิ้ง header ของ `server {}`
- **งานบนเซิร์ฟเวอร์:** deploy config ใหม่ → ตรวจ header ครบ → เดิน 5 flow + PWA offline → ไม่มี violation จึงเปลี่ยนเป็น `Content-Security-Policy` และเพิ่ม HSTS
- **DoD:** ไม่มี CSP violation ใน console ระหว่างเดิน 5 flow หลัก · `curl -I` เห็น header ครบทั้ง `/smmb/` และ `/smmb/index.html`

---

## 3.1 ปิดแล้ว — รอบตรวจ UX/โฟลวทุกโหมด (10 พ.ย. 2026)

> ที่มา: audit frontend ทั้งหมด (routing/guards · เจ้าของ · เจ้าหน้าที่ · หัวหน้า/แอดมิน · auth/rider · state/async · error/empty · i18n/เวลา · 3-mode · a11y · security/perf) แล้วแก้ข้อที่เป็น P0/P1 และ quick win ทั้งหมด

| กลุ่ม | ที่แก้ | หลักฐาน |
|---|---|---|
| Redirect/guard | บัญชี `roles=[]` ไม่วนกลับ `/home` แล้ว → ไป A11 (รอหัวหน้า) หรือ L02 (รอแอดมิน) ตามสถานะ · A11 เปิดให้ผู้ที่ล็อกอินแต่ยังไม่มีบทบาท · `guestOnly` ไม่เด้งวนเมื่อยังไม่มีที่ไป · `roleEntry` กัน prototype key (`Object.hasOwn`) | `frontend/src/app/core/session.ts`, `app.routes.ts` |
| Session | 401 กลางหน้า → ล้าง `Me` + ไปหน้าเข้าสู่ระบบพร้อม `next` · network/5xx แยกจาก 401 (`offline` signal → `/error/offline`) · demo เปิดเฉพาะ dev/`devTools` | `core/api.ts`, `core/session.ts`, `app.ts`, `app.routes.ts` |
| เจ้าของบ้าน | หน้าหลักแสดง error+retry ก่อน spinner (เน็ตหลุดครั้งแรกไม่ค้าง) · ปุ่มตั้งค่าการแจ้งเตือนชี้ `/settings/notifications` · ไม่มีตู้ → caption "ยังไม่ได้ผูกตู้" | `pages/owner-home.ts`, `pages/owner/owner-notifications.ts`, `pages/owner/owner-settings.ts` |
| หน้าหลัก (ซ้ำ/ทับ) | ตู้ offline แสดงการ์ดเดียว (เดิมมีทั้งการ์ดแดง + การ์ดสถานะพูดซ้ำ) · โหมดละเอียดไม่แสดงแบต/ติดต่อล่าสุดซ้ำสองชุด (การ์ดสรุป + ตารางเทคนิค) · ปุ่ม SOS เปลี่ยนเป็น fixed เหนือแถบเมนู + เว้นที่ท้ายหน้า กันเนื้อหาถูกทับ | `pages/owner-home.ts`, `pages/owner-home.scss`, `styles.scss` |
| โหลดผิดพลาด | `app-load-error` กลาง + retry แทนการกลืน error แล้วขึ้น empty (notification, owner-history, admin-boxes, admin-people, head-zones) · `loadMore` ไม่เลื่อนหน้าเมื่อ fetch ล้ม | `shared/state-view.ts` + หน้าข้างต้น |
| ฟอนต์/เวลา/ยืนยัน | self-host ฟอนต์ (Noto Sans Thai + JetBrains Mono) ไม่พึ่ง Google · fix TZ `Asia/Bangkok` ในเวลานัด/ส่งคำขอ/เฟิร์มแวร์ · เพิ่ม confirm ปิดบัญชีและถอดหัวหน้า | `index.html`, `public/fonts/`, `owner-settings.ts`, `admin-technician-requests.ts`, `admin-people.ts`, `head-members.ts` |
| เจ้าหน้าที่ | O08 แยกสถานะ "ยืนยันผลไม่ได้" + ลองใหม่ (ไม่ขึ้น "ตรวจแล้ว" ทั้งที่ไม่มีข้อมูล) · A12 มีปุ่มออกจากระบบ + ไปหน้าบทบาท + วิธีเปิดแจ้งเตือนในโหมดง่าย | `pages/officer/officer-check.ts`, `pages/auth/auth-officer.ts` |
| แอดมิน | D04 พิมพ์ QR ได้จริง (`.print-sheet` + `app-qr-image` ของ slot ที่ active) · คำค้นเก็บใน `?q=` · `resetConfig` ล้างค่า override เก่า · ช่องค้นหามี `aria-label` · BoxTest ใช้ `max_attempts` จริง | `pages/admin/admin-boxes.ts`, `admin-qr.ts`, `shared/box-test.ts` |
| มือถือ/a11y | safe-area ล่างให้ `.pad`/`.sos-foot` · keypad 6 คอลัมน์ (เดิม 7 แน่นเกิน) · meta description | `styles.scss`, `shared/code-keypad.ts`, `index.html` |
| Auth | A14 กันกดซ้ำ (`busy`) | `pages/auth/auth-account.ts` |
| Backend | error จาก input ผิดรูป (uuid/วันที่) = 400 ไม่ใช่ 500 · ตัวอ่าน body error ไม่ใช่ 500 · raw-body รูปใช้ `req.path` (query string ไม่ทำให้เพดานเหลือ 16k) · pagination สูงสุด 1000 · heartbeat ตู้ (`last_poll_date`) อัปเดตตอนตอบ config/command · JobHub ถอน waiter เมื่อ query ล้ม | `common/http-exception.filter.ts`, `common/validators.ts`, `app-setup.ts`, `box/box-protocol.*` |
| ความปลอดภัย/ปฏิบัติการ | rate limit เริ่มต้น 300/นาที + Redis ล่มใช้ memory · SOS create/cancel 5 ครั้ง/5 นาที · health แยก `degraded` (push) กับ `error` (postgres/redis) · CLI seed ปฏิเสธ `NODE_ENV=production` · คืนตู้ปิดงานช่างที่ค้าง · audit log สิทธิ์/อนุมัติ/รีเซ็ตรหัส | `rate-limit/*`, `sos/sos.controller.ts`, `health/*`, `db/create-testers-cli.ts`, `box/admin-box.service.ts`, `common/audit.service.ts` |
| ข้อมูล/retention | migration `0034` ลบ index ซ้ำ · `0035` ให้ scheduler purge log ได้โดยยัง append-only · `0036` ตาราง audit (ทดสอบกับ PGlite: ผ่านทุกข้อ) | `backend/sql/migrations/0034…0036` |
| ข้ามบัญชี | `AppReset` — ออกจากระบบ/session หมดอายุ ล้างประวัติเจ้าของ, ฟอร์มสมัคร (ชื่อ/เบอร์/ที่อยู่), เคส QR ของแอดมิน, บทบาทจำลอง | `core/app-reset.ts`, `core/session.ts` |
| ประวัติ/แจ้งเตือน | ลิงก์เหตุการณ์ส่ง `?box=` ด้วย · หน้ารายละเอียดโหลดของตู้นั้นแบบไม่กรองช่วงถ้าหาในหน่วยความจำไม่เจอ (เดิมเหตุการณ์เก่า/ตู้ที่ 2 เด้งกลับเงียบ ๆ) · A01/A02 (วิธีเปิด/ติดตั้ง) เปิดได้หลังล็อกอินแล้ว | `pages/owner-home.ts`, `pages/owner/owner-history.ts`, `app.routes.ts` |
| Dependency | `npm audit --omit=dev` = 0 ช่องโหว่ (dev เหลือ undici ใน dependency ของ tool — ต้อง `--force` จึงยังไม่แตะ) | — |

**หมายเหตุ:** งานชุดนี้ยัง **ไม่ commit / ยังไม่ deploy** — prod จึงยังเสิร์ฟ bundle เก่า (W-02)

## 3.1-b ปิดแล้ว — ตรวจช่องโหว่ input/การรับส่งข้อมูล (11 พ.ย. 2026)

| เรื่อง | แก้ | ไฟล์ |
|---|---|---|
| หน้าตั้ง Wi-Fi ของตู้ (SoftAP ไม่มีรหัส) แก้ URL/รหัสตู้/รหัสลับได้ → ชี้ตู้ไปเซิร์ฟเวอร์ปลอม | ตู้ที่ตั้งค่าครบแล้ว แก้ได้แค่ Wi-Fi · URL ต้อง `https://` (http ได้เฉพาะ LAN) · build `esp32cam` ผ่าน · **ยังไม่ได้ทดสอบบนบอร์ดจริง** | `firmware/src/portal.cpp`, `docs/HARDWARE_FIRMWARE_GUIDE.md` §5 |
| ล็อกอินโดยไม่ส่ง `X-Device-Id` หลบแจ้งเตือน "เจ้าหน้าที่เข้าจากเครื่องใหม่" | ไม่มี/ผิดรูปแบบ = เครื่องไม่รู้จัก → แจ้ง | `backend/src/auth/auth.service.ts`, `docs/api.md` |
| `deploy/nginx-smmb.conf` ยังเป็น CSP Report-Only (ไม่ตรง production) | เปลี่ยนเป็น `Content-Security-Policy` ทั้งสอง location | `deploy/nginx-smmb.conf` |

**ทดสอบเจาะบน mock (11 พ.ย. 2026 · ~330 ข้อ):** สิทธิ์ 143 route × 5 บทบาท · IDOR ข้ามผู้ใช้/หน่วยงาน · ลายเซ็นตู้ · ไรเดอร์ · SSRF push ผ่านหมด · พบ+แก้ 3 เรื่อง:

| เรื่อง | แก้ | ไฟล์ |
|---|---|---|
| ตัวอักษร NUL ใน input → 500 (ยิงได้แม้ไม่ล็อกอิน: เบอร์ตอน signin, `/public/codes/%00`) | `RejectNulPipe` ตอบ 400 · guard ตู้ตรวจ JSON · filter แปลง PG 22021 เป็น 400 · JSON ซ้อนลึก → 400 | `backend/src/app-setup.ts`, `box/box-auth.guard.ts`, `common/http-exception.filter.ts` |
| signin รับ `x-www-form-urlencoded` (login CSRF) | `requireJsonBody` → 415 | `backend/src/app-setup.ts` |
| ค้นผู้ใช้แอดมินด้วย `%` ได้ทุกคน | escape wildcard ผ่าน `common/like.ts` | `backend/src/admin/admin-users.service.ts` |

เหลือ (ยังไม่แก้): ตรวจว่า origin เข้าตรงไม่ผ่าน Cloudflare ไม่ได้ (ไม่งั้นปลอม `X-Forwarded-For` ได้ เพราะ `TRUST_PROXY=2`) · รหัส Wi-Fi บ้านวิ่งผ่าน SoftAP ไม่เข้ารหัส

## 3.2 ค้างจาก audit UX (P2/P3 ที่ยังไม่ได้แก้)

| รหัส | ระดับ | เรื่อง | หลักฐาน |
|---|---|---|---|
| U-01 | P2 | ✅ 12 พ.ย. 2026 (ตรวจโค้ด: owner-agencies + admin-hub มี `app-load-error` แล้ว) — หลายหน้าใช้ “empty” แทน “error” | 🟡 แก้แล้ว: notification-list, owner-history, admin-boxes, admin-people (คิว+ผู้ใช้), head-zones (มี `app-load-error` + retry) · เหลือ owner-agencies, admin-hub |
| U-02 | P2 | วันที่/เวลา: `DatePipe`/`toLocaleString` ยังใช้ TZ เครื่อง ไม่ fix `Asia/Bangkok` | 🟡 fix จุดหลักแล้ว (owner/admin technician requests, firmware, push diagnostic) · เหลือ sweep ทั้งโปรเจ็ค |
| U-03 | P2 | ✅ 12 พ.ย. 2026 (ตรวจโค้ด: firmware auto-update, QR, ถอดบ้านออกโซน มี `Confirm` แล้ว) — destructive action ที่ยังไม่มี confirm | 🟡 ปิดบัญชี (D09) + ปิดสิทธิ์/ถอดหัวหน้า (L05) มี confirm · เหลือ firmware auto-update, QR, ถอดบ้านออกโซน |
| U-04 | P2 | ✅ 12 พ.ย. 2026 — `/settings/display` โหมดง่ายเห็นขนาดตัวอักษร+ธีม (เห็นในเบราว์เซอร์) · L05 โหมดง่ายมีปุ่ม “ดูทั้งหมด” เมื่อทีม >3 · D16 โหมดง่ายมีลิงก์แจ้งเตือน/การแสดงผล · ปิดชนิดแจ้งเตือนใช้ได้ในโหมดง่ายอยู่แล้ว — เดิม: easy mode ยังเป็น dead end: D16/ระบบ, D05 QR, ปุ่มจัดการผู้ใช้, เปลี่ยนภาษา/ธีม, ปิดชนิดแจ้งเตือน, ทีม >3 คน | `admin-home.ts`, `registry.ts`, `notif-settings.ts`, `owner-settings.ts`, `head-members.ts` |
| U-05 | P2 | polling ถี่ (1–5 วิ) และไม่หยุดตอนแท็บซ่อน — ควรทำ `liveRefresh` กลาง + `visibilitychange` | หลายหน้า SOS/ตรวจตู้/D04 |
| U-06 | P2 | ✅ 12 พ.ย. 2026 — `ngsw-config.json` prefetch เฉพาะ shell (main/polyfills/theme-boot/css/html = 6 ไฟล์) · chunk 78 ไฟล์เป็น lazy · หน้า offline ยัง preload ที่ `app.ts` | `ngsw-config.json` |
| U-07 | P2 | a11y: focus trap ใน dialog, skip link, `aria-live` ทั้งหน้า SOS, progressbar ไม่มี label, field error เป็นสีอย่างเดียว | `confirm-dialog.ts`, `area-shell.ts`, `owner-sos.ts`, auth forms |
| U-08 | P2 | ไม่มี CSRF token (พึ่ง SameSite/cookie) | ✅ 12 พ.ย. 2026 — `requireSameOrigin` ใน `backend/src/app-setup.ts` ตรวจ `Origin` ของคำขอที่เปลี่ยนข้อมูล → 403 `CROSS_ORIGIN` · unit test ใน `app-setup.spec.ts` |
| U-09 | P3 | ลบ dead code/ตัวซ้ำ (owner-home-alerts, mock state, component ยักษ์ 1,400–1,700 บรรทัด) + เพิ่ม test guard/401/QR print | ตามรายงาน audit |

## 3.2-b ผลตรวจ UX/UI รอบ 2 (11 พ.ย. 2026)

> รายงานเต็ม: **`docs/UX_UI_AUDIT_2026-11-11.md`** · ตรวจ commit `38ac237` + งาน multi-box ที่ยังไม่ commit · read-only
> **อัปเดต 11 พ.ย. 2026: แก้ P0 ครบ + P1 ส่วนใหญ่แล้ว** — SOS easy contrast, การ์ด SOS error+ปุ่มโทร, `?box=` ทุกเมนู/H13-b, `last_inspected_at`/`deliveries_today`, push link+H12 `?box=`, easy headline ตาม coverage, H11 link-lost, error+retry หลายหน้า, scroll restoration, offline recovery, officer badge/O05/O06, head overview/officer toggle, admin confirm 3 จุด + load more ตู้/ผู้ใช้ + เมนู D16/ตั้งค่า/A14, signup validation/ร่างฟอร์ม, A13/A04 signout, focus trap/skip link. **ยังเหลือ:** P2 ตามรายงาน (toast, easy settings, tile error, theme flash, rider, TZ, activation QR, title) + P1-11 total จาก server + D11 logs 100 แถว

**P0 (เส้น SOS) — แก้แล้ว:**
- `UX-A01` H09 โหมดง่าย ตัวอักษร/ปุ่มยกเลิก SOS สีขาวบนพื้นสว่าง (อ่าน/กดไม่เห็น) — `owner/owner-sos.ts:157-201`, `styles.scss:745-756` → เพิ่มพื้น `--sos-bg` ให้ `.easy-sos`
- `UX-A02` H03 การ์ด “ส่ง SOS ไม่สำเร็จ” อยู่นอก `.page` หลัง `.sos-bar` fixed และไม่มีปุ่มโทร — `owner-home.ts:312-343` → ย้ายเข้า `.page` + `app-call-buttons` + scrollIntoView

**P1 ที่แก้แล้ว (รายละเอียด/ไฟล์ในรายงาน):**
- เจ้าของหลายตู้: `?box=` ทุกเมนู + H13-b แสดงบ้านเลขที่
- หน้าแรกใช้ `last_inspected_at`/`deliveries_today` จาก DB
- push `inspected`/`delivered` มี `&box=` + H12/H12-d อ่าน `?box=`
- easy headline ไม่ยืนยัน “ปลอดภัย” เมื่อไม่มีเจ้าหน้าที่
- head overview / officer SOS list มี error+retry ไม่ยืนยัน 0/ไม่มี SOS
- officer badge หมดอายุหยุดวน + ปุ่มสร้างใหม่; `?problem=1` โหลดบ้านเลขที่; O05/O06 มีปุ่มยกเลิก
- admin firmware/reset password/QR reissue มี confirm; D03/D09 load more; คอนโซลเข้าถึง D16/ตั้งค่า/A14
- signup มีสรุป error + ร่างบ้าน/step ไม่หายเมื่ออ่านข้อตกลง
- error→empty หลายหน้าถูกแก้ (เหลือ admin-hub), scroll restoration, `/error/offline` กู้ได้, easy tabs นิ่ง, focus trap/skip link

**D01 ภาพรวมแอดมิน (แก้ 11 พ.ย.):** โหลด skeleton ค้าง/ขึ้นช้า → แยก `overview` (แสดงหน้าได้ทันที) จากรายละเอียดรอง, cache overview 15 วิ + รวมคำขอจาก sidebar/หน้า D01, เปลี่ยน query กิจกรรม 7 วันเป็น single-pass และเพิ่ม index `created_date` (migration `0037`)

**Admin redesign (11 พ.ย. 2026 — commit `ea552f2`, frontend only):** ปิดงาน UX/UI แอดมินทั้งชุด — สวิตช์ธีม 3 ทาง (สว่าง/ตามเครื่อง/มืด) ใต้โลโก้ + FAB มือถือ, ค่าเริ่มต้นสว่าง, เก็บตามบัญชี · เมนูมีค้นหา + accordion เปิดกลุ่มปัจจุบัน + ellipsis label + เพิ่ม D17 · D01 มี quick actions/การ์ด “ต้องจัดการ”/KPI auto-fit · caption หน้าแอดมินเป็นมาตรฐานเดียว · กติกากันข้อความล้นกลางใน `styles.scss` · QR case 2 คอลัมน์ที่ ≥1200px · plans เต็มความกว้าง · D17 file picker ภาษาไทย. ตรวจ Playwright 1440px (9 หน้า) และ 390px ไม่มี overflow, build/lint/test ผ่าน. **Deploy:** build frontend ใหม่พอ (ไม่ต้อง migrate เพิ่มถ้ารัน `0037` แล้วจากรอบ D01)

**ยังเหลือจากรอบนี้:** composite widget arrow keys (radio/tab) · easy mode แอดมินบนมือถือยังไม่ถึง D16/ตั้งค่าโดยตรง (มีลิงก์ใน D01) · dead code บางส่วน/P2-26

## 3.2-c ตรวจในเบราว์เซอร์จริง + ตู้จำลอง (11 พ.ย. 2026 บ่าย · ยังไม่ commit)

> วิธีตรวจ: เปิดเว็บ dev (มือถือ 375px) กับ backend mock · ล็อกอินครบ 4 บทบาท · เดินเส้นตรวจตู้จริงด้วย `box:sim` (พิมพ์รหัสใต้ QR → ตู้ตื่น → `ready` → QR ประจำตัว → `pass` → เจ้าของบ้านเห็นผล) — **ผ่านทั้งเส้น**

| เรื่อง | แก้ | ไฟล์ |
|---|---|---|
| 🔴 เปิดลิงก์ตรงตอนยังไม่ล็อกอินถูกเด้งไป `/auth/signin?next=%2F` (หน้าสมัคร `/auth/choose`, `/auth/signup/*`, `/in/<บทบาท>`, ลิงก์จากแจ้งเตือน → `next` หาย ล็อกอินแล้วไม่กลับหน้าที่ตั้งใจ) — เพราะ 401 ของ `GET /me` ตอนเปิดแอปถูกตีเป็น "session หมดอายุ" | `onExpired` ทำงานเฉพาะเมื่อเคยมี `Me` · ไม่มี = ให้ guard ของ route ตัดสิน | `frontend/src/app/app.ts` |
| ประวัติเจ้าหน้าที่ (O15): การตรวจที่ผ่านขึ้นว่า "เริ่มตรวจ" + ข้อความผลซ้ำ 3 ที่ในแถวเดียว | แถวที่ตู้อ่าน QR ประจำตัวได้ = "ผ่าน" (เหมือน L08) · บอกขั้น (สแกนหน้าตู้ / พิมพ์รหัส / ตู้อ่าน QR ประจำตัว) · ผลอยู่ที่ป้ายที่เดียว | `pages/officer/officer-history.ts` |
| O08 ตรวจครบทุกหลังแล้ว ปุ่มหลักยังเป็น "สแกนหลังถัดไป" | ครบแล้ว → ปุ่มหลัก "กลับหน้าสรุป" · รอง "สแกนตรวจซ้ำ" | `pages/officer/officer-check.ts` |
| H13 มีเมนู "การแจ้งเตือน" (ที่จริงคือกล่องแจ้งเตือน แต่เขียนว่า "แตะเพื่อเปิด") ซ้อนกับ "ตั้งค่าการแจ้งเตือน" | เปลี่ยนเป็น "แจ้งเตือนย้อนหลัง" · สถานะเปิด/ปิดของเครื่องย้ายไปอยู่ที่แถวตั้งค่า | `pages/owner/owner-settings.ts` |
| A04 "ติดต่อผู้ดูแลระบบ: —" เมื่อยังไม่ได้ตั้งช่องทางติดต่อ | ไม่มีช่องทาง = ไม่แสดงเครื่องหมายขีด | `pages/auth/auth-start.ts` |

ตรวจหลังแก้: lint ผ่าน · unit 83/83 · ยืนยันในเบราว์เซอร์ (ลิงก์ตรง 3 แบบ, O15, H13, A04) · **O08 ยืนยันด้วย unit/build เท่านั้น ยังไม่ได้เดินซ้ำกับตู้จำลอง**

**รอบต่อ (11 พ.ย. 2026 บ่าย) — เดินเส้นที่เหลือในเบราว์เซอร์:** ไรเดอร์ (QR ปลอม → R03 · พิมพ์รหัส → ส่งสำเร็จ) ✅ · SOS (เจ้าของกดค้าง → เจ้าหน้าที่รับ → เจ้าของเห็นชื่อ+เบอร์ → ปิดเรื่องพร้อมผล) ✅ · หัวหน้า (ภาพรวม/โซน/สมาชิก/ตั้งค่า) ✅ · ผูกตู้ (เฉพาะหน้า+กรณีรหัสผิด — **ไม่ได้ผูกจริง** เพื่อไม่ใช้รหัสเปิดใช้ตู้ของ mock)

| เรื่อง | แก้ | ไฟล์ |
|---|---|---|
| A07 พิมพ์รหัสเปิดใช้ตู้ผิด → เด้งไปหน้าเต็ม "QR ไม่ถูกต้อง" รหัสที่พิมพ์หาย มีแค่ปุ่ม "สแกนใหม่" | พิมพ์ผิด = อยู่หน้าเดิม บอกสาเหตุ รหัสไม่หาย · หน้า A07-b (สแกนผิด) เพิ่ม "พิมพ์รหัสใต้ QR แทน" + "ไว้ทีหลัง" | `pages/auth/auth-owner.ts` |
| หัวหน้าจะตรวจตู้เองต้องเข้าไปหาในหน้าตั้งค่า | ปุ่ม "สแกนตรวจตู้เอง" บน L04 (โหมดปกติ/ละเอียด) | `pages/head-home.ts` |
| L04 ตัวเลข "SOS เปิดอยู่ 0" เป็นสีลิงก์ · "ตู้ออฟไลน์ 0" เป็นสีเตือน | 0 = สีตัวอักษรปกติ · มีจริงจึงขึ้นสี | `pages/head-home.ts` |
| L11 แถบแจ้งเตือนของหัวหน้าใช้ข้อความของเจ้าของบ้าน ("จะไม่รู้เมื่อมีเจ้าหน้าที่มาตรวจ ของมาส่ง…") | ใช้ข้อความแบบเจ้าหน้าที่ (ต้องเปิดจึงรับ SOS) | `pages/head/head-settings.ts` |

ตรวจหลังแก้: lint ผ่าน · unit 83/83 · `ng build` ผ่าน · ยืนยันในเบราว์เซอร์ (A07 ทั้งสองกรณี, L04) · L11 ยืนยันด้วย build เท่านั้น

**เห็นแล้วแต่ยังไม่ได้แก้:** ฟอร์มสมัครมีคำใบ้รหัสผ่านซ้ำ 2 บรรทัด · H10 เขียนว่า "กำลังเดินทางไปที่บ้านคุณ" ทั้งที่ระบบรู้แค่ว่ามีคนรับเรื่อง · O10 ไม่บอกอะไรเมื่อเจ้าของบ้านยังไม่ได้กรอกที่อยู่/หมุด · ปิดเรื่อง SOS แล้วกลับหน้ารายการโดยไม่มีข้อความยืนยัน · ภาพหน้าจอจาก pane ถ่ายไม่ได้เป็นช่วง ๆ จึงตรวจด้วยข้อความ/โครงหน้าเป็นหลัก (สี/ระยะห่างตรวจได้แค่บางหน้า) · ยังไม่ได้เดิน: สมัครใหม่จนจบ, ผูกตู้จนจบ (A08–A09), หัวหน้าเพิ่มบ้าน/อนุมัติสมาชิก, แอดมินลงทะเบียนตู้/เคส QR, โหมดง่าย/ละเอียด, ภาษาอังกฤษ

**รอบ 3 (11 พ.ย. 2026 บ่าย) — สมัครใหม่จนจบ · แอดมิน · โหมดง่าย/ละเอียด · ภาษาอังกฤษ:** สมัครเจ้าของบ้านใหม่ 3 ขั้น → หน้าผูกตู้ → หน้าหลักแบบยังไม่มีตู้ ✅ · แอดมิน (ตู้/รายละเอียดตู้/ผู้ใช้) เปิดดูอย่างเดียว ✅ · เจ้าของบ้านโหมดง่าย+อังกฤษ และโหมดละเอียด ✅ (ไม่มีข้อความล้นจอ 375px)

| เรื่อง | แก้ | ไฟล์ |
|---|---|---|
| 🔴 ช่องที่กรอกไม่ครบ **ไม่ขึ้นขอบแดงทั้งแอป** (`.field.invalid input` แพ้ specificity ของกฎขอบปกติ · `select`/`textarea` ไม่มีกฎเลย) + กล่องสรุปข้อผิดพลาด `.card.err` ไม่มีสไตล์กลาง | กฎใหม่เฉพาะเจาะจงเท่ากัน ครอบ input/select/textarea + ป้ายช่องเป็นสีเตือน · `.card.err` มีขอบ/พื้นสีเตือน | `frontend/src/styles.scss` |
| A06 ขั้น 2 ยาว ~25 ช่อง ช่องไม่บังคับปนช่องบังคับ (ถามชื่อซ้ำกับขั้น 1) | กลุ่ม "ข้อมูลส่วนตัวเพิ่มเติม" (ไม่บังคับทั้งกลุ่ม) พับไว้ · มีข้อมูลอยู่แล้ว = กางเอง · **ช่องบังคับคงเดิมทุกช่อง** | `shared/profile-extras.ts` |
| A06 ขั้น 3 ขึ้นแดง "ต้องยอมรับข้อตกลงก่อน" ตั้งแต่เพิ่งมาถึง + ปุ่มสมัครกดไม่ได้โดยไม่บอกเหตุ | เตือนเมื่อกดสมัครโดยยังไม่ติ๊กเท่านั้น · ปุ่มกดได้เสมอ | `pages/auth/auth-owner.ts` |
| A07 หลังสมัครเสร็จ ปุ่มย้อนกลับพาไปฟอร์มสมัครซ้ำ (ทั้งที่ล็อกอินแล้ว) | ไปหน้าหลัก | `pages/auth/auth-owner.ts` |
| คำใบ้รหัสผ่านซ้ำ 2 บรรทัด | เหลือบรรทัดเดียว (แดงเมื่อไม่ผ่าน) | `pages/auth/auth-parts.ts` |
| H10 "กำลังเดินทางไปที่บ้านคุณ" (ระบบไม่รู้) | "เจ้าหน้าที่รับเรื่องของคุณแล้ว โทรหาได้ถ้าต้องการบอกรายละเอียด" | `pages/owner/owner-sos.ts` |
| O10 ไม่มีที่อยู่/หมุด ไม่บอกอะไร · O11 ปิดเรื่องแล้วเงียบ | "เจ้าของบ้านยังไม่ได้กรอก — โทรถามทาง" · toast ยืนยันปิดเรื่อง | `pages/officer/officer-sos.ts` |
| H03 โหมดง่าย ปุ่มคู่ในการ์ดตู้ออฟไลน์ตัดคำกลาง ("Wi-/Fi") | โหมดง่ายเรียงแนวตั้ง | `pages/owner-home.ts` |
| H03 โหมดละเอียด เวลาของเหตุการณ์/ติดต่อล่าสุดที่ไม่ใช่วันนี้ขึ้นแค่ `14:07:52` | มีวันที่นำหน้าเมื่อไม่ใช่วันนี้ | `pages/owner-home.ts` |

ตรวจหลังแก้: lint ผ่าน · unit 83/83 · `ng build` ผ่าน · ยืนยันในเบราว์เซอร์: ขอบแดง+กล่องสรุป, A06 ทั้ง 3 ขั้นจนสมัครสำเร็จ, A07 ย้อนกลับ, ปุ่มโหมดง่าย, เวลาโหมดละเอียด · **ยืนยันด้วย build เท่านั้น:** H10, O10, O11 (toast), กลุ่มพับใน A15

**เห็นแล้วแต่ยังไม่ได้แก้:** A10/A15/A16 ยังขึ้นเตือนข้อตกลงก่อนกด (แบบเดียวกับที่แก้ใน A06) · D04 ตู้ที่ยังไม่เคยติดต่อขึ้น "ไม่ได้ชาร์จ" / "กดเพื่ออัปเดต" · `/settings/display` ไม่มี `<main>` · A06 `?state=no-terms` ยังเติมข้อมูลตัวอย่าง (ของเหลือจาก prototype) · mock มีบัญชีทดสอบ `0899990001` ค้าง (ล้างด้วย `npm run dev:mock -- --reset`)

**ยังไม่ได้เดิน:** ผูกตู้จนจบ (A08–A09) · หัวหน้าเพิ่มบ้าน/อนุมัติสมาชิก · แอดมินลงทะเบียนตู้/ปลุกตู้/เคส QR/อนุมัติหน่วยงาน · สมัครเจ้าหน้าที่+หน่วยงาน · โหมดง่าย/ละเอียดของเจ้าหน้าที่ หัวหน้า แอดมิน · จอ 768/1024/1440

### รอบ 4 — ตรวจต่อจากรายการค้าง + แก้ที่ต้นเหตุ (11 พ.ย. 2026 เย็น · ยังไม่ commit)

> สภาพแวดล้อม: backend mock พอร์ต **3111** (พอร์ต 3000 เป็นของ `sjp-erp-api`), frontend dev พอร์ต **4201**, proxy `/api` → 3111 (ยืนยันด้วย `GET /api/health/live` ผ่าน 4201) · ใช้ข้อมูลชุดใหม่ `.mockdb-verify` เพราะ `.mockdb` เดิมเปิดไม่ขึ้นหลังปิดโปรเซสค้าง (ลบเฉพาะ `postmaster.pid` ที่ค้าง · ไม่ได้ลบข้อมูลเดิม) · ตู้จำลอง = `box-sim poll --manual` แล้วสั่ง `ready`/`result` แยก
> เดินด้วย Playwright (Edge) viewport 375×812 เป็นหลัก + 768/1024/1440 สำหรับ layout · ทุกข้อที่แก้ยืนยันในเบราว์เซอร์ซ้ำหลังแก้

**เดินจนจบแล้ว (มีหลักฐานในเบราว์เซอร์):** เจ้าของบ้านสมัครใหม่ 3 ขั้น → ผูก BX-00002 ด้วยรหัสใต้ QR → ตั้งชื่อ → A09 → หน้าหลัก · เจ้าหน้าที่พิมพ์รหัสหน้าตู้ → O03 → ปลุกตู้ → QR ประจำตัว → ตู้จำลองอ่าน → ผ่าน → O08 → เจ้าของเห็นผลในประวัติ · หัวหน้าอนุมัติเจ้าหน้าที่ใหม่ → เจ้าหน้าที่เห็นหน้า “ยังไม่ได้อยู่ในโซน” → หัวหน้าตั้งพื้นที่โซน/ค้นบ้าน/ส่งคำขอ → เจ้าของกดยอมรับ → บ้านเข้าโซน · แอดมินลงทะเบียน BX-00003 + ทดสอบปลุก/กล้อง BX-00001 ผ่านตู้จำลอง + อนุมัติหน่วยงานใหม่ · สมัครหน่วยงาน L01 → แอดมินอนุมัติ → L03 แสดงรหัสกลุ่ม · โหมดง่าย/ละเอียด 4 บทบาทที่ 375 · อังกฤษ 4 บทบาท · 768/1024/1440 ไม่มี horizontal overflow

| เรื่อง | อาการเดิม | สิ่งที่เปลี่ยน | ไฟล์ | ยืนยันด้วย |
|---|---|---|---|---|
| 🔴 ปุ่มหลักในฟอร์ม “กดครั้งแรกไม่ติด” ทั้งแอป | พิมพ์ช่องสุดท้ายแล้วแตะปุ่มหลัก → `mousedown` โดนปุ่ม แต่ `focusout` ทำให้ `main:has(input:focus)` ลด padding/หน้าเลื่อนกลับ ปุ่มขยับ ~92px → `click` ไปตกที่ `<form>` (ปุ่มถูก disable ชั่วขณะ) | เผื่อพื้นที่ท้ายหน้า **ถาวร** บนจอ ≤1023px ที่ `body` แทนการผูกกับ `:focus` — ไม่มี layout shift ตอน blur | `frontend/src/styles.scss` | Playwright: pointerdown/up target = BUTTON ทุกครั้ง · A10 ขั้น 1→2, สมัครเจ้าของบ้าน, L01 เดินต่อได้ด้วยการกดครั้งเดียว |
| A10/A15/A16/L01 เตือนข้อตกลงก่อนกด + ปุ่มส่งกดไม่ได้ | ยังไม่ติ๊ก แต่ขึ้นแดง “ต้องยอมรับข้อตกลง” ทันทีที่พิมพ์ครบ และปุ่ม `disabled` โดยไม่บอกเหตุ | เพิ่ม `termsTried` — เตือนเมื่อกดส่งเท่านั้น · ปุ่มส่งกดได้เสมอ (ยกเว้นกำลังบันทึก) · A15/A16 ทำช่องบังคับเป็นแดงเมื่อกดส่ง | `pages/auth/auth-officer.ts`, `auth-account.ts`, `pages/head/head-setup.ts` | ก่อนกด = ไม่มีข้อความ/ปุ่ม enabled · หลังกด = ขึ้นข้อความ (A10, A15, A16, L01) |
| D04 ตู้ที่ยังไม่เคยติดต่อ | ขึ้น “ไม่ได้ชาร์จ” และ “กดเพื่ออัปเดต” ทั้งที่ไม่มีข้อมูลแบต/เฟิร์มแวร์ | ไม่มีข้อมูล = “ยังไม่มีข้อมูล” (ไทย/อังกฤษ) | `pages/admin/admin-boxes.ts` | เปิด BX-00002/BX-00003 ที่ไม่มีข้อมูล — ไม่มีข้อความชาร์จ/อัปเดตแล้ว |
| `/settings/display` ไม่มี landmark `<main>` | เปิดนอก AreaShell จึงไม่มี `<main>` (a11y) | host ของ `OwnerDisplay` ได้ `role="main"` + `id="main-content"` เมื่อเปิดแบบ shared | `pages/owner/owner-settings.ts` | audit หน้า: `main=true` |
| A06 `?state=no-terms` เติมข้อมูลตัวอย่าง | เปิดลิงก์แล้วมีชื่อ/เบอร์/บ้านปลอมของผู้ใช้ | ไม่เติมข้อมูลใด ๆ — ไปขั้น 3 เฉพาะเมื่อมีร่างจริงอยู่แล้ว | `pages/auth/auth-owner.ts` | เปิด `?state=no-terms` ด้วยร่างว่าง = อยู่ขั้น 1 และไม่มี “สมศรี ใจดี” |
| เจ้าหน้าที่ที่ยังไม่ถูกใส่โซน | ขึ้น “ตอนนี้นอกเวลาตรวจ / วันนี้ไม่มีรอบตรวจแล้ว” ทั้งที่ยังไม่มีโซน | การ์ดใหม่ “ยังไม่ได้อยู่ในโซน — หัวหน้าต้องใส่คุณเข้าโซนก่อน” | `pages/officer/officer-home.ts` | เข้าด้วยเจ้าหน้าที่ใหม่อีกครั้ง (0893330001) — ข้อความใหม่ขึ้นถูก |
| D09 ผู้ใช้ บนมือถือ 375px | ปุ่ม “ค้น” กว้าง 100% ทับช่องค้นหา (global `.btn` เต็มความกว้าง) จนช่องกรอกเหลือ 4px | `.lookup .btn { inline-size: auto }` | `pages/admin/admin-people.ts` | วัด DOM: ช่องค้น 253px / ปุ่ม 52px · `scrollWidth=375` · ภาพหน้าจอ |
| อังกฤษ “just now ago” ที่ H03 | ค่า “เมื่อสักครู่” ถูกต่อด้วย label “ago” | ซ่อน label “ที่แล้ว/ago” เมื่อเวลาน้อยกว่า 1 นาที | `pages/owner-home.ts` | ตั้งอังกฤษ + ยิง `box-sim report` แล้วโหลดหน้า: “just now” ไม่มี “ago” |
| โหมดง่ายซ่อนตัวเลือกภาษา | `/settings/display` ในโหมดง่ายเห็นแค่ 3 โหมด — คนที่อ่านไทยไม่ได้เปลี่ยนภาษาไม่ได้ | แยกการ์ดภาษาให้เห็นทุกโหมด · โหมดง่ายซ่อนเฉพาะขนาดตัวอักษร/ธีม | `pages/owner/owner-settings.ts` | โหมดง่าย: ปุ่ม `English` มองเห็นและกดได้ |
| การ์ดคำขอเข้าของโซน (H13) | ขึ้น “ตู้ ตู้บ้านทดสอบ” ซ้ำเมื่อชื่อตู้เริ่มด้วย “ตู้” | เอา prefix “ตู้/กล่อง” ออก ใช้ชื่อตู้ที่ผู้ใช้ตั้ง | `pages/owner/owner-settings.ts` | build/lint (การ์ดคำขอถูกกดยอมรับไปแล้ว จึงยืนยันซ้ำในเบราว์เซอร์ไม่ได้) |

ตรวจหลังแก้: `node scripts/project-guardian.mjs --full` ผ่านทุกช่อง (build/lint/unit ทั้ง frontend/backend) · frontend unit **83/83** (19 ไฟล์) · ไม่ commit/deploy

**เห็นแล้วยังไม่ได้แก้:**
- FAB เปลี่ยนธีมมุมล่างขวาทับปุ่ม “จัดการ” ของแถวสุดท้ายใน D01/D04 ที่ 375px (เลื่อนหน้าแล้วพ้น) — ยังไม่เพิ่ม padding กัน FAB เพราะกระทบทุกหน้า
- D05 ขึ้น BX-00001 “QR เสีย · มีการพิมพ์รหัสใต้ QR บ่อย” เพราะการทดสอบพิมพ์รหัสหลายครั้ง — ยังไม่สร้างเคส/ออก QR ใหม่ (จะแจ้งเจ้าของ + เปลี่ยน QR จริง)
- D04 แท็บเป็นแถบเลื่อนแนวนอน (ตั้งใจ) — audit ที่มองเฉพาะพิกัดจึงเตือน overflow ทั้งที่ `scrollWidth` ของหน้า = 375
- L04 บน 1440 มีพื้นที่ว่างมาก (คอลัมน์กลาง 1000px + แถบล่างสไตล์มือถือ) — เป็นดีไซน์เดิม ยังไม่ปรับเป็นเลย์เอาต์เดสก์ท็อปเต็ม

**ยังไม่ได้ตรวจ:**
- เคส QR: สร้าง/เลือกวิธีแก้/ออกใบใหม่/ปิดเคส (D05→D08) · หน่วยงานถูกปฏิเสธ (D02/L02-b) · คำขอช่าง (D15/T01/T02) · อัปโหลดเฟิร์มแวร์/OTA (D17) · แพ็กเกจ (D14) · ตั้งค่าการแจ้งเตือน
- ไรเดอร์และ SOS end-to-end รอบนี้ (ผ่านรอบก่อน แต่ยังไม่ได้เดินซ้ำหลังแก้ CSS ร่วม) · Snapface/สิทธิ์ดูรูป · เปลี่ยน Wi-Fi/แจ้งช่างของเจ้าของบ้าน
- Web Push มือถือจริง/VAPID · ติดตั้ง PWA · Safari/iPhone · service worker offline
- ภาพหน้าจอ 768/1024 ของทุกหน้า (รอบนี้วัด overflow ด้วยสคริปต์ + ภาพ 1440 เฉพาะหน้าหลัก) · refresh กลางทาง/ปุ่มย้อนกลับ/เน็ตหลุด
- backend e2e 98 เคส และ browser E2E (ยังไม่มี Playwright ในโปรเจกต์)

**ข้อมูลที่การทดสอบทิ้งไว้ใน mock (ไม่ได้ลบ):**
- โปรเซสบัจจุบัน: backend mock **3111** (`SMMB_MOCK_DATA_DIR=.mockdb-verify`), frontend **4201**, `box-sim` ของ BX-00001 ถือ long-poll อยู่
- บัญชีใหม่: `0892220001` เจ้าของบ้าน “ทดสอบ เจ้าของใหม่” (U-0005) · `0893330001` เจ้าหน้าที่ “ทดสอบ เจ้าหน้าที่ใหม่” (U-0006, อนุมัติแล้ว ยังไม่อยู่โซน) · `0894440001` หัวหน้า “ทดสอบ หัวหน้าใหม่” (U-0007, หน่วยงาน “หน่วยงานทดสอบใหม่” อนุมัติแล้ว รหัสกลุ่ม `MKQT-XHAS`)
- ตู้: BX-00002 ผูกกับ U-0005 ชื่อ “ตู้บ้านทดสอบ” บ้าน 123/45 และเข้าโซน “สาย 1 (ทั้งวัน)” หลังเจ้าของกดยอมรับ · BX-00003 ลงทะเบียนใหม่ยังไม่ผูก (มี device secret + QR 3 ใบ) · BX-00001 ยังผูกเดิม แต่ QR health ถูกติดธง “เสีย”
- โซน “สาย 1 (ทั้งวัน)” ตั้งพื้นที่เป็น กรุงเทพมหานคร / เขตทดสอบ · มีบ้าน 2 หลัง (99/9, 123/45) · เจ้าหน้าที่ 2 คน
- งาน/หลักฐาน: ตรวจผ่าน 16:32 (`J-bcb0ff` + Snapface 1×1 จากตู้จำลอง) · ทดสอบปลุกตู้ผ่าน `J-5a8384` (wake 1.4 วิ) · งาน `J-78f980` ค้าง ready แล้วหมดอายุ · scan log 16:29/16:30/16:32 · แจ้งเตือนใน mock เพิ่มจากการอนุมัติ/คำขอโซน/ผลตรวจ
- `.mockdb` เดิม (รวมบัญชี `0899990001` ถ้ามี) ไม่ถูกแตะ — ถ้าต้องการใช้ต่อแล้วเปิดไม่ขึ้น ให้แจ้งก่อนลบ/กู้

### รอบ 5 — ตรวจทานการแก้รอบ 4 + ตรวจ CSS ร่วม (12 พ.ย. 2026 เช้า · ยังไม่ commit)

> สภาพแวดล้อม: backend mock พอร์ต **3111** (`SMMB_MOCK_DATA_DIR=.mockdb-verify`) · frontend dev **4201** proxy `/api` + `/v1` → 3111 · `GET http://localhost:4201/api/health/live` = `{"ok":true}` · ใช้ Playwright (Edge) viewport 375×812 เป็นหลัก + 768×1024
> **หมายเหตุ:** การแก้ "รอบ 4" ถูก commit ไว้แล้วใน `7dcbf37` (working tree สะอาดตอนเริ่ม) จึงตรวจด้วย `git diff f42da37` ตามคำสั่ง · ไฟล์ที่แก้ในรอบ 5 นี้ยังไม่ commit
> ระหว่างตรวจมีงานอื่น (a11y รอบ 8) แก้ไฟล์ใน working tree พร้อมกัน (focus-visible, พื้นที่แตะ 44px, Leaflet contrast, `core/time.ts`) — รายงานนี้ไม่นับรวมและไม่ได้แตะไฟล์เหล่านั้น

**สรุปรายข้อของรอบ 4**

| ข้อ | ผล | ยืนยันด้วย |
|---|---|---|
| ปุ่มหลักกดครั้งแรกไม่ติด (A04, A06, A10, A14, O02-b, R01) | ✅ ผ่าน | Playwright ตรวจจับ pointerdown/pointerup/click = `BUTTON` ทุกครั้ง · A04 ไป `/home` · A06/A10 ขึ้น “เบอร์นี้มีบัญชีแล้ว” (submit ทำงาน) · A14 ขึ้นรหัสปัจจุบันไม่ถูกต้อง · O02-b ขึ้นรหัสไม่ถูกต้อง · R01 ไป `/r/invalid` — **เห็นในเบราว์เซอร์** |
| A10/A15/A16/L01 เตือนข้อตกลงก่อนกด | ✅ ผ่าน | ก่อนกด: ไม่มีข้อความ + ปุ่ม enabled · หลังกด: ขึ้น “ต้องยอมรับข้อตกลง…” ทั้ง 4 ฟอร์ม · อังกฤษขึ้น “You must accept the terms before an account can be created” (A10/A16) — **เห็นในเบราว์เซอร์** |
| D04 ตู้ยังไม่เคยติดต่อ | ✅ ผ่าน | BX-00002/BX-00003 ขึ้น “ยังไม่มีข้อมูล” ทั้งแบต/เฟิร์มแวร์ ไม่มี “ไม่ได้ชาร์จ/กดเพื่ออัปเดต” · BX-00001 ยังแสดงค่าจริง · อังกฤษ “No data yet” · 375/768 — **เห็นในเบราว์เซอร์** |
| `/settings/display` ไม่มี `<main>` | ✅ ผ่าน | หน้า shared: `role="main"` + `id="main-content"`, `main=false` · easy mode ยังเห็นการ์ดภาษา — **เห็นในเบราว์เซอร์** |
| A06 `?state=no-terms` เติมข้อมูลตัวอย่าง | ✅ ผ่าน | เปิดลิงก์แล้วอยู่ขั้น 1 · ชื่อว่าง · ไม่มี “สมศรี ใจดี”/เบอร์ตัวอย่าง — **เห็นในเบราว์เซอร์** |
| เจ้าหน้าที่ที่ยังไม่ถูกใส่โซน | ✅ ผ่าน | สร้าง/อนุมัติ U-0039 (`0896660001`) แล้วเข้า `/officer` — ขึ้น “ยังไม่ได้อยู่ในโซน” + “SOS ยังรับได้ตลอด 24 ชม.” · อังกฤษ “You’re not in a zone yet” · easy/advanced ไม่ล้น — **เห็นในเบราว์เซอร์** |
| D09 ปุ่มค้นทับช่องค้นหา 375px | ✅ ผ่าน | วัด DOM: ช่องค้น 200.5px / ปุ่ม 52.5px · `scrollWidth=375=innerWidth` — **เห็นในเบราว์เซอร์** |
| อังกฤษ “just now ago” ที่ H03 | ✅ ผ่าน | ยิง `box-sim report` BX-00001 แล้วเปิด `/home` ภาษาอังกฤษ: Last contact = “just now” ไม่มี “ago” — **เห็นในเบราว์เซอร์** |
| โหมดง่ายซ่อนตัวเลือกภาษา | ✅ ผ่าน | `/settings/display` easy + อังกฤษ: การ์ด Language เห็นและกดได้ · ซ่อนเฉพาะขนาดตัวอักษร/ธีม — **เห็นในเบราว์เซอร์** |
| การ์ดคำขอเข้าโซน H13 ซ้ำ “ตู้ ตู้” | ✅ ผ่าน | หัวหน้าส่งคำขอบ้าน 555/5 (BX-00003) เข้าโซน “สาย 1” → เจ้าของ U-0038 เห็นการ์ดก่อนกดยอมรับ: “ตู้บ้านใหม่ 555 · บ้านเลขที่ 555/5” ไม่มี “ตู้ ตู้” · อังกฤษ/easy ครบ — **เห็นในเบราว์เซอร์** |

**แก้เพิ่มในรอบ 5 (ปัญหาที่ตรวจเจอจากการแก้รอบ 4)**

| อาการเดิม | สิ่งที่เปลี่ยน | ไฟล์ | ยืนยันด้วย |
|---|---|---|---|
| 🔴 `body { padding-block-end: 120px }` บนจอ ≤1023px ทำให้ทุกหน้าเลื่อนเกินท้ายจริง 120px แม้ไม่มีฟอร์ม (เช่น `/auth/signin`, `/error/offline`, `/officer`, `/r` มี `scrollHeight` 932 แต่viewport 812) และเกิดแถบว่างหลังแถบแท็บ/ท้ายหน้า | เอา padding ออกจาก `body` · เว้นที่ถาวรเฉพาะ `<main>` ที่มี `<form>` (`main:has(form)`, 120px + safe-area, `!important`) — ยังไม่ผูกกับ `:focus` จึงไม่มี layout shift ตอนแตะปุ่ม | `frontend/src/styles.scss` | 375/768: `/auth/signin`, `/error/offline`, `/officer`, `/r`, `/r/deliver`, `/officer/check/*` กลับมา `scroll=0` · หน้าไม่มีฟอร์ม (`/home`, `/admin`, `/home/settings`) ไม่มีที่ว่างหลังแท็บ · หน้าไม่มี nested scroller · **เห็นในเบราว์เซอร์** |
| 🟠 ปุ่มเปลี่ยนธีมของแอดมิน (fixed bottom-right) ทับบรรทัดสุดท้ายของ D01/D04 และ T02 (`/admin/tech/wifi`) ที่ 375/768 | เว้นท้าย `main` ของแอดมินเป็น 140px + safe-area บนจอ ≤1023 (ชนะกฎกลางของหน้าฟอร์มด้วย `!important`) | `frontend/src/app/layout/area-shell.ts` | วัดที่ 375: D01 เนื้อหาสุดท้าย bottom 610 / FAB top 682 · D04 672/682 · T02 672/682 · 768: D01 823/894 · D04 884/894 · T02 884/894 — ไม่ทับ — **เห็นในเบราว์เซอร์** |

ตรวจหลังแก้: `npm --prefix frontend run lint` ผ่าน · `npx ng test --watch=false` ผ่าน **83/83** · `npx ng build` ผ่าน (เวลา 09:42 น. — งาน a11y รอบ 8 ยังแก้ไฟล์ต่อหลังเวลานี้ ต้องรันซ้ำก่อน commit)

**เห็นแล้วยังไม่ได้แก้:**
- `/settings/notifications` ยังไม่มี landmark `<main>` (`main=false`, `roleMain=false`) — เป็นของเดิม ไม่ได้เกิดจากรอบ 4 · ข้อเสนอ: เพิ่ม `role="main"` + `id="main-content"` แบบเดียวกับ `/settings/display`
- หน้าที่มีช่องกรอกนอก `<form>` (แก้ชื่อตู้/ที่อยู่ใน H13, หมายเหตุ O11) ไม่ได้เผื่อที่คีย์บอร์ดถาวรแล้ว เพราะเลี่ยงแถบว่างบนหน้าที่ไม่มีฟอร์ม · ยังไม่ได้ทดสอบคีย์บอร์ดจริงบนมือถือ
- Toast เป็นของชั่วคราว (fixed 176px จากล่าง) จึงยังทับเนื้อหาระหว่างแสดง — ไม่ได้วัดการทับบรรทัดสุดท้าย
- การ์ดคำขอ H13 ของ U-0038 ยังค้างรอเจ้าของกดยอมรับ (ดูหัวข้อข้อมูลที่ทิ้งไว้)

**ยังไม่ได้ตรวจ:**
- พฤติกรรมคีย์บอร์ดจริงบน iOS/Android (headless ไม่มีคีย์บอร์ดจริง) · Web Push/VAPID · ติดตั้ง PWA · Safari/iPhone · service worker offline
- 1024/1440 ของรอบนี้ (ตรวจ 375/768 ตามคำสั่ง) · D05–D08 เคส QR · D15/T01/T02 คำขอช่าง · D17 อัปโหลดเฟิร์มแวร์/OTA · D14 แพ็กเกจ
- backend e2e 98 เคส และ browser E2E (ยังไม่มี Playwright ในโปรเจกต์)

**ข้อมูลที่การทดสอบรอบ 5 ทิ้งไว้ใน mock (ไม่ได้ลบ):**
- บัญชีใหม่: `0895550001` เจ้าของบ้าน “ทดสอบ บ้านใหม่ห้า” (U-0038, รหัส `demo1234`) · `0896660001` เจ้าหน้าที่ “ทดสอบ เจ้าหน้าที่นอกโซน” (U-0039, รหัส `demo1234`, อนุมัติแล้ว ยังไม่อยู่โซน)
- ตู้: BX-00003 ผูกกับ U-0038 แล้ว ชื่อ “ตู้บ้านใหม่ 555” บ้าน 555/5 · activation QR ถูกใช้แล้ว (front QR ยัง active) · BX-00001 รายงานล่าสุด 09:26 (แบต 87%, charging=false) จากการยิง `box-sim report`
- โซน “สาย 1 (ทั้งวัน)” (`f667e261-…`) มีคำขอเพิ่มบ้าน 555/5 ค้าง “รอเจ้าของบ้านยืนยัน” — การ์ดใน H13 ของ U-0038 ยังไม่กดยอมรับ
- ไรเดอร์: ใช้รหัส `MTTV-WMRC` ของ BX-00002 ส่งของสำเร็จ ~09:19 (มี delivery ticket + แจ้งเตือนเจ้าของ)
- SOS: เจ้าของ 0812345678 เปิดเรื่อง ~09:20 → เจ้าหน้าที่ 0834567890 รับและปิดเรื่อง (หมายเหตุ “ไม่มีเหตุร้าย ปลอดภัย”) — เจ้าของเห็นชื่อ+เบอร์ระหว่างเปิด และเห็นหน้าปิดเรื่องแล้ว
- scan log: มีการพิมพ์รหัสผิด `ZZZZ-ZZZZ` (O02-b, R01) และ QR ปลอม `/b/XXXX` · มี `data_access_log_tb` จากการเปิด device secret ของ BX-00002/BX-00003
- prefs ของ owner/officer/head/admin/U-0038/U-0039 ถูกตั้งกลับเป็นค่าเริ่มต้น (ไทย · system · default) แล้ว

### รอบ 8 — ความเรียบร้อยของหน้าจอ · การเข้าถึง · ความสม่ำเสมอของข้อความ (12 พ.ย. 2026 · ยังไม่ commit)

> สภาพแวดล้อม: backend mock 3111 (`.mockdb-verify`) + frontend dev 4201 (ยืนยัน `GET /api/health/live` ผ่าน 4201 = `{"ok":true}`) · **ไม่มี Playwright ในเครื่อง** จึงใช้ browser pane ในแอป (375×812 / 768×1024 / 1024×768 / 1440×900) + สคริปต์ตรวจใน DOM (ป้ายของ input, ชื่อปุ่ม, ต่างสี WCAG จากสีที่คำนวณจริง, ขนาดพื้นที่แตะ, overflow) · ภาพหน้าจอจาก pane ถ่ายได้ไม่สม่ำเสมอ (timeout) จึงถ่ายได้เฉพาะบางหน้า (owner 1440) ที่เหลือวัดเป็นตัวเลข · ทุกบัญชีเดโมที่เปลี่ยน prefs (owner/officer/head → easy + ใหญ่มาก) ตั้งกลับเป็นค่าเดิมแล้วและตรวจจาก response ว่าตรง

**แก้แล้ว**

| อาการเดิม | สิ่งที่เปลี่ยน | ไฟล์ | ยืนยันด้วย |
|---|---|---|---|
| ปุ่มกรอง/ตัวเลือกกลุ่ม (`.segmented`, chips) สูง 34–38px บนมือถือ (ช่วงวันที่ H12, ภาษา/ขนาดตัวอักษร/ธีม, แจ้งเตือน) · ปุ่ม "อ่านทั้งหมด" 39px · ลิงก์ "ดูทั้งหมด/ดูสาเหตุ…" 32px · `.btn` ที่ตั้ง 40px (สร้างโซน, แผนที่) · ลิงก์ "กลับ" ของ O02 36px | พื้นที่แตะ ≥ 44px บนจอ ≤1023px / pointer coarse (กฎกลางที่ `styles.scss`) · `.see-all/.tap` 44px · `min-block-size: 40px` ในคอมโพเนนต์ → 44px · `.link` (ลิงก์ในประโยค/ปุ่มแก้ไข) ขยายพื้นที่แตะด้วย `::after` โดยข้อความไม่ขยับ | `styles.scss`, `owner-home.scss`, `shared/notification-list.ts`, `officer-check.ts` + ไฟล์ที่ปรับ 40→44 อีก ~12 ไฟล์ | **เห็นในเบราว์เซอร์** 375px: owner/officer/head/admin ทุกหน้าหลัก ไม่เหลือปุ่ม/ลิงก์ <44px (ยกเว้น Leaflet attribution และ `.link` ที่ใช้ `::after` ซึ่งสคริปต์วัดไม่เห็น) |
| กรอบโฟกัสคีย์บอร์ดเป็นเส้นบาง 0.8px สีเทาอ่อน (238) ธีมมืดแทบมองไม่เห็น | กฎกลาง `:focus-visible` เส้น 3px สี `--brand-text` เว้น 2px (ทั้งสองธีม) | `styles.scss` | **เห็นในเบราว์เซอร์**: Tab บน L04 → outline `solid 2.4px rgb(232,160,165)` + ภาพหน้าจอธีมมืด |
| ปุ่มซูมของแผนที่ Leaflet ธีมมืด สีตัวอักษรชมพู-บนพื้นขาว ต่าง 2.1:1 · ลิงก์เครดิต 1.64:1 · ปุ่มซูม 40px | ปุ่มซูมพื้นขาว/ตัวอักษร `#333` 44px · ลิงก์เครดิตสีน้ำเงินเข้ม+ขีดเส้นใต้ | `styles.scss` | **เห็นในเบราว์เซอร์**: `/home/agencies`, `/agency/profile` ไม่มีรายการต่ำกว่า 4.5:1 อีก (ธีมสว่าง) · ธีมมืดวัดซ้ำที่หน้าหัวหน้าหลัก 6 หน้า |
| กล่องยืนยันส่ง SOS (โหมดง่าย, `O/H03`) ไม่ปิดด้วย Esc และ Tab หลุดออกนอกกล่อง | `(keydown.escape)` = ยกเลิก + กัก Tab/Shift+Tab ไว้ในกล่อง | `pages/owner-home.ts` | **แค่ build/lint** — ยังไม่ได้เปิดกล่องแล้วกด Esc ในเบราว์เซอร์ (`ConfirmDialog` กลางมี Esc+trap อยู่แล้ว) |
| เวลาแบบมีวินาที (โหมดละเอียด) แสดงเวลาล้วน เช่น "14:07:52" ทั้งที่เป็นเมื่อวาน/วันก่อน: ติดต่อล่าสุด/รายงานแบต/สั่ง Wi-Fi (H13) · ประวัติ H12 · SOS (H09/H11) | ตัวช่วย `bkkClock()` — วันนี้ = เวลา · วันอื่น = `11/11 14:07:52` เป็นเวลาไทย | **ใหม่** `core/time.ts` · `owner-settings.ts` · `owner-history.ts` · `owner-sos.ts` | `tsc` + build · **ยังไม่ได้ดูหน้าจริงที่มีข้อมูลเก่า** |
| `admin-home` เวลา "ข้อมูล ณ" ไม่ระบุ `timeZone` (เครื่องที่ไม่ใช่เวลาไทยแสดงผิด) | ใส่ `timeZone: 'Asia/Bangkok'` | `pages/admin-home.ts` | build |
| อังกฤษ "1 requests waiting" (แอดมิน: คำขอช่าง) | เอกพจน์/พหูพจน์ | `pages/admin-home.ts` | build |

ตรวจหลังแก้: `npm --prefix frontend run lint` ผ่าน (exit 0) · `ng test` **83/83** (19 ไฟล์) · `ng build` ผ่าน · ไม่ commit/push/deploy · ไม่แตะ backend/migration/firmware

**ส่วน ก — จอ 768 / 1024 / 1440 (ตัวเลขจริงที่วัดได้)**

| บทบาท/หน้า | 768 | 1024 | 1440 |
|---|---|---|---|
| หัวหน้า (L04, โซน, สมาชิก, ประวัติ, ตั้งค่า) | เต็มจอ ไม่ overflow | คอลัมน์ 1000px เต็มจอ ไม่ overflow | คอลัมน์ 1000px กลางจอ เว้นซ้ายขวา ~220px · **แถบแท็บล่างสไตล์มือถือกว้าง 1000px** · ย่อหน้ายาว ~900–940px (≈100+ ตัวอักษร/บรรทัด อ่านยาก) |
| เจ้าของบ้าน/เจ้าหน้าที่ | — (ใช้โทเคนมือถือ) | — | คอลัมน์ 820px กลางจอ · แถบแท็บล่างสไตล์มือถือ 820px · ภาพหน้าจอ H14 ยืนยัน: การ์ดแคบ เว้นว่างสองข้างมาก แต่อ่านง่าย (ย่อหน้า ≤730px) |
| แอดมิน | sidebar ตั้งแต่ 1024 ตามดีไซน์ | เหมือนกัน | ไม่ได้วัดรอบนี้ (วัด overflow รอบ 4 แล้ว) |

- ไม่พบข้อความล้น/ปุ่มทับกัน/ระยะห่างผิดชัดเจนจากการวัด overflow + ตรวจนอกขอบจอ (ต้องแก้ทันทีมี 0 รายการ) — **ตารางที่เป็นการ์ด**: L08 ประวัติการสแกน (`/agency/history`) เป็นแถวการ์ดกว้าง ~940px บน 1024–1440 ถ้าจะให้สแกนข้อมูลเร็วบนคอม ควรเป็นตาราง (ดูข้อเสนอ)

**ข้อเสนอ L04 บน 1440 (ยังไม่ลงมือ — หยุดรอตัดสินใจ)**

| | ทาง 1: ขยายคอลัมน์ + เปลี่ยนแถบล่างเป็นแถบข้างเฉพาะ ≥1280 | ทาง 2: คงคอลัมน์กลาง แต่จัดเนื้อหาเป็น 2 คอลัมน์ ≥1280 |
|---|---|---|
| หน้าตา | sidebar ซ้าย (เหมือนแอดมิน) + เนื้อหาเต็ม ~1100px · การ์ด/ตารางกว้างขึ้น | คงแถบล่าง 1000px · ภาพรวม: ตัวเลข+โซนวันนี้ซ้าย · SOS/แจ้งเตือนขวา · L08 เป็นตาราง |
| ไฟล์ที่ต้องแตะ | `layout/area-shell.ts` (แถบข้างสำหรับ head), `styles.scss` (ความกว้างบทบาท), `head-home.ts`, `head-log.ts`, `head-zones.ts`, `head-members.ts` | `head-home.ts`, `head-log.ts` (ตาราง), `styles.scss` (grid ≥1280) |
| ความเสี่ยงต่อมือถือ | กลาง: แก้ `area-shell` ที่ owner/officer/admin ใช้ร่วม ต้องเช็กทุกบทบาท 375/768 | ต่ำ: ใช้ media query `min-width:1280px` เท่านั้น ไม่กระทบมือถือ |
| เหมาะเมื่อ | หัวหน้าใช้คอมเป็นหลัก | หัวหน้าใช้มือถือเป็นหลัก คอมเป็นรอง |

แนะนำทาง 2 ก่อน (ความเสี่ยงต่ำ ได้ผลกับ L04+L08 ทันที) — ทั้งสองทางเป็นการเปลี่ยนเลย์เอาต์ จึงไม่ทำจนกว่าจะสั่ง

**ทำตามทาง 2 แล้ว (ผู้ใช้เลือก 12 พ.ย. 2026):** ตั้งแต่ 1280px — L04 แบ่ง 2 คอลัมน์ (ซ้าย ตัวเลข/ตัวกรอง/ปุ่ม · ขวา โซนวันนี้/บันทึกล่าสุด) · ความกว้างเนื้อหาหัวหน้า 1000→1200px · L08 รายการเรียง 2 คอลัมน์ (ยังเป็นแถวการ์ด ไม่ได้เปลี่ยนเป็นตารางเต็มรูปแบบ) · ต่ำกว่า 1280px ไม่เปลี่ยน (`display: contents`) · แก้ `head-home.ts`, `head-log.ts`, `styles.scss` — ยืนยันในเบราว์เซอร์: 1440 คอลัมน์กว้าง 508/610px ไม่ overflow, L08 2×563px · 375 แถวเรียงลำดับเดิม ไม่ overflow · lint/ng test/ng build ผ่าน · ยังไม่ได้ดู 1280–1439 และธีมมืดของหน้านี้

**ส่วน ข — การเข้าถึง (ผลตรวจ)**

- ป้ายของ input: ไม่พบ input ที่ไม่มีป้าย ในหน้าหลักของ 4 บทบาท + A04/A05/A06/A10/L01/A07/A13 (สคริปต์วัดจาก `<label>`/aria)
- ปุ่มไอคอนล้วน/ลิงก์การ์ด: ไม่พบรายการที่ไม่มีชื่อที่อ่านได้ (ผลที่สคริปต์รายงาน 2–3 รายการเป็นปุ่มที่ซ่อนอยู่ ไม่ใช่ปัญหาจริง)
- ต่างสีตัวอักษร ≥4.5:1: ผ่านที่ธีมสว่าง (admin/owner/officer/head/auth) และธีมมืด (หัวหน้า 6 หน้า) ยกเว้น Leaflet (แก้แล้ว) · สคริปต์ตรวจสีที่คำนวณจริง ผสม alpha กับพื้นหลังจริง และทดสอบกับตัวอย่างสีต่ำ (ได้ 1.92:1 ถูกต้อง)
- "ใหญ่มาก" + โหมดง่าย ที่ 375px: owner (5 หน้า) · officer (6 หน้า) · head (6 หน้า) — ไม่มี overflow แนวนอน ไม่มี element ตกขอบ ไม่มีปุ่ม <44px ไม่มีสีต่ำกว่าเกณฑ์
- คีย์บอร์ด: Tab ถึงปุ่มตามลำดับบนหน้าหัวหน้า เห็นกรอบโฟกัสชัดหลังแก้ · `ConfirmDialog` มี Esc + trap · กล่องยืนยัน SOS แก้แล้ว (ดูตาราง)

**ส่วน ค — ความสม่ำเสมอของข้อความ**

- คำเรียก: ค้นทั้ง `frontend/src` แล้ว **"QR หน้าตู้ / QR สำรอง"** (ฝั่งเจ้าหน้าที่/เจ้าของบ้าน/หัวหน้า) ใช้ตรงกัน · "QR ประจำตัว" ใช้สม่ำเสมอ · ข้อความที่พูดถึงตู้ใช้ "เสียงปี๊บ/Buzzer" (T02-b, D04); **ไม่พบ "LED/ไฟสถานะ" เป็นฟีเจอร์ของตู้** — เหลือ "ไฟ" ที่ถูกต้องตามความหมาย: ไฟฉายกล้อง, ไฟส่องกล้อง/แฟลช, ไฟตู้ = กระแสไฟ, ไฟหน้าบ้าน · ไม่พบ "QR เปิดใช้ตู้" เป็นข้อความ UI ที่ใช้ผิด (หน้า A07 เรียก "รหัสเปิดใช้ตู้") · "ประวัติ" ใช้คู่ "ประวัติการสแกน/ประวัติการตรวจ" — สองคำนี้ปนกันระหว่าง L08 ("ประวัติการสแกน") กับ title ฟังก์ชันที่คอมเมนต์เขียน "ประวัติการตรวจ" แต่ไม่ใช่ข้อความที่ผู้ใช้เห็น (ไม่แก้)
- เวลาไทย: `toLocale*`/`Intl` ทุกจุดระบุ `Asia/Bangkok` แล้ว ยกเว้น `admin-home.ts` (แก้แล้ว) · ไม่มี `DatePipe` ใน `src`
- เวลาที่ไม่ใช่วันนี้ต้องมีวันที่: แก้ `bkkClock` (ข้างบน) · ที่เหลือแสดงเวลาล้วนแต่เป็นของ "วันนี้" ตามความหมาย (R04 ไรเดอร์ส่งสำเร็จ, QR ประจำตัวหมดอายุภายใน 15 วิ)
- อังกฤษ: สคริปต์ตรวจทุกค่า `en:` ใน `src` — ไม่มีอักษรไทยค้าง ไม่มีคำซ้ำติดกัน/ช่องว่างซ้อน · ตรวจ template ที่ต่อค่าตัวเลข: พบ "1 requests" 1 จุด (แก้แล้ว) · "just now ago" ที่รอบ 4 แก้ไว้ยังถูก

**เห็นแล้วยังไม่ได้แก้**

- `core/push-notifications.ts` บรรทัดสถานะ "ส่งสำเร็จล่าสุด …" / "ยังไม่เคยส่งสำเร็จ" / คำแนะนำ "ถ้าไม่เห็นเด้ง…" เป็นข้อความไทยล้วน (ค่า `detail` เป็น string ไม่ใช่ `{th,en}`) — โผล่เฉพาะแผงวินิจฉัยโหมดละเอียด · แก้ต้องเปลี่ยนชนิดของ `detail` กระทบ `push-status.ts` จึงไม่ทำในรอบ "เก็บความเรียบร้อย"
- `shared/push-status.ts`, `shared/notification-list.ts` `exact()` ใช้รูปแบบ `en-GB` (dd/mm/yyyy) แม้ภาษาไทย — มีวันที่ครบ เวลาไทย แต่รูปแบบไม่ตามภาษา
- ลิงก์เครดิต Leaflet (`© OpenStreetMap`) เล็กกว่า 44px — เป็นข้อกำหนดการแสดงที่มา ไม่ขยาย
- `textarea:focus`/`input:focus` ใน `officer-check.ts`, `officer-sos.ts` ใช้เส้นขอบเปลี่ยนสีแทน (ไม่ใช่กรอบ 3px) — เห็นได้แต่บางกว่ากรอบกลาง
- แถบแท็บล่างสไตล์มือถือบนคอม (owner/officer/head) และ L08 เป็นการ์ดบนจอกว้าง — รอตัดสินใจตามข้อเสนอข้างบน
- ปุ่มปิดบัญชี/ปุ่มบนแอดมินที่ 375px: "จัดการ" ในตารางภาพรวมแอดมิน 38×21 / 66×34 ก่อนแก้ (ยังไม่ได้วัดซ้ำหลังเปลี่ยน `.btn`/40→44)

**ยังไม่ได้ตรวจ**

- กล่องยืนยัน SOS (Esc/Tab trap) ในเบราว์เซอร์ · เส้นทางคีย์บอร์ดเต็ม ๆ ของฟอร์มสมัคร/SOS (ตรวจเฉพาะโฟกัสบนหน้าหัวหน้า) · screen reader จริง (VoiceOver/TalkBack/NVDA)
- ภาพหน้าจอ 768/1024 ครบทุกบทบาททุกหน้า (วัดตัวเลขเฉพาะหัวหน้า + owner 1440) · แอดมิน 768/1440 รอบนี้
- ธีมมืดของ owner/officer/admin/auth (ตรวจเฉพาะหัวหน้า) · อังกฤษแบบอ่านครบทุกหน้า (ตรวจด้วยสคริปต์ + ค้นรูปประโยค ไม่ได้เปิดอ่านทีละหน้า)
- iPhone/Safari จริง (`pointer: coarse` + PWA)

**ข้อมูลที่การทดสอบทิ้งไว้ใน mock**

- ไม่สร้างบัญชี/ตู้/เคส/งานใหม่ในรอบนี้ · ใช้บัญชีเดโมอ่านอย่างเดียว + เปลี่ยน prefs ชั่วคราวแล้วคืนค่าเดิม (`theme:system, lang:th, text_size:normal, easy_mode:false, ui_mode:default, simple_home:false`) ของ owner `0812345678`, officer `0834567890`, head `0823456789` · แอดมิน `0800000001` ไม่ได้แก้ prefs
- session ของ browser pane ออกจากระบบ/เข้าใหม่หลายครั้ง สุดท้ายล็อกอินเป็นแอดมินอยู่ · `localStorage` ของ pane มีคีย์ตรวจชั่วคราว (`__a`, `__lay`, `__orig`, `__prefs0`, `__restore`) — ลบได้ ไม่กระทบแอป
- backend 3111 / frontend 4201 ยังรันอยู่ · `.mockdb-verify` ไม่ถูกแตะ

### รอบ 6 — เดินงานแอดมินที่ยังไม่เคยตรวจ (12 พ.ย. 2026 · ยังไม่ commit)

> สภาพแวดล้อม: backend mock **3111** · frontend dev **4201** (proxy `/api` → 3111) · เดินใน browser pane viewport **375×812** ทุกเส้น แล้ว **1280×800** (วัด overflow ไม่ล้นทุกหน้าแอดมิน, FAB ซ่อนบนคอม)
> ⚠ **มีอีก 2 เซสชันรันงานโปรเจกต์นี้พร้อมกันและใช้ browser pane/แบ็กเอนด์/ไฟล์ชุดเดียวกัน** — คุกกี้ `sid` ของ `localhost` ถูกอีกเซสชันสลับบัญชีกลางทางจนหน้าเด้งไปล็อกอิน (เกิดจากวิธีทดสอบ ไม่ใช่บั๊กแอป) → รอบนี้เปลี่ยนไปเปิดผ่านโฮสต์ย่อย `r6.localhost` / `r6b.localhost` / `r6c.localhost` / `r6d.localhost:4201` (คนละคุกกี้) แยกบัญชีแอดมิน/หัวหน้า/เจ้าของ/เจ้าหน้าที่
> วิธีกด: ใช้ `.click()` ของ DOM + ตั้งค่าช่องแล้วยิง event `input` (ภาพหน้าจอจาก pane ช้ากว่าหน้าจริง จึงอ่านข้อความ/โครงหน้าเป็นหลัก)

**เดินจนจบแล้ว (เห็นในเบราว์เซอร์):**
- เส้น 1 เคส QR: ตู้ใหม่ BX-00035 → เจ้าหน้าที่สแกน QR ปลอม (API) → เคส "อาจปลอม" ใน D05 → เปิดเคส → กดออก QR (มีหน้ายืนยัน · ยกเลิก = ไม่มีอะไรเปลี่ยน · กด 2 ครั้งติดกัน = POST ชุดเดียว) → ออก 2 ใบ + ส่งช่าง → รีเฟรชกลางทางได้สถานะเดิม → ปิดเคส → กลับรายการ เคสหายและตัวเลขตรง · **ไม่ได้เดินวิธี "ใช้ QR สำรอง" (D07)** เพราะต้องมีตู้ที่เจ้าของผูกอยู่ (BX-00003 ถูกผูกไปแล้ว)
- เส้น 2 หน่วยงานถูกปฏิเสธ: สมัครผ่าน API 2 หน่วยงาน → ปฏิเสธใน D13 (ไม่ใส่เหตุผล / ใส่เหตุผล) → ล็อกอินเป็นหัวหน้า → L02-b ขึ้นพร้อมเหตุผล
- เส้น 3 คำขอช่าง: เจ้าของส่งคำขอ → D15 เห็น → นัด 13 พ.ย. 10:30 → เจ้าของเห็น **10:30 ตรงกัน** (โค้ดแปลง `+07:00` ชัด · เครื่องทดสอบเองก็อยู่โซนไทย จึงพิสูจน์ข้ามโซนไม่ได้) → ปิดงาน → เจ้าของเห็นผล · T01 ของ BX-00035: ก่อนตู้ติดต่อ = ขั้น 1 · หลังรัน `box-sim live` ขั้น 1–2 ขึ้นเสร็จเอง ขั้น 3 เป็นขั้นปัจจุบัน (เดินตามสถานะจริง)
- เส้น 4 D14: เปิดดูได้ · แก้แพ็กของผู้ใช้ใน D09 (วันหมดอายุ+หมายเหตุ) บันทึกแล้วรีเฟรชค่ายังอยู่ · เส้น 5 D17: ดูอย่างเดียว (ไม่อัปโหลด ไม่กดใช้รุ่น) · เส้น 6 D11 กรอง `type=data_access` + D12 กดแจ้งเตือน 5 ชนิดไปถูกหน้า · เส้น 7 D09 ค้น → เปิด → รีเซ็ตรหัสบัญชีทดสอบ `0893330001` (มี confirm) → ล็อกอินด้วยรหัสชั่วคราวถูกบังคับไป A14 `?forced=1` → เปลี่ยนแล้วกลับหน้าล็อกอิน → เข้าใช้งานได้

| เรื่อง | อาการเดิม | สิ่งที่เปลี่ยน | ไฟล์ | ยืนยันด้วย |
|---|---|---|---|---|
| 🟠 D06 เคส QR: ปุ่ม "ปิดเคส" / "ส่งช่าง" / "แจ้งเจ้าของบ้าน (ใช้ใบสำรอง)" ไม่มีหน้ายืนยัน | ปิดเคส = ย้อนไม่ได้, ส่งช่าง/แจ้งเจ้าของ = ส่งแจ้งเตือนออกไปแล้วเรียกคืนไม่ได้ แต่กดทีเดียวเสร็จ | `confirm.ask` ก่อนทั้งสามปุ่ม (ไทย/อังกฤษ) | `pages/admin/admin-qr.ts` | **ปิดเคส: เห็นในเบราว์เซอร์** (dialog ขึ้น · ยกเลิกแล้วอยู่หน้าเดิม · ยืนยันแล้วเคสปิด) · ส่งช่าง/แจ้งเจ้าของ: build เท่านั้น |
| 🟠 D06 โหลดเคสล้มเหลว (400/5xx) มีแต่ "กลับรายการ" ไม่มีลองใหม่ · D05 โหลดรายการล้มเหลวบอกให้ "รีเฟรชหน้า" | ผู้ใช้ติดโดยไม่มีปุ่ม | เพิ่มปุ่ม "ลองใหม่" ทั้งสองที่ | `admin-qr.ts` | D06: เห็นปุ่มด้วย `?id=not-a-uuid` (400) · D05: build เท่านั้น |
| 🟠 D15 "ปิดงานช่าง" กดทีเดียวปิดเลย (แจ้งเจ้าของ + ปิดแล้วเปิดไม่ได้) | ผมเจอเองตอนทดสอบ — คำขอแรกถูกปิดโดยไม่ถาม | `confirm.ask` ก่อนปิดงาน | `admin-technician-requests.ts` | เห็นในเบราว์เซอร์ (dialog ขึ้น · ยกเลิกไม่ปิด) |
| D15 โหลดล้มเหลวขึ้นแค่ข้อความ แล้วรายการว่างบอก "ไม่มีคำขอ" ซ้อนกัน (เหมือนไม่มีข้อมูล) | ไม่มีปุ่มลองใหม่ · ว่างไม่บอกทางไปต่อ | error เป็นการ์ดมี "ลองใหม่" และซ่อนข้อความ "ไม่มีคำขอ" ตอน error · ว่างจริงบอกว่าคำขอใหม่อยู่แท็บ "รอจัดการ" | `admin-technician-requests.ts` | ข้อความว่างเห็นในเบราว์เซอร์ · การ์ด error: build เท่านั้น |
| D15 แท็บ "นัดแล้ว" ไม่มีช่องข้อความถึงเจ้าของ (ทั้งที่ปิดงานส่ง `note` ได้) | แอดมินใส่ผลงานให้เจ้าของเห็นไม่ได้ | เพิ่มช่อง "ข้อความถึงเจ้าของ" ในแท็บนัดแล้ว | `admin-technician-requests.ts` | เห็นในเบราว์เซอร์ (ช่องขึ้น) · ยังไม่ได้ส่งข้อความจริงแล้วดูฝั่งเจ้าของ |
| H13-c "ช่างทำเสร็จแล้ว 13 พ.ย." แสดงวันนัด (อนาคต) เป็นวันเสร็จ | แอดมินปิดก่อนวันนัด → เจ้าของเห็นวันที่ยังไม่ถึง | ป้าย "นัด …" แทน (DTO ไม่มีเวลาปิดงาน) | `pages/owner/owner-settings.ts` | build เท่านั้น |
| L02-b เหตุผลว่างขึ้น "-" และไม่มีทางไปต่อเมื่อไม่ได้ตั้งช่องทางติดต่อ | "เหตุผล -" + "ยังไม่ได้ตั้งช่องทางติดต่อ" = ทางตัน | "ผู้ดูแลระบบไม่ได้ระบุเหตุผล" · ไม่มีช่องทาง = ข้อความแนะนำติดต่อทางช่องที่ได้รับตอนสมัคร + ออกจากระบบแล้วกลับมาดูได้ | `pages/head/head-setup.ts` | เห็นในเบราว์เซอร์ (ข้อความใหม่ขึ้นกับหัวหน้า R6-2) |
| D09 แพ็ก: `save()` ไม่กันเรียกซ้ำ | ยิง `.click()` 2 ครั้งติด → PUT 2 ครั้ง (ประวัติเพิ่ม 2 แถว) | `if (saving()) return` | `pages/admin/admin-plans.ts` | **พิสูจน์ได้แค่คลิกซ้อนใน JS** — ปุ่มจริง disabled ระหว่างบันทึกอยู่แล้ว จึงไม่ถือเป็นบั๊กผู้ใช้ · เป็นแค่กันไว้ |

ตรวจหลังแก้: `npm run lint` ผ่าน · `ng test` 83/83 · `ng build` ผ่าน (รันซ้ำหลังถอด FAB ซ้ำแล้ว ผ่านเหมือนเดิม)
FAB ทับปุ่มแถวสุดท้ายของแอดมิน: **รอบ 5 แก้ไว้แล้ว** (เผื่อท้าย `main` 140px) — รอบนี้วัดซ้ำที่ 375 หน้า D01 ปุ่มสุดท้าย bottom 547 / FAB top 682 ไม่ทับ · ผมเผลอเพิ่ม margin ซ้ำแล้วถอดคืนแล้ว

**เห็นแล้วยังไม่ได้แก้:**
- D05 "เคสที่ปิดแล้ว" แทบไม่เคยขึ้น: backend `/admin/qr` ไม่ส่งเคสที่ปิดแล้ว และ `AdminQrState.refresh()` ทับรายการทุก 10 วิ → เคสที่เพิ่งปิดอยู่ในส่วนนั้นได้ไม่กี่วินาที (ต้องให้ backend ส่ง `resolved` เป็นตัวเลือก — ข้อเสนอ ไม่แตะ backend)
- แจ้งเตือนแอดมิน "มีคนขอช่าง" ขึ้นรหัสดิบ `· other` (ข้อความมาจาก `backend/src/push/messages.ts`) — ข้อเสนอ: แปลงเป็น "เรื่องอื่น/ตู้ชำรุด/เปลี่ยน Wi-Fi" ที่ backend
- คำขอช่าง D15 ไม่มีลิงก์ไปหน้าตู้/เช็กลิสต์ T01 ของตู้นั้น (ต้องไปหาเองจาก D04) — ข้อเสนอเพิ่มลิงก์
- เคส "อาจปลอม" แตกเป็น 2 แถว (ใบหน้าตู้ + ใบสำรอง) ต่อการสแกนปลอม 1 ครั้ง · ตู้ที่ยังไม่ผูกบ้านแสดง "บ้าน BX-00035" ซ้ำรหัสตู้
- D09 ประวัติแพ็กแถวเก่าแสดง "12 พ.ย. – 11 พ.ย." (จบก่อนเริ่ม) และปี ค.ศ. (`showDate` ใช้ `u-ca-gregory` ตั้งใจ) ขณะที่หน้าอื่นใช้ พ.ศ. · ประวัติ D11 ซ้ำคำ "เปิดดูข้อมูล" 2 ที่ต่อแถว · ตัวกรอง D11 ไม่อัปเดต `?type=` ใน URL เมื่อกดเอง
- D14 มีแค่แพ็ก `free` (เริ่มต้น) → **ไม่มีช่องที่แก้ได้** (ปุ่มเปิด/ปิดโผล่เฉพาะแพ็กที่ไม่ใช่เริ่มต้น) · D17 ว่าง = ข้อความ "เลือกรุ่นด้านล่าง" แต่ยังไม่มีไฟล์ให้เลือก
- ปิดงานช่างไม่เห็นผลแบบ "ยังมีปัญหา" ฝั่งแอดมิน (ไม่ได้ดู)

**ยังไม่ได้ตรวจ:** เส้น D07 (ใช้ QR สำรอง) · หน้าจอ error ของ D11/D12/D09/D13/D17 ตอนโหลดล้มเหลวจริง (ไม่มีวิธีทำให้ backend ล้มโดยไม่กระทบเซสชันอื่น — ตรวจแค่ในโค้ด) · ปุ่มย้อนกลับกลางเส้นเคส QR (ลอง `history.back()` ครั้งเดียวแล้วออกนอกหน้า ไม่ได้ทดสอบเป็นระบบ) · 3 โหมด/ธีมสว่าง+มืด/ภาษาอังกฤษ ของหน้าที่แก้ (confirm ใช้คอมโพเนนต์กลางเดิม) · ส่ง CSV ของ D11 · เวลานัดข้ามเขตเวลา · 768/1024

**ข้อมูลที่การทดสอบทิ้งไว้ใน mock (ไม่ได้ลบ):**
- ตู้ใหม่ **BX-00034** (เกิดจากการกด "สร้าง" รอบแรกที่ไม่เห็นผล · ไม่ได้ใช้) และ **BX-00035** (ใช้ทดสอบ · secret ถูกเปิดดู 1 ครั้ง · `box-sim live` อาจยังถือ long-poll อยู่) · เคสปลอมของ BX-00035 ปิดแล้ว QR ถูกออกใหม่ 2 ใบ
- บัญชีใหม่: หัวหน้า `0895550006` (U-0042) และ `0895550007` (U-0043) — หน่วยงาน "หน่วยงานทดสอบปฏิเสธ R6" / "…R6-2" ถูกปฏิเสธแล้ว (รหัสผ่าน `demo1234`)
- บัญชี `0893330001` (เจ้าหน้าที่ รอบ 4) ถูกรีเซ็ตแล้วตั้งรหัสใหม่เป็น `demo1234` (เดิมไม่ทราบ)
- คำขอช่างของ BX-00001 (เจ้าของเดโม `0812345678`): #1 ปิดแล้ว (เจ้าของยังไม่กด "ใช้งานได้ปกติ/ยังมีปัญหา") · #2 สถานะ "นัดแล้ว" 14 พ.ย. 09:00 ค้างไว้ · แพ็กของผู้ใช้ `0895550001`: เพิ่มประวัติ 2 แถว (ถึง 31 ธ.ค. 2026)
- ไม่ได้แก้ prefs ของบัญชีเดโมใด ๆ · คุกกี้ของ `r6*.localhost` ค้างใน pane (ล้างได้)

### รอบ 7 — เส้นเจ้าของบ้านที่ยังไม่เคยตรวจ + รีเฟรช/ย้อนกลับ/เน็ตหลุด (12 พ.ย. 2026 · ยังไม่ commit)

> สภาพแวดล้อม: backend mock 3111 (`.mockdb-verify`) · frontend 4201 · Playwright (Edge) 375×812 · **ระหว่างรอบ backend 3111 + frontend 4201 ดับเอง** จึงเปิดใหม่ด้วยค่าเดิม (ข้อมูลอยู่ครบ แต่ `device_secret` ของ BX-00001 เปลี่ยนตอนเปิด — ดึงใหม่จาก API) · มีเซสชันอื่นใช้ backend เดียวกันพร้อมกัน (บัญชี/ตู้ใหม่โผล่เอง, prefs เจ้าหน้าที่ถูกเปลี่ยนโดยไม่ใช่ผม)

| เรื่อง | อาการเดิม | สิ่งที่เปลี่ยน | ไฟล์ | ยืนยันด้วย |
|---|---|---|---|---|
| H13-b เปลี่ยน Wi-Fi ตอนตู้ออฟไลน์ | สั่งได้เงียบ ๆ ขึ้น "รอตู้รับคำสั่ง" และโชว์ขั้น "ตู้ตัด Wi-Fi เดิมแล้ว" ทั้งที่ตู้ยังไม่รับ | การ์ดเตือน "ตอนนี้ตู้ไม่ออนไลน์ — คำสั่งยังไปไม่ถึงตู้" (รับเมื่อกลับมาออนไลน์ ≤24 ชม. · ให้ตรวจไฟ/โซลาร์/Wi-Fi เดิม) · ซ่อนขั้นตอนระหว่างรอ · สถานะ done มีคำอธิบายว่าตู้กลับมาออนไลน์เอง · หลายตู้ใส่ชื่อตู้ที่หัวหน้า | `pages/owner/owner-settings.ts` | เห็นในเบราว์เซอร์: ออฟไลน์ (สั่ง/ยกเลิก) · ออนไลน์ด้วยตู้จำลอง (รับ `wifi_reset` → done) · ข้อความพูดถึง "เสียงปี๊บ" ถูกต้อง |
| ตั้งค่าแจ้งเตือน (ผู้ดูแลระบบ) | แบนเนอร์ใช้ข้อความเจ้าของบ้าน ("เจ้าหน้าที่มาตรวจ ของมาส่ง…") | ข้อความของแอดมิน (ตู้มีปัญหา/คำขอช่าง/เคส QR) | `shared/push-status.ts` | build (ไม่ได้ดูซ้ำในเบราว์เซอร์) |
| เจ้าของหลายตู้: สลับตู้ที่หน้าหลักแล้วกดแท็บ ประวัติ/ตั้งค่า | แท็บล่างไม่พก `?box=` → กลับตู้แรกเงียบ ๆ · ย้อนกลับจากหน้าลูกของตั้งค่าก็กลับตู้แรก | service `SelectedBox` จำตู้ที่เลือก (ล้างตอนออกจากระบบ) ใช้ที่หน้าหลัก/ประวัติ/ตั้งค่า | `core/selected-box.ts` (ใหม่) · `owner-home.ts` · `owner-history.ts` · `owner-settings.ts` | เห็นในเบราว์เซอร์ (บัญชีเดโมมี 2 ตู้): หน้าหลัก→ประวัติ→ตั้งค่า→Wi-Fi/แจ้งช่าง→ย้อนกลับ ตู้ตรงตลอด |
| 🔴 H13-c แจ้งช่าง: ป้ายตัวเลือกตู้ไม่ตรงกับตู้ที่จะส่ง | URL `?box=BX-00036` แต่ `<select>` แสดงตู้แรก (ตั้ง `[value]` ก่อนมี option) → ผู้ใช้เห็นตู้ A แต่คำขอไปตู้ B | `[selected]` ต่อ option | `owner-settings.ts` | เห็นในเบราว์เซอร์ก่อน/หลังแก้ |
| 🔴 เน็ตหลุด: หน้า "ไม่มีอินเทอร์เน็ต" ไม่มีปุ่มโทร 191/1669 และบน dev เด้งไปหน้า error ของเบราว์เซอร์ | ข้อความ "ให้โทร 191 / 1669" เป็นตัวหนังสือ กดโทรไม่ได้ · ชิ้นโค้ดของหน้านี้โหลดแบบ lazy จึงโหลดไม่ได้หลังเน็ตหลุด | ใส่ปุ่มโทร 191/1669 (`app-call-buttons`) ในหน้านี้ · โหลดหน้านี้ล่วงหน้าตอนเปิดแอป | `pages/error-screen.ts` · `app.ts` | เห็นในเบราว์เซอร์: กด SOS ค้างตอนเน็ตหลุดที่หน้าหลัก → `/error/offline` มี `tel:191` `tel:1669` · เน็ตกลับ → กลับหน้าหลักเดิม · ธีมมืดตรวจแล้ว |
| H12 ประวัติ: ย้อนกลับจากรายละเอียดแล้วตัวกรองชนิด (ของมาส่ง/เจ้าหน้าที่ตรวจ) หาย | ช่วงวันที่คงอยู่ แต่ชนิดรีเซ็ตเป็น "ทั้งหมด" | ย้ายตัวกรองชนิดไปอยู่ใน store | `owner-history.ts` | เห็นในเบราว์เซอร์: ตัวกรอง+ตำแหน่งเลื่อน (659→659) คงเดิม |

ผ่านโดยไม่ต้องแก้ (เห็นในเบราว์เซอร์): Snapface (เจ้าของเห็นรูปที่ H12-b · เจ้าหน้าที่/หัวหน้า: ไม่มีข้อความเกี่ยวกับรูปในหน้า/แจ้งเตือน/API ทั้ง `/officer/logs` `/agency/*` · เรียก URL รูปด้วยเจ้าหน้าที่/หัวหน้า/แอดมิน(เส้นเจ้าของ)= 404, ไม่ล็อกอิน = 401) · ตั้งค่าแจ้งเตือน 4 บทบาท ปิด/เปิด รีเฟรชแล้วคงอยู่ ชนิดความปลอดภัยไม่มีสวิตช์ โหมดง่ายยังปิด/เปิดได้ · ประวัติ: วันนี้/7/30 วัน (1/6/9 รายการ) ชนิด ช่วงวันที่เอง ช่วงกลับด้านขึ้นข้อความ · รีเฟรชที่ O03/O05/O06/O08 กลับสถานะถูก · ลิงก์ตรงตอนยังไม่ล็อกอิน (`/home/history`, `/in/officer`, `/a/<token>`, `/auth/choose`) จำปลายทางถูก · ลบ cookie `sid` แล้วกดทำรายการ → `/auth/signin?next=/home/history` → ล็อกอินกลับหน้าเดิม · ปุ่มย้อนกลับหลังล็อกอินไม่กลับฟอร์ม

ตรวจหลังแก้: lint ผ่าน · unit 83/83 · `ng build` ผ่าน

**เห็นแล้วยังไม่ได้แก้:**
- รีเฟรชกลางฟอร์มสมัครเจ้าของบ้าน (ทุกขั้น) กลับไปขั้น 1 ว่างเปล่าโดยไม่บอก — ตั้งใจไม่เก็บรหัสผ่าน แต่ชื่อ/เบอร์ที่กรอกหายด้วย (ข้อเสนอ: เก็บร่างที่ไม่ใช่ข้อมูลอ่อนไหวใน sessionStorage + บอกผู้ใช้) · A10/L01 ไม่ได้ลองรีเฟรช
- ~~เน็ตหลุดไม่มีปุ่มโทร 191/1669~~ แก้แล้ว (ดูตาราง) · เน็ตหลุดตอนตรวจตู้ (O06) ใช้ตัวดักเดียวกัน แต่ไม่ได้ลองซ้ำเฉพาะหน้านั้น
- ถ้าตู้ออฟไลน์ ระบบยังรับคำสั่งเปลี่ยน Wi-Fi ไว้ค้าง (backend ออกแบบไว้) — แสดงเตือนแล้วแต่ไม่ได้บล็อก ถ้าต้องการ "สั่งไม่ได้เลย" ต้องแก้ backend
- ตั้งค่าแจ้งเตือน: รายการ "เครื่องที่เข้าสู่ระบบ" ยาวไม่จำกัด (ใน mock 20+ แถวจากการทดสอบ) · ป้ายเครื่องของแอดมินเคยขึ้น "Chrome · Android / เครื่องนี้" ทั้งที่เป็น Edge — ยังไม่หาสาเหตุ
- ตู้ 2 ตู้ของเจ้าของเดียวกันได้บ้านเลขที่ซ้ำ (99/9) หัวหน้าหน้าจึงแยกตู้ไม่ได้นอกจากดูชื่อตู้
- Wi-Fi ของ H13-b: ปุ่มในโหมดละเอียด/ภาษาอังกฤษของข้อความใหม่ยังไม่ได้ดูในเบราว์เซอร์

**ต่อรอบ 7 (ผ่านโดยไม่ต้องแก้):** SOS — รีเฟรชที่ H09 (กำลังส่ง) / H11 (รับแล้ว) / O10 กลับสถานะถูก · เจ้าหน้าที่รับ → หน้าเจ้าของเปลี่ยนเอง · ปิดเรื่อง → H11-b · ย้อนกลับจากหน้ารับแล้วไปหน้าหลักโดยไม่มี POST ซ้ำ · ย้อนจากหน้าปิดเรื่องไป `/home` · ไรเดอร์ — รีเฟรชที่ R02 ต้องสแกน/พิมพ์รหัสใหม่ (ข้อความชัด) · เน็ตหลุดที่ R02 → หน้าไม่มีอินเทอร์เน็ต → เน็ตกลับไปต่อได้ · ย้อนกลับไม่ส่งซ้ำ

**ยังไม่ได้ตรวจ:** ปุ่มย้อนกลับหลังตรวจผ่านจนจบ (ตู้จำลองหมดเวลางาน ~8 วิ ทำให้ O06→O08 ซ้ำไม่สำเร็จ; ย้อนจาก O05 ไปหน้าสรุปโดยไม่มี POST) · ไรเดอร์ย้อนกลับหลังส่งสำเร็จ (ไม่ได้กดส่งจริง ไม่อยากใช้โควตา 5 ครั้ง/ชม.) · รีเฟรช A07/A08 · "ดูเก่ากว่านี้" ใน H12 ตรวจด้วย response จำลอง (Playwright route) เท่านั้น เพราะไม่มีตู้ที่มีเหตุการณ์ ≥20

**ข้อมูลที่การทดสอบทิ้งไว้ใน mock (ไม่ได้ลบ):**
- SOS 1 รายการของ BX-00001 (เปิดโดยเจ้าของเดโม รับโดย `0834567890` ปิดแล้วหมายเหตุ "ทดสอบ รอบ 7") · ไรเดอร์ส่งของ 0 ครั้ง
- ตู้ **BX-00036** ลงทะเบียนใหม่แล้วผูกกับเจ้าของเดโม `0812345678` ชื่อ "ตู้ประตูหลัง" (บ้าน 99/9) → เจ้าของเดโมมี 2 ตู้ · รหัสเปิดใช้ตู้ใช้ไปแล้ว
- BX-00001: การตรวจหลายรอบจากเจ้าหน้าที่ `0834567890` (ผ่าน 2 งาน J-226464 [มี Snapface 1×1], J-cc41d1 + งานที่ล้ม/หมดอายุหลายงาน) · คำสั่ง Wi-Fi ของ BX-00001 อยู่สถานะ idle/done
- prefs ของ 4 บัญชีเดโมคืนค่าเดิมแล้ว (ทุกบัญชี default, ไม่ปิดชนิดใด)
- ผมปิดโปรเซส `box-sim` ไป 3 ตัวตอนเปิดเซิร์ฟเวอร์ใหม่ (อาจมีของเซสชันอื่นปนอยู่) · เปิด backend/frontend ใหม่ที่ 3111/4201

### รอบ 9 — Browser E2E ด้วย Playwright (W-03) (12 พ.ย. 2026 · ยังไม่ commit)

**สิ่งที่เพิ่ม:** `@playwright/test` (devDependency) · `frontend/playwright.config.ts` · `frontend/e2e/` (`proxy.e2e.json`, `scripts/start-backend.mjs`, `helpers/stack.ts`, 6 spec) · สคริปต์ `e2e:web` · หัวข้อใน `frontend/README.md` · `.gitignore` ของ test-results
**วิธีรัน:** ลบ `backend/.mockdb-e2e` → build → `dev-mock.mjs` (backend 3211, PGlite 54339) → `ng serve` 4211 (proxy ไป 3211) · viewport 375x812 · workers=1 · ตู้จำลอง = `box-sim.mjs` เป็น child process (ไม่คัดลอกสูตรเซ็น) · รหัสตู้/รหัสใต้ QR/secret ดึงจาก API แอดมิน · `E2E_REUSE=1` ใช้ server ที่เปิดค้างตอนพัฒนาเทสต์

| เส้น | ไฟล์ | ครอบคลุม | ยืนยันด้วย |
|---|---|---|---|
| a เจ้าของบ้าน | owner.spec.ts | สมัคร 3 ขั้น → ผูกตู้ด้วยรหัสเปิดใช้ → ตั้งชื่อ → หน้าหลัก "ตู้ไม่ออนไลน์" → ตู้จำลองต่อเข้า สถานะเปลี่ยน | เห็นในเบราว์เซอร์จริง (Playwright) |
| b เจ้าหน้าที่ | officer.spec.ts | พิมพ์รหัสหน้าตู้ → ตู้ตื่น → QR ประจำตัว (ปุ่มคัดลอกของ devTools) → ตู้จำลองส่งผล → pass → เจ้าของเห็นชื่อเจ้าหน้าที่ในประวัติ · อ่านไม่ผ่าน 3 ครั้ง → `badge-failed` | เบราว์เซอร์จริง |
| c ไรเดอร์ | rider.spec.ts | ส่งสำเร็จ · reload/ยิงตั๋วเดิมซ้ำถูกปฏิเสธ นับยัง 1 · ครบ 5 แล้วครั้งที่ 6 ขึ้นหน้าจำกัด นับยัง 5 | เบราว์เซอร์จริง |
| d SOS | sos.spec.ts | 2 context: เจ้าของกดค้าง 3 วิ → เจ้าหน้าที่เห็น/รับ → เจ้าของเห็นชื่อ+เบอร์ → ปิดเรื่อง → เจ้าของเห็นปิด เบอร์ไม่อยู่ในหน้า | เบราว์เซอร์จริง |
| e แอดมิน | admin.spec.ts | ลงทะเบียนตู้ → QR 3 ใบ+รหัสใต้ QR → secret ตรง API → ปลุกตู้ผ่านตู้จำลอง ผ่าน | เบราว์เซอร์จริง |
| regression | regressions.spec.ts | `?next=` ของ /auth/choose และ /home/history · ขอบเตือนช่องบังคับ (computed border-color) · ปุ่มหลักคลิกเดียวติดหลังพิมพ์ช่องสุดท้าย | เบราว์เซอร์จริง (ยังไม่ได้ย้อนบั๊กเพื่อดูว่าเทสต์ล้มจริง) |

**ผล 3 รอบติดกัน (`npm run e2e:web` เริ่มจากฐานเปล่า):** รอบ 1 ผ่าน 9/9 (เทสต์ 57.8 วิ · รวม 60 วิ) · รอบ 2 ผ่าน 9/9 (58.0 · รวม 59) · รอบ 3 ผ่าน 9/9 (1.0 นาที · รวม 63) · ไม่มี flaky/retry · lint ผ่าน · unit 83/83 · `ng build` ผ่าน

**แก้โค้ดแอป:** ไม่มี · `data-testid` ที่เพิ่ม: ไม่มี (ใช้ role/label/ข้อความ) · ปุ่มคัดลอก QR ใช้ได้โดย intercept `/config.json` ในเทสต์ (ไม่แก้ public/config.json)

**เห็นแล้วยังไม่ได้แก้:** เทสต์อิงข้อความภาษาไทยบนจอ เปลี่ยนถ้อยคำแล้วต้องแก้เทสต์ (ข้อเสนอ: เพิ่ม data-testid ให้จุดหลักรอบหน้า)

**ยังไม่ได้ตรวจ:** เส้นต่าง ๆ ในโหมดง่าย/ละเอียด · ธีมมืด · ภาษาอังกฤษ · เส้นล้มของ SOS (ยกเลิก/ไม่มีคนรับ) · CI (W-07)

**ข้อมูลที่ทิ้งไว้:** `backend/.mockdb-e2e` (ลบเองตอนเริ่มรอบถัดไป) · `frontend/test-results` · chromium ที่ `npx playwright install` โหลดไว้ใน cache ผู้ใช้ · ไม่แตะ .mockdb อื่น ไม่ได้เปลี่ยน prefs บัญชีเดโม

### รอบ 10 — เก็บ UX/UI ตามผลตรวจ better-* ที่ 320px (12 พ.ย. 2026 · ยังไม่ commit)

> สภาพแวดล้อม: backend mock **3010** (`SMMB_MOCK_DATA_DIR=.mockdb-ux`, PGlite 55477) · frontend dev **4210** (proxy `/api` + `/v1` → 3010) · Playwright Chromium viewport **320×800** · ตรวจทั้งธีมสว่าง/มืด และโหมดตัวอักษร `normal`/`xlarge` · ภาพก่อน/หลังอยู่ที่ `reports/ux-320/` (`before-320.png`, `after-320-light.png`, `after-320-dark.png`, `after-320-badge-xlarge.png` — `reports/` ถูก gitignore)

**แก้แล้ว**

| เรื่อง | อาการเดิม | สิ่งที่เปลี่ยน | ไฟล์ | ยืนยันด้วย |
|---|---|---|---|---|
| ปุ่มสลับธีมลอยทับเนื้อหา (MEDIUM) | FAB กลมมุมขวาล่างของแอดมินทับค่าใน D04 ระหว่างเลื่อน (เช่น แถว “ค่าตั้งค่า/รอตู้ดึงค่าใหม่”) ไม่ใช่แค่ท้ายหน้า | **เอา FAB ออก** (ผู้ใช้เลือก 12 พ.ย. 2026) · ใช้เมนู “การแสดงผล” `/settings/display` ที่มีปุ่มธีม 3 ทางอยู่แล้ว · ถอด padding ท้าย `main` 140px ที่กัน FAB ออกด้วย | `layout/area-shell.ts` | ภาพก่อน/หลัง 320px หน้า D04: ก่อนมีพระจันทร์ทับแถวค่าตั้งค่า · หลังไม่มี FAB และเนื้อหาอ่านครบ · วัด `document.querySelector('.theme-fab')` = `null` ทุกบทบาท · ไม่มี horizontal overflow |
| ตัวอักษร 11px ไม่ขยายตามโหมด (MEDIUM) | ป้ายเลขบนหมุดแผนที่ใช้ `11px` ตายตัว · แกนเวลา `:00 :06 :12 :18 :24` ใช้ `0.625rem` (10px) · badge ตัวเลขหน้า header ใช้ `0.6875rem` (11px) | หมุดแผนที่ `clamp(12px, 0.75rem, 14px)` (12px ปกติ → โตตามโหมดแต่ไม่เกิน 14px กันเลข 2 หลักล้นหมุด) · แกนเวลา/ตัวเลขโหมดละเอียด `0.75rem` · badge `0.75rem` + `min-block-size: 18px` + `line-height: 1.5` | `shared/agency-map.ts`, `shared/houses-map.ts`, `officer/officer-home.scss`, `shared/page-header.ts` | วัดจริง 320px: badge 12→15.6px (สูง 18→23.4px) · legend 12→15.6px · หมุด 12→14px · `overflowX = 0` ทุกหน้า |
| สี hex ตายตัวนอกโทเคน (MEDIUM) | hex ในคอมโพเนนต์กระจายกว่า 90 จุด (ปุ่มสำเร็จ, toast, กล้อง, หมุดแผนที่, QR, badge ฯลฯ) | เพิ่มโทเคนบทบาทใน `styles.scss` (`--success-bg/-fg/-text`, `--on-dark`, `--map-*`, `--qr-bg/-ink`, `--print-ink`, `--media-*`, `--badge-fg`, `--sos-dim/-deep`, `--call-bg/-fg`) แล้วอ้างจากคอมโพเนนต์ · สีเขียวเต็มหน้าคง `#157347` · หมุด “เลือกแล้ว” ใช้ `--map-picked` เข้มขึ้น `#b45309` เพื่อให้ตัวเลขขาวผ่าน 4.5:1 | `styles.scss` + คอมโพเนนต์ที่ระบุในตาราง | `rg '#[0-9a-fA-F]{3,8}' frontend/src/app` เหลือ 2 บรรทัดใน `shared/qr-image.ts` (ค่าที่ส่งให้ไลบรารี QR ต้องเป็นขาว/ดำจริง) · ตรวจ contrast DOM 8 หน้า × สว่าง/มืด = 0 รายการต่ำกว่า 4.5:1 (ตัวใหญ่ ≥3:1) · ภาพ D04 ก่อน/หลังสีเหมือนเดิม |
| `:hover` ไม่ถูกห่อ `@media (hover: hover)` (MEDIUM) | แตะบนมือถือแล้วสถานะ hover ค้าง | ห่อเฉพาะกฎ hover ใน `styles.scss` และคอมโพเนนต์ทั้งหมด · ไม่แตะ `:focus-visible`/`:active` | `styles.scss`, `layout/area-shell.ts`, `admin-home.ts`, `admin/admin-boxes.ts`, `admin/admin-plans.ts`, `shared/page-header.ts`, `shared/notification-list.ts`, `head/head-zone-edit.scss`, `owner/owner-settings.ts` | CSSOM 320px: กฎ `:hover` ของแอป **29/29 อยู่ใน media** · ที่เหลือ 3 กฎเป็นของ `leaflet.css` (third-party) · `:focus-visible` 9 กฎ และ `:active` 3 กฎยังอยู่ · จำลอง `hover:none` + `pointer:coarse` แล้ว hover การ์ด → พื้นหลังไม่เปลี่ยน |
| badge `line-height: 18px` (LOW) | ค่า px ตายตัว ไม่สัมพันธ์กับฟอนต์ | `line-height: 1.5` + `min-block-size: 18px` | `shared/page-header.ts` | badge ปกติสูง 18px พอดี · โหมดใหญ่สูง 23.4px ไม่ล้นกรอบ |
| `<h1>` ซ้ำใน D04 (LOW) | มี `<h1>` 2 ตัวใน DOM (หัวหน้า + ใบพิมพ์ QR) | ใบพิมพ์เปลี่ยนเป็น `<p class="print-title">` คงสไตล์เดิม | `admin/admin-boxes.ts` | วัด DOM: `h1 = ['ตู้ 99/9']` ตัวเดียว · `.print-title` เป็น `P` |
| เป้ากดต่ำกว่า 32px (LOW) | ปุ่ม “จัดการ” ใน D01 และลิงก์เบอร์โทรใน L05-b | `min-block-size: 44px` (ปุ่ม `small-btn`, ลิงก์ header panel, เบอร์ `tel:` ใน `.kv`) | `admin-home.ts`, `head/head-members.ts` | วัดจริง: ปุ่ม “จัดการ” 44px · เบอร์โทร 44px · display `inline-flex` |
| ข้อความ ellipsis ไม่มีทางเห็นค่าเต็ม (LOW) | `text-overflow: ellipsis` 4 จุด | ใส่ `title` ข้อความเต็มที่ label เมนู (ทั้งเมนูหลัก/ย่อย), หัวข้อ log D11, quick actions/action summary D01 · ชื่อผู้ใช้มี `title` อยู่แล้วจึงคงไว้ | `layout/area-shell.ts`, `admin/admin-system.ts`, `admin-home.ts` | เปิด 320px + โหมดใหญ่มาก: ข้อความยังตัดด้วย … แต่ hover/กดค้างเห็น `title` เต็ม |

**ตรวจหลังแก้:** `npm --prefix frontend run lint` ผ่าน · `npx ng test --watch=false` **83/83** · `npm --prefix frontend run build` ผ่าน (มี warning budget `admin-home` 7.19 kB เกิน 7.00 kB 189 ไบต์ จากกฎ hover/พื้นที่แตะที่เพิ่ม) · `node scripts/project-guardian.mjs --full` = **WARN เฉพาะ “มี 41 ไฟล์ยังไม่ commit”** — registry/routes, tabs, 3-mode, i18n, secrets, migrations, frontend/back build+lint+unit ผ่านทั้งหมด (report `reports/guardian-2026-11-12T03-53.md`)

**ไม่ได้แก้เพราะ…**
- `shared/qr-image.ts` ยังมี `#000000`/`#ffffff`: เป็นค่าที่ส่งให้ `qrcode` สร้างภาพ QR ต้องเป็นขาว/ดำจริงเพื่อให้กล้องอ่านได้ (ไม่ใช่สี UI)
- กฎ `:hover` 3 ข้อที่เหลือใน CSSOM มาจาก `leaflet.css` ของไลบรารี ไม่ได้อยู่ในซอร์สแอป
- `.who small` (ข้อความ “แอดมิน”) ไม่มี ellipsis/ข้อความยาว จึงไม่ใส่ `title` เพิ่ม · `.who strong` มี `title` ชื่อผู้ใช้อยู่แล้ว

**ยังไม่ได้ตรวจในรอบนี้:** การไล่โฟกัสด้วย Tab ทุกจุด · 200% zoom · RTL · ฟลว์สมัคร/ผูกตู้/กล้อง/SOS/ตรวจจริง · อ่านข้อความไทย/อังกฤษทั้งหมดตามหลัก better-writing · ภาพหมุดแผนที่จริง (mock ยังไม่มีหน่วยงานปักหมุด จึงวัดด้วย probe ใน DOM) · 768/1024/1440 ตรวจแค่ D04 แบบ smoke (ไม่มี overflow, sidebar/ธีมยังอยู่) ไม่ได้กวาดทุกหน้า

**หมายเหตุ working tree:** ระหว่างรอบนี้มีไฟล์ที่ไม่ได้อยู่ในงานนี้ถูกแก้พร้อมกัน (`firmware-program/app/src/main.rs`, `frontend/src/app/pages/notif-settings.ts`, `frontend/src/app/shared/box-picker.ts`, `frontend/proxy.ui.json`, `CHANGELOG.md`) — ไม่ได้แตะ/ย้อนไฟล์เหล่านั้น · ไฟล์ที่แก้รอบนี้อยู่ใน `git diff` เฉพาะรายการตารางข้างบน

### รอบ 9 — เก็บของที่รอบ 7 ยังไม่ได้ตรวจ + ข้อเสนอที่ค้าง (12 พ.ย. 2026 บ่าย · ยังไม่ commit)

> สภาพแวดล้อม: backend mock **3111** (`SMMB_MOCK_DATA_DIR=.mockdb-verify`) · frontend dev **4201** proxy `/api` + `/v1` → 3111 · `GET http://localhost:4201/api/health/live` = `{"ok":true}` · Playwright (Edge channel `msedge`) viewport **375×812** · ตู้จำลอง `box-sim.mjs poll --manual` แล้วสั่ง `ready`/`result` แยก (ไม่ใช้ `live` แบบ background) · ระหว่างรอบมีเซสชันอื่นใช้ backend เดียวกันและแก้ไฟล์ frontend พร้อมกัน (รอบ 9 Browser E2E / รอบ 10 ธีม) — ไม่ได้แตะไฟล์เหล่านั้น
> หมายเหตุลำดับเอกสาร: ด้านบนมี "รอบ 9 — Browser E2E" และ "รอบ 10" ของเซสชันอื่นอยู่ก่อนแล้ว; ส่วนนี้คือรอบ 9 ตามคำสั่งงาน (ตรวจต่อจากรอบ 7) วางต่อท้ายก่อน 3.3 โดยไม่แก้ข้อความรอบก่อน ๆ

**แก้แล้ว**

| เรื่อง | อาการเดิม | สิ่งที่เปลี่ยน | ไฟล์ | ยืนยันด้วย |
|---|---|---|---|---|
| รายการ "เครื่องที่เข้าสู่ระบบ" ยาว | API คืนได้ถึง 20 เครื่อง (`LIMIT 20`) ทำให้หน้าตั้งค่ายาวมาก โดยเฉพาะแอดมิน/เจ้าของที่มีแถวทดสอบสะสม | ครอบรายการด้วย `.device-list` จำกัดสูง 248px แล้วเลื่อนในกรอบ + หัวข้อแสดงจำนวน `(N)` | `frontend/src/app/pages/notif-settings.ts` | **เห็นในเบราว์เซอร์** 375px: admin 20 แถว `clientHeight=248 / scrollHeight=1229`, owner 20 แถว `248/1209`, head 16 แถว; โหมด easy/default/advanced × ธีมสว่าง/มืด; easy ยังซ่อนทั้งการ์ดตามเดิม; `scrollWidth=375` ไม่มี overflow |
| บ้านเลขที่ซ้ำในโซน แยกตู้ไม่ได้ | L07 รายการ "บ้านในโซน" แสดงแค่บ้านเลขที่ (เจ้าของคนเดียวมี BX-00001/BX-00036 บ้าน 99/9) และกล่องยืนยันลบก็บอกแค่บ้านเลขที่ | เพิ่มบรรทัดรอง `BX-xxxxx · ชื่อตู้` ใต้บ้านเลขที่ + ใส่ชื่อตู้ใน aria-label/กล่องยืนยันเมื่อมีชื่อ | `frontend/src/app/pages/head/head-zones.ts` (เฉพาะ hunk ของรอบนี้) | **เห็นในเบราว์เซอร์**: L07 แสดง `99/9 / BX-00001 · ตู้หน้าบ้าน`, `123/45 / BX-00002 · ตู้บ้านทดสอบ`, `555/5 / BX-00003 · ตู้บ้านใหม่ 555`; 3 โหมด × สว่าง/มืด + อังกฤษ; `scrollWidth=375` |

**ผ่านโดยไม่ต้องแก้ (เห็นในเบราว์เซอร์):**
- **A1 ปุ่มย้อนกลับหลังตรวจผ่านจนจบ:** O02-b → O03 → O05 → O06 → ตู้จำลอง `result` pass → O08 (ค้าง 8 วิ) · ย้อนกลับ → `/officer` (O01) โดยตรง ไม่กลับ O06/O05 และไม่มี POST `/inspections` หรือ `/result` ซ้ำ · ย้อนอีกครั้งออกนอกแอป (ไม่มี history) · O08 แสดง "ตรวจแล้ว 1/2 หลัง"
- **A2 เน็ตหลุดที่ O06:** ตัดเน็ต → `/error/offline` มี `tel:191` + `tel:1669` · กลับออนไลน์ → กลับ O06 เดิมอัตโนมัติ · สร้าง QR ใหม่ + ส่งผลต่อได้จนถึง O08 (งานไม่หลุด)
- **A2 เน็ตหลุดตอนกดส่งฟอร์มสมัคร:** A10 ขั้น 2 ตัด POST `/auth/signup/officer` (navigator ยังออนไลน์) → อยู่หน้าเดิมและขึ้น "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง" · ตัดเน็ตจริงที่ขั้น 2 → `/error/offline` → กลับออนไลน์ได้กลับ A10 (แต่กลับขั้น 1 — ดูข้อร่างหาย)
- **A3 รีเฟรช:** A07 รีเฟรชแล้วอยู่ A07 · A08 รีเฟรชแล้วอยู่ A08 และ `?box=` ยังอยู่ (ชื่อตู้ที่พิมพ์หาย — ดูข้อร่างหาย) · A10 และ L01 รีเฟรชที่ขั้น 1/2/3 แล้วกลับขั้น 1 ว่าง ไม่ crash/404 · A06 ขั้น 1 รีเฟรชแล้วว่างเช่นกัน · A07 ขั้นพิมพ์รหัส รีเฟรชแล้วกลับหน้าสแกน
- **A4 ไรเดอร์ย้อนกลับหลังส่งสำเร็จ:** R01 → R02 → R04 · ปุ่มย้อนกลับ → `/r` (R01) · `POST /public/deliveries` เกิดขึ้น 1 ครั้ง ไม่ซ้ำ · ย้อนอีกครั้งออกนอกแอป · ใช้ BX-00001 ซึ่งไม่มี delivery ในชั่วโมงก่อนทดสอบ (โควตา 5 ครั้ง/ชม. ยังเหลือ)
- **A5 H13-b Wi-Fi + แบนเนอร์แอดมิน:** H13-b ตู้ออฟไลน์ (BX-00036) แสดง "ตอนนี้ตู้ออฟไลน์ — คำสั่งยังไปไม่ถึงตู้" ครบ 3 โหมด (ไทย) + อังกฤษโหมดละเอียด · `/settings/notifications` ของแอดมินขึ้น "จะไม่รู้เมื่อตู้มีปัญหา มีคำขอช่าง หรือมีเคส QR..." (ไทย/อังกฤษ) ไม่ใช่ข้อความเจ้าของบ้าน · โหมดง่ายซ่อนเฉพาะประโยคอธิบาย (`easy-hide`) หัวยังเห็น (ตามดีไซน์) · ป้าย "เครื่องนี้" ของเบราว์เซอร์ทดสอบขึ้น `Edge · Windows` ถูกต้อง

**เห็นแล้วยังไม่ได้แก้**
- **ร่างฟอร์มหายเมื่อรีเฟรช (A06/A10/L01/A08/A07):** ฟอร์มเก็บใน memory ของ `AuthDemo.forms` (signal) + `ownerStep`/`ownerHouseForm` เท่านั้น · หลักฐาน: A06 ขั้น 1 พิมพ์ชื่อ/เบอร์/รหัสแล้วรีเฟรช ชื่อกลับเป็น `""` · A10 L01 รีเฟรชที่ขั้น 2 หรือ 3 กลับขั้น 1 และช่องว่างทั้งหมด · A08 พิมพ์ชื่อตู้แล้วรีเฟรช ชื่อ `""` (ยังอยู่ A08 และ `?box=` ครบ) · A07 ขั้นพิมพ์รหัส Refresh แล้วกลับหน้าสแกน · **ข้อเสนอ (ยังไม่ลงมือตามคำสั่ง):** เก็บร่างเฉพาะฟิลด์ที่ไม่เป็นความลับใน `sessionStorage` (ชื่อ, บ้านเลขที่, ที่อยู่, ชื่อหน่วยงาน ฯลฯ) พร้อมแบนเนอร์ "ร่างถูกเก็บไว้ในแท็บนี้จนปิดแท็บ" และปุ่มล้างร่าง · **ห้ามเก็บรหัสผ่าน/ข้อตกลงที่กดยอมรับ/รหัสเปิดใช้ตู้ใน A07** · ถ้าทีมถือว่าเบอร์โทรเป็น PII ให้เก็บเบอร์ในหน่วยความจำเท่านั้นและบอกว่าเบอร์จะหายเมื่อรีเฟรช · ล้างร่างเมื่อออกจากระบบหรือสมัครสำเร็จ
- **ป้ายเครื่อง Edge ขึ้น Chrome · Android:** พบช่องโหว่ที่ `backend/src/auth/me.service.ts` ฟังก์ชัน `deviceLabel()` — ตรวจ Edge ด้วย `/Edg\//i` ซึ่งไม่แมตช์ UA ของ Edge บน Android (`EdgA/`) และ Edge บน iOS (`EdgiOS/`) จึงตกไปเป็น Chrome · ต่างจาก `backend/src/auth/auth.service.ts` ที่ใช้ `/EdgA?\//` (ถูกสำหรับ `EdgA/`) · ยังเห็นแถว `49013ac8 Chrome · Android` (02:36) ใน `/me/devices` ของแอดมิน ขณะที่แถวอื่นเป็น `Edge · Windows` · **ข้อจำกัด:** API ไม่คืน UA ดิบ จึงฟันธงแถวเดิมไม่ได้ว่าเป็น Edge Android จริงหรือ Playwright จำลอง UA เป็น Chrome Android ตั้งแต่ต้น — แต่ช่องโหว่ regex นี้ยืนยันจากโค้ดและกระทบผู้ใช้ Edge Android/iOS จริง · **ข้อเสนอ:** เปลี่ยนเป็น `/Edg(?:A|iOS)?\//i` หรือใช้ UA-CH + เพิ่ม unit test ด้วย UA จริงของ Edge Android/iOS (แก้ backend ต้องสั่งก่อน) · รายการยังแสดงชื่อรุ่นหยาบ (Edge · Windows ซ้ำหลายแถว) เพราะ UA มีเท่านี้ — ถ้าต้องการละเอียดกว่านี้ต้องเก็บ UA-CH เพิ่ม
- **คำสั่งเปลี่ยน Wi-Fi ตู้ออฟไลน์ค้างได้ 24 ชม.:** H13-b แสดงคำเตือนครบแล้ว แต่ API ยังรับคำสั่งและเก็บ pending ไว้ 24 ชม. (ออกแบบไว้) · **ข้อเสนอ:** ถ้า `boxStatus === 'offline'` ให้ API ปฏิเสธด้วย code `BOX_OFFLINE` (หน้าเว็บมีข้อความรองรับอยู่แล้ว) หรือรับเฉพาะเมื่อส่ง `force=true` พร้อมยืนยันชัดเจน · เป็นการแก้ backend จึงยังไม่ทำ
- **L08 log / L04 กิจกรรมล่าสุดยังแยกตู้ด้วยบ้านเลขที่เท่านั้น:** API `/agency/logs` และกิจกรรมใน L04 ส่ง `box_id` มาแต่ไม่มี `box_name` · L07 แก้ให้เห็นชื่อตู้แล้ว แต่ log ยังเห็นแค่ `99/9` ทั้งที่อาจมี 2 ตู้ · **ข้อเสนอ:** เพิ่ม `box_name` ใน response ของ `/agency/logs`/`/agency/today` หรือแสดง `box_id` ในโหมดละเอียด · ต้องแก้ backend จึงยังไม่ทำ
- **API `/api/v1/admin/logs?type=delivery|inspection|sos` ตอบ 500 ใน mock** (ทดสอบซ้ำ 4 ครั้ง; `type=scan` ตอบ 200) · หน้า D11 โหลดทั้งหมดแล้วกรองฝั่ง client (`core/admin-api.ts` ไม่ส่ง `type`) จึงยังไม่กระทบผู้ใช้ · น่าจะเป็นปัญหาที่ branch SQL/parameter ของ mock ไม่ใช่ UI — บันทึกไว้ให้ฝั่ง backend ตรวจ

**ยังไม่ได้ตรวจ**
- L01 กดส่งคำขอหน่วยงานตอนเน็ตหลุด/ตัด POST (ทดสอบเส้นนี้กับ A10 แล้วเท่านั้น)
- สแกน QR ด้วยกล้องจริงที่ A07/O02 (Playwright headless เปิดกล้องไม่ได้; ทดสอบเส้นพิมพ์รหัส)
- ป้ายเครื่องบน Edge Android/iOS เครื่องจริง (สรุปสาเหตุจากโค้ด + UA ใน `/me/devices` ไม่ได้จำลอง UA เข้า DB)
- สร้างคำสั่ง Wi-Fi ค้างจริงตอนตู้ออฟไลน์ (อ่านคำเตือนและ API เท่านั้น)
- 768/1024/1440 ของสองหน้าที่แก้ · ธีมมืดของ H13-b · `/settings/notifications` เวอร์ชันเจ้าหน้าที่ · แบนเนอร์แอดมินตอนเปิดแจ้งเตือนสำเร็จ (headless Edge ไม่รองรับ push)
- ชุด `npm run e2e:web` (W-03) ไม่ได้รันซ้ำในรอบนี้; รอบนี้ใช้ Playwright แบบ scratchpad

**ตรวจหลังแก้:** `npm run lint` ผ่าน · `npx ng test --watch=false` **83/83** · `npx ng build` ผ่าน (มี warning budget `admin-home` 7.19 kB เกิน 7.00 kB 189 ไบต์ จากงานธีมของเซสชันอื่น ไม่ใช่ไฟล์รอบนี้) · กลับไปดูในเบราว์เซอร์ซ้ำหลังแก้ (ตารางด้านบน)

**ข้อมูลที่การทดสอบทิ้งไว้ใน mock (ไม่ได้ลบ):**
- โปรเซสบัจจุบัน: backend mock **3111** (`SMMB_MOCK_DATA_DIR=.mockdb-verify`) · frontend **4201** · `box-sim poll --manual` ของรอบนี้เปิดเฉพาะตอนทดสอบและ kill ตาม PID ตัวเองแล้ว (เหลือตัวของเซสชันอื่นซึ่งมี 4–5 ตัวระหว่างรอบ ไม่ได้แตะ)
- บัญชีใหม่ **U-0067** `0897770001` "ทดสอบ รอบเก้า" (เจ้าของบ้าน, บ้าน 77/7) · ตู้ **BX-00034** ถูกผูกกับบัญชีนี้ ชื่อ "ตู้ทดสอบรอบ 9" (รหัสเปิดใช้ `37BJ-SFF9` ถูกใช้แล้ว · ตู้ offline ไม่เคยต่อ)
- BX-00001: การตรวจผ่าน 2 งาน — `e71a63eb-b46f-4fd5-b70c-6fc8f5ac9e83` (`J-6e2739`, 10:33) และ `f6d93de5-2a29-4e63-b2f8-eb09c6e51d7e` (`J-f4233f`, 10:35) · scan log 10:32–10:35 รวม 1 ครั้ง `box_offline` (10:33:46 จากการเริ่มตรวจตอนตู้ยังไม่ออนไลน์) · เปิดดู device secret 2 ครั้ง (บันทึกใน data access log)
- ไรเดอร์ส่งของ BX-00001 1 ครั้ง 10:40 (`delivery:34f2bf6d-618f-4e96-b688-5815f472c0d5`) → มีแจ้งเตือนถึงเจ้าของบ้าน · รอบนี้ไม่ได้สร้าง SOS ใหม่
- เครื่องที่เข้าสู่ระบบ: Playwright แต่ละ context สร้าง device row ใหม่ (Edge · Windows) — admin/owner ถึงเพดาน 20 แถว, head 16 · ไม่ได้ลบ (ต้องใช้ DB) · แถว `49013ac8 Chrome · Android` (02:36) ยังอยู่แต่ถูกแถวใหม่ดันลง
- prefs 4 บัญชีเดโมคืนค่าเดิมครบแล้ว (theme system, lang th, text_size normal, ui_mode default, easy_mode false, muted_types []) — ตรวจซ้ำผ่าน API ตอนจบ
- ไม่ได้ลบ/รีเซ็ต `.mockdb*` ใด ๆ · ไม่ได้แตะ backend/migration/firmware

**หมายเหตุ working tree:** รอบนี้แก้เฉพาะ `frontend/src/app/pages/notif-settings.ts`, `frontend/src/app/pages/head/head-zones.ts` (hunk ของเรา) และเอกสารนี้ · ไฟล์จำนวนมากที่ `git status` แสดง (ธีม/hover/พื้นที่แตะ/`firmware-program/app/src/main.rs`) เป็นงานของเซสชันอื่นระหว่างรอบ — ไม่ได้แก้ทับหรือย้อน

## 3.3 งานฝั่งเซิร์ฟเวอร์ — พร้อมสั่ง Codex (ทำจาก SSH เท่านั้น)

> ส่วนนี้ agent ในเครื่อง dev ทำต่อไม่ได้ (ไม่มี SSH ไป `hub.sjp-dev.net`) — คัดลอกคำสั่งนี้ให้ Codex บนเซิร์ฟเวอร์ทำทีละข้อ แล้วบันทึกผลกลับในเอกสารนี้

### S-02 🟠 deploy + rollback (ปิด W-02)

- **สถานะ 10 พ.ย. 2026:** ✅ deploy `05e540b` แล้วผ่าน **Docker Compose** (host นี้ไม่มี user `smmb` — ห้ามใช้ `sudo -u smmb` บนเครื่องนี้) · hash/health/migration ตรวจผ่าน (ดู W-02) · **เหลือซ้อม rollback**
- ขั้นตอน deploy บน host นี้: `git pull` → build/publish ตามวิธีที่ผู้ดูแลใช้ (Docker Compose) → ตรวจ 4 ข้อด้านล่าง

ตรวจหลัง deploy (ใช้ได้ทุกวิธี):

```bash
grep -oE 'main-[A-Z0-9]+\.js' /var/www/smmb/index.html
grep -oE 'main-[A-Z0-9]+\.js' /opt/smmb/frontend/dist/smmb-web/browser/index.html
cat /var/www/smmb/config.json     # ต้องมี apiBase=/smmb-api และ devTools=false
curl -fsS https://hub.sjp-dev.net/smmb-api/api/health
# จากเครื่อง dev (ไม่ต้อง SSH):
GUARDIAN_DEPLOY_URL=https://hub.sjp-dev.net/smmb node scripts/project-guardian.mjs --full
```

ซ้อม rollback 1 ครั้ง (ช่วง maintenance — ถามเจ้าของระบบก่อน):
- บน host ที่ใช้ Compose: tag image/release ปัจจุบันไว้ → สลับกลับ release ก่อนหน้า → ตรวจ hash + health → สลับกลับ
- บน host ที่ใช้ `scripts/deploy.sh`: `HEALTH_URL=http://127.0.0.1:9/ HEALTH_TIMEOUT=2 bash scripts/deploy.sh` ต้อง exit ≠ 0 และเว็บกลับชุดก่อนหน้า

**DoD:** hash prod = dist ✅ · `devTools:false` ✅ · guardian ไม่มี `Deploy drift` FAIL ✅ · rollback ทำงานและบันทึกเวลา ⬜

### S-19 🟠 ตรวจ migration 0034–0036 + พฤติกรรมใหม่หลัง deploy

ทำหลัง S-02 (deploy มี `--migrate` แล้ว):

```bash
# 1) migration ต้องครบ 0036 และ index ซ้ำหาย
sudo docker exec smmb-postgres-1 psql -U smmb -d smmb -c "select migration_name, created_date from app.migration_tb order by migration_name desc limit 5"
sudo docker exec smmb-postgres-1 psql -U smmb -d smmb -c "select indexname from pg_indexes where schemaname='app' and tablename='zone_tb'"
# ต้องเห็น zone_name_per_agency และไม่เห็น uq_zone_name

# 2) audit ถูกเขียน (อนุมัติหน่วยงาน/เปลี่ยน role 1 ครั้ง แล้วดูแถว)
sudo docker exec smmb-postgres-1 psql -U smmb -d smmb -c "select action, subject_kind, created_date from app.admin_audit_log_tb order by created_date desc limit 5"

# 3) health: push down ต้อง 200 degraded (ไม่ใช่ 503)
curl -s https://hub.sjp-dev.net/smmb-api/api/health

# 4) input ผิดรูปต้อง 400 ไม่ใช่ 500 (ต้องมี cookie ของเจ้าของตู้ — ถ้าไม่ล็อกอินจะได้ 401 ก่อนถึงขั้นตรวจค่า)
#    ทดสอบง่ายกว่า: เปิดเบราว์เซอร์ล็อกอินเป็นเจ้าของ แล้วยิงจาก console หรือใช้ cookie sid
curl -s -o /dev/null -w "%{http_code}\n" "https://hub.sjp-dev.net/smmb-api/api/v1/boxes/BX-00001/technician-requests/not-a-uuid/confirm" \
  -X POST -H 'content-type: application/json' -H 'cookie: sid=<ค่า sid>' -d '{}'
# คาด 400 (INVALID_INPUT) · 404/403 = ยังไม่ถึง validator หรือไม่มีสิทธิ์ในตู้นั้น

# 5) retention purge ทำงาน: บังคับรัน cleanup แล้วดู log
sudo journalctl -u smmb-backend -n 50 | grep -i 'cleanup\|retention'
```

**DoD:** migration ล่าสุด = `0036` · index เหลือตัวเดียว · audit มีแถวเมื่อทดสอบอนุมัติ · health semantics ถูก · ไม่มี error `log tables are append-only` จาก scheduler

### S-05 🔴 backup + ซ้อม restore (ปิด W-05)

```bash
sudo mkdir -p /var/backups/smmb && sudo chmod 700 /var/backups/smmb

# /etc/cron.d/smmb-backup — ทุกวัน 03:10 เก็บ 14 วัน
10 3 * * * root docker exec smmb-postgres-1 pg_dump -U smmb -Fc smmb > /var/backups/smmb/smmb-$(date +\%F).dump && find /var/backups/smmb -name 'smmb-*.dump' -mtime +14 -delete
```

- คัดลอกไฟล์ออกนอกเครื่อง (S3/rsync ไปเครื่องอื่น) ทุกวัน
- สำรอง `/opt/smmb/backend/.env` แยก (ไม่ใส่ค่าในเอกสาร)
- ซ้อม restore ลงฐานทดสอบ:

```bash
docker exec smmb-postgres-1 createdb -U smmb smmb_restore_test
docker exec -i smmb-postgres-1 pg_restore -U smmb -d smmb_restore_test < /var/backups/smmb/<ไฟล์>.dump
# ตรวจตารางสำคัญ: users, boxes, inspections, sos_case
```

**DoD:** ระบุวันที่ซ้อมสำเร็จ + ขนาดไฟล์ + ที่เก็บ off-site

### S-06 🟠 uptime monitor (ปิด W-06)

- สมัคร/ตั้ง monitor ภายนอก (UptimeRobot/Better Stack/Healthchecks.io) ยิง `https://hub.sjp-dev.net/smmb-api/api/health` ทุก 1 นาที
- แจ้งเตือนอีเมล/Webhook เมื่อ status ≠ 200
- เพิ่มแจ้งเตือนแยกเมื่อ JSON มี `"redis":"down"` (ใช้ keyword monitor หรือ script)

**DoD:** ทดลองหยุด Redis ใน dev/staging แล้วได้แจ้งเตือนจริง 1 ครั้ง พร้อมบันทึกเวลา

### S-18 ✅ nginx HSTS + CSP (ปิด W-18)

- **สถานะ 10 พ.ย. 2026:** ✅ ปิดแล้ว — CSP บังคับใช้ + HSTS `max-age=86400` (รายละเอียด/หลักฐานอยู่ใน W-18)
- **เหลือเพียงจุดเล็ก:** เพิ่ม HSTS ซ้ำใน `location /smmb/` (ไฟล์ repo แก้ให้แล้ว) — ถ้าต้องการให้ `/smmb/` ส่ง header นี้ด้วยโดยไม่ต้องรอโหลด index
- ผ่าน 1–2 สัปดาห์ค่อยเพิ่ม HSTS เป็น `max-age=31536000; includeSubDomains`
- ตรวจซ้ำ:
```bash
curl -sI https://hub.sjp-dev.net/smmb/index.html | grep -Ei 'content-security|strict-transport'
docker exec smmb-edge-proxy-1 nginx -t
```

**DoD:** ✅ ไม่มี CSP violation · ✅ header เป็น `Content-Security-Policy` · ✅ HSTS 1 วัน · PWA ติดตั้งได้ (ยืนยันตอนเดิน 5 flow)

**⚠️ ติดตาม:** commit `deploy/nginx-hub.conf` เข้า repo (ตอนนี้อยู่นอก git) ไม่งั้น config จริงหายได้เมื่อเปลี่ยนเครื่อง

### S-04 🔴 โดเมนจริง + QR (ปิด W-04 — รอผู้ใช้ตัดสิน)

- ตัดสินโดเมนหลัก/โดเมนสั้นสำหรับ QR
- ตั้งบนเซิร์ฟเวอร์: `PUBLIC_BASE_URL`, `QR_ALLOWED_HOSTS` ใน `/opt/smmb/backend/.env`
- `sudo systemctl restart smmb-backend`
- พิมพ์ QR ตู้ทดสอบ 1 ใบ สแกนด้วยมือถือจริง

**DoD:** ระบุโดเมนใน env + สแกน QR จริงผ่าน

### S-11 🟠 ทดสอบ Web Push บนมือถือจริง (ปิด W-11)

- Android Chrome (ติดตั้ง PWA) และ iPhone Safari (Add to Home Screen)
- ทดสอบ SOS: จอเปิด / จอปิด / เครื่องหลับ → จดวินาทีถึงมือถือ
- ทดสอบ “ส่งข้อความทดสอบ” ในหน้าตั้งค่าแจ้งเตือน

**DoD:** ตาราง 2 เครื่อง × 3 สถานะ พร้อมตัวเลขวินาที

### S-01 🔴 bench test บอร์ดจริง (ปิด W-01)

- ทำตามเช็กลิสต์ 12 ข้อใน `docs/HARDWARE_FIRMWARE_GUIDE.md §8`
- เก็บ `wake_ms`, long-poll ที่เราเตอร์ตัด, QR กลางคืน/แดดจ้า, ความร้อน/แบต, เสียง buzzer
- ระบุข้อที่ไม่ผ่าน + แผนแก้

**DoD:** ตารางผล 12 ข้อพร้อมตัวเลขจริง

---

## 4. ยังไม่ยืนยัน (ต้องเก็บหลักฐานเพิ่ม — อย่าถือว่าผ่าน)

| ข้อ | สถานะ |
|---|---|
| Flash บอร์ดจริงสำเร็จหรือยัง | หลักฐานล่าสุด 28 ต.ค. บอกล้มเหลว — ยังไม่ได้ลองซ้ำ |
| ระยะเวลาเก็บ log / privacy policy | ใส่ค่า retention ในโค้ดแล้ว (W-10) แต่ยังไม่มี privacy policy/ข้อตกลงฉบับใหม่ |
| Redis จริงใน production ทน restart ได้แค่ไหน | health up แต่ไม่ได้ทดสอบfailover · โค้ดมี memory fallback แล้ว (ยังไม่ทดสอบกับ Redis จริงที่ล่ม) |
| พฤติกรรม long-poll เมื่อเราเตอร์ตัดที่ 30/60 วิ | ต้องวัดกับบอร์ดจริง (W-01) |
| Snapshot 30 วันแล้วลบจริง | มี migration + scheduler แล้ว · ยังไม่มีหลักฐานจาก production (S-19) |
| การกู้คืนจาก backup | ยังไม่เคยซ้อม (W-05) |

---

## 5. ลำดับที่แนะนำ

**รอบ 0 — เก็บกวาดในเครื่อง (เสร็จ 10 พ.ย. 2026)**
W-08 (frontend lint) ✅ → W-09 (advisory lock) ✅ → W-13 (README) ✅ → W-16 (mock:clean) ✅ → W-12 (banner) ✅ → W-15 (allowlist) ✅ → W-17 (diagnostics) ✅

**รอบ 0.5 — UX/โฟลวทุกโหมด (เสร็จ 10 พ.ย. 2026, ยังไม่ commit)**
P0/P1 จาก audit (§3.1) ✅ → migration 0034–0036 ✅ → build/lint/test เขียว ✅

**รอบ 1 — ปิดช่อง "เทสต์ผ่านแต่ของจริงพัง" (1–2 วัน)**
S-02 (ซ้อม rollback เท่านั้น — deploy ผ่านแล้ว `05e540b`) → S-19 (ตรวจ migration/health หลัง deploy) → S-05 (backup+restore) → S-06 (monitor) → tag `v0.1.0` + อัปเดต CHANGELOG

**รอบ 2 — มั่นใจก่อนเปิดบ้านนำร่อง (3–5 วัน)**
W-03 (Playwright 5 เส้น) → W-07 (e2e ใน CI) → S-11 (push มือถือจริง) → U-01 (false-empty)

**รอบ 3 — ของจริง + กฎหมาย**
S-01 (bench test บอร์ด) → S-04 (โดเมน) → W-10 (privacy policy/ข้อตกลง) → S-18 ✅ (CSP/HSTS เปิดแล้ว)

**เก็บกวาดต่อเนื่อง:** W-14 (tag/version), HSTS 1 ปี, U-02…U-09

---

## 6. วิธีตรวจซ้ำ

```powershell
# ตรวจสุขภาพทั้งชุด (เขียนรายงานที่ reports/)
node scripts/project-guardian.mjs --full

# ตรวจ drift ระหว่าง production กับ HEAD
npm --prefix frontend run build:hub
(Invoke-WebRequest https://hub.sjp-dev.net/smmb/ -UseBasicParsing).Content -match 'main-[A-Z0-9]+\.js'
Get-ChildItem frontend\dist\smmb-web\browser -Filter 'main-*.js'

# ตรวจแบบรวม drift (ต้อง build ก่อน)
$env:GUARDIAN_DEPLOY_URL='https://hub.sjp-dev.net/smmb'; node scripts/project-guardian.mjs --full

# frontend lint / ล้าง mock db
npm --prefix frontend run lint
npm --prefix backend run mock:clean -- --dry-run

# health production
Invoke-WebRequest https://hub.sjp-dev.net/smmb-api/api/health -UseBasicParsing | Select-Object -Expand Content
```

> หมายเหตุ: `reports/` อยู่ใน `.gitignore` — รายงานดิบจะไม่ติดไปกับ repo จึงต้องสรุปผลลงเอกสารนี้ทุกครั้ง


