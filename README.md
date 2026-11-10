# SMMB — Smart Mailbox

ระบบตู้จดหมายอัจฉริยะสำหรับหมู่บ้าน: เจ้าของบ้าน · เจ้าหน้าที่ตรวจ · หัวหน้าหน่วยงาน · แอดมิน/ช่าง · ไรเดอร์

## เริ่มใน 5 นาที (mock)

```powershell
# 1) backend + ฐานข้อมูลจำลอง (PGlite) + seed บัญชีเดโม
cd backend
npm install
npm run dev:mock          # http://localhost:3000

# 2) frontend (terminal อีกอัน)
cd frontend
npm install
npm start                 # http://localhost:4200
```

บัญชีเดโม (รหัสผ่าน `demo1234` ทุกบัญชี):

| บทบาท | เบอร์ |
|---|---|
| แอดมิน/ช่าง | `0800000001` |
| เจ้าของบ้าน | `0812345678` |
| หัวหน้าหน่วยงาน | `0823456789` |
| เจ้าหน้าที่ | `0834567890` |

## คำสั่งที่ใช้บ่อย

```powershell
npm run box:sim -- live --url http://localhost:3000 --box BX-00001 --secret <device_secret>
node scripts/project-guardian.mjs --full     # build/lint/test + static audit
npm --prefix frontend run lint               # oxlint
npm --prefix backend run mock:clean          # ลบ .mockdb-* เก็บ .mockdb
```

- deploy production: `scripts/deploy.sh` (รายละเอียด `docs/DEPLOY_UBUNTU.md`)
- งานค้าง/สถานะล่าสุด: `docs/FLOW_AND_GAPS.md`
- กติกาการทำงานของ agent: `CLAUDE.md`
