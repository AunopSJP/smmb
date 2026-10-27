-- เฟส 1 ข้อ 6: หน่วยงาน + หลังบ้านผู้ใช้

-- เหตุผลที่แอดมินไม่อนุมัติหน่วยงาน (แสดงที่หน้า L02-b)
ALTER TABLE app.agency_tb ADD COLUMN reject_reason text;

-- แอดมินเปิดดูข้อมูลส่วนบุคคล / เห็นเบอร์ใน SOS (api.md §12) · เพิ่มอย่างเดียว
CREATE TABLE app.data_access_log_tb (
  data_access_log_id bigserial PRIMARY KEY,
  actor_user_id text NOT NULL REFERENCES app.user_tb (user_id),
  subject_kind  text NOT NULL,                         -- 'user' | 'box' | 'sos'
  subject_id    text NOT NULL,
  fields        text[] NOT NULL DEFAULT '{}',
  created_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_data_access_log_subject ON app.data_access_log_tb (subject_kind, subject_id, created_date DESC);

-- ห้ามแก้/ลบ log — กันที่ฐานข้อมูลด้วย ไม่ใช่แค่ไม่มี route (CLAUDE.md กฎข้อ 6)
CREATE FUNCTION app.reject_log_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER trg_data_access_log_append_only
  BEFORE UPDATE OR DELETE ON app.data_access_log_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();
CREATE TRIGGER trg_terms_acceptance_append_only
  BEFORE UPDATE OR DELETE ON app.terms_acceptance_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();
