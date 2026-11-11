-- D01 ภาพรวมแอดมิน: นับกิจกรรม 7 วัน — เดิมกรองด้วย created_date แต่ไม่มี index เดี่ยว
-- (index เดิมเป็น (box_id, created_date) / (officer_user_id, created_date) ซึ่งใช้กับช่วงวันที่ล้วนไม่ได้)
CREATE INDEX IF NOT EXISTS ix_inspection_created ON app.inspection_tb (created_date);
CREATE INDEX IF NOT EXISTS ix_delivery_created ON app.delivery_tb (created_date);
CREATE INDEX IF NOT EXISTS ix_sos_created ON app.sos_case_tb (created_date);
