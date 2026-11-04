-- รอบ 3 (2026-11-04): เจ้าของบ้านยืนยันก่อนบ้านเข้าโซน · รูปยืนยันตัวเจ้าหน้าที่หลังตรวจผ่าน (Snapface) · เครื่องที่เคยเข้าสู่ระบบ

-- หัวหน้าขอเพิ่มบ้านเข้าโซน → เจ้าของบ้านกดยอมรับ → ค่อยเข้า zone_box_tb
CREATE TABLE app.zone_box_request_tb (
  zone_box_request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id      uuid NOT NULL REFERENCES app.zone_tb (zone_id),
  box_id       text NOT NULL REFERENCES app.box_tb (box_id),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  requested_by text NOT NULL REFERENCES app.user_tb (user_id),
  decided_by   text REFERENCES app.user_tb (user_id),
  decided_date timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);
-- คำขอที่รออยู่ได้ทีละ 1 ต่อ (โซน, ตู้)
CREATE UNIQUE INDEX ux_zone_box_request_pending ON app.zone_box_request_tb (zone_id, box_id) WHERE status = 'pending';
CREATE INDEX ix_zone_box_request_box ON app.zone_box_request_tb (box_id) WHERE status = 'pending';
CREATE TRIGGER trg_zone_box_request_updated_date BEFORE UPDATE ON app.zone_box_request_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();

-- รูปยืนยันตัวเจ้าหน้าที่ (ถ่ายหลังตรวจผ่าน) — 1 รูปต่อการตรวจ · เก็บ 30 วันแล้วลบ (งานเบื้องหลัง)
-- ดูได้: เจ้าของตู้ (การตรวจบ้านตัวเอง) และแอดมิน · ทุกครั้งที่เปิดดูบันทึกใน data_access_log_tb
CREATE TABLE app.inspection_photo_tb (
  inspection_id uuid PRIMARY KEY REFERENCES app.inspection_tb (inspection_id),
  user_id       text NOT NULL REFERENCES app.user_tb (user_id),
  mime          text NOT NULL CHECK (mime IN ('image/jpeg','image/webp')),
  photo         bytea NOT NULL CHECK (octet_length(photo) BETWEEN 1 AND 400000),
  created_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_inspection_photo_created ON app.inspection_photo_tb (created_date);

-- เครื่องที่เคยเข้าสู่ระบบ (hash ของรหัสเครื่องที่เว็บสุ่มเก็บไว้) — เจ้าหน้าที่เข้าจากเครื่องใหม่ → แจ้งหัวหน้า
CREATE TABLE app.user_device_tb (
  user_id        text NOT NULL REFERENCES app.user_tb (user_id),
  device_hash    text NOT NULL CHECK (char_length(device_hash) = 64),
  user_agent     text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  last_seen_date timestamptz NOT NULL DEFAULT now(),
  created_date   timestamptz NOT NULL DEFAULT now(),
  updated_date   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_hash)
);
CREATE TRIGGER trg_user_device_updated_date BEFORE UPDATE ON app.user_device_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();
