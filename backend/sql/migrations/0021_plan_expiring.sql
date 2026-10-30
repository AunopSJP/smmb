-- แจ้งเจ้าของบ้านเมื่อแพ็กเกจเหลือ <= 7 วัน (ครั้งเดียวต่อช่วงแพ็ก) — งานเบื้องหลังจำว่าแจ้งแล้ว
ALTER TABLE app.user_plan_tb ADD COLUMN expiring_notified_date timestamptz;
