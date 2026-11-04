-- ข้อมูลสมัครละเอียดขึ้น + พิกัดบ้าน (2026-11-04) · ทุกคอลัมน์ไม่บังคับที่ฐานข้อมูล (บังคับที่แบบฟอร์มของเว็บ)
-- บ้าน = ตู้: เจ้าของบ้านกรอกที่ user_tb ตอนสมัคร → คัดลอกลง box_tb ตอนผูกตู้ (เหมือน house_no / area) · แก้ทีหลังที่ตั้งค่าตู้

-- เจ้าของบ้าน
ALTER TABLE app.user_tb
  ADD COLUMN address_line    text CHECK (address_line IS NULL OR char_length(address_line) BETWEEN 1 AND 200),
  ADD COLUMN subdistrict     text CHECK (subdistrict  IS NULL OR char_length(subdistrict)  BETWEEN 1 AND 100),
  ADD COLUMN district        text CHECK (district     IS NULL OR char_length(district)     BETWEEN 1 AND 100),
  ADD COLUMN province        text CHECK (province     IS NULL OR char_length(province)     BETWEEN 1 AND 100),
  ADD COLUMN house_lat       numeric(9,6) CHECK (house_lat BETWEEN -90 AND 90),
  ADD COLUMN house_lng       numeric(9,6) CHECK (house_lng BETWEEN -180 AND 180),
  ADD COLUMN emergency_name  text CHECK (emergency_name  IS NULL OR char_length(emergency_name)  BETWEEN 1 AND 100),
  ADD COLUMN emergency_phone text CHECK (emergency_phone IS NULL OR emergency_phone ~ '^0[0-9]{8,9}$'),
  ADD CONSTRAINT user_house_pin_both CHECK ((house_lat IS NULL) = (house_lng IS NULL)),
  ADD CONSTRAINT user_emergency_both CHECK ((emergency_name IS NULL) = (emergency_phone IS NULL));

ALTER TABLE app.box_tb
  ADD COLUMN address_line text CHECK (address_line IS NULL OR char_length(address_line) BETWEEN 1 AND 200),
  ADD COLUMN subdistrict  text CHECK (subdistrict  IS NULL OR char_length(subdistrict)  BETWEEN 1 AND 100),
  ADD COLUMN district     text CHECK (district     IS NULL OR char_length(district)     BETWEEN 1 AND 100),
  ADD COLUMN province     text CHECK (province     IS NULL OR char_length(province)     BETWEEN 1 AND 100),
  ADD COLUMN lat          numeric(9,6) CHECK (lat BETWEEN -90 AND 90),
  ADD COLUMN lng          numeric(9,6) CHECK (lng BETWEEN -180 AND 180),
  ADD CONSTRAINT box_pin_both CHECK ((lat IS NULL) = (lng IS NULL));

-- เจ้าหน้าที่ (ต่อหน่วยงาน)
ALTER TABLE app.agency_member_tb
  ADD COLUMN position text CHECK (position IS NULL OR char_length(position) BETWEEN 1 AND 100),
  ADD COLUMN staff_no text CHECK (staff_no IS NULL OR char_length(staff_no) BETWEEN 1 AND 50);

-- หน่วยงาน
ALTER TABLE app.agency_tb
  ADD COLUMN address         text CHECK (address         IS NULL OR char_length(address)         BETWEEN 1 AND 300),
  ADD COLUMN registration_no text CHECK (registration_no IS NULL OR char_length(registration_no) BETWEEN 1 AND 100);
