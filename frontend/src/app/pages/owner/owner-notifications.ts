import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DisplaySettings } from '../../core/display-settings';
import { I18n } from '../../core/i18n';
import { Session } from '../../core/session';
import { screenUrl } from '../../screens/registry';
import { NotificationList } from '../../shared/notification-list';
import { PageHeader } from '../../shared/page-header';
import { PushStatus } from '../../shared/push-status';

/** H14 แจ้งเตือน — รายการจริงจาก GET /me/notifications · แตะแต่ละรายการไปหน้าที่เกี่ยวข้อง */
@Component({
  selector: 'app-owner-notifications',
  imports: [PageHeader, NotificationList, PushStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' })" [back]="url('H03')" />
    <div class="stack">
      @if (easy()) {
        <p class="muted small easy-only">{{ i18n.t({ th: 'รายการล่าสุด · แตะเพื่อดูรายละเอียด', en: 'Latest items · tap to open' }) }}</p>
      }
      <!-- C4: หน้าแจ้งเตือนย้อนหลัง = แถบบรรทัดเดียว (แบบเต็มอยู่ที่หน้าหลัก/ตั้งค่าการแจ้งเตือน) -->
      <app-push-status [compact]="true" [dismissible]="true" />
      <app-notification-list />
    </div>
  `,
})
export class OwnerNotifications {
  protected readonly i18n = inject(I18n);
  private readonly session = inject(Session);
  private readonly display = inject(DisplaySettings);
  protected readonly url = screenUrl;
  protected readonly caption = computed(() => this.session.me()?.display_name ?? '');
  protected readonly easy = this.display.easyMode;
}
