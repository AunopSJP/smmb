# API Reference — SMMB Backend (Smart Mailbox)

> สรุปทุก endpoint ที่**วางแผนไว้** ของระบบ SMMB ณ 2026-10-27 — **ยังไม่มีโค้ด backend** ทุกอย่างในไฟล์นี้คือสัญญา (contract) ร่างแรก
> ใช้คู่กับ [`smmb-design.md`](smmb-design.md) (เหตุผล/โครงสร้างข้อมูล/แผนงาน) และ [`HANDOFF.md`](HANDOFF.md) (สถานะงาน)
> ฝั่งตู้ (ESP32-CAM) ละเอียดอยู่ใน `SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md` — §13 ของไฟล์นี้สรุปไว้ให้อ่านเร็ว ๆ
>
> backend = **NestJS** บนเซิร์ฟเวอร์ Ubuntu ของเราเอง · client = **Angular** (เว็บแอป/PWA ตัวเดียว ทุกบทบาท)
> ทุก path ของเว็บแอปขึ้นต้นด้วย **`/api/v1`** ยกเว้น `/api/health*` และ API ของตู้ (`/v1/box/*` §13)
>
> สัญลักษณ์: ✅ ตัดสินแล้ว (มีในสรุปประชุม/เอกสารตัดสินใจ) · 💡 เสนอ ยังไม่ได้ตกลง · ❓ ต้องตัดสิน · 🧪 ข้อเสนอนอกขอบเขต (มีแค่ใน wireframe)
> ชื่อหน้าจอ (`H03`, `O05`, `L07` …) อ้างอิง wireframe ใน `SMMB Wireframe.figcraft` — ดู [`HANDOFF.md`](HANDOFF.md) §4.1

---

> **2026-10-27 (บ่าย 2)** — แพ็กเกจย้ายไปผูกกับ**บัญชีเจ้าของบ้าน** (เริ่มต้นฟรี) · ยืนยันขอบเขตโซนหัวหน้า · ไรเดอร์แจ้งส่งของได้ทั้ง **สแกน QR หรือกดปุ่มหน้าตู้** (§5, §13.7)
>
> **2026-10-27 (บ่าย)** — เพิ่มแพ็กเกจ (§4.5, §9.7) และขอบเขตโซนของหัวหน้า (§8)
>
> **2026-10-27 ร่างแรก** — ได้จากผัง `SMMB_Flowchart_v11` + `SMMB_ขั้นตอนการใช้งานแต่ละคน.md` + `SMMB_สรุปการตัดสินใจ_2026-10-22.md` + wireframe 110 หน้า
> ถ้า flow ในเอกสารเหล่านั้นเปลี่ยน ให้แก้ไฟล์นี้ตามในรอบเดียวกัน

## 0. กติการ่วม

### auth (เว็บแอป)

- ✅ ล็อกอินด้วย **เบอร์โทร + รหัสผ่าน** · ✅ **ไม่มี OTP** ทั้งระบบ · ✅ ผู้ใช้**รีเซ็ตรหัสเองไม่ได้** (หัวหน้ารีเซ็ตให้ลูกทีม, แอดมินรีเซ็ตให้ทุกคน)
- 💡 ล็อกอินได้ cookie **`sid`** (HttpOnly, Secure, SameSite=Lax) — เว็บแอปกับ API อยู่โดเมนเดียวกัน browser ส่งให้เอง
  (Lax ไม่ใช่ Strict เพราะผู้ใช้เปิดลิงก์จากแจ้งเตือน/LINE แล้วต้องยังล็อกอินอยู่)
- route ที่ไม่ได้ติด `@Public()` ต้องมี session ไม่งั้น **401** พร้อม `code`:

| code | ความหมาย | client ควรทำ |
|---|---|---|
| `NO_SESSION` | ไม่มี cookie | ไปหน้า `A04` ล็อกอิน |
| `SESSION_EXPIRED` | หมดอายุ | ล็อกอินใหม่ แล้วกลับหน้าเดิม |
| `SESSION_REVOKED` | ถูกเตะ (เปลี่ยนรหัส / ถูกรีเซ็ตรหัส / ถูกปิดสิทธิ์) | ล็อกอินใหม่ |
| `ACCOUNT_DISABLED` | บัญชีถูกปิด | แจ้งผู้ใช้ ห้าม retry |
| `ACCOUNT_PENDING` | เจ้าหน้าที่รอหัวหน้ายืนยัน / หน่วยงานรอแอดมิน (ตอบ **403** ไม่ใช่ 401 — ล็อกอินได้ · ตอบเฉพาะ route ของ officer/head · บทบาทอื่นที่มีอยู่แล้ว เช่น owner ใช้ได้ตามปกติ) | หน้า `A11` / `L02` |
| `ACCOUNT_REJECTED` | ถูกปฏิเสธ (403 · เฉพาะ route ของ officer/head เหมือนข้างบน) | หน้า `A11-b` / `L02-b` |

### บทบาทและขอบเขต

- ✅ 5 บทบาท: `admin` · `owner` (เจ้าของบ้าน) · `head` (หัวหน้าหน่วยงาน) · `officer` (เจ้าหน้าที่) · ไรเดอร์ (**ไม่มีบัญชี** ใช้ route `public` อย่างเดียว)
- ✅ เก็บเป็น **Role + Level** — Level ยังไม่ใช้ แต่มีช่องในฐานข้อมูลไว้แล้ว
- ✅ **หัวหน้า = เจ้าหน้าที่ + สิทธิ์จัดการ** → ทุก route ของ `officer` ใช้กับ `head` ได้ด้วย · หน่วยงานมีหัวหน้าได้หลายคน
- ✅ ช่างติดตั้งใช้**บัญชีแอดมิน** (ไม่มีบทบาทช่างแยก)
- ✅ (2026-10-27) **1 เบอร์ 1 บัญชี มีได้หลายบทบาท** (เช่น เจ้าของบ้านที่เป็นตำรวจ) — `Me.roles` เป็น array
  - server ตรวจว่า**มีบทบาทที่ route นั้นต้องใช้**ไหม · ไม่มี "โหมดปัจจุบัน" ใน session — ปุ่มสลับบทบาทอยู่ฝั่งเว็บอย่างเดียว · ขาดบทบาท → 404 (เหมือนนอกขอบเขต) · บทบาทที่ยังรออนุมัติ → 403 `ACCOUNT_PENDING`
  - เจ้าหน้าที่**ตรวจตู้ที่ตัวเองเป็นเจ้าของไม่ได้** (ตอบเหมือนตู้นอกขอบเขต) · SOS **ไม่ส่งถึงเจ้าของบ้านเอง** แม้เป็นเจ้าหน้าที่ในโซนนั้น
  - **แอดมินมีบทบาทอื่นร่วมไม่ได้** (ช่างใช้เบอร์แยก) — ฐานข้อมูลบังคับ
- ✅ ชื่อฟิลด์ใน API เป็นของ API เอง (`id`, `created_at` …) **ไม่ใช่ชื่อคอลัมน์** (`user_id`, `created_date` — design §4) · server แปลงผ่าน mapper ที่ระบุฟิลด์ชัดทุก endpoint ห้ามส่งแถวจากฐานข้อมูลออกตรง ๆ
- ขอบเขตข้อมูล (server กรองเอง client ไม่ต้องส่ง header ขอบเขต):

| บทบาท | เห็น/ทำได้กับ |
|---|---|
| `owner` | ตู้ที่ตัวเองผูกไว้เท่านั้น (เจ้าของ 1 คนมีหลายตู้ได้) |
| `officer` | บ้านใน**โซนที่ตัวเองอยู่** (1 คนอยู่หลายโซนได้) + SOS ที่ถูกส่งมาถึงตัวเอง |
| `head` | ทุกอย่างของ officer + ทุกโซน/สมาชิก/Log ของ**หน่วยงานตัวเอง** |
| `admin` | ทุกอย่าง — แต่การเปิดดูข้อมูลส่วนบุคคลถูกบันทึกลง data access log (§12) |

ทำนอกขอบเขต → **404** (ไม่ใช่ 403 เพื่อไม่บอกว่ามีของอยู่) ยกเว้นที่เขียนไว้ชัดในแต่ละ route

### รูปแบบ error (ทุก status) — 💡

```json
{ "statusCode": 409, "error": "Conflict", "code": "BOX_ALREADY_OWNED",
  "message": "box already bound", "path": "/api/v1/boxes/activate", "timestamp": "2026-10-27T03:00:00.000Z" }
```

`message` เป็น `string[]` เมื่อ validation ล้ม (400) — `code` มีเฉพาะ error ที่ client ต้องแยกหน้าจอ (รายการรวมอยู่ §15)
client **ห้ามเดาจาก `message`** ให้ดู `code` เสมอ (ข้อความอาจเปลี่ยนตามภาษา)

### ภาษา

- 💡 ข้อความ error/แจ้งเตือนจาก server เลือกภาษาตาม `prefs.lang` ของผู้ใช้ (`th` | `en`) — ผู้ใช้ที่ยังไม่ล็อกอินดู header `Accept-Language`
- ข้อมูลที่ผู้ใช้กรอก (ชื่อตู้, หมายเหตุ SOS) ไม่แปล

### เวลา

- ทุกเวลาใน JSON เป็น **ISO 8601 UTC** (`2026-10-27T15:15:00.000Z`) — client แสดงเป็นเวลาไทย
- ยกเว้น**ช่วงเวลาตรวจ**ของโซน ที่เป็นเวลาท้องถิ่น `"HH:mm"` + `tz: "Asia/Bangkok"` (เหมือนที่ส่งให้ตู้)
- ช่วงวันที่ใน query (`from`, `to`) เป็น `YYYY-MM-DD` ตามเวลาไทย รวมวันปลายทาง

### รายการแบบแบ่งหน้า

`?page=1&per_page=20` (per_page สูงสุด 100) → `{ data: T[], page, per_page, total }`

### rate limit — ✅ ตัวเลขที่ใช้ (ผู้ใช้ให้เลือกตามความเหมาะสม 2026-10-27)

| route | เพดาน | เกินแล้ว |
|---|---|---|
| ค่าเริ่มต้น (ต่อ route ต่อ IP) | 100 ครั้ง/นาที | 429 |
| `POST /auth/signin` | 5 ครั้ง/นาที ต่อ IP · รหัสผิด 5 ครั้งใน 15 นาที (signin + change-password รวมกัน) → พักบัญชี 15 นาที | 401 `ACCOUNT_LOCKED` |
| signup / `/me/roles/owner` / `/me/agency/join` | 10 ครั้ง/นาที ต่อ IP (กันเดารหัสกลุ่ม) | 429 |
| พิมพ์รหัสใต้ QR (ทุก route ที่รับ `code`) | ผิด 3 ครั้งติดกัน (ต่อ IP) → รอ 30 วิ · ผิดอีกรอบรอเพิ่มเป็น 2 เท่า สูงสุด 15 นาที · ถูก 1 ครั้งนับใหม่ | 429 `CODE_ATTEMPTS_EXCEEDED` |
| `POST /public/deliveries` + ปุ่มหน้าตู้ (ไรเดอร์) | **5 ครั้ง/ชั่วโมง ต่อตู้** นับรวมทั้ง QR และปุ่ม | 429 `DELIVERY_LIMIT` → หน้า `R03-c` · ปุ่ม: ตู้ได้ `status: "limited"` |
| `GET /inspections/:id/badge` | 4 ครั้ง/นาที ต่อการตรวจ (ขอใหม่ทุก 30 วิ + เผื่อ) | 429 |

**ตัวเลขอื่นที่ใช้ (✅ 2026-10-27)**: session 30 วัน ต่ออายุเมื่อใช้ · รหัสผ่าน 8–128 ตัว · delivery ticket 10 นาที · ไรเดอร์พิมพ์แทนสแกน 3 ครั้งใน 7 วัน = QR น่าสงสัย · หน้ารอตู้/รอ SOS poll ทุก 1 วิ · job ตรวจ 60 วิ · QR ประจำตัวเปลี่ยนทุก 30 วิ · ลองสแกน 3 ครั้ง · เวลาตรวจไม่เกิน 4 ช่วงต่อโซน · แบตต่ำ < 20% · QR ใกล้ครบอายุ ≥ 11 เดือน · ตู้หลุดกลางเวลาตรวจ > 10 นาที · ตู้เงียบ > 26 ชม. · เก็บ log 1 ปี · ค่าตั้งค่าตู้ (§9.5): `scan_timeout_s` 10–60 · `max_attempts` 1–5 · `longpoll_wait_s` 20–55

