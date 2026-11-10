-- audit การเปลี่ยนสิทธิ์/อนุมัติ/รีเซ็ตรหัส/เปลี่ยนค่ากลาง — ตรวจย้อนหลังได้ว่าใครทำอะไร
CREATE TABLE app.admin_audit_log_tb (
  admin_audit_log_id bigserial PRIMARY KEY,
  actor_user_id text NOT NULL REFERENCES app.user_tb (user_id),
  action        text NOT NULL,              -- เช่น agency.approve, user.role.add, user.reset_password, box.config.reset
  subject_kind  text NOT NULL,              -- user | agency | box | zone
  subject_id    text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip            inet,
  created_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_admin_audit_subject ON app.admin_audit_log_tb (subject_kind, subject_id, created_date DESC);
CREATE INDEX ix_admin_audit_actor ON app.admin_audit_log_tb (actor_user_id, created_date DESC);

CREATE TRIGGER trg_admin_audit_append_only
  BEFORE UPDATE OR DELETE ON app.admin_audit_log_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();
