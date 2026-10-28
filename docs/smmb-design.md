# แผนงาน: ระบบ SMMB (Smart Mailbox) — ตู้ + เว็บแอป + backend

> **สถานะ (2026-10-27): ออกแบบเสร็จ ยังไม่เริ่มเขียนโค้ด**
> มีแล้ว: ผังงาน `SMMB_Flowchart_v11.drawio` · โปรโตคอลตู้ร่างแรก · ขั้นตอนการใช้งานแยกตามผู้ใช้ · wireframe + prototype 110 หน้า (`SMMB Wireframe.figcraft`)
> ไฟล์นี้รวม "ทำไม" และ "เก็บข้อมูลยังไง" ไว้ที่เดียว ใช้เป็นจุดเริ่มเวลาเริ่มเขียน backend (หรือให้คนอื่น/session ใหม่ทำต่อ)
>
> อ่านคู่กับ: [`api.md`](api.md) (สัญญา endpoint) · [`HANDOFF.md`](HANDOFF.md) (สถานะ + ไฟล์ทั้งหมด)
> เอกสารต้นทางใน Project: `SMMB_สรุปการตัดสินใจ_2026-10-22.md` · `SMMB_ขั้นตอนการใช้งานแต่ละคน.md` · `SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md`
>
> สัญลักษณ์: ✅ ตัดสินแล้ว · 💡 เสนอ ยังไม่ได้ตกลง · ❓ ต้องตัดสิน · 🧪 ข้อเสนอนอกขอบเขต
>
> **rev 3 (2026-10-27 บ่าย 2)** — §17 แพ็กเกจย้ายไปผูกกับ**บัญชีเจ้าของบ้าน** (เริ่มต้นฟรี, แพ็กอื่นค่อยเพิ่ม) · §18 ผู้ใช้ยืนยันแบบ C · เพิ่ม §19 ไรเดอร์**กดปุ่มหน้าตู้**ได้
>
> **rev 2 (2026-10-27 บ่าย)** — เพิ่ม §17 แพ็กเกจของตู้ (เก็บใน DB แสดงผล ไม่มีชำระเงิน) และ §18 ขอบเขตโซนของหัวหน้า (เสนอแบบ C รอยืนยัน)
>
> **rev 1 (2026-10-27)** — รวมจากประชุมรีวิว flow 21 ต.ค. (ใช้เป็นหลัก) + การคุยออกแบบ 21–22 ต.ค. + การทำ wireframe 23–26 ต.ค.
> โครงสร้างข้อมูล (§4) และ state machine (§6, §7) เป็นร่างของไฟล์นี้เอง ยังไม่ได้รีวิวกับทีม

---

## 1. โจทย์

ตู้หน้าบ้านที่ให้**เจ้าหน้าที่ (ตำรวจ / รปภ. / อื่น ๆ) ยืนยันว่ามาตรวจจริง** โดยปลอมไม่ได้ + ให้**ไรเดอร์แจ้งส่งของ** + ให้**เจ้าของบ้านกด SOS** ถึงเจ้าหน้าที่ในโซน
ทุกอย่างผ่านเว็บแอปตัวเดียว ช่วงนี้เป็น**รุ่นทดลอง (beta)** — เลือกทางที่ง่ายที่สุดที่ยังปลอดภัย ตัดฟีเจอร์ที่พัฒนายากทิ้ง

ข้อตกลงจากการคุย:

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | ตู้ทำอะไรบ้าง | ✅ **อ่าน QR** + ✅ **ปุ่มส่งของหน้าตู้** (เพิ่ม 2026-10-27 §19) — ไม่มีไซเรน ไม่ถ่ายรูป ไม่มี IR / RFID / PIR / SD card · มีไฟส่อง QR + ไฟสถานะ + อ่านระดับแบต |
| 2 | ยืนยันตัวเจ้าหน้าที่ยังไง | ✅ สแกน QR หน้าตู้ด้วยแอป → เซิร์ฟเวอร์ปลุกตู้ → แอปแสดง **QR ประจำตัว (เปลี่ยนทุก 30 วิ)** → กล้องตู้อ่าน → เซิร์ฟเวอร์ตัดสิน |
| 3 | ไฟเลี้ยงตู้ | ✅ โซลาร์ (แผง 2W + 18650 ×2 ขนาน ตามเอกสารฮาร์ดแวร์) · อยากให้รองรับทั้งไฟบ้านและโซลาร์ |
| 4 | ตู้ประหยัดไฟยังไง | ✅ **วิธี D**: ในเวลาตรวจหลับเบา ต่อ Wi-Fi ค้าง (ปลุกได้ 1–3 วิ) · นอกเวลาหลับลึก **ไม่รับงาน** ตื่นแค่ตอนถึงเวลาตรวจและรายงานรายวัน |
| 5 | ตรวจนอกเวลาได้ไหม | ✅ **ไม่ได้** — สแกนนอกเวลา = "นอกเวลาตรวจ ไม่บันทึก" |
| 6 | ตู้คุยกับเซิร์ฟเวอร์ทางไหน | ✅ **HTTPS (REST) ไม่ใช้ MQTT** · นอกเวลา ตื่น-ส่ง-หลับ · ในเวลาตรวจ long-polling |
| 7 | ยืนยันตัวตนตู้ | ✅ HMAC-SHA256 ทุกคำขอ (รหัสลับประจำตู้ = HMAC(master key, box_id)) + timestamp + nonce |
| 8 | บันทึกออฟไลน์แล้วซิงก์ทีหลัง | ✅ **ไม่** (กันปลอม) · สแกนไม่ผ่านลองได้ 3 ครั้ง แล้วแจ้งปัญหาตู้ |
| 9 | แอป | ✅ **เว็บแอปอย่างเดียว** (Angular) — ไม่มีแอป iOS/Android · เปิดนอก LINE · iPhone ต้องเพิ่มลงหน้าจอหลัก · รองรับทั้ง Android และ iPhone |
| 10 | แจ้งเตือน | ✅ Web Push ผ่าน service worker · ✅ ไม่ใช้ LINE (LINE Notify ปิดแล้ว, LIFF ไม่ใช้) |
| 11 | backend | ✅ NestJS · self-host บนเซิร์ฟเวอร์ Ubuntu ของเราเอง |
| 12 | OTP | ✅ **ไม่มีทั้งระบบ** |
| 13 | ลืมรหัส | ✅ ผู้ใช้รีเซ็ตเองไม่ได้ — หัวหน้ารีเซ็ตให้ลูกทีม / แอดมินรีเซ็ตให้ทุกคน |
| 14 | ค่าบริการ | ✅ **ใช้ฟรีช่วงทดลอง** ไม่มีชำระเงิน · **เพิ่ม 2026-10-27**: เก็บ "แพ็กเกจ" ของ**บัญชีเจ้าของบ้าน**ไว้ใน DB และแสดงให้เจ้าของบ้าน/แอดมินเห็น (✅ แพ็กเริ่มต้น = **ฟรี** · แพ็กอื่นค่อยเพิ่มทีหลัง · แอดมินเป็นคนตั้ง · ยังไม่มีการคิดเงินในระบบ) — §17 |
| 14.1 | หัวหน้าเห็นโซนแค่ไหน | ✅ **เห็นทุกโซนของหน่วยงาน + มีตัวกรองโซน** (ผู้ใช้ยืนยัน 2026-10-27) — §18 |
| 15 | บทบาท | ✅ 5 บทบาท: แอดมิน · เจ้าของบ้าน · หัวหน้าหน่วยงาน · เจ้าหน้าที่ · ไรเดอร์ — เก็บเป็น Role + Level (Level ยังไม่ใช้) |
| 16 | หน่วยงานเข้าระบบยังไง | ✅ สมัครเองแล้วรอแอดมิน Verify (ทางเลือก: แอดมินสร้างให้แล้วแจกรหัสกลุ่ม) |
| 17 | เจ้าหน้าที่เข้าระบบยังไง | ✅ สมัครด้วยรหัสกลุ่ม → หัวหน้ายืนยัน |
| 18 | ใครกำหนดว่าใครตรวจบ้านไหน | ✅ **หัวหน้าสร้างโซน**: ใส่บ้าน + ใส่เจ้าหน้าที่ + ตั้งช่วงเวลาตรวจ · 1 คนหลายโซน / 1 โซนหลายคน |
| 19 | หัวหน้า | ✅ มีได้หลายคน · **หัวหน้าตรวจตู้ได้** (หัวหน้า = เจ้าหน้าที่ + สิทธิ์จัดการ) |
| 20 | เจ้าของบ้านเข้าระบบยังไง | ✅ สมัครเอง (ต่อหน้าช่าง) → สแกน Activate QR ในตู้เพื่อผูก · เจ้าของ 1 คนมีหลายตู้ได้ |
| 21 | บ้านที่ยังไม่อยู่ในโซน | ✅ หน้าหลักขึ้น "ยังไม่มีเจ้าหน้าที่ดูแล" · กด SOS → บอกให้โทร 191/1669 ทันที |
| 22 | ไรเดอร์ | ✅ แบบง่ายสุด: **สแกน QR หน้าตู้ → กดส่งของ** หรือ ✅ **กดปุ่มที่หน้าตู้** (เพิ่ม 2026-10-27 §19) → จบ · ไม่ล็อกอิน ไม่เก็บข้อมูล ไม่ถ่ายรูป · ทำได้ทุกเวลา · จำกัดจำนวนครั้งต่อตู้ (นับรวมทั้งสองทาง) |
| 23 | QR ต่อตู้ | ✅ **QR หน้าตู้ 2 ใบ** (ใบ 1 ติดหน้าตู้ / ใบ 2 สำรองในตู้ — รหัสต่างกันแต่ชี้ตู้เดียวกัน) + **Activate QR** ในตู้ |
| 24 | QR หน้าตู้ใบเดียวใช้ 2 แบบได้ไง | ✅ เป็นลิงก์ — กล้องมือถือธรรมดาเปิด → หน้าส่งของ (ไรเดอร์) / สแกนผ่านปุ่มในแอป → ขั้นตรวจ (เจ้าหน้าที่) |
| 25 | Log | ✅ **บันทึกทุกครั้ง แม้ไม่ผ่าน**: ใคร · ตู้ · QR ใบไหน · สแกนหรือพิมพ์รหัส · ผล · เวลา · ฝั่งตู้บันทึก UID ที่อ่านได้ + ครั้งที่ลอง (มีลายเซ็นตู้) |
| 26 | SOS | ✅ กดค้าง 3 วิ · ส่งเป็นขั้น 0 / 30 / 60 วิ · หน้ารอมีปุ่มโทร 191 / 1669 / ยกเลิก · ปุ่มโทรใช้แอปโทรศัพท์ของเครื่อง · ข้อตกลงต้องเขียนว่า SOS ไม่ได้แทน 191 |
| 27 | Wi-Fi ของตู้ | ✅ ช่วงทดลองช่างตั้งให้ · เปลี่ยนเองได้ด้วยปุ่ม Boot บนบอร์ด · หรือแจ้งช่างผ่านแอป |
| 28 | กล้องมือถือ / แจ้งเตือน | ✅ ขอสิทธิ์กล้องตอนกด "สแกน" ครั้งแรก (ไม่อนุญาต → พิมพ์รหัส) · **เจ้าหน้าที่ต้องเปิดแจ้งเตือนก่อนใช้งาน** (ไม่งั้นไม่ได้รับ SOS) |

