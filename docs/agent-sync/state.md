# สถานะร่วม — Admin โหลดช้า

> อัปเดตล่าสุด: 2026-11-11 (backend) · แก้เฉพาะหัวข้อของตัวเอง

## แผนร่วม (ตกลงแล้ว)

| # | งาน | เจ้าของ | สถานะ |
|---|---|---|---|
| 1 | ระบุหน้าจอ/route ที่ช้าจริง + เวลาต่อคำขอ (Network waterfall) | frontend | ⏳ รอข้อมูล/บัญชีทดสอบ |
| 2 | วัดเวลาฝั่งเซิร์ฟเวอร์ต่อ endpoint (`Server-Timing` + slow log) | backend | ✅ เขียนแล้ว · รอ deploy |
| 3 | ตรวจว่า prod รัน migration `0037`/`0038` + build frontend ล่าสุด (deploy drift) | frontend + ผู้ใช้ | ✅ build ไม่ใช่ drift (prod ใหม่กว่า dist 18 นาที) · ⏳ รอ SQL บน prod |
| 4 | แก้คอขวดตามหลักฐานที่วัดได้ | ทั้งคู่ | 🟡 แก้ logs/index แล้ว · รอวัด |

## ฝั่ง Backend

- สถานะ: กำลังเพิ่มเครื่องมือวัด + ตรวจ SQL ของ endpoint แอดมิน
- 2026-11-11: liaison ตรวจ B-001 กับโค้ดจริง — **หลักฐาน 6/6 ถูก** หลังแก้ 2 จุด
  - แก้ชื่อตาราง migration: จริงคือ `app.migration_tb` (`backend/src/db/migrate.ts:19-23`) ไม่ใช่ `schema_migration`
  - ระบุขอบเขต `fb0c401` ให้ครบ 3 อย่าง: split load · cache 15 วิ · index `0037`
- ยืนยันแล้วว่าขาด index `created_date` เดี่ยว:
  - `scan_log_tb` มีแต่ composite `(box_id|box_qr_code_id|user_id, created_date)` — `0008_scan_log.sql:20-22`
  - `data_access_log_tb` มีแต่ `(subject_kind, subject_id, created_date)` — `0003_agency_admin.sql:15`
  - `terms_acceptance_tb` ไม่มี index เลย — `0001_init.sql` (เฉพาะตาราง)
- D01 (`frontend/src/app/pages/admin-home.ts`): `await overview()` ก่อน แล้วค่อย `loadDetails()` = `Promise.all` 7 คำขอ → **ไม่บล็อก first paint** (คำถาม B-001 ข้อ 5 ฝั่ง frontend ตอบครึ่งหนึ่งแล้ว)
- 2026-11-11 (รอบ 2 — แก้โค้ด ยังไม่ commit/deploy):
  - `backend/src/app-setup.ts` — `serverTiming()`: header `Server-Timing: app;dur=<ms>` ทุกคำขอ + log คำขอ ≥ `SLOW_REQUEST_MS` (300 ms, log เฉพาะ path ไม่มี query) + ข้าม long-poll ตู้
  - `backend/sql/migrations/0038_admin_log_indexes.sql` — `created_date DESC` index 3 ตารางที่ขาด
  - `backend/src/admin/admin-logs.service.ts` — เขียนใหม่: branch ละ type · `LIMIT (offset+per_page)` ต่อ branch ก่อน UNION · total = บวก count ต่อ branch
  - **ถอนข้อกล่าวอ้าง `deleted_date`** — `box_tb` ไม่มีคอลัมน์นี้ · ลบตู้เป็น hard delete `admin-box.service.ts:388`
- ยังไม่มีตัวเลข p50/p95 — เครื่อง dev ไม่มี Postgres/Docker · ต้องวัดหลัง deploy
- 2026-11-11 (รอบ 3 — วัดบน mock): ใส่ `scan_log_tb` 50,000 แถว แล้ววัด
  - `logs` หน้า 1 = 24.9/26.1/27.7 ms · `type=scan` = 18.1/20.7/34.0 ms · หน้า 2 = 29.6–46.1 ms · `overview` = 29.6–36.4 ms (PGlite, คอนเนกชันเดียว)
  - SQL เดียวกัน: rows เก่า 73.9 ms → branch ใหม่ 8.2 ms · count 9.6 → 9.2 ms
  - ตรวจความถูกต้อง: total 16 = ผลรวม count ต่อตาราง · type filter = 4 · หน้า 2 ไม่ซ้ำ
  - build/lint ผ่าน · unit test 86/86
- ต้องรอจาก frontend/ผู้ใช้: หน้าจอที่ช้า + TTFB + ผล SQL บน prod

## ฝั่ง Frontend

- สถานะ: เข้าร่วมแล้ว 2026-11-11 · ตอบ `B-001` ใน `F-001`
- พบ/แก้แล้ว (ฝั่งเว็บ, ยังไม่ commit · test 83/83 · build ผ่าน):
  - D17 `frontend/src/app/pages/admin/admin-firmware.ts:220-238` — เดิมยิง `boxes` เรียงทีละหน้า → ยิงขนานหลังรู้ `total`
  - D05 `frontend/src/app/pages/admin/admin-qr.ts:329-351` — poll 10 วิ ไม่หยุดตอนซ่อนแท็บ → หยุดเมื่อ `document.hidden`
  - D11 `frontend/src/app/pages/admin/admin-system.ts:316-317, 344-345, 372-396` — จัดรูปแบบวันที่ใหม่ทุก CD → cache ต่อแถว
- ตัดออกได้แล้ว: static/edge ไม่ใช่คอขวด (index 324 ms / main 566 ms, CF HIT) · ไม่ใช่ deploy drift (prod ใหม่กว่า dist ที่มีตอนตรวจ 18 นาที)
- โครงคำขอต่อหน้า: D01 = 1 บล็อก + 7 เบื้องหลัง · D03/D09/D11 = 1 ต่อหน้า (D09/D11 ไม่ส่งตัวกรองไป server) · D05 = 1 + poll 10 วิ · D16 = 4 ขนาน
- **ต้องรอ:** route ที่ช้าจริง + Network waterfall (ผู้ใช้) หรือบัญชีทดสอบ prod · คำตอบเวลา p50/p95 จาก backend (หลัง deploy 0038 + Server-Timing)
- ข้อจำกัด: ไม่มี DB access → ตรวจ migration `0037`/`0038` บน prod เองไม่ได้