> ⚠️ **ต้องตั้ง `TRUST_PROXY` ตอนขึ้นเซิร์ฟเวอร์จริง** (มี reverse proxy หน้า NestJS) ไม่งั้น IP ใน log/rate limit เป็น IP ของ proxy หมด

### โดเมน / environment (2026-10-27)

- ตัวอย่างในไฟล์นี้ใช้ `smmb.app` — **ตอน dev ไม่ใช่โดเมนนี้** · ทุกลิงก์ที่ server สร้าง (QR หน้าตู้, QR เปิดใช้ตู้, ลิงก์ในแจ้งเตือน) มาจาก env **`PUBLIC_BASE_URL`**
- ลายเซ็น QR ไม่รวมโดเมน · `POST /inspections` รับ `qr_text` จากโดเมนที่อยู่ใน env **`QR_ALLOWED_HOSTS`** เท่านั้น (นอกนั้น = `QR_NOT_SYSTEM`)
- คีย์ลายเซ็น (QR, รหัสลับตู้) แยกต่อ environment — ของ dev ใช้กับ prod ไม่ได้
- API ตู้: URL ของเซิร์ฟเวอร์ + ใบรับรองที่ปักหมุด ต้องตั้งได้ต่อ environment ในเฟิร์มแวร์ (บอร์ด dev ชี้ dev, บอร์ดจริงชี้ prod)

### ตัวระบุ (id)

| ของ | รูปแบบ | ตัวอย่าง |
|---|---|---|
| ผู้ใช้ | `U-` + เลข | `U-0071` |
| ตู้ | `BX-` + เลข 5 หลัก | `BX-00042` |
| งานปลุกตู้ (job) | `J-` + hex 6 | `J-8f31c2` |
| อื่น ๆ (inspection, sos, zone, agency …) | uuid | — |

`box_id` กับ `job_id` อยู่ในโปรโตคอลตู้และใน QR จึงต้องสั้น ที่เหลือใช้ uuid

---

## 1. Health — `/api/health` (public, ไม่มี version)

| method | path | ตอบ |
|---|---|---|
| GET | `/api/health` | `{ status: "ok"\|"error", uptime, timestamp, services: { postgres: "up"\|"down", redis: "up"\|"down", push: "up"\|"down" } }` — **503** ถ้ามีตัวล่ม |
| GET | `/api/health/live` | `{ ok: true, t }` ตอบทันทีไม่แตะ DB (liveness) |

---

## 2. Auth — `/api/v1/auth`

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| POST | `/auth/signup/owner` | public | `{ name, phone, password, house_no, terms_version }` | 201 + set cookie `sid` → ไปหน้า `A07` ผูกตู้ · 409 `PHONE_TAKEN` · 400 `TERMS_NOT_ACCEPTED` (`A06-b`) |
| POST | `/auth/signup/officer` | public | `{ name, phone, password, group_code, terms_version }` | 201 + cookie · สถานะ `pending` (`A11`) · 404 `GROUP_CODE_INVALID` · 409 `PHONE_TAKEN` |
| POST | `/auth/signup/agency` | public | `{ agency: { name, type: "police"\|"guard"\|"other", contact }, head: { name, phone, password }, terms_version }` — `contact` 3–200 ตัว (บังคับ ✅ 2026-10-27) ช่องทางติดต่อที่ตั้งใจเปิดเผย แสดงให้คนที่ขอเข้าหน่วยงาน | 201 + cookie · หน่วยงานสถานะ `pending` (`L02`) |
| POST | `/auth/signin` | public | `{ phone, password }` | 200 `{ ok: true, data: Me }` + cookie · 401 `INVALID_CREDENTIALS` (`A04-b` — เบอร์ไม่มีบัญชีก็ตอบแบบเดียวกัน) · 401 `ACCOUNT_LOCKED` · 401 `ACCOUNT_DISABLED` (บอกเฉพาะเมื่อรหัสถูก) · 429 `RATE_LIMITED` |
| POST | `/auth/signout` | login | — | 200 ล้าง cookie เครื่องนี้ |
| GET | `/auth/verify` | login | — | 200 `Me` (ด้านล่าง) — client เรียกตอนเปิดแอปและตอนกลับมาที่แท็บ |
| POST | `/auth/change-password` | login | `{ current_password, new_password }` | 200 แล้ว**เตะทุก session** ต้องล็อกอินใหม่ทุกเครื่อง |
| POST | `/me/roles/owner` | login | `{ house_no, terms_version }` | 201 `Me` — คนที่มีบัญชีแล้ว (เช่น เจ้าหน้าที่) เพิ่มบทบาทเจ้าของบ้าน + ได้แพ็ก `free` → ไปหน้า `A07` · 409 `ROLE_EXISTS` · 403 `ADMIN_ROLE_EXCLUSIVE` |
| POST | `/me/agency/join` | login | `{ group_code, terms_version }` | 201 `Me` — คนที่มีบัญชีแล้ว (เช่น เจ้าของบ้าน) ขอเข้าหน่วยงาน · สถานะ `pending` (`A11`) · 404 `GROUP_CODE_INVALID` · 409 `ROLE_EXISTS` (อยู่หน่วยงานแล้ว) · 403 `ADMIN_ROLE_EXCLUSIVE` |

- ✅ สมัครด้วยเบอร์ที่มีบัญชีแล้ว → 409 `PHONE_TAKEN` เหมือนเดิม · หน้าจอบอก "เบอร์นี้มีบัญชีแล้ว — ล็อกอินแล้วเพิ่มบทบาท" แล้วไปใช้สอง route ข้างบน (ไม่ผูกบทบาทใหม่จากหน้าสมัคร เพื่อไม่ให้ใครเอาเบอร์คนอื่นมาสมัครเพิ่มบทบาทได้)

- ✅ (2026-10-27 เขียนแล้ว) signup ทั้ง 3 แบบตอบ **201 + body `Me`** · body มีฟิลด์ที่ไม่ได้ประกาศ → 400
- 💡 ค่าที่เลือกไว้ตอนเขียน (ยังไม่ได้ตกลง — แก้ได้ที่ `backend/src/auth/`):
  - session อยู่ **30 วัน ต่ออายุเองเมื่อใช้งาน** (env `SESSION_TTL_DAYS`) · cookie เก็บ token สุ่ม ฐานข้อมูลเก็บแค่ hash
  - รหัสผิด (signin หรือ change-password) **5 ครั้งใน 15 นาที → ล็อก 15 นาที** (`ACCOUNT_LOCKED`) · ระหว่างล็อกไม่ตรวจรหัสเลย
  - signup / `/me/roles/owner` / `/me/agency/join` **10 ครั้ง/นาที ต่อ IP** (กันเดารหัสกลุ่ม)
  - Redis ล่ม → rate limit และการล็อกบัญชี**ปล่อยผ่าน** (บันทึก warning) เพื่อให้ SOS/ตรวจตู้ยังใช้ได้ — argon2id ยังทำให้เดารหัสช้า
- `phone` เก็บแบบตัดขีด/ช่องว่าง ขึ้นต้น `0` 10 หลัก (`0812345678`) — server normalize ให้ (รับ `+66` นำหน้าด้วย)
- `terms_version` = เวอร์ชันข้อตกลงที่ผู้ใช้เห็นตอนกด "ยอมรับ" (จาก `GET /terms/current`) · ✅ ไม่ยอมรับ = ไม่สร้างบัญชี
- ✅ ข้อตกลงต้องมีข้อความว่า **SOS ไม่ได้แทนการโทร 191**
- รหัสผ่าน 💡 อย่างน้อย 8 ตัว ไม่บังคับอักขระพิเศษ (ผู้ใช้สูงอายุ) — server เก็บ argon2id

```ts
// GET /auth/verify, /me
interface Me {
  id: string;                 // U-0071
  roles: ("owner" | "officer" | "head" | "admin")[];   // ✅ หลายบทบาทได้ · head มีเมื่อ is_head · admin อยู่คนเดียวเสมอ
  levels: Partial<Record<"owner" | "officer" | "admin", number>>;   // ยังไม่ใช้ = 0
  status: "active" | "disabled";   // ทั้งบัญชี
  agency_status: "pending" | "active" | "rejected" | "disabled" | null;   // คำขอ/สถานะในหน่วยงาน (A11 / A11-b / L02)
  name: string;               // ชื่อจริง (เห็นเฉพาะตัวเอง/แอดมิน/หัวหน้าของตัวเอง)
  display_name: string;       // ชื่อที่ใช้แสดงต่อคนอื่น เช่น "ส.ต.ต. สมชาย"
  phone: string;
  agency: { id; name; type; is_head: boolean; contact: string | null } | null;   // officer / head (รวมคนที่รอ/ถูกปฏิเสธ — contact ใช้ในหน้า A11 / A11-b)
  prefs: Prefs;               // §3
  push: { subscribed: boolean };   // เครื่องนี้ (session นี้) มี push subscription แล้วหรือยัง
  must_change_password: boolean;   // หลังหัวหน้า/แอดมินรีเซ็ตรหัส → client พาไปหน้าเปลี่ยนรหัส
  terms_update_required: boolean;  // ข้อตกลงเปลี่ยนแล้วยังไม่กดยอมรับ → หน้า A13
  perm_version: number;       // server เพิ่มทุกครั้งที่บทบาท/โซน/สถานะเปลี่ยน — client ใช้เทียบว่าต้อง refetch
}
```

### ข้อตกลง

| method | path | สิทธิ์ | ตอบ |
|---|---|---|---|
| GET | `/terms/current` | public | `{ version, published_at, body_md }` (`A13`) |
| POST | `/me/terms` | login | `{ terms_version }` — ยอมรับเวอร์ชันใหม่ → 200 `Me` · ไม่ใช่ฉบับปัจจุบัน → 400 `TERMS_NOT_ACCEPTED` (เมื่อข้อตกลงเปลี่ยน ทุก route ตอบ 403 `TERMS_UPDATE_REQUIRED` จนกว่าจะกด — ยกเว้น `verify`, `GET /me`, `signout`, `change-password`, `/me/terms` · `Me.terms_update_required` บอกให้ client ไปหน้า `A13`) |

- ✅ (2026-10-27) **ถูกรีเซ็ตรหัส → ต้องเปลี่ยนก่อน**: `Me.must_change_password = true` และ route อื่นตอบ 403 `PASSWORD_CHANGE_REQUIRED` จนกว่าจะ `change-password` (ยกเว้น route ชุดเดียวกับข้างบน) — รหัสชั่วคราวที่หัวหน้า/แอดมินเห็นจึงใช้งานจริงไม่ได้ · เช็กก่อนข้อตกลง

ทุกครั้งที่ยอมรับ → บันทึก log `terms.accepted` (✅ Log ทั้งหมดต้องมีการยอมรับข้อตกลง)

---

## 3. Me — `/api/v1/me`

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| GET | `/me` | login | — | `Me` |
| PATCH | `/me` | login | `{ display_name?, prefs?: Partial<Prefs> }` | `Me` |
| GET | `/me/notifications` | login | `?page&per_page&unread` | paginated `Notification` (หน้า `H14` / `L09` / `D12`) |
| POST | `/me/notifications/read` | login | `{ ids?: string[] }` — ไม่ส่ง = อ่านทั้งหมด | 200 |

```ts
interface Prefs {
  theme: "light" | "dark" | "system";       // H13-d / O13-b
  lang: "th" | "en";
  text_size: "normal" | "large" | "xlarge";
  simple_home: boolean;                      // หน้าหลักแบบเรียบง่าย (H03-L) — owner เท่านั้น
  night_auto_dark: boolean;                  // ธีมมืดอัตโนมัติ 18:00–06:00 — officer/head เท่านั้น
}
```

- 💡 เก็บ `prefs` ที่ server (ไม่ใช่แค่ localStorage) เพราะ**ภาษาใช้กับข้อความแจ้งเตือน**ที่ server ส่งด้วย และผู้สูงอายุมักให้ลูกหลานตั้งให้จากอีกเครื่อง
- ค่าเริ่มต้น: `theme: system`, `lang: th`, `text_size: normal`, `simple_home: false`, `night_auto_dark: true`

### Web Push — `/api/v1/me/push`

