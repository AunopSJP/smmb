# SMMB — Smart Mailbox

| โฟลเดอร์ | อะไร |
|---|---|
| `backend/` | NestJS (TypeScript) — API เว็บแอป `/api/v1/*`, health `/api/health*`, ตู้ `/v1/box/*` |
| `frontend/` | Angular PWA — เว็บแอปตัวเดียวของทุกบทบาท |
| `docs/` | ออกแบบ, สัญญา API, โปรโตคอลตู้, wireframe — เริ่มอ่านที่ `CLAUDE.md` แล้ว `docs/HANDOFF.md` |
| `docker-compose.yml` | Postgres 17 + Redis 7 สำหรับ dev |

## ⚡ รันเร็วสุด: โหมด mock (ไม่ต้องติดตั้ง Postgres / Redis / Docker) — ใช้ทดสอบบอร์ด ESP32

> ทีมเฟิร์มแวร์: อ่าน [docs/HARDWARE_FIRMWARE_GUIDE.md](docs/HARDWARE_FIRMWARE_GUIDE.md) ก่อน

```bash
cd backend
npm install
npm run dev:mock              # ฐานข้อมูลฝังในโปรแกรม เก็บที่ backend/.mockdb/ + ใส่ข้อมูลจำลองครั้งแรก
npm run dev:mock -- --reset   # ล้างข้อมูล mock แล้วเริ่มใหม่
```

สำหรับนำเสนอให้เปิด backend และ frontend บนเครื่องเดียวกัน ต่อบอร์ดกับ Wi-Fi วงเดียวกัน แล้วเปิดเว็บจากมือถือ/แท็บเล็ตที่ต่อวงเดียวกัน:

```bash
cd frontend
npm install
npm run start:demo          # Angular รับการเชื่อมต่อจากอุปกรณ์อื่นในวงแลน
```

ถ้าโฟลเดอร์ฐาน mock เดิมของเครื่องมีปัญหา หรืออยากแยกข้อมูลนำเสนอออกจากข้อมูลทดลองเดิม ให้ใช้โฟลเดอร์ใหม่โดยไม่ล้างของเดิม (PowerShell): `$env:SMMB_MOCK_DATA_DIR='.mockdb-sales-demo'; npm run dev:mock` · ค่านี้ต้องเป็นโฟลเดอร์ย่อยภายใน `backend/`.

หน้า backend จะแสดง **URL เว็บ/QR สำหรับมือถือ** และ **URL ให้บอร์ด** โดยเลือก IP วงแลนให้ หากเครื่องมีหลาย network adapter ให้กำหนด `SMMB_DEMO_HOST` ก่อนเปิด backend เช่น PowerShell: `$env:SMMB_DEMO_HOST='192.168.1.20'`. เปิด URL เว็บที่พิมพ์ใน console แล้วตามด้วย `/demo` เพื่อเลือกบทบาท; ปุ่มเลือกบทบาทจะล็อกอินบัญชี seed บน backend จริงด้วยรหัสผ่าน `demo1234`.

ขั้นตอนเตรียมบอร์ดและลำดับนำเสนอแบบสดดูที่ [คู่มือนำเสนอด้วยตู้จริง](docs/SALES_DEMO_GUIDE.md).

ข้อมูลตัวอย่าง: แอดมิน `0800000001` · เจ้าของบ้าน `0812345678` · หัวหน้า `0823456789` · เจ้าหน้าที่ `0834567890` (รหัสผ่านทุกบัญชี `demo1234`) · ตู้ `BX-00001` ผูกกับเจ้าของและอยู่ในโซนตรวจทั้งวัน · `BX-00002` ยังไม่ผูก. `BX-00001` เหมาะกับเดโมตรวจจริงและกล้อง; ใช้ `BX-00002` แสดง flow ติดตั้ง/ผูกตู้.

