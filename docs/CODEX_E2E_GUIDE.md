# คู่มือรันเทสต์ e2e บน Postgres จริง (สำหรับ Codex บนเครื่องเซิร์ฟเวอร์)

เป้าหมาย: ก่อน deploy ทุกครั้ง รันเทสต์ครบชุดกับ **Postgres ตัวจริง** เพื่อจับปัญหา migration และ query ที่โหมดจำลอง (PGlite) ไม่เจอ
ใช้ container ชั่วคราวที่อยู่ใน RAM — **ห้ามชี้ไปฐานข้อมูลจริงของระบบ** (เทสต์สร้าง/ลบข้อมูลเอง)

## ข้อกำหนด

- Docker + Docker Compose, Node 22+ (ตามที่ backend ใช้)
- ทำที่โฟลเดอร์ root ของ repo (มี `deploy/` และ `backend/`)

## ขั้นตอน

1. เปิดฐานข้อมูลชั่วคราว (พอร์ต 55432)

   ```bash
   docker compose -f deploy/docker-compose.e2e.yml up -d --wait
   ```

2. ตั้งค่าและเตรียมฐานข้อมูล (ใช้ค่านี้ในเทอร์มินัลเดียวกันตลอด)

   ```bash
   cd backend
   export DATABASE_URL=postgres://smmb:smmb_e2e_only@127.0.0.1:55432/smmb_e2e
   export NODE_ENV=test
   npm ci
   npm run migrate      # รัน migration ทุกไฟล์ (0001 → ล่าสุด) ถ้าตรงนี้พังคือ migration มีปัญหา
   npm run seed:dev     # บัญชี/ข้อมูลตัวอย่างที่เทสต์ต้องใช้
   ```

   ถ้า env ขาดตัวอื่น (เช่น `PUBLIC_BASE_URL`, `QR_SIGNING_KEY`) ให้คัดลอกจาก `backend/.env.example` มาใส่ค่าทดสอบ — **ห้ามใช้คีย์ของ production**

3. รันเทสต์

   ```bash
   npm test             # unit
   npm run test:e2e     # e2e ทั้งชุด (รันทีละไฟล์ ใช้เวลาไม่กี่นาที)
   ```

4. ปิดและล้างทิ้ง

   ```bash
   cd ..
   docker compose -f deploy/docker-compose.e2e.yml down
   ```

## อ่านผล

| ผล | ความหมาย | ทำอะไรต่อ |
|---|---|---|
| ผ่านทั้งหมด | พร้อม deploy | แจ้งผู้ใช้ว่าผ่าน พร้อมจำนวนเทสต์ |
| `npm run migrate` พัง | migration ใหม่ (`0029_zone_area`, `0030_profile_detail` ฯลฯ) รันบน Postgres จริงไม่ได้ | **หยุด ห้าม deploy** · ส่งข้อความ error ให้ผู้ใช้ |
| เทสต์ใดตก | โค้ดหรือเทสต์ผิด | ส่งชื่อไฟล์ + ข้อความ error ให้ผู้ใช้ ห้ามแก้เทสต์ให้ผ่านเอง |

## ข้อควรระวัง

- ห้ามรัน `seed:dev` / `test:e2e` กับ `DATABASE_URL` ของจริง
- ห้ามแก้ไฟล์ migration ที่ apply ไปแล้ว (checksum จะไม่ผ่าน)
- เทสต์ใช้ตัวส่ง push จำลอง ไม่ยิงออกอินเทอร์เน็ต และไม่ต้องมี Redis
- ถ้าพอร์ต 55432 ถูกใช้อยู่ ให้แก้ตัวเลขในไฟล์ compose และใน `DATABASE_URL` ให้ตรงกัน
- เสร็จแล้วรายงานผู้ใช้เป็นภาษาไทย: ผ่าน/ไม่ผ่านกี่ไฟล์ และขั้นไหนที่พัง