**เหตุผลที่ตู้ "อ่าน" QR ของเจ้าหน้าที่ ไม่ใช่เจ้าหน้าที่ "อ่าน" QR ของตู้อย่างเดียว**
QR หน้าตู้เป็นกระดาษ ใครถ่ายรูปไปก็สแกนจากที่ไหนก็ได้ → พิสูจน์ไม่ได้ว่ายืนอยู่หน้าตู้
ขั้นที่ตู้ต้องอ่าน QR ประจำตัว (อายุ 30 วิ ผูกกับงานของตู้นั้น) คือสิ่งที่พิสูจน์ว่า**คนนั้นอยู่หน้าตู้จริงตอนนั้น**

---

## 2. ภาพรวมระบบ

```
 ┌───────────────┐   HTTPS + HMAC ทุกคำขอ    ┌──────────────────────────────┐
 │ ตู้ ESP32-CAM  │ ───────────────────────▶ │  NestJS (Ubuntu ของเรา)       │
 │ โซลาร์ + 18650 │  boot / report / jobs     │  ├─ /v1/box/*   (ตู้)          │
 │ กล้อง + ไฟส่อง  │ ◀── long-poll (ในเวลาตรวจ) │  ├─ /api/v1/*   (เว็บแอป)      │
 └───────────────┘                            │  ├─ scheduler   (งานเบื้องหลัง) │
                                              │  └─ web-push    (VAPID)        │
 ┌───────────────┐   HTTPS + cookie sid       │                                │
 │ เว็บแอป Angular │ ───────────────────────▶ │  PostgreSQL 💡  ·  Redis 💡     │
 │ (PWA ทุกบทบาท)  │ ◀── SSE / Web Push       │  (nonce, long-poll, lock, cache)│
 └───────────────┘                            └──────────────────────────────┘
 ┌───────────────┐   เปิดลิงก์ QR หน้าตู้ (ไม่ล็อกอิน)
 │ มือถือไรเดอร์    │ ─────────────────────────▶ หน้า /b/<token> ของเว็บแอปตัวเดียวกัน
 └───────────────┘
```

- **เว็บแอปตัวเดียวทุกบทบาท** — หน้าที่เห็นขึ้นกับ `role` (ไม่ทำแอปแยก 5 ตัว)
- **long-poll ของตู้ต้องไม่บล็อก NestJS** — ใช้ Redis pub/sub (หรือ in-memory ถ้ามี instance เดียว) ปลุก request ที่ถือค้างไว้เมื่อมี job · ตู้ 1 ตู้ = connection ค้าง 1 เส้นตลอดเวลาตรวจ → ตั้ง keep-alive/timeout ของ reverse proxy ให้ยาวกว่า `longpoll_wait_s` (50 วิ)
- 💡 PostgreSQL + Redis — ยังไม่ได้ตกลงในทีม (โปรโตคอลตู้อ้าง Redis ไว้สำหรับ nonce)

---

## 3. บทบาทและขอบเขต

| บทบาท | ขอบเขต | ได้มายังไง |
|---|---|---|
| `admin` | ทั้งระบบ (ช่างติดตั้งใช้บัญชีนี้) | สร้างใน seed / แอดมินตั้ง |
| `owner` | ตู้ที่ผูกไว้ (`boxes.owner_id = me`) | สมัครเอง |
| `officer` | บ้านในโซนที่ตัวเองอยู่ + SOS ที่ส่งถึงตัวเอง | สมัครด้วยรหัสกลุ่ม → หัวหน้ายืนยัน |
| `head` | **จัดการ/ดู**: ทุกโซนของหน่วยงานตัวเอง (§18) · **ตรวจตู้**: เฉพาะโซนที่ตัวเองอยู่ (เหมือน officer) | สมัครหน่วยงาน (→ แอดมินอนุมัติ) หรือหัวหน้าคนอื่นตั้งให้ |
| ไรเดอร์ | ไม่มีบัญชี — ทำได้แค่สแกน QR หน้าตู้ + กดส่งของ | — |

- 💡 เก็บ `head` เป็น `agency_members.is_head` ไม่ใช่ role แยกในตาราง users — เพราะหัวหน้าเป็นเจ้าหน้าที่ด้วย และ "ตั้งหัวหน้าเพิ่ม" แค่พลิก flag
  ดังนั้น `users.role` มี 3 ค่า (`admin` / `owner` / `officer`) และ API คิด `head` จาก flag
- ✅ ช่อง `users.level` มีไว้ แต่ยังไม่ใช้ตัดสินอะไร
- ✅ (2026-10-27) คนเดียวเป็นทั้งเจ้าของบ้านและเจ้าหน้าที่ได้ → **1 เบอร์ 1 บัญชี หลายบทบาท** (`user_role_tb` §4) · ใช้รหัสผ่านเดียว แจ้งเตือนชุดเดียว · หน้าเว็บมีปุ่มสลับบทบาท
- ทุก query ของ officer/head กรองด้วย zone/agency **ใน SQL** ไม่ใช่กรองทีหลังใน service — ของนอกขอบเขตตอบ 404

---

## 4. โครงสร้างข้อมูล (ร่าง — PostgreSQL 💡)

```
app.user_tb ─┬─< app.user_role_tb                       (บทบาท: admin / owner / officer — 1 เบอร์หลายบทบาท ✅ 2026-10-27)
             ├─< app.agency_member_tb >── app.agency_tb
             │         │
             │         └─< app.zone_officer_tb >── app.zone_tb ──< app.zone_window_tb
             │                                        │
             ├─< app.box_tb (owner_user_id) ──────< app.zone_box_tb
             │       ├─< app.box_qr_code_tb
             │       ├─< app.box_report_tb          (รายงานรายวันจากตู้)
             │       ├─< app.box_job_tb ──< app.inspection_tb ──< app.inspection_attempt_tb
             │       ├─< app.delivery_tb
             │       └─< app.sos_case_tb ──< app.sos_recipient_tb
             ├─< app.user_plan_tb >── app.plan_tb   (แพ็กเกจของเจ้าของบ้าน §17)
             ├─< app.push_subscription_tb
             ├─< app.notification_tb
             ├─< app.terms_acceptance_tb >── app.terms_tb
             └─< app.session_tb
app.scan_log_tb · app.data_access_log_tb · app.box_config_tb · app.technician_request_tb · app.migration_tb (ตัวรัน migration)
```

### การตั้งชื่อ (✅ ผู้ใช้กำหนด 2026-10-27)

| ของ | กติกา | ตัวอย่าง |
|---|---|---|
| ตาราง | เอกพจน์ + `_tb` | `user_tb`, `agency_member_tb` |
| คีย์หลักที่สร้างเอง | `<ชื่อตาราง>_id` | `user_tb.user_id`, `zone_tb.zone_id` |
| คีย์ธรรมชาติ | ชื่อตามความหมาย | `plan_tb.plan_code`, `terms_tb.terms_version` |
| FK | ชื่อเดียวกับคีย์ปลายทาง · ชื่อชนกันใส่คำนำหน้า | `zone_officer_tb.user_id`, `box_tb.owner_user_id` |
| ผู้กระทำ | `<กริยา>_by` | `approved_by`, `granted_by`, `set_by` |
| เวลา | `*_date` (ชนิด **timestamptz** — ชื่อว่า date แต่เก็บวัน+เวลา UTC) | `created_date`, `expire_date`, `read_date` |
| ทุกตาราง | `created_date` + `updated_date` (trigger `app.set_updated_date()` ตั้งให้เอง) | — |
| ตาราง log / หลักฐาน (เพิ่มอย่างเดียว) | มีแค่ `created_date` | `scan_log_tb`, `terms_acceptance_tb` |

⚠️ **ชื่อในฐานข้อมูลใช้ในฐานข้อมูลเท่านั้น** — API ใช้ชื่อตาม `api.md` (`id`, `created_at` …) · ทุก endpoint แปลงผ่าน mapper ที่ระบุฟิลด์ชัด **ห้ามส่งแถวจากฐานข้อมูลออก API ตรง ๆ / ห้าม `SELECT *` ในโค้ดที่ตอบ API** (กันคอลัมน์ใหม่หรือ `password_hash` หลุด — กฎข้อมูลส่วนบุคคล api §11)

### DDL เฟส 1 — ต้นฉบับคือ `backend/sql/migrations/0001_init.sql` ✅ (เขียนแล้ว 2026-10-27)

`user_tb` · `user_role_tb` · `session_tb` · `agency_tb` · `agency_member_tb` · `zone_tb` · `zone_window_tb` · `zone_officer_tb` · `box_tb` · `zone_box_tb` · `plan_tb` (+ seed `free`) · `user_plan_tb` · `terms_tb` · `terms_acceptance_tb` · `push_subscription_tb` · `notification_tb`

อ่านจากไฟล์ migration โดยตรง (ไม่คัดลอกมาไว้ที่นี่ จะได้ไม่มีสองที่ที่ต้องแก้ให้ตรงกัน) · จุดที่ต่างจากร่างเดิม:

