-- แอดมินเปิด/ปิดบริการตู้ (เช่น ค้างชำระ ตู้เสีย ย้ายบ้าน) — ปิดแล้วเจ้าหน้าที่ตรวจไม่ได้ ไรเดอร์เห็นหน้า "ตู้ปิดบริการ"
-- service_active มีอยู่แล้วตั้งแต่ 0007 · เพิ่มเหตุผลกับเวลาที่เปลี่ยนล่าสุด (ผู้เปลี่ยนอยู่ใน data_access_log_tb)
ALTER TABLE app.box_tb
  ADD COLUMN service_reason       text CHECK (service_reason IS NULL OR char_length(service_reason) <= 200),
  ADD COLUMN service_changed_date timestamptz;
