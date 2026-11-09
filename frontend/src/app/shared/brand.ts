import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18n } from '../core/i18n';

/** โลโก้ + ชื่อ — ใช้ในหน้าที่ไม่ได้ล็อกอิน (ไรเดอร์ / ล็อกอิน / สมัคร) · รูปจาก wireframe "Brand/Logo (source)" (ไอคอนทุกขนาดอยู่ public/icons)
 *  `hero` = แบบกลางจอ โลโก้ใหญ่ (หน้าเข้าสู่ระบบ ตามแคนวาสดีไซน์ 2026-11-06) */
@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.hero]': 'hero()' },
  template: `<img src="icons/icon-96x96.png" [attr.width]="hero() ? 72 : 36" [attr.height]="hero() ? 72 : 36" alt="" /><strong>Smart Mailbox</strong>
    @if (hero()) {
      <small>{{ i18n.t({ th: 'ตู้จดหมายอัจฉริยะ ดูแลบ้านคุณ', en: 'The smart mailbox that looks after your home' }) }}</small>
    }`,
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
    :host(.hero) small {
      font-size: 0.9375rem;
      font-weight: 400;
      color: var(--text-muted);
      text-align: center;
    }
  `,
})
export class Brand {
  protected readonly i18n = inject(I18n);
  readonly hero = input(false);
}
