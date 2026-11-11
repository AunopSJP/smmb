---
description: ทำงานร่วมกับ agent ฝั่ง Backend ผ่าน docs/agent-sync (อ่านกล่อง → ตรวจ/แก้ฝั่งเว็บ → ตอบ + อัปเดต state)
agent: frontend-bridge
subagent: true
---

ทำงานสะพาน Frontend ↔ Backend ของ SMMB:

- อ่าน `docs/agent-sync/README.md`, `state.md`, `to-frontend.md`, `to-backend.md`, `measurements.md`
- งาน: $ARGUMENTS (ถ้าว่าง = ตอบข้อความ `open` ล่าสุดของฝั่ง Backend และทำงานฝั่งเว็บที่ค้าง)
- ตรวจโค้ดจริงก่อนสรุป · แก้เฉพาะ `frontend/**` · ห้ามแก้ `backend/**`
- ตอบต่อท้าย `docs/agent-sync/to-backend.md` (`[F-00x]`) · อัปเดต `state.md` หัวข้อฝั่ง Frontend
- ปิดท้ายด้วยข้อความพร้อมวางสำหรับแชท Backend
