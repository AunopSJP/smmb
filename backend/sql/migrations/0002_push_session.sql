-- ผูก push subscription กับ session (เครื่องที่ล็อกอิน)
-- ออกจากระบบ / ถูกเตะ / session หมดอายุ → เครื่องนั้นหยุดได้รับแจ้งเตือนทันที
-- (มือถือที่ใช้ร่วมกันจะไม่เห็นแจ้งเตือน SOS ที่มีเบอร์โทรของคนที่ออกไปแล้ว)
ALTER TABLE app.push_subscription_tb
  ADD COLUMN session_id uuid NOT NULL REFERENCES app.session_tb (session_id) ON DELETE CASCADE;

CREATE INDEX ix_push_subscription_session ON app.push_subscription_tb (session_id);
