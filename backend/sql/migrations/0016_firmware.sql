-- อัปเดตเฟิร์มแวร์ตู้ผ่านเซิร์ฟเวอร์ (OTA): แอดมินอัปโหลดไฟล์ .bin + เลือกตู้ที่จะอัปเดต
-- box_tb.fw_target = เวอร์ชันที่ตู้ต้องโหลดไปลง (NULL = ไม่มีงานอัปเดต) · ตู้บูตแล้วรายงาน fw ตรงกัน → ล้างเอง
CREATE TABLE app.firmware_tb (
  version      text PRIMARY KEY CHECK (version ~ '^[0-9A-Za-z._+-]{1,32}$'),
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes   integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
  data         bytea NOT NULL,
  uploaded_by  text REFERENCES app.user_tb (user_id),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_firmware_tb_updated_date BEFORE UPDATE ON app.firmware_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();

ALTER TABLE app.box_tb
  ADD COLUMN fw_target text REFERENCES app.firmware_tb (version),
  ADD COLUMN fw_target_requested_by text REFERENCES app.user_tb (user_id);