✅ แจ้งเตือนทั้งหมดผ่าน **Web Push (service worker)** · ✅ LINE Notify ปิดบริการแล้ว ใช้ไม่ได้ · ✅ ในเบราว์เซอร์ของ LINE แจ้งเตือนไม่ทำงาน (หน้า `A01` บอกให้เปิดใน Safari/Chrome)

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| GET | `/me/push/vapid-key` | public | — | `{ public_key }` · 503 `PUSH_UNAVAILABLE` ถ้า server ไม่ได้ตั้ง VAPID key |
| POST | `/me/push/subscriptions` | login | `PushSubscriptionJSON` (`{ endpoint, keys: { p256dh, auth }, expirationTime? }`) + `{ device_label? }` | 201 `{ ok: true }` · endpoint เดิม = ย้ายมาเป็นของ session นี้ (ไม่สร้างซ้ำ) · 400 ถ้า endpoint ไม่ใช่ push service ที่รู้จัก |
| DELETE | `/me/push/subscriptions` | login | `{ endpoint }` | 200 · endpoint ของคนอื่น = ไม่เกิดอะไร (ไม่บอกว่ามี) |
| POST | `/me/push/test` | login | — | 202 `{ sent }` ส่งแจ้งเตือนทดสอบ 1 ครั้ง**ถึงเครื่องนี้** (ขั้น "เปิดแจ้งเตือน" `A03`) · ไม่เก็บลงหน้าแจ้งเตือน |

- ✅ (2026-10-27) **subscription ผูกกับ session ของเครื่องนั้น** — ออกจากระบบ / ถูกเตะ / session หมดอายุ → เครื่องนั้นหยุดได้รับแจ้งเตือน (มือถือที่ใช้ร่วมกันไม่เห็น SOS ของคนที่ออกไปแล้ว) · `Me.push.subscribed` = เครื่องนี้ (session นี้) มี subscription · `PUSH_REQUIRED` = ไม่มีเครื่องไหนที่ยังรับได้เลย
- ✅ **endpoint ต้องเป็น https ของ push service ที่รู้จักเท่านั้น** (FCM, Mozilla, Apple, Windows) — server ยิงคำขอไปที่ endpoint นี้ ถ้าไม่จำกัดจะถูกใช้ยิงเข้าระบบภายใน (SSRF) · รายการอยู่ `backend/src/push/push.sender.ts`
- `PUSH_REQUIRED` ใช้เฉพาะเมื่อผู้ใช้ผ่าน route นั้นด้วยบทบาท officer/head เท่านั้น — route ที่รับบทบาทอื่นที่ผู้ใช้มีด้วย (เช่น owner) ไม่บังคับ
- แจ้งเตือนเก็บแค่ `type` + `data` แล้วแปลข้อความตาม `prefs.lang` **ตอนส่งและตอนอ่าน** → เปลี่ยนภาษาแล้วประวัติเปลี่ยนตาม · ข้อความทุก type อยู่ `backend/src/push/messages.ts`

- ✅ **เจ้าหน้าที่/หัวหน้าต้องเปิดแจ้งเตือนก่อนใช้งาน** (ไม่งั้นไม่ได้รับ SOS) → route ของ officer ตอบ **403 `PUSH_REQUIRED`** ถ้าผู้ใช้ไม่มี subscription ที่ยังใช้ได้เลย (`A12`)
- เจ้าของบ้านข้ามได้ แต่ `GET /boxes/:id` มี `warnings: ["push_off"]` ให้หน้าหลักขึ้นแถบเตือน (`H03-b`)
- subscription ที่ push service ตอบ 404/410 → server ลบทิ้งเอง
- iPhone: Web Push ได้เฉพาะเมื่อ**เพิ่มลงหน้าจอหลัก**แล้วเปิดจากไอคอน (หน้า `A02`)

```ts
interface Notification {
  id: string; type: NotificationType; created_at: string; read_at: string | null;
  title: string; body: string;            // แปลตาม prefs.lang แล้ว
  link: string;                           // path ในเว็บแอป เช่น "/sos/…" — ตัวเดียวกับที่อยู่ใน push payload
  data: Record<string, unknown>;          // ตาม type (§14)
}
```

---

### 3.1 ช่องทางติดต่อ (✅ 2026-10-27 — ผู้ใช้กำหนด)

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| GET | `/support` | public | — | `{ contact: string \| null }` ช่องทางติดต่อผู้ดูแลระบบ — แสดงใน `A04` (ลืมรหัส) · `A07-c` · `L02-b` |
| PUT | `/admin/settings/support-contact` | `admin` | `{ contact }` 1–500 ตัว | `{ contact }` (หน้า `D01`) |
| PATCH | `/agency` | `head` | `{ contact }` 3–200 ตัว | `{ contact }` แก้ช่องทางติดต่อของหน่วยงาน (หน้า `L03`) |

- ช่องทางติดต่อเป็นข้อมูลที่**เจ้าของตั้งใจเปิดเผย** (กรอกเอง) แยกจากเบอร์ล็อกอิน — เบอร์ล็อกอินยังเห็นข้ามบทบาทได้เฉพาะตอน SOS (§11)
- หน่วยงาน: กรอกตอนสมัคร (`/auth/signup/agency`) หรือแอดมินใส่ตอนสร้าง (`POST /admin/agencies`) → คนที่ขอเข้าเห็นใน `Me.agency.contact`

---

## 4. ตู้ของเจ้าของบ้าน — `/api/v1/boxes` · `owner`

### 4.1 ผูกตู้ (Activate)

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| POST | `/boxes/activate` | `owner` | `{ qr_text }` (สแกน — ลิงก์ `https://smmb.app/a/<16 ตัว>`) **หรือ** `{ code }` (พิมพ์รหัสใต้ QR) | 200 `{ box: BoxSummary, needs_name: true }` → หน้า `A08` · 404 `QR_INVALID` (`A07-b`) · 409 `BOX_ALREADY_OWNED` "ตู้ถูกผูกแล้ว กรุณาติดต่อผู้ดูแล" (`A07-c`) · 429 `CODE_ATTEMPTS_EXCEEDED` |
| PATCH | `/boxes/:box_id` | `owner` (เจ้าของตู้) | `{ name }` (1–40 ตัว) | `BoxSummary` → `A09` |

- ✅ Activate QR ใช้ได้**ครั้งเดียว** — ผูกสำเร็จแล้วรหัสนี้ตายทันที (ทำใน transaction เดียวกับการผูก)
- ✅ ทุกครั้งที่สแกน/พิมพ์ บันทึก scan log แม้ไม่ผ่าน (§12): `qr_kind: "activate"`, `method: scan|code`, `result`
- 💡 ถ้าเปิดลิงก์ `/a/...` ด้วยกล้องมือถือ (ไม่ได้อยู่ในแอป) → เว็บแอปพาไปหน้าสมัคร/ล็อกอินก่อน แล้วกลับมาเรียก route นี้ต่อ

### 4.2 ดูตู้

| method | path | สิทธิ์ | ตอบ |
|---|---|---|---|
| GET | `/boxes` | `owner` | `BoxSummary[]` ตู้ของฉัน |
| GET | `/boxes/:box_id` | `owner` | `BoxDetail` — หน้าหลัก `H03*` |

```ts
interface BoxSummary { id: string; name: string; house_no: string; status: BoxStatus; }
type BoxStatus = "online" | "offline" | "sleeping" | "service_closed" | "unbound";

interface BoxDetail extends BoxSummary {
  battery: { pct: number; charging: boolean; reported_at: string } | null;
  last_seen_at: string | null;           // ติดต่อล่าสุด ("5 นาทีที่แล้ว")
  coverage: { has_officer: boolean; agency_name: string | null };  // false = "ยังไม่มีเจ้าหน้าที่ดูแล" + SOS ไปทาง 191/1669 ทันที
  patrol: { in_window: boolean; windows: [string, string][]; tz: string } | null;
  latest_events: BoxEvent[];             // 3 รายการล่าสุด
  todo: TodoItem[];                       // H03-d: QR ใบ 1 เสีย, แบตต่ำ ฯลฯ
  warnings: ("push_off" | "low_battery" | "offline")[];
  open_sos: { id: string; stage: SosStage } | null;   // มี SOS ค้าง → หน้าหลักพาไปหน้ารอ
  plan: PlanInfo;                         // แพ็กเกจของบัญชีเจ้าของตู้ (§4.5) — server คำนวณจาก DB ทุกครั้ง
}
type TodoItem =
  | { type: "swap_backup_qr"; since: string }          // แอดมินขอให้เอา QR สำรองไปติดแทน
  | { type: "low_battery"; pct: number };
```

- `status` = `sleeping` เมื่อนอกเวลาตรวจและตู้รายงานรายวันมาภายใน 26 ชม. (ตู้หลับลึกตามปกติ ไม่ใช่ปัญหา)
- `status` = `offline` เมื่อ (ก) ถึงเวลาตรวจแล้วตู้ไม่ต่อเข้ามาใน ~5 นาที หรือ (ข) หลุดระหว่างเวลาตรวจเกิน 10 นาที หรือ (ค) ไม่รายงานเกิน 26 ชม. (§8 ของ design)

### 4.3 ประวัติ

| method | path | สิทธิ์ | query | ตอบ |
|---|---|---|---|---|
| GET | `/boxes/:box_id/events` | `owner` | `?from&to&type&page&per_page` — `type` หลายค่าคั่น `,`: `inspected`, `delivered`, `offline`, `low_battery`, `sos`, `qr` | paginated `BoxEvent` (`H12`, `H12-e` เลือกช่วงวันที่) |
| GET | `/boxes/:box_id/events/:event_id` | `owner` | — | `BoxEvent` + `detail` (`H12-b` ตรวจ · `H12-c` ส่งของ · `H12-d` ตู้ไม่ออนไลน์) |

```ts
interface BoxEvent {
  id: string; type: "inspected" | "delivered" | "offline" | "online" | "low_battery" | "sos" | "qr_replaced" | "box_problem";
  at: string;
  // inspected: เจ้าของบ้านเห็นเจ้าหน้าที่แค่นี้ (✅ ข้อมูลส่วนบุคคล)
  officer?: { agency_type: "police" | "guard" | "other"; agency_name: string; display_name: string };
  qr_slot?: 1 | 2;          // สแกน QR ใบไหน
  method?: "scan" | "code";
  detail?: Record<string, unknown>;
}
```

- ✅ เจ้าของบ้าน**ไม่เห็นเบอร์โทรเจ้าหน้าที่** ในประวัติ — เบอร์เห็นได้เฉพาะตอน SOS เปิดอยู่ (§7)
- ส่งของ: ✅ ไม่เก็บว่าไรเดอร์เป็นใคร มีแค่เวลา + วิธี (สแกน / พิมพ์รหัส / กดปุ่มหน้าตู้) + QR ใบไหน (ถ้าสแกน)

### 4.4 QR สำรองและงานช่าง

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| POST | `/boxes/:box_id/qr/backup-placed` | `owner` | — | 200 — กด "ติดแล้ว" หลังเอา QR ใบ 2 ไปติดหน้าตู้ (แอดมินออกใบสำรองใหม่ต่อ §10.4) · 409 `NO_SWAP_REQUESTED` ถ้าไม่มีคำขอค้าง |
| POST | `/boxes/:box_id/technician-requests` | `owner` | `{ reason: "wifi_change" \| "repair" \| "other", note? }` | 201 → `H13-c` "แจ้งช่างแล้ว รอช่างนัด" · 409 ถ้ามีคำขอที่ยังไม่ปิด |
| GET | `/boxes/:box_id/technician-requests` | `owner` | — | คำขอของตู้นี้ (สถานะ `open` / `scheduled` / `done`) |

- ✅ เปลี่ยน Wi-Fi: แจ้งช่างผ่านแอป หรือทำเองด้วยปุ่ม Boot บนบอร์ดค้าง 5 วิ (`H13-b` เป็นหน้าแนะนำ ไม่มี API)
- ✅ ช่วงทดลอง**ช่างเป็นคนตั้ง Wi-Fi**

### 4.5 แพ็กเกจของเจ้าของบ้าน (เพิ่ม 2026-10-27 — design §17)

✅ **ผูกกับบัญชีเจ้าของบ้าน** (ตรวจสอบที่บัญชี — ตู้ทุกตู้ของเจ้าของคนนั้นใช้แพ็กเดียวกัน) · ✅ **แพ็กเริ่มต้น = ฟรี** ได้ตอนสมัคร ไม่มีวันหมดอายุ ·
✅ แพ็กอื่นมีในอนาคต ค่อยเพิ่มทีหลัง (ตาราง/ API รองรับไว้แล้ว) · ✅ ยังไม่มีการชำระเงิน — แอดมินเป็นคนตั้ง ระบบอ่านจาก DB แล้วแสดง

| method | path | สิทธิ์ | ตอบ |
|---|---|---|---|
| GET | `/me/plan` | `owner` | `PlanInfo` — หน้าตั้งค่า `H13` แถว "แพ็กเกจ" · ค่าเดียวกับ `BoxDetail.plan` และ `Me.plan` |

