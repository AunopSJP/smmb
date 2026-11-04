import { ChangeDetectionStrategy, Component, computed, effect, inject, Injectable, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { OwnerApi, type BoxEvent, type BoxSummary } from '../../core/owner-api';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PrivatePhoto } from '../../shared/private-photo';
import { PageHeader } from '../../shared/page-header';

// เจ้าของบ้าน: H12 ประวัติ (การตรวจ · ของมาส่ง) · H12-b / H12-c รายละเอียด · H12-d ตู้ไม่ออนไลน์ · H12-e ช่วงวันที่
// ใช้ API จริง GET /boxes/:box_id/events (api.md §4.3)

type Range = 'today' | '7d' | '30d' | 'all' | 'custom';

const RANGES: { v: Range; label: Tr; days: number | null }[] = [
  { v: 'today', label: { th: 'วันนี้', en: 'Today' }, days: 0 },
  { v: '7d', label: { th: '7 วัน', en: '7 days' }, days: 7 },
  { v: '30d', label: { th: '30 วัน', en: '30 days' }, days: 30 },
  { v: 'all', label: { th: 'ทั้งหมด', en: 'All' }, days: null },
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
  readonly initialized = signal(false);
  readonly selection = signal<Range>('7d');
  readonly customFrom = signal('');
  readonly customTo = signal('');
  private page = 1;

  /** ช่วงวันที่ที่กรองอยู่ (ว่าง = ทั้งหมด) */
  readonly range = signal<{ from?: string; to?: string }>({});

  async load(boxId?: string, range?: { from?: string; to?: string }): Promise<void> {
    if (range) this.range.set(range);
    this.loading.set(true);
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
    } finally {
      this.loading.set(false);
      this.initialized.set(true);
    }
  }

  async loadMore(): Promise<void> {
    const id = this.boxId();
    if (!id) return;
    this.page++;
    const r = await this.api.events(id, this.page, this.range());
    this.events.update((e) => [...e, ...r.data]);
    this.more.set(r.data.length === r.per_page);
  }

  async find(id: string | undefined): Promise<BoxEvent | null> {
    if (!this.events().length) await this.load();
    return this.events().find((e) => e.id === id) ?? null;
  }
}

const dateTime = (iso: string, lang: 'th' | 'en') =>
  new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

// ── H12 · ประวัติ ──────────────────────────────────────────────

