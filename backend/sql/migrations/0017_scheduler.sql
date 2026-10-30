-- งานเบื้องหลัง (design §8): จำว่าแจ้งเตือนเรื่องนี้ไปแล้ว จะได้ไม่แจ้งซ้ำทุกนาที
-- NULL = ยังไม่แจ้ง / ปกติแล้ว · ตู้กลับมาออนไลน์หรือ QR กลับเป็น ok → ล้างเป็น NULL
ALTER TABLE app.box_tb
  ADD COLUMN offline_notified_date timestamptz,  -- ตู้ไม่ออนไลน์ในเวลาตรวจ (แจ้งเจ้าของบ้าน + แอดมิน)
  ADD COLUMN silent_notified_date  timestamptz;  -- ตู้ไม่รายงานเกิน 26 ชม. (แจ้งแอดมิน)

ALTER TABLE app.box_qr_code_tb
  ADD COLUMN health_notified_date timestamptz;   -- แจ้งแอดมินแล้วว่า QR ใบนี้ไม่ปกติ
