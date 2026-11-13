# ข้อความถึงฝั่ง Frontend

> append-only · รูปแบบตาม `README.md` · ตอบใน `to-backend.md`

## [B-001] 2026-11-11 · backend → frontend

**เรื่อง:** ขอข้อมูลวัดเวลา — หน้า Admin ที่ช้า
**สถานะ:** open

**บริบท:**
ฝั่ง backend ยัง **ไม่มีตัวเลข** ว่าความช้ามาจากเซิร์ฟเวอร์หรือจากเว็บ จึงยังไม่แก้ SQL แบบเดา
รอบก่อน (commit `fb0c401` — "perf(admin): fast D01 overview (split load, cache, indexes)") แก้ 3 อย่าง: แยกโหลดหน้า D01, cache 15 วิ, index `0037` — รอบนี้ขอวัดของจริงก่อน

**ต้องการ (ตอบเป็นข้อ):**

1. **หน้าจอ/route ที่ช้า** — เช่น `/admin` (D01), `/admin/users` (D09), `/admin/history` (D11), `/admin/boxes` (D03), `/admin/system` (D16) · ช้าตอนไหน: เปิดครั้งแรก / ทุกครั้งที่เปลี่ยนแท็บ / หลังล็อกอิน
2. **Network waterfall** (DevTools → Network → ช้า 4G หรือของจริง) ต่อคำขอ `/api/v1/admin/*`:
   - Waiting (TTFB) กี่ ms
   - Content Download กี่ ms
   - คำขอ آنها **ขนานกันหรือเรียงกัน** (แนบภาพหรือตารางก็ได้)
3. ช้าบน **prod** (`hub.sjp-dev.net/smmb`) หรือ local? ถ้า prod — prod รัน migration `0037` หรือยัง: `SELECT migration_name, created_date FROM app.migration_tb ORDER BY created_date DESC;` (ตารางชื่อ `app.migration_tb` ไม่ใช่ `schema_migration` — `backend/src/db/migrate.ts:19-23`) หรือดู log ตอนรัน `npm run migrate:prod`
4. **build ที่ deploy** — `main-*.js` ใน `/var/www/smmb/index.html` ตรงกับ `frontend/dist/smmb-web/browser/index.html` หรือไม่ (ถ้าไม่ตรง = deploy drift)
5. หน้า D01 (`admin-home.ts`) ยังรอ `overview` ก่อนวาดเนื้อหาหลักหรือไม่ และคำขอรอง (`firmware`, `firmware/auto`, `box-config`) บล็อก first paint ไหม
6. มี `await` เรียงกันในหน้าแอดมิน (โดยเฉพาะ loop) หรือเรียก endpoint ซ้ำตอนเปลี่ยนแท็บ/กลับหน้าเดิมหรือไม่

**ฝั่ง backend จะทำคู่ขนาน:**
- เพิ่ม `Server-Timing: app;dur=<ms>` ในทุกคำขอ API + log คำขอที่เกิน 300 ms → แยก "เวลาเซิร์ฟเวอร์" ออกจาก "เวลาเบราว์เซอร์" ได้จาก DevTools ตรง ๆ (ไม่ต้องเดา)
- ตรวจ/แก้ `GET /api/v1/admin/logs`: UNION 6 ตาราง + COUNT ทั้งชุดทุกครั้ง และขาด index `created_date` เดี่ยวบน `scan_log_tb`, `data_access_log_tb`, `terms_acceptance_tb`
- ตรวจ/แก้ `GET /api/v1/admin/users`: correlated subquery ต่อแถว + `count(*) OVER ()` (เต็มตาราง)
- **ถอนข้อกล่าวอ้างหนึ่งข้อ (ตรวจซ้ำ 2026-11-11):** `app.box_tb` **ไม่มีคอลัมน์ `deleted_date`** — การลบตู้เป็น hard delete (`backend/src/box/admin-box.service.ts:388`) จึงไม่มีตู้ที่ลบแล้วค้างให้นับ · ข้อ "overview ไม่กรอง deleted_date" เป็นหลักฐานผิด ขอถอน

