-- คำขอให้ช่างช่วยเหลือจากเจ้าของบ้าน · api.md §4.4, §9
CREATE TABLE app.technician_request_tb (
  technician_request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id text NOT NULL REFERENCES app.box_tb (box_id),
  owner_user_id text NOT NULL REFERENCES app.user_tb (user_id),
  reason text NOT NULL CHECK (reason IN ('wifi_change','repair','other')),
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','scheduled','done')),
  scheduled_date timestamptz,
  admin_note text,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_technician_request_open_box
  ON app.technician_request_tb (box_id)
  WHERE status IN ('open','scheduled');
CREATE INDEX ix_technician_request_status_date
  ON app.technician_request_tb (status, created_date DESC);
CREATE TRIGGER trg_technician_request_updated_date BEFORE UPDATE ON app.technician_request_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();
