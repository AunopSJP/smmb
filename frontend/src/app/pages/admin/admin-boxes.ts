import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiConfig, apiError } from '../../core/api';
import { AdminApi, type BeepPattern, type AdminBoxDetail, type BoxConfigOverride, type AdminBoxRow, type FirmwareInfo, type RegisteredBox } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { minutesAgo, type BoxStatus } from '../../core/owner-api';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { BoxTest } from '../../shared/box-test';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { QrImage } from '../../shared/qr-image';

// แอดมิน: D03 ตู้ทั้งหมด + ลงทะเบียนตู้ใหม่ · D04 รายละเอียดตู้ (QR จริง · ทดสอบปลุกตู้ · รหัสลับเขียนลงบอร์ด) — api.md §9.4

type Tone = '' | 'ok' | 'warn' | 'danger';
export const LOW_BATTERY_PCT = 20;

const STATUS: Record<BoxStatus, { label: Tr; tone: Tone }> = {
  online: { label: { th: 'ออนไลน์', en: 'Online' }, tone: 'ok' },
  sleeping: { label: { th: 'พักอยู่', en: 'Sleeping' }, tone: '' },
  offline: { label: { th: 'ไม่ออนไลน์', en: 'Offline' }, tone: 'danger' },
  service_closed: { label: { th: 'ปิดบริการ', en: 'Closed' }, tone: '' },
  unbound: { label: { th: 'ยังไม่ผูก', en: 'Unbound' }, tone: '' },
};

/** ป้ายสถานะตู้ — แบตต่ำแทนออนไลน์/พักอยู่ */
export function boxBadge(b: Pick<AdminBoxRow, 'status' | 'battery'>): { label: Tr; tone: Tone } {
  if ((b.status === 'online' || b.status === 'sleeping') && b.battery && b.battery.pct < LOW_BATTERY_PCT) {
    return { label: { th: 'แบตต่ำ', en: 'Low battery' }, tone: 'warn' };
  }
  return STATUS[b.status];
}

/** "ไม่เคยติดต่อ" / "5 นาทีที่แล้ว" */
export function seenText(iso: string | null): Tr {
  const m = minutesAgo(iso);
  if (m === null) return { th: 'ยังไม่เคยติดต่อ', en: 'never connected' };
  if (m < 1) return { th: 'เมื่อสักครู่', en: 'just now' };
  if (m < 60) return { th: `${m} นาทีที่แล้ว`, en: `${m} min ago` };
  if (m < 1440) return { th: `${Math.floor(m / 60)} ชม.ที่แล้ว`, en: `${Math.floor(m / 60)} h ago` };
  return { th: `${Math.floor(m / 1440)} วันที่แล้ว`, en: `${Math.floor(m / 1440)} d ago` };
}

const SLOT_LABEL: Record<string, Tr> = {
  '1': { th: 'QR หน้าตู้', en: 'Front QR' },
  '2': { th: 'QR สำรอง', en: 'Backup QR' },
  activate: { th: 'QR เปิดใช้ตู้', en: 'Activation QR' },
};

type BoxFilter = 'all' | 'unbound' | 'offline' | 'low';
type SortKey = 'id' | 'status' | 'battery' | 'seen';
/** เรียงสถานะ: ที่ต้องดูแลขึ้นก่อน */
const STATUS_ORDER: Record<BoxStatus, number> = { offline: 0, service_closed: 1, unbound: 2, sleeping: 3, online: 4 };

// ── D03 · ตู้ทั้งหมด ─────────────────────────────────────────