```ts
interface PlanInfo {
  code: string;                    // 'free' (แพ็กเริ่มต้น ✅ 2026-10-27)
  name: string;                    // แปลตาม prefs.lang แล้ว: "ฟรี" / "Free"
  price_note: string | null;       // ข้อความแสดงเฉย ๆ
  status: "active" | "expiring" | "expired" | "none";   // expiring = เหลือ ≤ 7 วัน · none = ไม่มีแถวใน user_plans (ไม่ควรเกิด)
  starts_at: string;
  ends_at: string | null;          // null = ไม่หมดอายุ
  features: Record<string, number | boolean>;   // { history_days: 30, family_members: 0 } — client ใช้ซ่อน/แสดงปุ่มเท่านั้น
}
```

- 💡 **SOS และการตรวจตู้ใช้ได้เสมอ** ไม่ขึ้นกับแพ็กเกจหรือวันหมดอายุ
- ฟีเจอร์ที่แพ็กเกจไม่ครอบคลุม → **403 `PLAN_FEATURE_REQUIRED`** `{ feature }` (ตรวจที่ server)
- เจ้าหน้าที่/หัวหน้า/ไรเดอร์ **ไม่เห็น**แพ็กเกจของบ้าน
- `Me` (§2) มี `plan: PlanInfo | null` เพิ่ม — `null` เมื่อไม่ใช่ owner

### 4.6 🧪 สมาชิกในบ้าน (ข้อเสนอ — ยังไม่อยู่ในขอบเขต)

มีแค่ใน wireframe (`H15`, `H15-b`, `H15-c`) เพื่อเสนอลูกค้า — **ห้ามทำจนกว่าจะตกลง** ร่างไว้เผื่อ:
`GET/POST /boxes/:box_id/members` (`{ name, perms: { notify, sos, history } }` → ลิงก์เชิญ) · สมาชิกสมัครด้วยเบอร์ผ่านลิงก์ ไม่ต้องสแกนตู้ ·
สมาชิกไม่เห็นเบอร์เจ้าหน้าที่และแก้ตั้งค่าตู้ไม่ได้ · ต้องเพิ่มบทบาท/ขอบเขตใหม่ (กระทบ §0)

---

## 5. ไรเดอร์ (public) — `/api/v1/public`

✅ ไม่ต้องสมัคร ไม่ต้องลงแอป ไม่ล็อกอิน ไม่เก็บข้อมูลไรเดอร์ ไม่ถ่ายรูป · ✅ ส่งของได้ทุกเวลา
✅ **แจ้งส่งของได้ 2 ทาง (อัปเดต 2026-10-27)**:
1. **สแกน QR หน้าตู้** (หรือพิมพ์รหัสใต้ QR) — ลิงก์ `https://smmb.app/b/BX00042-1-K7M2QX` → กล้องมือถือเปิดเว็บแอปหน้า `R02` → API ข้างล่าง
2. **กดปุ่มที่หน้าตู้** — ไม่ต้องใช้มือถือ · ตู้ตื่นแล้วส่งเองทาง API ของตู้ `POST /v1/box/deliveries` (§13.7) · ไรเดอร์ดูผลจากไฟที่ตู้ ไม่มีหน้าจอ

ทั้งสองทางลงตาราง `deliveries` ตัวเดียวกัน (`method: scan | code | button`) · ใช้เพดานจำนวนครั้งต่อตู้**ร่วมกัน** · แจ้งเจ้าของบ้านแบบเดียวกัน

| method | path | สิทธิ์ | body / query | ตอบ |
|---|---|---|---|---|
| GET | `/public/qr/:token` | public | `:token` = ส่วนท้ายลิงก์ (`BX00042-1-K7M2QX`) | `{ house_no, box_status: "active" \| "service_closed", delivery_ticket }` · 404 `QR_INVALID` (`R03`) · 410 `QR_REVOKED` (ใบเก่าที่ถูกยกเลิก — แสดงเหมือน `R03`) |
| GET | `/public/codes/:code` | public | `:code` = รหัสพิมพ์ใต้ QR `H4KD-9TRW` (ไม่สนตัวเล็กใหญ่/ขีด) | เหมือนข้างบน (`R01`) · 429 `CODE_ATTEMPTS_EXCEEDED` |
| POST | `/public/deliveries` | public | `{ delivery_ticket }` | 201 `{ ok: true }` → `R04` · 403 `BOX_SERVICE_CLOSED` (`R03-b`) · 429 `DELIVERY_LIMIT` (`R03-c`) · 410 `TICKET_EXPIRED` |

- `delivery_ticket` 💡 = token อายุสั้น (~10 นาที) ที่ออกตอนสแกน → POST ต้องผ่านการสแกนก่อนเสมอ และ scan log กับ delivery log ผูกกันได้
- ✅ จำกัดจำนวนครั้งต่อตู้ กันคนกดมั่วจากรูป QR (ตัวเลข ❓ เสนอ 5 ครั้ง/ชั่วโมง/ตู้)
- ✅ หน้า `R02` มีข้อความเล็ก "เจ้าหน้าที่ กรุณาสแกนผ่านแอป SMMB" — ถ้าคนที่ล็อกอินเป็น officer เปิดลิงก์นี้ (มี cookie) 💡 เว็บแอปพาไปหน้าตรวจ `O02` แทน
- บันทึก scan log ทุกครั้ง: ตู้ · QR ใบไหน · สแกนหรือพิมพ์ · ผล · เวลา (ไม่มีผู้ใช้)
- ส่งสำเร็จ → แจ้งเตือนเจ้าของบ้าน `delivered` (§14) — ข้อความบอกวิธีด้วย: "มีของมาส่ง (สแกน QR)" / "มีของมาส่ง (กดปุ่มหน้าตู้)"

---

## 6. ตรวจตู้ — `/api/v1/inspections` · `officer`, `head`

ลำดับเต็มอยู่ใน `smmb-design.md` §6 และโปรโตคอลตู้ §4 — ตรงนี้คือสัญญาฝั่งแอปเจ้าหน้าที่

### 6.1 หน้าสรุป

| method | path | สิทธิ์ | ตอบ |
|---|---|---|---|
| GET | `/officer/summary` | `officer` | `OfficerSummary` (`O01*`) |
| GET | `/officer/houses` | `officer` | `?zone_id&status=unchecked\|checked` → บ้านในโซนของฉัน (เรียงตามลำดับเดิน 💡) |

```ts
interface OfficerSummary {
  in_window: boolean;                       // false → O01-d "นอกเวลาตรวจ"
  window: { zone_id: string; zone_name: string; start: string; end: string } | null;  // ช่วงที่กำลังเปิด / ช่วงถัดไป
  houses_total: number; houses_checked: number;   // "บ้านในโซนของฉัน 10 หลัง · ตรวจแล้ว 5"
  next_house: { box_id: string; house_no: string; box_name: string } | null;
  houses: { box_id: string; house_no: string; checked_at: string | null }[];
  open_sos: SosCard[];                      // O01-b มี SOS เข้า / O01-c กำลังดูแล SOS
}
```

### 6.2 เริ่มตรวจ (สแกน QR หน้าตู้)

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| POST | `/inspections` | `officer` | `{ qr_text }` (สแกน) **หรือ** `{ code }` (พิมพ์ `O02-b`) + `{ scan_ms }` เวลาที่ใช้สแกนจนติด | 201 `Inspection` สถานะ `waking` → `O05` |

ลำดับการเช็กที่ server (หยุดที่ข้อแรกที่ไม่ผ่าน — **บันทึก scan log ทุกกรณี**):

| # | เช็ก | ไม่ผ่าน → | หน้า |
|---|---|---|---|
| 1 | ลายเซ็น QR ถูกต้อง (เป็น QR ของระบบ) | **422 `QR_NOT_SYSTEM`** + แจ้งแอดมิน**ทันที** (อาจถูกแปะ QR ปลอมทับ) | `O04` |
| 2 | รหัส/รุ่นยังใช้งานอยู่ | 404 `QR_INVALID` (ใบที่ถูกยกเลิกแล้วก็ตอบนี้) | `O04-b` |
| 3 | บ้านอยู่ในโซนของผู้สแกน | 403 `NOT_IN_ZONE` | `O04-b` |
| 4 | อยู่ในเวลาตรวจของโซนนั้น | 409 `OUTSIDE_PATROL_WINDOW` "นอกเวลาตรวจ ไม่บันทึกการตรวจ" (✅ ไม่ตรวจนอกเวลา) | `O04-b` |
| 5 | ตู้เปิดบริการ | 403 `BOX_SERVICE_CLOSED` | `O04-b` |
| 6 | ตู้ต่อ long-poll อยู่ | 503 `BOX_OFFLINE` + แจ้งเจ้าของบ้าน/แอดมิน | `O05-b` |
| — | ผ่าน | สร้าง job (อายุ 60 วิ) ส่งให้ตู้ทันที → 201 | `O05` |

- `scan_ms > 10000` หรือใช้ `code` → server ติดธง QR ใบนั้นทันที (✅ 1 ครั้งก็พอ) และใน response มี `ask_qr_condition: true` → แอปถาม `O03` "QR ดูเสียไหม?"
- เจ้าหน้าที่**ต้องสแกนผ่านปุ่มในแอป** — ถ้าใช้กล้องมือถือธรรมดาจะได้หน้าไรเดอร์ (§5)
- ✅ ขอสิทธิ์กล้องตอนกด "สแกน" ครั้งแรก (`O02-c`) ไม่อนุญาต → พิมพ์รหัสแทน (ไม่มี API)

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| POST | `/inspections/:id/qr-condition` | `officer` (ผู้สร้าง) | `{ condition: "faded" \| "torn" \| "missing" \| "covered" \| "ok" }` | 200 — ตรวจต่อได้ตามปกติ (✅ ไม่บล็อกการตรวจ) |

```ts
interface Inspection {
  id: string; job_id: string;               // J-8f31c2
  box: { id: string; house_no: string; name: string };
  qr_slot: 1 | 2; method: "scan" | "code";
  status: "waking" | "ready" | "passed" | "failed" | "expired" | "box_problem";
  attempt: number; attempts_max: 3; attempts_left: number;
  expires_at: string;                       // job หมดอายุ 60 วิ ถ้าตู้ยังไม่ ready
  ask_qr_condition: boolean;
  checked_at: string | null;
}
```

### 6.3 รอตู้ + แสดง QR ประจำตัว

| method | path | สิทธิ์ | ตอบ |
|---|---|---|---|
| GET | `/inspections/:id` | `officer` (ผู้สร้าง) | `Inspection` — ใช้ poll ทุก 1 วิ ถ้าไม่ใช้ SSE |
| GET | `/inspections/:id/stream` | `officer` (ผู้สร้าง) | **SSE** `event: status` `data: Inspection` ทุกครั้งที่สถานะเปลี่ยน (❓ เลือก SSE หรือ poll — โปรโตคอลตู้ §7 ข้อ 5) |
| GET | `/inspections/:id/badge` | `officer` (ผู้สร้าง) | `{ qr: "SMMB-O1.<payload>.<sig>", expires_at }` — **ขอใหม่ทุก 30 วิ** ระหว่างอยู่หน้า `O06` · 409 `NOT_READY` ถ้าตู้ยังไม่ ready · 410 `INSPECTION_CLOSED` |
| POST | `/inspections/:id/box-problem` | `officer` (ผู้สร้าง) | `{ reason: "no_light" \| "no_response" \| "scan_failed_3" \| "other", note? }` → 201 แจ้งเจ้าของบ้าน + แอดมิน → กลับ `O01` |

- QR ประจำตัว**สร้างที่ server เท่านั้น** (ไม่มีรหัสลับในมือถือ) · payload `{ j: job_id, u: user_id, e: หมดอายุ }` · ผูกกับ job ของตู้นี้ → เอาไปใช้ตู้อื่นไม่ได้ · หมดอายุ 30 วิ → ถ่ายรูปเก็บไว้ใช้ไม่ได้
- ตู้ไม่ ready ภายใน ~30 วิ (แอปนับเอง) → `O05-b` "ตู้ไม่ตอบ ดูไฟที่ตู้" → `box-problem`
- ผลจากตู้มาทาง API ของตู้ (§13.5) แล้ว server อัปเดต `Inspection`:
  - `passed` → `O08` "ตรวจแล้ว 22:15" + แจ้งเจ้าของบ้าน + อัปเดตหน้าสรุปของทั้งโซน
  - `failed` + `attempts_left > 0` → `O06-b` ลองใหม่ (ไม่ต้องสร้าง inspection ใหม่)
  - ครบ 3 ครั้ง → `O06-c` → แอปเรียก `box-problem` อัตโนมัติ 💡
