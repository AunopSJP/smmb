# ติดตั้ง SMMB บนเครื่อง Ubuntu (ไม่มีจอ) — ใช้งานจริง

> เขียน 29 ต.ค. 2026 · ต่างจาก `CODEX_SERVER_SETUP.txt` (นั่นคือ hub ทดสอบที่รันโหมด mock) — เอกสารนี้คือ **production**: PostgreSQL + Redis เป็น container, backend รันด้วย systemd, nginx หน้า
> ทำตามลำดับ · ทุกขั้นสั่งผ่าน SSH ได้ · ไม่ต้องมีเบราว์เซอร์บนเครื่อง server (ใช้เครื่องอื่นเปิดหน้าแอดมิน)

## ภาพรวม

```
มือถือ / เบราว์เซอร์ / บอร์ดตู้ ──HTTPS──▶ nginx ──▶ /smmb/      = ไฟล์เว็บ (static)
                                                  └▶ /smmb-api/  = backend (node :3000)
                                                                     ├─▶ PostgreSQL 17 (container, 127.0.0.1:5432)
                                                                     └─▶ Redis 7      (container, 127.0.0.1:6379)
```

- backend รันได้ **ตัวเดียว** (ระบบปลุกตู้อยู่ในหน่วยความจำ) · ห้ามเปิดหลาย instance
- Postgres / Redis ฟังเฉพาะ `127.0.0.1` ไม่เปิดสู่เครือข่าย
- ตู้ต้องเซ็นลายเซ็นด้วย path เต็มรวม prefix (`/smmb-api/v1/box/...`) → nginx **ห้ามตัด/rewrite path**, backend ตั้ง `API_PATH_PREFIX=/smmb-api` เอง

## 0. ก่อนเริ่ม — เตรียม 4 อย่าง

| ต้องมี | หมายเหตุ |
|---|---|
| โดเมน + ใบรับรอง HTTPS | ตู้ใช้ HTTPS เท่านั้น · ใบ Let's Encrypt ใช้ได้ (บอร์ดตรวจด้วย ISRG Root X1/X2) |
| Ubuntu 22.04/24.04 + สิทธิ์ sudo | RAM ≥ 2 GB · ดิสก์ ≥ 10 GB |
| โค้ดใน git (commit + push แล้ว) | `git clone` ลงเครื่อง server |
| ที่เก็บความลับ (password manager) | ดูข้อ 3 — **ทำสำรองก่อนใช้งานจริง** |

## 1. ติดตั้งโปรแกรมที่ต้องใช้

```bash
sudo apt update && sudo apt install -y git nginx curl ca-certificates
# Docker
curl -fsSL https://get.docker.com | sudo sh
# Node.js 24 (ต้อง >= 24)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # ต้องเป็น v24.x
```

