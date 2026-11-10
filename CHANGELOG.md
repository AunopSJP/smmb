# Changelog

รูปแบบ: [Keep a Changelog](https://keepachangelog.com/th/1.1.0/) · เวอร์ชัน semantic

## [Unreleased]

### Added
- OffBoxDetail (O16) — รายละเอียดตู้สำหรับเจ้าหน้าที่ จำกัดเฉพาะโซนของตัวเอง
- เจ้าของบ้านยืนยันผลงานช่าง (`ok` / `still_broken`) + migration `0033`
- `GET /me/devices` และการ์ด "เครื่องที่เข้าสู่ระบบ"
- Shared loading/empty components (`app-loading-rows`, `app-empty-state`)
- Frontend lint ด้วย oxlint (`npm --prefix frontend run lint`)
- `scripts/deploy.sh` พร้อม hash verification + rollback
- `npm --prefix backend run mock:clean`
- Single-instance guard ด้วย PostgreSQL advisory lock (`ALLOW_MULTI_INSTANCE=1` เพื่อข้าม)
- Admin diagnostics `GET /admin/diagnostics/box-jobs`

### Fixed
- ลิงก์ “ที่อยู่และข้อมูลของฉัน” ในหน้าตั้งค่าโหมดง่ายเด้งกลับหน้าหลัก — เปลี่ยนจาก `href="#…"` เป็นเลื่อนภายในหน้า (`scrollIntoView`) และเพิ่ม guardian ตรวจ `href="#…"` ทั้งโปรเจ็ค
- คำไทยถูกตัดกลางคำ / ข้อความล้นกรอบ (global `overflow-wrap`, segmented control)
- Radio button ทั้งโปรเจ็คใช้สไตล์เดียวกัน รองรับธีมมืด/สว่าง/โหมดง่าย
- โหมดละเอียดไม่แสดง API endpoint, UUID, ชื่อฟิลด์ หรือ error code อีกแล้ว
- รูปภาพยึดสัดส่วน (`object-fit`) และ safe-area/คีย์บอร์ดมือถือ
- ข้อความ `null` หลุดในหน้าประวัติแพ็กเกจ
- ลบ import ที่ไม่ใช้ใน frontend
- ปรับ deploy drift ให้ guardian ตรวจได้เมื่อตั้ง `GUARDIAN_DEPLOY_URL`

## [0.1.0] — ยังไม่ติด tag

รุ่นแรกสำหรับบ้านนำร่อง — ต้องปิดงาน P0 ใน `docs/FLOW_AND_GAPS.md` ก่อน
