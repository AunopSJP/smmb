-- อัปเดตเฟิร์มแวร์ตู้อัตโนมัติ (✅ ผู้ใช้สั่ง 2026-11-06 "บังคับอัปเดตเฟิร์มแวร์เวอร์ชันล่าสุดให้ทุกบอร์ดหลังออนไลน์")
-- setting_tb['firmware_auto'] = เวอร์ชันที่ตู้ทุกใบต้องใช้ (ไม่มีแถว = ปิด) · ตู้ที่ออนไลน์และยังรายงานเวอร์ชันอื่น → ตั้ง fw_target ให้เอง
ALTER TABLE app.setting_tb DROP CONSTRAINT setting_tb_setting_key_check;
ALTER TABLE app.setting_tb ADD CONSTRAINT setting_tb_setting_key_check CHECK (setting_key IN ('support_contact', 'firmware_auto'));