## 2. ดึงโค้ด

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin smmb
sudo mkdir -p /opt/smmb && sudo chown smmb:smmb /opt/smmb
sudo -u smmb git clone <repo-url> /opt/smmb
```

## 3. สร้างความลับ (ทำครั้งเดียว — เก็บสำรอง!)

```bash
cd /opt/smmb/deploy
openssl rand -hex 24   # → POSTGRES_PASSWORD
openssl rand -hex 24   # → REDIS_PASSWORD
openssl rand -hex 32   # → BOX_MASTER_KEY
openssl rand -hex 32   # → QR_SIGNING_KEY  (คนละค่ากับข้างบน)
cd /opt/smmb/backend && npx --yes web-push generate-vapid-keys   # → VAPID public/private
```

| ความลับ | ถ้าหาย / เปลี่ยน |
|---|---|
| `BOX_MASTER_KEY` | **ทุกตู้ต้องเขียนรหัสลับใหม่ลงบอร์ด** (รหัสลับคิดจากคีย์นี้) |
| `QR_SIGNING_KEY` | **QR ที่พิมพ์ติดตู้แล้วใช้ไม่ได้ทั้งหมด** |
| VAPID | ทุกเครื่องที่เปิดแจ้งเตือนไว้ต้องเปิดใหม่ |
| รหัส Postgres | ต่อฐานข้อมูลไม่ได้ (ข้อมูลยังอยู่) |

เก็บทั้งหมดไว้ใน password manager **นอกเครื่อง server** และห้ามส่งในแชต/อีเมล

## 4. ฐานข้อมูล (container)

```bash
cd /opt/smmb/deploy
cp env.example .env && nano .env              # ใส่ POSTGRES_PASSWORD และ REDIS_PASSWORD
chmod 600 .env
sudo docker compose -f docker-compose.prod.yml up -d
sudo docker compose -f docker-compose.prod.yml ps     # ทั้งสองต้องเป็น healthy
```

ข้อมูล Postgres อยู่ใน volume `smmb_pgdata` (อยู่รอดตอนรีสตาร์ต/อัปเดต container) · **ห้าม** `docker compose down -v` (ลบข้อมูลทั้งหมด)

## 5. backend

```bash
cd /opt/smmb/backend
sudo -u smmb cp ../deploy/backend.env.example .env
sudo -u smmb nano .env       # ใส่ความลับข้อ 3 + โดเมนจริง (แทน <...> ทุกตัว)
sudo chmod 600 .env && sudo chown smmb:smmb .env
sudo -u smmb npm ci
sudo -u smmb npm run build
sudo -u smmb npm run migrate        # สร้างตารางทั้งหมด (migration 0001–0014+) · ทำซ้ำได้ ไม่ทำซ้ำของเดิม
```

ค่าที่ต้องตรวจใน `.env`: `NODE_ENV=production` · `PUBLIC_BASE_URL=https://<โดเมน>/smmb` · `QR_ALLOWED_HOSTS=<โดเมน>` · `API_PATH_PREFIX=/smmb-api` · `TRUST_PROXY` (ข้อ 9)

ถ้าตั้งค่าผิด (คีย์สั้นกว่า 32 ตัว, คีย์ซ้ำกัน, `SKIP_PUSH_REQUIRED`) backend **จะไม่ยอมเริ่ม** และบอกเหตุผล — ปลอดภัยไว้ก่อน

```bash
sudo cp /opt/smmb/deploy/smmb-backend.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now smmb-backend
sudo journalctl -u smmb-backend -n 40 --no-pager
curl -s http://127.0.0.1:3000/api/health      # ต้อง 200 (ตรวจ Postgres + Redis)
```

## 6. สร้างแอดมินคนแรก (ไม่มีหน้าเว็บให้สมัครแอดมิน)

```bash
cd /opt/smmb/backend
sudo -u smmb npm run admin:create -- 08XXXXXXXX "ชื่อแอดมิน"
```

ได้ **รหัสผ่านชั่วคราว (แสดงครั้งเดียว)** — ล็อกอินที่เว็บ ระบบบังคับเปลี่ยนรหัส + ยอมรับข้อตกลง · ห้ามรัน `npm run seed:dev` บน production (ระบบก็ไม่ยอมรันให้)

## 7. เว็บ (frontend)

```bash
cd /opt/smmb/frontend
sudo -u smmb npm ci
sudo -u smmb npm run build:hub        # base href /smmb/ + config.json { apiBase: /smmb-api, devTools: false }
sudo mkdir -p /var/www/smmb
sudo rsync -a --delete dist/smmb-web/browser/ /var/www/smmb/
cat /var/www/smmb/config.json         # ต้องเป็น apiBase = /smmb-api และ devTools = false
```

## 8. nginx

คัดลอกบล็อกจาก `deploy/nginx-smmb.conf` ไปใส่ใน `server { }` ของโดเมน (ที่มี HTTPS อยู่แล้ว) แล้ว

```bash
sudo nginx -t && sudo systemctl reload nginx
```

จุดที่ห้ามพลาด: `proxy_pass http://127.0.0.1:3000;` **ไม่มี `/` ท้ายและไม่มี path** (ถ้าใส่ nginx จะตัด prefix → ลายเซ็นของตู้ไม่ผ่านทุกตัว) · `proxy_read_timeout 75s` (long-poll ตู้ถือ 50 วิ)

## 9. ตั้ง TRUST_PROXY ให้ถูก (สำคัญ — พลาดแล้วรหัสผิดของคนหนึ่งล็อกทุกคน)

