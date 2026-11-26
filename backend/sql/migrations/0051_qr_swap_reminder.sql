-- เคสสลับใบ QR สำรองที่รอเจ้าของบ้าน: เตือนทุก 3 วัน · ครบ 7 วันแจ้งแอดมินครั้งเดียว (issue #17)
ALTER TABLE app.qr_issue_case_tb
  ADD COLUMN owner_notified_date timestamptz,         -- เริ่มรอเจ้าของบ้าน (แจ้งครั้งแรก)
  ADD COLUMN owner_reminded_date timestamptz,         -- เตือนซ้ำล่าสุด
  ADD COLUMN admin_overdue_notified_date timestamptz; -- แจ้งแอดมินแล้วว่ารอครบ 7 วัน

-- บันทึกการเตือนไม่ถือเป็นการเปลี่ยนเคส → updated_date (ที่แอดมินเห็น) ขยับเฉพาะตอนข้อมูลเคสเปลี่ยน
DROP TRIGGER trg_qr_issue_case_updated_date ON app.qr_issue_case_tb;
CREATE TRIGGER trg_qr_issue_case_updated_date
  BEFORE UPDATE OF fix, status, delivery_method, resolved_by, resolved_date, confirmed_source, confirmed_date, confirmed_inspection_id
  ON app.qr_issue_case_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();

-- เคสที่รออยู่ก่อนแล้ว: การแก้ครั้งล่าสุดคือตอนแจ้งเจ้าของบ้าน
UPDATE app.qr_issue_case_tb SET owner_notified_date = updated_date WHERE status = 'owner_notified';
