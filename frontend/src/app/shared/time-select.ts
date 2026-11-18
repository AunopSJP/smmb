import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../core/i18n';

/**
 * เลือกเวลา 24 ชม. ด้วยตัวเลือก ชั่วโมง : นาที (เลื่อนเลือกได้ ไม่ต้องพิมพ์) — ใช้ตั้งเวลาตรวจของโซน
 * ชั่วโมง 00–23 · นาทีเดินทีละ 5 (ค่าเดิมที่นาทีไม่ลงตัวยังแสดงได้) · ส่งค่ากลับเป็นข้อความ "HH:mm"
 * หน้าตาใช้โทเคนเดียวกับช่องกรอกอื่น (.field select) — สูง ≥52px แตะง่าย · โหมดง่ายสูง 60px
 */
@Component({
  selector: 'app-time-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="ts">
      <select [attr.aria-label]="label() + ' ' + i18n.t({ th: 'ชั่วโมง', en: 'hour' })" (change)="pick($any($event.target).value, minute())">
        @for (h of hours; track h) {
          <option [value]="h" [selected]="h === hour()">{{ h }}</option>
        }
      </select>
      <span class="colon" aria-hidden="true">:</span>
      <select [attr.aria-label]="label() + ' ' + i18n.t({ th: 'นาที', en: 'minute' })" (change)="pick(hour(), $any($event.target).value)">
        @for (m of minutes(); track m) {
          <option [value]="m" [selected]="m === minute()">{{ m }}</option>
        }
      </select>
    </span>
  `,
  styles: [
    `
      /* กินความกว้างที่เหลือของแถว เพื่อให้ช่องใหญ่และกดง่าย */
      :host {
        display: inline-flex;
        flex: 1 1 auto;
        min-inline-size: 0;
      }
      .ts {
        display: flex;
        align-items: center;
        gap: 6px;
        inline-size: 100%;
      }
      select {
        flex: 1 1 0;
        min-inline-size: 4.25rem;
        min-block-size: 52px;
        padding: 0 10px;
        border: 1.5px solid color-mix(in srgb, var(--text-muted) 55%, transparent);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--text);
        font: inherit;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        text-align: center;
        cursor: pointer;
      }
      select:focus-visible {
        outline: 2px solid var(--brand);
        outline-offset: 1px;
        border-color: var(--brand);
      }
      .colon {
        color: var(--text-muted);
        font-weight: var(--fw-strong);
      }
      :host-context([data-mode='easy']) select {
        min-block-size: 60px;
      }
    `,
  ],
})
export class TimeSelect {
  protected readonly i18n = inject(I18n);
  /** ค่าปัจจุบัน "HH:mm" */
  readonly value = input.required<string>();
  /** ชื่อช่องสำหรับโปรแกรมอ่านจอ (เช่น "เริ่ม") */
  readonly label = input('');
  readonly changed = output<string>();

  protected readonly hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  protected readonly hour = computed(() => this.value().slice(0, 2));
  protected readonly minute = computed(() => this.value().slice(3, 5));
  /** นาทีทีละ 5 + ค่าปัจจุบันถ้าไม่ลงตัว (เช่น 07) */
  protected readonly minutes = computed(() => {
    const base = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
    const cur = this.minute();
    return /^\d{2}$/.test(cur) && !base.includes(cur) ? [...base, cur].sort() : base;
  });

  protected pick(h: string, m: string): void {
    this.changed.emit(`${h}:${m}`);
  }
}
