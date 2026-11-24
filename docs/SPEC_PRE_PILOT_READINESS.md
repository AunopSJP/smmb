# สเปก: เตรียมความพร้อมก่อนเปิดนำร่อง (draft · ยังไม่ publish เป็น issue)

> เขียนให้ปลอดภัยต่อการเปิดเผย (repo เป็น public): ไม่มีรายละเอียดช่องโหว่ พิกัด หรือค่าลับ · รายละเอียดเชิงเทคนิคอยู่ใน `docs/PRE_PILOT_REVIEW_2026-11-24.md`
> เมื่อท่านตรวจแล้ว ค่อย publish เป็น GitHub issue พร้อม label `ready-for-agent`

## Problem Statement

ระบบหลักใช้งานได้และผ่านการทดสอบอัตโนมัติ แต่ยังไม่พร้อมให้ผู้ใช้จริงกลุ่มแรก: ข้อมูลยังไม่มีสำรองนอกเครื่อง, ยังไม่มีโดเมนทางการสำหรับพิมพ์ QR ติดตู้, ยังไม่มีหลักฐานว่าแจ้งเตือน SOS ถึงมือถือจริงหลายค่าย และมีโค้ดค้างที่ไม่มีใครใช้

## Solution

ทำชุดงานสั้น ๆ 6 ข้อให้มีหลักฐานยืนยัน เพื่อให้ผู้ดูแลระบบเปิดนำร่องได้อย่างมั่นใจ โดยไม่เพิ่มฟีเจอร์ใหม่

## User Stories

1. As an admin, I want automatic daily database backups copied off the server, so that a disk failure does not lose inspection history or accounts
2. As an admin, I want a documented, rehearsed restore, so that I know recovery works before I need it
3. As an admin, I want the QR-issuing domain to be the official one before the first QR is printed, so that printed QR codes never need replacing
4. As an admin, I want to scan a test QR from a real phone on the official domain, so that I know the whole path works
5. As an officer, I want an SOS alert to reach my Android phone quickly even when the screen is locked or the app is closed, so that I can respond in time
6. As an admin, I want recorded results from several Android devices and carriers, so that I can tell customers what is and is not guaranteed
7. As an admin, I want the public health endpoint to resist being hammered, so that monitoring stays cheap and the database stays safe
8. As an uptime monitor, I want a lightweight check endpoint that never touches the database, so that I can poll frequently
9. As a developer, I want unused demo code removed, so that the codebase is easier to maintain
10. As a developer, I want the demo page and sign-in flows to keep working after cleanup, so that sales demos are not broken
11. As an admin, I want a tagged first release and a rehearsed rollback, so that I can return to a known-good version quickly
12. As a customer, I want a clear statement of pilot conditions (Android-only officers, app notifications only, free), so that I know what to expect
13. As a data owner, I want the terms and personal-data handling reviewed by a qualified person, and officer photos kept 30 days, so that the pilot complies with PDPA

## Implementation Decisions

- ไม่เพิ่มฟีเจอร์ผู้ใช้ใหม่ · ไม่มี SMS/โทรออก (ตัดสินแล้ว) · retention รูปที่ตู้ถ่าย = 30 วัน (ตรงกับระบบปัจจุบัน)
- Backup: งานสำรองตามเวลาบนเซิร์ฟเวอร์ + สำเนาออกนอกเครื่อง + สำรองไฟล์ตั้งค่าลับ · ต้องซ้อมกู้คืนลงฐานทดสอบ 1 ครั้ง (ตามแนวทางที่มีใน เอกสาร deploy)
- โดเมน: ใช้โดเมนทางการแยกสำหรับ QR ที่ redirect ไปเว็บแอป · ตั้งผ่านค่า environment เดิม ห้ามฮาร์ดโค้ด
- Health: จำกัดอัตราคำขอที่ชั้น reverse proxy · monitor ถี่ใช้ endpoint ที่ไม่แตะฐานข้อมูล
- ลบโค้ดต้นแบบที่ไม่มีใครเรียก **หลังยืนยันว่าหน้าเดโมไม่พึ่ง** · ไม่ลบไฟล์ข้อตกลงที่ผู้ใช้ยอมรับแล้ว
- เอกสารรอบ audit เก่าย้ายเข้าที่เก็บเอกสารประวัติ ไม่ลบ
- Release: ติด tag เวอร์ชันแรก + ซ้อม rollback 1 ครั้ง

## Testing Decisions

- ทดสอบเฉพาะพฤติกรรมที่เห็นจากภายนอก ไม่ทดสอบรายละเอียดภายใน
- Seam เดียว: E2E ที่มีอยู่แล้ว (backend e2e + browser e2e) ยืนยันว่า health ที่ถูกจำกัดยังตอบปกติ และหน้าเดโม/ล็อกอินยังทำงานหลังลบโค้ดที่ไม่ใช้
- ข้อที่ automate ไม่ได้ (ซ้อมกู้คืน, สแกน QR จากโดเมนจริง, SOS บนมือถือจริง, rollback) → เกณฑ์ผ่านคือบันทึก วันที่ + ผลที่เห็น + อุปกรณ์/ค่าย ลงใน `docs/FLOW_AND_GAPS.md` ตามรูปแบบ DoD ที่ใช้อยู่
- Prior art: ชุด e2e ที่รันใน CI เดิม และตารางข้อค้าง W-xx ในเอกสารสถานะ

## Out of Scope

- ฟีเจอร์ใหม่ทุกชนิด (รวมสมาชิกในบ้าน, SMS, แพ็กเกจเสียเงิน)
- การทดสอบเจาะระบบ/ตรวจเฟิร์มแวร์ (ให้ผู้ตรวจอิสระ แยกงาน)
- การเขียนข้อกฎหมายแทนผู้เชี่ยวชาญ
- Auto-deploy (ตัดสินแล้วว่าไม่ทำ)

## Further Notes

- งานติดตั้งบนเซิร์ฟเวอร์ (backup, proxy, โดเมน) ทำโดย deploy ด้วยมือตามที่โครงการกำหนด
- ลำดับแนะนำ: โดเมน → backup + ซ้อมกู้คืน → ทดสอบ SOS → จำกัด health → ลบโค้ดค้าง → tag + rollback
