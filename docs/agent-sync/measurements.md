# ตัวเลขวัดเวลา (append-only)

> ทุกแถวต้องบอก **วันที่ · สภาพแวดล้อม · endpoint/หน้า · ตัวเลข · วิธีวัด · ใครวัด**
> ห้ามแก้แถวเก่า — วัดใหม่ให้เพิ่มแถวใหม่

## ฝั่งเซิร์ฟเวอร์ (backend)

| วันที่ | env | endpoint | เวลา | วิธีวัด | ผู้วัด |
|---|---|---|---|---|---|
| 2026-11-11 | mock PGlite · 50,000 scan_log · คอนเนกชันเดียว | `GET /admin/logs?page=1&per_page=100` | 24.9 / 26.1 / 27.7 ms | `Server-Timing: app;dur` ผ่าน curl (3 ครั้ง) | backend |
| 2026-11-11 | เดียวกัน | `GET /admin/logs?type=scan&page=1&per_page=100` | 18.1 / 20.7 / 34.0 ms | `Server-Timing` | backend |
| 2026-11-11 | เดียวกัน | `GET /admin/logs?page=2&per_page=100` | 29.6 / 32.8 / 46.1 ms | `Server-Timing` | backend |
| 2026-11-11 | เดียวกัน | `GET /admin/overview` | 29.6 / 32.3 / 36.4 ms | `Server-Timing` | backend |
| 2026-11-11 | เดียวกัน | เทียบ SQL เก่า/ใหม่ บนข้อมูลชุดเดียว | rows เก่า 73.9 ms → branch ใหม่ 8.2 ms · count 9.6 → 9.2 ms | `performance.now()` ใน node (warm 1 ครั้ง) | backend |

> ⚠️ PGlite (ฝังในโปรเซส · คอนเนกชันเดียว) **ไม่เท่า Postgres จริง** — ตัวเลขนี้ใช้เทียบก่อน/หลังบนข้อมูลชุดเดียวกันเท่านั้น
> ตัวเลข prod ต้องวัดหลัง deploy (จะขึ้นใน `Server-Timing` + log `npm` ของ backend เมื่อเกิน `SLOW_REQUEST_MS`)

## ฝั่งเบราว์เซอร์ (frontend)

| วันที่ | env | หน้า/route | TTFB | download | total | วิธีวัด | ผู้วัด |
|---|---|---|---|---|---|---|---|
| 2026-11-11 | prod `hub.sjp-dev.net/smmb` (ไม่ล็อกอิน) | `/smmb/index.html` | — | — | 324 ms | `Invoke-WebRequest` จากเครื่อง dev (รวม connect) · 5,470 B (รวม CSS inline) · `cfOrigin` 33 ms | frontend |
| 2026-11-11 | prod (ไม่ล็อกอิน) | `/smmb/main-43TVYLWY.js` | — | — | 566 ms | เท่ากัน · 79,999 B · CF HIT (origin 0) | frontend |
| 2026-11-11 | prod (ไม่ล็อกอิน) | `/smmb-api/api/health` | 34 ms | — | — | TTFB = `cfOrigin` จาก header `Server-Timing` · ยังไม่มี `app;dur` | frontend |
| 2026-11-11 | local/prod | `/admin/*` หลังล็อกอิน | — | — | — | **ยังไม่ได้วัด** — ไม่มีบัญชี/env prod | frontend |
