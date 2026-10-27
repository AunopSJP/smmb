-- ข้อมูลสำหรับเครื่อง dev เท่านั้น (npm run seed:dev) — ห้ามรันบนเซิร์ฟเวอร์จริง
-- ข้อตกลงฉบับจริงต้องให้ทีม/ลูกค้าเขียน และต้องมีข้อความว่า SOS ไม่ได้แทนการโทร 191 (api.md §2)
INSERT INTO app.terms_tb (terms_version, body_md, published_date)
VALUES ('dev-1', E'# ข้อตกลง (ฉบับทดสอบ)\n\n- SOS ในแอปนี้**ไม่ได้แทนการโทร 191 / 1669**\n- ระบบเก็บประวัติการสแกนทุกครั้ง แม้ไม่ผ่าน', now())
ON CONFLICT (terms_version) DO NOTHING;
