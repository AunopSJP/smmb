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

ตอนเริ่มจะพิมพ์: **URL ให้บอร์ด** (IP วงแลนของเครื่องนี้ พอร์ต 3000) · **box_id + device_secret** ของตู้จำลอง `BX-00001` (ผูกแล้ว อยู่ในโซนตรวจทั้งวัน → ถือ long-poll ได้ตลอด) และ `BX-00002` (ยังไม่ผูก) · บัญชีจำลองรหัส `demo1234` (แอดมิน `0800000001` · เจ้าของบ้าน `0812345678` · หัวหน้า `0823456789` · เจ้าหน้าที่ `0834567890`)

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