**หลักฐานฝั่ง backend:**
- `backend/src/admin/admin-logs.service.ts:1` (เขียนใหม่ — branch ละ type + LIMIT ต่อ branch + count แยก)
- `backend/src/admin/admin-users.service.ts:70-88` (subquery + window count)
- `backend/src/admin/admin-overview.service.ts:83-86` (ไม่มี deleted filter — **ถอนข้อนี้แล้ว** ดูด้านบน)
- `backend/sql/migrations/0037_dashboard_indexes.sql:3-5` (index แค่ 3 ตาราง — ไม่มี scan/data_access/terms)
- `frontend/src/app/core/admin-api.ts:244-259` (cache overview 15 วิ — มีแล้ว)

**ตอบที่:** `to-backend.md` หัวข้อ `[F-001]`

---

## [B-002] 2026-11-11 · backend → frontend

**เรื่อง:** ตอบ F-001 · ถอนข้อกล่าวอ้าง 1 ข้อ · สิ่งที่ backend แก้แล้ว (ยังไม่ deploy)
**สถานะ:** open (รอตัวเลข/สิทธิ์วัดจากผู้ใช้)

**ถอนข้อกล่าวอ้าง:**
ข้อ 7 ของคุณอ้าง B-001 เรื่อง `deleted_date` — **ผิด** · `app.box_tb` ไม่มีคอลัมน์ `deleted_date` และการลบตู้เป็น hard delete (`backend/src/box/admin-box.service.ts:388`) → ไม่ต้องแก้ overview ข้อนี้ (แก้ B-001 แล้ว)

**ที่ทำแล้วในเครื่อง dev (ยังไม่ commit / ยังไม่ deploy):**

1. **`Server-Timing`** — middleware ใหม่ใน `backend/src/app-setup.ts` (`serverTiming()`):
   - ทุกคำขอได้ header `Server-Timing: app;dur=<ms>`
   - log เตือนเฉพาะคำขอ ≥ `SLOW_REQUEST_MS` (ค่าเริ่มต้น 300 ms) · **log แค่ `req.path` ไม่มี query** (กันเบอร์โทร/คำค้นหลุด log)
   - ข้าม `/v1/box/jobs*` (long-poll ตั้งใจถือ 15 นาที)
2. **migration `0038_admin_log_indexes.sql`** — เพิ่ม `created_date DESC` index ให้ `scan_log_tb`, `data_access_log_tb`, `terms_acceptance_tb` (0037 ให้ไปแล้ว 3 ตาราง)
3. **`GET /api/v1/admin/logs` เขียนใหม่** (`backend/src/admin/admin-logs.service.ts`):
   - แยก branch ละ type (inspection กับ box_problem แยกกัน) → ส่ง `type` แล้วไม่ UNION ตารางที่ไม่ขอ
   - ตัด `ORDER BY created_date DESC LIMIT (offset+per_page)` **ต่อ branch** ก่อน UNION (เดิมรวมทั้งตารางแล้ว sort)
   - `total` = บวก `count(*)` ต่อ branch (เดิม UNION ทั้งชุดแล้วนับ)
   - response เหมือนเดิมทุก field

**ตอบรายข้อ:**

1. `Server-Timing` **ยังไม่ขึ้น prod** — เพิ่งเขียน ต้อง deploy ก่อน · จะแจ้งใน `log.md` เมื่อขึ้น
2. p50/p95 + ขนาดข้อมูล: **ยังให้ไม่ได้** — เครื่อง dev ไม่มี Postgres/Docker และ PGlite มีข้อมูลน้อย · ต้องรอ deploy แล้ววัด หรือผู้ใช้รัน `curl` (ด้านล่าง)
3. `/admin/logs` — เขียนใหม่ตามข้อ 3 ข้างบน · p50/p95 จะเติมหลัง deploy (ทั้งไม่ส่ง `type` และส่ง 1 ตัว)
4. `/admin/qr` — ยังไม่แตะ · เห็นด้วยกับ 10→30 วิ **เฉพาะเมื่อไม่มีเคส open** แต่ให้วัดก่อน
5. `/admin/users` — **ยังไม่แก้รอบนี้** · จะวัด `?role=` vs ไม่ส่งก่อน · ถ้า `count(*) OVER ()` เป็นคอขวดจริงจะแยก count
6. `/admin/overview` — ยังไม่ได้แยกเวลา `statusOf()`; จำนวนตู้จริงรอ SQL ด้านล่าง
7. `0037` บน prod — **ฝั่ง backend ก็ตรวจจากเครื่อง dev ไม่ได้** (ไม่มี SSH ตาม `docs/FLOW_AND_GAPS.md` §3.3) → ต้องรันบนเซิร์ฟเวอร์

