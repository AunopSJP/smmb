-- ลบบัญชีโดยผู้ใช้เอง (api.md §3.2 · ผู้ใช้ตัดสิน 2026-11-13): ซ่อนตัวตน + พักไว้ 7 วัน
--   DELETE /me           → ตั้ง user_tb.deleted_date (มีอยู่แล้ว) · เตะทุก session · เบอร์ยังถูกจอง (phone UNIQUE)
--   ภายใน 7 วัน          → แอดมินกู้ได้ (ล้าง deleted_date)
--   ครบ 7 วัน (scheduler) → anonymize: ชื่อ/เบอร์/รหัสผ่าน/ข้อมูลส่วนตัวถูกแทนที่ · แถว log คงอยู่ (กฎข้อ 6)

ALTER TABLE app.user_tb ADD COLUMN anonymized_date timestamptz;

-- เบอร์แทนที่หลัง anonymize: '00' + 8 หลัก — ผ่าน CHECK ของคอลัมน์ phone (^0[0-9]{9}$) แต่ไม่ใช่เบอร์จริง
-- (00 = รหัสโทรระหว่างประเทศ · normalizePhone ใน phone.ts ปฏิเสธเบอร์ที่ขึ้นต้น 00 จึงสมัครชนไม่ได้)
CREATE SEQUENCE app.anon_phone_seq MINVALUE 1 MAXVALUE 99999999 NO CYCLE;

-- งาน anonymize หาแถวที่ถึงกำหนด
CREATE INDEX ix_user_pending_anonymize ON app.user_tb (deleted_date)
  WHERE deleted_date IS NOT NULL AND anonymized_date IS NULL;
