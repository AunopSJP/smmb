import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n';
import { Session } from '../../core/session';
import { screenUrl } from '../../screens/registry';
import { NotificationList } from '../../shared/notification-list';
import { PageHeader } from '../../shared/page-header';

/** O14 แจ้งเตือนของเจ้าหน้าที่ — ดูย้อนหลังได้แม้ push ไม่ถึง (GET /me/notifications · design §10) */
@Component({
  selector: 'app-officer-notifications',
  imports: [PageHeader, NotificationList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="session.me()?.agency?.name ?? ''"
      [title]="i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' })"
      [back]="url('O01')"
    />
    <div class="stack">
      <app-notification-list />
      <p class="easy-only note">{{ i18n.t({ th: 'แตะรายการเพื่ออ่าน · เปิดแจ้งเตือนไว้ตลอดเพื่อรับ SOS', en: 'Tap an item to read · keep notifications on for SOS' }) }}</p>
      <p class="adv-only">{{ i18n.t({ th: 'เก็บในหน้านี้แม้ push ไม่ถึง · SOS/ตู้มีปัญหา/QR ปลอม ปิดรับไม่ได้', en: 'kept here even if push fails · SOS/box problem/fake QR cannot be muted' }) }}</p>
    </div>
  `,
  styles: `
    .note {
      margin: 0;
      text-align: center;
      color: var(--text-muted);
    }
    .tech {
      margin: 0;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
  `,
})
export class OfficerNotifications {
  protected readonly i18n = inject(I18n);
  protected readonly session = inject(Session);
  protected readonly url = screenUrl;
}
