-- Persist QR replacement cases shared between admin and owner workflows.
CREATE TABLE app.qr_issue_case_tb (
  qr_issue_case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_qr_code_id uuid NOT NULL REFERENCES app.box_qr_code_tb (box_qr_code_id),
  fix text CHECK (fix IN ('swap','reissue','fake')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','owner_notified','owner_confirmed','qr_reissued','technician_dispatched','resolved')),
  delivery_method text CHECK (delivery_method IN ('post','technician')),
  created_by text REFERENCES app.user_tb (user_id),
  resolved_by text REFERENCES app.user_tb (user_id),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  resolved_date timestamptz
);

CREATE UNIQUE INDEX uq_qr_issue_case_open_qr
  ON app.qr_issue_case_tb (box_qr_code_id)
  WHERE status <> 'resolved';
CREATE INDEX ix_qr_issue_case_status_date
  ON app.qr_issue_case_tb (status, created_date DESC);
CREATE TRIGGER trg_qr_issue_case_updated_date BEFORE UPDATE ON app.qr_issue_case_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();
