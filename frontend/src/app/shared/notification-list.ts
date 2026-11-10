
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { I18n } from '../core/i18n';
import { UnreadCount } from '../core/unread';
import { Icon, type IconName } from './icon';
import { liveRefresh } from '../core/live-refresh';
import { EmptyState, LoadError, LoadingRows } from './state-view';

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
  zone_join_request: { icon: 'user', tone: 'warn' },
  zone_join_accepted: { icon: 'check', tone: 'ok' },
  zone_join_rejected: { icon: 'info', tone: '' },
  officer_new_device: { icon: 'alert', tone: 'warn' },
};

/** รายการแจ้งเตือนจริงของบัญชีนี้ — แตะแล้วไปหน้าที่เกี่ยวข้อง + ทำเครื่องหมายอ่านแล้ว · "อ่านทั้งหมด" ในแถบบน */
@Component({
  selector: 'app-notification-list',
  imports: [Icon, LoadingRows, EmptyState, LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <div class="segmented easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'กรองการแจ้งเตือน', en: 'Filter notifications' })">
        <button type="button" [attr.aria-pressed]="!onlyUnread()" (click)="onlyUnread.set(false)">{{ i18n.t({ th: 'ทั้งหมด', en: 'All' }) }}</button>
        <button type="button" [attr.aria-pressed]="onlyUnread()" (click)="onlyUnread.set(true)">
          {{ i18n.t({ th: 'ยังไม่อ่าน', en: 'Unread' }) }}
          @if (unreadCount()) {
            <span class="n">{{ unreadCount() }}</span>
          }
        </button>
      </div>
      <button type="button" class="read-all" [disabled]="!unreadCount() || marking()" (click)="readAll()">
        <app-icon name="check" [size]="16" />
        {{ i18n.t({ th: 'อ่านทั้งหมด', en: 'Mark all read' }) }}
      </button>
    </div>

    @for (g of groups(); track g.key) {
      <h2 class="day">{{ g.label }}</h2>
      <div class="feed">
        @for (n of g.items; track n.id) {
          @let l = look(n.type);
          <button type="button" class="item" [class.unread]="!n.read_at" (click)="open(n)">
            <span class="dot-icon" [class]="'tone-' + (l.tone || 'plain')">
              <app-icon [name]="l.icon" [size]="20" />
            </span>
            <span class="txt">
              <span class="top">
                <strong class="clamp-2" [attr.title]="plain(n.title)">{{ plain(n.title) }}</strong>
                <time class="easy-hide" [attr.datetime]="n.created_at">{{ when(n.created_at) }}</time>
              </span>
              <span class="body easy-hide" [attr.title]="n.body">{{ n.body || '—' }}</span>
              @if (n.link) {
                <span class="more easy-hide">{{ moreLabel(n.type) }} ›</span>
              }
            </span>
            @if (!n.read_at) {
              <span class="new" [attr.aria-label]="i18n.t({ th: 'ยังไม่อ่าน', en: 'Unread' })"></span>
            }
          </button>
        }
      </div>
    } @empty {
      @if (loading()) {
        <app-loading-rows [rows]="4" [label]="i18n.t({ th: 'กำลังโหลดการแจ้งเตือน', en: 'Loading notifications' })" />
      } @else if (loadFailed()) {
        <app-load-error (retry)="ngOnInit()" />
      } @else {
        <app-empty-state
          icon="bell"
          [title]="onlyUnread() ? i18n.t({ th: 'อ่านครบทุกรายการแล้ว', en: 'You are all caught up' }) : i18n.t({ th: 'ยังไม่มีการแจ้งเตือน', en: 'No notifications yet' })"
          [hint]="i18n.t({ th: 'การตรวจ ของมาส่ง และ SOS จะแสดงที่นี่', en: 'Patrol checks, deliveries and SOS will show up here' })"
        />
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    /* ห้ามตัดคำในแท็บกรอง (เช่น "ยังไม่อ่าน") — ให้แท็บกว้างตามข้อความแล้วค่อยตัดบรรทัดที่แถบแทน */
    .bar .segmented {
      flex: none;
    }
    .bar .segmented button {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .n {
      display: inline-grid;
      place-items: center;
      min-inline-size: 20px;
      padding: 0 6px;
      margin-inline-start: 4px;
      border-radius: 999px;
      background: var(--badge-bg);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .more {
      display: block;
      margin-block-start: 4px;
      color: var(--brand-text);
      font-size: 0.8125rem;
      font-weight: 700;
    }
    .meta {
      display: block;
      margin-block-start: 3px;
      color: var(--text-muted);
      font-size: 0.6875rem;
      overflow-wrap: break-word;
    }
    .read-all {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface);
      color: var(--brand-text);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 700;
      cursor: pointer;
    }
    .read-all[disabled] {
      color: var(--text-muted);
      opacity: 0.6;
      cursor: default;
    }
    .day {
      margin: 8px 4px 0;
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--text-muted);
    }
    .feed {
      display: flex;
      flex-direction: column;
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .item {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      inline-size: 100%;
      padding: 14px 16px;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: start;
      cursor: pointer;
    }
    .item + .item {
      border-block-start: 1px solid var(--line);
    }
    .item:hover {
      background: var(--icon-bg);
    }
    .item.unread {
      background: color-mix(in srgb, var(--brand-light) 45%, var(--surface));
    }
    .dot-icon {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 40px;
      block-size: 40px;
      border-radius: 12px;
      background: var(--icon-bg);
      color: var(--text-muted);
    }
    .tone-ok { background: var(--ok-bg); color: var(--ok); }
    .tone-warn { background: var(--warn-bg); color: var(--warn); }
    .tone-danger { background: var(--danger-bg); color: var(--sos); }
    .txt {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .top {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .top strong {
      flex: 1;
      min-inline-size: 0;
      font-weight: 600;
    }
    .unread .top strong {
      font-weight: 800;
    }
    time {
      flex: none;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .body {
      font-size: 0.875rem;
      color: var(--text-muted);
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .new {
      position: absolute;
      inset-block-start: 18px;
      inset-inline-end: 10px;
      inline-size: 8px;
      block-size: 8px;
      border-radius: 50%;
      background: var(--brand);
    }
    .unread .top {
      padding-inline-end: 10px;
    }
  `,
})
export class NotificationList implements OnInit {
  /** ตัดอีโมจิหน้าข้อความ (ข้อความจากเซิร์ฟเวอร์มีไว้ให้ push) — ระดับความสำคัญแสดงด้วยไอคอนด้านซ้ายอยู่แล้ว */
  protected plain(title: string | null | undefined): string {
    return (title ?? '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim() || '—';
  }

  protected readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly unread = inject(UnreadCount);
  protected readonly items = signal<Notification[]>([]);
  protected readonly loading = signal(true);
  /** โหลดครั้งแรกไม่สำเร็จ — ห้ามแสดง "ไม่มีการแจ้งเตือน" (อาจมี SOS) */
  protected readonly loadFailed = signal(false);
  protected readonly onlyUnread = signal(false);
  protected readonly marking = signal(false);
  protected readonly unreadCount = computed(() => this.items().filter((n) => !n.read_at).length);

  /** แบ่งตามวัน (เวลาไทย): วันนี้ · เมื่อวาน · วันที่ */
  protected readonly groups = computed(() => {
    const list = this.onlyUnread() ? this.items().filter((n) => !n.read_at) : this.items();
    const key = (d: Date) => (Number.isNaN(d.getTime()) ? 'unknown' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }));
    const today = key(new Date());
    const yesterday = key(new Date(Date.now() - 86_400_000));
    const out: { key: string; label: string; items: Notification[] }[] = [];
    for (const n of list) {
      const k = key(new Date(n.created_at));
      let g = out.find((x) => x.key === k);
      if (!g) {
        const label =
          k === 'unknown'
            ? '—'
            : k === today
              ? this.i18n.t({ th: 'วันนี้', en: 'Today' })
              : k === yesterday
                ? this.i18n.t({ th: 'เมื่อวาน', en: 'Yesterday' })
                : new Date(n.created_at).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
        g = { key: k, label, items: [] };
        out.push(g);
      }
      g.items.push(n);
    }
    return out;
  });

  /** แจ้งเตือนใหม่ขึ้นเองโดยไม่ต้องรีเฟรช */
  private readonly _live = liveRefresh(() => this.ngOnInit(), 15_000);

  async ngOnInit(): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get<{ data: Notification[] }>('/api/v1/me/notifications?per_page=50'));
      this.items.set(r.data);
      this.loadFailed.set(false);
    } catch {
      // มีข้อมูลเดิมอยู่แล้ว → คงไว้ (รอบ live refresh ล้มไม่ควรลบรายการ) · ไม่มีเลย → แสดง error+retry
      if (!this.items().length) this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** ข้อความลิงก์ใต้การแจ้งเตือน (ตามแคนวาสดีไซน์) */
  protected moreLabel(type: string | null | undefined): string {
    const t = type ?? '';
    if (t === 'inspected') return this.i18n.t({ th: 'ดูรายละเอียดการตรวจ', en: 'See inspection details' });
    if (t === 'delivered') return this.i18n.t({ th: 'ดูรายละเอียดการส่ง', en: 'See delivery details' });
    if (t.startsWith('box_') || t === 'low_battery') return this.i18n.t({ th: 'ดูสถานะตู้', en: 'See box status' });
    if (t.startsWith('sos_')) return this.i18n.t({ th: 'ดู SOS', en: 'See the SOS' });
    return this.i18n.t({ th: 'ดูรายละเอียด', en: 'See details' });
  }

  protected look(type: string | null | undefined) {
    return ICON[type ?? ''] ?? { icon: 'bell' as IconName, tone: '' as const };
  }

  /** เวลาจริง (วันที่ + เวลา วินาที) — เฉพาะโหมดละเอียด */
  protected exact(iso: string | null | undefined): string {
    const d = new Date(iso ?? '');
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok' });
  }

  /** ข้อมูลเทคนิคของรายการ (ชนิด · id · เวลา · สถานะอ่าน · ปลายทาง) — เฉพาะโหมดละเอียด */
  protected meta(n: Notification): string {
    const read = n.read_at
      ? `${this.i18n.t({ th: 'อ่านแล้ว', en: 'read' })} ${this.exact(n.read_at)}`
      : this.i18n.t({ th: 'ยังไม่อ่าน', en: 'unread' });
    return `type=${n.type ?? '—'} · id=${(n.id ?? '').slice(0, 8) || '—'} · ${this.exact(n.created_at)} · ${read}${n.link ? ` · ${n.link}` : ''}`;
  }

  /** ภายในชั่วโมง = "x นาทีที่แล้ว" · วันนี้/เมื่อวาน = เวลา · เก่ากว่านั้น = วันที่ + เวลา (หัวกลุ่มบอกวันอยู่แล้ว ใช้แค่เวลา) */
  protected when(iso: string | null | undefined): string {
    const d = new Date(iso ?? '');
    if (Number.isNaN(d.getTime())) return '—';
    const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (mins < 1) return this.i18n.t({ th: 'เมื่อสักครู่', en: 'Just now' });
    if (mins < 60) return this.i18n.t({ th: `${mins} นาทีที่แล้ว`, en: `${mins} min ago` });
    return d.toLocaleTimeString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  }

  /** POST /me/notifications/read ไม่ส่ง ids = อ่านทั้งหมด (api.md §3) */
  protected async readAll(): Promise<void> {
    if (!this.unreadCount() || this.marking()) return;
    this.marking.set(true);
    const before = this.items();
    const at = new Date().toISOString();
    this.items.update((list) => list.map((x) => (x.read_at ? x : { ...x, read_at: at })));
    try {
      await firstValueFrom(this.http.post('/api/v1/me/notifications/read', {}));
      await this.unread.refresh();
    } catch {
      this.items.set(before);
    } finally {
      this.marking.set(false);
    }
  }

  protected open(n: Notification): void {
    if (!n.read_at) {
      // อ่านแล้วทันทีบนจอ ไม่ต้องรอโหลดใหม่
      const at = new Date().toISOString();
      this.items.update((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: at } : x)));
      void firstValueFrom(this.http.post('/api/v1/me/notifications/read', { ids: [n.id] }))
        .then(() => this.unread.refresh())
        .catch(() => undefined);
    }
    if (n.link?.startsWith('/') && !n.link.startsWith('//')) void this.router.navigateByUrl(n.link);
  }
}