- **1 เบอร์หลายบทบาท** — `user_tb` เก็บแค่ตัวตน (`status` เหลือ `active`/`disabled` ทั้งบัญชี) · บทบาทอยู่ `user_role_tb (user_id, role, level, status)` · มีแถวเฉพาะบทบาทที่**ได้รับแล้ว** — คำขอเป็นเจ้าหน้าที่ที่รอ/ถูกปฏิเสธอยู่ `agency_member_tb.status` ที่เดียว · แถว `officer` ถูกสร้างตอนหัวหน้าอนุมัติ (หัวหน้าเอง: ตอนแอดมินอนุมัติหน่วยงาน) · `head` ยังเป็น `agency_member_tb.is_head`
- **แอดมินห้ามมีบทบาทอื่น** — trigger `check_admin_exclusive` ในฐานข้อมูล (มือถือที่ใช้ทุกวันหาย = ไม่เสียสิทธิ์สูงสุด · ช่างใช้เบอร์แยก)
- **session เก็บ hash ของ token** (`session_tb.token_hash`) ไม่ใช่ token ตรง ๆ — ฐานข้อมูลหลุดก็เอา cookie ไปสวมรอยไม่ได้ · มี `token_version` ไว้เทียบกับ `user_tb` เพื่อเตะ session
- `user_id` / `box_id` สร้างจาก sequence (`U-0001`, `BX-00001`) · `phone` มี CHECK ต้องเป็น `0` + 9 หลัก
- `box_tb` มีแค่คอลัมน์พื้นฐานในเฟส 1 (เพราะ `zone_box_tb` ต้องอ้าง) — QR / job / รายงาน มาในเฟส 2
- ชื่อโซนซ้ำได้ถ้าโซนเดิมถูกลบแล้ว (unique index เฉพาะ `deleted_date IS NULL`)
- **`0003_agency_admin.sql`** — `agency_tb.reject_reason` · สร้าง `data_access_log_tb` (ย้ายมาจากร่างเฟส 2 ด้านล่าง) · trigger ห้าม UPDATE/DELETE บน `data_access_log_tb` และ `terms_acceptance_tb`
- **`0002_push_session.sql`** — `push_subscription_tb.session_id` (ลบ session = ลบ subscription) · ส่ง push เฉพาะเครื่องที่ session ยังใช้ได้ → ออกจากระบบแล้วเครื่องนั้นไม่ได้แจ้งเตือนอีก (api §3)

### DDL เฟส 2 ขึ้นไป (ร่าง — ยังไม่ได้เขียนเป็น migration)

```sql
CREATE TABLE app.box_qr_code_tb (
  box_qr_code_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id text NOT NULL REFERENCES app.box_tb (box_id),
  slot text NOT NULL CHECK (slot IN ('1','2','activate')),
  version int NOT NULL,                                 -- ออกใหม่ = +1 → ลายเซ็นเปลี่ยน → ใบเก่าตาย
  token text NOT NULL UNIQUE,                           -- front: 'BX00042-1-K7M2QX' · activate: 16 ตัวสุ่ม
  print_code text NOT NULL UNIQUE,                      -- 'H4KD9TRW' (เก็บไม่มีขีด, ตัวใหญ่)
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','used')),
  health text NOT NULL DEFAULT 'ok'
         CHECK (health IN ('ok','suspicious','damaged','maybe_fake','backup_in_use','expiring')),
  health_reasons text[] NOT NULL DEFAULT '{}',
  revoked_date timestamptz, last_scanned_date timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),      -- = วันออก QR
  updated_date timestamptz NOT NULL DEFAULT now()
);
-- ใบที่ใช้งานอยู่ได้แค่ใบเดียวต่อ (ตู้, ช่อง)
CREATE UNIQUE INDEX uq_box_qr_code_active ON app.box_qr_code_tb (box_id, slot) WHERE status = 'active';

CREATE TABLE app.box_report_tb (                        -- POST /v1/box/report (+ boot) · เพิ่มอย่างเดียว
  box_report_id bigserial PRIMARY KEY,
  box_id text NOT NULL REFERENCES app.box_tb (box_id),
  kind text NOT NULL CHECK (kind IN ('boot','report')),
  body jsonb NOT NULL,                                  -- เก็บทั้งก้อน (fw, battery_*, temp_c, rssi, wake_count …)
  created_date timestamptz NOT NULL DEFAULT now()       -- = เวลาที่ได้รับ
);

CREATE TABLE app.box_config_tb (                        -- ค่ากลาง 1 แถว · config_ver เพิ่มทุกครั้งที่แก้
  box_config_id int PRIMARY KEY DEFAULT 1 CHECK (box_config_id = 1),
  config_ver int NOT NULL, config jsonb NOT NULL,
  updated_by text REFERENCES app.user_tb (user_id),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

-- ตรวจตู้ --------------------------------------------------------------
CREATE TABLE app.box_job_tb (
  box_job_id text PRIMARY KEY,                          -- 'J-8f31c2'
  box_id text NOT NULL REFERENCES app.box_tb (box_id),
  type text NOT NULL DEFAULT 'inspect',
  expire_date timestamptz NOT NULL,                     -- +60 วิ
  delivered_date timestamptz,                           -- ส่งให้ตู้ทาง long-poll แล้ว
  ready_date timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.inspection_tb (
  inspection_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_job_id text NOT NULL UNIQUE REFERENCES app.box_job_tb (box_job_id),
  box_id text NOT NULL REFERENCES app.box_tb (box_id),
  officer_user_id text NOT NULL REFERENCES app.user_tb (user_id),
  agency_id uuid NOT NULL REFERENCES app.agency_tb (agency_id),  -- ค่า ณ ตอนตรวจ (§4.1)
  zone_id uuid NOT NULL REFERENCES app.zone_tb (zone_id),
  box_qr_code_id uuid NOT NULL REFERENCES app.box_qr_code_tb (box_qr_code_id),
  method text NOT NULL CHECK (method IN ('scan','code')),
  scan_ms int,
  status text NOT NULL DEFAULT 'waking'
         CHECK (status IN ('waking','ready','passed','failed','expired','box_problem')),
  qr_condition text,                                    -- คำตอบ O03
  checked_date timestamptz,                             -- passed เมื่อไหร่
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.inspection_attempt_tb (                -- ทุกครั้งที่ตู้ส่ง result · เพิ่มอย่างเดียว
  inspection_id uuid NOT NULL REFERENCES app.inspection_tb (inspection_id),
  attempt int NOT NULL,
  read_ok boolean NOT NULL, qr_text text, read_ms int, flash boolean,
  verdict text NOT NULL CHECK (verdict IN ('pass','retry','fail')),
  reason text,                                          -- bad_sig / wrong_job / wrong_user / expired / unreadable
  created_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (inspection_id, attempt)                  -- ✅ กุญแจกันส่งซ้ำ = job + attempt
);

-- ส่งของ / SOS -----------------------------------------------------------
CREATE TABLE app.delivery_tb (                          -- เพิ่มอย่างเดียว
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id text NOT NULL REFERENCES app.box_tb (box_id),
  method text NOT NULL CHECK (method IN ('scan','code','button')),   -- button = ปุ่มหน้าตู้ (§19 ⏸)
  box_qr_code_id uuid REFERENCES app.box_qr_code_tb (box_qr_code_id),  -- NULL เมื่อ button
  press_count int,
  CHECK ((method = 'button') = (box_qr_code_id IS NULL)),
  created_date timestamptz NOT NULL DEFAULT now()
  -- ✅ ไม่มีคอลัมน์ข้อมูลไรเดอร์ (IP เก็บใน scan_log_tb เพื่อ rate limit/สืบย้อนเท่านั้น 💡)
);

CREATE TABLE app.sos_case_tb (
  sos_case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id text NOT NULL REFERENCES app.box_tb (box_id),
  owner_user_id text NOT NULL REFERENCES app.user_tb (user_id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','closed','cancelled')),
  stage text NOT NULL DEFAULT 'zone' CHECK (stage IN ('zone','agency','call_yourself')),
  stage_changed_date timestamptz NOT NULL DEFAULT now(),
  accepted_by text REFERENCES app.user_tb (user_id), accepted_date timestamptz,
  closed_date timestamptz, close_note text,
  cancelled_date timestamptz, cancel_reason text CHECK (cancel_reason IN ('safe','mistake')),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);
-- SOS ที่ยังไม่จบได้แค่อันเดียวต่อตู้
CREATE UNIQUE INDEX uq_sos_case_open ON app.sos_case_tb (box_id) WHERE status IN ('open','accepted');

CREATE TABLE app.sos_recipient_tb (                     -- ใครได้รับ SOS นี้ (ใช้ตรวจสิทธิ์ accept/ดู) · ห้ามมีเจ้าของบ้านเอง (§7)
  sos_case_id uuid NOT NULL REFERENCES app.sos_case_tb (sos_case_id),
  user_id text NOT NULL REFERENCES app.user_tb (user_id),
  stage text NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),      -- = เวลาที่แจ้ง
  PRIMARY KEY (sos_case_id, user_id)
);

-- log (เพิ่มอย่างเดียว · ห้าม UPDATE/DELETE) ------------------------------
CREATE TABLE app.scan_log_tb (                          -- ✅ ทุกการสแกน/พิมพ์รหัส แม้ไม่ผ่าน
  scan_log_id bigserial PRIMARY KEY,
  actor_kind text NOT NULL CHECK (actor_kind IN ('officer','owner','rider','box')),
  user_id text REFERENCES app.user_tb (user_id),
  box_id text REFERENCES app.box_tb (box_id),           -- NULL = QR ไม่ใช่ของระบบ
  box_qr_code_id uuid REFERENCES app.box_qr_code_tb (box_qr_code_id),
  qr_kind text NOT NULL CHECK (qr_kind IN ('front','activate','badge')),
  method text NOT NULL CHECK (method IN ('scan','code')),
  raw text,                                             -- ข้อความที่สแกนได้ (ไว้สืบ QR ปลอม)
  result text NOT NULL, scan_ms int, attempt int, box_signature_ok boolean,
  inspection_id uuid REFERENCES app.inspection_tb (inspection_id), ip inet,
  created_date timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_scan_log_box  ON app.scan_log_tb (box_id, created_date DESC);
CREATE INDEX ix_scan_log_qr   ON app.scan_log_tb (box_qr_code_id, created_date DESC);

CREATE TABLE app.data_access_log_tb (                   -- แอดมินเปิดดูข้อมูลส่วนบุคคล / เห็นเบอร์ใน SOS
  data_access_log_id bigserial PRIMARY KEY,
  actor_user_id text NOT NULL REFERENCES app.user_tb (user_id),
  subject_kind text NOT NULL, subject_id text NOT NULL, fields text[],
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.technician_request_tb (
  technician_request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id text NOT NULL REFERENCES app.box_tb (box_id),
  requested_by text REFERENCES app.user_tb (user_id),   -- NULL = ระบบ/แอดมินสร้าง
  reason text NOT NULL, note text, urgent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','scheduled','done')),
  scheduled_date timestamptz, closed_date timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);
```

### ตารางเทียบชื่อเก่า → ใหม่

ส่วนอื่นของเอกสารนี้ (และ HANDOFF / โปรโตคอลตู้) ยังอาจพูดถึงชื่อเก่า — หมายถึงตารางเดียวกัน · **ชื่อ path ใน API (`/agency/zones` ฯลฯ) ไม่เปลี่ยน**

