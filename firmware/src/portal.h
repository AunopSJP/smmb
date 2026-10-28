#pragma once
// โหมดตั้งค่า: ตู้ปล่อย Wi-Fi "MAILBOX-xxxxxx" + หน้าเว็บ 192.168.4.1 (captive portal)
// ช่าง/เจ้าของบ้านเลือก Wi-Fi บ้าน + ใส่รหัส · ช่างใส่ URL เซิร์ฟเวอร์ / box_id / device_secret ได้ในหัวข้อ "ตั้งค่าอุปกรณ์"
// คืนเมื่อบันทึกและต่อ Wi-Fi สำเร็จ (true) หรือหมดเวลา (false)
bool runSetupPortal(unsigned long timeoutMs);
