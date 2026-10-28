-- โซน (เฟส 1 ข้อ 7) — ชื่อโซนไม่ซ้ำกันในหน่วยงานเดียว (ไม่สนตัวเล็กใหญ่ · โซนที่ลบแล้วไม่นับ)
CREATE UNIQUE INDEX zone_name_per_agency ON app.zone_tb (agency_id, lower(name)) WHERE deleted_date IS NULL;

-- หาโซนของคน / ตู้ เร็วขึ้น (เช็ก "ในโซน" ตอนตรวจ · ป้าย "โซนที่ฉันอยู่")
CREATE INDEX zone_officer_by_user ON app.zone_officer_tb (user_id);
CREATE INDEX zone_box_by_box ON app.zone_box_tb (box_id);
