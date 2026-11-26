-- SOS คืนเรื่อง (design §7 · issue #11) — ประวัติการคืน เพิ่มอย่างเดียว
-- officer_user_id = ผู้รับที่เรื่องถูกคืน · source: self = กดคืนเอง · system = ระบบคืนให้ (issue #12)
CREATE TABLE app.sos_return_tb (
  sos_return_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_case_id     uuid NOT NULL REFERENCES app.sos_case_tb (sos_case_id),
  officer_user_id text NOT NULL REFERENCES app.user_tb (user_id),
  agency_id       uuid NOT NULL REFERENCES app.agency_tb (agency_id),
  source          text NOT NULL CHECK (source IN ('self','system')),
  accepted_date   timestamptz NOT NULL,                 -- รับไว้ตั้งแต่เมื่อไร (ตัวเคสถูกล้างตอนคืน)
  created_date    timestamptz NOT NULL DEFAULT now()    -- = เวลาที่คืน
);
CREATE INDEX ix_sos_return_case ON app.sos_return_tb (sos_case_id, created_date DESC);
CREATE INDEX ix_sos_return_created ON app.sos_return_tb (created_date DESC);
CREATE TRIGGER trg_sos_return_append_only BEFORE UPDATE OR DELETE ON app.sos_return_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();