ถ้าไม่ตั้ง backend จะเห็น IP ทุกคำขอเป็น IP ของ proxy → rate limit / ล็อกรหัสผิดนับรวมกันทั้งระบบ

1. ยิงจาก **เครื่องอื่น**: `curl -s https://<โดเมน>/smmb-api/v1/box/jobs` (ได้ 401 ไม่เป็นไร)
2. ดูบน server (คำขอตู้ที่ไม่ผ่านถูกบันทึกพร้อม IP ไว้ในตาราง `box_auth_log_tb`):
   ```bash
   sudo docker exec smmb-postgres-1 psql -U smmb -d smmb -c "select ip, reason, created_date from app.box_auth_log_tb order by created_date desc limit 3"
   ```
3. IP ต้องเป็น IP จริงของเครื่องที่ยิง (เทียบกับ `curl ifconfig.me` ของเครื่องนั้น) ถ้าเป็น `127.0.0.1` หรือ IP ของ Cloudflare → ปรับ `TRUST_PROXY` (Cloudflare → nginx → node = `2` · nginx → node = `1`) แล้ว `sudo systemctl restart smmb-backend` ทำซ้ำจนถูก

## 10. ตรวจหลังติดตั้ง (ทำให้ครบก่อนเปิดใช้งาน)

ทำจากเครื่องอื่น (เบราว์เซอร์ / มือถือ) นอกจากที่ระบุ

| # | ตรวจ | ผ่านเมื่อ |
|---|---|---|
| 1 | `curl -s https://<โดเมน>/smmb-api/api/health` | 200 ทั้ง Postgres และ Redis |
| 2 | เปิด `https://<โดเมน>/smmb/` | ขึ้นหน้าเข้าสู่ระบบ ไม่มีแถบ "ต้นแบบ" ในหน้าหลัก |
| 3 | ล็อกอินแอดมิน (รหัสชั่วคราวจากข้อ 6) | บังคับเปลี่ยนรหัส แล้วเข้าหน้าภาพรวม |
| 4 | หลังบ้าน → ตู้ → ลงทะเบียนตู้ 1 ตู้ | ได้รหัสลับ + QR 3 ใบ พิมพ์ได้ |
| 5 | ตั้งรหัสผิด 5 ครั้งด้วยบัญชีทดสอบ | บัญชีถูกพัก 15 นาที · **คนอื่นยังล็อกอินได้** (ถ้าไม่ได้ = TRUST_PROXY ผิด) |
| 6 | มือถือ: เปิดเว็บ → เปิดแจ้งเตือน → ปุ่ม "ทดสอบแจ้งเตือน" | เด้งแจ้งเตือนจริง (iPhone ต้องเพิ่มลงหน้าจอหลักก่อน) · กดแล้วเปิดแอปถูกหน้า |
| 7 | บอร์ด: เขียน URL `https://<โดเมน>/smmb-api` + box_id + รหัสลับ | หลังบ้านเห็น boot และ "ถือ long-poll ล่าสุด: เมื่อสักครู่" |
| 8 | หลังบ้าน → "ทดสอบปลุกตู้ + กล้อง" | บอร์ดปี๊บและเปิดกล้อง ภายใน 1–3 วิ (สัญญาณ Wi-Fi ดี) |
| 9 | ตรวจจริงครบเส้น: เจ้าของผูกตู้ → หัวหน้าใส่โซน → เจ้าหน้าที่สแกน → ตู้อ่าน QR ประจำตัว | "ตรวจแล้ว" + เจ้าของได้แจ้งเตือน |
| 10 | `sudo systemctl restart smmb-backend` ระหว่างมีผู้ใช้ | กลับมาใน ~10 วิ · ข้อมูลไม่หาย · บอร์ดต่อใหม่เอง |
| 11 | `sudo reboot` | docker + backend ขึ้นเองหลังบูต (เช็กด้วยข้อ 1) |

## 11. สำรองข้อมูล (ต้องทำก่อนมีข้อมูลจริง)

