-- พื้นฐาน: schema ของแอป + extension ที่ DDL ต้องใช้ (docs/smmb-design.md §4)
-- ตารางจริงเริ่มที่ 0001_init.sql
CREATE SCHEMA IF NOT EXISTS app;
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- EXCLUDE constraint ของ user_plans
