-- แอดมินระงับ/เปิดคืนหน่วยงานที่อนุมัติแล้ว (issue #14) — โซน สมาชิก และความยินยอมไม่ถูกแตะ
-- โค้ดนับเฉพาะ status = 'approved' จึงตัดหน่วยงานที่ระงับออกเอง · คอลัมน์ suspend_* เก็บของครั้งล่าสุด ล้างตอนเปิดคืน (ประวัติอยู่ audit log)
ALTER TABLE app.agency_tb
  DROP CONSTRAINT agency_tb_status_check,
  ADD CONSTRAINT agency_tb_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  ADD COLUMN suspend_reason text,
  ADD COLUMN suspended_by   text REFERENCES app.user_tb (user_id),
  ADD COLUMN suspended_date timestamptz;
