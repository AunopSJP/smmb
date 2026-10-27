import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../core/i18n';
import { Icon } from './icon';

/** หัวหน้าจอ: บรรทัดเล็ก (บ้านเลขที่ / หน่วยงาน) + ชื่อหน้า + ปุ่มกระดิ่ง/ย้อนกลับ */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      @if (back()) {
        <a class="circle" [routerLink]="back()" [attr.aria-label]="i18n.t({ th: 'ย้อนกลับ', en: 'Back' })">
          <app-icon name="chevronLeft" [size]="22" />
        </a>
      }
      <div class="text">
        @if (caption()) {
          <p class="caption">{{ caption() }}</p>
        }
        <h1>{{ title() }}</h1>
      </div>
      @if (bell()) {
        <a class="circle" [routerLink]="bell()" [attr.aria-label]="i18n.t({ th: 'แจ้งเตือน', en: 'Notifications' })">
          <app-icon name="bell" [size]="22" />
        </a>
      }
    </header>
  `,
  styles: `
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0 4px;
    }
    .text {
      flex: 1;
      min-width: 0;
    }
    .caption {
      font-size: 0.8125rem;
      color: var(--text-muted);
    }
    h1 {
      font-size: 1.375rem;
      line-height: 1.3;
    }
    .circle {
      display: grid;
      place-items: center;
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--surface);
      box-shadow: var(--shadow);
      color: var(--text);
    }
  `,
})
export class PageHeader {
  protected readonly i18n = inject(I18n);
  readonly caption = input<string>();
  readonly title = input.required<string>();
  /** URL ของหน้าแจ้งเตือน — ไม่ใส่ = ไม่มีกระดิ่ง */
  readonly bell = input<string>();
  /** URL ย้อนกลับ — ใส่สำหรับหน้าย่อย */
  readonly back = input<string>();
}