| เดิม | ใหม่ | | เดิม | ใหม่ |
|---|---|---|---|---|
| `users.id` | `user_tb.user_id` (+ `user_role_tb`) | | `inspections` | `inspection_tb` |
| `sessions` | `session_tb` | | `inspection_attempts` | `inspection_attempt_tb` |
| `agencies` | `agency_tb` | | `deliveries` | `delivery_tb` |
| `agency_members` | `agency_member_tb` | | `sos_cases` | `sos_case_tb` |
| `zones` | `zone_tb` | | `sos_recipients` | `sos_recipient_tb` |
| `zone_windows (starts, ends)` | `zone_window_tb (start_time, end_time)` | | `push_subscriptions` | `push_subscription_tb` |
| `zone_officers` | `zone_officer_tb` | | `notifications` | `notification_tb` |
| `zone_boxes` | `zone_box_tb` | | `terms` / `terms_acceptances` | `terms_tb` / `terms_acceptance_tb` |
| `boxes (owner_id)` | `box_tb (owner_user_id)` | | `scan_logs (at)` | `scan_log_tb (created_date)` |
| `box_qr_codes` / `qr_id` | `box_qr_code_tb` / `box_qr_code_id` | | `data_access_logs` | `data_access_log_tb` |
| `box_reports` | `box_report_tb` | | `plans (code)` | `plan_tb (plan_code)` |
| `box_config` | `box_config_tb` | | `user_plans (starts_at, ends_at)` | `user_plan_tb (start_date, end_date)` |
| `box_jobs (id)` / `job_id` | `box_job_tb (box_job_id)` | | `technician_requests` | `technician_request_tb` |
| `*_at` | `*_date` | | `inspections.officer_id` | `inspection_tb.officer_user_id` |

### 4.1 ⚠️ สี่เรื่องที่ต้องเข้าใจก่อนแตะ schema

1. **`scan_log_tb` ห้าม UPDATE/DELETE** — เป็นหลักฐาน (✅ บันทึกแม้ไม่ผ่าน) · 💡 ให้ DB role ของแอปมีแค่ INSERT/SELECT บนตารางนี้
2. **`inspection_tb.agency_id/zone_id` เก็บค่า ณ ตอนตรวจ** — เจ้าหน้าที่ย้ายหน่วยงาน/บ้านถูกย้ายโซนทีหลัง ประวัติเดิมต้องไม่เปลี่ยน · อย่า JOIN ผ่าน `agency_member_tb` ปัจจุบันตอนแสดงประวัติ
3. **ตู้ไม่ถูกลบจริง** — ขายบ้าน = unbind (`owner_user_id = NULL` + ออก Activate QR ใหม่) · ประวัติของเจ้าของเก่า 💡 ซ่อนจากเจ้าของใหม่โดยกรองด้วย `bound_date`
4. **คนเดียวหลายบทบาท** (✅ 2026-10-27) — ตรวจสิทธิ์จาก**บทบาทที่ route ต้องใช้** ไม่มี "โหมดปัจจุบัน" ใน session · เจ้าหน้าที่**ตรวจตู้ที่ตัวเองเป็นเจ้าของไม่ได้** (ตอบเหมือนตู้นอกขอบเขต) · SOS **ไม่ส่งถึงเจ้าของบ้านเอง** แม้เป็นเจ้าหน้าที่ในโซนนั้น · แอดมินมีบทบาทอื่นร่วมไม่ได้ (trigger ในฐานข้อมูล)

---

## 5. QR และเวลาตรวจที่ส่งให้ตู้

### 5.1 QR 3 แบบ (ฉบับเต็มในไฟล์โปรโตคอล §3)

| แบบ | อยู่ที่ไหน | ข้างใน | อายุ | ใครใช้ |
|---|---|---|---|---|
| QR หน้าตู้ ใบ 1 / ใบ 2 | ใบ 1 หน้าตู้ · ใบ 2 สำรองในตู้ | ลิงก์ `https://smmb.app/b/BX00042-1-K7M2QX` = รหัสตู้ · ใบที่ · ลายเซ็นย่อ 6 ตัว `HMAC(คีย์, box_id\|ใบที่\|รุ่น)` + รหัสพิมพ์ 8 ตัวใต้ QR | จนกว่าจะออกใหม่ · ✅ เปลี่ยนทุก 12 เดือน | ไรเดอร์ (กล้องมือถือ) · เจ้าหน้าที่ (ปุ่มในแอป) |
| Activate QR | ในตู้ | ลิงก์ `https://smmb.app/a/<สุ่ม 16 ตัว>` | ✅ ใช้ได้ครั้งเดียว | เจ้าของบ้านตอนผูกตู้ |
| QR ประจำตัว | จอมือถือเจ้าหน้าที่ | `SMMB-O1.<payload>.<sig>` · payload `{ j: job_id, u: user_id, e: หมดอายุ }` | ✅ 30 วิ · ผูกกับ job | กล้องตู้อ่าน |

- **โดเมนไม่ฮาร์ดโค้ด** (2026-10-27 — ตอน dev ไม่ใช่ `smmb.app`): ลิงก์ใน QR สร้างจาก env `PUBLIC_BASE_URL` · ลายเซ็นของ QR คำนวณจาก token อย่างเดียว **ไม่รวมโดเมน** · แอปเจ้าหน้าที่อ่าน QR จาก path `/b/<token>` และรับเฉพาะโดเมนที่อยู่ใน `QR_ALLOWED_HOSTS` · แต่ละ environment ใช้**คีย์ลายเซ็นของตัวเอง** → QR ที่พิมพ์ตอน dev ใช้กับ prod ไม่ได้ (ตั้งใจ)
- ⚠️ **ต้องได้โดเมนจริงก่อนพิมพ์ QR ให้บ้านนำร่อง** — QR ที่พิมพ์ไปแล้วเปลี่ยนโดเมนไม่ได้ ต้องพิมพ์ใหม่ทุกตู้ · ทางเลือก: จดโดเมนสั้นไว้ใช้กับ QR อย่างเดียว แล้ว redirect ไปเว็บแอปจริง (ย้ายเซิร์ฟเวอร์ได้โดยไม่ต้องพิมพ์ QR ใหม่) ❓
- รหัสพิมพ์ใต้ QR: ไม่ใช้ตัวที่สับสน (0/O, 1/I/L) · ไม่สนตัวเล็กใหญ่ · ผิดติดกันหลายครั้ง → หน่วงเวลา
- ✅ พิมพ์ QR ระดับแก้ข้อผิดพลาด H + เคลือบกันแดดกันน้ำ
- **ตรวจลายเซ็นก่อนค้นฐานข้อมูล** — QR ที่ลายเซ็นไม่ถูก = "ไม่ใช่ของระบบ" (อาจถูกแปะทับ) ไม่ใช่ "รหัสผิด" → แยก `QR_NOT_SYSTEM` กับ `QR_INVALID` (api §6.2)

### 5.2 เวลาตรวจของตู้ = รวมทุกโซน

ตู้หนึ่งอยู่ได้หลายโซน (และอาจหลายหน่วยงาน ❓) → `config.windows` ที่ส่งให้ตู้ = **union ของ `zone_windows` ทุกโซนที่มีตู้นี้** (merge ช่วงที่ทับ/ชนกัน)
- ตอนเจ้าหน้าที่สแกน ใช้ช่วงของ**โซนที่เจ้าหน้าที่คนนั้นอยู่**ตัดสิน `OUTSIDE_PATROL_WINDOW` (ไม่ใช่ union)
- แก้เวลาโซน / ย้ายบ้านเข้าออกโซน → คำนวณ windows ใหม่ของตู้ที่กระทบ → ถ้าเปลี่ยน ตู้ได้ `config` ใหม่ตอนรายงานรายวันครั้งถัดไป (✅ ภายใน 1 วัน)
- 💡 `config_ver` ที่ส่งให้ตู้ = hash/เลขรวมของ (box_config.config_ver, windows ของตู้, config_override) — ตู้แค่เทียบว่า "ตรงไหม"
- ตู้ที่ไม่อยู่โซนไหนเลย → `windows: []` → หลับลึกตลอด ตื่นแค่รายงานรายวัน

---

## 6. ลำดับการตรวจตู้ (state machine ของ `inspections`)

```
          POST /inspections (เช็ก 6 ข้อ api §6.2 ผ่าน)
                    │  สร้าง box_job (อายุ 60 วิ) + ปลุก long-poll ของตู้
                    ▼
               ┌─ waking ─┐── 60 วิ ไม่ ready ──▶ expired
               │          │── แอปกด "แจ้งปัญหาตู้" ──▶ box_problem
               ▼
   ตู้ POST /jobs/:id/ready
               │
               ▼
             ready ── แอปขอ badge ทุก 30 วิ ──┐
               │                              │
   ตู้ POST /jobs/:id/result (attempt n)      │
               ├── ผ่าน ──────────────▶ passed ─▶ แจ้งเจ้าของบ้าน · อัปเดตหน้าสรุปโซน
               ├── ไม่ผ่าน n < 3 ─▶ ready (retry, attempts_left = 3 − n)
               └── ไม่ผ่าน n = 3 ─▶ failed ─▶ แจ้งปัญหาตู้
```

การตัดสินผลจากตู้ (ทำที่ server เท่านั้น ✅):
1. ลายเซ็นตู้ถูก (`X-Signature`) — ไม่ถูก = ไม่ผ่าน + log ความพยายามปลอม
2. ถอด `qr_text` → ลายเซ็นของ QR ประจำตัวถูก
3. `j` = job ของตู้ที่ส่งมา (ใช้ QR ที่ออกให้ตู้อื่นไม่ได้)
4. `u` = เจ้าหน้าที่ที่สแกน QR หน้าตู้ (ยื่นมือถือคนอื่นไม่ได้)
5. `e` ยังไม่หมดอายุ (เทียบเวลาเซิร์ฟเวอร์ ไม่ใช่ของตู้)

- ทุก attempt ลง `inspection_attempts` + `scan_logs` (`actor_kind = 'box'`)
- **ไม่มี job ค้างข้ามเวลาตรวจ** — จบเวลาตรวจแล้วตู้หยุด long-poll · inspection ที่ยัง `waking/ready` → `expired`
- ตู้ส่ง result ซ้ำ (เน็ตกระตุก) → PK `(inspection_id, attempt)` ชน → ตอบ verdict เดิม (idempotent)

---

## 7. SOS (state machine ของ `sos_cases`)

```
 POST /sos ── บ้านไม่อยู่ในโซนไหน ──▶ ตอบ SOS_NO_COVERAGE (ไม่สร้างแถว) → แอปขึ้นโทร 191/1669
     │
     ▼
 open/stage=zone ──(30 วิ)──▶ open/stage=agency ──(30 วิ)──▶ open/stage=call_yourself (เปิดรอต่อ)
     │  แจ้งเจ้าหน้าที่ในโซน      แจ้งทุกคนในหน่วยงาน + หัวหน้า       แอปเจ้าของบ้านขึ้นตัวใหญ่ "โทร 191/1669"
     │
     ├── เจ้าหน้าที่กด "รับเรื่อง" ──▶ accepted ── กด "ปิดเรื่อง" + หมายเหตุ ──▶ closed
     └── เจ้าของบ้านยกเลิก (ยืนยันแล้ว) ──▶ cancelled → แจ้งทุกคนที่ได้รับ
```