@Component({
  selector: 'app-admin-boxes',
  imports: [RouterLink, PageHeader, Icon, QrImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'แอดมิน Smart Mailbox', en: 'Smart Mailbox admin' })"
      [title]="i18n.t({ th: 'ตู้ทั้งหมด', en: 'All mailboxes' })"
      [bell]="url('D12')"
    />
    <div class="stack">
      @if (created().length) {
        <section class="card stack new">
          <h2 class="section-title">{{ i18n.t({ th: 'ลงทะเบียนแล้ว — จดรหัสลับไปเขียนลงบอร์ด', en: 'Registered — copy the secret onto the board' }) }}</h2>
          @for (b of created(); track b.box_id) {
            <div class="stack reg">
              <strong>{{ b.box_id }}</strong>
              <code class="secret">{{ b.device_secret }}</code>
              <div class="qr-grid">
                @for (q of b.qr; track q.slot) {
                  <figure>
                    <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
                    <figcaption class="small">{{ i18n.t(slot(q.slot)) }}<br /><strong>{{ q.print_code }}</strong></figcaption>
                  </figure>
                }
              </div>
            </div>
          }
          <button type="button" class="btn secondary" (click)="created.set([])">{{ i18n.t({ th: 'จดแล้ว ปิด', en: 'Done, close' }) }}</button>
        </section>
      }

      <div class="toolbar">
        <label class="search-box">
          <app-icon name="search" [size]="18" />
          <input type="search" [placeholder]="i18n.t({ th: 'ค้นรหัสตู้ / บ้านเลขที่', en: 'Search box id / house no.' })" [value]="q()" (input)="q.set($any($event.target).value)" />
        </label>
        <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'กรอง', en: 'Filter' })">
          @for (f of filters; track f.v) {
            <button type="button" [attr.aria-pressed]="filter() === f.v" (click)="filter.set(f.v)">{{ i18n.t(f.label) }} <span class="n">{{ counts()[f.v] }}</span></button>
          }
        </div>
        <form class="add" (submit)="$event.preventDefault(); register()">
          <label class="count">
            <span class="muted small">{{ i18n.t({ th: 'ลงทะเบียนตู้ใหม่', en: 'Register boxes' }) }}</span>
            <input type="number" min="1" max="50" inputmode="numeric" [value]="count()" (input)="count.set(+$any($event.target).value)" [attr.aria-label]="i18n.t({ th: 'จำนวนตู้', en: 'Count' })" />
          </label>
          <button type="submit" class="btn" [disabled]="busy() || count() < 1 || count() > 50">
            <app-icon name="plus" [size]="18" />{{ i18n.t({ th: 'สร้าง', en: 'Create' }) }}
          </button>
        </form>
      </div>
      <div class="list">
        <div class="list-head cols desktop-only">
          @for (h of heads; track h.key) {
            <button type="button" class="th" [attr.aria-sort]="sortKey() === h.key ? (sortDir() === 'asc' ? 'ascending' : 'descending') : 'none'" (click)="sortBy(h.key)">
              {{ i18n.t(h.label) }}<span class="arrow" aria-hidden="true">{{ sortKey() === h.key ? (sortDir() === 'asc' ? '▲' : '▼') : '' }}</span>
            </button>
          }
          <span></span>
        </div>
        @for (b of rows(); track b.id) {
          @let badge = boxBadge(b);
          <a class="row cols" [routerLink]="url('D04')" [queryParams]="{ id: b.id }">
            <span class="who">
              <span class="grow">
                <strong>{{ b.id }}</strong>
                <span class="muted small block">{{ b.house_no ?? i18n.t({ th: 'ยังไม่ผูกบ้าน', en: 'Not linked to a house' }) }}</span>
              </span>
            </span>
            <span>
              <span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">
                {{ i18n.t(badge.label) }}
              </span>
            </span>
            <span class="batt" [class.low]="!!b.battery && b.battery.pct < lowPct">
              @if (b.battery) {
                <span class="bar" aria-hidden="true"><i [style.width.%]="b.battery.pct"></i></span>{{ b.battery.pct }}%
              } @else {
                <span class="muted">—</span>
              }
            </span>
            <span class="muted small">{{ i18n.t(seen(b.last_seen_at)) }}</span>
            <span class="go desktop-only">{{ i18n.t({ th: 'เปิด', en: 'Open' }) }}</span>
          </a>
        } @empty {
          <p class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ไม่มีตู้ในกลุ่มนี้', en: 'No mailboxes here' }) }}</p>
        }
      </div>
      <p class="muted small">{{ i18n.t({ th: 'ทั้งหมด ' + total() + ' ตู้', en: total() + ' mailboxes' }) }}</p>
    </div>
  `,
  styles: `
    .status {
      margin: 0 0 12px;
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      background: var(--icon-bg);
      color: var(--text-muted);
      font-weight: 700;
    }
    .status.ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
    .status.warn {
      background: var(--warn-bg, var(--icon-bg));
      color: var(--warn, var(--text));
    }
    .status.danger {
      background: var(--danger-bg, var(--icon-bg));
      color: var(--danger, var(--sos));
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 16px;
    }
    .search-box {
      flex: 1 1 260px;
      display: flex;
      align-items: center;
      gap: 8px;
      min-block-size: 44px;
      padding: 0 12px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text-muted);
    }
    .search-box:focus-within {
      border-color: var(--brand);
    }
    .search-box input {
      flex: 1;
      min-inline-size: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text);
      font: inherit;
    }
    .add {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-inline-start: auto;
    }
    .count {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .count input {
      inline-size: 64px;
      min-block-size: 40px;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      text-align: center;
    }
    .add .btn {
      inline-size: auto;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 12px;
      min-inline-size: 0;
    }
    .batt {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-variant-numeric: tabular-nums;
    }
    .batt.low {
      color: var(--warn);
      font-weight: 700;
    }
    .bar {
      inline-size: 56px;
      block-size: 6px;
      border-radius: 3px;
      background: var(--icon-bg);
      overflow: hidden;
    }
    .bar i {
      display: block;
      block-size: 100%;
      background: var(--ok);
    }
    .low .bar i {
      background: var(--orange-line);
    }
    .go {
      color: var(--brand);
      font-weight: 600;
      justify-self: end;
    }
    .n {
      margin-inline-start: 4px;
      font-variant-numeric: tabular-nums;
      opacity: 0.75;
    }
    .th {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      text-align: start;
    }
    .th:hover {
      color: var(--text);
    }
    .arrow {
      font-size: 0.625rem;
    }
    /* มือถือ: สองบรรทัด (ชื่อ+สถานะ / แบต+ติดต่อล่าสุด) · จอคอม: คอลัมน์แบบตาราง */
    .cols {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px 12px;
      align-items: center;
    }
    .cols > :nth-child(4) {
      justify-self: end;
    }
    @media (min-inline-size: 1024px) {
      .cols > :nth-child(4) {
        justify-self: start;
      }
    }
    @media (min-inline-size: 1024px) {
      .cols {
        display: grid;
        grid-template-columns: minmax(0, 2.2fr) 140px 150px minmax(0, 1.4fr) 28px;
        gap: 16px;
        align-items: center;
      }
    }
    .new {
      box-shadow: inset 0 0 0 2px var(--ok);
    }
    .secret {
      word-break: break-all;
      font-size: 0.8125rem;
      background: var(--icon-bg);
      padding: 6px 8px;
      border-radius: var(--radius-sm);
    }
    .qr-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
      gap: 8px;
      figure {
        margin: 0;
        text-align: center;
      }
      app-qr-image {
        background: #fff;
      }
    }
    @media (max-inline-size: 420px) {
      .add {
        inline-size: 100%;
        margin-inline-start: 0;
      }
      .add .btn {
        flex: 1;
      }
    }
  `,
})
export class AdminBoxes implements OnInit {
  protected readonly lowPct = LOW_BATTERY_PCT;
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly boxBadge = boxBadge;
  protected readonly seen = seenText;
  protected readonly slot = (s: string | number) => SLOT_LABEL[String(s)];

  /** ?filter=low|offline จากหน้าแจ้งเตือน */
  readonly filterParam = input<string | undefined>(undefined, { alias: 'filter' });
  protected readonly filter = signal<BoxFilter>('all');
  protected readonly filters: { v: BoxFilter; label: Tr }[] = [
    { v: 'all', label: { th: 'ทั้งหมด', en: 'All' } },
    { v: 'unbound', label: { th: 'ยังไม่ผูก', en: 'Unbound' } },
    { v: 'offline', label: { th: 'ไม่ออนไลน์', en: 'Offline' } },
    { v: 'low', label: { th: 'แบตต่ำ', en: 'Low battery' } },
  ];
  protected readonly boxes = signal<AdminBoxRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly q = signal('');
  protected readonly count = signal(1);
  protected readonly busy = signal(false);
  protected readonly created = signal<RegisteredBox[]>([]);

  private readonly matches = (f: BoxFilter, b: AdminBoxRow): boolean =>
    f === 'unbound' ? b.status === 'unbound' : f === 'offline' ? b.status === 'offline' : f === 'low' ? !!b.battery && b.battery.pct < LOW_BATTERY_PCT : true;

  /** จำนวนในแต่ละตัวกรอง (ไม่ขึ้นกับคำค้น) */
  protected readonly counts = computed<Record<BoxFilter, number>>(() => {
    const all = this.boxes();
    return {
      all: all.length,
      unbound: all.filter((b) => this.matches('unbound', b)).length,
      offline: all.filter((b) => this.matches('offline', b)).length,
      low: all.filter((b) => this.matches('low', b)).length,
    };
  });

  protected readonly heads: { key: SortKey; label: Tr }[] = [
    { key: 'id', label: { th: 'ตู้', en: 'Box' } },
    { key: 'status', label: { th: 'สถานะ', en: 'Status' } },
    { key: 'battery', label: { th: 'แบตเตอรี่', en: 'Battery' } },
    { key: 'seen', label: { th: 'ติดต่อล่าสุด', en: 'Last seen' } },
  ];
  /** ค่าเริ่มต้น: เรียงตามสถานะ ให้ตู้ที่มีปัญหาขึ้นก่อน */
  protected readonly sortKey = signal<SortKey>('status');
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');

  protected sortBy(k: SortKey): void {
    if (this.sortKey() === k) this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      this.sortKey.set(k);
      this.sortDir.set('asc');
    }
  }

  protected readonly rows = computed(() => {
    const f = this.filter();
    const q = this.q().trim().toLowerCase();
    const list = this.boxes().filter((b) => this.matches(f, b) && (!q || b.id.toLowerCase().includes(q) || (b.house_no ?? '').toLowerCase().includes(q)));
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const value = (b: AdminBoxRow): string | number => {
      switch (this.sortKey()) {
        case 'id':
          return b.id;
        case 'status':
          return STATUS_ORDER[b.status];
        case 'battery':
          return b.battery?.pct ?? 101; // ไม่มีข้อมูล = ท้ายสุดเมื่อเรียงน้อย→มาก
        case 'seen':
          return b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      }
    };
    return [...list].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id)) * dir;
    });
  });

  ngOnInit(): void {
    const f = this.filterParam();
    if (f === 'offline' || f === 'low' || f === 'unbound') this.filter.set(f);
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const r = await this.api.boxes();
      this.boxes.set(r.data);
      this.total.set(r.total);
    } finally {
      this.loading.set(false);
    }
  }

  /** POST /admin/boxes { count } → รหัสลับ + QR ชุดแรก (พิมพ์ได้จากหน้านี้หรือ D04) */
  protected async register(): Promise<void> {
    this.busy.set(true);
    try {
      this.created.set(await this.api.registerBoxes(this.count()));
      this.toast.show({ th: 'ลงทะเบียนตู้แล้ว', en: 'Boxes registered' });
      await this.load();
    } catch {
      this.toast.show({ th: 'สร้างไม่ได้ ลองใหม่', en: 'Couldn’t create — try again' });
    } finally {
      this.busy.set(false);
    }
  }
}

// ── D04 · รายละเอียดตู้ ─────────────────────────────────────

@Component({
  selector: 'app-admin-box',
  imports: [RouterLink, PageHeader, QrImage, BoxTest],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="id() ?? ''" [title]="i18n.t({ th: 'ตู้ ', en: 'Mailbox ' }) + (box()?.house_no ?? id() ?? '')" [back]="url('D03')" />
    @if (box(); as b) {
      @let badge = boxBadge(b);
      <section class="kpis" [attr.aria-label]="i18n.t({ th: 'สรุปตู้', en: 'Box summary' })">
        <div class="kpi">
          <span class="kpi-label">{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</span>
          <span class="kpi-value"><span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">{{ i18n.t(badge.label) }}</span></span>
          <span class="kpi-hint">{{ i18n.t(seen(b.last_seen_at)) }}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">{{ i18n.t({ th: 'แบตเตอรี่', en: 'Battery' }) }}</span>
          <span class="kpi-value" [class.warn]="!!b.battery && b.battery.pct < lowPct">{{ b.battery ? b.battery.pct + '%' : '—' }}</span>
          <span class="kpi-hint">{{ b.battery?.charging ? i18n.t({ th: 'ชาร์จอยู่', en: 'charging' }) : i18n.t({ th: 'ไม่ได้ชาร์จ', en: 'not charging' }) }}</span>
        </div>
        <button type="button" class="kpi click" (click)="tab.set('settings')">
          <span class="kpi-label">{{ i18n.t({ th: 'บริการ', en: 'Service' }) }}</span>
          <span class="kpi-value" [class.danger]="!b.service_active">{{ b.service_active ? i18n.t({ th: 'เปิด', en: 'On' }) : i18n.t({ th: 'ปิด', en: 'Off' }) }}</span>
          <span class="kpi-hint">{{ i18n.t({ th: 'กดเพื่อเปลี่ยน', en: 'tap to change' }) }}</span>
        </button>
        <button type="button" class="kpi click" (click)="tab.set('firmware')">
          <span class="kpi-label">{{ i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' }) }}</span>
          <span class="kpi-value">{{ b.fw ?? '—' }}</span>
          <span class="kpi-hint" [class.warn-text]="b.fw_stuck">{{ b.fw_stuck ? i18n.t({ th: 'อัปเดตค้าง · กดดู', en: 'update stuck · tap' }) : b.fw_target ? i18n.t({ th: 'รออัปเดตเป็น ', en: 'updating to ' }) + b.fw_target : i18n.t({ th: 'กดเพื่ออัปเดต', en: 'tap to update' }) }}</span>
        </button>
        <div class="kpi">
          <span class="kpi-label">{{ i18n.t({ th: 'ค่าตั้งค่า', en: 'Config' }) }}</span>
          <span class="kpi-value" [class.warn]="!b.config.in_sync">{{ b.config.in_sync ? i18n.t({ th: 'ล่าสุด', en: 'Current' }) : i18n.t({ th: 'รอดึงค่า', en: 'Pending' }) }}</span>
          <span class="kpi-hint">{{ b.config.in_sync ? i18n.t({ th: 'ตู้มีค่าตั้งค่าล่าสุดแล้ว', en: 'the box has the latest settings' }) : i18n.t({ th: 'รอตู้ดึงค่าใหม่ตอนติดต่อรอบหน้า', en: 'it picks them up on its next contact' }) }}</span>
        </div>
      </section>

      <div class="tabs" role="tablist" [attr.aria-label]="i18n.t({ th: 'หมวดของตู้', en: 'Box sections' })">
        @for (t of tabs; track t.v) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.v" [class.on]="tab() === t.v" (click)="tab.set(t.v)">{{ i18n.t(t.label) }}</button>
        }
      </div>

      @if (b.wifi_reset.status === 'pending' || b.wifi_reset.status === 'expired') {
        <div class="info-box" role="status">
          @if (b.wifi_reset.status === 'pending') {
            <strong>{{ i18n.t({ th: 'รอตู้รับคำสั่งลืม Wi-Fi', en: 'Waiting for the box to forget its Wi-Fi' }) }}</strong>
            <span class="small block">{{ i18n.t({ th: 'ตู้ต้องออนไลน์ถึงจะรับ (หมดอายุใน 24 ชั่วโมง) · รับแล้วตู้จะเปิด Wi-Fi ', en: 'The box must be online to take it (expires in 24 h) · then it opens the Wi-Fi ' }) }}<code>{{ b.wifi_reset.ap_name }}</code></span>
            <button type="button" class="btn secondary fw-act" [disabled]="resetBusy()" (click)="cancelWifiReset()">{{ i18n.t({ th: 'ยกเลิกคำสั่ง', en: 'Cancel the request' }) }}</button>
          } @else {
            <strong class="warn-text">{{ i18n.t({ th: 'คำสั่งลืม Wi-Fi หมดอายุ — ไม่มีตู้รับภายใน 24 ชั่วโมง', en: 'The Wi-Fi reset expired — the box did not take it within 24 h' }) }}</strong>
            <button type="button" class="btn secondary fw-act" [disabled]="resetBusy()" (click)="requestWifiReset()">{{ i18n.t({ th: 'สั่งใหม่', en: 'Send again' }) }}</button>
          }
        </div>
      }

      <div class="stack grow">
        @if (tab() === 'overview') {
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt>
            <dd><span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">{{ i18n.t(badge.label) }}</span></dd>
            <dt>{{ i18n.t({ th: 'บ้าน', en: 'House' }) }}</dt>
            <dd>{{ b.bound ? (b.house_no + (b.name ? ' · ' + b.name : '')) : i18n.t({ th: 'ยังไม่ผูก', en: 'not bound' }) }}</dd>
            <dt>{{ i18n.t({ th: 'แบต', en: 'Battery' }) }}</dt>
            <dd>{{ b.battery ? b.battery.pct + '%' + (b.battery.charging ? i18n.t({ th: ' · ชาร์จอยู่', en: ' · charging' }) : '') : '—' }}</dd>
            <dt>{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last seen' }) }}</dt>
            <dd>{{ i18n.t(seen(b.last_seen_at)) }}</dd>
            <dt>{{ i18n.t({ th: 'ถือ long-poll ล่าสุด', en: 'Last long-poll' }) }}</dt>
            <dd>{{ i18n.t(seen(b.last_poll_at)) }}</dd>
            <dt>{{ i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' }) }}</dt>
            <dd>{{ b.fw ?? '—' }}</dd>
            <dt>{{ i18n.t({ th: 'ค่าตั้งค่า', en: 'Config' }) }}</dt>
            <dd [class.warn-text]="!b.config.in_sync">
              v{{ b.config.config_ver }}
              {{ b.config.in_sync ? i18n.t({ th: '(ตู้มีค่าล่าสุด)', en: '(up to date)' }) : i18n.t({ th: '(รอตู้ดึงค่าใหม่)', en: '(waiting for the box)' }) }}
            </dd>
            <dt>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</dt>
            <dd>{{ windows(b) }}</dd>
          </dl>
        </section>
        }
        @if (tab() === 'settings') {
        <section class="card">
          <details class="override" open>
            <summary>{{ i18n.t({ th: 'ตั้งค่าเฉพาะตู้นี้ (ทับค่ากลาง)', en: 'This box only (overrides the shared settings)' }) }}</summary>
            <p class="muted small">{{ i18n.t({ th: 'เว้นว่าง = ใช้ค่ากลาง · เช่น ตู้สัญญาณแย่ให้ long-poll สั้นลง', en: 'Leave blank to use the shared value · e.g. shorten long-poll for a weak-signal box' }) }}</p>
            <label class="field">
              <span>{{ i18n.t({ th: 'เวลารายงานรายวัน', en: 'Daily report time' }) }} · {{ b.config.config.report_at }}</span>
              <input type="time" [value]="ovReport()" (input)="ovReport.set($any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'เวลาสแกน QR ต่อครั้ง (วินาที 10–60)', en: 'QR scan time per try (s, 10–60)' }) }} · {{ b.config.config.scan_timeout_s }}</span>
              <input inputmode="numeric" [value]="ovScan()" (input)="ovScan.set($any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'ลองสแกนได้กี่ครั้ง (1–5)', en: 'Scan attempts (1–5)' }) }} · {{ b.config.config.max_attempts }}</span>
              <input inputmode="numeric" [value]="ovAttempts()" (input)="ovAttempts.set($any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'รอ long-poll ต่อรอบ (วินาที 20–55)', en: 'Long-poll wait (s, 20–55)' }) }} · {{ b.config.config.longpoll_wait_s }}</span>
              <input inputmode="numeric" [value]="ovLongpoll()" (input)="ovLongpoll.set($any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'เปิดไฟแฟลชเมื่อมืด', en: 'Flash when dark' }) }} · {{ b.config.config.flash_when_dark ? i18n.t({ th: 'เปิด', en: 'on' }) : i18n.t({ th: 'ปิด', en: 'off' }) }}</span>
              <select [value]="ovFlash()" (change)="ovFlash.set($any($event.target).value)">
                <option value="">{{ i18n.t({ th: 'ใช้ค่ากลาง', en: 'Shared value' }) }}</option>
                <option value="on">{{ i18n.t({ th: 'เปิด', en: 'On' }) }}</option>
                <option value="off">{{ i18n.t({ th: 'ปิด', en: 'Off' }) }}</option>
              </select>
            </label>
            @if (ovError(); as e) {
              <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
            }
            <button type="button" class="btn" [disabled]="savingOverride()" (click)="saveOverride()">{{ i18n.t({ th: 'บันทึกค่าเฉพาะตู้', en: 'Save box settings' }) }}</button>
          </details>
          <p class="muted small">{{ i18n.t({ th: 'คืนค่าการตั้งค่าเฉพาะตู้นี้ เช่น เวลารายงาน การอ่าน QR และ long-poll ให้ใช้ค่ากลาง · เวลาตรวจยังมาจากโซน', en: 'Restore this box’s report, QR scan, and long-poll settings to shared defaults · patrol hours still come from its zones' }) }}</p>
          <button type="button" class="btn secondary" [disabled]="resettingConfig()" (click)="resetConfig()">
            {{ resettingConfig() ? i18n.t({ th: 'กำลังรีเซ็ต…', en: 'Resetting…' }) : i18n.t({ th: 'คืนค่าการตั้งค่าตู้นี้', en: 'Restore this box’s settings' }) }}
          </button>
        </section>

        <h2 class="section-title">{{ i18n.t({ th: 'การให้บริการ', en: 'Service' }) }}</h2>
        <section class="card stack">
          <div class="fw-now">
            <span class="muted">{{ i18n.t({ th: 'สถานะบริการ', en: 'Service status' }) }}</span>
            <span class="chip" [class.ok]="b.service_active" [class.danger]="!b.service_active">
              {{ b.service_active ? i18n.t({ th: 'เปิดบริการ', en: 'In service' }) : i18n.t({ th: 'ปิดบริการ', en: 'Switched off' }) }}
            </span>
          </div>
          @if (!b.service_active && b.service_reason) {
            <p class="small">{{ i18n.t({ th: 'เหตุผล: ', en: 'Reason: ' }) }}{{ b.service_reason }}</p>
          }
          @if (b.service_active) {
            <p class="muted small">{{ i18n.t({ th: 'ปิดแล้วเจ้าหน้าที่ตรวจตู้นี้ไม่ได้ ไรเดอร์เห็นหน้า "ตู้ปิดบริการ" และเจ้าของบ้านได้รับแจ้งเตือน', en: 'Officers cannot check a switched-off box, riders see “out of service”, and the owner is notified' }) }}</p>
            <label class="field">
              <span>{{ i18n.t({ th: 'เหตุผล (ไม่บังคับ)', en: 'Reason (optional)' }) }}</span>
              <input maxlength="200" [value]="serviceReason()" (input)="serviceReason.set($any($event.target).value)" />
            </label>
            <button type="button" class="btn secondary danger-outline" [disabled]="serviceBusy()" (click)="setService(false)">
              {{ i18n.t({ th: 'ปิดบริการตู้นี้', en: 'Switch this box off' }) }}
            </button>
          } @else {
            <button type="button" class="btn" [disabled]="serviceBusy()" (click)="setService(true)">
              {{ i18n.t({ th: 'เปิดบริการตู้นี้อีกครั้ง', en: 'Switch this box back on' }) }}
            </button>
          }
        </section>

        }
        @if (tab() === 'danger') {
        @if (returned(); as r) {
          <section class="card stack done" role="status">
            <h2 class="section-title">{{ i18n.t({ th: 'คืนตู้เป็นตู้ใหม่แล้ว — ทำต่อที่หน้างานตามนี้', en: 'The box is back to “new” — finish on site' }) }}</h2>
            <ol class="checklist">
              @if (r.wifi_reset) {
                <li>{{ i18n.t({ th: 'รอให้ตู้ออนไลน์ แล้วตู้จะรับคำสั่งลืม Wi-Fi และเปิด Wi-Fi ', en: 'Wait for the box to be online — it takes the command and opens the Wi-Fi ' }) }}<code>{{ r.ap_name }}</code> <span class="muted small">({{ i18n.t({ th: 'ดูสถานะที่แถบด้านบน', en: 'status is shown at the top' }) }})</span></li>
                <li>{{ i18n.t({ th: 'ต่อมือถือเข้า Wi-Fi นั้น แล้วตั้ง Wi-Fi บ้านใหม่ในหน้าตั้งค่าที่เด้งขึ้น', en: 'Join that Wi-Fi with a phone and set the new home Wi-Fi on the page that opens' }) }}</li>
              } @else {
                <li>{{ i18n.t({ th: 'ตู้ยังใช้ Wi-Fi เดิมอยู่ — ถ้าต้องเปลี่ยน ให้กด "สั่งตู้ลืม Wi-Fi" ด้านล่าง', en: 'The box keeps its old Wi-Fi — press “Make the box forget its Wi-Fi” below if it must change' }) }}</li>
              }
              <li>{{ i18n.t({ th: 'พิมพ์ QR เปิดใช้ตู้ใบใหม่ (แท็บ "QR และบอร์ด") ให้เจ้าของคนใหม่', en: 'Print the new activation QR (tab “QR & board”) for the new owner' }) }}</li>
              <li>{{ i18n.t({ th: 'เจ้าของใหม่สมัคร/ล็อกอินแล้วสแกน QR เปิดใช้ตู้ และกรอกบ้านเลขที่', en: 'The new owner signs in, scans the activation QR and enters the house number' }) }}</li>
            </ol>
            <div class="actions">
              <button type="button" class="btn" (click)="tab.set('qr'); returned.set(null)">{{ i18n.t({ th: 'ไปพิมพ์ QR เปิดใช้ตู้', en: 'Go print the activation QR' }) }}</button>
              <button type="button" class="btn secondary" (click)="returned.set(null)">{{ i18n.t({ th: 'ปิด', en: 'Dismiss' }) }}</button>
            </div>
          </section>
        }

        @if (b.bound) {
          <h2 class="section-title">{{ i18n.t({ th: 'คืนตู้เป็นตู้ใหม่ (ขายบ้าน / ย้ายออก)', en: 'Return the box as new (house sold / moved out)' }) }}</h2>
          <section class="card stack">
            <p class="small"><strong>{{ i18n.t({ th: 'กดแล้วเกิดอะไรขึ้น', en: 'What happens' }) }}</strong></p>
            <ul class="effects">
              <li>{{ i18n.t({ th: 'ตู้กลับเป็น "ยังไม่ผูก" — เจ้าของเดิมไม่เห็นตู้นี้อีกและได้รับแจ้งเตือน', en: 'The box becomes “not bound” — the old owner no longer sees it and is notified' }) }}</li>
              <li>{{ i18n.t({ th: 'ถอดออกจากทุกโซน · ล้างบ้านเลขที่ ชื่อ ย่าน · ล้างค่าที่ตั้งเฉพาะตู้ (ใช้ค่ากลาง)', en: 'Removed from every zone · house, name and area cleared · per-box settings cleared (shared values)' }) }}</li>
              <li>{{ i18n.t({ th: 'ออก QR เปิดใช้ตู้ใบใหม่ให้เจ้าของคนใหม่ (QR หน้าตู้ที่ติดอยู่ใช้ต่อได้) · ประวัติเก่ายังอยู่', en: 'A new activation QR is issued for the next owner (the front QR stickers keep working) · history is kept' }) }}</li>
              <li [class.off]="!unbindResetWifi()">{{ i18n.t({ th: 'ตู้ลืม Wi-Fi และเปิดโหมดตั้งค่า (ตู้ต้องออนไลน์ถึงจะรับ · ยังจำรหัสตู้ ไม่ต้องต่อสาย)', en: 'The box forgets its Wi-Fi and opens setup mode (it must be online · it keeps its identity — no cable needed)' }) }}</li>
            </ul>
            <label class="field">
              <span>{{ i18n.t({ th: 'เหตุผล', en: 'Reason' }) }}</span>
              <input maxlength="200" [placeholder]="i18n.t({ th: 'เช่น ขายบ้าน', en: 'e.g. house sold' })" [value]="unbindReason()" (input)="unbindReason.set($any($event.target).value)" />
            </label>
            <label class="check">
              <input type="checkbox" [checked]="unbindResetWifi()" (change)="unbindResetWifi.set($any($event.target).checked)" />
              <span>{{ i18n.t({ th: 'ให้ตู้ลืม Wi-Fi ด้วย (แนะนำ — เจ้าของใหม่ใช้ Wi-Fi ของตัวเอง)', en: 'Also make the box forget its Wi-Fi (recommended — the new owner uses their own)' }) }}</span>
            </label>
            <button type="button" class="btn danger" [disabled]="unbinding() || !unbindReason().trim()" (click)="unbind()">
              {{ unbinding() ? i18n.t({ th: 'กำลังดำเนินการ…', en: 'Working…' }) : i18n.t({ th: 'คืนตู้เป็นตู้ใหม่', en: 'Return the box as new' }) }}
            </button>
          </section>
        } @else {
          <h2 class="section-title">{{ i18n.t({ th: 'ล้าง Wi-Fi ของตู้', en: 'Reset the box Wi-Fi' }) }}</h2>
          <section class="card stack">
            <p class="muted small">{{ i18n.t({ th: 'ตู้นี้ยังไม่ผูกเจ้าของ — สั่งให้ตู้ลืม Wi-Fi แล้วเปิดโหมดตั้งค่าได้ (ตู้ต้องออนไลน์ถึงจะรับ) ใช้เมื่อย้ายตู้ไปติดตั้งที่ใหม่', en: 'This box has no owner — make it forget its Wi-Fi and open setup mode (it must be online). Use it when moving the box to a new place.' }) }}</p>
            <button type="button" class="btn secondary danger-outline" [disabled]="resetBusy() || b.wifi_reset.status === 'pending'" (click)="requestWifiReset()">
              {{ i18n.t({ th: 'สั่งตู้ลืม Wi-Fi', en: 'Make the box forget its Wi-Fi' }) }}
            </button>
            @if (b.wifi_reset.status === 'done') {
              <p class="small">{{ i18n.t({ th: 'ครั้งล่าสุด: ตู้ล้าง Wi-Fi แล้ว ', en: 'Last time: the box cleared its Wi-Fi ' }) }}{{ fwDate(b.wifi_reset.done_at!) }}</p>
            }
          </section>
        }

        }
        @if (tab() === 'firmware') {
        <h2 class="section-title">{{ i18n.t({ th: 'อัปเดตเฟิร์มแวร์', en: 'Firmware update' }) }}</h2>
        <section class="card stack">
          <div class="fw-now">
            <span class="muted">{{ i18n.t({ th: 'ตู้รันเวอร์ชัน', en: 'Box is running' }) }}</span>
            <strong class="fw-ver">{{ b.fw ?? '—' }}</strong>
          </div>
          @if (b.fw_target && b.fw_stuck) {
            <div class="info-box" role="alert">
              <strong class="warn-text">{{ i18n.t({ th: 'ตู้โหลดไฟล์ ' + b.fw_target + ' ไปแล้ว แต่ยังรายงานเป็น ' + (b.fw ?? '—'), en: 'The box downloaded ' + b.fw_target + ' but still reports ' + (b.fw ?? '—') }) }}</strong>
              <p class="small">{{ i18n.t({ th: 'มักเกิดจากชื่อเวอร์ชันที่ตั้งตอนอัปโหลดไม่ตรงกับเลขที่ฝังในไฟล์ (FW_VERSION) หรือบอร์ดลงไฟล์ไม่สำเร็จ · ให้อัปโหลดไฟล์ด้วยชื่อที่ตรงกับเลขในไฟล์ แล้วกดอัปเดตใหม่ หรือกด "ลองใหม่" เพื่อให้ตู้โหลดอีกครั้ง', en: 'Usually the version name given at upload differs from the number built into the file (FW_VERSION), or the board could not install it · upload the file under the matching name and update again, or press "Retry" to let the box download once more' }) }}</p>
              <button type="button" class="btn secondary fw-act" (click)="setTarget(b.fw_target)">{{ i18n.t({ th: 'ลองใหม่', en: 'Retry' }) }}</button>
            </div>
          }
          @if (b.fw_target) {
            <div class="fw-pending">
              <span>{{ i18n.t({ th: 'รอตู้อัปเดตเป็น', en: 'Waiting for the box to update to' }) }} <strong>{{ b.fw_target }}</strong></span>
              <button type="button" class="btn secondary fw-act" (click)="setTarget(null)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
            </div>
          }
        </section>

        <div class="list">
          @for (f of firmware(); track f.version) {
            <div class="row">
              <span class="grow">
                <strong>{{ f.version }}</strong>
                <span class="muted small block">{{ (f.size / 1024).toFixed(0) }} KB · {{ fwDate(f.uploaded_at) }}</span>
              </span>
              @if (f.version === b.fw) {
                <span class="chip ok">{{ i18n.t({ th: 'ตู้รันอยู่', en: 'Running' }) }}</span>
              } @else if (f.version === b.fw_target) {
                <span class="chip warn">{{ i18n.t({ th: 'รอตู้อัปเดต', en: 'Pending' }) }}</span>
              } @else {
                <button type="button" class="btn fw-act" (click)="setTarget(f.version)">{{ i18n.t({ th: 'อัปเดตตู้นี้', en: 'Update box' }) }}</button>
                <button type="button" class="btn secondary fw-act" [attr.aria-label]="i18n.t({ th: 'ลบ ', en: 'Delete ' }) + f.version" (click)="removeFirmware(f.version)">
                  {{ i18n.t({ th: 'ลบ', en: 'Delete' }) }}
                </button>
              }
            </div>
          } @empty {
            @if (fwLoadError(); as err) {
              <p class="row danger-text" role="alert">{{ i18n.t({ th: 'โหลดรายการเฟิร์มแวร์ไม่ได้ (' + err + ') — ไม่ใช่ว่ายังไม่มีไฟล์ ลองโหลดหน้าใหม่', en: 'Could not load the firmware list (' + err + ') — this does not mean there are no files; reload the page' }) }}</p>
            } @else {
              <p class="row muted">{{ i18n.t({ th: 'ยังไม่มีเฟิร์มแวร์ที่อัปโหลดไว้', en: 'No firmware uploaded yet' }) }}</p>
            }
          }
        </div>

        <section class="card stack">
          <strong>{{ i18n.t({ th: 'อัปโหลดเวอร์ชันใหม่', en: 'Upload a new version' }) }}</strong>
          <label class="field">
            <span>{{ i18n.t({ th: 'ชื่อเวอร์ชัน', en: 'Version name' }) }}</span>
            <input type="text" maxlength="32" [placeholder]="fwSuggest()" [value]="fwVersion()" (input)="fwVersion.set($any($event.target).value)" />
            <small>{{ i18n.t({ th: 'ต้องตรงกับ FW_VERSION ในไฟล์ที่คอมไพล์ (เว้นว่าง = ใช้ที่แนะนำ)', en: 'Must match FW_VERSION compiled into the file (empty = use the suggestion)' }) }}</small>
          </label>
          <label class="fw-drop" [class.has-file]="fwFile()">
            <input type="file" accept=".bin" (change)="fwFile.set($any($event.target).files?.[0] ?? null)" />
            <span>{{ fwFile() ? fwFile()!.name + ' · ' + (fwFile()!.size / 1024).toFixed(0) + ' KB' : i18n.t({ th: 'แตะเพื่อเลือกไฟล์ firmware.bin', en: 'Tap to choose firmware.bin' }) }}</span>
          </label>
          <button type="button" class="btn" [disabled]="uploadingFw() || !fwFile() || !(fwVersion().trim() || fwSuggest())" (click)="uploadFirmware()">
            {{ uploadingFw() ? i18n.t({ th: 'กำลังอัปโหลด…', en: 'Uploading…' }) : i18n.t({ th: 'อัปโหลด', en: 'Upload' }) }}
          </button>
        </section>

        }
        @if (tab() === 'test') {
        <h2 class="section-title">{{ i18n.t({ th: 'ทดสอบปลุกตู้', en: 'Wake test' }) }}</h2>
        <app-box-test [boxId]="b.id" (finished)="reload()" />

        <h2 class="section-title">{{ i18n.t({ th: 'ทดสอบเสียง Buzzer', en: 'Buzzer test' }) }}</h2>
        <section class="card stack">
          <p class="muted small">{{ i18n.t({ th: 'กดแล้วตู้ที่ออนไลน์จะส่งเสียงตามรูปแบบนั้นทันที (ต้องยืนอยู่ใกล้ตู้) · ใช้เช็กว่าลำโพง/ขาต่อทำงาน และให้ช่างรู้จักความหมายของเสียงแต่ละแบบ', en: 'The online box plays that pattern right away (stand near it) · checks the buzzer wiring and teaches what each sound means' }) }}</p>
          <div class="beeps">
            @for (p of beepPatterns; track p.v) {
              <button type="button" class="beep" [class.on]="b.buzzer.pattern === p.v && b.buzzer.status === 'pending'" [disabled]="beepBusy()" (click)="testBeep(p.v)">
                <strong>{{ i18n.t(p.label) }}</strong>
                <span class="muted small">{{ i18n.t(p.sound) }}</span>
              </button>
            }
          </div>
          @switch (b.buzzer.status) {
            @case ('pending') {
              <p class="status warn" role="status">{{ i18n.t({ th: 'ส่งคำสั่งแล้ว รอตู้รับ… (ตู้ต้องออนไลน์ · หมดอายุใน 2 นาที)', en: 'Sent — waiting for the box… (it must be online · expires in 2 min)' }) }}</p>
            }
            @case ('done') {
              <p class="status ok" role="status">{{ i18n.t({ th: 'ตู้ส่งเสียง "', en: 'The box played “' }) }}{{ i18n.t(beepName(b.buzzer.pattern)) }}{{ i18n.t({ th: '" แล้ว · ', en: '” · ' }) }}{{ i18n.t(seen(b.buzzer.done_at)) }}</p>
              <p class="muted small">{{ i18n.t({ th: 'ไม่ได้ยินเสียง? เช็กสายลำโพง/Buzzer ที่ขา GPIO ของบอร์ด และกระแสไฟ (ดูรูปแบบเสียงในคู่มือ §2.5)', en: 'No sound? Check the buzzer wiring on the board and the power supply (patterns: protocol §2.5)' }) }}</p>
            }
            @case ('expired') {
              <p class="status danger" role="alert">{{ i18n.t({ th: 'ตู้ไม่รับคำสั่งภายใน 2 นาที — ตู้ออนไลน์อยู่ไหม? หรือยังเป็นเฟิร์มแวร์เก่า (ต้อง 0.2.8 ขึ้นไป)', en: 'The box did not take it within 2 min — is it online? Or it runs old firmware (needs 0.2.8+)' }) }}</p>
            }
          }
        </section>

        <h2 class="section-title">{{ i18n.t({ th: 'สถานะบอร์ดและกล้อง', en: 'Board and camera status' }) }}</h2>
        <section class="card">
          @if (b.camera_diagnostics; as camera) {
            @switch (camera.state) {
              @case ('started') {
                <p class="status warn">{{ i18n.t({ th: 'เริ่มทดสอบกล้องแล้ว', en: 'Camera test started' }) }}</p>
              }
              @case ('ready') {
                <p class="status ok">{{ i18n.t({ th: 'กล้องเริ่มทำงานแล้ว รอผลอ่าน QR', en: 'Camera initialized; waiting for QR scan' }) }}</p>
              }
              @case ('scan_result') {
                @if (camera.read_ok) {
                  <p class="status ok">{{ i18n.t({ th: 'กล้องอ่าน QR ได้', en: 'Camera read a QR code' }) }}</p>
                } @else if ((camera.frames ?? 0) > 0) {
                  <p class="status warn">{{ i18n.t({ th: 'กล้องรับภาพได้ แต่ยังไม่พบ QR', en: 'Camera captured frames but found no QR code' }) }}</p>
                } @else {
                  <p class="status danger">{{ i18n.t({ th: 'ยังไม่ได้ภาพจากกล้อง', en: 'No camera frames were captured' }) }}</p>
                }
              }
              @case ('error') {
                <p class="status danger">{{ i18n.t({ th: 'เปิดกล้องไม่สำเร็จ', en: 'Camera initialization failed' }) }}</p>
              }
            }
            <dl class="kv small">
              <dt>{{ i18n.t({ th: 'รายงานล่าสุด', en: 'Latest report' }) }}</dt><dd>{{ i18n.t(seen(camera.at)) }}</dd>
              @if (camera.job_id) {
                <dt>{{ i18n.t({ th: 'งานทดสอบ', en: 'Test job' }) }}</dt><dd>{{ camera.job_id }}</dd>
              }
              @if (camera.width !== null && camera.height !== null) {
                <dt>{{ i18n.t({ th: 'ความละเอียด', en: 'Resolution' }) }}</dt><dd>{{ camera.width }} × {{ camera.height }}</dd>
              }
              @if (camera.frames !== null) {
                <dt>{{ i18n.t({ th: 'จำนวนภาพที่อ่าน', en: 'Frames captured' }) }}</dt><dd>{{ camera.frames }}</dd>
              }
              @if (camera.qr_shapes !== null) {
                <dt>{{ i18n.t({ th: 'ภาพที่พบรูปทรง QR', en: 'Frames with a QR shape' }) }}</dt><dd>{{ camera.qr_shapes }}</dd>
              }
              @if (camera.read_ms !== null) {
                <dt>{{ i18n.t({ th: 'เวลาอ่าน', en: 'Scan time' }) }}</dt><dd>{{ camera.read_ms }} {{ i18n.t({ th: 'มิลลิวินาที', en: 'ms' }) }}</dd>
              }
            </dl>
          } @else {
            <p class="muted small">{{ i18n.t({ th: 'ยังไม่มีรายงานทดสอบกล้อง · กด “ทดสอบปลุกตู้” ด้านบน', en: 'No camera test report yet · run the wake test above' }) }}</p>
          }
        </section>

        }
        @if (tab() === 'qr') {
        <h2 class="section-title">{{ i18n.t({ th: 'QR ของตู้ (พิมพ์ได้)', en: 'Box QR codes (printable)' }) }}</h2>
        <div class="qr-grid">
          @for (q of activeQr(); track q.id) {
            <figure class="card">
              <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
              <figcaption class="small">
                <strong>{{ i18n.t(slot(q.slot)) }}</strong> v{{ q.version }}<br />
                {{ q.print_code }}
                @if (q.slot === 'activate') {
                  <br /><span class="chip" [class.ok]="q.status === 'active'">{{ q.status === 'active' ? i18n.t({ th: 'ยังไม่ใช้', en: 'unused' }) : i18n.t({ th: 'ใช้แล้ว', en: 'used' }) }}</span>
                }
              </figcaption>
            </figure>
          }
        </div>
        <button type="button" class="btn secondary" (click)="print()">{{ i18n.t({ th: 'พิมพ์หน้านี้', en: 'Print this page' }) }}</button>

        <h2 class="section-title">{{ i18n.t({ th: 'เขียนลงบอร์ด', en: 'Board provisioning' }) }}</h2>
        <section class="card stack">
          <dl class="kv small">
            <dt>box_id</dt><dd><code>{{ b.id }}</code></dd>
            <dt>{{ i18n.t({ th: 'URL เซิร์ฟเวอร์', en: 'Server URL' }) }}</dt><dd><code>{{ apiUrl }}</code></dd>
            @if (secret(); as s) {
              <dt>device_secret</dt><dd><code class="secret">{{ s }}</code></dd>
            }
          </dl>
          @if (!secret()) {
            <button type="button" class="btn secondary" (click)="reveal()">{{ i18n.t({ th: 'ดูรหัสลับประจำตู้ (บันทึกการเปิดดู)', en: 'Show device secret (access is logged)' }) }}</button>
          } @else {
            <button type="button" class="btn secondary" (click)="copy(secret()!)">{{ i18n.t({ th: 'คัดลอกรหัสลับ', en: 'Copy secret' }) }}</button>
          }
          <p class="muted small">{{ i18n.t({ th: 'ตู้ต้องเซ็นทุกคำขอด้วยรหัสนี้ (โปรโตคอล §1.1) · ห้ามส่งในแชต', en: 'The box signs every request with it (protocol §1.1) · never paste it in chat' }) }}</p>
        </section>

        }
        @if (tab() === 'overview') {
        <h2 class="section-title">{{ i18n.t({ th: 'รายงานจากตู้ล่าสุด', en: 'Latest box reports' }) }}</h2>
        <div class="list">
          @for (r of b.reports.slice(0, 8); track $index) {
            <div class="row">
              <span class="grow">
                <strong>{{ r.kind }}{{ r.body['type'] ? ' · ' + r.body['type'] : '' }}</strong>
                <span class="muted small block">{{ reportLine(r.body) }}</span>
              </span>
              <span class="muted small">{{ i18n.t(seen(r.at)) }}</span>
            </div>
          } @empty {
            <p class="row muted">{{ i18n.t({ th: 'ตู้ยังไม่เคยส่งรายงาน (ยังไม่เปิดเครื่อง / ยังไม่ต่อ Wi-Fi)', en: 'No reports yet (not powered on / no Wi-Fi yet)' }) }}</p>
          }
        </div>
        @if (b.auth_failures.length) {
          <h2 class="section-title">{{ i18n.t({ th: 'คำขอที่ลายเซ็นไม่ผ่าน', en: 'Rejected box requests' }) }}</h2>
          <div class="list">
            @for (a of b.auth_failures; track $index) {
              <div class="row"><span class="grow"><strong>{{ a.reason }}</strong></span><span class="muted small">{{ i18n.t(seen(a.at)) }}</span></div>
            }
          </div>
        }
        }
        @if (tab() === 'danger') {
        <a class="btn secondary" [routerLink]="url('T01')" [queryParams]="{ id: b.id, from: 'D04' }">{{ i18n.t({ th: 'เปิดเช็กลิสต์ติดตั้ง (ช่าง)', en: 'Open install checklist' }) }}</a>
        @if (b.can_delete) {
          <section class="card stack delete-box">
            <p class="small">{{ i18n.t({ th: 'ตู้นี้ยังไม่เปิดใช้และไม่มีประวัติการทำงาน', en: 'This box is unused and has no activity history' }) }}</p>
            <button type="button" class="btn danger" (click)="deleteUnusedBox()">{{ i18n.t({ th: 'ลบตู้นี้', en: 'Delete this box' }) }}</button>
          </section>
        }
        }
      </div>
    } @else {
      <p class="muted">{{ notFound() ? i18n.t({ th: 'ไม่พบตู้นี้', en: 'Mailbox not found' }) : i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
    }
  `,
  styles: `
    .effects {
      margin: 0;
      padding-inline-start: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.9375rem;
    }
    .effects li.off {
      opacity: 0.45;
      text-decoration: line-through;
    }
    .check {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
    }
    .check input {
      margin-block-start: 4px;
    }
    .checklist {
      margin: 0;
      padding-inline-start: 22px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .done {
      border-color: var(--ok);
      border-width: 2px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    /* แถบสรุป */
    .kpis {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-block-start: 8px;
    }
    @media (min-inline-size: 900px) {
      .kpis {
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }
    }
    .kpi {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 12px 14px;
      background: var(--surface);
      border: 1px solid var(--line-strong, var(--line));
      border-radius: 10px;
      color: inherit;
      font: inherit;
      text-align: start;
      min-inline-size: 0;
    }
    .kpi.click {
      cursor: pointer;
    }
    .kpi.click:hover {
      border-color: var(--text);
    }
    .kpi-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-muted);
    }
    .kpi-value {
      font-size: 1.375rem;
      font-weight: 700;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .kpi-value.warn {
      color: var(--warn);
    }
    .kpi-value.danger {
      color: var(--sos);
    }
    .kpi-hint {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .beeps {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      gap: 10px;
    }
    .beep {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 12px 14px;
      border: 1px solid var(--line-strong, var(--line));
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
      transition: border-color 0.12s, background 0.12s;
    }
    .beep:hover:not([disabled]) {
      border-color: var(--brand);
      background: var(--brand-lighter);
    }
    .beep.on {
      border-color: var(--brand);
      background: var(--brand-light);
    }
    .beep[disabled] {
      opacity: 0.6;
      cursor: wait;
    }
    .tabs + .info-box {
      margin-block-end: 14px;
    }
    /* แท็บหมวด */
    .tabs {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      margin: 14px 0 12px;
      border-block-end: 1px solid var(--line-strong, var(--line));
    }
    .tabs button {
      flex: none;
      padding: 10px 16px;
      border: 0;
      border-block-end: 3px solid transparent;
      background: none;
      color: var(--text-muted);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .tabs button:hover {
      color: var(--text);
    }
    .tabs button.on {
      color: var(--brand);
      border-block-end-color: var(--brand);
    }
    .stack.grow {
      max-inline-size: 860px;
    }
    /* ตั้งค่าเฉพาะตู้ (details) — ให้ช่องแต่ละช่องมีระยะห่างเหมือนการ์ดอื่น */
    .override {
      margin: 12px 0;
    }
    .override > summary {
      cursor: pointer;
      font-weight: 700;
      padding: 8px 0;
    }
    .override[open] {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .override[open] > summary {
      padding-block-end: 0;
    }
    .fw-now {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .fw-ver {
      font-size: 1.5rem;
    }
    .fw-pending {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: var(--warn-bg);
      color: var(--warn);
    }
    .btn.fw-act {
      inline-size: auto;
      min-block-size: 40px;
      padding: 6px 14px;
      font-size: 0.9375rem;
      flex: none;
    }
    .fw-drop {
      display: flex;
      align-items: center;
      justify-content: center;
      min-block-size: 64px;
      padding: 12px;
      border: 2px dashed color-mix(in srgb, var(--text-muted) 55%, transparent);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      text-align: center;
      cursor: pointer;
      word-break: break-all;
    }
    .fw-drop.has-file {
      border-style: solid;
      border-color: var(--ok);
      color: var(--text);
    }
    .fw-drop input {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
    }
    .fw-drop:focus-within {
      outline: 2px solid var(--brand);
      outline-offset: 1px;
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
    .qr-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
      gap: 8px;
      min-inline-size: 0;
      > * {
        min-inline-size: 0;
      }
      figure {
        margin: 0;
        padding: 8px;
        text-align: center;
      }
      app-qr-image {
        background: #fff;
      }
    }
    .secret {
      word-break: break-all;
    }
    code {
      font-size: 0.8125rem;
      word-break: break-all;
    }
    @media print {
      .qr-grid {
        grid-template-columns: repeat(3, 5cm);
      }
    }
  `,
})
export class AdminBox implements OnInit {
  protected readonly lowPct = LOW_BATTERY_PCT;
  protected readonly tab = signal<'overview' | 'test' | 'settings' | 'firmware' | 'qr' | 'danger'>('overview');
  protected readonly tabs: { v: 'overview' | 'test' | 'settings' | 'firmware' | 'qr' | 'danger'; label: Tr }[] = [
    { v: 'overview', label: { th: 'ภาพรวม', en: 'Overview' } },
    { v: 'test', label: { th: 'ทดสอบ', en: 'Test' } },
    { v: 'settings', label: { th: 'ตั้งค่า', en: 'Settings' } },
    { v: 'firmware', label: { th: 'เฟิร์มแวร์', en: 'Firmware' } },
    { v: 'qr', label: { th: 'QR และบอร์ด', en: 'QR & board' } },
    { v: 'danger', label: { th: 'ขั้นสูง', en: 'Advanced' } },
  ];
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly boxBadge = boxBadge;
  protected readonly seen = seenText;
  protected readonly slot = (s: string | number) => SLOT_LABEL[String(s)];
  readonly id = input<string>();
  protected readonly box = signal<AdminBoxDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly secret = signal<string | null>(null);
  protected readonly resettingConfig = signal(false);
  protected readonly ovReport = signal('');
  protected readonly ovScan = signal('');
  protected readonly ovAttempts = signal('');
  protected readonly ovLongpoll = signal('');
  protected readonly ovFlash = signal('');
  protected readonly ovError = signal<Tr | null>(null);
  protected readonly savingOverride = signal(false);
  private ovLoadedFor: string | null = null;
  protected readonly unbindReason = signal('');
  /** ติ๊ก "ให้ตู้ลืม Wi-Fi ด้วย" (ค่าเริ่มต้น เปิด) */
  protected readonly unbindResetWifi = signal(true);
  /** ผลหลังกด "คืนตู้เป็นตู้ใหม่" → ขึ้นเช็กลิสต์ให้ไปทำต่อหน้างาน */
  protected readonly returned = signal<{ wifi_reset: boolean; ap_name: string } | null>(null);
  protected readonly resetBusy = signal(false);
  protected readonly beepBusy = signal(false);
  /** รูปแบบเสียง (ตรงกับโปรโตคอล §2.5 และข้อความในแอปเจ้าหน้าที่) */
  protected readonly beepPatterns: { v: BeepPattern; label: Tr; sound: Tr }[] = [
    { v: 'ready', label: { th: 'พร้อม / ได้งาน', en: 'Ready' }, sound: { th: 'สั้น 1 ครั้ง', en: 'short ×1' } },
    { v: 'pass', label: { th: 'ผ่าน', en: 'Pass' }, sound: { th: 'สั้น 2 ครั้ง', en: 'short ×2' } },
    { v: 'retry', label: { th: 'ลองใหม่', en: 'Retry' }, sound: { th: 'ยาว 1 ครั้ง', en: 'long ×1' } },
    { v: 'fail', label: { th: 'ไม่ผ่าน', en: 'Fail' }, sound: { th: 'ยาว 3 ครั้ง', en: 'long ×3' } },
    { v: 'error', label: { th: 'ผิดพลาด', en: 'Error' }, sound: { th: 'ยาว 1 + สั้น 2', en: 'long ×1 + short ×2' } },
    { v: 'wifi', label: { th: 'รับคำสั่ง Wi-Fi', en: 'Wi-Fi command' }, sound: { th: 'สั้น 3 ถี่ ๆ', en: 'short ×3 fast' } },
  ];
  protected beepName(p: BeepPattern | null): Tr {
    return this.beepPatterns.find((x) => x.v === p)?.label ?? { th: '', en: '' };
  }

