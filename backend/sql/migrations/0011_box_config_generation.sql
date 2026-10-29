-- แยกรุ่นการสั่งซิงก์ออกจากค่าจริง เพื่อให้แอดมินบังคับให้บอร์ดรับค่ากลางใหม่ได้
ALTER TABLE app.box_tb
  ADD COLUMN config_generation int NOT NULL DEFAULT 0;