@Component({
  selector: 'app-owner-history',
  imports: [RouterLink, PageHeader, Icon],
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
      <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'ช่วงเวลา', en: 'Period' })">
        @for (r of ranges; track r.v) {
          <button type="button" [attr.aria-pressed]="range() === r.v" (click)="pick(r.v)">{{ i18n.t(r.label) }}</button>
        }
      </div>
      @if (range() === 'custom') {
        <form class="dates card" (submit)="$event.preventDefault(); applyCustom()">
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

      <nav class="list">
        @for (h of items(); track h.id) {
          @let k = kind[h.type];
          <a class="row" [routerLink]="url(k.detail)" [queryParams]="{ id: h.id }">
            <span class="icon-bubble" [class.warn]="k.tone === 'warn'">
              <app-icon [name]="k.icon" [size]="20" />
            </span>
            <span class="grow">
              <strong>{{ i18n.t(k.title) }}</strong>
              <span class="muted small block">{{ sub(h) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="18" />
          </a>
        } @empty {
          <p class="row muted">{{ store.loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ยังไม่มีเหตุการณ์ในช่วงนี้', en: 'Nothing in this period' }) }}</p>
        }
      </nav>
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
    return b ? this.i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + b.house_no : '';
  });
  /** รายการที่เซิร์ฟเวอร์กรองตามช่วงมาให้แล้ว */
  protected readonly items = computed(() => this.store.events());
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
    void this.store.load(undefined, range);
  }

  protected sub(h: BoxEvent): string {
    const at = dateTime(h.at, this.i18n.lang());
    if (h.type === 'inspected') return `${at} · ${h.officer?.display_name ?? ''} (${h.officer?.agency_name ?? ''})`;
    return `${at} · ${this.i18n.t(h.method === 'code' ? { th: 'ไรเดอร์พิมพ์รหัส', en: 'rider typed the code' } : { th: 'ไรเดอร์สแกน QR', en: 'rider scanned the QR' })}`;
  }
}

/** หยิบเหตุการณ์ตาม ?id= — ไม่เจอ → กลับหน้าประวัติ */
function useEvent(type: BoxEvent['type']) {
  const store = inject(OwnerHistoryStore);
  const router = inject(Router);
  const event = signal<BoxEvent | null>(null);
  return {
    event,
    load: (id: string | undefined) =>
      void store.find(id).then((e) => {
        if (e && e.type === type) event.set(e);
        else void router.navigateByUrl(screenUrl('H12'));
      }),
  };
}

// ── H12-b · รายละเอียดการตรวจ ─────────────────────────────────

@Component({
  selector: 'app-owner-inspection',
  imports: [PageHeader, PrivatePhoto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ประวัติ', en: 'History' })" [title]="i18n.t({ th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' })" [back]="url('H12')" />
    @if (ev.event(); as h) {
      <div class="stack">
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'วันเวลา', en: 'Date' }) }}</dt><dd>{{ when(h.at) }}</dd>
            <dt>{{ i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' }) }}</dt><dd>{{ h.officer?.display_name }}</dd>
            <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ h.officer?.agency_name }}</dd>
            <dt>{{ i18n.t({ th: 'QR ที่สแกน', en: 'QR scanned' }) }}</dt><dd>{{ h.qr_slot === 2 ? i18n.t({ th: 'QR สำรอง', en: 'Backup QR' }) : i18n.t({ th: 'QR หน้าตู้', en: 'Front QR' }) }}</dd>
            <dt>{{ i18n.t({ th: 'วิธี', en: 'Method' }) }}</dt><dd>{{ h.method === 'code' ? i18n.t({ th: 'พิมพ์รหัส', en: 'Typed code' }) : i18n.t({ th: 'สแกน', en: 'Scan' }) }}</dd>
            <dt>{{ i18n.t({ th: 'ตู้ยืนยัน', en: 'Box confirmed' }) }}</dt><dd class="ok">{{ i18n.t({ th: 'ผ่าน', en: 'Passed' }) }}</dd>
          </dl>
        </section>
        <section class="card stack">
          <strong>{{ i18n.t({ th: 'รูปยืนยันตัวเจ้าหน้าที่', en: 'Officer confirmation photo' }) }}</strong>
          @if (h.has_photo) {
            <app-private-photo [src]="'/api/v1/me/inspection-photos/' + h.id" [alt]="i18n.t({ th: 'รูปเจ้าหน้าที่ที่มาตรวจ', en: 'Photo of the inspecting officer' })" />
          } @else {
            <p class="muted small">{{ i18n.t({ th: 'ไม่มีรูป (เจ้าหน้าที่ไม่ได้ถ่าย หรือเกิน 30 วันแล้ว)', en: 'No photo (not taken, or older than 30 days)' }) }}</p>
          }
        </section>
        <p class="muted small">{{ i18n.t({ th: 'ตู้ยืนยันด้วยการสแกน QR ประจำตัวของเจ้าหน้าที่ — ปลอมไม่ได้', en: 'The mailbox verified the officer’s personal QR — it cannot be faked' }) }}</p>
      </div>
    }
  `,
})
export class OwnerInspection {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly ev = useEvent('inspected');

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.ev.load(id));
    });
  }

  protected when(iso: string): string {
    return dateTime(iso, this.i18n.lang());
  }
}

// ── H12-c · รายละเอียดของมาส่ง ─────────────────────────────────

@Component({
  selector: 'app-owner-delivery',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ประวัติ', en: 'History' })" [title]="i18n.t({ th: 'มีของมาส่ง', en: 'Parcel delivered' })" [back]="url('H12')" />
    @if (ev.event(); as h) {
      <div class="stack">
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'วันเวลา', en: 'Date' }) }}</dt><dd>{{ when(h.at) }}</dd>
            <dt>{{ i18n.t({ th: 'แจ้งโดย', en: 'Reported by' }) }}</dt><dd>{{ i18n.t({ th: 'ไรเดอร์', en: 'Rider' }) }}</dd>
            <dt>{{ i18n.t({ th: 'วิธี', en: 'Method' }) }}</dt><dd>{{ h.method === 'code' ? i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Typed the code' }) : i18n.t({ th: 'สแกน QR หน้าตู้', en: 'Scanned the front QR' }) }}</dd>
          </dl>
        </section>
        <p class="muted small">{{ i18n.t({ th: 'ระบบไม่เก็บข้อมูลตัวตนของไรเดอร์', en: 'No rider identity is stored' }) }}</p>
      </div>
    }
  `,
})
export class OwnerDelivery {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly ev = useEvent('delivered');

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.ev.load(id));
    });
  }

  protected when(iso: string): string {
    return dateTime(iso, this.i18n.lang());
  }
}

// ── H12-d · ตู้ไม่ออนไลน์ (เปิดจากแจ้งเตือน) ─────────────────────

@Component({
  selector: 'app-owner-offline',
  imports: [PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ประวัติ', en: 'History' })" [title]="i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' })" [back]="url('H12')" />
    <div class="stack">
      <div class="info-box">
        <strong>{{ i18n.t({ th: 'ถึงเวลาตรวจแล้วตู้ไม่ติดต่อเซิร์ฟเวอร์', en: 'Patrol time started but the box did not connect' }) }}</strong>
        <ol>
          <li>{{ i18n.t({ th: 'Wi-Fi บ้านยังใช้ได้ไหม (เปลี่ยนรหัส / เราเตอร์ดับ)', en: 'Is the home Wi-Fi working? (password changed / router off)' }) }}</li>
          <li>{{ i18n.t({ th: 'แผงโซลาร์โดนบังไหม — แบตอาจหมด', en: 'Is the solar panel shaded? The battery may be empty' }) }}</li>
          <li>{{ i18n.t({ th: 'เปลี่ยน Wi-Fi: ดูหน้าตั้งค่าตู้', en: 'Changed Wi-Fi: see mailbox settings' }) }}</li>
        </ol>
      </div>
      <p class="muted small">{{ i18n.t({ th: 'ระหว่างตู้ไม่ออนไลน์ การตรวจจะบันทึกไม่ได้', en: 'While offline, inspections cannot be recorded' }) }}</p>
      <a class="btn" [routerLink]="url('H13-b')">{{ i18n.t({ th: 'วิธีเปลี่ยน Wi-Fi', en: 'How to change Wi-Fi' }) }}</a>
    </div>
  `,
  styles: `
    ol {
      margin: 6px 0 0;
      padding-inline-start: 20px;
    }
  `,
})
export class OwnerOffline {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
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
