---
description: ตรวจสุขภาพโปรเจ็ค SMMB และรายงานข้อผิดพลาด (build/test/lint/route/i18n/mode/secrets)
agent: project-guardian
subagent: true
---

ตรวจสุขภาพโปรเจ็ค SMMB แบบเต็ม แล้วรายงานเป็นภาษาไทยตามรูปแบบของ Project Guardian

- รัน `node scripts/project-guardian.mjs --full`
- อ่านรายงานล่าสุดใน `reports/`
- สรุป FAIL ก่อน WARN พร้อมหลักฐานไฟล์:บรรทัด
- ระบุว่าเป็นปัญหาจากโค้ดหรือสภาพแวดล้อม
- ห้ามแก้ไขไฟล์/commit/push/deploy

$ARGUMENTS
