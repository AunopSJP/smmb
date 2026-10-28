-- เฟส 2: ตู้ — ลงทะเบียน · QR ชุดแรก · ค่าตั้งค่า · รายงานจากตู้ · กันส่งซ้ำ · งานปลุกตู้ (long-poll)
-- โปรโตคอล: docs/SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md · สัญญา API: docs/api.md §9.4, §9.5, §13

-- ตู้: เวลาที่ถือ long-poll ล่าสุด (ใช้คิดสถานะ online) + ใครลงทะเบียน ------------------
ALTER TABLE app.box_tb
  ADD COLUMN last_poll_date timestamptz,
  ADD COLUMN registered_by  text REFERENCES app.user_tb (user_id);

-- QR ของตู้: หน้าตู้ใบ 1 / สำรองใบ 2 / เปิดใช้ตู้ --------------------------------------
CREATE TABLE app.box_qr_code_tb (
  box_qr_code_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id            text NOT NULL REFERENCES app.box_tb (box_id),
  slot              text NOT NULL CHECK (slot IN ('1','2','activate')),
  version           int  NOT NULL DEFAULT 1,             -- ออกใหม่ = +1 → ลายเซ็นเปลี่ยน → ใบเก่าตาย
  token             text NOT NULL UNIQUE,                -- หน้าตู้ 'BX00042-1-K7M2QX' · activate สุ่ม 16 ตัว
  print_code        text NOT NULL UNIQUE,                -- 'H4KD9TRW' (เก็บไม่มีขีด ตัวใหญ่)
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','used')),
  health            text NOT NULL DEFAULT 'ok'
                    CHECK (health IN ('ok','suspicious','damaged','maybe_fake','backup_in_use','expiring')),
  health_reasons    text[] NOT NULL DEFAULT '{}',
  revoked_date      timestamptz,
  last_scanned_date timestamptz,
  created_date      timestamptz NOT NULL DEFAULT now(),  -- = วันออก QR
  updated_date      timestamptz NOT NULL DEFAULT now()
);
-- ใบที่ใช้งานอยู่ได้ใบเดียวต่อ (ตู้, ช่อง)
CREATE UNIQUE INDEX uq_box_qr_code_active ON app.box_qr_code_tb (box_id, slot) WHERE status = 'active';