- ✅ **ไม่บันทึกออฟไลน์แล้วซิงก์ทีหลัง** — เน็ตหลุดระหว่างตรวจ = เริ่มใหม่

---

## 7. SOS — `/api/v1/sos`

### 7.1 ฝั่งเจ้าของบ้าน

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| POST | `/sos` | `owner` | `{ box_id }` (แอปส่งหลังกดค้างครบ 3 วิ `H03-e` — ✅ กันกดโดยไม่ได้ตั้งใจ) | 201 `Sos` (`H09`) · **200 `{ code: "SOS_NO_COVERAGE", call: ["191","1669"] }`** เมื่อบ้านยังไม่อยู่ในโซน (`H08` — ✅ บอกให้โทรทันที ไม่สร้าง SOS) · 409 `SOS_ALREADY_OPEN` คืน `Sos` เดิม |
| GET | `/sos/:id` | `owner` (เจ้าของ) / `officer` ที่ถูกส่งถึง | `Sos` |
| GET | `/sos/:id/stream` | เหมือนข้างบน | **SSE** `event: sos` ทุกครั้งที่ขั้น/สถานะเปลี่ยน |
| POST | `/sos/:id/cancel` | `owner` (เจ้าของ) | `{ reason: "safe" \| "mistake" }` (`H10` ยืนยันแล้วเท่านั้น) | 200 → แจ้งเจ้าหน้าที่ทุกคนที่ได้รับว่ายกเลิกแล้ว (`O09-c`) · 409 ถ้าปิดไปแล้ว |

```ts
type SosStage = "zone" | "agency" | "call_yourself";   // 0 วิ / 30 วิ / 60 วิ
interface Sos {
  id: string; box: { id: string; house_no: string };
  status: "open" | "accepted" | "closed" | "cancelled";
  stage: SosStage;
  created_at: string; stage_changed_at: string;
  accepted_by: {                       // H11 "รับแล้วโดย ส.ต.ต. สมชาย (สภ.X)"
    display_name: string; agency_name: string;
    phone: string | null;              // ✅ เห็นเบอร์เฉพาะตอน SOS ยังเปิดอยู่ — ปิดแล้วเป็น null
    at: string;
  } | null;
  close_note: string | null;           // H11-b เห็นหมายเหตุ
}
```

- ส่งเป็นขั้น (✅): **0 วิ** เจ้าหน้าที่ในโซน → **30 วิ** ทุกคนในหน่วยงาน + หัวหน้า → **60 วิ** `stage = call_yourself` แอปขึ้นตัวใหญ่ "กรุณาโทร 191 / 1669 ทันที" (`H09-c`) — SOS **ยังเปิดรอคนรับต่อ**
- ปุ่มโทร 191 / 1669 / โทรหาเจ้าหน้าที่ = ลิงก์ `tel:` ของมือถือ (✅ ใช้แอปโทรศัพท์ของเครื่อง) ไม่มี API
- ✅ SOS ไม่ได้แทนการโทร 191 (อยู่ในข้อตกลง)

### 7.2 ฝั่งเจ้าหน้าที่

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| GET | `/sos` | `officer` | `?status=open\|mine\|closed&page&per_page` | paginated `SosCard` (`O12`) |
| POST | `/sos/:id/accept` | `officer` ที่ถูกส่งถึง | — | 200 `Sos` → `O10` · **409 `SOS_ALREADY_TAKEN`** + `accepted_by` (`O09-b` "รับแล้วโดย X") · 410 `SOS_CANCELLED` (`O09-c`) |
| POST | `/sos/:id/close` | `officer` ผู้รับเรื่อง | `{ note }` (บังคับ 1–500 ตัว) | 200 → เจ้าของบ้านเห็นหมายเหตุ (`O11` → `H11-b`) |

```ts
interface SosCard {
  id: string; status: Sos["status"]; stage: SosStage; created_at: string;
  house_no: string;
  owner: { name: string; phone: string } | null;   // ✅ เห็นชื่อ+เบอร์เจ้าของบ้านเฉพาะตอน SOS เปิดอยู่
  accepted_by: { display_name: string; agency_name: string } | null;
}
```

- ✅ กดรับพร้อมกันหลายคน → **คนแรกได้** (server ล็อกด้วย `UPDATE … WHERE accepted_by IS NULL` — ดู design §7)
- เจ้าหน้าที่ได้แจ้งเตือนสีแดง `sos_new` ทันทีที่ขั้นของตัวเองมาถึง · รับแล้วคนอื่นได้ `sos_taken` (หยุดเด้ง)

---

## 8. หน่วยงาน (หัวหน้า) — `/api/v1/agency` · `head`

ทุก route ทำกับ**หน่วยงานของตัวเอง**เท่านั้น (ไม่มี `:agency_id` ใน path)

> **ขอบเขตโซน (✅ ผู้ใช้ยืนยัน 2026-10-27 — design §18)**: หัวหน้า**มีสิทธิ์ทุกโซนของหน่วยงาน** · หน้าจอเริ่มที่ "โซนของฉัน" แล้วสลับเป็นทุกโซนได้
> route ที่เป็นภาพรวม/รายการรับ `?zone=mine|all|<zone_id>` (ค่าเริ่มต้น `mine` ถ้าหัวหน้าอยู่ในโซนใดโซนหนึ่ง ไม่งั้น `all`) — **เป็นตัวกรอง ไม่ใช่สิทธิ์**
> การ**ตรวจตู้**ของหัวหน้ายังจำกัดเฉพาะโซนที่ตัวเองอยู่ (§6)

### 8.1 หน่วยงาน

| method | path | สิทธิ์ | ตอบ |
|---|---|---|---|
| GET | `/agency` | หัวหน้า (รวมหน่วยงานที่ยัง pending / rejected — ใช้แสดง `L02` / `L02-b` · ไม่ต้องเปิดแจ้งเตือน) | `{ id, name, type, status: "pending" \| "approved" \| "rejected", group_code: string \| null, reject_reason: string \| null, contact: string \| null, heads: {id, display_name}[] }` — `group_code` มีเมื่อ `approved` (`L03` แชร์ให้ลูกทีม) · ไม่ใช่หัวหน้า → 404 |
| POST | `/agency/group-code/rotate` | `head` | `{ group_code }` ใหม่ — รหัสเก่าใช้สมัครไม่ได้ (คนที่สมัครไปแล้วไม่กระทบ) |
| GET | `/agency/today` | `head` | `?zone=mine\|all\|<zone_id>` → ภาพรวมทีมวันนี้ (`L04`): ต่อโซน `{ zone, is_mine, houses_total, houses_checked, officers_on_duty }` + SOS วันนี้ + ตู้ offline ในโซน · 🔜 ยังไม่ทำ (ต้องมีโซน/การตรวจก่อน) |

- ✅ (2026-10-27 เขียนแล้ว ยกเว้น `/agency/today`) route ที่ติด `head` ต้อง**เปิดแจ้งเตือนก่อน** (403 `PUSH_REQUIRED` เหมือนเจ้าหน้าที่) · `rotate` ตอบ 200

### 8.2 สมาชิก

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| GET | `/agency/members` | `head` | `?status=pending\|active\|disabled` (ไม่ส่ง = ทุกสถานะยกเว้น rejected · pending อยู่บนสุดเสมอ) | `Member[]` (`L05`) |
| POST | `/agency/members/:user_id/approve` | `head` | — | 200 → ได้บทบาท officer + แจ้งเตือน `member_approved` · 409 `MEMBER_NOT_PENDING` |
| POST | `/agency/members/:user_id/reject` | `head` | — | 200 (`A11-b`) + แจ้งเตือน `member_rejected` · 409 `MEMBER_NOT_PENDING` |
| PATCH | `/agency/members/:user_id/status` | `head` | `{ is_active }` | ✅ ปิด = หยุดใช้งานเจ้าหน้าที่ทันที + ถอดออกจากทุกโซนของหน่วยงาน + ถอดหัวหน้า · **ไม่เตะ session** (สิทธิ์เช็กจากฐานข้อมูลทุกคำขออยู่แล้ว และถ้าคนนั้นเป็นเจ้าของบ้านด้วย บทบาทนั้นต้องใช้ต่อได้) · 409 `MEMBER_STATE_INVALID` |
| POST | `/agency/members/:user_id/make-head` | `head` | — | 200 — ✅ มีหัวหน้าได้หลายคน · ต้องเป็นสมาชิก active (409 `MEMBER_STATE_INVALID`) |
| DELETE | `/agency/members/:user_id/head` | `head` | — | 200 ถอดหัวหน้า · 409 `LAST_HEAD` ถ้าเหลือคนเดียว |
| POST | `/agency/members/:user_id/reset-password` | `head` | — | 200 `{ temp_password }` ได้**ครั้งเดียว** + เตะทุก session ของคนนั้น + ต้องเปลี่ยนรหัสก่อนใช้งาน · ✅ ทำได้เฉพาะบัญชีที่**เป็นเจ้าหน้าที่อย่างเดียว** — ถ้าเป็นเจ้าของบ้านหรือหัวหน้าด้วย → 403 `RESET_NEEDS_ADMIN` (ไม่งั้นหัวหน้าได้รหัสเข้าไปดูตู้ที่บ้านลูกทีม) |

```ts
interface Member { id; name; display_name; phone; status: "pending" | "active" | "disabled" | "rejected";
                   is_head: boolean; zones: { id; name }[]; joined_at: string; last_inspection_at: string | null }
```

- **403 `CANNOT_CHANGE_SELF`** ถ้าปิด / ถอดหัวหน้า / รีเซ็ตรหัส**ตัวเอง** (กันล็อกตัวเองออก — เปลี่ยนรหัสตัวเองใช้ `change-password`)
- สมาชิกของหน่วยงานอื่น → 404 · `:user_id` ผิดรูปแบบ → 400
- `last_inspection_at` เป็น `null` จนกว่าจะมีการตรวจตู้ (เฟส 3)

### 8.3 โซน

✅ หัวหน้ากำหนดโซน: ใส่บ้าน + ใส่เจ้าหน้าที่ + ตั้งช่วงเวลาตรวจ · 1 คนอยู่ได้หลายโซน · 1 โซนมีได้หลายคน

| method | path | สิทธิ์ | body | ตอบ |
|---|---|---|---|---|
| GET | `/agency/zones` | `head` | — | `Zone[]` ทุกโซนของหน่วยงาน (`L06`) — `is_mine` = หัวหน้าคนนี้อยู่ในโซน (ป้าย "โซนที่ฉันอยู่") |
| POST | `/agency/zones` | `head` | `{ name, windows: [["06:00","09:00"],["17:00","21:00"]] }` | `Zone` |
| GET | `/agency/zones/:id` | `head` | — | `Zone & { houses: ZoneHouse[], officers: Member[] }` (`L07`) |
| PATCH | `/agency/zones/:id` | `head` | `{ name?, windows? }` | `Zone` — เปลี่ยนเวลา → ตู้ในโซนรับค่าใหม่ภายใน 1 วัน (✅) |
| PUT | `/agency/zones/:id/houses` | `head` | `{ box_ids: string[] }` แทนที่ทั้งชุด (`L07-b`) | `ZoneHouse[]` · 409 `BOX_IN_OTHER_AGENCY_ZONE` ❓ (ดู design §15) |
| PUT | `/agency/zones/:id/officers` | `head` | `{ user_ids: string[] }` แทนที่ทั้งชุด (`L07-c`) | `Member[]` · 400 ถ้ามีคนที่ไม่ใช่สมาชิก active |
| DELETE | `/agency/zones/:id` | `head` | — | 200 · บ้านที่ไม่เหลือโซนไหนเลยกลับเป็น "ยังไม่มีเจ้าหน้าที่ดูแล" |
| GET | `/agency/houses/search` | `head` | `?q=` บ้านเลขที่ | `{ box_id, house_no, box_name, zones: {agency_name, zone_name}[] }[]` — ใช้ตอนเพิ่มบ้านเข้าโซน |

```ts
interface Zone { id; name; windows: [string, string][]; tz: "Asia/Bangkok"; houses_count; officers_count; is_mine: boolean; updated_at }
interface ZoneHouse { box_id; house_no; box_name; box_status: BoxStatus }
```

