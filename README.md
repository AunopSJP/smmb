# SMMB — Smart Mailbox

| โฟลเดอร์ | อะไร |
|---|---|
| `backend/` | NestJS (TypeScript) — API เว็บแอป `/api/v1/*`, health `/api/health*`, ตู้ `/v1/box/*` |
| `frontend/` | Angular PWA — เว็บแอปตัวเดียวของทุกบทบาท |
| `docs/` | ออกแบบ, สัญญา API, โปรโตคอลตู้, wireframe — เริ่มอ่านที่ `CLAUDE.md` แล้ว `docs/HANDOFF.md` |
| `docker-compose.yml` | Postgres 17 + Redis 7 สำหรับ dev |

## รันบนเครื่อง (dev)

ต้องมี Node 24+ และ Docker Desktop

```bash
cd backend
cp .env.example .env        # แล้วใส่ VAPID key: npx web-push generate-vapid-keys
npm install
npm run db:up               # เปิด Postgres + Redis
npm run migrate             # รัน sql/migrations ที่ยังไม่เคยรัน
npm run seed:dev            # ข้อตกลงฉบับทดสอบ (ไม่มี = สมัครไม่ได้)
npm run start:dev           # http://localhost:3000/api/health
```

```bash
cd frontend
npm install
npm start                   # http://localhost:4200 (ส่ง /api ต่อไป backend ผ่าน proxy.conf.json)
```

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
