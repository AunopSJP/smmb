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
| W-03 | 🔴 P0 | ไม่มี browser E2E (Playwright) | ⬜ |
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
| U-01 | P2 | หลายหน้าใช้ “empty” แทน “error” (โหลดพังแล้วขึ้น “ไม่มีข้อมูล”) | 🟡 แก้แล้ว: notification-list, owner-history, admin-boxes, admin-people (คิว+ผู้ใช้), head-zones (มี `app-load-error` + retry) · เหลือ owner-agencies, admin-hub |
| U-02 | P2 | วันที่/เวลา: `DatePipe`/`toLocaleString` ยังใช้ TZ เครื่อง ไม่ fix `Asia/Bangkok` | 🟡 fix จุดหลักแล้ว (owner/admin technician requests, firmware, push diagnostic) · เหลือ sweep ทั้งโปรเจ็ค |
| U-03 | P2 | destructive action ที่ยังไม่มี confirm | 🟡 ปิดบัญชี (D09) + ปิดสิทธิ์/ถอดหัวหน้า (L05) มี confirm · เหลือ firmware auto-update, QR, ถอดบ้านออกโซน |
| U-04 | P2 | easy mode ยังเป็น dead end: D16/ระบบ, D05 QR, ปุ่มจัดการผู้ใช้, เปลี่ยนภาษา/ธีม, ปิดชนิดแจ้งเตือน, ทีม >3 คน | `admin-home.ts`, `registry.ts`, `notif-settings.ts`, `owner-settings.ts`, `head-members.ts` |
| U-05 | P2 | polling ถี่ (1–5 วิ) และไม่หยุดตอนแท็บซ่อน — ควรทำ `liveRefresh` กลาง + `visibilitychange` | หลายหน้า SOS/ตรวจตู้/D04 |
| U-06 | P2 | Service Worker prefetch JS ทุก chunk (~1.7 MB) — ควร lazy เฉพาะ shell | `ngsw-config.json` |
| U-07 | P2 | a11y: focus trap ใน dialog, skip link, `aria-live` ทั้งหน้า SOS, progressbar ไม่มี label, field error เป็นสีอย่างเดียว | `confirm-dialog.ts`, `area-shell.ts`, `owner-sos.ts`, auth forms |
| U-08 | P2 | ไม่มี CSRF token (พึ่ง SameSite/cookie) — ควรเพิ่ม double-submit หรือตรวจ Origin ฝั่ง server | `core/api.ts`, backend guard |
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

**ยังเหลือจากรอบนี้:** ยกเลิกนัดช่าง (เลื่อนนัดได้แล้ว) · composite widget arrow keys (radio/tab) · easy mode แอดมินบนมือถือยังไม่ถึง D16/ตั้งค่าโดยตรง (มีลิงก์ใน D01) · dead code บางส่วน/P2-26

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


