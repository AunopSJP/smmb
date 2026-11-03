import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// เบราว์เซอร์คืนหน้าเดิมจาก back-forward cache (กดย้อนหลังออกจากระบบ/ล็อกอินบัญชีอื่น) → โหลดใหม่ให้ guard ตรวจ session อีกครั้ง
// ไม่งั้นจะเห็นข้อมูลของบัญชีเดิมค้างอยู่ทั้งที่ออกจากระบบแล้ว
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
