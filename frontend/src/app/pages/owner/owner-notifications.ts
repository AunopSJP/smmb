import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  imports: [PageHeader, NotificationList, PushStatus, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="caption()" [title]="i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' })" [back]="url('H03')" />
    <div class="stack">
      @if (easy()) {
        <p class="muted small easy-only">{{ i18n.t({ th: 'รายการล่าสุด · แตะเพื่อดูรายละเอียด', en: 'Latest items · tap to open' }) }}</p>
      }
      <app-push-status />
      <app-notification-list />
      @if (advanced()) {
        <p class="muted small adv-only">{{ i18n.t({ th: 'เก็บในหน้านี้แม้ push ไม่ถึง · ชนิดที่ปิดรับไว้จะไม่เก็บและไม่ส่ง · SOS/ตู้มีปัญหา/QR ปลอม ปิดไม่ได้', en: 'Items stay here even if the push did not arrive. Muted types are not stored or sent. SOS, mailbox problems and fake QR alerts cannot be muted.' }) }}</p>
        <a class="btn secondary adv-only" [routerLink]="url('H13-d')">{{ i18n.t({ th: 'ตั้งค่าการแจ้งเตือน', en: 'Notification settings' }) }}</a>
      }
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
  protected readonly advanced = this.display.advancedMode;
}
