import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { I18n } from '../core/i18n';
import { UnreadCount } from '../core/unread';
import { Icon, type IconName } from './icon';

/** api.md §3 `GET /me/notifications` — หัวข้อ/เนื้อความแปลที่ server ตาม prefs.lang แล้ว */
interface Notification {
  id: string;
  type: string;
  created_at: string;
  read_at: string | null;
  title: string;
  body: string;
  link: string;
}

const ICON: Record<string, { icon: IconName; tone: '' | 'warn' | 'danger' | 'ok' }> = {
  inspected: { icon: 'shield', tone: 'ok' },
  delivered: { icon: 'box', tone: 'warn' },
  sos_new: { icon: 'alert', tone: 'danger' },
  sos_taken: { icon: 'info', tone: '' },
  sos_accepted: { icon: 'check', tone: 'ok' },
  sos_closed: { icon: 'check', tone: 'ok' },
  sos_cancelled: { icon: 'info', tone: '' },
  box_problem: { icon: 'alert', tone: 'warn' },
  box_offline: { icon: 'alert', tone: 'warn' },
  box_silent_26h: { icon: 'alert', tone: 'warn' },
  box_service_closed: { icon: 'alert', tone: 'warn' },
  box_service_opened: { icon: 'check', tone: 'ok' },
  box_unbound: { icon: 'info', tone: 'warn' },
  low_battery: { icon: 'alert', tone: 'warn' },
  qr_fake: { icon: 'scan', tone: 'danger' },
  member_pending: { icon: 'user', tone: '' },
  member_approved: { icon: 'check', tone: 'ok' },
  member_rejected: { icon: 'info', tone: '' },
  agency_pending: { icon: 'user', tone: '' },
  swap_backup_qr: { icon: 'scan', tone: 'danger' },
  qr_health: { icon: 'scan', tone: 'warn' },
  test: { icon: 'bell', tone: '' },
  agency_approved: { icon: 'check', tone: 'ok' },
  agency_rejected: { icon: 'info', tone: '' },
};

/** รายการแจ้งเตือนจริงของบัญชีนี้ — แตะแล้วไปหน้าที่เกี่ยวข้อง + ทำเครื่องหมายอ่านแล้ว */
@Component({
  selector: 'app-notification-list',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="list">
      @for (n of items(); track n.id) {
        @let l = look(n.type);
        <button type="button" class="row" [class.unread]="!n.read_at" (click)="open(n)">
          <span class="icon-bubble" [class.warn]="l.tone === 'warn'" [class.danger]="l.tone === 'danger'" [class.ok]="l.tone === 'ok'">
            <app-icon [name]="l.icon" [size]="20" />
          </span>
          <span class="grow">
            <strong>{{ n.title }}</strong>
            <span class="muted small block">{{ n.body }} · {{ when(n.created_at) }}</span>
          </span>
        </button>
      } @empty {
        <p class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ยังไม่มีการแจ้งเตือน', en: 'No notifications yet' }) }}</p>
      }
    </nav>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    .block {
      display: block;
    }
    button.row {
      width: 100%;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
    .row.unread strong::before {
      content: '● ';
      color: var(--brand);
    }
    .icon-bubble.ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
  `,
})
export class NotificationList implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly unread = inject(UnreadCount);
  protected readonly items = signal<Notification[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get<{ data: Notification[] }>('/api/v1/me/notifications?per_page=50'));
      this.items.set(r.data);
    } catch {
      // แสดงว่าง
    } finally {
      this.loading.set(false);
    }
  }

  protected look(type: string) {
    return ICON[type] ?? { icon: 'bell' as IconName, tone: '' as const };
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  }

  protected open(n: Notification): void {
    if (!n.read_at) {
      void firstValueFrom(this.http.post('/api/v1/me/notifications/read', { ids: [n.id] }))
        .then(() => this.unread.refresh())
        .catch(() => undefined);
    }
    if (n.link?.startsWith('/') && !n.link.startsWith('//')) void this.router.navigateByUrl(n.link);
  }
}
