-- แอดมินกด "กลับสแตนบาย" → ตู้รับคำสั่งตอน long-poll / boot / report แล้วตั้งให้ถือ long-poll ตลอด (พร้อมสแกน QR ทันที)
-- requested_date = มีคำสั่งรอตู้รับ (NULL = ไม่มี) · ตู้ตอบรับ (event standby) → ล้างเป็น NULL + บันทึก done_date
-- ค้างเกิน 10 นาที = ถือว่าหมดอายุ (ตู้ออฟไลน์) ไม่ส่งให้ตู้อีก
ALTER TABLE app.box_tb
  ADD COLUMN standby_requested_date timestamptz,
  ADD COLUMN standby_requested_by   text REFERENCES app.user_tb (user_id),
  ADD COLUMN standby_done_date      timestamptz;
