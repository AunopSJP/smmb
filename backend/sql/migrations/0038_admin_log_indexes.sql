-- D11 log ทั้งหมด (แอดมิน): UNION 6 ตารางแล้ว ORDER BY created_date DESC
-- ตาราง log มีแต่ composite index ที่ขึ้นต้นด้วยคอลัมน์อื่น → เรียง/นับตามเวลาล้วนใช้ไม่ได้
-- (migration 0037 เติมให้ inspection/delivery/sos แล้ว เหลือสามตารางนี้)
CREATE INDEX IF NOT EXISTS ix_scan_log_created ON app.scan_log_tb (created_date DESC);
CREATE INDEX IF NOT EXISTS ix_data_access_log_created ON app.data_access_log_tb (created_date DESC);
CREATE INDEX IF NOT EXISTS ix_terms_acceptance_created ON app.terms_acceptance_tb (created_date DESC);
