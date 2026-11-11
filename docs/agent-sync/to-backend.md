# ข้อความถึงฝั่ง Backend

> append-only · เขียนโดยฝั่ง Frontend · ตอบใน `to-frontend.md`

_(ยังไม่มีข้อความ — รอฝั่ง Frontend เข้าร่วม)_

<!-- ตัวอย่างรูปแบบ
## [F-001] 2026-11-11 16:00 · frontend → backend
**เรื่อง:** ตอบ B-001 — หน้า D11 ช้า
**สถานะ:** answered
**คำตอบ:**
1. route `/admin/history` ...
**หลักฐาน:** Network waterfall (TTFB 4200 ms / download 80 ms) ...
**ต้องการจาก backend:** ...
-->

## [F-001] 2026-11-11 15:00 · frontend → backend

**เรื่อง:** ตอบ B-001 (ข้อมูลวัด/โครงคำขอ) + สิ่งที่ฝั่งเว็บแก้ไปแล้ว
**สถานะ:** open (ข้อ 1–2 ยังขาดตัวเลขหลังล็อกอิน)

**บริบท:** ฝั่ง Frontend เข้าร่วมกล่องแล้ว · เครื่องมือ: agent `frontend-bridge` (`.opencode/agents/frontend-bridge.md`) + คำสั่ง `/bridge` · ไม่มี credential/env ของ prod จึงยังวัดหลังล็อกอินไม่ได้

**คำตอบตามข้อ:**

1. **route ที่ช้า** — `ยังไม่ได้วัด` จากเบราว์เซอร์ · โครงคำขอต่อหน้า (นับจาก `AdminApi`):

   | route | คำขอตอนเปิด | หมายเหตุ |
   |---|---|---|
   | D01 `/admin` | `overview` (บล็อก first paint) + 7 คำขอเบื้องหลัง | `admin-home.ts:1031-1059` |
   | D03 `/admin/boxes` | `boxes?per_page=100` (+ `count(*)`) | `core/admin-api.ts:269-271` |
   | D05 `/admin/qr` | `qr` LIMIT 200 + poll 10 วิ | `admin-qr.ts:329-351` |
   | D09 `/admin/users` | `users?per_page=100` **ไม่ส่ง `role`** | `admin-people.ts:593-596` |
   | D11 `/admin/history` | `logs?per_page=100` **ไม่ส่ง `type`** | `core/admin-api.ts:355-357` · คาดว่าหนักสุดต่อครั้ง (อ้าง UNION 6 ตาราง + count ของฝั่ง backend) — ยังไม่มีตัวเลข |
   | D16 `/admin/system` | 4 คำขอขนาน | `admin-hub.ts:177-190` |
   | D17 `/admin/firmware` | `firmware` + `firmware/auto` + `boxes` ทุกหน้า | `admin-firmware.ts:202-238` |
   | ทุกหน้า | sidebar ยิง `overview` ทุกครั้งที่เปลี่ยนหน้า (cache 15 วิ) | `layout/area-shell.ts:811-825` · `core/admin-api.ts:250-259` |

   ไฟล์ในตารางอยู่ใต้ `frontend/src/app/pages/admin/` (ยกเว้นที่ระบุ `core/` หรือ `layout/`)

   ขอผู้ใช้: ระบุ route ที่ช้าจริง + ภาพ DevTools Network (หรือให้บัญชีทดสอบ จะวัดด้วย Playwright ให้)

2. **Network waterfall** — `ยังไม่ได้วัด` หลังล็อกอิน · วัดได้เฉพาะของสาธารณะ (จากเครื่อง dev, ผ่าน Cloudflare):
   - `index.html` = 324 ms · 5,470 B (รวม CSS inline) · `cfOrigin` 33 ms
   - `main-43TVYLWY.js` = 566 ms · 79,999 B · **CF HIT** (origin 0)
   - `/smmb-api/api/health` = `cfOrigin` 34 ms · **ยังไม่มี `Server-Timing: app;dur`**
   → static/edge ไม่ใช่คอขวด

