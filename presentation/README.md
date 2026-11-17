# SMMB — Presentation

ชุดนำเสนอ **SMMB (Smart Mailbox)** ภาษาไทย สำหรับลูกค้า
ทิศทาง: **refined minimal / editorial** — กระดาษอุ่น หมึกเข้ม แดงหม่นหนึ่งสี ฟอนต์ serif ไทย และภาพหน้าจอจริง

## ไฟล์หลัก

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `SMMB-Smart-Mailbox.pdf` | **ไฟล์นำเสนอลูกค้า 13 สไลด์** · 1280×720 px (13.33×7.5 in) |
| `smmb-deck.html` | เปิดใน Chrome เพื่อนำเสนอเต็มจอ (`F`, `←` `→`) |
| `SPEAKER-NOTES.md` | สคริปต์พูดทีละสไลด์ + Q&A สำหรับลูกค้า |
| `assets/` | ภาพหน้าจอจริง · ฟอนต์ในเครื่อง · QR |
| `qa/` | ภาพตรวจทุกสไลด์ (จอ + พิมพ์) |

## ไฟล์ internal (ละเอียดกว่า)

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `SMMB-Smart-Mailbox-Detailed.pdf` | เด็ค 15 สไลด์ฉบับละเอียด — สถาปัตยกรรม/security/ตัวเลข/สถานะ |
| `smmb-deck-detailed.html` | ต้นฉบับเด็คฉบับละเอียด |
| `SPEAKER-NOTES-detailed.md` | notes ฉบับละเอียด |
| `qa-detailed/` | ภาพตรวจเด็คฉบับละเอียด |

## เปิดนำเสนอ

1. เปิด `smmb-deck.html` ด้วย Chrome
2. `F` = เต็มจอ
3. `←` `→` / `Space` = เลื่อน · `Home` / `End` = หน้าแรก/สุดท้าย
4. เปิดตรงสไลด์ด้วย `#n` เช่น `smmb-deck.html#7`
5. HUD จะซ่อนเองหลัง 2.6 วินาที

## สร้าง PDF ใหม่

ต้องมี Node.js 20+, Chrome และ `frontend/node_modules` (Playwright)

```powershell
cd presentation

node build.mjs            # เด็คหลัก → SMMB-Smart-Mailbox.pdf + qa/
node build-detailed.mjs   # เด็ค internal → SMMB-Smart-Mailbox-Detailed.pdf + qa-detailed/
```

สคริปต์รายงานจำนวนหน้า, MediaBox และ error จาก console
ถ้า Chrome อยู่คนละที่ แก้ `channel: 'chrome'` ในสคริปต์

## แก้เนื้อหา / ดีไซน์

- 1 `<section class="slide">` = 1 หน้า
- โทเคนสี/ฟอนต์/ระยะอยู่ใน `<style>` ด้านบน (`:root`, `.dark`)
- ภาพอ้างจาก `assets/shots/` — เปลี่ยนภาพโดยคงชื่อไฟล์หรือแก้ `src`
- ตัวเลขในสไลด์ 11 (99 หน้าจอ / 3 โหมด / 2 ภาษา) และขั้นตอนในสไลด์ 12
  ควรอัปเดตเมื่อสถานะโปรเจกต์เปลี่ยน
- QR สไลด์ 13 เป็นลิงก์จริง `https://hub.sjp-dev.net/smmb`

## ทิศทางดีไซน์

- **Palette:** paper `#F7F3EC` · ink `#17120F` · crimson `#8E2A31` — ไม่มี gradient / เงาสี / ม่วง
- **Type:** Noto Serif Thai (หัวเรื่อง) + IBM Plex Sans Thai (เนื้อหา)
- **Rule:** หนึ่งไอเดียต่อสไลด์ · ตัวอักษรใหญ่ · ช่องว่างมาก · ไม่มีป้าย/การ์ดเล็ก ๆ
- **Imagery:** ภาพหน้าจอจริงจาก `ux-redesign/shots` + line art ของตู้ (SVG)
- **Print:** `@page 1280×720` · Chrome PDF = 960×540 pt

## ที่มาของภาพ

| ภาพ | ที่มา |
|---|---|
| `role-officer.png`, `role-owner.png`, `role-rider.png` | `ux-redesign/shots/after/default-light-390/` |
| `admin-dark.png` | `ux-redesign/shots/after/default-dark-1440/admin-home.png` |
| `smmb-qr.png` | สร้างด้วยแพ็กเกจ `qrcode` จาก URL จริง |

## หมายเหตุความถูกต้อง

- ฉบับลูกค้าตัดตัวเลขทางเทคนิคออกโดยตั้งใจ (tests/migrations/endpoints) — อยู่ในเด็ค internal
- สไลด์ 12 พูดถึงการพิสูจน์กับตู้จริงก่อนนำร่อง ไม่ได้อ้างว่าพร้อมเปิดใช้ทันที
- ตัวเลขพลังงาน/แบตยังเป็นสมมติฐานจนกว่าจะวัดกับตู้จริง
- ข้อตกลง/PDPA ฉบับจริงต้องผ่านผู้เชี่ยวชาญกฎหมายก่อนใช้

## ฟอนต์

`assets/fonts/` เก็บ IBM Plex Sans Thai, IBM Plex Mono และ Noto Serif Thai (woff2)
ดึงใหม่ได้ด้วย `node fetch-fonts.mjs` และ `node fetch-fonts-serif.mjs`
