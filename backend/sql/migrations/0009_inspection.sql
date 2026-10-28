-- เฟส 3: ตรวจตู้ (api.md §6 · design §6)
-- job ↔ การตรวจ เป็น 1:1 · ผลอ่าน QR ประจำตัวแต่ละครั้งอยู่ box_job_attempt_tb (0007)

CREATE TABLE app.inspection_tb (
  inspection_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_job_id      text NOT NULL UNIQUE REFERENCES app.box_job_tb (box_job_id),
  box_id          text NOT NULL REFERENCES app.box_tb (box_id),
  officer_user_id text NOT NULL REFERENCES app.user_tb (user_id),
  agency_id       uuid NOT NULL REFERENCES app.agency_tb (agency_id),   -- ค่า ณ ตอนตรวจ (design §4.1)
  zone_id         uuid NOT NULL REFERENCES app.zone_tb (zone_id),
  box_qr_code_id  uuid NOT NULL REFERENCES app.box_qr_code_tb (box_qr_code_id),
  method          text NOT NULL CHECK (method IN ('scan','code')),
  scan_ms         int,
  -- waking/ready คิดจาก box_job_tb · เก็บที่นี่เฉพาะผลสุดท้าย
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','passed','failed','box_problem')),
  qr_condition    text CHECK (qr_condition IN ('faded','torn','missing','covered','ok')),
  problem_reason  text CHECK (problem_reason IN ('no_response','no_scan','scan_failed_3','damaged','other')),  -- ตู้ไม่มีไฟสถานะ ใช้เสียง Buzzer (2026-10-28)
  problem_note    text,
  checked_date    timestamptz,                                         -- ผ่านเมื่อไหร่
  created_date    timestamptz NOT NULL DEFAULT now(),
  updated_date    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_inspection_box ON app.inspection_tb (box_id, created_date DESC);
CREATE INDEX ix_inspection_officer ON app.inspection_tb (officer_user_id, created_date DESC);
CREATE INDEX ix_inspection_checked ON app.inspection_tb (box_id, checked_date DESC) WHERE status = 'passed';

CREATE TRIGGER trg_inspection_tb_updated_date BEFORE UPDATE ON app.inspection_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();

-- scan log ชี้ไปที่การตรวจได้
ALTER TABLE app.scan_log_tb ADD COLUMN inspection_id uuid REFERENCES app.inspection_tb (inspection_id);
