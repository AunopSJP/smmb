-- เฟส 4: ไรเดอร์แจ้งส่งของ (api.md §5) + SOS (api.md §7 · design §7)
-- ปุ่มหน้าตู้ถูกตัดออกแล้ว (2026-10-28) → ส่งของได้ทางสแกน QR / พิมพ์รหัสใต้ QR เท่านั้น

-- ส่งของ — เพิ่มอย่างเดียว · ไม่เก็บข้อมูลไรเดอร์ (✅) --------------------------------------
CREATE TABLE app.delivery_tb (
  delivery_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id         text NOT NULL REFERENCES app.box_tb (box_id),
  box_qr_code_id uuid NOT NULL REFERENCES app.box_qr_code_tb (box_qr_code_id),
  method         text NOT NULL CHECK (method IN ('scan','code')),
  ticket_id      text NOT NULL UNIQUE,                    -- delivery_ticket ใช้ได้ครั้งเดียว
  created_date   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_delivery_box ON app.delivery_tb (box_id, created_date DESC);
CREATE TRIGGER trg_delivery_append_only BEFORE UPDATE OR DELETE ON app.delivery_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();

-- SOS ------------------------------------------------------------------------------------
CREATE TABLE app.sos_case_tb (
  sos_case_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id             text NOT NULL REFERENCES app.box_tb (box_id),
  owner_user_id      text NOT NULL REFERENCES app.user_tb (user_id),
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','closed','cancelled')),
  stage              text NOT NULL DEFAULT 'zone' CHECK (stage IN ('zone','agency','call_yourself')),
  stage_changed_date timestamptz NOT NULL DEFAULT now(),
  accepted_by        text REFERENCES app.user_tb (user_id),
  accepted_agency_id uuid REFERENCES app.agency_tb (agency_id),   -- หน่วยงานของผู้รับ ณ ตอนรับ
  accepted_date      timestamptz,
  closed_date        timestamptz,
  close_note         text,
  cancelled_date     timestamptz,
  cancel_reason      text CHECK (cancel_reason IN ('safe','mistake')),
  created_date       timestamptz NOT NULL DEFAULT now(),
  updated_date       timestamptz NOT NULL DEFAULT now()
);
-- SOS ที่ยังไม่จบได้แค่อันเดียวต่อตู้
CREATE UNIQUE INDEX uq_sos_case_open ON app.sos_case_tb (box_id) WHERE status IN ('open','accepted');
CREATE INDEX ix_sos_case_open ON app.sos_case_tb (status, stage_changed_date) WHERE status = 'open';
CREATE TRIGGER trg_sos_case_tb_updated_date BEFORE UPDATE ON app.sos_case_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();

-- ใครได้รับ SOS นี้ (ใช้ตรวจสิทธิ์ดู/รับเรื่อง) · ห้ามมีเจ้าของบ้านเอง · เพิ่มอย่างเดียว
CREATE TABLE app.sos_recipient_tb (
  sos_case_id  uuid NOT NULL REFERENCES app.sos_case_tb (sos_case_id),
  user_id      text NOT NULL REFERENCES app.user_tb (user_id),
  agency_id    uuid NOT NULL REFERENCES app.agency_tb (agency_id),
  stage        text NOT NULL CHECK (stage IN ('zone','agency')),
  created_date timestamptz NOT NULL DEFAULT now(),        -- = เวลาที่แจ้ง
  PRIMARY KEY (sos_case_id, user_id)
);
CREATE INDEX ix_sos_recipient_user ON app.sos_recipient_tb (user_id, created_date DESC);
CREATE TRIGGER trg_sos_recipient_append_only BEFORE UPDATE OR DELETE ON app.sos_recipient_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();
