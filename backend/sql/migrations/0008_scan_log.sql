-- เฟส 2: บันทึกทุกการสแกน / พิมพ์รหัส แม้ไม่ผ่าน (CLAUDE.md กฎข้อ 6) — ใช้ครั้งแรกตอนเจ้าของบ้านผูกตู้
-- แยกจาก 0007 เพราะ 0007 ถูก commit ไปแล้ว (ห้ามแก้ migration ที่อาจ apply แล้ว)

CREATE TABLE app.scan_log_tb (
  scan_log_id    bigserial PRIMARY KEY,
  actor_kind     text NOT NULL CHECK (actor_kind IN ('officer','owner','rider','box')),
  user_id        text REFERENCES app.user_tb (user_id),
  box_id         text REFERENCES app.box_tb (box_id),         -- NULL = QR ไม่ใช่ของระบบ / รหัสผิด
  box_qr_code_id uuid REFERENCES app.box_qr_code_tb (box_qr_code_id),
  qr_kind        text NOT NULL CHECK (qr_kind IN ('front','activate','badge')),
  method         text NOT NULL CHECK (method IN ('scan','code')),
  raw            text,                                        -- ข้อความที่สแกน/พิมพ์ (ไว้สืบ QR ปลอม)
  result         text NOT NULL,                               -- ok / invalid / not_system / already_owned / locked …
  scan_ms        int,
  attempt        int,
  box_job_id     text REFERENCES app.box_job_tb (box_job_id),
  ip             inet,
  created_date   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_scan_log_box ON app.scan_log_tb (box_id, created_date DESC);
CREATE INDEX ix_scan_log_qr  ON app.scan_log_tb (box_qr_code_id, created_date DESC);
CREATE INDEX ix_scan_log_user ON app.scan_log_tb (user_id, created_date DESC);

CREATE TRIGGER trg_scan_log_append_only BEFORE UPDATE OR DELETE ON app.scan_log_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();
