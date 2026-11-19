-- ตู้แจ้งก่อนหลับลึก (event "sleeping") → เซิร์ฟเวอร์รู้ว่าตู้ไม่ได้ถือสายแล้ว ไม่ปล่อยให้สแกนปลุกผ่านด่าน "ตู้ออนไลน์"
-- ถือว่าตู้หลับเมื่อ sleep_date >= last_poll_date (ตู้ตื่นมาถามงานอีกครั้ง last_poll_date จะใหม่กว่า)
ALTER TABLE app.box_tb ADD COLUMN IF NOT EXISTS sleep_date timestamptz;
