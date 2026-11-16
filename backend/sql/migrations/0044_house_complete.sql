-- บ้านที่ "ข้อมูลครบ" = เพิ่มเข้าโซนได้ (✅ ผู้ใช้สั่ง 2026-11-16): ที่อยู่ + จังหวัด/เขต/แขวง ตรงตารางพื้นที่กลาง + หมุดบ้าน
-- ฟังก์ชันตรวจว่าชื่อ จังหวัด/เขต/แขวง ที่เก็บในตู้ ตรงตารางพื้นที่กลาง (0042) ครบ 3 ชั้นไหม
CREATE FUNCTION app.place_standard(p text, d text, s text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p IS NOT NULL AND d IS NOT NULL AND s IS NOT NULL AND EXISTS (
    SELECT 1 FROM app.subdistrict_tb su
      JOIN app.district_tb di ON di.district_id = su.district_id
      JOIN app.province_tb pr ON pr.province_id = di.province_id
     WHERE pr.name_th = p AND di.name_th = d AND su.name_th = s)
$$;

-- แจ้งเจ้าของบ้านเก่าที่ข้อมูลไม่ครบให้ไปกรอกใหม่ (แจ้งครั้งเดียวต่อตู้ · scheduler)
ALTER TABLE app.box_tb ADD COLUMN address_notified_date timestamptz;