  protected async testBeep(pattern: BeepPattern): Promise<void> {
    const id = this.id();
    if (!id || this.beepBusy()) return;
    this.beepBusy.set(true);
    try {
      await this.api.requestBeep(id, pattern);
      await this.reload();
    } catch {
      this.toast.show({ th: 'สั่งทดสอบเสียงไม่ได้ ลองใหม่', en: 'Could not start the buzzer test — try again' });
    } finally {
      this.beepBusy.set(false);
    }
  }
  protected readonly unbinding = signal(false);
  protected readonly serviceReason = signal('');
  protected readonly serviceBusy = signal(false);
  protected readonly firmware = signal<FirmwareInfo[]>([]);
  protected readonly fwVersion = signal('');
  protected readonly fwFile = signal<File | null>(null);
  protected readonly uploadingFw = signal(false);
  /** โหลดรายการไม่ได้ (รหัสสถานะ) — แยกจาก "ยังไม่มีไฟล์" */
  protected readonly fwLoadError = signal<string | null>(null);
  /** ชื่อเวอร์ชันที่แนะนำ = เลขท้ายของเวอร์ชันล่าสุด + 1 (x.y.z → x.y.z+1) */
  protected readonly fwSuggest = computed(() => {
    const m = /^(.*?)(\d+)$/.exec(this.firmware()[0]?.version ?? '');
    return m ? `${m[1]}${Number(m[2]) + 1}` : '';
  });
  protected readonly activeQr = computed(() => (this.box()?.qr ?? []).filter((q) => q.status === 'active' || q.slot === 'activate'));
  /** URL ที่ตู้ใช้ = origin + apiBase ของเว็บนี้ (ไม่ฮาร์ดโค้ดโดเมน) */
  protected readonly apiUrl = location.origin + inject(ApiConfig).apiBase();

