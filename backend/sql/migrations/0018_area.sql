-- ย่าน / หมู่บ้านของบ้าน (ไม่บังคับ) — ช่วยให้หัวหน้าแยกบ้านเลขที่ซ้ำกันคนละหมู่บ้านตอนเพิ่มบ้านเข้าโซน
-- เจ้าของบ้านกรอกตอนสมัคร / เพิ่มบทบาท → คัดลอกลงตู้ตอนผูกตู้ (เหมือน house_no) · แก้ทีหลังได้ที่ตั้งค่าตู้
ALTER TABLE app.user_tb ADD COLUMN area text CHECK (area IS NULL OR char_length(area) BETWEEN 1 AND 100);
ALTER TABLE app.box_tb  ADD COLUMN area text CHECK (area IS NULL OR char_length(area) BETWEEN 1 AND 100);
