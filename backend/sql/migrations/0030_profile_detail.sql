-- ข้อมูลสมัครละเอียดขึ้น + หมุดหน่วยงาน (✅ ผู้ใช้สั่ง 2026-11-06)
-- · หน่วยงาน: ที่อยู่ละเอียด ช่องทางติดต่อ + พิกัด → เจ้าของบ้านเห็นบนแผนที่ว่าแต่ละหน่วยงานอยู่ตรงไหน (เลือกว่าจะไปอยู่กับหน่วยงานไหน)
-- · ผู้ใช้: profile (jsonb) เก็บรายละเอียดเพิ่ม เช่น คำนำหน้า ชื่อ-นามสกุล อีเมล ประเภทบ้าน ผู้อยู่อาศัย (ตรวจรูปร่างที่ API ทุกครั้ง)

ALTER TABLE app.agency_tb
  ADD COLUMN subdistrict    text CHECK (subdistrict    IS NULL OR char_length(subdistrict)    BETWEEN 1 AND 100),
  ADD COLUMN district       text CHECK (district       IS NULL OR char_length(district)       BETWEEN 1 AND 100),
  ADD COLUMN province       text CHECK (province       IS NULL OR char_length(province)       BETWEEN 1 AND 100),
  ADD COLUMN postal_code    text CHECK (postal_code    IS NULL OR postal_code ~ '^[0-9]{5}$'),
  ADD COLUMN phone          text CHECK (phone          IS NULL OR char_length(phone)          BETWEEN 3 AND 30),
  ADD COLUMN email          text CHECK (email          IS NULL OR char_length(email)          BETWEEN 3 AND 200),
  ADD COLUMN contact_person text CHECK (contact_person IS NULL OR char_length(contact_person) BETWEEN 1 AND 100),
  ADD COLUMN coverage_note  text CHECK (coverage_note  IS NULL OR char_length(coverage_note)  BETWEEN 1 AND 300),
  ADD COLUMN lat            numeric(9,6) CHECK (lat BETWEEN -90 AND 90),
  ADD COLUMN lng            numeric(9,6) CHECK (lng BETWEEN -180 AND 180),
  ADD CONSTRAINT agency_pin_both CHECK ((lat IS NULL) = (lng IS NULL));

ALTER TABLE app.user_tb
  ADD COLUMN profile jsonb NOT NULL DEFAULT '{}'
    CONSTRAINT user_profile_object CHECK (jsonb_typeof(profile) = 'object' AND octet_length(profile::text) <= 4000);