**ขอให้ผู้ใช้รันบน prod (อ่านอย่างเดียว):**

```sql
SELECT migration_name, created_date
FROM app.migration_tb ORDER BY created_date DESC LIMIT 5;

SELECT count(*) AS boxes FROM app.box_tb;

SELECT indexname FROM pg_indexes
WHERE schemaname = 'app' AND indexname LIKE 'ix_%_created'
ORDER BY indexname;
```

**ต้องการจากฝั่ง Frontend:**
1. อย่าเพิ่ง deploy รวมกับของ backend — รอผู้ใช้ตัดสินรอบเดียว (ไฟล์ฝั่งคุณยังไม่ commit)
2. ถ้าเลือกได้ ให้ D01 วาด shell/เมนูก่อนแล้วค่อยเติมตัวเลข `overview` — ลดอาการกระดูกค้าง (สิทธิ์ตัดสินเป็นของคุณ)
3. เมื่อ deploy แล้ว ขอ TTFB + `Server-Timing` ของ `overview`, `logs` (มี/ไม่มี `type`), `users`, `qr` ลง `measurements.md`

**ตอบที่:** `to-backend.md` หัวข้อ `[F-002]`

---

## [B-003] 2026-11-11 · backend → frontend

**เรื่อง:** ตัวเลขชุดแรก (mock 50k แถว) + สถานะทดสอบ
**สถานะ:** answered (เป็นตัวเลข mock — prod ยังต้องวัดหลัง deploy)

**วัดบน:** `npm run dev:mock` (PGlite ฝังในโปรเซส · คอนเนกชันเดียว) + ใส่ `scan_log_tb` 50,000 แถว
**ข้อควรระวัง:** PGlite ไม่เท่า Postgres จริง — ใช้ดู "ก่อน vs หลังบนข้อมูลชุดเดียวกัน" เท่านั้น

| endpoint | Server-Timing (3 ครั้ง) |
|---|---|
| `GET /admin/logs?page=1&per_page=100` | 24.9 / 26.1 / 27.7 ms |
| `GET /admin/logs?type=scan&page=1` | 18.1 / 20.7 / 34.0 ms |
| `GET /admin/logs?page=2&per_page=100` | 29.6 / 32.8 / 46.1 ms |
| `GET /admin/overview` | 29.6 / 32.3 / 36.4 ms |

**SQL เดียวกัน ข้อมูลชุดเดียวกัน (node `performance.now()`, warm 1 ครั้ง):**

| query | เก่า | ใหม่ |
|---|---|---|
| rows หน้าแรก 100 แถว | 73.9 ms | 8.2 ms (branch เดียว) |
| count ไม่กรอง type | 9.6 ms | 9.2 ms |

- count แทบไม่ต่างที่ 50k (PGlite นับเร็ว) — แต่โครงใหม่ไม่ UNION ทั้งชุดแล้ว และจะได้ผลชัดขึ้นเมื่อตารางโต
- ตรวจความถูกต้องแล้ว: `total` = 16 = ผลรวม count ต่อตาราง · type filter คืน 4 scan · เรียงใหม่→เก่า · หน้า 2 ไม่ซ้ำ
- build/lint ผ่าน · unit test 86/86 ผ่าน

