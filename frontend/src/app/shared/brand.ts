import { ChangeDetectionStrategy, Component } from '@angular/core';

/** โลโก้ + ชื่อ — ใช้ในหน้าที่ไม่ได้ล็อกอิน (ไรเดอร์ / ล็อกอิน / สมัคร) · รูปจาก wireframe "Brand/Logo (source)" (ไอคอนทุกขนาดอยู่ public/icons) */
@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<img src="icons/icon-96x96.png" width="36" height="36" alt="" /><strong>Smart Mailbox</strong>`,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0 4px;
    }
    img {
      border-radius: 9px;
    }
  `,
})
export class Brand {}
