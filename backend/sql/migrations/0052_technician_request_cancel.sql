-- เจ้าของบ้านยกเลิกคำขอช่างที่ยังไม่ปิด (issue #19) — สถานะแยกจากปิดงาน ไม่ต้องยืนยันผลงาน
-- ดัชนี uq_technician_request_open_box นับแค่ open/scheduled → ยกเลิกแล้วสร้างคำขอใหม่ได้ · วันนัดเดิมเก็บไว้ใน scheduled_date
ALTER TABLE app.technician_request_tb
  DROP CONSTRAINT technician_request_tb_status_check,
  ADD CONSTRAINT technician_request_tb_status_check CHECK (status IN ('open', 'scheduled', 'done', 'cancelled')),
  ADD COLUMN cancelled_date timestamptz;
