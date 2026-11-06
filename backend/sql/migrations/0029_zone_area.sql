-- พื้นที่ครอบคลุมของโซน (✅ ผู้ใช้สั่ง 2026-11-06 "ตัวกรองให้ขึ้นแค่โซนที่ตรงกัน")
-- หัวหน้าตั้ง จังหวัด + เขต/อำเภอ (+ แขวง/ตำบล ไม่บังคับ) ให้โซน → ค้นบ้านเพิ่มเข้าโซนได้เฉพาะบ้านที่อยู่พื้นที่นี้
-- โซนเก่าที่ยังไม่ตั้งพื้นที่ = ยังเพิ่มบ้านไม่ได้จนกว่าจะตั้ง (หน้าเว็บบอกให้ตั้ง)
ALTER TABLE app.zone_tb
  ADD COLUMN province    text CHECK (province    IS NULL OR char_length(province)    BETWEEN 1 AND 100),
  ADD COLUMN district    text CHECK (district    IS NULL OR char_length(district)    BETWEEN 1 AND 100),
  ADD COLUMN subdistrict text CHECK (subdistrict IS NULL OR char_length(subdistrict) BETWEEN 1 AND 100);

-- เทียบชื่อสถานที่แบบไม่สนคำนำหน้า/ช่องว่าง/ตัวพิมพ์: "แขวงบางนา" = "บางนา" · "จ.กรุงเทพมหานคร" = "กรุงเทพมหานคร"
CREATE FUNCTION app.norm_place(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(regexp_replace(lower(btrim(coalesce(t, ''))), '^(จังหวัด|จ\.|อำเภอ|อ\.|เขต|ตำบล|ต\.|แขวง)\s*', ''), '')
$$;
