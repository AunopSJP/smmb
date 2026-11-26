-- SOS ส่งแจ้งเตือนซ้ำเมื่อยังไม่มีคนรับ (design §7 · issue #10)
-- repeat_start_date = จุดเริ่มรอบส่งซ้ำ (ตอนสร้าง) · เริ่มรอบใหม่ = ตั้ง repeat_start_date = now() และ repeat_count = 0
-- repeat_count = ส่งซ้ำถึงนาทีที่เท่าไรแล้วของรอบนี้ (กันส่งซ้ำซ้อนหลัง restart)
ALTER TABLE app.sos_case_tb
  ADD COLUMN repeat_start_date timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN repeat_count      integer     NOT NULL DEFAULT 0;
UPDATE app.sos_case_tb SET repeat_start_date = created_date;
