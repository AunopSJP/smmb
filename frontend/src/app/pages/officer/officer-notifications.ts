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
    </div>
  `,
})
export class OfficerNotifications {
  protected readonly i18n = inject(I18n);
  protected readonly session = inject(Session);
  protected readonly url = screenUrl;
}
