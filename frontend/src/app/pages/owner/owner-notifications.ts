import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../core/i18n';
import { Session } from '../../core/session';
import { screenUrl } from '../../screens/registry';
import { NotificationList } from '../../shared/notification-list';
import { PageHeader } from '../../shared/page-header';

/** H14 แจ้งเตือน — รายการจริงจาก GET /me/notifications · แตะแต่ละรายการไปหน้าที่เกี่ยวข้อง */
@Component({
  selector: 'app-owner-notifications',
  imports: [PageHeader, NotificationList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="caption()" [title]="i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' })" [back]="url('H03')" />
    <div class="stack">
      <app-notification-list />
    </div>
  `,
})
export class OwnerNotifications {
  protected readonly i18n = inject(I18n);
  private readonly session = inject(Session);
  protected readonly url = screenUrl;
  protected readonly caption = computed(() => this.session.me()?.display_name ?? '');
}
