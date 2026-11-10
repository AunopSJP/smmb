import { ChangeDetectionStrategy, Component, computed, effect, inject, Injectable, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppReset } from '../../core/app-reset';
import { DisplaySettings } from '../../core/display-settings';
import { I18n, type Tr } from '../../core/i18n';
import { hhmm } from '../../core/inspection-api';
import { OwnerApi, type BoxDetail, type BoxEvent, type BoxSummary } from '../../core/owner-api';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PrivatePhoto } from '../../shared/private-photo';
import { PageHeader } from '../../shared/page-header';
import { EmptyState, LoadError, LoadingRows } from '../../shared/state-view';

// เจ้าของบ้าน: H12 ประวัติ (การตรวจ · ของมาส่ง) · H12-b / H12-c รายละเอียด · H12-d ตู้ไม่ออนไลน์ · H12-e ช่วงวันที่
// ใช้ API จริง GET /boxes/:box_id/events (api.md §4.3)

type Range = 'today' | '7d' | '30d' | 'all' | 'custom';

const RANGES: { v: Range; label: Tr; days: number | null }[] = [
  { v: 'today', label: { th: 'วันนี้', en: 'Today' }, days: 0 },
  { v: '7d', label: { th: '7 วัน', en: '7 days' }, days: 7 },
  { v: '30d', label: { th: '30 วัน', en: '30 days' }, days: 30 },
  { v: 'custom', label: { th: 'เลือกวันที่', en: 'Pick dates' }, days: null },
];

const KIND: Record<BoxEvent['type'], { icon: IconName; tone: '' | 'warn'; title: Tr; detail: string }> = {
  inspected: { icon: 'shield', tone: '', title: { th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' }, detail: 'H12-b' },
  delivered: { icon: 'box', tone: 'warn', title: { th: 'มีของมาส่ง', en: 'Parcel delivered' }, detail: 'H12-c' },
};

/** "วันนี้" ตามเวลาไทย */
const bkkDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);

/** ช่วงวันที่ (เวลาไทย) ของแต่ละปุ่ม — ส่งให้เซิร์ฟเวอร์กรอง · all/custom ไม่มีช่วงในตัว */
const rangeOf = (days: number | null): { from?: string } => (days === null ? {} : { from: bkkDay(new Date(Date.now() - days * 86_400_000)) });

/** เหตุการณ์ที่โหลดแล้ว — หน้ารายละเอียดหยิบจากที่นี่ (ไม่ต้องโหลดใหม่) */
@Injectable({ providedIn: 'root' })
export class OwnerHistoryStore {
  private readonly api = inject(OwnerApi);
  readonly boxes = signal<BoxSummary[]>([]);
  readonly boxId = signal<string | null>(null);
  readonly events = signal<BoxEvent[]>([]);
  readonly more = signal(false);
  readonly loading = signal(false);
  /** โหลดครั้งแรกไม่สำเร็จ (แยกจาก "ไม่มีข้อมูลจริง") */
  readonly loadFailed = signal(false);
  readonly initialized = signal(false);
  readonly selection = signal<Range>('7d');
  readonly customFrom = signal('');
  readonly customTo = signal('');
  private page = 1;

  constructor() {
    // ออกจากระบบ/สลับบัญชี → ล้างประวัติของเจ้าของเดิม (เครื่องใช้ร่วม)
    inject(AppReset).register(() => {
      this.boxes.set([]);
      this.boxId.set(null);
      this.events.set([]);
      this.more.set(false);
      this.loading.set(false);
      this.loadFailed.set(false);
      this.initialized.set(false);
      this.selection.set('7d');
      this.customFrom.set('');
      this.customTo.set('');
      this.range.set({});
      this.page = 1;
    });
  }

  /** ช่วงวันที่ที่กรองอยู่ (ว่าง = ทั้งหมด) */
  readonly range = signal<{ from?: string; to?: string }>({});

  async load(boxId?: string, range?: { from?: string; to?: string }): Promise<void> {
    if (range) this.range.set(range);
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      if (!this.boxes().length) this.boxes.set(await this.api.boxes());
      const id = boxId ?? this.boxId() ?? this.boxes()[0]?.id ?? null;
      this.boxId.set(id);
      this.page = 1;
      if (!id) {
        this.events.set([]);
        return;
      }
      const r = await this.api.events(id, 1, this.range());
      this.events.set(r.data);
      this.more.set(r.data.length === r.per_page);
    } catch {
      // ไม่มีข้อมูลเดิม → แสดง error+retry (ห้ามขึ้น "ยังไม่มีเหตุการณ์")
      if (!this.events().length) this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
      this.initialized.set(true);
    }
  }

  async loadMore(): Promise<void> {
    const id = this.boxId();
    if (!id) return;
    const next = this.page + 1;
    try {
      const r = await this.api.events(id, next, this.range());
      this.page = next;
      this.events.update((e) => [...e, ...r.data]);
      this.more.set(r.data.length === r.per_page);
    } catch {
      // เก็บหน้าเดิมไว้ให้กดซ้ำได้
    }
  }

  async find(id: string | undefined): Promise<BoxEvent | null> {
    if (!this.events().length) await this.load();
    return this.events().find((e) => e.id === id) ?? null;
  }
}

