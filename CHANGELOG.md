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

### Changed
- UX/UI ทั้ง 3 โหมด: โหมดมืดใช้โทเคนปุ่ม/ลิงก์ใหม่ (`--action-bg`, `--brand-text`, `--sos-bg`) ให้ contrast ผ่าน AA (เดิม 3.6–4.4:1)
- โหมดง่าย: SOS เปลี่ยนจากกดค้าง 3 วินาทีเป็น “แตะแล้วยืนยัน” พร้อมปุ่มใหญ่ และแสดงคำสั่งกดค้างเสมอแม้ตู้ออฟไลน์
- หน้าแจ้งช่าง: ฟอร์มส่งคำขอใหม่อยู่ก่อนงานครั้งก่อน (กันกดยืนยันงานเก่าโดยไม่ตั้งใจ)
- เปลี่ยน `window.confirm` 8 จุดเป็นกล่องยืนยันในแอป (ธีม/ภาษา/โฟกัส/ปุ่มสีแดงตามโหมด)
- เพิ่ม skeleton ตอนโหลด: หน้าหลักเจ้าของบ้าน · สรุปเจ้าหน้าที่ · ภาพรวมแอดมิน
- โหมดละเอียดบนมือถือไม่ย่อตัวอักษรแล้ว (root 15.4 → 16px, label 11.5 → 12px; ย่อเฉพาะจอ ≥1024px)
- ลิงก์ข้อความเล็กขยายพื้นที่แตะเป็น ≥32px และปุ่มซูมแผนที่เป็น 40px
- ชื่อแท็บ/ชื่อหน้าแปลตามภาษา (เดิมเป็นไทยเสมอ) และแก้ชื่อหน้าแจ้งช่างเป็น “แจ้งช่าง”
- หน้า “แบบการใช้งาน” มีปุ่ม “เสร็จแล้ว” ทุกโหมด (เดิมซ่อนในโหมดง่าย)
- Toast อยู่นานขึ้น 2.5 → 4 วินาที

### Fixed
- รายละเอียดการตรวจ/ของมาส่ง: การ์ดสรุปถูกจัดกึ่งกลางและช่องข้อมูลแคบ เพราะใช้คลาส `.result` ชนกับหน้าสำเร็จรูปของ auth → เปลี่ยนเป็น `.result-card` และปรับกรอบรูปยืนยันให้เต็มการ์ด (สูงสุด 520px)
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