- **รับพร้อมกันหลายคน → คนแรกได้** ✅:
  ```sql
  UPDATE app.sos_cases SET status='accepted', accepted_by=$me, accepted_at=now()
  WHERE id=$id AND status='open'
    AND EXISTS (SELECT 1 FROM app.sos_recipients WHERE sos_id=$id AND user_id=$me)
  RETURNING *;
  -- 0 แถว → อ่านใหม่แล้วตอบ 409 SOS_ALREADY_TAKEN (หรือ 410 ถ้า cancelled)
  ```
- ตัวจับเวลา 30/60 วิ: 💡 delayed job ใน Redis (BullMQ) หรือ scheduler ตรวจทุก 5 วิ — **ต้องรอดตอน restart** (เก็บ `stage_changed_at` ใน DB แล้วคำนวณใหม่ได้เสมอ)
- ขั้นเลื่อนเฉพาะตอน `status = 'open'` — รับแล้วหยุดส่งต่อ
- ✅ บ้านมีโซนแต่ไม่มีเจ้าหน้าที่ในโซนเลย → ข้ามไป stage `agency` ทันที 💡
- เบอร์โทรใน `accepted_by.phone` / `SosCard.owner.phone` ส่งเฉพาะ `status IN ('open','accepted')` (✅) — ทุกครั้งที่ส่งเบอร์ลง `data_access_logs`

---

## 8. งานเบื้องหลัง (scheduler) และสถานะตู้

| งาน | เมื่อไหร่ | ทำอะไร |
|---|---|---|
| ตรวจสุขภาพ QR | ✅ ทุกวัน 23:00 (หลังจบเวลาตรวจ) | ไล่ QR ที่ active ทุกใบ เช็ก 6 ข้อ (ด้านล่าง) → อัปเดต `health` → สถานะเพิ่งไม่ปกติ = แจ้งแอดมิน |
| เช็กตู้ตอนเริ่มเวลาตรวจ | ✅ ทุกครั้งที่ช่วงเวลาตรวจของตู้เริ่ม | รอ ~5 นาที → ตู้ที่ยังไม่ long-poll = `offline` → แจ้งเจ้าของบ้าน + แอดมิน |
| ตู้หลุดกลางเวลาตรวจ | ต่อเนื่อง | ไม่มี long-poll เกิน 10 นาที → `offline` + แจ้งแบบเดียวกัน |
| ตู้เงียบ | ทุกชั่วโมง | ไม่รายงานเกิน 26 ชม. → แจ้งแอดมิน |
| SOS ส่งเป็นขั้น | ทุก SOS ที่เปิด | §7 |
| ล้างของหมดอายุ | ทุกชั่วโมง | session, delivery ticket, nonce (Redis TTL เอง), job/inspection ค้าง |

**6 ข้อของตรวจสุขภาพ QR** (ข้อไหนใช่ → ติดธง แล้วเช็กข้อถัดไป):

| # | เงื่อนไข | health |
|---|---|---|
| 1 | วันนี้เจ้าหน้าที่พิมพ์รหัส / สแกนช้า (> ~10 วิ) / แจ้งเสีย | `damaged` (มั่นใจสูง) |
| 2 | ไรเดอร์พิมพ์แทนสแกนเกินเกณฑ์ (💡 3 ครั้งใน 7 วัน) | `suspicious` |
| 3 | มีการสแกน QR ที่ไม่ใช่ของระบบที่ตู้นี้ | `maybe_fake` + แจ้งหัวหน้าโซน · **ระหว่างวันแจ้งแอดมินทันที ไม่รอ 23:00** |
| 4 | ไม่มีใครสแกนเกิน 2 วัน ทั้งที่บ้านอยู่ในโซน | `suspicious` (QR หาย / ไม่มีคนไปตรวจ) |
| 5 | เริ่มมีการสแกนใบ 2 | `backup_in_use` (ต้องออกใบใหม่) |
| 6 | อายุ ≥ 11 เดือน | `expiring` |

- ❓ "สแกนใบ 2" จะรู้ว่ามาที่ตู้ไหนได้ยังไง ถ้า QR ปลอมถูกแปะทับใบ 1 — ข้อ 3 กับ 5 อาจเกิดพร้อมกัน ให้ข้อ 3 ชนะ

**สถานะตู้ที่แสดง (`BoxStatus` ใน api §4.2)**

| สถานะ | เงื่อนไข |
|---|---|
| `online` | ในเวลาตรวจ + มี long-poll ภายใน 2 × `longpoll_wait_s` |
| `sleeping` | นอกเวลาตรวจ + รายงานรายวันมาภายใน 26 ชม. (ปกติ) |
| `offline` | ตามตารางข้างบน |
| `service_closed` | แอดมินปิดบริการ |
| `unbound` | ยังไม่มีเจ้าของ |

---

## 9. ข้อมูลส่วนบุคคล

- ✅ ตารางใครเห็นอะไร อยู่ใน api §11 — **ตัดที่ server เท่านั้น** ห้ามส่งข้อมูลดิบแล้วให้ client ซ่อน
- ✅ เจ้าของบ้านซ่อนตัวตนได้ (ไม่บังคับชื่อจริงแสดงต่อคนอื่น — เจ้าหน้าที่เห็นแค่บ้านเลขที่ + ชื่อตู้ตอนตรวจ)
- ✅ แอดมินเห็นทุกอย่าง แต่เก็บ log การเปิดดู (`data_access_logs`)
- ✅ ไรเดอร์ไม่ถูกเก็บข้อมูลตัวตน — 💡 เก็บ IP ใน `scan_logs` เพื่อ rate limit/สืบ QR ปลอม (ต้องเขียนในข้อตกลง)
- ❓ ระยะเวลาเก็บ log / ข้อความในข้อตกลง / นโยบายความเป็นส่วนตัว — ต้องทำก่อนเปิดทดลองจริง

---

## 10. แจ้งเตือนและเว็บแอป (PWA)

- ✅ Web Push (VAPID) ผ่าน service worker — ไลบรารี `web-push` ฝั่ง NestJS
- ✅ เปิดใน LINE → หน้า `A01` บอกให้เปิดใน Safari/Chrome (ใน LINE แจ้งเตือนไม่ทำงาน)
- ✅ iPhone ต้อง "แชร์ → เพิ่มไปยังหน้าจอหลัก" ก่อน (หน้า `A02`) — Web Push บน iOS ใช้ได้เฉพาะเว็บแอปที่ติดตั้งแล้ว
- ✅ เจ้าหน้าที่**บังคับ**เปิดแจ้งเตือน (`A12`) · เจ้าของบ้านข้ามได้ แต่มีแถบเตือนค้างที่หน้าหลัก (`H03-b`)
- ✅ เว็บแอปทำ widget บนหน้าจอมือถือไม่ได้
- ทุกแจ้งเตือนเก็บลง `app.notifications` ด้วย → หน้า "แจ้งเตือน" (`H14`, `L09`, `D12`) ดูย้อนหลังได้แม้ push ไม่ถึง
- 💡 SOS: ส่ง push ซ้ำทุก 30 วิ จนรับ/ยกเลิก (เผื่อมือถือเจ้าหน้าที่ปิดเสียง) — ต้องทดสอบว่ารำคาญเกินไหม

---

## 11. การแสดงผลและการเข้าถึง (จาก wireframe 2026-10-26)

ผู้ใช้มีตั้งแต่เด็ก วัยทำงาน ถึงผู้สูงอายุ → ตั้งค่าได้ใน "การแสดงผล" (`H13-d` เจ้าของบ้าน · `O13-b` เจ้าหน้าที่)

| ตั้งค่า | ค่า | หมายเหตุ |
|---|---|---|
| ธีม | สว่าง / มืด / ตามเครื่อง | ตัวอย่างธีมมืด `H03-D`, `O01-N` |
| ภาษา | ไทย / English | ตัวอย่าง `H03-EN` · ข้อความแจ้งเตือนจาก server ต้องแปลตามนี้ด้วย → เก็บที่ server |
| ขนาดตัวอักษร | ปกติ / ใหญ่ / ใหญ่มาก | |
| หน้าหลักแบบเรียบง่าย | เปิด / ปิด | `H03-L`: สถานะตู้ + เหตุการณ์ล่าสุด + ปุ่ม SOS ใหญ่ — เหมาะผู้สูงอายุ |
| ธีมมืดอัตโนมัติตอนตรวจกลางคืน | 18:00–06:00 | เจ้าหน้าที่เท่านั้น |

- แบรนด์: โลโก้ตู้จดหมายสีขาวบนไอคอนแดง · สีหลัก `#D7141E` · เข้ม `#9B0F16` · อ่อน `#FDE5E6` · SOS `#C81E1E`
- ข้อความเขียนให้เข้าใจง่าย: "QR หน้าตู้" / "QR สำรอง" / "QR เปิดใช้ตู้" / "ประวัติ" (ไม่ใช้ "QR ใบ 1/2", "Activate QR", "Log" บนหน้าจอผู้ใช้)

---

## 12. 🧪 ข้อเสนอนอกขอบเขต: สมาชิกในบ้าน

มีใน wireframe (`H15`, `H15-b`, `H15-c`) ไว้**เสนอลูกค้า** — ยังไม่ทำ
- เจ้าของเชิญคนในบ้านด้วยลิงก์ → สมาชิกสมัครด้วยเบอร์ (ไม่ต้องสแกนตู้)
- สิทธิ์ต่อคน: รับแจ้งเตือน · กด SOS ได้ · ดูประวัติ (30 วัน)
- สมาชิกไม่เห็นเบอร์เจ้าหน้าที่ แก้ตั้งค่าตู้ไม่ได้ · หน้าหลักของสมาชิกมีปุ่มโทรหาเจ้าของ + SOS ใหญ่
- **ผลกระทบถ้าทำ**: ต้องมีตาราง `box_members (box_id, user_id, perms)` · ขอบเขตของ owner (§3) ต้องรวมสมาชิก · SOS ต้องรู้ว่าใครกด · แจ้งเตือนส่งหลายคน

---

## 13. แผนงาน

### เฟส 0 — ออกแบบ (เสร็จ)