-- ค่าตั้งค่ากลางของตู้ (1 แถว) — เวลาตรวจไม่อยู่ที่นี่ (มาจากโซน) ------------------------
CREATE TABLE app.box_config_tb (
  box_config_id int PRIMARY KEY DEFAULT 1 CHECK (box_config_id = 1),
  config        jsonb NOT NULL,
  updated_by    text REFERENCES app.user_tb (user_id),
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app.box_config_tb (config) VALUES
  ('{"report_at":"23:30","scan_timeout_s":20,"max_attempts":3,"flash_when_dark":true,"longpoll_wait_s":50}');

-- สิ่งที่ตู้ส่งมา (boot / รายงานรายวัน / เหตุการณ์) — เพิ่มอย่างเดียว ----------------------
CREATE TABLE app.box_report_tb (
  box_report_id bigserial PRIMARY KEY,
  box_id        text NOT NULL REFERENCES app.box_tb (box_id),
  kind          text NOT NULL CHECK (kind IN ('boot','report','event')),
  body          jsonb NOT NULL,                          -- เก็บทั้งก้อนตามที่ตู้ส่ง
  created_date  timestamptz NOT NULL DEFAULT now()       -- = เวลาที่ได้รับ
);
CREATE INDEX ix_box_report_box ON app.box_report_tb (box_id, created_date DESC);

-- คำขอที่ลายเซ็นตู้ไม่ผ่าน ("ความพยายามปลอม") — เพิ่มอย่างเดียว --------------------------
CREATE TABLE app.box_auth_log_tb (
  box_auth_log_id bigserial PRIMARY KEY,
  claimed_box_id  text,                                  -- ตามที่ส่งมา (อาจไม่มีตู้นี้จริง → ไม่ใช่ FK)
  reason          text NOT NULL
                  CHECK (reason IN ('missing_headers','unknown_box','clock_skew','bad_signature','replay')),
  method          text NOT NULL,
  path            text NOT NULL,
  ip              inet,
  created_date    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_box_auth_log_box ON app.box_auth_log_tb (claimed_box_id, created_date DESC);

-- nonce ที่ใช้แล้ว (กันส่งซ้ำ) — ของชั่วคราว ลบทิ้งหลัง 10 นาที จึงไม่มี updated_date ---------
CREATE TABLE app.box_nonce_tb (
  box_id       text NOT NULL REFERENCES app.box_tb (box_id),
  nonce        text NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (box_id, nonce)
);
CREATE INDEX ix_box_nonce_created ON app.box_nonce_tb (created_date);

-- งานปลุกตู้ (ส่งทาง long-poll) · inspect = ตรวจตู้ (เฟส 3) · test = ช่าง/แอดมินทดสอบกล้อง ---
CREATE TABLE app.box_job_tb (
  box_job_id     text PRIMARY KEY,                       -- 'J-8f31c2'
  box_id         text NOT NULL REFERENCES app.box_tb (box_id),
  type           text NOT NULL CHECK (type IN ('inspect','test')),
  created_by     text REFERENCES app.user_tb (user_id),
  max_attempts   int  NOT NULL CHECK (max_attempts BETWEEN 1 AND 5),
  scan_timeout_s int  NOT NULL CHECK (scan_timeout_s BETWEEN 10 AND 60),
  expire_date    timestamptz NOT NULL,                   -- +60 วิ
  delivered_date timestamptz,                            -- ตอบ long-poll ไปแล้ว
  ready_date     timestamptz,                            -- ตู้เปิดไฟ + กล้องแล้ว
  ready_flash    boolean,
  result         text CHECK (result IN ('pass','fail')), -- จบแล้ว
  result_date    timestamptz,
  created_date   timestamptz NOT NULL DEFAULT now(),
  updated_date   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_box_job_box ON app.box_job_tb (box_id, created_date DESC);

-- ทุกครั้งที่ตู้ส่งผลอ่าน QR — เพิ่มอย่างเดียว · PK = กุญแจกันส่งซ้ำ (job + attempt)
-- (job ↔ การตรวจเป็น 1:1 → ใช้ตารางนี้แทน inspection_attempt_tb ในร่าง design §4)
CREATE TABLE app.box_job_attempt_tb (
  box_job_id   text NOT NULL REFERENCES app.box_job_tb (box_job_id),
  attempt      int  NOT NULL CHECK (attempt BETWEEN 1 AND 5),
  read_ok      boolean NOT NULL,
  qr_text      text,
  read_ms      int,
  flash        boolean,
  verdict      text NOT NULL CHECK (verdict IN ('pass','retry','fail')),
  reason       text,                                     -- unreadable / bad_sig / wrong_job / wrong_user / expired
  created_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (box_job_id, attempt)
);

-- updated_date + ห้ามแก้/ลบ log ----------------------------------------------------------
CREATE TRIGGER trg_box_qr_code_tb_updated_date BEFORE UPDATE ON app.box_qr_code_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();
CREATE TRIGGER trg_box_config_tb_updated_date BEFORE UPDATE ON app.box_config_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();
CREATE TRIGGER trg_box_job_tb_updated_date BEFORE UPDATE ON app.box_job_tb
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_date();

CREATE TRIGGER trg_box_report_append_only BEFORE UPDATE OR DELETE ON app.box_report_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();
CREATE TRIGGER trg_box_auth_log_append_only BEFORE UPDATE OR DELETE ON app.box_auth_log_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();
CREATE TRIGGER trg_box_job_attempt_append_only BEFORE UPDATE OR DELETE ON app.box_job_attempt_tb
  FOR EACH ROW EXECUTE FUNCTION app.reject_log_change();
