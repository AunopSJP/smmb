-- เฟส 1: ผู้ใช้ + บทบาท + session · หน่วยงาน/โซน · แพ็กเกจ · ข้อตกลง · แจ้งเตือน
-- แบบเต็มและเหตุผล: docs/smmb-design.md §4
--
-- กติกาการตั้งชื่อ (CLAUDE.md):
--   ตาราง = เอกพจน์ + _tb · คีย์หลักแบบสร้างเอง = <ชื่อตาราง>_id · คีย์ธรรมชาติใช้ชื่อตามความหมาย (plan_code)
--   FK = ชื่อเดียวกับคีย์หลักปลายทาง (ใส่คำนำหน้าเมื่อชื่อชน เช่น owner_user_id) · ผู้กระทำ = <กริยา>_by
--   เวลา = *_date (ชนิด timestamptz) · ทุกตารางมี created_date + updated_date ยกเว้นตาราง log (มีแค่ created_date)
--   ชื่อในฐานข้อมูลไม่ใช่ชื่อใน API — แปลงผ่าน mapper ทุกครั้ง ห้ามส่งแถวออก API ตรง ๆ

-- ให้ updated_date เปลี่ยนเองทุกครั้งที่แก้แถว ----------------------------------
CREATE FUNCTION app.set_updated_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_date := now();
  RETURN NEW;
END $$;

-- ผู้ใช้ -------------------------------------------------------------------------
CREATE SEQUENCE app.user_no_seq;

CREATE TABLE app.user_tb (                             -- ตัวตน 1 เบอร์ = 1 แถว · บทบาทอยู่ user_role_tb
  user_id       text PRIMARY KEY DEFAULT 'U-' || lpad(nextval('app.user_no_seq')::text, 4, '0'),
  phone         text NOT NULL UNIQUE CHECK (phone ~ '^0[0-9]{9}$'),   -- normalize แล้ว '0812345678'
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),  -- ทั้งบัญชี
  name          text NOT NULL,
  display_name  text NOT NULL,                         -- ที่คนอื่นเห็น เช่น 'ส.ต.ต. สมชาย'
  house_no      text,                                  -- ใช้เมื่อมีบทบาท owner
  password_hash text NOT NULL,                         -- argon2id
  must_change_password boolean NOT NULL DEFAULT false,
  prefs         jsonb NOT NULL DEFAULT '{}',           -- api.md §3
  token_version int NOT NULL DEFAULT 0,                -- +1 = เตะทุก session
  perm_version  int NOT NULL DEFAULT 0,                -- +1 เมื่อบทบาท/โซน/สถานะเปลี่ยน
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now(),
  deleted_date  timestamptz
);
ALTER SEQUENCE app.user_no_seq OWNED BY app.user_tb.user_id;

-- บทบาทที่ได้รับแล้วเท่านั้น · คำขอที่ยังรออนุมัติอยู่ agency_member_tb.status
-- head ไม่ใช่บทบาทแยก = agency_member_tb.is_head
CREATE TABLE app.user_role_tb (
  user_id      text NOT NULL REFERENCES app.user_tb (user_id),
  role         text NOT NULL CHECK (role IN ('admin','owner','officer')),
  level        int  NOT NULL DEFAULT 0,                -- Role + Level · ยังไม่ใช้
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  granted_by   text REFERENCES app.user_tb (user_id),  -- NULL = ได้ตอนสมัคร
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

-- บัญชีแอดมินห้ามมีบทบาทอื่น (มือถือที่ใช้ทุกวันหาย = ไม่เสียสิทธิ์สูงสุดไปด้วย)
CREATE FUNCTION app.check_admin_exclusive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id));   -- กันเพิ่มสองบทบาทพร้อมกัน
  IF EXISTS (
    SELECT 1 FROM app.user_role_tb r
    WHERE r.user_id = NEW.user_id AND r.role <> NEW.role
      AND (r.role = 'admin' OR NEW.role = 'admin')
  ) THEN
    RAISE EXCEPTION 'admin role cannot be combined with other roles (user %)', NEW.user_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'admin_exclusive';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_user_role_admin_exclusive
  BEFORE INSERT OR UPDATE OF role, user_id ON app.user_role_tb
  FOR EACH ROW EXECUTE FUNCTION app.check_admin_exclusive();