- [x] ประชุมรีวิว flow (21 ต.ค.) + สรุปการตัดสินใจ (`SMMB_สรุปการตัดสินใจ_2026-10-22.md`)
- [x] ผังงาน `SMMB_Flowchart_v11.drawio` (หน้า 00–13 + งานเบื้องหลัง)
- [x] ขั้นตอนการใช้งานแยกตามผู้ใช้ (`SMMB_ขั้นตอนการใช้งานแต่ละคน.md`)
- [x] โปรโตคอลตู้–เซิร์ฟเวอร์ ร่างแรก (`SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md`)
- [x] wireframe + prototype 110 หน้า (`SMMB Wireframe.figcraft` / `.fig`) — ดู HANDOFF §4.1
- [x] api.md / ไฟล์นี้ / HANDOFF.md (2026-10-27)
- [ ] นำเสนอ prototype ให้ลูกค้า → เก็บ feedback (รวมเรื่องสมาชิกในบ้าน §12)
- [ ] รีวิว §4 (schema) และ api.md กับทีม → ตัดสินข้อ ❓ ใน §15
- [ ] ตารางสิทธิ์ฉบับเต็มให้ทีม backend (ร่างอยู่ api §11)
- [ ] อัปเดตผังซอฟต์แวร์ในเอกสารฮาร์ดแวร์ (หน้า 1 ยังเป็นของเก่า: RFID, ถ่ายรูป, LINE Notify)

> สถานะ (2026-10-27): ✅ = backend เขียนแล้ว · 🖥️ = หน้าเว็บทำเป็นหน้าจอด้วยข้อมูลจำลองแล้ว ยังไม่ต่อ API · ✅ ผู้ใช้เลือก PostgreSQL แล้ว — backend ทำต่อ

### เฟส 1 — แกนกลาง: บัญชี + หน่วยงาน + โซน

- [x] โครง NestJS + migration runner + health + config/env · ✅ backend 2026-10-27 (ทดสอบกับ PGlite เท่านั้น)
- [x] auth (signup 3 แบบ, signin, sessions, change-password, rate limit, `TRUST_PROXY`) · ✅ backend 2026-10-27 (ทดสอบกับ PGlite เท่านั้น)
- [x] ข้อตกลง + บันทึกการยอมรับ · ✅ backend 2026-10-27 (ทดสอบกับ PGlite เท่านั้น) · ข้อตกลงฉบับจริงยังไม่มี
- [x] Web Push (VAPID, subscriptions, test) + `notifications` · ✅ backend 2026-10-27 (ทดสอบกับ PGlite เท่านั้น) · ยังไม่ได้ลองส่งถึงมือถือจริง
- [x] หน่วยงาน: สมัคร → แอดมินอนุมัติ → รหัสกลุ่ม · สมาชิก: สมัคร → หัวหน้ายืนยัน · รีเซ็ตรหัส · ✅ backend 2026-10-27 (ทดสอบกับ PGlite เท่านั้น) · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API)
- [ ] โซน: CRUD + windows + บ้าน + เจ้าหน้าที่ · ✅ backend 2026-10-27 ยกเว้นใส่บ้าน/ค้นบ้าน (รอคำตอบเรื่องบ้านอยู่หลายหน่วยงาน) · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API)
- [x] เว็บแอป Angular: หน้า `A*` + `L*` ตาม wireframe · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API) · เพิ่ม `A14`–`A16` ที่ wireframe ไม่มี

### เฟส 2 — ตู้ (คู่กับพี่ตั๋งฝั่งเฟิร์มแวร์)

- [ ] ลงทะเบียนตู้ + รหัสลับประจำตู้ + ออก QR ชุดแรก + ไฟล์พิมพ์ · 🖥️ มีใบพิมพ์ตัวอย่างในหน้า `D07-b`/`D08`
- [ ] `/v1/box/*`: middleware HMAC + nonce + เวลา · boot · report · long-poll jobs · ready · result · events
- [ ] คำนวณ windows/config ต่อตู้ (§5.2)
- [ ] ผูกตู้ด้วย Activate QR · หน้าหลักเจ้าของบ้าน `H03*` · ประวัติ `H12*` · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API)
- [ ] ทดสอบกับบอร์ดจริง: เวลา "ได้งาน → ready" (เป้า 1–3 วิ) · เราเตอร์ตัด connection เงียบหลังกี่วิ

### เฟส 3 — ตรวจตู้

- [ ] `POST /inspections` + เช็ก 6 ข้อ + scan log + ธง QR
- [ ] QR ประจำตัว (ออกทุก 30 วิ) + ตัดสินผลจากตู้ (§6)
- [ ] SSE หรือ poll สำหรับหน้า `O05`/`O06` (❓)
- [ ] หน้าสรุปเจ้าหน้าที่ `O01*` + หน้าตรวจ `O02`–`O08` · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API)
- [ ] แจ้งเจ้าของบ้านเมื่อตรวจแล้ว

### เฟส 4 — SOS + ไรเดอร์

- [ ] SOS ส่งเป็นขั้น + lock คนแรกได้ + ยกเลิก + ปิดเรื่อง (§7) · หน้า `H08`–`H11-b`, `O09`–`O12` · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API)
- [ ] ไรเดอร์: `/public/*` + delivery ticket + จำกัดต่อตู้ · หน้า `R*` · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API)

### เฟส 5 — หลังบ้าน + งานเบื้องหลัง

- [ ] หน้าแอดมิน `D*` (ภาพรวม, หน่วยงาน, ผู้ใช้, ตู้, ค่าตั้งค่า, Log) · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API) · backend ✅ เฉพาะหน่วยงาน/ผู้ใช้
- [ ] ตรวจสุขภาพ QR 23:00 + flow จัดการ QR เสีย/ปลอม (`D05`–`D08`) · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API)
- [ ] เช็กตู้ตอนเริ่มเวลาตรวจ / ตู้หลุด / ตู้เงียบ 26 ชม.
- [ ] คำขอช่าง · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API) (ใน `D04` / `H13-c`)

### เพิ่ม 2026-10-27 (ใส่ในเฟสที่เกี่ยวข้อง)

- [ ] เฟส 1: ตาราง `plans` / `user_plans` + seed แพ็กเกจ `free` "ฟรี" (default ✅) + ให้แพ็กอัตโนมัติตอนเจ้าของบ้านสมัคร · แสดงในหน้าตั้งค่า (§17) · ✅ backend: ตาราง + seed + ให้แพ็กตอนสมัคร · ยังไม่มี `GET /me/plan` · 🖥️ แถวแพ็กเกจใน `H13` เสร็จ
- [ ] เฟส 5: แอดมินดู/เปลี่ยนแพ็กเกจของเจ้าของบ้าน (`D09`) + จัดการรายการแพ็กเกจ (ใช้ตอนมีแพ็กใหม่) + กรองผู้ใช้/ตู้ตามแพ็กเกจ · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API) · หน้ารายการแพ็กเกจ = `D14` (ไม่มีใน wireframe)
- [ ] เฟส 2/4: ปุ่มส่งของหน้าตู้ — `POST /v1/box/deliveries` + เฟิร์มแวร์ (พี่ตั๋ง) + `deliveries.method = 'button'` (§19)
- [ ] เฟส 1: ตัวกรองโซนในหน้าหัวหน้า (`L04`, `L08`) + ป้าย "โซนที่ฉันอยู่" (§18) · 🖥️ หน้าเว็บจำลองเสร็จ (ยังไม่ต่อ API)
- [ ] wireframe (ยังไม่ได้แก้ — แต่หน้าเว็บจำลองมีครบแล้ว ยกเว้นเรื่องปุ่มหน้าตู้ที่รอยืนยัน): แถว "แพ็กเกจ: ฟรี" ใน `H13` · ส่วนแพ็กเกจใน `D09` (+ แสดงใน `D04`) · ตัวกรองโซนใน `L04`/`L08` + ป้าย "โซนที่ฉันอยู่" ใน `L06` · ไรเดอร์: บอกว่ากดปุ่มหน้าตู้ได้ · ช่าง `T01`: ทดสอบปุ่ม

### เฟส 6 — ทดลองจริง

- [ ] deploy บน Ubuntu (reverse proxy, TLS, backup DB)
- [ ] ติดตั้งตู้นำร่อง + เก็บตัวเลขไฟ/สัญญาณ/การอ่าน QR กลางคืน-แดดจ้า
- [ ] การแสดงผล (ธีม/ภาษา/ตัวใหญ่) ทำครบทุกหน้า ไม่ใช่แค่หน้าตัวอย่าง

---

## 14. ผลกระทบที่ต้องรู้

- **ตู้ 1 ตู้ = connection ค้าง 1 เส้นตลอดเวลาตรวจ** — ตู้ 1,000 ตู้ช่วงเย็นพร้อมกัน = 1,000 request ค้าง · NestJS (Node) รับได้ถ้าไม่บล็อก แต่ reverse proxy ต้องตั้ง `proxy_read_timeout` > 50 วิ และเพดาน connection ให้พอ
- **นาฬิกา**: ตู้ตั้งเวลาจาก `server_time` · QR ประจำตัวหมดอายุตามนาฬิกาเซิร์ฟเวอร์ → เซิร์ฟเวอร์ต้องเปิด NTP
- **เปลี่ยน master key** = ตู้ทุกตู้ต้องเขียนรหัสลับใหม่ → มี `secret_kid` ไว้รองรับหลายรุ่น อย่าเปลี่ยนเล่น ๆ
- **ออก QR ใหม่ = ใบเก่าตายทันที** — ไรเดอร์/เจ้าหน้าที่ที่ถ่ายรูปไว้จะได้ `QR_INVALID` (ตั้งใจ)
- **iOS Web Push** ต้องติดตั้งเว็บแอปก่อน — ผู้ใช้ที่ข้ามขั้นนี้จะไม่ได้แจ้งเตือน (กระทบเจ้าหน้าที่มากสุด → บังคับที่ `A12`)
- **ข้อความแจ้งเตือนสองภาษา** — ทุก type ใน api §14 ต้องมีทั้ง th/en ตั้งแต่แรก
- **ลำดับ deploy ตอนเปลี่ยนโปรโตคอลตู้**: server ต้องรับได้ทั้งของเก่าและใหม่ก่อน แล้วค่อยอัปเฟิร์มแวร์ (ตู้อัปพร้อมกันไม่ได้)

---

## 15. ที่ยังไม่ตัดสิน

