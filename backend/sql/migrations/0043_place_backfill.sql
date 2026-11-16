-- แปลงที่อยู่เดิม (ข้อความที่ผู้ใช้พิมพ์เอง) ให้เป็นชื่อมาตรฐานจากตารางพื้นที่กลาง (0042)
-- จับคู่ด้วย app.norm_place (ไม่สนคำนำหน้า/ช่องว่าง/ตัวพิมพ์) · "กรุงเทพ/กทม" → กรุงเทพมหานคร
-- แถวที่จับคู่ไม่ได้ **ไม่ถูกแตะ** (ยังเป็นข้อความเดิม) → เว็บ/เซิร์ฟเวอร์ถือว่า "ที่อยู่ไม่ตรงมาตรฐาน" แล้วแจ้งเจ้าของบ้านให้ไปเลือกใหม่

CREATE FUNCTION app.canon_province(p text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT name_th FROM app.province_tb
   WHERE app.norm_place(name_th) = CASE WHEN app.norm_place(p) IN ('กรุงเทพ', 'กรุงเทพฯ', 'กทม', 'กทม.', 'bangkok') THEN 'กรุงเทพมหานคร' ELSE app.norm_place(p) END
   LIMIT 1
$$;

CREATE FUNCTION app.canon_district(p text, d text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT di.name_th FROM app.district_tb di
    JOIN app.province_tb pr ON pr.province_id = di.province_id
   WHERE pr.name_th = app.canon_province(p) AND app.norm_place(di.name_th) = app.norm_place(d)
   LIMIT 1
$$;

CREATE FUNCTION app.canon_subdistrict(p text, d text, s text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT su.name_th FROM app.subdistrict_tb su
    JOIN app.district_tb di ON di.district_id = su.district_id
    JOIN app.province_tb pr ON pr.province_id = di.province_id
   WHERE pr.name_th = app.canon_province(p) AND di.name_th = app.canon_district(p, d) AND app.norm_place(su.name_th) = app.norm_place(s)
   LIMIT 1
$$;

-- ในคำสั่ง UPDATE ทุกนิพจน์เห็นค่าเดิมของแถว → เรียงใช้ province/district เดิมคำนวณได้ถูกต้อง
UPDATE app.user_tb SET
  province    = coalesce(app.canon_province(province), province),
  district    = coalesce(app.canon_district(province, district), district),
  subdistrict = coalesce(app.canon_subdistrict(province, district, subdistrict), subdistrict)
WHERE province IS NOT NULL OR district IS NOT NULL OR subdistrict IS NOT NULL;

UPDATE app.box_tb SET
  province    = coalesce(app.canon_province(province), province),
  district    = coalesce(app.canon_district(province, district), district),
  subdistrict = coalesce(app.canon_subdistrict(province, district, subdistrict), subdistrict)
WHERE province IS NOT NULL OR district IS NOT NULL OR subdistrict IS NOT NULL;

UPDATE app.agency_tb SET
  province    = coalesce(app.canon_province(province), province),
  district    = coalesce(app.canon_district(province, district), district),
  subdistrict = coalesce(app.canon_subdistrict(province, district, subdistrict), subdistrict)
WHERE province IS NOT NULL OR district IS NOT NULL OR subdistrict IS NOT NULL;

UPDATE app.zone_tb SET
  province    = coalesce(app.canon_province(province), province),
  district    = coalesce(app.canon_district(province, district), district),
  subdistrict = coalesce(app.canon_subdistrict(province, district, subdistrict), subdistrict)
WHERE province IS NOT NULL OR district IS NOT NULL OR subdistrict IS NOT NULL;
