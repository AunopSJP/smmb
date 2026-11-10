-- uq_zone_name ซ้ำกับ zone_name_per_agency (lower(name)) — เก็บตัวหลังที่กันซ้ำได้ดีกว่า
DROP INDEX IF EXISTS app.uq_zone_name;
