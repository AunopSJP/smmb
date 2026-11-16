import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DisplaySettings } from '../core/display-settings';
import { I18n } from '../core/i18n';
import { Session } from '../core/session';
import { UnreadCount } from '../core/unread';
import { Icon } from './icon';

/**
 * หัวหน้าจอ: บรรทัดบริบท (บ้านเลขที่ / ชื่อหน่วยงาน / "แอดมิน") + ชื่อหน้า + ปุ่มกระดิ่ง/ย้อนกลับ
 * กฎเดียวทั้งแอป (A6): บรรทัดบน = บริบทของบทบาท ไม่ใช่คำโปรย — และจองความสูงไว้เสมอ
 * เพื่อให้ตำแหน่ง y ของชื่อหน้าเท่ากันทุกแท็บ แม้บางหน้าไม่มีข้อความบรรทัดบน
 */
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
        <p class="caption">{{ context() }}</p>
        <h1>{{ title() }}</h1>
      </div>
      @if (bell()) {
        <a class="circle bell" [routerLink]="bell()" [attr.aria-label]="i18n.t({ th: 'แจ้งเตือน', en: 'Notifications' }) + (unread.count() ? ' (' + unread.count() + ')' : '')">
          <app-icon name="bell" [size]="22" />
          @if (unread.count() > 0) {
            <span class="badge" aria-hidden="true">{{ display.advancedMode() ? unread.count() : (unread.count() > 9 ? '9+' : unread.count()) }}</span>
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
      /* จองหนึ่งบรรทัดเสมอ (A6) — หน้าไหนไม่มีบริบทก็ไม่ทำให้ชื่อหน้าขยับขึ้น */
      min-block-size: calc(var(--fs-sm) * 1.5);
      font-size: var(--fs-sm);
      line-height: 1.5;
      color: var(--text-muted);
      overflow-wrap: break-word;
    }
    h1 {
      font-size: var(--fs-lg);
      font-weight: 700;
      line-height: 1.35;
      overflow-wrap: break-word;
    }
    .bell {
      position: relative;
    }
    .badge {
      position: absolute;
      inset-block-start: 2px;
      inset-inline-end: 2px;
      min-inline-size: 18px;
      min-block-size: 18px;
      padding: 0 5px;
      border-radius: var(--radius-lg);
      background: var(--badge-bg);
      color: var(--badge-fg);
      font-size: var(--fs-xs);
      font-weight: 800;
      line-height: 1.5;
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
        font-size: var(--fs-xl);
        letter-spacing: -0.01em;
      }
      :host-context(.admin-layout) .caption {
        font-size: var(--fs-sm);
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
      @media (hover: hover) {
        :host-context(.admin-layout) .circle:hover {
          background: var(--icon-bg);
        }
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
  protected readonly display = inject(DisplaySettings);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  readonly caption = input<string>();

  /**
   * บริบทบรรทัดบนตามบทบาท (A6) — ใช้ caption ที่หน้าส่งมา ถ้าไม่มีจึงเติมค่ากลาง:
   * เจ้าของบ้าน = ชื่อบทบาท (หน้าที่ยังไม่รู้บ้านเลขที่จะส่งเอง) · เจ้าหน้าที่/หัวหน้า = ชื่อหน่วยงาน · แอดมิน = "แอดมิน"
   */
  protected readonly context = computed(() => {
    const explicit = this.caption()?.trim();
    if (explicit) return explicit;
    const url = this.router.url;
    if (url.startsWith('/admin')) return this.i18n.t({ th: 'แอดมิน', en: 'Admin' });
    if (url.startsWith('/agency')) return this.session.me()?.agency?.name ?? this.i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' });
    if (url.startsWith('/officer')) return this.session.me()?.agency?.name ?? this.i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' });
    if (url.startsWith('/home')) return this.i18n.t({ th: 'เจ้าของบ้าน', en: 'Homeowner' });
    if (url.startsWith('/r/')) return this.i18n.t({ th: 'ไรเดอร์', en: 'Rider' });
    return 'Smart Mailbox';
  });
  readonly title = input.required<string>();
  /** URL ของหน้าแจ้งเตือน — ไม่ใส่ = ไม่มีกระดิ่ง */
  readonly bell = input<string>();
  /** URL ย้อนกลับ — ใส่สำหรับหน้าย่อย */
  readonly back = input<string>();
}
