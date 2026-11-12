import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18n } from '../../core/i18n';

/** ปุ่มโทร 191 / 1669 — แสดงทุกหน้าของ SOS (SOS ไม่ได้แทนการโทร) */
@Component({
  selector: 'app-call-buttons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="calls" [class.big]="big()">
      <a class="call" href="tel:191">
        <strong>191</strong>
        <span>
          {{ i18n.t({ th: 'โทรตำรวจ', en: 'Police' }) }}
          @if (big()) {
            <br />{{ i18n.t({ th: 'เหตุร้าย / ขโมย', en: 'Crime / theft' }) }}
          }
        </span>
      </a>
      <a class="call" href="tel:1669">
        <strong>1669</strong>
        <span>
          {{ i18n.t({ th: 'โทรรถพยาบาล', en: 'Ambulance' }) }}
          @if (big()) {
            <br />{{ i18n.t({ th: 'เจ็บป่วยฉุกเฉิน', en: 'Medical emergency' }) }}
          }
        </span>
      </a>
    </div>
  `,
  styles: `
    /* โหมดง่าย: ปุ่มโทรใหญ่ขึ้น (ปลอดภัยไว้ก่อน) · โหมดละเอียด: กระชับขึ้น */
    :host-context([data-mode='easy']) .call {
      min-block-size: 92px;
      border-radius: 24px;
    }
    :host-context([data-mode='easy']) .call strong {
      font-size: 2.25rem;
    }
    :host-context([data-mode='easy']) .call span {
      font-size: 1rem;
    }
    :host-context([data-mode='advanced']) .call {
      min-block-size: 46px;
    }
    :host-context([data-mode='advanced']) .call strong {
      font-size: 1.125rem;
    }
    :host-context([data-mode='advanced']) .call span {
      font-size: 0.75rem;
    }
  `,
})
export class CallButtons {
  protected readonly i18n = inject(I18n);
  readonly big = input(false);
}
