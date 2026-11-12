import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminApi, type AdminBoxRow, type RegisteredBox } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { type BoxStatus } from '../../core/owner-api';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { QrImage } from '../../shared/qr-image';
import { LOW_BATTERY_PCT, boxBadge, seenText, SLOT_LABEL } from './admin-box-shared';
export { boxBadge, LOW_BATTERY_PCT, seenText } from './admin-box-shared';

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
      min-block-size: 44px;
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
    @media (hover: hover) {
      .th:hover {
        color: var(--text);
      }
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
      min-block-size: 44px;
    }
    .past-qr .row.past {
      align-items: flex-start;
      gap: 10px;
    }
    .past-qr .row .btn {
      inline-size: auto;
      min-block-size: 44px;
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
        background: var(--qr-bg);
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
