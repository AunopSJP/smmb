import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n, type Tr } from '../core/i18n';
import { Icon } from './icon';

/**
 * แสดงความคืบหน้าของฟอร์มหลายขั้นเป็นวงกลมเรียงแนวนอน
 * — ขั้นที่ผ่านแล้ว = เครื่องหมายถูก · ขั้นปัจจุบัน = เลขทึบ · ขั้นถัดไป = เลขจาง
 * ใช้คู่กับหัวเรื่องที่บอกชื่อขั้นอยู่แล้ว (ไม่ต้องใส่ชื่อขั้นซ้ำในวงกลม)
 */
@Component({
  selector: 'app-step-progress',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="sp" [attr.aria-label]="i18n.t(label())">
      @for (n of items(); track n) {
        <li [class.done]="n < current()" [class.now]="n === current()" [attr.aria-current]="n === current() ? 'step' : null">
          <span class="dot" aria-hidden="true">
            @if (n < current()) {
              <app-icon name="check" [size]="14" />
            } @else {
              {{ n }}
            }
          </span>
          <span class="sr-only">{{ i18n.t({ th: 'ขั้นที่ ', en: 'Step ' }) }}{{ n }} / {{ count() }}</span>
          @if (n < count()) {
            <span class="line" aria-hidden="true"></span>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    .sp {
      display: flex;
      align-items: center;
      list-style: none;
      margin: 0;
      padding-inline: 4px;
    }
    li {
      display: flex;
      align-items: center;
      flex: 1;
      min-inline-size: 0;
    }
    li:last-child {
      flex: none;
    }
    .dot {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 30px;
      block-size: 30px;
      border-radius: 50%;
      border: 2px solid var(--line);
      background: var(--surface);
      color: var(--text-muted);
      font-size: var(--fs-sm);
      font-weight: 700;
    }
    li.done .dot,
    li.now .dot {
      border-color: var(--brand);
      background: var(--brand);
      color: var(--on-dark);
    }
    li.done .line {
      background: var(--brand);
    }
    .line {
      flex: 1;
      block-size: 3px;
      margin-inline: 6px;
      border-radius: var(--radius-xs);
      background: var(--line);
    }
  `,
})
export class StepProgress {
  protected readonly i18n = inject(I18n);
  /** จำนวนขั้นทั้งหมด */
  readonly count = input.required<number>();
  /** ขั้นปัจจุบัน เริ่มที่ 1 */
  readonly current = input.required<number>();
  readonly label = input<Tr>({ th: 'ขั้นตอน', en: 'Progress' });
  protected readonly items = computed(() => Array.from({ length: this.count() }, (_, i) => i + 1));
}
