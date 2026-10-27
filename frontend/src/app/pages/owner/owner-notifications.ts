import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { MOCK_OWNER, MOCK_OWNER_NOTIFICATIONS, type OwnerNotificationKind } from '../../core/mock/mock-data';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

const LOOK: Record<OwnerNotificationKind, { icon: IconName; tone: '' | 'warn' | 'danger' | 'ok' }> = {
  inspected: { icon: 'shield', tone: '' },
  delivered: { icon: 'box', tone: 'warn' },
  swap_backup_qr: { icon: 'scan', tone: 'danger' },
  box_offline: { icon: 'alert', tone: 'warn' },
  low_battery: { icon: 'alert', tone: '' },
  sos_closed: { icon: 'check', tone: 'ok' },
};

/** H14 แจ้งเตือน — แตะแต่ละรายการไปหน้าที่เกี่ยวข้อง */
@Component({
  selector: 'app-owner-notifications',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + house"
      [title]="i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' })"
      [back]="url('H03')"
    />
    <div class="stack">
      <nav class="list">
        @for (n of items; track n.id) {
          @let l = look[n.kind];
          <a class="row" [routerLink]="url(n.open)" [queryParams]="n.history_id ? { id: n.history_id } : null">
            <span class="icon-bubble" [class.warn]="l.tone === 'warn'" [class.danger]="l.tone === 'danger'" [class.ok]="l.tone === 'ok'">
              <app-icon [name]="l.icon" [size]="20" />
            </span>
            <span class="grow">
              <strong>{{ th() ? n.title : n.title_en }}</strong>
              <span class="muted small block">{{ th() ? n.body : n.body_en }}</span>
            </span>
          </a>
        }
      </nav>
      <p class="muted small">{{ i18n.t({ th: 'แตะรายการเพื่อดูรายละเอียด', en: 'Tap an item for details' }) }}</p>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .icon-bubble.ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
  `,
})
export class OwnerNotifications {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly house = MOCK_OWNER.house_no;
  protected readonly items = MOCK_OWNER_NOTIFICATIONS;
  protected readonly look = LOOK;
  protected th(): boolean {
    return this.i18n.lang() === 'th';
  }
}