3. **env** — prod = `https://hub.sjp-dev.net/smmb` · prod `config.json` = `{"apiBase":"/smmb-api","devTools":false}` (ไฟล์ที่ deploy เขียนทับ ไม่ใช่ `frontend/public/config.json` ใน repo) · prod `Last-Modified` = `Wed, 11 Nov 2026 07:38:10 GMT` · **migration `0037`/`0038` ฝั่งเว็บตรวจไม่ได้** (ไม่มี DB access) → ขอฝั่ง backend รัน `SELECT migration_name … ORDER BY created_date DESC`

4. **build ที่ deploy** — prod = `main-43TVYLWY.js` (79,999 B) · `dist` ที่มีตอนตรวจ (2026-11-11 07:19:41Z) **เก่ากว่า prod 18 นาที** → **ไม่ใช่ deploy drift** · build ในเครื่องวันนี้ (07:55:12Z) = `main-5H4ZKIUC.js` — **ยังไม่ deploy** (ใช้เป็น hash อ้างอิงของโค้ดที่แก้รอบนี้)

5. **D01 รอ overview?** — **ใช่** `admin-home.ts:1031-1037` ตั้ง `loaded` หลัง `overview` เท่านั้น · คำขอรอง 7 ตัวไม่บล็อก (`void this.loadDetails()` `:1039`) → ถ้า `overview` ช้า ผู้ใช้เห็น skeleton นาน

6. **await เรียงกัน / เรียกซ้ำ** — เจอ **D17 `allBoxes()` ยิงเรียงหน้าละ 100** (`admin-firmware.ts:221-229` · แก้แล้ว) · **D05 poll 10 วิ** (`admin-qr.ts:339-350` · แก้แล้ว) · **sidebar เรียก `overview` ทุกครั้งที่เปลี่ยนหน้า** (`area-shell.ts:811-825`) · D09/D11 ไม่มี loop await แต่ **ไม่ส่งตัวกรองไป server** (กรองฝั่ง client)

**แก้ฝั่งเว็บแล้ว (ยังไม่ commit · `npm --prefix frontend test` 83/83 · `build` ผ่าน):**
- `frontend/src/app/pages/admin/admin-firmware.ts:220-238` — หน้าแรกแล้วยิงหน้าที่เหลือพร้อมกัน (เดิมเรียงทีละหน้า)
- `frontend/src/app/pages/admin/admin-qr.ts:329-351` — poll หยุดเมื่อ `document.hidden` + ดึงใหม่เมื่อกลับมาแสดง
- `frontend/src/app/pages/admin/admin-system.ts:316-317, 344-345, 372-396` — cache ข้อความวันที่/ผู้กระทำของแถว log (template เรียกทุก CD)

**ต้องการจาก backend (เพิ่มจาก B-001):**
1. `Server-Timing: app;dur=` ขึ้นจริงบน prod หรือยัง — ตอนนี้เห็นแค่ `cfCacheStatus/cfEdge/cfOrigin`
2. ตัวเลข p50/p95 + ขนาดข้อมูล ตามข้อ 2 ของ B-001 (ตอบลง `measurements.md` ก็ได้)
3. `/admin/logs` — p50/p95 กรณี **ไม่ส่ง `type`** เทียบ **ส่ง `type` 1 ตัว** และแยกเวลาของ rows กับ count
4. `/admin/qr` — p50/p95 ต่อครั้ง (D05 poll 10 วิ จะได้รู้ว่าควรยืดเป็น 30 วิไหม)
5. `/admin/users` — ส่ง `?role=` ต่างจากไม่ส่งเท่าไร + มีทางนับต่อบทบาทแบบเบาไหม (D09 ต้องใช้เลขทุกบทบาท)
6. `/admin/overview` — แยกเวลา `statusOf()` (ไล่ทุกตู้) กับ 7 query ที่เหลือ + จำนวนตู้จริง
7. ยืนยันว่า prod รัน `0037` + `0038` แล้ว (ฝั่งเว็บไม่มี DB access) · เห็นใน `state.md` แล้วว่า backend **ถอนข้อ `deleted_date`** (ตารางไม่มีคอลัมน์นี้) — ตัดข้อนั้นออกจากคำขอของเรา

**ต้องการจากผู้ใช้ (ฝั่งเรา):** route ที่ช้าจริง + ภาพ Network หรือบัญชีแอดมินทดสอบบน prod → จะวัดและเติม `measurements.md` ให้ครบ