-- cookie `sid` เก็บ token สุ่ม · ฐานข้อมูลเก็บแค่ hash → ข้อมูลหลุดก็เอาไปสวมรอยไม่ได้
CREATE TABLE app.session_tb (
  session_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash     text NOT NULL UNIQUE,                 -- sha256(token)
  user_id        text NOT NULL REFERENCES app.user_tb (user_id),
  token_version  int  NOT NULL,                        -- ไม่ตรงกับ user_tb.token_version = ถูกเตะ
  user_agent     text,
  ip             inet,
  last_seen_date timestamptz,
  expire_date    timestamptz NOT NULL,
  revoked_date   timestamptz,
  created_date   timestamptz NOT NULL DEFAULT now(),
  updated_date   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_session_user ON app.session_tb (user_id) WHERE revoked_date IS NULL;

-- หน่วยงาน / โซน -----------------------------------------------------------------
CREATE TABLE app.agency_tb (
  agency_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  type          text NOT NULL CHECK (type IN ('police','guard','other')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  group_code    text UNIQUE,                           -- มีเมื่อ approved · หมุนใหม่ได้
  approved_by   text REFERENCES app.user_tb (user_id),
  approved_date timestamptz,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.agency_member_tb (
  agency_id    uuid NOT NULL REFERENCES app.agency_tb (agency_id),
  user_id      text NOT NULL UNIQUE REFERENCES app.user_tb (user_id),  -- 1 คน 1 หน่วยงาน (❓ design §15)
  is_head      boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','disabled')),
  decided_by   text REFERENCES app.user_tb (user_id),
  decided_date timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, user_id)
);

CREATE TABLE app.zone_tb (
  zone_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL REFERENCES app.agency_tb (agency_id),
  name         text NOT NULL,
  tz           text NOT NULL DEFAULT 'Asia/Bangkok',
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  deleted_date timestamptz
);
CREATE UNIQUE INDEX uq_zone_name ON app.zone_tb (agency_id, name) WHERE deleted_date IS NULL;

CREATE TABLE app.zone_window_tb (                      -- เวลาตรวจ เช่น 06:00–09:00 (เวลาท้องถิ่นของโซน)
  zone_id      uuid NOT NULL REFERENCES app.zone_tb (zone_id) ON DELETE CASCADE,
  start_time   time NOT NULL,
  end_time     time NOT NULL CHECK (start_time < end_time),   -- ไม่ข้ามเที่ยงคืน
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, start_time)
);

CREATE TABLE app.zone_officer_tb (
  zone_id      uuid NOT NULL REFERENCES app.zone_tb (zone_id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES app.user_tb (user_id),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, user_id)
);
CREATE INDEX ix_zone_officer_user ON app.zone_officer_tb (user_id);

-- ตู้ (โครงพื้นฐานเท่าที่ zone_box_tb ต้องใช้ · QR/job/รายงาน มาในเฟส 2) ------------
CREATE SEQUENCE app.box_no_seq;

CREATE TABLE app.box_tb (
  box_id          text PRIMARY KEY DEFAULT 'BX-' || lpad(nextval('app.box_no_seq')::text, 5, '0'),
  owner_user_id   text REFERENCES app.user_tb (user_id),   -- NULL = ยังไม่ผูก
  name            text,
  house_no        text,                                -- คัดลอกจากเจ้าของตอนผูก
  service_active  boolean NOT NULL DEFAULT true,
  secret_kid      int NOT NULL DEFAULT 1,              -- รุ่นของ master key
  fw              text,
  config_ver_seen int,
  config_override jsonb NOT NULL DEFAULT '{}',
  battery_pct     int CHECK (battery_pct BETWEEN 0 AND 100),
  charging        boolean,
  battery_date    timestamptz,
  last_seen_date  timestamptz,
  online_state    text NOT NULL DEFAULT 'unknown'
                  CHECK (online_state IN ('unknown','online','sleeping','offline')),
  bound_date      timestamptz,
  created_date    timestamptz NOT NULL DEFAULT now(),
  updated_date    timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE app.box_no_seq OWNED BY app.box_tb.box_id;
CREATE INDEX ix_box_owner ON app.box_tb (owner_user_id) WHERE owner_user_id IS NOT NULL;

CREATE TABLE app.zone_box_tb (
  zone_id      uuid NOT NULL REFERENCES app.zone_tb (zone_id) ON DELETE CASCADE,
  box_id       text NOT NULL REFERENCES app.box_tb (box_id),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, box_id)
);
CREATE INDEX ix_zone_box_box ON app.zone_box_tb (box_id);

-- แพ็กเกจ (design §17) — เก็บและแสดงผลเท่านั้น ไม่มีการคิดเงิน -----------------------
CREATE TABLE app.plan_tb (
  plan_code    text PRIMARY KEY,                       -- 'free'
  name_th      text NOT NULL,
  name_en      text NOT NULL,
  features     jsonb NOT NULL DEFAULT '{}',
  price_note   text,
  is_default   boolean NOT NULL DEFAULT false,         -- ให้อัตโนมัติตอนเจ้าของบ้านสมัคร
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_plan_default ON app.plan_tb (is_default) WHERE is_default;

CREATE TABLE app.user_plan_tb (                        -- แพ็กปัจจุบัน = แถวที่คลุม now()
  user_plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES app.user_tb (user_id),   -- ต้องมีบทบาท owner (เช็กใน service)
  plan_code    text NOT NULL REFERENCES app.plan_tb (plan_code),
  start_date   timestamptz NOT NULL DEFAULT now(),
  end_date     timestamptz,                            -- NULL = ไม่หมดอายุ
  set_by       text REFERENCES app.user_tb (user_id),  -- NULL = ระบบให้ตอนสมัคร
  note         text,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date > start_date),
  EXCLUDE USING gist (user_id WITH =, tstzrange(start_date, end_date) WITH &&)  -- ช่วงห้ามทับ
);

INSERT INTO app.plan_tb (plan_code, name_th, name_en, features, price_note, is_default, sort_order)
VALUES ('free', 'ฟรี', 'Free', '{"history_days": 30, "family_members": 0}', 'ฟรีช่วงทดลอง', true, 0);

-- ข้อตกลง -------------------------------------------------------------------------
CREATE TABLE app.terms_tb (
  terms_version  text PRIMARY KEY,
  body_md        text NOT NULL,
  published_date timestamptz NOT NULL,
  created_date   timestamptz NOT NULL DEFAULT now(),
  updated_date   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.terms_acceptance_tb (                 -- หลักฐานการยอมรับ · เพิ่มอย่างเดียว
  user_id       text NOT NULL REFERENCES app.user_tb (user_id),
  terms_version text NOT NULL REFERENCES app.terms_tb (terms_version),
  ip            inet,
  user_agent    text,
  created_date  timestamptz NOT NULL DEFAULT now(),    -- = เวลาที่กดยอมรับ
  PRIMARY KEY (user_id, terms_version)
);

-- แจ้งเตือน -----------------------------------------------------------------------
CREATE TABLE app.push_subscription_tb (
  push_subscription_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint      text NOT NULL UNIQUE,
  user_id       text NOT NULL REFERENCES app.user_tb (user_id),
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  device_label  text,
  last_ok_date  timestamptz,
  failed_count  int NOT NULL DEFAULT 0,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_push_subscription_user ON app.push_subscription_tb (user_id);

CREATE TABLE app.notification_tb (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES app.user_tb (user_id),
  type         text NOT NULL,
  data         jsonb NOT NULL,
  link         text NOT NULL,
  read_date    timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_notification_user ON app.notification_tb (user_id, created_date DESC);

-- ผูก trigger updated_date กับทุกตารางที่มีคอลัมน์นี้ --------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'app' AND column_name = 'updated_date'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_date BEFORE UPDATE ON app.%1$I
         FOR EACH ROW EXECUTE FUNCTION app.set_updated_date()', t);
  END LOOP;
END $$;
