import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../core/i18n';
import { Icon } from './icon';

export interface BoxChoice {
  id: string;
  name: string;
  house_no: string;
}

/**
 * ตัวเลือกตู้แบบกะทัดรัด (เจ้าของบ้านมีหลายตู้)
 *
 * เดิมใช้ `.segmented.chips` ที่ wrap ได้ — 10 ตู้ทำให้กินพื้นที่หลายแถวจนหน้าหลักยาว
 * ที่นี่ใช้ `<select>` ของเบราว์เซอร์: สูงแถวเดียว กดแล้วเห็นรายการครบ ใช้กับจอสัมผัสได้ดี
 * และมีตัวเลข "3/10" บอกว่ากำลังดูตู้ที่เท่าไรจากทั้งหมด
 */
@Component({
  selector: 'app-box-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="box-picker">
      <app-icon name="box" [size]="20" class="lead" />
      <span class="sr-only">{{ i18n.t({ th: 'เลือกตู้', en: 'Choose a mailbox' }) }}</span>
      <select (change)="pick.emit($any($event.target).value)">
        @for (b of boxes(); track b.id) {
          <option [value]="b.id" [selected]="b.id === value()">
            {{ b.house_no }} · {{ b.name || b.id }}
          </option>
        }
      </select>
      <span class="count" aria-hidden="true">{{ index() }}/{{ boxes().length }}</span>
      <app-icon name="chevronRight" [size]="18" class="chev" />
    </label>
  `,
  styles: `
    :host {
      display: block;
    }
    .box-picker {
      display: flex;
      align-items: center;
      gap: 10px;
      min-block-size: 52px;
      padding: 0 12px;
      border: 1.5px solid var(--line);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
    }
    .box-picker:focus-within {
      outline: 2px solid var(--brand);
      outline-offset: 1px;
      border-color: var(--brand);
    }
    .lead {
      flex: none;
      color: var(--brand-text);
    }
    select {
      flex: 1;
      min-inline-size: 0;
      min-block-size: 48px;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 700;
      appearance: none;
      cursor: pointer;
    }
    select:focus {
      outline: none;
    }
    .count {
      flex: none;
      color: var(--text-muted);
      font-size: 0.8125rem;
      font-variant-numeric: tabular-nums;
    }
    .chev {
      flex: none;
      color: var(--text-muted);
      transform: rotate(90deg);
    }
  `,
})
export class BoxPicker {
  protected readonly i18n = inject(I18n);
  readonly boxes = input.required<BoxChoice[]>();
  readonly value = input<string | null | undefined>(null);
  readonly pick = output<string>();
  protected readonly index = computed(() => Math.max(1, this.boxes().findIndex((b) => b.id === this.value()) + 1));
}