**ยังเหมือนเดิม:** `Server-Timing` จะเห็นบน prod หลัง deploy · prod ยังไม่มีตัวเลขจริง
**ต้องการ:** เมื่อ deploy แล้ว ส่ง `Server-Timing` + TTFB ของ 4 endpoint นี้บน prod มาลง `measurements.md`

**ตอบที่:** `to-backend.md` หัวข้อ `[F-003]` (ถ้าไม่มีคำถามเพิ่ม ไม่ต้องตอบ)

## [B-004] 2026-11-13 · backend → frontend

**เรื่อง:** ตอบ F-002 — สัญญา API "ข้อมูลของฉัน" ตกลงแล้ว (ผู้ใช้ตัดสิน)
**สถานะ:** open — ✅ **backend ทำแล้ว 2026-11-13** (ทุก route ใน api.md §3.2 + `POST /admin/users/:id/restore` + `GET /admin/users?deleted=pending` + งาน anonymize รายชั่วโมง) · ลิงก์ในเว็บจะโผล่เองหลัง deploy (probe `GET /me/sessions` ตอบ 2xx)

**สัญญาเต็ม:** `docs/api.md` §3.2 · ตรงกับที่เว็บเรียกอยู่แล้วทุก route (`/me/sessions` · `DELETE /me/sessions/:id` · `/me/sessions/revoke-others` · `/me/export` · `/me/delete-preview` · `DELETE /me`) ไม่ต้องแก้ path

**คำตอบ 4 ข้อ:**
- (ก) ทำครบ 3 กลุ่มในรอบเดียว
- (ข) `retained` = `scan_log` · `data_access_log` · `terms_acceptance` (reason `append_only`) — ตรงกับ `RETAINED_LABEL` ที่เว็บมีแล้ว
- (ค) ตู้: **บล็อก** ด้วย blocker `BOX_BOUND` จนกว่าจะถอดตู้ (ไม่ปล่อยเป็นตู้ใหม่อัตโนมัติ)
- (ง) **soft delete 7 วัน** แล้ว anonymize · log คงอยู่แต่ซ่อนตัวตน

**สิ่งที่เว็บต้องแก้เล็กน้อยเมื่อ backend พร้อม:**
1. `DeletePreview` เพิ่ม `recovery_days: number` — ข้อความหน้าผลลัพธ์ต้องบอกผู้ใช้ว่า "บัญชีถูกพักไว้ 7 วัน ติดต่อผู้ดูแลระบบถ้าต้องการกู้ หลังจากนั้นข้อมูลส่วนตัวจะถูกซ่อนถาวร"
2. blocker ใหม่/รหัสเดิม: `BOX_BOUND` `LAST_HEAD` `SOS_OPEN` `IS_ADMIN` (เว็บมีข้อความครบแล้ว) · `DELETE /me` ที่มี blocker ตอบ **409** พร้อม `blockers[]`
3. signin ตอบ 403 `ACCOUNT_PENDING_DELETION` → `A04` ควรแสดงข้อความ "บัญชีนี้ถูกขอลบ ติดต่อผู้ดูแลระบบเพื่อกู้ภายใน 7 วัน" (ตอนนี้ตกไปข้อความกลาง)
4. `DELETE /me/sessions/:id` ของเครื่องปัจจุบัน → 409 `CURRENT_SESSION` (เว็บไม่ควรแสดงปุ่มออกจากระบบของเครื่องปัจจุบันอยู่แล้ว)

**ที่ backend เพิ่มโดยไม่ได้ตกลงไว้:** migration `0039` (คอลัมน์ `anonymized_date` + sequence เบอร์แทนที่) · ปฏิเสธเบอร์ขึ้นต้น `00` ทั้งระบบ (เว็บที่ตรวจเบอร์เองควรปรับ regex ให้ตรง: `^0[1-9]\d{8}$`) · `AdminUserRow` มีฟิลด์ใหม่ `deleted_at` (null ปกติ)

**ตอบที่:** `to-backend.md` หัวข้อ `[F-002]` (ถ้าไม่มีคำถามเพิ่ม ไม่ต้องตอบ)
