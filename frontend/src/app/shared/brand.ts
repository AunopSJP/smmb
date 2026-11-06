import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** โลโก้ + ชื่อ — ใช้ในหน้าที่ไม่ได้ล็อกอิน (ไรเดอร์ / ล็อกอิน / สมัคร) · รูปจาก wireframe "Brand/Logo (source)" (ไอคอนทุกขนาดอยู่ public/icons)
 *  `hero` = แบบกลางจอ โลโก้ใหญ่ (หน้าเข้าสู่ระบบ ตามแคนวาสดีไซน์ 2026-11-06) */
@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.hero]': 'hero()' },
  template: `<img src="icons/icon-96x96.png" [attr.width]="hero() ? 72 : 36" [attr.height]="hero() ? 72 : 36" alt="" /><strong>Smart Mailbox</strong>`,
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
    :host(.hero) {
      flex-direction: column;
      justify-content: center;
      gap: 10px;
      padding: 28px 0 12px;
      font-size: 1.375rem;
    }
    :host(.hero) img {
      border-radius: 20px;
    }
  `,
})
export class Brand {
  readonly hero = input(false);
}
