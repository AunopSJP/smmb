# Handoff

ปรับ app/src/main.rs ให้คำแนะนำตรงกับบอร์ดสำเร็จที่มีปุ่ม IO0 และ RST: กด IO0 ค้าง กด RST แล้วปล่อย IO0 เพื่อเข้าโหมดแฟลช; หลังสำเร็จกด RST เพื่อเริ่มใช้งาน. cargo build --offline --locked --target-dir target-verify สำเร็จ และ rebuild_check ผ่านทั้ง build กับ app-screenshot (1350×1025). target เดิมถูกโปรเซสแอปที่เปิดอยู่ล็อก จึงใช้ target-verify สำหรับการตรวจ build. Unknown เดิมเรื่อง firmware offset/partition table และ USB VID/PID ไม่เกี่ยวกับการแก้ข้อความครั้งนี้.