  constructor() {
    const t = setInterval(() => void this.reload(), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  ngOnInit(): void {
    void this.reload();
    void this.loadFirmware();
  }

  async reload(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      const box = await this.api.box(id);
      this.box.set(box);
      // เติมฟอร์มค่าเฉพาะตู้จากค่าที่ทับอยู่ — ครั้งแรกที่โหลดตู้นี้เท่านั้น (ไม่ทับสิ่งที่แอดมินกำลังพิมพ์)
      if (this.ovLoadedFor !== id) {
        this.ovLoadedFor = id;
        this.fillOverride(box.config.override ?? {});
      }
    } catch {
      if (!this.box()) this.notFound.set(true);
    }
  }

  private async loadFirmware(): Promise<void> {
    try {
      this.firmware.set(await this.api.firmwareList());
      this.fwLoadError.set(null);
    } catch (e) {
      // ไม่กระทบหน้าอื่น แต่ต้องบอกว่าโหลดไม่ได้ ไม่ใช่ปล่อยให้ดูเหมือนยังไม่มีไฟล์
      const a = apiError(e);
      this.fwLoadError.set(a.code ?? (a.status ? `HTTP ${a.status}` : 'network'));
    }
  }

  protected fwDate(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  protected async uploadFirmware(): Promise<void> {
    const file = this.fwFile();
    const version = this.fwVersion().trim() || this.fwSuggest();
    if (!file || !version || this.uploadingFw()) return;
    this.uploadingFw.set(true);
    try {
      await this.api.uploadFirmware(version, file);
      this.fwFile.set(null);
      this.fwVersion.set('');
      await this.loadFirmware();
      this.toast.show({ th: 'อัปโหลดแล้ว', en: 'Uploaded' });
    } catch (e) {
      const a = apiError(e);
      const why = a.code ?? (a.status ? `HTTP ${a.status}` : 'network');
      this.toast.show(
        a.status === 409
          ? { th: 'มีเวอร์ชันนี้แล้ว · ใช้ชื่อเวอร์ชันใหม่', en: 'That version already exists · use a new version name' }
          : a.status === 413
            ? { th: 'ไฟล์ใหญ่เกินที่เซิร์ฟเวอร์รับ (413) — ตัวกลาง (nginx/gateway) จำกัดขนาด แจ้งผู้ดูแลเซิร์ฟเวอร์', en: 'The file is larger than the server accepts (413) — a proxy limits the size; tell the server admin' }
            : a.status === 0
              ? { th: 'ส่งไฟล์ไม่ถึงเซิร์ฟเวอร์ (เครือข่าย/ตัวกลางตัดการเชื่อมต่อ)', en: 'The file never reached the server (network or a proxy cut it off)' }
              : { th: `อัปโหลดไม่ได้ (${why}) · ต้องเป็นไฟล์ firmware.bin ของ ESP32 ไม่เกิน 1.9 MB และชื่อเวอร์ชันไม่มีช่องว่าง`, en: `Upload failed (${why}) · it must be an ESP32 firmware.bin up to 1.9 MB, and the version name must have no spaces` },
      );
    } finally {
      this.uploadingFw.set(false);
    }
  }

  private fillOverride(o: Partial<BoxConfigOverride>): void {
    this.ovReport.set(o.report_at ?? '');
    this.ovScan.set(o.scan_timeout_s === undefined ? '' : String(o.scan_timeout_s));
    this.ovAttempts.set(o.max_attempts === undefined ? '' : String(o.max_attempts));
    this.ovLongpoll.set(o.longpoll_wait_s === undefined ? '' : String(o.longpoll_wait_s));
    this.ovFlash.set(o.flash_when_dark === undefined ? '' : o.flash_when_dark ? 'on' : 'off');
  }

  /** PUT /admin/boxes/:id/config — ส่งเฉพาะช่องที่กรอก (ช่องว่าง = ใช้ค่ากลาง) · ตู้ได้ค่าใหม่ทันทีที่ long-poll */
  protected async saveOverride(): Promise<void> {
    const id = this.id();
    if (!id || this.savingOverride()) return;
    const body: Partial<BoxConfigOverride> = {};
    const num = (raw: string, min: number, max: number): number | undefined | null => {
      const t = raw.trim();
      if (!t) return undefined;
      const n = Number(t);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };
    const scan = num(this.ovScan(), 10, 60);
    const attempts = num(this.ovAttempts(), 1, 5);
    const longpoll = num(this.ovLongpoll(), 20, 55);
    if (scan === null || attempts === null || longpoll === null) {
      this.ovError.set({ th: 'ตัวเลขอยู่นอกช่วง — สแกน 10–60 · ลอง 1–5 · long-poll 20–55', en: 'A number is out of range — scan 10–60 · tries 1–5 · long-poll 20–55' });
      return;
    }
    this.ovError.set(null);
    if (this.ovReport()) body.report_at = this.ovReport();
    if (scan !== undefined) body.scan_timeout_s = scan;
    if (attempts !== undefined) body.max_attempts = attempts;
    if (longpoll !== undefined) body.longpoll_wait_s = longpoll;
    if (this.ovFlash()) body.flash_when_dark = this.ovFlash() === 'on';
    this.savingOverride.set(true);
    try {
      await this.api.setBoxConfig(id, body);
      await this.reload();
      this.toast.show({ th: 'บันทึกแล้ว · ตู้ได้ค่าใหม่ทันทีที่ติดต่อ', en: 'Saved · the box picks it up at its next contact' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่ได้', en: 'Could not save' });
    } finally {
      this.savingOverride.set(false);
    }
  }

  protected async unbind(): Promise<void> {
    const id = this.id();
    const reason = this.unbindReason().trim();
    if (!id || !reason || this.unbinding()) return;
    if (!window.confirm(this.i18n.t({
      th: `คืน ${id} เป็นตู้ใหม่ใช่ไหม? เจ้าของเดิมจะไม่เห็นตู้นี้อีก ตู้ถูกถอดออกจากทุกโซนและล้างค่าเฉพาะตู้${this.unbindResetWifi() ? ' · ตู้จะลืม Wi-Fi และต้องตั้งใหม่ที่หน้างาน' : ''}`,
      en: `Return ${id} as new? The owner will no longer see it, it leaves every zone and its per-box settings are cleared${this.unbindResetWifi() ? ' · it forgets its Wi-Fi and must be set up on site' : ''}.`,
    }))) return;
    this.unbinding.set(true);
    try {
      const r = await this.api.unbind(id, reason, this.unbindResetWifi());
      this.unbindReason.set('');
      await this.reload();
      this.returned.set({ wifi_reset: r.wifi_reset, ap_name: r.ap_name });
      this.toast.show({ th: 'คืนตู้เป็นตู้ใหม่แล้ว · ทำตามเช็กลิสต์ด้านบน', en: 'Box returned as new · follow the checklist above' });
    } catch (err) {
      const code = (err as { error?: { code?: string } })?.error?.code;
      this.toast.show(code === 'SOS_OPEN'
        ? { th: 'มี SOS ค้างอยู่ — ปิดเคสก่อนแล้วค่อยยกเลิกการผูก', en: 'An SOS is open — close it first' }
        : { th: 'ยกเลิกการผูกไม่ได้', en: 'Could not unlink' });
    } finally {
      this.unbinding.set(false);
    }
  }

  protected async requestWifiReset(): Promise<void> {
    const id = this.id();
    if (!id || this.resetBusy()) return;
    if (!window.confirm(this.i18n.t({
      th: `สั่ง ${id} ลืม Wi-Fi ใช่ไหม? ตู้จะหลุดจากเครือข่ายเดิมและต้องตั้งค่า Wi-Fi ใหม่ที่หน้างาน`,
      en: `Make ${id} forget its Wi-Fi? It leaves the current network and must be set up again on site.`,
    }))) return;
    this.resetBusy.set(true);
    try {
      await this.api.requestWifiReset(id);
      await this.reload();
      this.toast.show({ th: 'ส่งคำสั่งแล้ว · รอตู้ออนไลน์เพื่อรับ', en: 'Request sent · waiting for the box to be online' });
    } catch {
      this.toast.show({ th: 'สั่งไม่ได้ ลองใหม่', en: 'Could not send — try again' });
    } finally {
      this.resetBusy.set(false);
    }
  }

  protected async cancelWifiReset(): Promise<void> {
    const id = this.id();
    if (!id || this.resetBusy()) return;
    this.resetBusy.set(true);
    try {
      await this.api.cancelWifiReset(id);
      await this.reload();
      this.toast.show({ th: 'ยกเลิกคำสั่งแล้ว', en: 'Request cancelled' });
    } catch {
      this.toast.show({ th: 'ยกเลิกไม่ได้ ลองใหม่', en: 'Could not cancel — try again' });
    } finally {
      this.resetBusy.set(false);
    }
  }

  protected async setService(active: boolean): Promise<void> {
    const id = this.id();
    if (!id || this.serviceBusy()) return;
    if (!active && !window.confirm(this.i18n.t({ th: `ปิดบริการ ${id} ใช่ไหม? เจ้าหน้าที่จะตรวจตู้นี้ไม่ได้จนกว่าจะเปิดใหม่`, en: `Switch ${id} off? Officers cannot check it until it is switched back on.` }))) return;
    this.serviceBusy.set(true);
    try {
      await this.api.setService(id, active, this.serviceReason().trim());
      this.serviceReason.set('');
      await this.reload();
      this.toast.show(active ? { th: 'เปิดบริการแล้ว', en: 'Switched on' } : { th: 'ปิดบริการแล้ว · แจ้งเจ้าของบ้านแล้ว', en: 'Switched off · the owner was notified' });
    } catch {
      this.toast.show({ th: 'ทำไม่ได้', en: 'Could not change it' });
    } finally {
      this.serviceBusy.set(false);
    }
  }

  protected async removeFirmware(version: string): Promise<void> {
    const ok = window.confirm(this.i18n.t({
      th: `ลบไฟล์เฟิร์มแวร์ ${version} ใช่ไหม? ตู้ที่รันเวอร์ชันนี้อยู่ไม่กระทบ แต่จะสั่งอัปเดตเป็นเวอร์ชันนี้อีกไม่ได้จนกว่าจะอัปโหลดใหม่`,
      en: `Delete firmware ${version}? Boxes already running it are not affected, but it can’t be sent again until uploaded again.`,
    }));
    if (!ok) return;
    try {
      await this.api.deleteFirmware(version);
      await this.loadFirmware();
      this.toast.show({ th: 'ลบแล้ว', en: 'Deleted' });
    } catch {
      this.toast.show({ th: 'ลบไม่ได้ · อาจมีตู้รอโหลดเวอร์ชันนี้อยู่ ให้ยกเลิกงานอัปเดตของตู้นั้นก่อน', en: 'Could not delete · a box may be waiting for it — cancel that update first' });
    }
  }

  protected async setTarget(version: string | null): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      await this.api.setFirmwareTarget(id, version);
      await this.reload();
      this.toast.show(version
        ? { th: `สั่ง ${id} อัปเดตเป็น ${version} แล้ว`, en: `${id} will update to ${version}` }
        : { th: 'ยกเลิกการอัปเดตแล้ว', en: 'Update cancelled' });
    } catch {
      this.toast.show({ th: 'สั่งไม่ได้', en: 'Could not send the update' });
    }
  }

  protected windows(b: AdminBoxDetail): string {
    const w = b.config.config.windows ?? [];
    return w.length ? w.map((x) => x.join('–')).join(' · ') : this.i18n.t({ th: 'ยังไม่อยู่ในโซนไหน', en: 'not in any zone' });
  }

  protected reportLine(body: Record<string, unknown>): string {
    const parts: string[] = [];
    if (body['battery_pct'] !== undefined) parts.push(`${body['battery_pct']}%`);
    if (body['rssi'] !== undefined) parts.push(`rssi ${body['rssi']}`);
    if (body['fw']) parts.push(`fw ${body['fw']}`);
    if (body['reset_reason']) parts.push(String(body['reset_reason']));
    return parts.join(' · ');
  }

  protected async reveal(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      this.secret.set((await this.api.revealSecret(id)).device_secret);
    } catch {
      this.toast.show({ th: 'เปิดดูไม่ได้', en: 'Couldn’t load it' });
    }
  }

  protected copy(text: string): void {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    this.toast.show({ th: 'คัดลอกแล้ว', en: 'Copied' });
  }

  protected print(): void {
    window.print();
  }

  protected async deleteUnusedBox(): Promise<void> {
    const id = this.id();
    if (!id || !this.box()?.can_delete) return;
    const confirmed = window.confirm(this.i18n.t({
      th: `ยืนยันลบตู้ ${id}? QR และข้อมูลตู้ที่ยังไม่เปิดใช้จะถูกลบถาวร`,
      en: `Delete box ${id}? Its unused QR codes and box record will be permanently removed.`,
    }));
    if (!confirmed) return;
    try {
      await this.api.deleteBox(id);
      this.toast.show({ th: 'ลบตู้แล้ว', en: 'Box deleted' });
      await this.router.navigateByUrl(this.url('D03'));
    } catch {
      this.toast.show({ th: 'ลบไม่ได้ · ตู้อาจถูกเปิดใช้หรือมีประวัติแล้ว', en: 'Could not delete · the box may be activated or have activity' });
      await this.reload();
    }
  }

  protected async resetConfig(): Promise<void> {
    const id = this.id();
    if (!id || this.resettingConfig()) return;
    const confirmed = window.confirm(this.i18n.t({
      th: `คืนค่าการตั้งค่าการทำงานของ ${id} ให้ใช้ค่ากลางใช่ไหม? เวลาตรวจยังมาจากโซน และระบบจะเก็บ Wi-Fi, รหัสบอร์ด, เจ้าของ, QR และประวัติไว้`,
      en: `Restore ${id} to shared settings? Patrol hours stay with its zones. Wi-Fi, board credentials, ownership, QR codes, and history are kept.`,
    }));
    if (!confirmed) return;
    this.resettingConfig.set(true);
    try {
      const result = await this.api.resetBoxConfig(id);
      await this.reload();
      const synced = this.box()?.config.config_ver === result.config_ver && this.box()?.config.in_sync;
      this.toast.show(synced
        ? { th: 'คืนค่าแล้ว · บอร์ดรับค่ากลางแล้ว', en: 'Restored · the board has applied shared settings' }
        : { th: 'คืนค่าแล้ว · รอบอร์ด sync เมื่อเชื่อมต่อครั้งถัดไป', en: 'Restored · waiting for the board to sync on its next connection' });
    } catch {
      this.toast.show({ th: 'รีเซ็ตไม่ได้ · ลองโหลดข้อมูลตู้ใหม่', en: 'Could not reset · reload the box and try again' });
    } finally {
      this.resettingConfig.set(false);
    }
  }
}
