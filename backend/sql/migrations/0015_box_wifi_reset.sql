-- เจ้าของบ้านกด "เปลี่ยน Wi-Fi" ในเว็บ → ตู้รับคำสั่งตอน long-poll / boot / report แล้วตัด Wi-Fi เก่า กลับเข้าโหมดปล่อย Wi-Fi
-- requested_date = มีคำสั่งรอตู้รับ (NULL = ไม่มี) · ตู้ตอบรับ (event wifi_reset) → ล้างเป็น NULL + บันทึก done_date
-- ค้างเกิน 24 ชม. = ถือว่าหมดอายุ (ตู้ออฟไลน์/ปิดอยู่) ไม่ส่งให้ตู้อีก
ALTER TABLE app.box_tb
  ADD COLUMN wifi_reset_requested_date timestamptz,
  ADD COLUMN wifi_reset_requested_by   text REFERENCES app.user_tb (user_id),
  ADD COLUMN wifi_reset_done_date      timestamptz;
