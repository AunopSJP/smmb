-- ที่มาของการยืนยันสลับใบ QR สำรอง: เจ้าของบ้านกดเอง หรือ การตรวจที่ผ่านด้วยใบสำรอง (issue #18)
ALTER TABLE app.qr_issue_case_tb
  ADD COLUMN confirmed_source text CHECK (confirmed_source IN ('owner','inspection')),
  ADD COLUMN confirmed_date timestamptz,
  ADD COLUMN confirmed_inspection_id uuid REFERENCES app.inspection_tb (inspection_id);

-- เคสสลับใบที่ยืนยันไปแล้วก่อนหน้านี้ มีทางเดียวคือเจ้าของบ้านกด (ไม่ทราบเวลาแน่ชัด จึงไม่เติม confirmed_date)
ALTER TABLE app.qr_issue_case_tb DISABLE TRIGGER trg_qr_issue_case_updated_date;
UPDATE app.qr_issue_case_tb SET confirmed_source = 'owner'
 WHERE fix = 'swap' AND status IN ('owner_confirmed','qr_reissued','resolved');
ALTER TABLE app.qr_issue_case_tb ENABLE TRIGGER trg_qr_issue_case_updated_date;
