# Handoff

ปรับ app/src/main.rs ให้การสแกนพอร์ตและการเรียก esptool/Python บน Windows ใช้ CREATE_NO_WINDOW จึงไม่มีหน้าต่าง CMD กระพริบซ้ำ เพิ่มการจำแนก CP210x/CH34x/USB Serial/Silicon Labs/FTDI เรียงไว้ก่อนและติดป้ายว่า 'น่าจะเป็นบอร์ดนี้' พร้อมสถานะบอร์ดที่เลือก สร้าง release build สำเร็จ คัดลอกเป็น app/SMMB-Firmware-Flasher.exe และ rebuild_check ผ่านทั้ง build กับ app-screenshot (1350×1025). Unknown เดิมเรื่อง firmware offset และ VID/PID ยังเปิดอยู่และไม่ขัดกับงานนี้.
