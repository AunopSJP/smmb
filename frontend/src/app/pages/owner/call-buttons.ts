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
})
export class CallButtons {
  protected readonly i18n = inject(I18n);
  readonly big = input(false);
}