พิมพ์ **URL เว็บ/QR สำหรับมือถือ** ลง QR หน้าตู้; ห้ามใช้ QR ที่มี `localhost` เมื่อต้องสแกนจากมือถือ. หน้าเว็บบนมือถือที่ใช้กล้องเพื่อสแกน QR ต้องเปิดผ่าน HTTPS ที่เบราว์เซอร์เชื่อถือ (เช่น staging domain หรือ local HTTPS certificate ที่ติดตั้งความเชื่อถือบนมือถือแล้ว); HTTP วงแลนใช้ทดสอบ API/บอร์ดได้ แต่บางเบราว์เซอร์จะไม่อนุญาตกล้องเว็บ.

- ทุกคำขอจากตู้พิมพ์ลง console (`[Box] BX-00001 POST /v1/box/boot → 200`) · ลายเซ็นไม่ผ่านพิมพ์เหตุผล (`[BoxAuth] … bad_signature`)
- ปลุกตู้: ล็อกอินแอดมิน → `POST /api/v1/admin/boxes/BX-00001/test-jobs`
- Windows ถามสิทธิ์ firewall ครั้งแรก → อนุญาต **Private network** ไม่งั้นบอร์ดต่อไม่ได้ · บอร์ดต้องอยู่ Wi-Fi วงเดียวกับเครื่องนี้
- `device_secret` คิดจาก `BOX_MASTER_KEY` ใน `backend/.env` (ไม่มีใช้ค่า dev) → เปลี่ยนคีย์ = ต้องเขียนรหัสลับลงบอร์ดใหม่
- ใช้ตอน dev เท่านั้น ห้ามใช้กับเซิร์ฟเวอร์จริง (ฐานข้อมูลรับได้ทีละ connection)

## รันบนเครื่อง (dev) แบบ Postgres + Redis จริง

ต้องมี Node 24+ และ Docker Desktop

```bash
cd backend
cp .env.example .env        # แล้วใส่ VAPID key (npx web-push generate-vapid-keys) + BOX_MASTER_KEY / QR_SIGNING_KEY (openssl rand -hex 32 คนละค่า)
npm install
npm run db:up               # เปิด Postgres + Redis
npm run migrate             # รัน sql/migrations ที่ยังไม่เคยรัน
npm run admin:create -- 0812345678 "ชื่อแอดมิน"   # แอดมินคนแรก (ได้รหัสชั่วคราว)
npm run start:dev           # http://localhost:3000/api/health
```

```bash
cd frontend
npm install
npm start                   # http://localhost:4200 (ส่ง /api ต่อไป backend ผ่าน proxy.conf.json)
```

## ตู้จำลอง (ไม่มีบอร์ดก็ทดสอบ API ตู้ได้)

`npm run box:sim -- live --url http://localhost:3000 --box BX-00001 --secret <64 ตัว>` = ทำตัวเหมือนบอร์ดจริง (boot → ถือ long-poll → ทำงานทดสอบ/ตรวจ) · คำสั่งย่อยอื่นด้านล่าง

```bash
cd backend
npm run box:sim -- boot --url http://localhost:3000 --box BX-00001 --secret <device_secret>
npm run box:sim -- poll --url http://localhost:3000 --box BX-00001 --secret <device_secret>
```

`device_secret` ได้จาก `POST /api/v1/admin/boxes` · ปลุกตู้ด้วย `POST /api/v1/admin/boxes/<box_id>/test-jobs` · ทดสอบบอร์ดจริง: `docs/SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md` §8

## เทสต์

```bash
cd backend && npm test          # unit
cd backend && npm run test:e2e  # ต้องเปิด db ก่อน
cd frontend && npx ng test --watch=false
```

## migration

- เพิ่มไฟล์ใหม่ใน `backend/sql/migrations/` ตั้งชื่อเรียงเลข (`0001_init.sql`, `0002_...`) — รันไฟล์ละหนึ่ง transaction
- **ห้ามแก้ไฟล์ที่ apply แล้ว** ตัวรันเก็บ checksum ไว้ ถ้าแก้จะหยุดและบอกให้เขียนไฟล์ใหม่แทน
- เซิร์ฟเวอร์จริง: `npm run build && npm run migrate:prod` (ใช้ `DATABASE_URL` จาก env)
