-- ช่องทางติดต่อ (✅ ผู้ใช้กำหนด 2026-10-27: "ตอนสมัครให้กรอกไปเลย แล้วเอาข้อมูลตรงนั้นมาแสดง")
-- · หน่วยงาน: กรอกตอนสมัคร / แอดมินสร้างให้ → แสดงให้คนที่ขอเข้าหน่วยงาน (A11 / A11-b)
-- · ผู้ดูแลระบบ: แอดมินตั้งค่า → แสดงในหน้าที่บอกให้ "ติดต่อผู้ดูแล" (A04, A07-c, L02-b)
-- เป็นข้อมูลที่เจ้าของตั้งใจเปิดเผย แยกจากเบอร์ล็อกอิน (เบอร์ล็อกอินยังเห็นข้ามบทบาทได้เฉพาะตอน SOS — CLAUDE.md กฎข้อ 7)

ALTER TABLE app.agency_tb
  ADD COLUMN contact text CHECK (contact IS NULL OR char_length(contact) BETWEEN 3 AND 200);

CREATE TABLE app.setting_tb (                          -- ค่าตั้งค่าของระบบแบบ key/value ที่แอดมินแก้ได้
  setting_key  text PRIMARY KEY CHECK (setting_key IN ('support_contact')),
  value        text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 500),
  updated_by   text REFERENCES app.user_tb (user_id),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_setting_tb_updated_date BEFORE UPDATE ON app.setting_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();
