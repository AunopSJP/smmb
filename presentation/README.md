# SMMB — Presentation

ชุดนำเสนอ **SMMB (Smart Mailbox)** 15 สไลด์ 16:9 ภาษาไทย
ออกแบบด้วยโทเคนเดียวกับเว็บแอป (แดงหม่น `#9A2F36` บนกระดาษอุ่น) และใช้ภาพหน้าจอจริงจากโปรเจกต์

## ไฟล์ที่ต้องใช้

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `SMMB-Smart-Mailbox.pdf` | **ไฟล์ส่ง/พิมพ์** 15 หน้า · 1280×720 px (13.33×7.5 in) |
| `smmb-deck.html` | เปิดใน Chrome เพื่อนำเสนอแบบเต็มจอ (ลูกเล่น + ซ่อน HUD อัตโนมัติ) |
| `SPEAKER-NOTES.md` | สคริปต์พูดทีละสไลด์ + Q&A ที่มีโอกาสถูกถาม |
| `assets/` | ภาพหน้าจอ · ฟอนต์ IBM Plex (เก็บในเครื่อง) · QR จริง |
| `qa/` | ภาพตรวจทุกสไลด์ (โหมดจอ + โหมดพิมพ์) — ใช้ตรวจ regression ได้ |

## เปิดนำเสนอ

1. เปิด `smmb-deck.html` ด้วย Chrome
2. กด `F` = เต็มจอ
3. `←` `→` / `Space` = เลื่อน · `Home` / `End` = ไปหน้าแรก/สุดท้าย
4. HUD bottom-center จะซ่อนเองหลัง 2.6 วินาที (ขยับเมาส์เพื่อกลับมา)
5. เปิดตรงสไลด์ได้ด้วย `#n` เช่น `smmb-deck.html#11`

## สร้าง PDF ใหม่

ต้องมี:
- Node.js 20+
- Chrome ที่ติดตั้งในเครื่อง
- `frontend/node_modules` (มี Playwright อยู่แล้วจาก `npm install`)

```powershell
cd presentation
node build.mjs
```

ผลลัพธ์:
- `SMMB-Smart-Mailbox.pdf` (15 หน้า)
- `qa/slide-01..15.png` (โหมดจอ)
- `qa/print-01..15.png` (โหมดพิมพ์ — ตัวเดียวกับที่ Chrome ใช้ทำ PDF)

สคริปต์จะรายงานจำนวนหน้า, ขนาด MediaBox และ error จาก console ให้ด้วย
ถ้า Chrome อยู่คนละที่ ให้แก้ `channel: 'chrome'` ใน `build.mjs` เป็น path ของ Chrome

## แก้เนื้อหา / ดีไซน์

- เนื้อหาทุกสไลด์อยู่ใน `smmb-deck.html` (`<section class="slide">` 1 อัน = 1 หน้า)
- โทเคนสี/ตัวอักษร/ระยะอยู่บนสุดใน `<style>` — แก้ที่ `:root` และ `.dark`
- ภาพหน้าจออ้างจาก `assets/shots/` — ถ้าเปลี่ยนภาพให้คงชื่อไฟล์เดิม หรือแก้ `src`
- ตัวเลขในสไลด์ 12 และสถานะในสไลด์ 13 มีวันที่กำกับ — **อัปเดตเมื่อรัน test/deploy รอบใหม่**
- QR ในสไลด์ 15 เป็นลิงก์จริง `https://hub.sjp-dev.net/smmb` (สร้างด้วยแพ็กเกจ `qrcode` ของ frontend)

## ที่มาของภาพ

| ภาพ | ที่มา |
|---|---|
| `role-owner.png`, `role-officer.png`, `role-head.png`, `role-rider.png` | `ux-redesign/shots/after/default-light-390/` |
| `admin-dark.png`, `admin-light.png`, `admin-boxes.png` | `ux-redesign/shots/after/default-dark-1440/`, `default-light-1440/` |
| `owner-settings.png`, `owner-home.png`, `owner-home-bottom.png`, `signin.png`, `officer-history.png` | `ux-redesign/shots/after/default-light-390/` |
| `firmware-flasher.png` | `firmware-program/app/shots/dashboard-final.png` |

ภาพหน้าจอเป็นของจริงจากโปรเจกต์ ไม่ใช่ mockup ที่วาดใหม่
(ยกเว้นแผนภาพสถาปัตยกรรม/ฮาร์ดแวร์/สมุดลงชื่อ ซึ่งวาดด้วย CSS/SVG ในเด็ค)

## หมายเหตุความถูกต้อง

- ตัวเลข unit 225 = backend 113 + frontend 112 (รันซ้ำ 17 พ.ย. 2026)
- e2e 170 และ Playwright 9 อ้างจากรายงาน 13 และ 12 พ.ย. 2026 — ยังไม่รันซ้ำในรอบนี้
- production health 200 ตรวจเมื่อ 17 พ.ย. 2026
- สไลด์ 13 ตั้งใจไม่พูดว่า “พร้อมเปิดนำร่อง” เพราะยังติด 5 ข้อด้านฮาร์ดแวร์/ปฏิบัติการ
- ข้อตกลง/PDPA ฉบับจริงยังต้องให้ผู้เชี่ยวชาญกฎหมายตรวจก่อนเปิดใช้

## ฟอนต์

`assets/fonts/` เก็บ IBM Plex Sans Thai + IBM Plex Mono (woff2) จาก Google Fonts
เพื่อให้ PDF/HTML ใช้ฟอนต์เดียวกันได้แม้ไม่มีเน็ต
ถ้าต้องการดึงใหม่: `node fetch-fonts.mjs`