**ฝั่งซอฟต์แวร์**
- ✅ ฐานข้อมูล = **PostgreSQL** + backend NestJS (ผู้ใช้ยืนยัน 2026-10-27) · Redis ใช้เป็นที่นับ rate limit / ล็อกบัญชีเท่านั้น (ไม่ใช่ฐานข้อมูล · ล่มแล้วระบบยังทำงาน)
- ✅ หน้ารอตู้ / รอ SOS ใช้ **poll ทุก 1 วิ** (ง่ายสุด) · เปลี่ยนเป็น SSE ทีหลังได้โดยไม่แก้ API อื่น
- ❓ บ้านเดียวอยู่ในโซนของหลายหน่วยงานได้ไหม (ตำรวจ + รปภ.หมู่บ้าน) — ถ้าได้ SOS ขั้น 2 ส่งทุกหน่วยงาน? · **ยังรอผู้ใช้ตอบ** — ขวาง `PUT /agency/zones/:id/houses` และค้นบ้าน
- ✅ ~~คนเดียวหลายบทบาท~~ — ได้ (2026-10-27) · 1 เบอร์ 1 บัญชี หลายบทบาท ผ่าน `user_role_tb` (§4, §4.1 ข้อ 4)
- ✅ เจ้าหน้าที่อยู่ได้หน่วยงานเดียว (2026-10-27 ตามร่าง)
- ✅ ปิดสิทธิ์เจ้าหน้าที่ = ถอดออกจากทุกโซนของหน่วยงาน + ถอดหัวหน้า (เขียนแล้ว — api §8.2)
- ✅ ตัวเลข (ผู้ใช้ให้เลือกตามความเหมาะสม 2026-10-27) — รวมไว้ใน api.md §0 "ตัวเลขที่ใช้": แจ้งส่งของ 5 ครั้ง/ชม./ตู้ · ไรเดอร์พิมพ์แทนสแกน 3 ครั้งใน 7 วัน = น่าสงสัย · delivery ticket 10 นาที · พิมพ์รหัสผิด 3 ครั้งติดกัน รอ 30 วิ (ผิดอีกรอบ ×2 สูงสุด 15 นาที) · ล็อกอินผิด 5 ครั้งใน 15 นาที พัก 15 นาที · เวลาตรวจไม่เกิน 4 ช่วงต่อโซน
- ❓ ชื่อโดเมนจริง (ใช้ `smmb.app` เป็นตัวอย่าง — ตั้งด้วย env อยู่แล้ว) · ✅ prefix API ตู้ `/v1/box/` ตามโปรโตคอล
- ✅ เก็บ log 1 ปี (เขียนในข้อตกลง) · 🔜 งานล้าง log เก่ากว่า 1 ปี (ต้องรันด้วย DB role แยกที่ข้าม trigger append-only ได้)
- ✅ ข้อตกลงฉบับ 2026-10-27 เขียนแล้ว — ต้นฉบับ `docs/terms-2026-10-27.md` → `node docs/scripts/gen-terms.mjs <ฉบับ> <เลข migration>` สร้าง migration + หน้า `A13`
- ✅ ช่องทางติดต่อ (2026-10-27 ผู้ใช้กำหนด): หน่วยงานกรอกตอนสมัคร → แสดงให้คนที่ขอเข้า (`A11`/`A11-b`) · แอดมินตั้ง "ช่องทางติดต่อผู้ดูแล" → แสดงใน `A04`/`A07-c`/`L02-b` (api §3.1)
- ✅ ส่ง QR สำรองใบใหม่: แอดมินเลือกต่อเคส (ไปรษณีย์ / ช่างนำไปให้) — หน้า `D07`
- ✅ แพ็กเกจช่วงเดโม: มีแค่ "ฟรี" และ**เปิดทุกฟีเจอร์** (`features = {}` = ไม่จำกัด) · ❓ แพ็กอื่นในอนาคตค่อยกำหนด
- ⏸ ปุ่มหน้าตู้ (§19) — ยังรอพี่ตั๋งยืนยันทั้งฟีเจอร์ (ตัวเลขที่เสนอ: รวมการกดใน ~3 วิ · ไม่รับกดใหม่ ~30 วิ · ส่งไม่ได้ลองใหม่ 3 ครั้ง)

**ฝั่งฮาร์ดแวร์ (ให้พี่ตั๋งวัด)**
1. ไฟตอนหลับลึก (ตอนนี้ 6 mA — ลดได้ไหม) / หลับเบาต่อ Wi-Fi / ตื่นถาม 1 ครั้ง / ตรวจ 1 ครั้ง / long-poll ทั้งช่วงเวลาตรวจ
2. ระบบไฟ: 5V + TP4056 + MT3608 หรือ 12V + MPPT · มีวงจรป้องกันแบตไหม
3. ความร้อนของแบตในตู้ (18650 ไม่ควรชาร์จเกิน ~45°C) / พิจารณา LiFePO4
4. แผง 2W พอไหม หรือขยับเป็น 5–6W
5. ESP32-CAM มี RAM พอทำ TLS + กล้อง + JSON พร้อมกันไหม (บอร์ดที่มี PSRAM)
6. อ่าน QR บนจอมือถือตอนกลางคืนและแดดจ้า
7. ตัด RFID / IR / PIR / SD Card ออกจากตารางชิ้นส่วน · เพิ่มไฟส่อง QR + ไฟสถานะ + อ่านระดับแบต

---

## 16. ประวัติการเปลี่ยนแนวคิด (อย่าย้อนกลับโดยไม่คุยใหม่)

| เดิม | ตอนนี้ | เพราะ |
|---|---|---|
| ตู้ถ่ายรูปคนที่มาเปิด/แตะ ส่งรูปให้เจ้าของบ้าน | ✅ ไม่ถ่ายรูป อ่าน QR อย่างเดียว | ประหยัดไฟ/ข้อมูล · ข้อมูลส่วนบุคคล |
| แตะบัตร RFID ที่ตู้ | ✅ ตัด RFID ทั้งหมด → QR ประจำตัวบนมือถือ | ไม่ต้องแจกบัตร · QR เปลี่ยนทุก 30 วิ ปลอมยากกว่า |
| IR/PIR ปลุกตู้ให้เริ่มสแกน | ✅ เซิร์ฟเวอร์ปลุกตู้ผ่าน long-poll หลังเจ้าหน้าที่สแกน QR หน้าตู้ | ไม่ตื่นเปล่าเพราะคน/รถผ่าน |
| แอป Flutter / LINE LIFF / แอปบน store | ✅ เว็บแอป Angular เปิดนอก LINE | ทำครั้งเดียวได้ทุกเครื่อง · LINE แจ้งเตือนไม่ได้ |
| แจ้งเตือนผ่าน LINE (Notify / OA) | ✅ Web Push | LINE Notify ปิดบริการแล้ว |
| MQTT | ✅ HTTPS + long-poll | ไม่ต้องดูแล broker · backend เป็น NestJS อยู่แล้ว |
| ตู้แลก token ด้วยรหัสลับ (จาก MAC) | ✅ ลายเซ็น HMAC ทุกคำขอ รหัสลับจาก box_id | ไม่ต้องขอ token = ประหยัดไฟ 1 รอบ |
| แอดมินสร้างบัญชีเจ้าของบ้านให้ · Wi-Fi ฮาร์ดโค้ดตอนประกอบ | ✅ เจ้าของบ้านสมัครเองต่อหน้าช่าง · ช่างตั้ง Wi-Fi ผ่านหน้าตั้งค่าของตู้ | ไม่ต้องรู้ข้อมูลบ้านก่อนประกอบ |
| มี 2 บทบาท (USER / ADMIN) | ✅ 5 บทบาท + หน่วยงาน + โซน | มีเจ้าหน้าที่หลายหน่วยงาน + SOS ต้องรู้ว่าใครดูแลบ้านไหน |
| แยกซองธรรมดา / ซองเงิน | ไม่อยู่ใน flow ปัจจุบัน (ไม่เคยตัดสินชัด — เดิมตกลงว่า "ถ้ายากให้ตัด") | ไม่มีเซนเซอร์แยกซองแล้ว ❓ ยืนยันกับลูกค้าว่าตัดจริง |
| มีแพ็กเกจ / ชำระเงิน | ✅ ฟรีช่วงทดลอง ไม่มีชำระเงิน · 2026-10-27 กลับมาเก็บ**ข้อมูล**แพ็กเกจใน DB เพื่อแสดงผล (§17) | beta · เตรียมไว้สำหรับตอนเปิดขายจริง |

---

## 17. แพ็กเกจของเจ้าของบ้าน (เพิ่ม 2026-10-27)

**โจทย์ (ผู้ใช้)**: แสดงว่าเจ้าของบ้านหลังนี้ใช้แพ็กเกจไหน โดยตรวจจาก DB ที่เก็บไว้

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | มีการชำระเงินไหม | ✅ **ไม่มี** — แอดมินเป็นคนตั้งแพ็กเกจ ระบบแค่เก็บและแสดง |
| 2 | แพ็กเกจผูกกับอะไร | ✅ **บัญชีเจ้าของบ้าน** (`user_plans.user_id`) — "เพราะต้องตรวจสอบที่บัญชีเจ้าของบ้าน" · ตู้ทุกตู้ของเจ้าของคนนั้นใช้แพ็กเดียวกัน · ขายบ้าน/unbind ตู้ แพ็กไม่ย้ายตามตู้ |
| 3 | ได้แพ็กอะไรตอนเริ่ม | ✅ **ฟรี** (`code = 'free'`, `is_default = true`) ไม่มีวันหมดอายุ · 💡 ให้ตอน**สมัครเจ้าของบ้าน** ใน transaction เดียวกับสร้างบัญชี (ไม่ใช่ตอนผูกตู้) |
| 4 | แพ็กอื่น | ✅ **มีในอนาคต ค่อยเพิ่มทีหลัง** — ตอนนี้ seed แค่ `free` · ตาราง/API รองรับการเพิ่มแพ็กแล้ว ไม่ต้องแก้ schema |
| 5 | แพ็กเกจปัจจุบันคืออะไร | แถวใน `user_plans` ที่ `starts_at <= now() < ends_at` (หรือ `ends_at IS NULL`) · **server คำนวณทุกครั้ง** client ไม่จำเอง · EXCLUDE constraint กันช่วงทับ |
| 6 | เปลี่ยนแพ็กเกจ | แอดมินเท่านั้น: ปิดแถวเดิม (`ends_at = now()`) + เพิ่มแถวใหม่ ใน transaction เดียว → ได้ประวัติครบ ไม่ UPDATE ทับ |
| 7 | แพ็กต่างกันยังไง | `plans.features` (jsonb) เช่น `max_boxes`, `history_days`, `family_members` · ✅ ช่วงเดโม (2026-10-27): มีแค่ฟรี และเปิดทุกฟีเจอร์ (`{}` = ไม่จำกัด) · ❓ กำหนดตอนมีแพ็กใหม่ |
| 8 | หมดอายุแล้วเกิดอะไร | 💡 แสดง "หมดอายุ" + แจ้งเจ้าของบ้าน/แอดมินล่วงหน้า 7 วัน · กลับไปใช้แพ็กฟรี ❓ (แพ็กฟรีไม่มีวันหมด) |
| 9 | ห้ามตัดอะไรเด็ดขาด | 💡 **SOS และการตรวจตู้ใช้ได้เสมอไม่ว่าแพ็กไหนหรือหมดอายุ** — เป็นเรื่องความปลอดภัย ตัดแค่ของเสริม |