const dateTime = (iso: string, lang: 'th' | 'en') =>
  new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

/** เวลาแบบมีวินาที (โหมดละเอียด) */
const clockSec = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });

// ── H12 · ประวัติ ──────────────────────────────────────────────

@Component({
  selector: 'app-owner-history',
  imports: [RouterLink, PageHeader, Icon, LoadingRows, EmptyState, LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="caption()" [title]="i18n.t({ th: 'ประวัติ', en: 'History' })" [bell]="url('H14')" />
    <div class="stack">
      @if (store.boxes().length > 1) {
        <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'ตู้', en: 'Mailbox' })">
          @for (b of store.boxes(); track b.id) {
            <button type="button" [attr.aria-pressed]="store.boxId() === b.id" (click)="store.load(b.id)">{{ b.house_no }} · {{ b.name }}</button>
          }
        </div>
      }
      <div class="segmented easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'ช่วงเวลา', en: 'Period' })">
        @for (r of ranges; track r.v) {
          <button type="button" [attr.aria-pressed]="range() === r.v" (click)="pick(r.v)">{{ i18n.t(r.label) }}</button>
        }
      </div>
      <div class="segmented chips easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'ประเภท', en: 'Type' })">
        @for (t of types; track t.v) {
          <button type="button" [class.adv-only]="t.v === 'photo'" [attr.aria-pressed]="typeFilter() === t.v" (click)="typeFilter.set(t.v)">{{ i18n.t(t.label) }}</button>
        }
      </div>
      @if (range() === 'custom') {
        <form class="dates card easy-hide" (submit)="$event.preventDefault(); applyCustom()">
          <label class="field">
            <span>{{ i18n.t({ th: 'ตั้งแต่วันที่', en: 'From' }) }}</span>
            <input type="date" [max]="today" [value]="from()" (input)="from.set($any($event.target).value)" />
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'ถึงวันที่', en: 'To' }) }}</span>
            <input type="date" [max]="today" [value]="to()" (input)="to.set($any($event.target).value)" />
          </label>
          @if (rangeError()) {
            <p class="danger-text small" role="alert">{{ i18n.t(rangeError()!) }}</p>
          }
          <button type="submit" class="btn" [disabled]="!from() && !to()">{{ i18n.t({ th: 'ดูช่วงนี้', en: 'Show' }) }}</button>
        </form>
      }

      @if (items().length) {
        <div class="counts adv-only">
          <span>{{ i18n.t({ th: 'ทั้งหมด', en: 'All' }) }} {{ items().length }}</span>
          <span>{{ i18n.t({ th: 'ตรวจ', en: 'Checks' }) }} {{ countType('inspected') }}</span>
          <span>{{ i18n.t({ th: 'ส่งของ', en: 'Parcels' }) }} {{ countType('delivered') }}</span>
        </div>
      }

      @if (display.easyMode()) {
        <!-- OwnHistory_E: การ์ดใหญ่ อ่านง่าย ไม่มีตัวกรอง -->
        @for (h of items(); track h.id) {
          @let k = kind[h.type];
          <a class="row easy-ev" [routerLink]="url(k.detail)" [queryParams]="{ id: h.id, box: store.boxId() }">
            <span class="icon-bubble" [class.warn]="k.tone === 'warn'"><app-icon [name]="k.icon" [size]="26" /></span>
            <span class="grow">
              <strong>{{ i18n.t(k.title) }}</strong>
              <span class="muted small block">{{ whenDay(h.at) }} {{ time(h.at) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="22" />
          </a>
        } @empty {
          @if (store.loading()) {
            <app-loading-rows [rows]="4" [label]="i18n.t({ th: 'กำลังโหลดประวัติ', en: 'Loading history' })" />
          } @else if (store.loadFailed()) {
            <app-load-error (retry)="store.load()" />
          } @else {
            <app-empty-state
              icon="list"
              [title]="i18n.t({ th: 'ยังไม่มีเหตุการณ์ในช่วงนี้', en: 'No activity in this period' })"
              [hint]="i18n.t({ th: 'ลองเลือกช่วงเวลากว้างขึ้น หรือรอเจ้าหน้าที่มาตรวจครั้งถัดไป', en: 'Try a wider date range, or wait for the next patrol check.' })"
            />
          }
        }
      } @else {
        @for (g of groups(); track g.key) {
          <h2 class="day">{{ g.label }}</h2>
          <nav class="list">
            @for (h of g.items; track h.id) {
              @let k = kind[h.type];
              <a class="row" [routerLink]="url(k.detail)" [queryParams]="{ id: h.id, box: store.boxId() }">
                <span class="icon-bubble" [class.warn]="k.tone === 'warn'">
                  <app-icon [name]="k.icon" [size]="20" />
                </span>
                <span class="grow">
                  <strong>{{ i18n.t(k.title) }}</strong>
                  <span class="muted small block">{{ sub(h) }}</span>
                  <span class="muted small block adv-only mono">{{ tech(h) }}</span>
                </span>
                <span class="muted small when">{{ time(h.at) }}</span>
              </a>
            }
          </nav>
        } @empty {
          @if (store.loading()) {
            <app-loading-rows [rows]="5" [label]="i18n.t({ th: 'กำลังโหลดประวัติ', en: 'Loading history' })" />
          } @else if (store.loadFailed()) {
            <app-load-error (retry)="store.load()" />
          } @else {
            <app-empty-state
              icon="list"
              [title]="i18n.t({ th: 'ยังไม่มีเหตุการณ์ในช่วงนี้', en: 'No activity in this period' })"
              [hint]="i18n.t({ th: 'ลองเลือกช่วงเวลากว้างขึ้น หรือรอเจ้าหน้าที่มาตรวจครั้งถัดไป', en: 'Try a wider date range, or wait for the next patrol check.' })"
            />
          }
        }
      }
      @if (store.more()) {
        <button type="button" class="btn secondary" (click)="store.loadMore()">{{ i18n.t({ th: 'ดูเก่ากว่านี้', en: 'Older' }) }}</button>
      }
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
    .segmented {
      flex-wrap: wrap;
    }
    .dates {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .day {
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--text-muted);
      margin: 6px 4px -4px;
    }
    .when {
      white-space: nowrap;
    }
    .counts {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding-inline: 4px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    /* OwnHistory_E: การ์ดใหญ่ กดง่าย */
    .easy-ev {
      background: var(--surface);
      border-radius: var(--radius);
      padding: 18px;
      box-shadow: var(--shadow);
      text-decoration: none;
      color: inherit;
      strong {
        font-size: 1.25rem;
      }
      .muted {
        font-size: 1rem;
      }
    }
  `,
})
export class OwnerHistory {
  protected readonly i18n = inject(I18n);
  protected readonly store = inject(OwnerHistoryStore);
  protected readonly url = screenUrl;
  protected readonly ranges = RANGES;
  protected readonly kind = KIND;
  protected readonly range = this.store.selection;
  protected readonly caption = computed(() => {
    const b = this.store.boxes().find((x) => x.id === this.store.boxId());
    return b ? this.i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + b.house_no + (this.display.advancedMode() ? ' · ' + b.id : '') : '';
  });
  /** รายการที่เซิร์ฟเวอร์กรองตามช่วงมาให้แล้ว */
  protected readonly display = inject(DisplaySettings);
  protected readonly typeFilter = signal<'all' | BoxEvent['type'] | 'photo'>('all');
  protected readonly types: { v: 'all' | BoxEvent['type'] | 'photo'; label: Tr }[] = [
    { v: 'all', label: { th: 'ทั้งหมด', en: 'All' } },
    { v: 'inspected', label: { th: 'เจ้าหน้าที่ตรวจ', en: 'Officer checks' } },
    { v: 'delivered', label: { th: 'ของมาส่ง', en: 'Parcels' } },
    { v: 'photo', label: { th: 'มีรูป', en: 'With photo' } },
  ];
  protected readonly items = computed(() =>
    this.store.events().filter((e) =>
      this.typeFilter() === 'all'
        ? true
        : this.typeFilter() === 'photo'
          ? e.has_photo === true
          : e.type === this.typeFilter(),
    ),
  );
  /** แบ่งหัววัน: วันนี้ / เมื่อวาน / วันที่ */
  protected readonly groups = computed(() => {
    const out: { key: string; label: string; items: BoxEvent[] }[] = [];
    const now = new Date();
    const today = bkkDay(now);
    const yesterday = bkkDay(new Date(now.getTime() - 86_400_000));
    for (const e of this.items()) {
      const key = bkkDay(new Date(e.at));
      let g = out.find((x) => x.key === key);
      if (!g) {
        const label =
          key === today
            ? this.i18n.t({ th: 'วันนี้', en: 'Today' })
            : key === yesterday
              ? this.i18n.t({ th: 'เมื่อวาน', en: 'Yesterday' })
              : new Date(e.at).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
        g = { key, label, items: [] };
        out.push(g);
      }
      g.items.push(e);
    }
    return out;
  });
  protected readonly time = hhmm;
  protected readonly today = bkkDay(new Date());
  protected readonly from = this.store.customFrom;
  protected readonly to = this.store.customTo;
  protected readonly rangeError = signal<Tr | null>(null);

  /** เลือกปุ่มช่วงเวลา — ปุ่มสำเร็จรูปโหลดใหม่ทันที · "เลือกวันที่" รอให้กรอกก่อน */
  protected pick(v: Range): void {
    this.store.selection.set(v);
    this.rangeError.set(null);
    if (v === 'custom') return;
    const days = RANGES.find((r) => r.v === v)!.days;
    void this.store.load(undefined, rangeOf(days));
  }

  protected applyCustom(): void {
    const from = this.from();
    const to = this.to();
    if (from && to && from > to) {
      this.rangeError.set({ th: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด', en: '“From” must not be after “To”' });
      return;
    }
    this.rangeError.set(null);
    void this.store.load(undefined, { ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }

  constructor() {
    // Keep the selected mailbox and date range when returning from an event detail.
    const range = this.store.initialized()
      ? this.store.range()
      : rangeOf(RANGES.find((r) => r.v === this.range())!.days);
    // ?type=delivered จากปุ่ม "ของมาส่ง" บนหน้าหลัก (โหมดง่าย)
    const wanted = inject(ActivatedRoute).snapshot.queryParamMap.get('type');
    if (wanted === 'inspected' || wanted === 'delivered') this.typeFilter.set(wanted);
    void this.store.load(undefined, range);
  }

  protected sub(h: BoxEvent): string {
    if (h.type === 'inspected') return `${h.officer?.agency_name ?? ''} · ${h.officer?.display_name ?? ''}`;
    return `${this.i18n.t(h.method === 'code' ? { th: 'ไรเดอร์พิมพ์รหัส', en: 'rider typed the code' } : { th: 'ไรเดอร์สแกน QR', en: 'rider scanned the QR' })}`;
  }

  /** OwnHistory_A: ข้อมูลเพิ่มเติมแบบอ่านรู้เรื่อง (ไม่มีรหัสภายใน) */
  protected tech(h: BoxEvent): string {
    const qr = h.qr_slot === 2
      ? this.i18n.t({ th: 'QR สำรอง', en: 'Backup QR' })
      : this.i18n.t({ th: 'QR หน้าตู้', en: 'Front QR' });
    if (h.type === 'inspected') {
      return [qr, h.has_photo ? this.i18n.t({ th: 'มีรูปยืนยัน', en: 'photo attached' }) : '', clockSec(h.at)].filter((x) => x).join(' · ');
    }
    return [
      this.i18n.t(h.method === 'code' ? { th: 'พิมพ์รหัส', en: 'typed code' } : { th: 'สแกน QR', en: 'QR scan' }),
      clockSec(h.at),
    ].filter((x) => x).join(' · ');
  }

  protected countType(t: BoxEvent['type']): number {
    return this.items().filter((e) => e.type === t).length;
  }

  /** "เมื่อวาน 21:40" สำหรับการ์ดโหมดง่าย */
  protected whenDay(iso: string): string {
    const key = bkkDay(new Date(iso));
    const now = new Date();
    if (key === bkkDay(now)) return this.i18n.t({ th: 'วันนี้', en: 'today' });
    if (key === bkkDay(new Date(now.getTime() - 86_400_000))) return this.i18n.t({ th: 'เมื่อวาน', en: 'yesterday' });
    return new Date(iso).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
  }
}

/** หยิบเหตุการณ์ตาม ?id= — ไม่เจอ → ลองโหลดของตู้ที่ระบุ (?box=) ก่อน แล้วค่อยกลับหน้าประวัติ */
function useEvent(type: BoxEvent['type']) {
  const store = inject(OwnerHistoryStore);
  const router = inject(Router);
  const event = signal<BoxEvent | null>(null);
  return {
    event,
    load: async (id: string | undefined, boxId?: string) => {
      if (!id) {
        void router.navigateByUrl(screenUrl('H12'));
        return;
      }
      let e = await store.find(id);
      // เหตุการณ์เก่ากว่าช่วงที่โหลดไว้ หรืออยู่ตู้ที่ 2 → โหลดของตู้นั้นแบบไม่กรองช่วงแล้วหาใหม่
      if (!e && boxId) {
        await store.load(boxId, {});
        e = store.events().find((x) => x.id === id) ?? null;
      }
      if (e && e.type === type) event.set(e);
      else void router.navigateByUrl(screenUrl('H12'));
    },
  };
}

// ── H12-b · รายละเอียดการตรวจ ─────────────────────────────────

@Component({
  selector: 'app-owner-inspection',
  imports: [PageHeader, PrivatePhoto, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ประวัติ', en: 'History' })" [title]="i18n.t({ th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' })" [back]="url('H12')" />
    @if (ev.event(); as h) {
      <div class="stack">
        @if (display.easyMode()) {
          <section class="ok-hero">
            <span class="okc"><app-icon name="check" [size]="28" /></span>
            <div>
              <strong>{{ i18n.t({ th: 'ตรวจผ่านเรียบร้อย', en: 'Checked and passed' }) }}</strong>
              <span class="muted small block">{{ when(h.at) }}</span>
            </div>
          </section>
        } @else {
          <section class="card result-card">
            <div class="result-head">
              <span class="okc compact"><app-icon name="check" [size]="20" /></span>
              <div class="grow">
                <strong>{{ i18n.t({ th: 'ตรวจผ่านเรียบร้อย', en: 'Checked and passed' }) }}</strong>
                <span class="muted small block">{{ when(h.at) }}</span>
              </div>
              <span class="chip ok">{{ i18n.t({ th: 'ผ่าน', en: 'Passed' }) }}</span>
            </div>
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' }) }}</dt><dd>{{ h.officer?.display_name }}</dd>
              <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ h.officer?.agency_name }}</dd>
              <dt class="adv-only">{{ i18n.t({ th: 'วันเวลา', en: 'Date' }) }}</dt><dd class="adv-only">{{ exact(h.at) }}</dd>
              <dt class="adv-only">{{ i18n.t({ th: 'QR ที่สแกน', en: 'QR scanned' }) }}</dt><dd class="adv-only">{{ h.qr_slot === 2 ? i18n.t({ th: 'QR สำรอง', en: 'Backup QR' }) : i18n.t({ th: 'QR หน้าตู้', en: 'Front QR' }) }}</dd>
              <dt class="adv-only">{{ i18n.t({ th: 'วิธี', en: 'Method' }) }}</dt><dd class="adv-only">{{ h.method === 'code' ? i18n.t({ th: 'พิมพ์รหัส', en: 'Typed code' }) : i18n.t({ th: 'สแกน', en: 'Scan' }) }}</dd>
              <dt class="adv-only">{{ i18n.t({ th: 'รูปยืนยัน', en: 'Photo' }) }}</dt><dd class="adv-only">{{ h.has_photo ? i18n.t({ th: 'มี · เก็บ 30 วัน', en: 'Yes · kept 30 days' }) : i18n.t({ th: 'ไม่มี', en: 'None' }) }}</dd>
            </dl>
          </section>
        }
        @if (h.has_photo) {
          <section class="card stack">
            <strong>{{ i18n.t({ th: 'รูปยืนยันตัวเจ้าหน้าที่', en: 'Officer confirmation photo' }) }}</strong>
            <app-private-photo [src]="'/api/v1/me/inspection-photos/' + h.id" [alt]="i18n.t({ th: 'รูปเจ้าหน้าที่ที่มาตรวจ', en: 'Photo of the inspecting officer' })" />
          </section>
        } @else {
          <p class="muted small">{{ i18n.t({ th: 'ไม่มีรูปยืนยัน (เจ้าหน้าที่ไม่ได้ถ่าย หรือเกิน 30 วันแล้ว)', en: 'No confirmation photo (not taken, or older than 30 days).' }) }}</p>
        }
        <p class="muted small">{{ i18n.t({ th: 'ตู้ยืนยันด้วยการสแกน QR ประจำตัวของเจ้าหน้าที่ — ปลอมไม่ได้', en: 'The mailbox verified the officer’s personal QR — it cannot be faked' }) }}</p>
        <p class="muted small">{{ i18n.t({ th: 'ข้อมูลนี้เห็นได้เฉพาะคุณและผู้ดูแลระบบ รูปจะถูกลบอัตโนมัติเมื่อครบ 30 วัน', en: 'Only you and the admin can see this. Photos are deleted automatically after 30 days.' }) }}</p>
      </div>
    }
  `,
  styles: `
    .ok-hero {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px;
      border-radius: 20px;
      background: var(--ok-bg);
      color: var(--ok);
      strong { font-size: 1.125rem; }
    }
    .okc {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 48px;
      block-size: 48px;
      border-radius: 50%;
      background: var(--ok);
      color: #fff;
    }
    .okc.compact {
      inline-size: 36px;
      block-size: 36px;
    }
    .result-card {
      padding: 16px;
    }
    .result-head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-block-end: 12px;
      margin-block-end: 12px;
      border-block-end: 1px solid var(--line);
    }
    .result-head strong {
      font-size: 1rem;
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
  `,
})
export class OwnerInspection {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly display = inject(DisplaySettings);
  readonly id = input<string>();
  readonly box = input<string>();
  protected readonly ev = useEvent('inspected');

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.ev.load(id, this.box()));
    });
  }

  protected when(iso: string): string {
    return dateTime(iso, this.i18n.lang());
  }

  protected exact(iso: string): string {
    return clockSec(iso);
  }
}

