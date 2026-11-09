import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../core/i18n';
import { UnreadCount } from '../core/unread';
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
        <a class="circle bell" [routerLink]="bell()" [attr.aria-label]="i18n.t({ th: 'แจ้งเตือน', en: 'Notifications' }) + (unread.count() ? ' (' + unread.count() + ')' : '')">
          <app-icon name="bell" [size]="22" />
          @if (unread.count() > 0) {
            <span class="badge" aria-hidden="true">{{ unread.count() > 9 ? '9+' : unread.count() }}</span>
          }
        </a>
      }
    </header>
  `,
  styles: `
    header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 0 8px;
    }
    .text {
      flex: 1;
      min-inline-size: 0;
    }
    .caption {
      font-size: 0.8125rem;
      color: var(--text-muted);
    }
    h1 {
      font-size: 1.375rem;
      font-weight: 700;
      line-height: 1.25;
    }
    .bell {
      position: relative;
    }
    .badge {
      position: absolute;
      inset-block-start: 2px;
      inset-inline-end: 2px;
      min-inline-size: 18px;
      block-size: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: var(--sos);
      color: #fff;
      font-size: 0.6875rem;
      font-weight: 800;
      line-height: 18px;
      text-align: center;
    }
    /* แอดมินบนจอคอม: หัวหน้าจอใหญ่ขึ้น ปุ่มกลมเล็กลง เส้นคั่นใต้หัว */
    @media (min-width: 1024px) {
      :host-context(.admin-layout) header {
        gap: 14px;
        padding: 20px 0 16px;
        margin-block-end: 20px;
        border-block-end: 1px solid var(--line-strong);
      }
      :host-context(.admin-layout) h1 {
        font-size: 1.75rem;
        letter-spacing: -0.01em;
      }
      :host-context(.admin-layout) .caption {
        font-size: 0.875rem;
      }
      :host-context(.admin-layout) .circle {
        inline-size: 40px;
        block-size: 40px;
        border: 1px solid var(--line-strong);
        box-shadow: none;
      }
      /* มีเมนูข้างแล้ว ไม่ต้องมีปุ่มย้อนกลับกลม */
      :host-context(.admin-layout) a.circle:not(.bell) {
        display: none;
      }
      :host-context(.admin-layout) .circle:hover {
        background: var(--icon-bg);
      }
    }
    .circle {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 44px;
      block-size: 44px;
      border-radius: 50%;
      background: var(--surface);
      box-shadow: var(--shadow);
      color: var(--text);
    }
  `,
})
export class PageHeader {
  protected readonly i18n = inject(I18n);
  protected readonly unread = inject(UnreadCount);
  readonly caption = input<string>();
  readonly title = input.required<string>();
  /** URL ของหน้าแจ้งเตือน — ไม่ใส่ = ไม่มีกระดิ่ง */
  readonly bell = input<string>();
  /** URL ย้อนกลับ — ใส่สำหรับหน้าย่อย */
  readonly back = input<string>();
}