```bash
# /etc/cron.d/smmb-backup  — สำรองทุกวัน 03:10 เก็บ 14 วัน
10 3 * * * root docker exec smmb-postgres-1 pg_dump -U smmb -Fc smmb > /var/backups/smmb/smmb-$(date +\%F).dump && find /var/backups/smmb -name 'smmb-*.dump' -mtime +14 -delete
```

```bash
sudo mkdir -p /var/backups/smmb && sudo chmod 700 /var/backups/smmb
```

- **ต้องคัดลอกไฟล์สำรองออกนอกเครื่อง** (เครื่อง server พังแล้วสำรองในเครื่องเดียวกันก็หาย)
- ทดสอบกู้คืนอย่างน้อย 1 ครั้ง: `docker exec -i smmb-postgres-1 pg_restore -U smmb -d smmb_test < ไฟล์.dump` (ในฐานข้อมูลทดสอบ ไม่ใช่ของจริง)
- สำรอง `/opt/smmb/backend/.env` ไว้ด้วย (ความลับข้อ 3)

## 12. อัปเดตเวอร์ชันถัดไป

```bash
cd /opt/smmb && sudo -u smmb git pull
cd backend  && sudo -u smmb npm ci && sudo -u smmb npm run build && sudo -u smmb npm run migrate
cd ../frontend && sudo -u smmb npm ci && sudo -u smmb npm run build:hub && sudo rsync -a --delete dist/smmb-web/browser/ /var/www/smmb/
sudo systemctl restart smmb-backend
curl -fsS https://<โดเมน>/smmb-api/api/health
```

- migration เป็นไฟล์เพิ่มเท่านั้น ห้ามแก้ไฟล์ migration เดิม · ย้อนกลับ = กู้จากไฟล์สำรองก่อนอัปเดต (สำรองก่อนอัปเดตทุกครั้ง)
- รหัส `device_secret` ของตู้ที่ติดตั้งแล้วไม่เปลี่ยนเมื่ออัปเดต (ตราบใดที่ `BOX_MASTER_KEY` เดิม)

## 13. แก้ปัญหา

| อาการ | ดู |
|---|---|
| backend ไม่ขึ้น | `journalctl -u smmb-backend -n 80` — ข้อความ `Invalid environment` บอกค่าที่ผิด |
| `/api/health` ตอบ 503 | ตรวจ `docker compose ps` (Postgres/Redis healthy?) และรหัสใน `.env` |
| ตู้ได้ 401 `bad_signature` ทุกตัว | nginx ตัด prefix? (`proxy_pass` ต้องไม่มี path) · `API_PATH_PREFIX` ตรงกับ URL ในบอร์ด? |
| ตู้ได้ 401 `clock_skew` | นาฬิกา server ผิด — `timedatectl` ต้อง synchronized (NTP) |
| ตู้ได้ 308 | URL ในบอร์ดเป็น `http://` — ต้อง `https://` |
| แจ้งเตือนไม่เด้ง | เว็บต้อง HTTPS + build production · VAPID ตั้งแล้ว · iPhone ต้องเพิ่มลงหน้าจอหลัก |
| ล็อกอินผิดแล้วทุกคนโดนล็อก | `TRUST_PROXY` ผิด (ข้อ 9) |

## 14. ข้อจำกัดที่ต้องรู้

- backend 1 instance · ไม่มี failover — พักได้ไม่กี่วินาทีตอนรีสตาร์ต (ตู้ต่อใหม่เอง)
- ยังไม่เคยทดสอบด้วยผู้ใช้จำนวนมากพร้อมกัน (ทดสอบเฉพาะการใช้งานระดับสิบ)
- บอร์ด: กล้องอ่าน QR ประจำตัวเจ้าหน้าที่ **ยังไม่ผ่านบนบอร์ดจริง** ตอนเขียนเอกสารนี้ — ต้องทดสอบข้อ 9 ในข้อ 10 ให้ผ่านก่อนเปิดใช้งานจริงกับบ้านจริง
- ต้องเลือกโดเมน/พาธ (`/smmb/`, `/smmb-api/`) ก่อนพิมพ์ QR และเขียนบอร์ด — เปลี่ยนทีหลังต้องพิมพ์ QR ใหม่และเขียนบอร์ดใหม่ทุกตัว
