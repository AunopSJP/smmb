-- อนุญาตให้ scheduler ลบ log เก่าตามนโยบาย retention ได้ โดยยังกันการลบปกติจากแอป
-- ต้องตั้ง `SET LOCAL app.allow_log_purge = 'on'` ภายใน transaction เท่านั้น
CREATE OR REPLACE FUNCTION app.reject_log_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_log_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'log tables are append-only' USING ERRCODE = '42501';
END;
$$;
