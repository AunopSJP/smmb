import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiConfig, apiError } from '../../core/api';
import { AdminApi, type BeepPattern, type AdminBoxDetail, type BoxConfigOverride, type AdminBoxRow, type FirmwareInfo, type RegisteredBox } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { minutesAgo, type BoxStatus } from '../../core/owner-api';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { BoxTest } from '../../shared/box-test';
import { Confirm } from '../../shared/confirm-dialog';
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
      [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })"
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

      <!-- โหมดง่าย (AdmBoxes_E): 3 ตัวเลขสรุป + เฉพาะตู้ที่ต้องดู + ปุ่มลงทะเบียน -->
      <section class="easy-only easy-summary" [attr.aria-label]="i18n.t({ th: 'สรุปตู้', en: 'Box summary' })">
        <div><b>{{ total() }}</b><span>{{ i18n.t({ th: 'ทั้งหมด', en: 'All' }) }}</span></div>
        <div><b class="danger-text">{{ counts().offline }}</b><span>{{ i18n.t({ th: 'ออฟไลน์', en: 'Offline' }) }}</span></div>
        <div><b class="warn-text">{{ easyRows().length }}</b><span>{{ i18n.t({ th: 'ต้องดู', en: 'To check' }) }}</span></div>
      </section>
      <div class="list easy-only">
        @for (b of easyRows(); track b.id) {
          @let badge = boxBadge(b);
          <a class="row easy-row" [routerLink]="url('D04')" [queryParams]="{ id: b.id }">
            <span class="grow">
              <strong>{{ b.house_no ?? b.id }}</strong>
              <span class="muted small block">{{ b.id }}{{ b.battery ? ' · ' + i18n.t({ th: 'แบต ', en: 'battery ' }) + b.battery.pct + '%' : '' }}</span>
            </span>
            <span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">{{ i18n.t(badge.label) }}</span>
          </a>
        } @empty {
          @if (loadFailed()) {
            <p class="row muted"><span class="grow danger-text">{{ i18n.t({ th: 'โหลดรายการตู้ไม่สำเร็จ', en: 'Couldn’t load mailboxes' }) }}</span><button type="button" class="see-all" (click)="load()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button></p>
          } @else {
            <p class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ตู้ทุกใบปกติดี', en: 'Every mailbox is fine' }) }}</p>
          }
        }
      </div>
      <button type="button" class="btn big easy-only" [disabled]="busy()" (click)="registerOne()">
        <app-icon name="plus" [size]="20" />{{ i18n.t({ th: 'ลงทะเบียนตู้ใหม่', en: 'Register a new mailbox' }) }}
      </button>

      <div class="toolbar easy-hide">
        <label class="search-box">
          <app-icon name="search" [size]="18" />
          <input type="search" [attr.aria-label]="i18n.t({ th: 'ค้นรหัสตู้ / บ้านเลขที่', en: 'Search box id / house no.' })" [placeholder]="i18n.t({ th: 'ค้นรหัสตู้ / บ้านเลขที่', en: 'Search box id / house no.' })" [value]="q()" (input)="q.set($any($event.target).value)" (change)="syncQuery()" />
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
      <div class="list easy-hide">
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
                <span class="muted small block adv-only">{{ i18n.t({ th: 'ติดต่อล่าสุด ', en: 'Last seen ' }) }}{{ i18n.t(seen(b.last_seen_at)) }} · {{ i18n.t({ th: 'เฟิร์มแวร์ ', en: 'firmware ' }) }}{{ b.fw ?? '—' }}</span>
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
          @if (loadFailed()) {
            <p class="row muted"><span class="grow danger-text">{{ i18n.t({ th: 'โหลดรายการตู้ไม่สำเร็จ', en: 'Couldn’t load mailboxes' }) }}</span><button type="button" class="see-all" (click)="load()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button></p>
          } @else {
            <p class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ไม่มีตู้ในกลุ่มนี้', en: 'No mailboxes here' }) }}</p>
          }
        }
      </div>
      <p class="muted small easy-hide">{{ i18n.t({ th: 'ทั้งหมด ' + total() + ' ตู้', en: total() + ' mailboxes' }) }}</p>
      @if (boxes().length < total()) {
        <button type="button" class="btn secondary" [disabled]="loadingMore()" (click)="loadMore()">
          {{ loadingMore() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'โหลดเพิ่ม ', en: 'Load more ' }) + boxes().length + '/' + total() }}
        </button>
      }
      <p class="muted small adv-only">{{ i18n.t({ th: 'ออฟไลน์ = ไม่ poll เกิน 3 นาทีในเวลาตรวจ · เงียบ = ไม่เห็นเกิน 26 ชม.', en: 'Offline = no poll for over 3 min in patrol hours · silent = unseen over 26 h' }) }}</p>
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
      border-color: var(--brand-text);
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
      color: var(--brand-text);
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
    @media (min-width: 1024px) {
      .cols > :nth-child(4) {
        justify-self: start;
      }
    }
    @media (min-width: 1024px) {
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
    /* โหมดง่าย: สรุป 3 ช่อง + แถวใหญ่เฉพาะตู้ที่ต้องดู */
    .easy-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .easy-summary > div {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 14px 8px;
      border-radius: var(--radius-sm);
      background: var(--surface);
      border: 1px solid var(--line-strong, var(--line));
      text-align: center;
    }
    .easy-summary b {
      font-size: 1.75rem;
      font-weight: 800;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .easy-summary span {
      font-size: 0.9375rem;
      color: var(--text-muted);
    }
    .easy-row {
      min-block-size: 72px;
    }
    .secret {
      word-break: break-all;
      font-size: 0.8125rem;
      background: var(--icon-bg);
      padding: 6px 8px;
      border-radius: var(--radius-sm);
    }
    .past-qr summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
      min-block-size: 40px;
    }
    .past-qr .row.past {
      align-items: flex-start;
      gap: 10px;
    }
    .past-qr .row .btn {
      inline-size: auto;
      min-block-size: 36px;
      padding: 4px 12px;
    }
    @media print {
      .past-qr {
        display: none;
      }
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
    @media (max-width: 420px) {
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
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly boxBadge = boxBadge;
  protected readonly seen = seenText;
  protected readonly slot = (s: string | number) => SLOT_LABEL[String(s)];

  /** ?filter=low|offline จากหน้าแจ้งเตือน */
  readonly filterParam = input<string | undefined>(undefined, { alias: 'filter' });
  /** ?q=… — ให้ refresh/back แล้วยังเห็นผลค้นเดิม */
  readonly qParam = input<string | undefined>(undefined, { alias: 'q' });
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
  /** โหลดรายการตู้ไม่สำเร็จ (ห้ามขึ้น "ตู้ทุกใบปกติดี") */
  protected readonly loadFailed = signal(false);
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

  /** โหมดง่าย: แสดงเฉพาะตู้ที่ต้องดู (ไม่ออนไลน์หรือแบตต่ำ) เรียงตู้มีปัญหาก่อน */
  protected readonly easyRows = computed(() =>
    this.boxes()
      .filter((b) => b.status === 'offline' || (!!b.battery && b.battery.pct < LOW_BATTERY_PCT))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.id.localeCompare(b.id)),
  );

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

  /** ?filter= จากเมนูย่อยข้างซ้าย — เปลี่ยนเมนูย่อยแล้วตัวกรองเปลี่ยนตาม (หน้าเดิมไม่ถูกสร้างใหม่) */
  private readonly syncFilter = effect(() => {
    const f = this.filterParam();
    untracked(() => this.filter.set(f === 'offline' || f === 'low' || f === 'unbound' ? f : 'all'));
  });

  ngOnInit(): void {
    const q = this.qParam();
    if (q) this.q.set(q);
    void this.load();
  }

  /** เก็บคำค้นใน URL (?q=) — แชร์ลิงก์/refresh ไม่หาย */
  protected syncQuery(): void {
    const q = this.q().trim();
    void this.router.navigate([], {
      queryParams: { q: q || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async load(): Promise<void> {
    try {
      const r = await this.api.boxes('', 1);
      this.boxes.set(r.data);
      this.total.set(r.total);
      this.page = 1;
      this.loadFailed.set(false);
    } catch {
      if (!this.boxes().length) this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private page = 1;
  protected readonly loadingMore = signal(false);

  protected async loadMore(): Promise<void> {
    if (this.loadingMore() || this.boxes().length >= this.total()) return;
    this.loadingMore.set(true);
    try {
      const r = await this.api.boxes('', this.page + 1);
      this.boxes.update((list) => [...list, ...r.data]);
      this.total.set(r.total);
      this.page += 1;
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected async registerOne(): Promise<void> {
    this.count.set(1);
    await this.register();
  }

  /** POST /admin/boxes { count } → รหัสลับ + QR ชุดแรก (พิมพ์ได้จากหน้านี้หรือ D04) */
  protected async register(): Promise<void> {    this.busy.set(true);
    try {
      this.created.set(await this.api.registerBoxes(this.count()));
      this.toast.show({ th: 'ลงทะเบียนตู้แล้ว', en: 'Boxes registered' });
      await this.load();
    } catch {
      this.toast.show({ th: 'สร้างไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t create — try again' });
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
        <button type="button" class="kpi click easy-hide" (click)="tab.set('firmware')">
          <span class="kpi-label">{{ i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' }) }}</span>
          <span class="kpi-value">{{ b.fw ?? '—' }}</span>
          <span class="kpi-hint" [class.warn-text]="b.fw_stuck">{{ b.fw_stuck ? i18n.t({ th: 'อัปเดตค้าง · กดดู', en: 'update stuck · tap' }) : b.fw_target ? i18n.t({ th: 'รออัปเดตเป็น ', en: 'updating to ' }) + b.fw_target : i18n.t({ th: 'กดเพื่ออัปเดต', en: 'tap to update' }) }}</span>
        </button>
        <div class="kpi easy-hide">
          <span class="kpi-label">{{ i18n.t({ th: 'ค่าตั้งค่า', en: 'Config' }) }}</span>
          <span class="kpi-value" [class.warn]="!b.config.in_sync">{{ b.config.in_sync ? i18n.t({ th: 'ล่าสุด', en: 'Current' }) : i18n.t({ th: 'รอดึงค่า', en: 'Pending' }) }}</span>
          <span class="kpi-hint">{{ b.config.in_sync ? i18n.t({ th: 'ตู้มีค่าตั้งค่าล่าสุดแล้ว', en: 'the box has the latest settings' }) : i18n.t({ th: 'รอตู้ดึงค่าใหม่ตอนติดต่อรอบหน้า', en: 'it picks them up on its next contact' }) }}</span>
        </div>
      </section>

      <div class="tabs" role="tablist" [attr.aria-label]="i18n.t({ th: 'หมวดของตู้', en: 'Box sections' })">
        @for (t of tabs; track t.v) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.v" [class.on]="tab() === t.v" [class.easy-hide]="t.v === 'test' || t.v === 'firmware' || t.v === 'danger'" (click)="tab.set(t.v)">{{ i18n.t(t.label) }}</button>
        }
      </div>

      <!-- โหมดง่าย (AdmBoxDetail_E): สรุปสถานะ + ปุ่มงานหลัก -->
      <section class="card easy-only easy-box">
        <strong class="easy-house">{{ b.bound ? b.house_no : i18n.t({ th: 'ยังไม่ผูกบ้าน', en: 'Not bound to a house' }) }}</strong>
        <span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">{{ i18n.t(badge.label) }}</span>
        <span class="easy-meta">{{ b.battery ? i18n.t({ th: 'แบต ', en: 'Battery ' }) + b.battery.pct + '%' : '—' }} · {{ i18n.t({ th: 'เฟิร์มแวร์ ', en: 'Firmware ' }) }}{{ b.fw ?? '—' }}</span>
      </section>
      <div class="easy-actions easy-only">
        <button type="button" class="btn big" (click)="openPrint()">{{ i18n.t({ th: 'พิมพ์ QR', en: 'Print QR' }) }}</button>
        <button type="button" class="btn secondary big" (click)="tab.set('settings')">{{ i18n.t({ th: 'ตั้งค่า / เปิด-ปิดบริการ', en: 'Settings / service' }) }}</button>
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
            <dt class="adv-only">{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt><dd class="adv-only">{{ b.id }}</dd>
            <dt>{{ i18n.t({ th: 'บ้าน', en: 'House' }) }}</dt>
            <dd>{{ b.bound ? (b.house_no + (b.name ? ' · ' + b.name : '')) : i18n.t({ th: 'ยังไม่ผูก', en: 'not bound' }) }}</dd>
            <dt>{{ i18n.t({ th: 'แบต', en: 'Battery' }) }}</dt>
            <dd>{{ b.battery ? b.battery.pct + '%' + (b.battery.charging ? i18n.t({ th: ' · ชาร์จอยู่', en: ' · charging' }) : '') : '—' }}</dd>
            <dt>{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last seen' }) }}</dt>
            <dd>{{ i18n.t(seen(b.last_seen_at)) }}</dd>
            <dt class="easy-hide">{{ i18n.t({ th: 'ถือ long-poll ล่าสุด', en: 'Last long-poll' }) }}</dt>
            <dd class="easy-hide">{{ i18n.t(seen(b.last_poll_at)) }}</dd>
            <dt>{{ i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' }) }}</dt>
            <dd>{{ b.fw ?? '—' }}</dd>
            <dt class="easy-hide">{{ i18n.t({ th: 'ค่าตั้งค่า', en: 'Config' }) }}</dt>
            <dd class="easy-hide" [class.warn-text]="!b.config.in_sync">
              {{ b.config.in_sync ? i18n.t({ th: 'ตู้มีค่าล่าสุด', en: 'up to date' }) : i18n.t({ th: 'รอตู้ดึงค่าใหม่', en: 'waiting for the box' }) }}
            </dd>
            <dt class="adv-only">{{ i18n.t({ th: 'ลงทะเบียนเมื่อ', en: 'Registered' }) }}</dt><dd class="adv-only">{{ fwDate(b.registered_at) }}</dd>
            @if (b.service_reason) {
              <dt class="adv-only">{{ i18n.t({ th: 'เหตุผลปิดบริการ', en: 'Service reason' }) }}</dt><dd class="adv-only">{{ b.service_reason }}</dd>
            }
            <dt>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</dt>
            <dd>{{ windows(b) }}</dd>
          </dl>
        </section>
        }
        @if (tab() === 'settings') {
        <section class="card">
          <details class="override easy-hide" open>
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
            <label class="field">
              <span>{{ i18n.t({ th: 'ประหยัดไฟ Wi-Fi ของตู้', en: 'Wi-Fi power saving' }) }} · {{ b.config.config['wifi_power_save'] ? i18n.t({ th: 'เปิด', en: 'on' }) : i18n.t({ th: 'ปิด', en: 'off' }) }}</span>
              <select [value]="ovPs()" (change)="ovPs.set($any($event.target).value)">
                <option value="">{{ i18n.t({ th: 'ใช้ค่ากลาง (ปิด)', en: 'Shared value (off)' }) }}</option>
                <option value="on">{{ i18n.t({ th: 'เปิด — ตู้ที่สัญญาณ Wi-Fi ดี (กินไฟน้อยลงมาก)', en: 'On — boxes with a good Wi-Fi signal (much lower power)' }) }}</option>
                <option value="off">{{ i18n.t({ th: 'ปิด — ตู้ที่สัญญาณอ่อน (เสถียรกว่า)', en: 'Off — boxes with a weak signal (more stable)' }) }}</option>
              </select>
              <small>{{ i18n.t({ th: 'ตู้ยังตื่นทันทีเมื่อสแกน · ถ้าเปิดแล้วตู้หลุดออนไลน์บ่อย ให้ปิด', en: 'The box still wakes on a scan · turn it off if the box drops offline' }) }}</small>
            </label>
            @if (ovError(); as e) {
              <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
            }
            <button type="button" class="btn" [disabled]="savingOverride()" (click)="saveOverride()">{{ i18n.t({ th: 'บันทึกค่าเฉพาะตู้', en: 'Save box settings' }) }}</button>
          </details>
          <p class="muted small easy-hide">{{ i18n.t({ th: 'คืนค่าการตั้งค่าเฉพาะตู้นี้ เช่น เวลารายงาน การอ่าน QR และ long-poll ให้ใช้ค่ากลาง · เวลาตรวจยังมาจากโซน', en: 'Restore this box’s report, QR scan, and long-poll settings to shared defaults · patrol hours still come from its zones' }) }}</p>
          <button type="button" class="btn secondary easy-hide" [disabled]="resettingConfig()" (click)="resetConfig()">
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
        <div class="easy-hide">
        @if (returned(); as r) {
          <section class="card stack done" role="status">
            <h2 class="section-title">{{ i18n.t({ th: 'คืนตู้เป็นตู้ใหม่แล้ว — ทำต่อที่หน้างานตามนี้', en: 'The box is back to “new” — finish on site' }) }}</h2>
            <ol class="checklist">
              @if (r.wifi_reset) {
                <li>{{ i18n.t({ th: 'รอให้ตู้ออนไลน์ แล้วตู้จะรับคำสั่งลืม Wi-Fi และเปิด Wi-Fi ', en: 'Wait for the box to be online — it takes the command and opens the Wi-Fi ' }) }}<code>{{ r.ap_name }}</code> <span class="muted small">({{ i18n.t({ th: 'ดูสถานะที่แถบด้านบน', en: 'status is shown at the top' }) }})</span></li>
                <li>{{ i18n.t({ th: 'ต่อมือถือเข้า Wi-Fi นั้น แล้วตั้ง Wi-Fi บ้านใหม่ในหน้าตั้งค่าที่เปิดขึ้นเอง', en: 'Join that Wi-Fi with a phone and set the new home Wi-Fi on the page that opens' }) }}</li>
              } @else {
                <li>{{ i18n.t({ th: 'ตู้ยังใช้ Wi-Fi เดิมอยู่ — ถ้าต้องเปลี่ยน ให้กด "สั่งตู้ลืม Wi-Fi" ด้านล่าง', en: 'The box keeps its old Wi-Fi — press “Make the box forget its Wi-Fi” below if it must change' }) }}</li>
              }
              <li>{{ i18n.t({ th: 'พิมพ์ QR เปิดใช้ตู้ใบใหม่ (แท็บ "QR และบอร์ด") ให้เจ้าของคนใหม่', en: 'Print the new activation QR (tab “QR & board”) for the new owner' }) }}</li>
              <li>{{ i18n.t({ th: 'เจ้าของใหม่สมัคร/เข้าสู่ระบบแล้วสแกน QR เปิดใช้ตู้ และกรอกบ้านเลขที่', en: 'The new owner signs in, scans the activation QR and enters the house number' }) }}</li>
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
              {{ unbinding() ? i18n.t({ th: 'กำลังทำรายการ…', en: 'Working…' }) : i18n.t({ th: 'คืนตู้เป็นตู้ใหม่', en: 'Return the box as new' }) }}
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

        <!-- โหมดละเอียด: สิ่งที่ระบบจะทำจริง (ตาม AdmUnbind_A) — ใช้ข้อมูลที่มีจริงเท่านั้น -->
        <section class="card adv-only stack">
          <dl class="kv small">
            <dt>{{ i18n.t({ th: 'สถานะผูก', en: 'Bound' }) }}</dt><dd>{{ b.bound ? i18n.t({ th: 'ผูกอยู่', en: 'Bound' }) : i18n.t({ th: 'ยังไม่ผูก', en: 'Not bound' }) }}</dd>
            <dt>{{ i18n.t({ th: 'QR เปิดใช้ตู้', en: 'Activation QR' }) }}</dt>
            <dd>{{ activationVersion() !== null ? 'v' + activationVersion() : '—' }}</dd>
          </dl>
          <p class="muted small">{{ i18n.t({ th: 'ทุกการเพิกถอน QR ถูกบันทึก · การเปิดดูรหัสลับถูกบันทึกไว้ด้วย', en: 'Every QR revocation is logged · revealing the device secret is recorded too' }) }}</p>
        </section>
        </div>
        }
        @if (tab() === 'firmware') {
        <div class="easy-hide">
        <h2 class="section-title">{{ i18n.t({ th: 'อัปเดตเฟิร์มแวร์', en: 'Firmware update' }) }}</h2>
        <section class="card stack">
          <div class="fw-now">
            <span class="muted">{{ i18n.t({ th: 'ตู้รันเวอร์ชัน', en: 'Box is running' }) }}</span>
            <strong class="fw-ver">{{ b.fw ?? '—' }}</strong>
          </div>
          @if (b.fw_target && b.fw_stuck) {
            <div class="info-box" role="alert">
              <strong class="warn-text">{{ i18n.t({ th: 'ตู้โหลดไฟล์ ' + b.fw_target + ' ไปแล้ว แต่ยังรายงานเป็น ' + (b.fw ?? '—'), en: 'The box downloaded ' + b.fw_target + ' but still reports ' + (b.fw ?? '—') }) }}</strong>
              <p class="small">{{ i18n.t({ th: 'มักเกิดจากชื่อเวอร์ชันที่ตั้งตอนอัปโหลดไม่ตรงกับเลขที่ฝังในไฟล์ (FW_VERSION) หรือบอร์ดลงไฟล์ไม่สำเร็จ · ให้อัปโหลดไฟล์ด้วยชื่อที่ตรงกับเลขในไฟล์ แล้วกดอัปเดตใหม่ หรือกด "ลองอีกครั้ง" เพื่อให้ตู้โหลดอีกครั้ง', en: 'Usually the version name given at upload differs from the number built into the file (FW_VERSION), or the board could not install it · upload the file under the matching name and update again, or press "Retry" to let the box download once more' }) }}</p>
              <button type="button" class="btn secondary fw-act" (click)="setTarget(b.fw_target)">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button>
            </div>
          }
          @if (b.fw_target) {
            <div class="fw-pending">
              <span>{{ i18n.t({ th: 'รอตู้อัปเดตเป็น', en: 'Waiting for the box to update to' }) }} <strong>{{ b.fw_target }}</strong></span>
              <button type="button" class="btn secondary fw-act" (click)="setTarget(null)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
            </div>
          }
        </section>

        <section class="card stack fw-auto">
          <strong>{{ i18n.t({ th: 'อัปเดตอัตโนมัติทุกตู้', en: 'Automatic update for every box' }) }}</strong>
          @if (fwAuto(); as v) {
            <p class="row">
              <span class="chip ok">{{ i18n.t({ th: 'เปิดอยู่', en: 'On' }) }}</span>
              <span>{{ i18n.t({ th: 'ตู้ที่ออนไลน์จะอัปเดตเป็น ', en: 'Online boxes update to ' }) }}<strong>{{ v }}</strong></span>
            </p>
            <button type="button" class="btn secondary fw-act" [disabled]="fwAutoBusy()" (click)="setAuto(null)">{{ i18n.t({ th: 'ปิดอัตโนมัติ', en: 'Turn off' }) }}</button>
          } @else {
            <p class="muted small">{{ i18n.t({ th: 'ปิดอยู่ · ตู้อัปเดตเมื่อแอดมินกดเท่านั้น', en: 'Off · boxes update only when an admin taps' }) }}</p>
          }
          @if (firmware()[0]; as latest) {
            @if (fwAuto() !== latest.version) {
              <button type="button" class="btn fw-act" [disabled]="fwAutoBusy()" (click)="setAuto(latest.version)">
                {{ i18n.t({ th: 'บังคับทุกตู้ใช้ล่าสุด (' + latest.version + ')', en: 'Make every box use the latest (' + latest.version + ')' }) }}
              </button>
            }
          }
          <p class="muted small">{{ i18n.t({ th: 'ตู้จะโหลดเองเมื่อออนไลน์ · รอถ้ามีงานตรวจค้างอยู่ · ตู้ที่โหลดแล้วยังติดเวอร์ชันเดิมจะขึ้น "อัปเดตค้าง" ไม่วนซ้ำ · ถ้าไฟล์เสียจะกระทบทุกตู้ ทดสอบกับตู้เดียวก่อนเสมอ', en: 'Boxes download it when online · they wait if an inspection is open · a box that downloaded it but still runs the old version is flagged "update stuck", not retried in a loop · a bad file affects every box — test on one box first' }) }}</p>
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
              <p class="row danger-text" role="alert">{{ i18n.t({ th: 'โหลดรายการเฟิร์มแวร์ไม่สำเร็จ (' + err + ') — ไม่ใช่ว่ายังไม่มีไฟล์ ลองโหลดหน้าใหม่', en: 'Could not load the firmware list (' + err + ') — this does not mean there are no files; reload the page' }) }}</p>
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

        </div>
        }
        @if (tab() === 'test') {
        <div class="easy-hide">
        <h2 class="section-title">{{ i18n.t({ th: 'ทดสอบปลุกตู้', en: 'Wake test' }) }}</h2>
        <app-box-test [boxId]="b.id" (finished)="reload()" />

        <h2 class="section-title">{{ i18n.t({ th: 'ทดสอบเสียง Buzzer', en: 'Buzzer test' }) }}</h2>
        <section class="card stack">
          <p class="muted small">{{ i18n.t({ th: 'กดแล้วตู้ที่ออนไลน์จะส่งเสียงตามรูปแบบนั้นทันที (ต้องยืนอยู่ใกล้ตู้) · ใช้ตรวจสอบว่าลำโพง/ขาต่อทำงาน และให้ช่างรู้จักความหมายของเสียงแต่ละแบบ', en: 'The online box plays that pattern right away (stand near it) · checks the buzzer wiring and teaches what each sound means' }) }}</p>
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
              <p class="muted small">{{ i18n.t({ th: 'ไม่ได้ยินเสียง? ตรวจสอบสายลำโพง/Buzzer ที่ขา GPIO ของบอร์ด และกระแสไฟ (ดูรูปแบบเสียงในคู่มือ §2.5)', en: 'No sound? Check the buzzer wiring on the board and the power supply (patterns: protocol §2.5)' }) }}</p>
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

        </div>
        }
        @if (tab() === 'qr') {
        <h2 class="section-title">{{ i18n.t({ th: 'QR ที่ใช้งานอยู่', en: 'QR codes in use' }) }}</h2>
        <div class="qr-grid">
          @for (q of activeQr(); track q.id) {
            <figure class="card">
              <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
              <figcaption class="small">
                <strong>{{ i18n.t(slot(q.slot)) }}</strong><br />
                {{ q.print_code }}
                @if (q.slot === 'activate') {
                  <br /><span class="chip ok">{{ i18n.t({ th: 'ยังไม่ใช้', en: 'unused' }) }}</span>
                }
              </figcaption>
            </figure>
          } @empty {
            <p class="card muted">{{ i18n.t({ th: 'ยังไม่มี QR ที่ใช้งานอยู่', en: 'No QR code is in use yet' }) }}</p>
          }
        </div>
        <button type="button" class="btn secondary" (click)="print()">{{ i18n.t({ th: 'พิมพ์ QR ที่ใช้งานอยู่', en: 'Print the QR codes in use' }) }}</button>

        @if (pastQr().length) {
          <details class="card past-qr easy-hide">
            <summary>
              <strong>{{ i18n.t({ th: 'QR ที่ใช้แล้วหรือยกเลิกแล้ว', en: 'Used or revoked QR codes' }) }}</strong>
              <span class="chip">{{ pastQr().length }}</span>
            </summary>
            <p class="muted small">{{ i18n.t({ th: 'เก็บไว้ดูประวัติ — ใบเหล่านี้สแกนไม่ได้แล้ว', en: 'Kept for history — these can no longer be scanned' }) }}</p>
            <div class="list">
              @for (q of pastQr(); track q.id) {
                <div class="row past">
                  <span class="grow">
                    <strong>{{ i18n.t(slot(q.slot)) }}</strong> <span class="muted small">v{{ q.version }} · {{ q.print_code }}</span>
                    <span class="muted small block">{{ fwDate(q.issued_at) }}</span>
                    @if (pastShown() === q.id) {
                      <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
                    }
                  </span>
                  <span class="chip" [class.warn]="q.status === 'revoked'">{{ q.status === 'revoked' ? i18n.t({ th: 'ยกเลิกแล้ว', en: 'revoked' }) : i18n.t({ th: 'ใช้แล้ว', en: 'used' }) }}</span>
                  <button type="button" class="btn secondary small" (click)="pastShown.set(pastShown() === q.id ? null : q.id)">{{ pastShown() === q.id ? i18n.t({ th: 'ซ่อน', en: 'Hide' }) : i18n.t({ th: 'ดู QR', en: 'View' }) }}</button>
                </div>
              }
            </div>
          </details>
        }

        <h2 class="section-title easy-hide">{{ i18n.t({ th: 'เขียนลงบอร์ด', en: 'Board provisioning' }) }}</h2>
        <section class="card stack easy-hide">
          <dl class="kv small">
            <dt>{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt><dd><code>{{ b.id }}</code></dd>
            <dt>{{ i18n.t({ th: 'URL เซิร์ฟเวอร์', en: 'Server URL' }) }}</dt><dd><code>{{ apiUrl }}</code></dd>
            @if (secret(); as s) {
              <dt>{{ i18n.t({ th: 'รหัสลับประจำตู้', en: 'Device secret' }) }}</dt><dd><code class="secret">{{ s }}</code></dd>
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
        <h2 class="section-title easy-hide">{{ i18n.t({ th: 'รายงานจากตู้ล่าสุด', en: 'Latest box reports' }) }}</h2>
        <div class="list easy-hide">
          @for (r of b.reports.slice(0, 8); track $index) {
            <div class="row">
              <span class="grow">
                <strong>{{ i18n.t({ th: 'รายงานจากตู้', en: 'Report from the box' }) }}</strong>
                <span class="muted small block">{{ reportLine(r.body) }}</span>
              </span>
              <span class="muted small">{{ i18n.t(seen(r.at)) }}</span>
            </div>
          } @empty {
            <p class="row muted">{{ i18n.t({ th: 'ตู้ยังไม่เคยส่งรายงาน (ยังไม่เปิดเครื่อง / ยังไม่ต่อ Wi-Fi)', en: 'No reports yet (not powered on / no Wi-Fi yet)' }) }}</p>
          }
        </div>
        @if (b.auth_failures.length) {
          <h2 class="section-title easy-hide">{{ i18n.t({ th: 'คำขอที่ลายเซ็นไม่ผ่าน', en: 'Rejected box requests' }) }}</h2>
          <div class="list easy-hide">
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

      <!-- ใบพิมพ์ QR (ซ่อนบนจอ) — ให้ปุ่ม "พิมพ์ QR" ใน D04 พิมพ์ได้จริง ไม่ใช่กระดาษเปล่า -->
      <div class="print-sheet" aria-hidden="true">
        <h1 style="grid-column: 1 / -1; margin: 0 0 6mm; font-size: 18pt">
          {{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ b.house_no }} · {{ b.id }}
        </h1>
        @for (q of b.qr; track q.id) {
          @if (q.status === 'active') {
            <figure style="margin: 0; text-align: center">
              <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
              <figcaption style="margin-block-start: 3mm; font-size: 11pt">
                <strong>{{ i18n.t(slot(q.slot)) }}</strong><br />
                {{ q.print_code }}
              </figcaption>
            </figure>
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
    @media (min-width: 900px) {
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
      overflow-wrap: break-word;
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
    /* โหมดง่าย (AdmBoxDetail_E): สรุปใหญ่ + ปุ่มหลัก */
    .easy-box {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      margin-block-start: 8px;
    }
    .easy-house {
      font-size: 1.5rem;
      line-height: 1.35;
    }
    .easy-meta {
      font-size: 1rem;
      color: var(--text-muted);
    }
    .easy-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
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
      border-color: var(--brand-text);
      background: var(--brand-lighter);
    }
    .beep.on {
      border-color: var(--brand-text);
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
      color: var(--brand-text);
      border-block-end-color: var(--brand-text);
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
    .fw-auto .row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
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
      /* มือถือ 2 ใบต่อแถว · จอกว้างขึ้นเรื่อย ๆ ตามพื้นที่ (QR ไม่ใหญ่เต็มจอ) */
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
      gap: 8px;
      min-inline-size: 0;
      > * {
        min-inline-size: 0;
      }
      figure {
        margin: 0;
        padding: 8px;
        text-align: center;
        max-inline-size: 240px;
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
  private readonly confirm = inject(Confirm);
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
  protected readonly ovPs = signal('');
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
    { v: 'retry', label: { th: 'ลองอีกครั้ง', en: 'Retry' }, sound: { th: 'ยาว 1 ครั้ง', en: 'long ×1' } },
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
      this.toast.show({ th: 'สั่งทดสอบเสียงไม่สำเร็จ ลองอีกครั้ง', en: 'Could not start the buzzer test — try again' });
    } finally {
      this.beepBusy.set(false);
    }
  }
  protected readonly unbinding = signal(false);
  protected readonly serviceReason = signal('');
  protected readonly serviceBusy = signal(false);
  protected readonly firmware = signal<FirmwareInfo[]>([]);
  /** เวอร์ชันที่ตั้งให้ทุกตู้อัปเดตอัตโนมัติ (null = ปิด) */
  protected readonly fwAuto = signal<string | null>(null);
  protected readonly fwAutoBusy = signal(false);
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
  /** QR ที่ใช้งานอยู่ตอนนี้ (สถานะ active เท่านั้น — QR เปิดใช้ตู้ที่ใช้แล้วย้ายไปรายการประวัติ) */
  protected readonly activeQr = computed(() => (this.box()?.qr ?? []).filter((q) => q.status === 'active'));
  /** เวอร์ชัน QR เปิดใช้ตู้ล่าสุด (มีจริงในข้อมูลตู้) */
  protected readonly activationVersion = computed(() => {
    const list = (this.box()?.qr ?? []).filter((q) => q.slot === 'activate');
    return list.length ? Math.max(...list.map((q) => q.version)) : null;
  });
  /** ที่ใช้แล้ว/ถูกยกเลิก/รุ่นเก่า — พับเก็บไว้ ใหม่สุดก่อน */
  protected readonly pastQr = computed(() =>
    (this.box()?.qr ?? []).filter((q) => q.status !== 'active').sort((a, b) => b.issued_at.localeCompare(a.issued_at)),
  );
  protected readonly pastShown = signal<string | null>(null);
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
      void this.api.firmwareAuto().then((r) => this.fwAuto.set(r.version)).catch(() => undefined); // ไม่ให้กระทบรายการเวอร์ชัน
    } catch (e) {
      // ไม่กระทบหน้าอื่น แต่ต้องบอกว่าโหลดไม่ได้ ไม่ใช่ปล่อยให้ดูเหมือนยังไม่มีไฟล์
      const a = apiError(e);
      this.fwLoadError.set(a.code ?? (a.status ? `HTTP ${a.status}` : 'network'));
    }
  }

  protected fwDate(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
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
              : { th: `อัปโหลดไม่สำเร็จ (${why}) · ต้องเป็นไฟล์ firmware.bin ของ ESP32 ไม่เกิน 1.9 MB และชื่อเวอร์ชันไม่มีช่องว่าง`, en: `Upload failed (${why}) · it must be an ESP32 firmware.bin up to 1.9 MB, and the version name must have no spaces` },
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
    this.ovPs.set(o.wifi_power_save === undefined ? '' : o.wifi_power_save ? 'on' : 'off');
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
    if (this.ovPs()) body.wifi_power_save = this.ovPs() === 'on';
    this.savingOverride.set(true);
    try {
      await this.api.setBoxConfig(id, body);
      await this.reload();
      this.toast.show({ th: 'บันทึกแล้ว · ตู้ได้ค่าใหม่ทันทีที่ติดต่อ', en: 'Saved · the box picks it up at its next contact' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Could not save' });
    } finally {
      this.savingOverride.set(false);
    }
  }

  protected async unbind(): Promise<void> {
    const id = this.id();
    const reason = this.unbindReason().trim();
    if (!id || !reason || this.unbinding()) return;
    if (
      !(await this.confirm.ask({
        title: { th: `คืน ${id} เป็นตู้ใหม่ใช่ไหม?`, en: `Return ${id} as new?` },
        body: {
          th: `เจ้าของเดิมจะไม่เห็นตู้นี้อีก ตู้ถูกถอดออกจากทุกโซนและล้างค่าเฉพาะตู้${this.unbindResetWifi() ? ' · ตู้จะลืม Wi-Fi และต้องตั้งใหม่ที่หน้างาน' : ''}`,
          en: `The owner will no longer see it, it leaves every zone and its per-box settings are cleared${this.unbindResetWifi() ? ' · it forgets its Wi-Fi and must be set up on site' : ''}.`,
        },
        confirm: { th: 'คืนตู้เป็นตู้ใหม่', en: 'Return as new' },
        danger: true,
      }))
    )
      return;
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
        ? { th: 'มี SOS ค้างอยู่ — ปิดเคสก่อน จึงจะยกเลิกการผูกได้', en: 'An SOS is open — close it first' }
        : { th: 'ยกเลิกการผูกไม่สำเร็จ', en: 'Could not unlink' });
    } finally {
      this.unbinding.set(false);
    }
  }

  protected async requestWifiReset(): Promise<void> {
    const id = this.id();
    if (!id || this.resetBusy()) return;
    if (
      !(await this.confirm.ask({
        title: { th: `สั่ง ${id} ลืม Wi-Fi ใช่ไหม?`, en: `Make ${id} forget its Wi-Fi?` },
        body: {
          th: 'ตู้จะหลุดจากเครือข่ายเดิมและต้องตั้งค่า Wi-Fi ใหม่ที่หน้างาน',
          en: 'It leaves the current network and must be set up again on site.',
        },
        confirm: { th: 'สั่งลืม Wi-Fi', en: 'Forget Wi-Fi' },
        danger: true,
      }))
    )
      return;
    this.resetBusy.set(true);
    try {
      await this.api.requestWifiReset(id);
      await this.reload();
      this.toast.show({ th: 'ส่งคำสั่งแล้ว · รอตู้ออนไลน์เพื่อรับ', en: 'Request sent · waiting for the box to be online' });
    } catch {
      this.toast.show({ th: 'สั่งไม่สำเร็จ ลองอีกครั้ง', en: 'Could not send — try again' });
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
      this.toast.show({ th: 'ยกเลิกไม่สำเร็จ ลองอีกครั้ง', en: 'Could not cancel — try again' });
    } finally {
      this.resetBusy.set(false);
    }
  }

  protected async setService(active: boolean): Promise<void> {
    const id = this.id();
    if (!id || this.serviceBusy()) return;
    if (
      !active &&
      !(await this.confirm.ask({
        title: { th: `ปิดบริการ ${id} ใช่ไหม?`, en: `Switch ${id} off?` },
        body: {
          th: 'เจ้าหน้าที่จะตรวจตู้นี้ไม่ได้จนกว่าจะเปิดใหม่',
          en: 'Officers cannot check it until it is switched back on.',
        },
        confirm: { th: 'ปิดบริการ', en: 'Switch off' },
        danger: true,
      }))
    )
      return;
    this.serviceBusy.set(true);
    try {
      await this.api.setService(id, active, this.serviceReason().trim());
      this.serviceReason.set('');
      await this.reload();
      this.toast.show(active ? { th: 'เปิดบริการแล้ว', en: 'Switched on' } : { th: 'ปิดบริการแล้ว · แจ้งเจ้าของบ้านแล้ว', en: 'Switched off · the owner was notified' });
    } catch {
      this.toast.show({ th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Could not change it' });
    } finally {
      this.serviceBusy.set(false);
    }
  }

  protected async removeFirmware(version: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: { th: `ลบไฟล์เฟิร์มแวร์ ${version} ใช่ไหม?`, en: `Delete firmware ${version}?` },
      body: {
        th: 'ตู้ที่รันเวอร์ชันนี้อยู่ไม่กระทบ แต่จะสั่งอัปเดตเป็นเวอร์ชันนี้อีกไม่ได้จนกว่าจะอัปโหลดใหม่',
        en: 'Boxes already running it are not affected, but it can’t be sent again until uploaded again.',
      },
      confirm: { th: 'ลบไฟล์นี้', en: 'Delete it' },
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteFirmware(version);
      await this.loadFirmware();
      this.toast.show({ th: 'ลบแล้ว', en: 'Deleted' });
    } catch {
      this.toast.show({ th: 'ลบไม่สำเร็จ · อาจมีตู้รอโหลดเวอร์ชันนี้อยู่ ให้ยกเลิกงานอัปเดตของตู้นั้นก่อน', en: 'Could not delete · a box may be waiting for it — cancel that update first' });
    }
  }

  protected async setAuto(version: string | null): Promise<void> {
    if (this.fwAutoBusy()) return;
    if (
      version &&
      !(await this.confirm.ask({
        title: { th: `ให้ตู้ทุกใบที่ออนไลน์อัปเดตเป็น ${version} ใช่ไหม?`, en: `Make every online box update to ${version}?` },
        body: {
          th: 'ถ้าไฟล์มีปัญหาจะกระทบทุกตู้ ควรทดสอบกับตู้เดียวก่อน',
          en: 'A bad file affects every box — test on one box first.',
        },
        confirm: { th: 'เปิดอัปเดตอัตโนมัติ', en: 'Turn on auto-update' },
      }))
    )
      return;
    this.fwAutoBusy.set(true);
    try {
      this.fwAuto.set((await this.api.setFirmwareAuto(version)).version);
      this.toast.show(version
        ? { th: `เปิดอัปเดตอัตโนมัติเป็น ${version} แล้ว`, en: `Automatic update to ${version} is on` }
        : { th: 'ปิดอัปเดตอัตโนมัติแล้ว', en: 'Automatic update is off' });
    } catch {
      this.toast.show({ th: 'ตั้งไม่สำเร็จ ลองอีกครั้ง', en: 'Could not change the setting' });
    } finally {
      this.fwAutoBusy.set(false);
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
      this.toast.show({ th: 'สั่งไม่สำเร็จ ลองอีกครั้ง', en: 'Could not send the update' });
    }
  }

  protected windows(b: AdminBoxDetail): string {
    const w = b.config.config.windows ?? [];
    return w.length ? w.map((x) => x.join('–')).join(' · ') : this.i18n.t({ th: 'ยังไม่อยู่ในโซนไหน', en: 'not in any zone' });
  }

  protected reportLine(body: Record<string, unknown>): string {
    const parts: string[] = [];
    const battery = body['battery_pct'];
    if (typeof battery === 'number' || typeof battery === 'string') parts.push(`${battery}%`);
    const rssi = body['rssi'];
    if (typeof rssi === 'number' || typeof rssi === 'string') parts.push(this.i18n.t({ th: `สัญญาณ ${rssi}`, en: `signal ${rssi}` }));
    const fw = body['fw'];
    if (typeof fw === 'string' || typeof fw === 'number') parts.push(this.i18n.t({ th: `เฟิร์มแวร์ ${fw}`, en: `firmware ${fw}` }));
    return parts.join(' · ');
  }

  protected async reveal(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      this.secret.set((await this.api.revealSecret(id)).device_secret);
    } catch {
      this.toast.show({ th: 'เปิดดูไม่สำเร็จ', en: 'Couldn’t load it' });
    }
  }

  protected copy(text: string): void {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    this.toast.show({ th: 'คัดลอกแล้ว', en: 'Copied' });
  }

  protected print(): void {
    window.print();
  }

  /** โหมดง่าย: เปิดแท็บ QR ก่อนแล้วค่อยพิมพ์ (ให้เนื้อหาถูกวาดก่อน) */
  protected openPrint(): void {
    this.tab.set('qr');
    setTimeout(() => this.print(), 60);
  }

  protected async deleteUnusedBox(): Promise<void> {
    const id = this.id();
    if (!id || !this.box()?.can_delete) return;
    const confirmed = await this.confirm.ask({
      title: { th: `ยืนยันลบตู้ ${id}?`, en: `Delete box ${id}?` },
      body: {
        th: 'QR และข้อมูลตู้ที่ยังไม่เปิดใช้จะถูกลบถาวร',
        en: 'Its unused QR codes and box record will be permanently removed.',
      },
      confirm: { th: 'ลบตู้', en: 'Delete the box' },
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.api.deleteBox(id);
      this.toast.show({ th: 'ลบตู้แล้ว', en: 'Box deleted' });
      await this.router.navigateByUrl(this.url('D03'));
    } catch {
      this.toast.show({ th: 'ลบไม่สำเร็จ · ตู้อาจถูกเปิดใช้หรือมีประวัติแล้ว', en: 'Could not delete · the box may be activated or have activity' });
      await this.reload();
    }
  }

  protected async resetConfig(): Promise<void> {
    const id = this.id();
    if (!id || this.resettingConfig()) return;
    const confirmed = await this.confirm.ask({
      title: { th: `คืนค่าการตั้งค่าของ ${id} เป็นค่ากลางใช่ไหม?`, en: `Restore ${id} to shared settings?` },
      body: {
        th: 'เวลาตรวจยังมาจากโซน และระบบจะเก็บ Wi-Fi, รหัสบอร์ด, เจ้าของ, QR และประวัติไว้',
        en: 'Patrol hours stay with its zones. Wi-Fi, board credentials, ownership, QR codes, and history are kept.',
      },
      confirm: { th: 'คืนค่า', en: 'Restore' },
      danger: true,
    });
    if (!confirmed) return;
    this.resettingConfig.set(true);
    try {
      const result = await this.api.resetBoxConfig(id);
      this.ovLoadedFor = null; // ให้ reload เติมช่อง override ใหม่ (ไม่ค้างค่าเก่า)
      await this.reload();
      const synced = this.box()?.config.config_ver === result.config_ver && this.box()?.config.in_sync;
      this.toast.show(synced
        ? { th: 'คืนค่าแล้ว · บอร์ดรับค่ากลางแล้ว', en: 'Restored · the board has applied shared settings' }
        : { th: 'คืนค่าแล้ว · รอบอร์ด sync เมื่อเชื่อมต่อครั้งถัดไป', en: 'Restored · waiting for the board to sync on its next connection' });
    } catch {
      this.toast.show({ th: 'รีเซ็ตไม่สำเร็จ · โปรดโหลดข้อมูลตู้ใหม่', en: 'Could not reset · reload the box and try again' });
    } finally {
      this.resettingConfig.set(false);
    }
  }
}
