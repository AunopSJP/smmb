import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { MOCK_HISTORY, MOCK_OWNER, type HistoryItem, type HistoryKind } from '../../core/mock/mock-data';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

type Range = 'today' | '7d' | '30d';

const RANGES: { v: Range; label: Tr }[] = [
  { v: 'today', label: { th: 'วันนี้', en: 'Today' } },
  { v: '7d', label: { th: '7 วัน', en: '7 days' } },
  { v: '30d', label: { th: '30 วัน', en: '30 days' } },
];

const KIND: Record<HistoryKind, { icon: IconName; tone: '' | 'warn' | 'danger'; title: Tr; detail: string }> = {
  inspected: { icon: 'shield', tone: '', title: { th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' }, detail: 'H12-b' },
  delivered: { icon: 'box', tone: 'warn', title: { th: 'มีของมาส่ง', en: 'Parcel delivered' }, detail: 'H12-c' },
  sos_closed: { icon: 'alert', tone: 'danger', title: { th: 'SOS ปิดเรื่องแล้ว', en: 'SOS closed' }, detail: 'H11-b' },
  box_offline: { icon: 'alert', tone: '', title: { th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' }, detail: 'H12-d' },
};

/** หาเหตุการณ์จาก ?id= (ไม่มี/ไม่เจอ → อันแรกของประเภทนั้น) */
function pick(id: string | undefined, kind: HistoryKind): HistoryItem {
  return MOCK_HISTORY.find((h) => h.id === id && h.kind === kind) ?? MOCK_HISTORY.find((h) => h.kind === kind)!;
}

// ── H12 · ประวัติ ──────────────────────────────────────────────

@Component({
  selector: 'app-owner-history',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + house"
      [title]="i18n.t({ th: 'ประวัติ', en: 'History' })"
      [bell]="url('H14')"
    />
    <div class="stack">
      <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'ช่วงเวลา', en: 'Period' })">
        @for (r of ranges; track r.v) {
          <button type="button" [attr.aria-pressed]="range() === r.v" (click)="range.set(r.v)">{{ i18n.t(r.label) }}</button>
        }
      </div>
      <a class="card range" [routerLink]="url('H12-e')">
        <app-icon name="list" [size]="18" />
        <span>{{ i18n.t({ th: '20 ต.ค. – 26 ต.ค. 2026', en: '20 Oct – 26 Oct 2026' }) }}</span>
      </a>

      <nav class="list">
        @for (h of items; track h.id) {
          @let k = kind[h.kind];
          <a class="row" [routerLink]="url(k.detail)" [queryParams]="{ id: h.id }">
            <span class="icon-bubble" [class.warn]="k.tone === 'warn'" [class.danger]="k.tone === 'danger'">
              <app-icon [name]="k.icon" [size]="20" />
            </span>
            <span class="grow">
              <strong>{{ i18n.t(k.title) }}</strong>
              <span class="muted small block">{{ sub(h) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="18" />
          </a>
        }
      </nav>
    </div>
  `,
  styles: `
    .range {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      text-decoration: none;
      color: inherit;
      font-weight: 700;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
  `,
})
export class OwnerHistory {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly house = MOCK_OWNER.house_no;
  protected readonly ranges = RANGES;
  protected readonly range = signal<Range>('7d');
  protected readonly items = MOCK_HISTORY;
  protected readonly kind = KIND;

  protected sub(h: HistoryItem): string {
    const th = this.i18n.lang() === 'th';
    const date = th ? h.date : h.date_en;
    switch (h.kind) {
      case 'inspected':
        return `${date} · ${h.time} · ${th ? h.officer : h.officer_en}`;
      case 'delivered':
        return `${date} · ${h.time} · ${th ? 'ไรเดอร์' : 'Rider'}`;
      case 'sos_closed':
        return `${date} · ${h.time} · ${th ? `ใช้เวลา ${h.duration_min} นาที` : `${h.duration_min} min`}`;
      case 'box_offline':
        return `${date} · ${h.time} · ${th ? `กลับมาออนไลน์ ${h.back_online}` : `back online ${h.back_online}`}`;
    }
  }
}

// ── H12-b · รายละเอียดการตรวจ ─────────────────────────────────

@Component({
  selector: 'app-owner-inspection',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = item();
    @let th = i18n.lang() === 'th';
    <app-page-header [caption]="i18n.t({ th: 'ประวัติ', en: 'History' })" [title]="i18n.t({ th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' })" [back]="url('H12')" />
    <div class="stack">
      <section class="card">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'วันเวลา', en: 'Date' }) }}</dt><dd>{{ th ? h.date : h.date_en }} · {{ h.time }}</dd>
          <dt>{{ i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' }) }}</dt><dd>{{ th ? h.officer : h.officer_en }}</dd>
          <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ th ? h.agency : h.agency_en }} · {{ h.zone }}</dd>
          <dt>{{ i18n.t({ th: 'QR ที่สแกน', en: 'QR scanned' }) }}</dt><dd>{{ i18n.t({ th: 'QR หน้าตู้', en: 'Front QR' }) }}</dd>
          <dt>{{ i18n.t({ th: 'วิธี', en: 'Method' }) }}</dt><dd>{{ i18n.t({ th: 'สแกน', en: 'Scan' }) }}</dd>
          <dt>{{ i18n.t({ th: 'ตู้ยืนยัน', en: 'Box confirmed' }) }}</dt><dd class="ok">{{ i18n.t({ th: 'ผ่าน', en: 'Passed' }) }}</dd>
        </dl>
      </section>
      <p class="muted small">{{ i18n.t({ th: 'ตู้ยืนยันด้วยการสแกน QR ประจำตัวของเจ้าหน้าที่ — ปลอมไม่ได้', en: 'The mailbox verified the officer’s personal QR — it cannot be faked' }) }}</p>
    </div>
  `,
})
export class OwnerInspection {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly item = computed(() => pick(this.id(), 'inspected'));
}

// ── H12-c · รายละเอียดการส่งของ ───────────────────────────────

@Component({
  selector: 'app-owner-delivery',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = item();
    <app-page-header [caption]="i18n.t({ th: 'ประวัติ', en: 'History' })" [title]="i18n.t({ th: 'มีของมาส่ง', en: 'Parcel delivered' })" [back]="url('H12')" />
    <div class="stack">
      <section class="card">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'วันเวลา', en: 'Date' }) }}</dt><dd>{{ i18n.lang() === 'th' ? h.date : h.date_en }} · {{ h.time }}</dd>
          <dt>{{ i18n.t({ th: 'แจ้งโดย', en: 'Reported by' }) }}</dt><dd>{{ i18n.t({ th: 'ไรเดอร์ (ไม่ระบุตัวตน)', en: 'Rider (anonymous)' }) }}</dd>
          <dt>{{ i18n.t({ th: 'QR ที่สแกน', en: 'QR scanned' }) }}</dt><dd>{{ i18n.t({ th: 'QR หน้าตู้', en: 'Front QR' }) }}</dd>
          <dt>{{ i18n.t({ th: 'วิธี', en: 'Method' }) }}</dt><dd>{{ i18n.t({ th: 'สแกน', en: 'Scan' }) }}</dd>
        </dl>
      </section>
      <p class="muted small">{{ i18n.t({ th: 'ตู้ไม่ถ่ายรูป เปิดตู้เพื่อดูของได้เลย', en: 'The mailbox takes no photos — open it to check your parcel' }) }}</p>
    </div>
  `,
})
export class OwnerDelivery {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly item = computed(() => pick(this.id(), 'delivered'));
}

// ── H12-d · ตู้ไม่ออนไลน์ ─────────────────────────────────────

@Component({
  selector: 'app-owner-offline',
  imports: [RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = item();
    <app-page-header [caption]="i18n.t({ th: 'ประวัติ', en: 'History' })" [title]="i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' })" [back]="url('H12')" />
    <div class="stack grow">
      <section class="card">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'เริ่ม', en: 'From' }) }}</dt><dd>{{ i18n.lang() === 'th' ? h.date : h.date_en }} · {{ h.time }}</dd>
          <dt>{{ i18n.t({ th: 'กลับมาออนไลน์', en: 'Back online' }) }}</dt><dd class="ok">{{ h.back_online }}</dd>
          <dt>{{ i18n.t({ th: 'นาน', en: 'Duration' }) }}</dt><dd>{{ h.duration_min }} {{ i18n.t({ th: 'นาที', en: 'min' }) }}</dd>
          <dt>{{ i18n.t({ th: 'แบตล่าสุด', en: 'Battery' }) }}</dt><dd>{{ h.battery_pct }}%</dd>
        </dl>
      </section>
      <p class="muted small">{{ i18n.t({ th: 'ช่วงที่ตู้ไม่ออนไลน์ เจ้าหน้าที่จะตรวจตู้ไม่ได้', en: 'While offline, officers cannot inspect the mailbox' }) }}</p>
      <a class="btn secondary end" [routerLink]="url('H13-c')">{{ i18n.t({ th: 'แจ้งช่าง', en: 'Request a technician' }) }}</a>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .end {
      margin-top: auto;
    }
  `,
})
export class OwnerOffline {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly item = computed(() => pick(this.id(), 'box_offline'));
}

// ── H12-e · เลือกช่วงวันที่ ────────────────────────────────────

@Component({
  selector: 'app-owner-range',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sheet-backdrop">
      <button type="button" class="close-area" (click)="done()" [attr.aria-label]="i18n.t({ th: 'ปิด', en: 'Close' })"></button>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="range-title">
        <h2 id="range-title">{{ i18n.t({ th: 'เลือกช่วงวันที่', en: 'Pick a date range' }) }}</h2>
        <div class="segmented chips">
          @for (r of ranges; track r.v) {
            <button type="button" [attr.aria-pressed]="false" (click)="done()">{{ i18n.t(r.label) }}</button>
          }
        </div>
        <div class="dates">
          <label>
            <span class="small">{{ i18n.t({ th: 'ตั้งแต่', en: 'From' }) }}</span>
            <input type="date" value="2026-10-01" />
          </label>
          <label>
            <span class="small">{{ i18n.t({ th: 'ถึง', en: 'To' }) }}</span>
            <input type="date" value="2026-10-26" />
          </label>
        </div>
        <button type="button" class="btn" (click)="done()">{{ i18n.t({ th: 'ดูประวัติ', en: 'Show history' }) }}</button>
      </section>
    </div>
  `,
  styles: `
    .close-area {
      flex: 1;
      border: 0;
      background: none;
      cursor: pointer;
    }
    .dates {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: 700;
      }
    }
    input {
      font: inherit;
      min-height: 48px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      min-width: 0;
    }
    input:focus {
      outline: none;
      border-color: var(--brand);
    }
  `,
})
export class OwnerRange {
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  protected readonly ranges = RANGES;

  protected done(): void {
    void this.router.navigateByUrl(screenUrl('H12'));
  }
}
