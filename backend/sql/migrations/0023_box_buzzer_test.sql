-- แอดมิน/ช่างกด "ทดสอบเสียง Buzzer" ในเว็บ → ตู้รับคำสั่ง beep ตอน long-poll / boot / report แล้วส่งเสียงตามรูปแบบที่เลือก
-- requested_date = มีคำสั่งรอตู้รับ (NULL = ไม่มี) · ค้างเกิน 2 นาที = หมดอายุ (ตู้ออฟไลน์) · ตู้ตอบรับ (event beep) → ล้าง + บันทึก done_date
ALTER TABLE app.box_tb
  ADD COLUMN beep_pattern        text CHECK (beep_pattern IN ('ready','pass','retry','fail','error','wifi')),
  ADD COLUMN beep_requested_date timestamptz,
  ADD COLUMN beep_requested_by   text REFERENCES app.user_tb (user_id),
  ADD COLUMN beep_done_date      timestamptz;