**ใครเห็นอะไร**
- เจ้าของบ้าน: ชื่อแพ็กเกจ · ข้อความราคา (`price_note`) · วันหมดอายุ · ฟีเจอร์ที่ได้ — หน้าตั้งค่า (`H13`) แถว "แพ็กเกจ: ฟรี" · มีใน `Me.plan` และ `BoxDetail.plan` (ค่าเดียวกัน)
- แอดมิน: ทุกอย่าง + ประวัติ + เปลี่ยนได้ที่หน้าผู้ใช้ (`D09`) · หน้าตู้ (`D04`) แสดงแพ็กของเจ้าของตู้ (อ่านอย่างเดียว) · กรองผู้ใช้/ตู้ตามแพ็กเกจ · ภาพรวมจำนวนเจ้าของบ้านต่อแพ็กเกจ (`D01`)
- เจ้าหน้าที่ / หัวหน้า / ไรเดอร์: **ไม่เห็น** (ไม่เกี่ยวกับงานของเขา)

**ตรวจสิทธิ์ตามแพ็กเกจ (เมื่อมีแพ็กที่ต่างกันจริง)**
- ตรวจที่ server ด้วย helper ตัวเดียว `entitlement(user_id, feature)` อ่านจากแพ็กปัจจุบันของเจ้าของ — route ที่รับ `box_id` หาเจ้าของจากตู้ก่อน · client ใช้ `plan.features` แค่ซ่อน/แสดงปุ่ม
- ไม่ผ่าน → **403 `PLAN_FEATURE_REQUIRED`** + `feature` ที่ขาด
- ตัวอย่างในอนาคต: ผูกตู้เกิน `max_boxes` → 403 · ดูประวัติย้อนเกิน `history_days` → ตัดช่วงให้ หรือ 403 ❓

## 18. ขอบเขตโซนของหัวหน้า (เพิ่ม 2026-10-27)

**โจทย์ (ผู้ใช้)**: หัวหน้าทีมควรเห็นทุกโซน หรือเห็นเป็นโซน ๆ

| แบบ | หัวหน้าเห็น | ข้อดี | ข้อเสีย |
|---|---|---|---|
| A. ทั้งหน่วยงาน | ทุกโซน ทุกคน ทุก Log ของหน่วยงาน | ง่าย · ย้ายคนตอนลาได้ทันที · ตรงกับ SOS ขั้น 2 ที่ส่งหัวหน้าทุกคนอยู่แล้ว | หน่วยงานใหญ่ ข้อมูลเยอะ หน้าจอรก |
| B. เฉพาะโซนที่ตัวเองดูแล | เฉพาะโซนที่ถูกกำหนดให้ | ข้อมูลน้อย ตรงงาน | ต้องมีคนกำหนดว่าหัวหน้าคนไหนดูโซนไหน · โซนใหม่ใครเห็น · คนลา/ย้ายโซนข้ามหัวหน้าทำยาก |
| **C. ทั้งหน่วยงาน + ตัวกรองโซน** ✅ เลือกแล้ว | **สิทธิ์** = ทุกโซนของหน่วยงาน · **หน้าจอ** เริ่มที่ "โซนของฉัน" สลับเป็น "ทุกโซน" ได้ | ได้ความง่ายของ A + หน้าจอไม่รกแบบ B · ไม่ต้องมีตารางสิทธิ์ใหม่ | — |

**✅ ใช้ C (ผู้ใช้ยืนยัน 2026-10-27)**
- สิทธิ์ (server): หัวหน้าจัดการได้ทุกโซนของหน่วยงานตัวเอง — สร้าง/แก้/ลบโซน, ย้ายบ้าน, ย้ายคน, ดู Log, ภาพรวม
- **ตรวจตู้**: หัวหน้าตรวจได้เฉพาะโซนที่ตัวเองอยู่ (เหมือนเจ้าหน้าที่) — อยากตรวจโซนไหนก็ใส่ตัวเองเข้าโซนนั้น (มีบันทึกใน Log ว่าใครย้าย)
- **SOS**: ไม่เปลี่ยน — ขั้น 1 เจ้าหน้าที่ในโซน (รวมหัวหน้าที่อยู่ในโซนนั้น) · ขั้น 2 ทุกคนในหน่วยงาน + หัวหน้าทุกคน
- **หน้าจอ**: `L04` ภาพรวม / `L08` Log มีตัวกรอง "โซนของฉัน · ทุกโซน · เลือกโซน" (ค่าเริ่มต้น = โซนของฉัน ถ้าหัวหน้าอยู่ในโซนใดโซนหนึ่ง ไม่งั้น = ทุกโซน) · `L06` รายการโซนแสดงทุกโซน มีป้าย "โซนที่ฉันอยู่"
- ข้อมูลบ้านที่หัวหน้าเห็นยังเป็น บ้านเลขที่ + ชื่อตู้ + สถานะตู้ เหมือนเดิม (ไม่เห็นชื่อ/เบอร์เจ้าของบ้าน)
- **ถ้าวันหนึ่งต้องการแบบ B** (เช่น สภ.ใหญ่มีหัวหน้าสายตรวจหลายสาย): เพิ่มตาราง `zone_heads (zone_id, user_id)` + ใช้ `users.level` ที่เผื่อไว้แยก "หัวหน้าหน่วยงาน" (เห็นทั้งหมด) กับ "หัวหน้าโซน" (เห็นเฉพาะโซนตัวเอง) — API เดิมใช้ได้ แค่ server กรองเพิ่ม

## 19. ไรเดอร์กดปุ่มหน้าตู้ (เพิ่ม 2026-10-27)

**โจทย์ (ผู้ใช้)**: ไรเดอร์แจ้งส่งของได้ทั้ง **สแกน QR** หรือ **กดปุ่มที่หน้าตู้** (ตู้มีปุ่มหน้าตู้ 1 ปุ่ม + Buzzer)

> ⏸ **พักไว้ (2026-10-27)** — ยังไม่สรุปว่ากดปุ่มแล้วเกิดอะไร · เสนอ **แบบ 1: กด = แจ้งส่งของเลย** (ร่างด้านล่าง) แทนแบบ 2 "กดแล้วตู้เปิด Wi-Fi ให้มือถือต่อเข้าเว็บส่งของ" (ขั้นตอนเยอะ, iPhone หน้าเว็บไม่เด้ง, กินไฟ, ทำยาก) · **รอพี่ในทีมยืนยัน**
> ไอเดียเพิ่มที่คุยไว้ (ยังไม่ตัดสิน): Buzzer บอกผลส่งของ/ตรวจตู้ · ปุ่มปลุกตู้ให้เจ้าหน้าที่ (ถึงขั้นให้ตู้หลับลึกตลอดแม้ในเวลาตรวจ) · ช่างกดค้างทดสอบตู้ (ต้องเปิดโหมดช่างก่อน) · **ไม่ทำ**: SOS จากปุ่ม, Buzzer ดังตอน SOS, กริ่งหน้าบ้าน

| # | เรื่อง | ร่างนี้ |
|---|---|---|
| 1 | ทางไหนก็ได้ | ✅ สแกน QR (หรือพิมพ์รหัส) ผ่านเว็บแอป **หรือ** กดปุ่มหน้าตู้ — ไม่ต้องใช้มือถือ ไม่ล็อกอิน |
| 2 | ฮาร์ดแวร์ | ปุ่มกดกันน้ำที่หน้าตู้ ต่อขาที่**ปลุก ESP32 จากหลับลึกได้** (RTC GPIO / ext0) → กดได้ทุกเวลาแม้นอกเวลาตรวจ · ไฟสถานะเดิมใช้บอกผล — **ต้องคุยกับพี่ตั๋ง** |
| 3 | ตู้ทำอะไร | กด → ตื่น → ต่อ Wi-Fi → `POST /v1/box/deliveries` (ลายเซ็น HMAC เหมือนคำขออื่น) → ไฟบอกผล → หลับต่อ (ในเวลาตรวจกลับไปถือ long-poll) |
| 4 | กันกดเล่น/แบตหมด | 💡 ตู้รอ ~3 วิ รวมการกดเป็นคำขอเดียว (`press_count`) · ไม่รับกดใหม่ระหว่างส่งและอีก ~30 วิ หลังส่ง · server ใช้**เพดานต่อตู้ร่วมกับ QR** → เกิน = `status: "limited"` |
| 5 | ส่งไม่ได้ | 💡 ลองใหม่ 3 ครั้ง (5 / 15 / 45 วิ) แล้วทิ้ง + นับ `delivery_fail` ในรายงานรายวัน (ไม่เก็บไว้ส่งทีหลัง ตามกติกาเดิม) ❓ |
| 6 | ไฟบอกผล | 💡 เขียว = ส่งแล้ว · ส้มกะพริบ = กดถี่เกิน · แดง = ส่งไม่ได้ / ตู้ปิดบริการ |
| 7 | Log / แจ้งเตือน | `deliveries.method = 'button'` (ไม่มี `qr_id`) · เจ้าของบ้านได้ "มีของมาส่ง (กดปุ่มหน้าตู้)" · ประวัติ `H12-c` แสดงวิธี |
| 8 | ข้อดีด้านความปลอดภัย | คำขอมีลายเซ็นตู้ = มีคนอยู่หน้าตู้จริง (ต่างจากสแกน QR ที่อาจมาจากรูปถ่าย) |
| 9 | กระทบตรวจสุขภาพ QR | ข้อ 2 "ไรเดอร์พิมพ์แทนสแกนเกินเกณฑ์" ยังนับเฉพาะ `code` · การกดปุ่มไม่นับว่า QR เสีย · 💡 แต่ถ้าตู้หนึ่งมีแต่กดปุ่ม ไม่มีสแกน QR เลยนาน ๆ ไม่ใช่สัญญาณ QR เสีย (ไรเดอร์อาจชอบกดปุ่ม) |
| 10 | กระทบไฟ | กด 1 ครั้งนอกเวลาตรวจ = ตื่น + ต่อ Wi-Fi + TLS 1 รอบ (เท่ากับรายงานรายวัน 1 ครั้ง) → บ้านที่ของมาส่งบ่อยกินไฟเพิ่ม — **ให้พี่ตั๋งวัด** |

- อัปเดตแล้ว: `SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md` (§2.7) · `SMMB_ขั้นตอนการใช้งานแต่ละคน.md` (ไรเดอร์, ตู้, ช่าง)
- wireframe ยังไม่ได้แก้: `R01`/`R02` ควรบอกว่า "หรือกดปุ่มหน้าตู้" · `T01` เช็กลิสต์ช่างเพิ่ม "ทดสอบปุ่มส่งของ"