- ✅ (2026-10-27 เขียนแล้ว) `GET`/`POST`/`PATCH`/`DELETE` โซน + `PUT …/officers` · `GET /agency/zones?zone=mine|all` (ตัวกรอง ไม่ใช่สิทธิ์) · **ยังไม่ทำ `PUT …/houses` และ `/agency/houses/search`** จนกว่าจะตอบว่าบ้านหลังเดียวอยู่ในโซนของหลายหน่วยงานได้ไหม (design §15)
- `windows`: `"HH:mm"` · `start < end` (ไม่ข้ามเที่ยงคืน — ตรวจข้ามคืนให้แยก 2 ช่วง) · ไม่ทับกัน (ชนขอบได้) · ไม่เกิน 4 ช่วง · เรียงตามเวลาให้ · ผิด → 400 `WINDOWS_INVALID`
- ชื่อโซนซ้ำในหน่วยงานเดียว (ไม่สนตัวเล็กใหญ่) → 409 `ZONE_NAME_TAKEN` · ใส่คนที่ไม่ใช่สมาชิก active ของหน่วยงาน → 400 `OFFICER_NOT_MEMBER` · โซนของหน่วยงานอื่น/ที่ลบแล้ว → 404 · ลบโซน = เก็บประวัติ (soft delete) + ถอดคนและบ้านออก
- ตู้อยู่ได้หลายโซน → เวลาตรวจที่ส่งให้ตู้ = **รวมช่วงของทุกโซน** (merge ที่ทับกัน) — ดู design §5
- ✅ ข้อมูลที่หัวหน้าเห็นของบ้าน = บ้านเลขที่ + ชื่อตู้ (ไม่เห็นชื่อ/เบอร์เจ้าของบ้าน)

### 8.4 Log การตรวจ

| method | path | สิทธิ์ | query | ตอบ |
|---|---|---|---|---|
| GET | `/agency/logs` | `head` | `?zone=mine\|all\|<zone_id>&from&to&user_id&box_id&result&page&per_page` | paginated `ScanLogRow` ของคนในหน่วยงาน (`L08`): ใคร · บ้าน · เวลา · QR ใบไหน · สแกนหรือพิมพ์ · ผล |
| GET | `/agency/logs/export.csv` | `head` | เหมือนข้างบน | ไฟล์ CSV (UTF-8 BOM ให้ Excel อ่านภาษาไทยได้) 💡 |

---

## 9. 🖥️ หลังบ้าน (แอดมิน) — `/api/v1/admin` · `admin`

### 9.1 ภาพรวม

| method | path | ตอบ |
|---|---|---|
| GET | `/admin/overview` | `D01`: ตู้ทั้งหมด/ออนไลน์/ออฟไลน์/แบตต่ำ · หน่วยงานรออนุมัติ · QR ไม่ปกติ (ต่อสถานะ) · SOS เปิดอยู่ · คำขอช่างค้าง |

### 9.2 หน่วยงาน

| method | path | body | ตอบ |
|---|---|---|---|
| GET | `/admin/agencies` | `?status=pending\|approved\|rejected&q` | `D02` / `D13` — pending อยู่บนสุด · สูงสุด 500 แถว |
| GET | `/admin/agencies/:id` | — | หน่วยงาน + หัวหน้า (`heads_contact` มีชื่อ/เบอร์ → **บันทึก data access log**) + `counts: { members_active, members_pending, zones, houses }` + `group_code` |
| POST | `/admin/agencies/:id/approve` | — | 200 `{ group_code }` (8 ตัว ไม่มีตัวที่สับสน) · หัวหน้าได้บทบาท officer → แจ้ง `agency_approved` (`L03`) · 409 `AGENCY_NOT_PENDING` |
| POST | `/admin/agencies/:id/reject` | `{ reason? }` | 200 (`L02-b` แสดง `reject_reason`) → แจ้ง `agency_rejected` · 409 `AGENCY_NOT_PENDING` |
| POST | `/admin/agencies` | `{ name, type, contact, head: { name, phone } }` | 201 `{ agency, head: { id, existing_account }, head_temp_password, group_code }` — ✅ ทางเลือก "แอดมินสร้างให้แล้วแจกรหัสกลุ่ม" · เบอร์ใหม่ → บัญชีใหม่ + รหัสชั่วคราว (ต้องเปลี่ยนรหัส + ยอมรับข้อตกลงตอนเข้าครั้งแรก) · เบอร์ที่มีบัญชีแล้ว → ใช้บัญชีเดิม `head_temp_password: null` · 409 `ROLE_EXISTS` ถ้าอยู่หน่วยงานอื่นแล้ว · 403 `ADMIN_ROLE_EXCLUSIVE` · หน้าเว็บ: ปุ่ม "สร้างหน่วยงานให้" ใน `D13` |

- หน่วยงานสมัครใหม่ → แจ้ง `agency_pending` ถึงแอดมินทุกคน · เจ้าหน้าที่สมัคร/ขอเข้า → แจ้ง `member_pending` ถึงหัวหน้าทุกคนของหน่วยงาน

### 9.3 ผู้ใช้

| method | path | body | ตอบ |
|---|---|---|---|
| GET | `/admin/users` | `?role&status&q&page&per_page` (`q` = ชื่อ/เบอร์ · `role` = มีบทบาทนี้) | paginated (`D09`) |
| GET | `/admin/users/:id` | — | ข้อมูลเต็ม (**บันทึก data access log**) |
| PATCH | `/admin/users/:id` | `{ status? }` | ปิด/เปิดทั้งบัญชี · ปิด = เตะ session |
| PUT | `/admin/users/:id/roles/:role` | `{ level?, status? }` | ✅ เพิ่ม/แก้บทบาท (`admin`/`owner`/`officer`) · 403 `ADMIN_ROLE_EXCLUSIVE` |
| DELETE | `/admin/users/:id/roles/:role` | — | ถอดบทบาท · บทบาทอื่นยังใช้ได้ |
| POST | `/admin/users/:id/reset-password` | — | `{ temp_password }` ครั้งเดียว + เตะทุก session |

- **403 `CANNOT_CHANGE_SELF`** ถ้าแอดมินปิดบัญชี / แก้บทบาท / รีเซ็ตรหัส**ของตัวเอง** · ทุกการเปลี่ยนบทบาทเพิ่ม `perm_version` ของคนนั้น
- ✅ (2026-10-27 เขียนแล้ว) `?role=head` ได้ด้วย (กรองจาก `is_head`) · `q` ค้นเบอร์ได้แม้พิมพ์มีขีด · `GET /admin/users/:id` มี `house_no`, `plan`, `active_sessions`, `must_change_password` · ถอดบทบาท `officer` = ออกจากหน่วยงาน (disabled) + ออกจากทุกโซน · `:role` นอกจาก admin/owner/officer → 400

### 9.4 ตู้และ QR

| method | path | body | ตอบ |
|---|---|---|---|
| GET | `/admin/boxes` | `?status&battery_lt&q&agency_id&page&per_page` | paginated (`D03`): id · บ้านเลขที่ · เจ้าของ · ออนไลน์ · แบต · ติดต่อล่าสุด · fw · โซน |
| GET | `/admin/boxes/:box_id` | — | `D04`: ทุกอย่าง + รายงานรายวัน 14 วันล่าสุด + QR ทุกใบ + คำขอช่าง (**data access log**) |
| POST | `/admin/boxes` | `{ count }` หรือ `{ box_ids }` | 201 ลงทะเบียนตู้ตอนผลิต → `{ box_id, device_secret, qr: PrintableQr[] }[]` (`device_secret` ได้**ครั้งเดียว** เขียนลงบอร์ด) |
| PATCH | `/admin/boxes/:box_id/service` | `{ active: boolean, reason? }` | ✅ เปิดปิดบริการ — ปิดแล้วไรเดอร์เห็น `R03-b`, ตรวจไม่ได้ |
| POST | `/admin/boxes/:box_id/unbind` | `{ reason }` | ✅ ยกเลิกการผูก (เช่น ขายบ้าน) → ออก Activate QR ใหม่ให้ |
| GET | `/admin/boxes/:box_id/qr` | — | `QrCode[]` ทุกใบทุกรุ่น (รวมใบที่ยกเลิกแล้ว) |
| GET | `/admin/qr` | `?health=suspicious\|damaged\|maybe_fake\|backup_in_use\|expiring&page` | `D05` สุขภาพ QR ทุกใบ |
| POST | `/admin/qr/:qr_id/request-backup-swap` | — | `D06-b` "ใบ 2 ยังอยู่" → แจ้งเจ้าของบ้าน "กรุณาเอา QR ใบ 2 ในตู้ไปติดแทน" → `D07` รอเจ้าของบ้าน |
| POST | `/admin/boxes/:box_id/qr/reissue` | `{ slots: (1 \| 2 \| "activate")[], reason }` | 201 `PrintableQr[]` — **เพิ่มรุ่น → ลายเซ็นเปลี่ยน → ใบเก่าใช้ไม่ได้ทันที** (`D07-b` ออกใหม่ 2 ใบ) |
| POST | `/admin/qr/:qr_id/dispatch-technician` | `{ urgent: boolean, note? }` | `D06` QR ปลอม → ส่งช่างด่วน + แจ้งหัวหน้าโซน |
| POST | `/admin/qr/:qr_id/resolve` | `{ note? }` | `D08` สถานะ → ปกติ + เก็บประวัติ |
| GET | `/admin/technician-requests` | `?status` | คำขอช่างจากเจ้าของบ้าน |
| PATCH | `/admin/technician-requests/:id` | `{ status: "scheduled" \| "done", scheduled_at?, note? }` | แจ้งเจ้าของบ้านเมื่อเปลี่ยนสถานะ |

```ts
interface QrCode {
  id: string; box_id: string; slot: 1 | 2 | "activate"; version: number;
  status: "active" | "revoked" | "used";          // used = activate ที่ผูกแล้ว
  health: "ok" | "suspicious" | "damaged" | "maybe_fake" | "backup_in_use" | "expiring";
  health_reasons: ("typed_by_officer" | "slow_scan" | "reported_damaged" | "rider_typed_often"
                   | "fake_scanned" | "not_scanned_2d" | "backup_used" | "age_11m")[];
  issued_at: string; last_scanned_at: string | null;
}
interface PrintableQr {           // สำหรับไฟล์พิมพ์ — ✅ ระดับแก้ข้อผิดพลาด H, ขนาดสแกนจากระยะแขน, เคลือบกันแดดกันน้ำ
  slot: 1 | 2 | "activate"; url: string;           // https://smmb.app/b/BX00042-1-K7M2QX หรือ /a/<16 ตัว>
  print_code: string;                               // H4KD-9TRW (ไม่มี 0/O, 1/I/L)
  svg: string;
}
```

- `GET /admin/boxes/:box_id/qr/print.pdf?slots=1,2` 💡 ไฟล์ PDF พร้อมพิมพ์ (QR + รหัสใต้ QR + รหัสตู้)

### 9.5 ค่าตั้งค่าตู้

| method | path | body | ตอบ |
|---|---|---|---|
| GET | `/admin/box-config` | — | `{ config_ver, config: BoxConfigDefaults, updated_at, updated_by }` (`D10`) |
| PUT | `/admin/box-config` | `BoxConfigDefaults` | เพิ่ม `config_ver` → ✅ ตู้ดึงค่าใหม่ภายใน 1 วัน (ตอนรายงานรายวัน) |
| PUT | `/admin/boxes/:box_id/config` | `Partial<BoxConfigDefaults>` | ค่าทับเฉพาะตู้ (เช่น ตู้ที่สัญญาณแย่ให้ `longpoll_wait_s` สั้นลง) |

```ts
interface BoxConfigDefaults {
  report_at: string;          // "23:30"
  scan_timeout_s: number;     // 20
  max_attempts: number;       // 3
  flash_when_dark: boolean;   // true
  longpoll_wait_s: number;    // 50
}
// ช่วงเวลาตรวจ (windows) ไม่อยู่ที่นี่ — มาจากโซน (§8.3) แล้ว server รวมให้แต่ละตู้
```

### 9.6 Log ทั้งหมด

| method | path | query | ตอบ |
|---|---|---|---|
| GET | `/admin/logs` | `?type&box_id&user_id&from&to&result&page&per_page` — `type`: `scan`, `delivery`, `inspection`, `box_problem`, `sos`, `terms`, `box_auth_fail`, `data_access` | paginated (`D11`) |
| GET | `/admin/logs/export.csv` | เหมือนข้างบน | CSV |

### 9.7 แพ็กเกจ (เพิ่ม 2026-10-27 — design §17)