// ── H12-c · รายละเอียดของมาส่ง ─────────────────────────────────

@Component({
  selector: 'app-owner-delivery',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ประวัติ', en: 'History' })" [title]="i18n.t({ th: 'มีของมาส่ง', en: 'Parcel delivered' })" [back]="url('H12')" />
    @if (ev.event(); as h) {
      <div class="stack">
        @if (display.easyMode()) {
          <section class="ok-hero info">
            <span class="okc"><app-icon name="box" [size]="28" /></span>
            <div>
              <strong>{{ i18n.t({ th: 'มีของมาส่งที่ตู้', en: 'A parcel arrived' }) }}</strong>
              <span class="muted small block">{{ when(h.at) }}</span>
            </div>
          </section>
        } @else {
          <section class="card result-card">
            <div class="result-head">
              <span class="okc compact"><app-icon name="box" [size]="20" /></span>
              <div class="grow">
                <strong>{{ i18n.t({ th: 'มีของมาส่งที่ตู้', en: 'A parcel arrived' }) }}</strong>
                <span class="muted small block">{{ when(h.at) }}</span>
              </div>
              <span class="chip">{{ i18n.t({ th: 'แจ้งแล้ว', en: 'Delivered' }) }}</span>
            </div>
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'แจ้งโดย', en: 'Reported by' }) }}</dt><dd>{{ i18n.t({ th: 'ไรเดอร์', en: 'Rider' }) }}</dd>
              <dt class="adv-only">{{ i18n.t({ th: 'วันเวลา', en: 'Date' }) }}</dt><dd class="adv-only">{{ exact(h.at) }}</dd>
              <dt class="adv-only">{{ i18n.t({ th: 'วิธี', en: 'Method' }) }}</dt><dd class="adv-only">{{ h.method === 'code' ? i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Typed the code' }) : i18n.t({ th: 'สแกน QR หน้าตู้', en: 'Scanned the front QR' }) }}</dd>
              <dt class="adv-only">{{ i18n.t({ th: 'QR ที่ใช้', en: 'QR used' }) }}</dt><dd class="adv-only">{{ h.qr_slot === 2 ? i18n.t({ th: 'QR สำรอง', en: 'Backup QR' }) : i18n.t({ th: 'QR หน้าตู้', en: 'Front QR' }) }}</dd>
            </dl>
          </section>
        }
        <p class="muted small">{{ i18n.t({ th: 'ระบบไม่เก็บข้อมูลตัวตนของไรเดอร์', en: 'No rider identity is stored' }) }}</p>
        <p class="muted small">{{ i18n.t({ th: 'ไม่ได้สั่งของ? ถ้าไม่มีของในตู้ แจ้งผู้ดูแลได้ — ระบบเก็บบันทึกไว้แก้ไม่ได้', en: 'Not expecting a parcel? If the box is empty, tell the admin — the log cannot be edited.' }) }}</p>
      </div>
    }
  `,
  styles: `
    .ok-hero {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px;
      border-radius: 20px;
      background: var(--bg);
      strong { font-size: 1.125rem; }
    }
    .okc {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 48px;
      block-size: 48px;
      border-radius: 50%;
      background: var(--action-bg);
      color: var(--action-fg);
    }
    .okc.compact {
      inline-size: 36px;
      block-size: 36px;
    }
    .result-card {
      padding: 16px;
    }
    .result-head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-block-end: 12px;
      margin-block-end: 12px;
      border-block-end: 1px solid var(--line);
    }
    .result-head strong {
      font-size: 1rem;
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
  `,
})
export class OwnerDelivery {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly display = inject(DisplaySettings);
  readonly id = input<string>();
  readonly box = input<string>();
  protected readonly ev = useEvent('delivered');

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.ev.load(id, this.box()));
    });
  }

  protected when(iso: string): string {
    return dateTime(iso, this.i18n.lang());
  }

  protected exact(iso: string): string {
    return clockSec(iso);
  }
}

// ── H12-d · ตู้ไม่ออนไลน์ (เปิดจากแจ้งเตือน · ตามแคนวาสดีไซน์ OwnOffline) ────────────

@Component({
  selector: 'app-owner-offline',
  imports: [PageHeader, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="display.advancedMode() ? (box()?.id ?? '') : ''" [title]="i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' })" [back]="url('H12')" />
    <div class="stack grow">
      @if (display.easyMode()) {
        <!-- OwnOffline_E: ข้อความใหญ่ + เช็กสั้น ๆ -->
        <section class="easy-warn">
          <strong>{{ i18n.t({ th: 'ตู้ติดต่อไม่ได้', en: 'The mailbox is offline' }) }}</strong>
          <span>{{ i18n.t({ th: 'ตอนนี้ตรวจตู้และรับของไม่ได้ แต่ปุ่ม SOS ยังใช้ได้ตามปกติ', en: 'Checks and parcels cannot be recorded now, but SOS still works' }) }}</span>
        </section>
        <section class="card easy-check">
          <strong>{{ i18n.t({ th: 'ลองดูก่อน', en: 'Try this first' }) }}</strong>
          <span>{{ i18n.t({ th: 'ไฟตู้ติดอยู่ไหม', en: 'Is the box powered on?' }) }}</span>
          <span>{{ i18n.t({ th: 'Wi-Fi ที่บ้านใช้ได้ไหม', en: 'Is your home Wi-Fi working?' }) }}</span>
        </section>
      } @else {
        <section class="hero-warn">
          <span class="circ"><app-icon name="wifi" [size]="30" /></span>
          <strong>{{ headline() }}</strong>
          <span>{{ i18n.t({ th: 'ระหว่างนี้ตรวจตู้และรับของไม่ได้ SOS ยังใช้ได้ตามปกติ', en: 'Until it is back, inspections and parcels cannot be recorded. SOS still works.' }) }}</span>
        </section>
        <section class="card stack easy-hide">
          <strong>{{ i18n.t({ th: 'ลองเช็กตามนี้ก่อน', en: 'Try these first' }) }}</strong>
          <ol class="steps">
            <li><span class="n">1</span><span><strong>{{ i18n.t({ th: 'ตรวจไฟของตู้', en: 'Check the box power' }) }}</strong><small>{{ i18n.t({ th: 'มีคนถอดปลั๊กหรือปิดสวิตช์หรือเปล่า', en: 'Was it unplugged or switched off?' }) }}</small></span></li>
            <li><span class="n">2</span><span><strong>{{ i18n.t({ th: 'ตรวจ Wi-Fi บ้าน', en: 'Check your home Wi-Fi' }) }}</strong><small>{{ i18n.t({ th: 'ลองรีสตาร์ตเราเตอร์ ตู้ต่อได้เฉพาะ 2.4 GHz', en: 'Restart the router — the box only works on 2.4 GHz' }) }}</small></span></li>
            <li><span class="n">3</span><span><strong>{{ i18n.t({ th: 'รอสักครู่', en: 'Wait a little' }) }}</strong><small>{{ i18n.t({ th: 'แผงโซลาร์ต้องได้รับแดดในตอนกลางวัน', en: 'The solar panel needs daylight' }) }}</small></span></li>
          </ol>
        </section>
      }
      @if (display.advancedMode() && box(); as b) {
        <!-- OwnOffline_A: ตัวเลขจริงจาก GET /boxes/:id -->
        <div class="adv-grid">
          <div class="cell"><span class="label">{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</span><strong class="value mono">{{ b.id }}</strong></div>
          <div class="cell"><span class="label">{{ i18n.t({ th: 'สถานะ', en: 'State' }) }}</span><strong class="value mono">{{ b.status }}</strong></div>
          <div class="cell"><span class="label">{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last contact' }) }}</span><strong class="value mono">{{ b.last_seen_at ? exact(b.last_seen_at) : '—' }}</strong></div>
          <div class="cell"><span class="label">{{ i18n.t({ th: 'แบตก่อนหลุด', en: 'Battery' }) }}</span><strong class="value">{{ b.battery ? b.battery.pct + '%' : '—' }}</strong></div>
          <div class="cell"><span class="label">{{ i18n.t({ th: 'รายงานแบตเมื่อ', en: 'Battery reported' }) }}</span><strong class="value mono">{{ b.battery?.reported_at ? exact(b.battery!.reported_at!) : '—' }}</strong></div>
          <div class="cell"><span class="label">{{ i18n.t({ th: 'ชาร์จ', en: 'Charging' }) }}</span><strong class="value">{{ b.battery?.charging === null || !b.battery ? '—' : b.battery.charging ? i18n.t({ th: 'กำลังชาร์จ', en: 'Charging' }) : i18n.t({ th: 'ไม่ได้ชาร์จ', en: 'Not charging' }) }}</strong></div>
        </div>
        <section class="card adv-cause">
          <strong>{{ i18n.t({ th: 'สาเหตุที่เป็นไปได้ (เรียงตามโอกาส)', en: 'Likely causes (most likely first)' }) }}</strong>
          <ol>
            <li>{{ i18n.t({ th: 'สัญญาณ Wi-Fi อ่อน', en: 'Weak Wi-Fi signal' }) }}</li>
            <li>{{ i18n.t({ th: 'ไฟตัด / แบตต่ำ', en: 'Power cut / low battery' }) }}</li>
            <li>{{ i18n.t({ th: 'เราเตอร์รีสตาร์ต / เปลี่ยนรหัส Wi-Fi', en: 'Router restarted / Wi-Fi password changed' }) }}</li>
            <li>{{ i18n.t({ th: 'ใช้ 5 GHz (ตู้รับเฉพาะ 2.4 GHz)', en: 'Using 5 GHz (the box only supports 2.4 GHz)' }) }}</li>
          </ol>
        </section>
      }
      <section class="card last">
        <span class="muted small">{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last contact' }) }}</span>
        <strong>{{ lastText() }}</strong>
      </section>
      <div class="stack push-end">
        <a class="btn" [routerLink]="url('H13-c')">{{ i18n.t({ th: 'แจ้งช่างมาดู', en: 'Ask a technician' }) }}</a>
        <a class="btn secondary" [routerLink]="url('H13-b')">{{ i18n.t({ th: 'เปลี่ยน Wi-Fi บ้าน', en: 'Change home Wi-Fi' }) }}</a>
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .hero-warn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      text-align: center;
      padding: 20px;
      border-radius: 22px;
      background: var(--ib-warn-bg);
      color: var(--ib-warn-fg);
    }
    .circ {
      display: grid;
      place-items: center;
      inline-size: 64px;
      block-size: 64px;
      border-radius: 50%;
      background: #9a5b00;
      color: #fff;
    }
    .hero-warn strong {
      font-size: 1.25rem;
      line-height: 1.35;
    }
    .easy-warn {
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: center;
      padding: 26px 20px;
      border-radius: var(--radius);
      background: var(--ib-warn-bg);
      color: var(--ib-warn-fg);
      strong { font-size: 1.875rem; line-height: 1.3; }
      span { font-size: 1.125rem; line-height: 1.5; }
    }
    .easy-check {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 1.125rem;
      line-height: 1.55;
      strong { font-size: 1.25rem; }
    }
    .adv-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px;
      border-radius: var(--radius-sm);
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    .label { font-size: 0.6875rem; color: var(--text-muted); }
    .adv-cause ol { margin: 6px 0 0; padding-inline-start: 20px; font-size: 0.8125rem; line-height: 1.7; }
    .steps {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .steps li {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .steps .n {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 28px;
      block-size: 28px;
      border-radius: 50%;
      background: var(--ib-bg);
      color: var(--ib-fg);
      font-weight: 700;
      font-size: 0.8125rem;
    }
    .steps small {
      display: block;
      color: var(--text-muted);
    }
    .last {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  `,
})
export class OwnerOffline {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(OwnerApi);
  protected readonly url = screenUrl;
  protected readonly box = signal<BoxDetail | null>(null);

