# SMMB — Presentation

ชุดนำเสนอ **SMMB (Smart Mailbox)** ภาษาไทย สำหรับลูกค้า
สไตล์อ้างอิงจากเด็คตัวอย่างเดิม: พื้นเทาอ่อน · การ์ดขาว · หัวข้อ sans หนา · pill label · ภาพมือถือจริง · แดงเดียวตามแบรนด์

## ไฟล์หลัก

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `SMMB-Smart-Mailbox.pdf` | **ไฟล์นำเสนอลูกค้า 13 สไลด์** · 1920×1080 px (16:9) |
| `smmb-deck.html` | เปิดใน Chrome เพื่อนำเสนอเต็มจอ (`F`, `←` `→`) |
| `SPEAKER-NOTES.md` | สคริปต์พูดทีละสไลด์ + Q&A สำหรับลูกค้า |
| `assets/shots/current/` | **ภาพหน้าจอปัจจุบัน** จากแอปที่รันจริง (17 พ.ย. 2026) |
| `qa/` | ภาพตรวจทุกสไลด์ (จอ + พิมพ์) |

## ไฟล์ internal (ละเอียดกว่า)

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `SMMB-Smart-Mailbox-Detailed.pdf` | เด็ค 15 สไลด์ฉบับละเอียด · สถาปัตยกรรม/security/ตัวเลข/สถานะ |
| `smmb-deck-detailed.html` | ต้นฉบับเด็คฉบับละเอียด |
| `SPEAKER-NOTES-detailed.md` | notes ฉบับละเอียด |
| `qa-detailed/` | ภาพตรวจเด็คฉบับละเอียด |

> เด็ค internal ใช้ภาพจาก `ux-redesign/shots` ซึ่งเก่ากว่าภาพปัจจุบัน — ถ้าจะนำไปใช้ภายนอกให้เปลี่ยนเป็น `assets/shots/current/` ก่อน

## เปิดนำเสนอ

1. เปิด `smmb-deck.html` ด้วย Chrome
2. `F` = เต็มจอ
3. `←` `→` / `Space` = เลื่อน · `Home` / `End` = หน้าแรก/สุดท้าย
4. เปิดตรงสไลด์ด้วย `#n` เช่น `smmb-deck.html#6`
5. HUD จะซ่อนเองหลัง 2.6 วินาที

## สร้าง PDF ใหม่

ต้องมี Node.js 20+, Chrome และ `frontend/node_modules` (Playwright)

```powershell
cd presentation

node build.mjs            # เด็คหลัก → SMMB-Smart-Mailbox.pdf + qa/
node build-detailed.mjs   # เด็ค internal → SMMB-Smart-Mailbox-Detailed.pdf + qa-detailed/
```

สคริปต์รายงานจำนวนหน้า, MediaBox และ error จาก console

## แก้เนื้อหา / ดีไซน์

- 1 `<section class="slide">` = 1 หน้า
- โทเคนสี/ฟอนต์/ระยะอยู่ใน `<style>` ด้านบน (`:root`)
- ภาพหน้าจออ้างจาก `assets/shots/current/` — เปลี่ยนภาพโดยคงชื่อไฟล์หรือแก้ `src`
- QR สไลด์ 13 เป็นลิงก์จริง `https://hub.sjp-dev.net/smmb`

## ทิศทางดีไซน์

- **Palette:** light gray `#F5F6F7` · white cards · ink `#1D1D1F` · brand red `#9A2F36`
- **Type:** IBM Plex Sans Thai (700 สำหรับหัวข้อ, 400/600 สำหรับเนื้อหา)
- **Pattern:** pill label + top red bar + numbered cards/timeline + 3-phone rows + footer logo
- **Screens:** 390×844 จากแอปจริง (deviceScaleFactor 2) · แสดงในกรอบมือถือ 300×640
- **Print:** `@page 1920×1080` · Chrome PDF = 1440×810 pt

## ที่มาของภาพ

ภาพทั้งหมดใน `assets/shots/current/` แคปจากแอปที่รันจริงที่ `localhost:4200` + mock backend:

| ภาพ | หน้า |
|---|---|
| `owner-history.png` | `/home/history` (เจ้าของบ้าน) |
| `officer-home.png` | `/officer` (เจ้าหน้าที่) |
| `head-home.png` | `/agency` (หัวหน้า) |
| `rider-entry.png` | `/r` (ไรเดอร์) |
| `mode-easy/default/advanced.png` | `/home/settings` ใน 3 โหมด |

หมายเหตุ: ก่อนแคปได้ mark notifications เป็นอ่านแล้ว และปิดแถบเตือน push ชั่วคราว เพื่อให้หน้าจอสะอาด — ไม่ได้แก้ข้อมูลอื่น

## หมายเหตุความถูกต้อง

- ภาพหน้าจอเป็นของปัจจุบัน (17 พ.ย. 2026) ไม่ใช่ mockup
- เจ้าหน้าที่ในภาพแสดง 0/1 หลังตรวจ เพราะข้อมูล seed ของวันนี้ยังไม่มีรายการตรวจ — เป็นสถานะจริง
- สไลด์ 12 พูดถึงการพิสูจน์กับตู้จริงก่อนนำร่อง ไม่ได้อ้างว่าพร้อมเปิดใช้ทันที
- ข้อตกลง/PDPA ฉบับจริงต้องผ่านผู้เชี่ยวชาญกฎหมายก่อนใช้

## ฟอนต์

`assets/fonts/` เก็บ IBM Plex Sans Thai (ใช้ในเด็คหลัก) และ Noto Serif Thai (เก็บไว้สำหรับเวอร์ชัน editorial ใน `archive/`)