| method | path | body | ตอบ |
|---|---|---|---|
| GET | `/admin/plans` | — | `Plan[]` ทุกแพ็กเกจ + จำนวนเจ้าของบ้านที่ใช้อยู่ |
| POST | `/admin/plans` | `{ code, name_th, name_en, features, price_note?, is_default?, sort_order? }` | 201 · `code` แก้ทีหลังไม่ได้ |
| PATCH | `/admin/plans/:code` | `{ name_th?, name_en?, features?, price_note?, is_default?, is_active? }` | `Plan` — ตั้ง `is_default` อันใหม่ = อันเก่าถูกปลดเอง (ผู้สมัครใหม่ได้อันใหม่ คนเดิมไม่เปลี่ยน) · `is_active=false` = เลือกให้คนใหม่ไม่ได้ คนเดิมใช้ต่อ |
| GET | `/admin/users/:id/plans` | — | ประวัติแพ็กเกจของเจ้าของบ้าน (ใหม่ → เก่า) — หน้าผู้ใช้ `D09` · หน้าตู้ `D04` แสดงแพ็กของเจ้าของตู้ (อ่านอย่างเดียว ลิงก์ไปหน้าผู้ใช้) |
| PUT | `/admin/users/:id/plan` | `{ plan_code, starts_at?, ends_at?, note? }` — `:id` ต้องเป็น owner (ไม่งั้น 400) | 200 `PlanInfo` — ปิดแถวเดิม + เพิ่มแถวใหม่ใน transaction เดียว · 409 `PLAN_OVERLAP` ถ้าช่วงทับแถวที่ตั้งล่วงหน้าไว้ · 400 `PLAN_INACTIVE` |

- `GET /admin/users` และ `GET /admin/boxes` รับ `?plan=<code>&plan_status=expiring|expired` เพิ่ม (`D09`, `D03` — ตู้กรองตามแพ็กของเจ้าของ) · `GET /admin/overview` มีจำนวนเจ้าของบ้านต่อแพ็กเกจ (`D01`)
- ✅ ตอนนี้มีแพ็กเดียว `free` — route จัดการรายการแพ็กเกจมีไว้รองรับแพ็กในอนาคต
- หน้าเว็บ (2026-10-27): รายการแพ็กเกจ = `D14` (ไม่มีใน wireframe) · เปลี่ยนแพ็กของเจ้าของบ้านอยู่ในหน้าผู้ใช้ `D09` · ตัวกรองแพ็กใน `D09`/`D03` แสดงเมื่อมีมากกว่า 1 แพ็ก · หน้าจอกันปิดแพ็กเริ่มต้น (ไม่งั้นคนสมัครใหม่ไม่มีแพ็ก) — server ควรกันด้วย
- 💡 แจ้งเตือน `plan_expiring` ถึงเจ้าของบ้าน + แอดมินล่วงหน้า 7 วัน

```ts
interface Plan { code; name_th; name_en; features: Record<string, number | boolean>; price_note: string | null;
                 is_default: boolean; is_active: boolean; sort_order: number; owners_count: number }
```

---

## 10. (สงวน) — เผื่อ API ของช่าง

✅ ตอนนี้ช่างใช้บัญชีแอดมิน หน้า `T01`–`T02-c` เป็นหน้าแนะนำ + ดูสถานะตู้ผ่าน `GET /admin/boxes/:box_id`
ถ้าแยกบทบาทช่างภายหลัง ให้ใช้ section นี้

---

## 11. สรุปสิทธิ์ (ฟังก์ชัน × บทบาท)

| ฟังก์ชัน | owner | officer | head | admin | ไรเดอร์ |
|---|---|---|---|---|---|
| ผูกตู้ / ตั้งชื่อตู้ | ✅ ตู้ตัวเอง | — | — | ✅ (unbind) | — |
| ดูสถานะ / ประวัติตู้ | ✅ ตู้ตัวเอง | — | — | ✅ ทุกตู้ | — |
| ตรวจตู้ | — | ✅ บ้านในโซนตัวเอง ในเวลาตรวจ | ✅ เหมือน officer | ❌ (ช่างทดสอบด้วย route admin 💡) | — |
| กด SOS | ✅ | — | — | — | — |
| รับ / ปิด SOS | — | ✅ ที่ส่งถึงตัวเอง | ✅ | ดูได้ | — |
| อนุมัติสมาชิก / รีเซ็ตรหัสลูกทีม | — | — | ✅ หน่วยงานตัวเอง | ✅ ทุกคน | — |
| จัดการโซน | — | — | ✅ | ดูได้ | — |
| Log การตรวจ | ประวัติตู้ตัวเอง | — | ✅ หน่วยงานตัวเอง | ✅ ทั้งหมด | — |
| อนุมัติหน่วยงาน | — | — | — | ✅ | — |
| จัดการ QR / ค่าตั้งค่าตู้ | ยืนยัน "ติดแล้ว" | แจ้ง QR เสีย | แจ้ง QR เสีย | ✅ | — |
| แพ็กเกจ (ของบัญชีเจ้าของบ้าน) | ดูของตัวเอง | — | — | ✅ ดู / ตั้ง / จัดการรายการ | — |
| แจ้งส่งของ (สแกน QR / กดปุ่มหน้าตู้) | — | — | — | — | ✅ ไม่ล็อกอิน |
| ดูโซน / ภาพรวมทีม | — | โซนที่ตัวเองอยู่ (หน้าสรุป) | ✅ ทุกโซนของหน่วยงาน (มีตัวกรอง "โซนของฉัน") | ✅ | — |

### ข้อมูลส่วนบุคคล — ใครเห็นอะไร (✅ ตัดสินแล้ว · server ตัดเท่านั้น ห้ามส่งแล้วให้ client ซ่อน)

| คนดู → ข้อมูลของ | เห็น | ไม่เห็น |
|---|---|---|
| เจ้าของบ้าน → เจ้าหน้าที่ | ประเภทหน่วยงาน · ชื่อหน่วยงาน · ชื่อที่ใช้แสดง · เวลา | เบอร์ (ยกเว้นตอน SOS เปิดอยู่) |
| เจ้าหน้าที่ → เจ้าของบ้าน (ตรวจ) | บ้านเลขที่ · ชื่อตู้ | ชื่อ · เบอร์ |
| เจ้าหน้าที่ → เจ้าของบ้าน (SOS เปิดอยู่) | + ชื่อ · เบอร์ | หลังปิด SOS กลับไปไม่เห็น |
| หัวหน้า → บ้าน | บ้านเลขที่ · ชื่อตู้ · สถานะตู้ | ชื่อ · เบอร์เจ้าของบ้าน |
| แอดมิน → ทุกคน | ทุกอย่าง | — (แต่ทุกการเปิดดูถูกบันทึก) |

---

## 12. Log

✅ **บันทึกทุกครั้งที่มีการสแกนหรือพิมพ์รหัส แม้ไม่ผ่าน** — ไม่มี route ให้ลบหรือแก้ log

```ts
interface ScanLogRow {
  id: string; at: string;
  actor: { kind: "officer" | "owner" | "rider" | "box"; user_id: string | null; display_name: string | null };
  box_id: string | null;             // null เมื่อ QR ไม่ใช่ของระบบ
  qr_kind: "front" | "activate" | "badge";
  qr_slot: 1 | 2 | null;
  method: "scan" | "code";
  result: "ok" | "qr_invalid" | "qr_not_system" | "not_in_zone" | "outside_window" | "service_closed"
        | "box_offline" | "pass" | "retry" | "fail" | "rate_limited";
  scan_ms: number | null;
  attempt: number | null;            // ฝั่งตู้: ครั้งที่ลอง
  box_signature_ok: boolean | null;  // ฝั่งตู้: ✅ มีลายเซ็นตู้
  inspection_id: string | null;
}
```

- data access log 💡: ทุก `GET /admin/users/:id`, `GET /admin/boxes/:box_id` และการเห็นเบอร์โทรใน SOS → `{ actor, subject, fields, at }`
- เก็บนานเท่าไร ❓ (ต้องตัดสินพร้อมข้อตกลง/นโยบายข้อมูลส่วนบุคคล)

---

## 13. API ของตู้ — `/v1/box/*` (สรุปจาก `SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md`)

> ฉบับเต็ม (ตัวอย่าง JSON ทุกตัว, ลำดับการคุย, กรณีผิดพลาด) อยู่ในไฟล์โปรโตคอล — ถ้าขัดกัน **ไฟล์โปรโตคอลชนะ**

### 13.0 กติกา

- ✅ **HTTPS (REST) อย่างเดียว ไม่ใช้ MQTT** · JSON · ข้อมูลต่อครั้ง ~200–400 ไบต์
- ✅ ทุกคำขอมี header 4 ตัว — **ไม่มี token ไม่มี cookie** (ประหยัดไฟ 1 รอบ)

```
X-Box-Id:     BX-00042
X-Timestamp:  1761123456                 (วินาที UTC)
X-Nonce:      9f2c41ab77e0                (สุ่มใหม่ทุกครั้ง)
X-Signature:  hex(HMAC-SHA256(device_secret, METHOD|PATH|TIMESTAMP|NONCE|SHA256(BODY)))
```

- `device_secret` = HMAC-SHA256(master key, box_id) · master key อยู่บนเซิร์ฟเวอร์เท่านั้น
- เซิร์ฟเวอร์เช็ก: ลายเซ็นตรง · เวลาห่างไม่เกิน ±60 วิ (ยกเว้น `boot`) · nonce ไม่ซ้ำใน 5 นาที (Redis) → ไม่ผ่าน **401** + log `box_auth_fail` ("ความพยายามปลอม")
- ทุกคำตอบมี `server_time` (ตู้ตั้งนาฬิกาตาม) และ `config_ver`
- TLS + ตู้ปักหมุดใบรับรอง (pinning) + session resumption

| # | เมื่อไหร่ | method + path | ตอบ |
|---|---|---|---|
| 13.1 | เปิดเครื่อง / ต่อ Wi-Fi ได้ครั้งแรก | `POST /v1/box/boot` `{ fw, config_ver, reset_reason, battery_pct, battery_mv, charging, rssi, wifi_ch }` | `{ server_time, config_ver, config? }` — `config` มาเมื่อเวอร์ชันไม่ตรง |
| 13.2 | วันละครั้ง (`report_at`) | `POST /v1/box/report` `{ fw, config_ver, battery_pct, battery_mv, charging, solar_mv, temp_c, rssi, wake_count, jobs_done, scan_fail, wifi_fail, uptime_s }` | `{ server_time, config_ver, config? }` · แบต < 20% → แจ้งแอดมิน + เจ้าของบ้าน |
| 13.3 | ในเวลาตรวจ (long-poll) | `GET /v1/box/jobs?wait=50` | มีงาน → `{ server_time, job: { job_id, type: "inspect", expires_at, scan_timeout_s, attempt_max } }` ทันที · ครบ 50 วิไม่มีงาน → **204** |
| 13.4 | เปิดไฟ + กล้องแล้ว | `POST /v1/box/jobs/{job_id}/ready` `{ light, flash }` | 200 → `Inspection.status = ready` · 410 job หมดอายุ |
| 13.5 | อ่าน QR ประจำตัวได้/ไม่ได้ (ทุกครั้งที่ลอง) | `POST /v1/box/jobs/{job_id}/result` `{ attempt, read_ok, qr_text, read_ms, flash }` | `{ status: "pass" }` · `{ status: "retry", attempts_left }` · `{ status: "fail" }` → ไฟ เขียว/กะพริบ/แดง |
| 13.6 | เหตุการณ์อื่น | `POST /v1/box/events` `{ type: "wifi_reset_button" \| "battery_critical" \| "camera_error" }` | 200 (ส่งครั้งเดียว ไม่ได้ก็ไม่เป็นไร) |
| 13.7 | **ไรเดอร์กดปุ่มหน้าตู้** (ได้ทุกเวลา — ปุ่มปลุกตู้จากหลับลึก) | `POST /v1/box/deliveries` `{ pressed_at, press_count, battery_pct }` | `{ server_time, status: "ok" \| "limited" \| "service_closed" }` → ไฟ เขียว / ส้มกะพริบ 💡 / แดง |