  protected readonly headline = computed(() => {
    const b = this.box();
    const name = b?.name ?? this.i18n.t({ th: 'ตู้', en: 'The mailbox' });
    const m = b?.last_seen_at ? Math.max(1, Math.round((Date.now() - new Date(b.last_seen_at).getTime()) / 60000)) : null;
    return m === null
      ? this.i18n.t({ th: name + 'ยังไม่เคยติดต่อมา', en: name + ' has not connected yet' })
      : this.i18n.t({ th: name + 'ไม่ติดต่อมา ' + m + ' นาที', en: name + ' last connected ' + m + ' min ago' });
  });

  protected readonly lastText = computed(() => {
    const b = this.box();
    if (!b?.last_seen_at) return '—';
    const batt = b.battery ? ' · ' + this.i18n.t({ th: 'แบต ', en: 'battery ' }) + b.battery.pct + '%' : '';
    return new Date(b.last_seen_at).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) + batt;
  });

  protected exact(iso: string): string {
    return clockSec(iso);
  }

  constructor() {
    void this.api
      .boxes()
      .then((list) => (list[0] ? this.api.box(list[0].id) : null))
      .then((b) => this.box.set(b))
      .catch(() => undefined);
  }
}

// ── H12-e · เลือกช่วงวันที่ — ใช้ปุ่มช่วงเวลาในหน้า H12 แทน ──────────

@Component({
  selector: 'app-owner-range',
  template: '',
})
export class OwnerRange {
  constructor() {
    void inject(Router).navigateByUrl(screenUrl('H12'), { replaceUrl: true });
  }
}


