-- โซนเก่าที่ยังไม่ตั้งพื้นที่ → ใช้พื้นที่ของหน่วยงานเป็นค่าเริ่มต้น (ผู้ใช้เห็นชอบ 2026-11-06 "ตั้งพื้นที่ตามคำแนะนำ")
-- ทำเฉพาะโซนที่ยังว่างทั้งจังหวัดและเขต/อำเภอ และหน่วยงานกรอกทั้งสองค่าไว้แล้ว · หัวหน้าแก้ทีหลังได้ที่หน้าโซน
-- (ค่าที่หัวหน้าตั้งเองแล้วไม่ถูกแตะ)
UPDATE app.zone_tb z
   SET province = a.province, district = a.district, subdistrict = a.subdistrict
  FROM app.agency_tb a
 WHERE a.agency_id = z.agency_id
   AND z.province IS NULL AND z.district IS NULL
   AND a.province IS NOT NULL AND a.district IS NOT NULL;
