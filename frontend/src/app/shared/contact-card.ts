import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n, type Tr } from '../core/i18n';

/** หาเบอร์โทรในข้อความ (เช่น "สถานี 02-111-2222") → ใช้ทำลิงก์ tel: */
export function phoneIn(text: string | null | undefined): string | null {
  const m = text?.match(/(\+66|0)[\d\s-]{7,14}\d/);
  if (!m) return null;
  const digits = m[0].replace(/[^\d+]/g, '').replace(/^\+66/, '0');
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}

/** 021234567 → 02-123-4567 (บ้าน 9 หลัก) · 0812345678 → 081-234-5678 (มือถือ 10 หลัก) */
export function prettyPhone(d: string): string {
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * ช่องทางติดต่อที่เจ้าของข้อมูลตั้งใจเปิดเผย (หน่วยงานกรอกตอนสมัคร / แอดมินตั้งค่า) — api.md §3.1
 * ไม่ใช่เบอร์ล็อกอินของใคร (เบอร์ล็อกอินเห็นข้ามบทบาทได้เฉพาะตอน SOS)
 */
@Component({
  selector: 'app-contact-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card contact">
      <span class="muted small">{{ i18n.t(label()) }}</span>
      @if (contact(); as c) {
        <strong>{{ c }}</strong>
        @if (tel(); as t) {
          <a class="btn" [href]="'tel:' + t">{{ i18n.t({ th: 'โทร ', en: 'Call ' }) }}{{ pretty(t) }}</a>
        }
      } @else {
        <span class="muted">{{ i18n.t({ th: 'ยังไม่ได้ตั้งช่องทางติดต่อ', en: 'No contact has been set yet' }) }}</span>
      }
    </section>
  `,
  styles: `
    .contact {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .btn {
      margin-top: 4px;
    }
  `,
})
export class ContactCard {
  protected readonly i18n = inject(I18n);
  readonly label = input.required<Tr>();
  readonly contact = input<string | null>(null);
  protected readonly tel = computed(() => phoneIn(this.contact()));
  protected readonly pretty = prettyPhone;
}