- ✅ ตู้**ไม่ตัดสินเอง**ว่าผ่านไหม ส่ง `qr_text` ที่อ่านได้ เซิร์ฟเวอร์ตรวจ: ลายเซ็นตู้ · `j` = job ของตู้นี้ · `u` = คนที่สแกน QR หน้าตู้ · ยังไม่หมดอายุ
- ✅ ส่งผลไม่ได้ → **ทิ้ง** ไม่เก็บไว้ส่งทีหลัง (นับใน `scan_fail` ของรายงานรายวัน)
- คำขอซ้ำ (เน็ตกระตุก) → กุญแจกันซ้ำ = `job_id + attempt` → ตอบผลเดิม · ปุ่มส่งของใช้ `X-Nonce` เป็นกุญแจกันซ้ำ
- **ปุ่มหน้าตู้ (13.7)** 💡:
  - ตู้รอ ~3 วิ รวมการกดเป็นคำขอเดียว (`press_count`) · ไม่รับกดใหม่ระหว่างส่งและอีก ~30 วิ หลังส่ง — กันเด็กกดเล่นจนแบตหมด
  - ลายเซ็นตู้ = พิสูจน์ว่ามีคนอยู่หน้าตู้จริง (น่าเชื่อกว่าสแกน QR ที่อาจมาจากรูปถ่าย)
  - ส่งไม่ได้ → ลองใหม่ 3 ครั้ง (5 / 15 / 45 วิ) แล้ว**ทิ้ง** + นับใน `delivery_fail` ของรายงานรายวัน (ไม่เก็บไว้ส่งทีหลัง เหมือนกติกาผลสแกน) ❓
  - ในเวลาตรวจที่ตู้ถือ long-poll อยู่ → เปิด connection ที่สองส่งคำขอนี้ ไม่ต้องรอ long-poll หมด
- 💡 prefix `/v1/box/` (ไม่มี `/api`) ตามไฟล์โปรโตคอล — reverse proxy ส่งเข้า NestJS ตัวเดียวกัน · ถ้าจะรวมเป็น `/api/v1/box/` ต้องแก้ไฟล์โปรโตคอลและเฟิร์มแวร์พร้อมกัน ❓

---

## 14. แจ้งเตือน (Web Push) — type และ payload

payload ที่ส่งให้ service worker (✅ 2026-10-27 — รูปแบบที่ service worker ของ Angular แสดงได้เลย ไม่ต้องเขียน SW เอง):

```json
{ "notification": {
    "title": "…", "body": "…", "lang": "th", "icon": "icons/icon-192x192.png", "badge": "icons/icon-72x72.png",
    "tag": "sos-…", "renotify": true, "requireInteraction": true,
    "data": { "id": "<notification id>", "type": "sos_new", "link": "/officer/sos/…", "data": { … },
              "onActionClick": { "default": { "operation": "navigateLastFocusedOrOpen", "url": "/officer/sos/…" } } } } }
```

`tag` ใช้รวมแจ้งเตือนซ้ำ (เช่น SOS เดียวกันขั้นต่าง ๆ ใช้ tag เดียว) · `requireInteraction` มีเฉพาะ `sos_new` · กดแจ้งเตือน = เปิด/โฟกัสเว็บแอปที่ `link`

| type | ถึงใคร | ตัวอย่างข้อความ | link |
|---|---|---|---|
| `inspected` | เจ้าของบ้าน | 👮 ตำรวจ สภ.X · ส.ต.ต. สมชาย มาตรวจ 22:15 | `/history/:event_id` |
| `delivered` | เจ้าของบ้าน | 🛵 มีของมาส่ง | `/history/:event_id` |
| `box_offline` | เจ้าของบ้าน + แอดมิน | ⚠️ ตู้ไม่ออนไลน์ (ถึงเวลาตรวจแล้วตู้ไม่ขึ้น) | `/` |
| `low_battery` | เจ้าของบ้าน + แอดมิน | 🔋 แบตตู้เหลือ 18% | `/` |
| `swap_backup_qr` | เจ้าของบ้าน | 📮 กรุณาเอา QR ใบ 2 ในตู้ไปติดแทน | `/` |
| `box_problem` | เจ้าของบ้าน + แอดมิน | ⚠️ เจ้าหน้าที่แจ้งว่าตู้ไม่ตอบ | `/` |
| `sos_new` | เจ้าหน้าที่ (ตามขั้น) | 🆘 SOS บ้าน 99/9 · 081-xxx | `/officer/sos/:id` |
| `sos_taken` | เจ้าหน้าที่คนอื่น | รับแล้วโดย ส.ต.ต. สมชาย | `/officer/sos/:id` |
| `sos_accepted` / `sos_closed` | เจ้าของบ้าน | รับเรื่องแล้ว / ปิดเรื่องแล้ว | `/sos/:id` |
| `sos_cancelled` | เจ้าหน้าที่ที่ได้รับ | SOS ถูกยกเลิกแล้ว | `/officer/sos/:id` |
| `member_pending` | หัวหน้า | มีคนขอเข้าหน่วยงาน | `/agency/members` |
| `member_approved` / `member_rejected` | เจ้าหน้าที่ | — | `/` |
| `agency_pending` | แอดมิน | หน่วยงานใหม่รออนุมัติ | `/admin/agencies` |
| `agency_approved` / `agency_rejected` | หัวหน้า | — | `/agency` |
| `qr_fake` | แอดมิน (ทันที) + หัวหน้าโซน | 🚨 พบ QR ที่ไม่ใช่ของระบบ ตู้ BX-00042 | `/admin/qr/:id` |
| `qr_health` | แอดมิน (หลังงาน 23:00) | QR ไม่ปกติ 3 ใบ | `/admin/qr` |
| `box_silent_26h` | แอดมิน | ตู้ไม่รายงานเกิน 26 ชม. | `/admin/boxes/:id` |
| `technician_request` | แอดมิน | เจ้าของบ้านขอช่าง (เปลี่ยน Wi-Fi) | `/admin/technician-requests` |
| `plan_expiring` 💡 | เจ้าของบ้าน + แอดมิน | แพ็กเกจของตู้จะหมดอายุใน 7 วัน | `/settings` |

- SOS ใช้ `requireInteraction: true` + `renotify: true` (เด้งค้างจนกด) 💡 · iOS ไม่รองรับบางตัวเลือก ต้องทดสอบ

---

## 15. รายการ `code` ของ error

| code | status | เกิดที่ | หน้าจอ |
|---|---|---|---|
| `NO_SESSION` / `SESSION_EXPIRED` / `SESSION_REVOKED` | 401 | ทุก route | `A04` |
| `INVALID_CREDENTIALS` | 401 | signin, change-password | `A04-b` |
| `ACCOUNT_LOCKED` / `ACCOUNT_DISABLED` | 401 | signin (`ACCOUNT_DISABLED` ทุก route ด้วย) | `A04-b` |
| `RATE_LIMITED` | 429 | ทุก route (เพดานต่อ IP) | ข้อความรอ |
| `ACCOUNT_PENDING` / `ACCOUNT_REJECTED` | 403 | ทุก route ของ officer/head | `A11`, `A11-b`, `L02`, `L02-b` |
| `TERMS_NOT_ACCEPTED` / `TERMS_UPDATE_REQUIRED` | 400 / 403 | signup / ทุก route | `A06-b` / `A13` |
| `PHONE_TAKEN` | 409 | signup | ฟอร์ม + "ล็อกอินแล้วเพิ่มบทบาท" |
| `ROLE_EXISTS` | 409 | `/me/roles/owner`, `/me/agency/join` | ข้อความ |
| `ADMIN_ROLE_EXCLUSIVE` | 403 | เพิ่มบทบาท (`/me/*`, `/admin/users/:id/roles`) | ข้อความ — บัญชีแอดมินมีบทบาทอื่นร่วมไม่ได้ |
| `GROUP_CODE_INVALID` | 404 | signup officer | ฟอร์ม |
| `PUSH_REQUIRED` | 403 | route ของ officer/head | `A12` |
| `PUSH_UNAVAILABLE` | 503 | `/me/push/vapid-key`, `/me/push/test` | ข้อความ — server ยังไม่ได้ตั้ง VAPID key |
| `PASSWORD_CHANGE_REQUIRED` | 403 | ทุก route หลังถูกรีเซ็ตรหัส | หน้าเปลี่ยนรหัส |
| `CANNOT_CHANGE_SELF` | 403 | หัวหน้า/แอดมินทำกับบัญชีตัวเอง | ข้อความ |
| `RESET_NEEDS_ADMIN` | 403 | หัวหน้ารีเซ็ตรหัสคนที่เป็นเจ้าของบ้าน/หัวหน้าด้วย | ข้อความ "ติดต่อแอดมิน" |
| `MEMBER_NOT_PENDING` / `MEMBER_STATE_INVALID` | 409 | `/agency/members/*` | รีเฟรชรายการ |
| `AGENCY_NOT_PENDING` | 409 | `/admin/agencies/:id/approve\|reject` | รีเฟรชรายการ |
| `QR_INVALID` / `QR_REVOKED` | 404 / 410 | activate, public, inspections | `A07-b`, `R03`, `O04-b` |
| `QR_NOT_SYSTEM` | 422 | inspections | `O04` |
| `CODE_ATTEMPTS_EXCEEDED` | 429 | ทุกที่ที่พิมพ์รหัส | ข้อความรอ |
| `BOX_ALREADY_OWNED` | 409 | activate | `A07-c` |
| `BOX_SERVICE_CLOSED` | 403 | public, inspections | `R03-b`, `O04-b` |
| `DELIVERY_LIMIT` | 429 | public deliveries | `R03-c` |
| `TICKET_EXPIRED` | 410 | public deliveries | สแกนใหม่ |
| `NOT_IN_ZONE` | 403 | inspections | `O04-b` |
| `OUTSIDE_PATROL_WINDOW` | 409 | inspections | `O04-b` |
| `BOX_OFFLINE` | 503 | inspections | `O05-b` |
| `NOT_READY` / `INSPECTION_CLOSED` | 409 / 410 | badge | — |
| `SOS_NO_COVERAGE` | 200 (ไม่ใช่ error) | `POST /sos` | `H08` |
| `SOS_ALREADY_OPEN` | 409 | `POST /sos` | หน้ารอเดิม |
| `SOS_ALREADY_TAKEN` | 409 | accept | `O09-b` |
| `SOS_CANCELLED` | 410 | accept | `O09-c` |
| `LAST_HEAD` | 409 | ถอดหัวหน้า | — |
| `WINDOWS_INVALID` | 400 | สร้าง/แก้โซน | `L07` แสดงข้อความใต้ช่องเวลา |
| `ZONE_NAME_TAKEN` | 409 | สร้าง/แก้โซน | `L07` |
| `OFFICER_NOT_MEMBER` | 400 | `PUT /agency/zones/:id/officers` | รีเฟรชรายชื่อ (`L07-c`) |
| `NO_SWAP_REQUESTED` | 409 | backup-placed | — |
| `PLAN_FEATURE_REQUIRED` | 403 | route ที่ขึ้นกับแพ็กเกจ | ข้อความ "แพ็กเกจของคุณยังไม่มีฟีเจอร์นี้" |
| `PLAN_OVERLAP` / `PLAN_INACTIVE` | 409 / 400 | `PUT /admin/users/:id/plan` | — |

---

## 🔜 ยังไม่ทำ / ยังไม่ตัดสิน (รวมจากทั้งไฟล์)

- ทุก endpoint ในไฟล์นี้ — **ยังไม่มีโค้ด** (ลำดับทำดู `smmb-design.md` §13)
- ❓ SSE หรือ poll ทุก 1 วิ สำหรับหน้า `O05`/`O06` และหน้ารอ SOS
- ❓ เพดานส่งของต่อตู้ของไรเดอร์ / เกณฑ์ "ไรเดอร์พิมพ์แทนสแกนเกินเกณฑ์" (เสนอ 3 ครั้งใน 7 วัน)
- ❓ บ้านเดียวอยู่ในโซนของ**หลายหน่วยงาน**ได้ไหม (เช่น ตำรวจ + รปภ.หมู่บ้าน) — กระทบ `PUT /agency/zones/:id/houses` และขั้น SOS
- ❓ ปิดสิทธิ์เจ้าหน้าที่ = ถอดออกจากโซนด้วยไหม
- ❓ ชื่อโดเมนจริง (ทั้งไฟล์ใช้ `smmb.app` เป็นตัวอย่าง)
- ❓ prefix ของ API ตู้ `/v1/box/` vs `/api/v1/box/`
- ❓ ระยะเวลาเก็บ log / นโยบายข้อมูลส่วนบุคคล
- 🧪 สมาชิกในบ้าน (§4.6) — รอลูกค้าตัดสิน
- ❓ แพ็กในอนาคตมีอะไร ต่างกันตรงไหน หมดอายุแล้วตัดอะไร (§4.5 — ✅ ผูกกับเจ้าของบ้าน, เริ่มต้นฟรี)
- ❓ ปุ่มหน้าตู้: กดแล้วตู้พักกี่วินาทีก่อนรับกดใหม่ · ส่งไม่ได้ลองใหม่กี่ครั้ง · ไฟบอกผลแบบไหน (§13.7)
