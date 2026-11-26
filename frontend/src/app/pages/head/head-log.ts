import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, model, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DisplaySettings } from '../../core/display-settings';
import { HeadApi } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
import { bkkDay, fmtDay, fmtTime, fmtWhenSec } from '../../core/time';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { NotificationList } from '../../shared/notification-list';
import { PageHeader } from '../../shared/page-header';

// หัวหน้า: ตัวกรองโซน · L08 ประวัติการสแกน (GET /agency/logs) · L09 แจ้งเตือน (GET /me/notifications) — ใช้ API จริง

/** ตัวกรอง "โซนของฉัน / ทุกโซน" (เป็นตัวกรอง ไม่ใช่สิทธิ์ — design §18) */
@Component({
  selector: 'app-zone-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'โซน', en: 'Zones' })">
      <button type="button" [attr.aria-pressed]="value() === 'mine'" (click)="value.set('mine')">{{ i18n.t({ th: 'โซนของฉัน', en: 'My zones' }) }}</button>
      <button type="button" [attr.aria-pressed]="value() === 'all'" (click)="value.set('all')">{{ i18n.t({ th: 'ทุกโซน', en: 'All zones' }) }}</button>
    </div>
  `,
})
export class ZoneFilter {
  protected readonly i18n = inject(I18n);
  readonly value = model<'mine' | 'all'>('all');
}

interface LogRow {
  id: string;
  at: string;
  officer: { id: string; display_name: string } | null;
  box_id: string | null;
  house_no: string | null;
  qr_kind: 'front' | 'activate' | 'badge';
  qr_slot: 1 | 2 | null;
  method: 'scan' | 'code';
  result: string;
}

/** ผลที่ถือว่าผ่าน — ที่เหลือคือมีปัญหา (QR ไม่ใช่ของระบบ · นอกโซน · นอกเวลา · ตู้ไม่ออนไลน์ …) */
const OK_RESULTS = new Set(['ok', 'pass', 'passed']);

const RESULT_TEXT: Record<string, Tr> = {
  /* ok = เซิร์ฟเวอร์รับการสแกนแล้ว (ขั้นแรก) — ไม่ได้บอกผลการตรวจ จึงไม่เขียนว่า "ผ่าน" หรือ "ยังไม่จบ" */
  ok: { th: 'รับการสแกนแล้ว', en: 'Scan received' },
  pass: { th: 'ผ่าน', en: 'Passed' },
  retry: { th: 'อ่านไม่ผ่าน', en: 'Not read' },
  fail: { th: 'ไม่ผ่าน', en: 'Failed' },
  not_system: { th: 'QR ไม่ใช่ของระบบ', en: 'Not a system QR' },
  invalid: { th: 'QR ไม่ถูกต้อง', en: 'Invalid QR' },
  not_in_zone: { th: 'นอกโซน', en: 'Not in zone' },
  outside_window: { th: 'นอกเวลาตรวจ', en: 'Outside hours' },
  box_offline: { th: 'ตู้ไม่ออนไลน์', en: 'Box offline' },
  service_closed: { th: 'ตู้ปิดบริการ', en: 'Box closed' },
  revoked: { th: 'QR ถูกยกเลิก', en: 'QR revoked' },
  // ตู้อ่าน QR ประจำตัว
  bad_sig: { th: 'QR ประจำตัวปลอม', en: 'Forged badge' },
  wrong_job: { th: 'QR ของงานอื่น', en: 'Badge for another job' },
  wrong_user: { th: 'QR ของคนอื่น', en: 'Someone else’s badge' },
  expired: { th: 'QR หมดอายุ', en: 'Badge expired' },
  unreadable: { th: 'กล้องอ่านไม่ได้', en: 'Camera couldn’t read' },
};

// ── L08 · ประวัติการตรวจ ───────────────────────────────────────

@Component({
  selector: 'app-head-log',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="api.agency()?.name ?? i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'ประวัติการสแกน', en: 'Scan log' })"
      [bell]="url('L09')"
    />
    <div class="stack">
      <!-- D4: ตัวกรองแบบแคปซูลเห็นตลอด — ช่วงวัน/ปัญหา/ตัวกรองเพิ่มเติม -->
      <div class="segmented chips filter-caps" role="group" [attr.aria-label]="i18n.t({ th: 'ตัวกรอง', en: 'Filters' })">
        <button type="button" [attr.aria-pressed]="!onlyProblems()" (click)="setProblems(false)">{{ i18n.t({ th: 'ทั้งหมด', en: 'All' }) }}</button>
        <button type="button" [attr.aria-pressed]="onlyProblems()" (click)="setProblems(true)">{{ i18n.t({ th: 'มีปัญหา', en: 'Problems' }) }}</button>
        <button type="button" [attr.aria-pressed]="range() === 'today'" (click)="setRange('today')">{{ i18n.t({ th: 'วันนี้', en: 'Today' }) }}</button>
        <button type="button" [attr.aria-pressed]="range() === '7d'" (click)="setRange('7d')">{{ i18n.t({ th: '7 วัน', en: '7 days' }) }}</button>
        <button type="button" [attr.aria-pressed]="range() === '30d'" (click)="setRange('30d')">{{ i18n.t({ th: '30 วัน', en: '30 days' }) }}</button>
        <button type="button" [attr.aria-pressed]="showFilters()" (click)="showFilters.set(!showFilters())">{{ i18n.t({ th: 'ตัวกรองเพิ่มเติม', en: 'More filters' }) }}</button>
      </div>
      @if (showFilters()) {
      <section class="filters easy-hide" [attr.aria-label]="i18n.t({ th: 'ตัวกรองเพิ่มเติม', en: 'More filters' })">
        <form class="fgrid" (submit)="$event.preventDefault(); apply()">
          <label class="field">
            <span>{{ i18n.t({ th: 'โซน', en: 'Zone' }) }}</span>
            <select [value]="fZone()" (change)="fZone.set($any($event.target).value)">
              <option value="">{{ i18n.t({ th: 'ทุกโซน', en: 'All zones' }) }}</option>
              @for (z of zoneOptions(); track z.id) {
                <option [value]="z.id">{{ z.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' }) }}</span>
            <input
              type="text"
              autocomplete="off"
              list="log-officer-list"
              [placeholder]="i18n.t({ th: 'พิมพ์ชื่อ หรือเลือกจากรายการ', en: 'Type a name or pick from the list' })"
              [value]="fOfficerName()"
              (change)="pickOfficer($any($event.target).value)"
            />
            <datalist id="log-officer-list">
              @for (m of officerOptions(); track m.id) {
                <option [value]="m.display_name"></option>
              }
            </datalist>
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'บ้านเลขที่ / รหัสตู้', en: 'House no. / box id' }) }}</span>
            <input maxlength="50" [value]="fQ()" (input)="fQ.set($any($event.target).value)" />
          </label>
          <div class="dates">
            <label class="field">
              <span>{{ i18n.t({ th: 'ตั้งแต่วันที่', en: 'From' }) }}</span>
              <input type="date" [value]="fFrom()" (input)="fFrom.set($any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'ถึงวันที่', en: 'To' }) }}</span>
              <input type="date" [value]="fTo()" (input)="fTo.set($any($event.target).value)" />
            </label>
          </div>
          <div class="factions">
            <button type="submit" class="btn">{{ i18n.t({ th: 'ใช้ตัวกรอง', en: 'Apply' }) }}</button>
            <button type="button" class="btn secondary" (click)="clearFilters()">{{ i18n.t({ th: 'ล้าง', en: 'Clear' }) }}</button>
          </div>
        </form>
      </section>
      }
      <ul class="list">
        @for (g of dayGroups(); track g.key) {
          @if (g.label) {
            <li class="group-head">{{ g.label }}</li>
          }
        @for (l of g.items; track l.id) {
          @let ok = isOk(l);
          <li class="row">
            <span class="icon-bubble" [class.danger]="!ok"><app-icon [name]="icon(l)" [size]="20" /></span>
            <span class="grow">
              <strong>{{ l.house_no ?? l.box_id ?? '—' }} · {{ time(l.at) }}</strong>
              <span class="muted small block easy-hide">{{ sub(l) }}</span>
              <span class="muted small block easy-only">{{ l.officer?.display_name ?? '—' }}</span>
            </span>
            <span class="chip" [class.ok]="chipTone(l) === 'ok'" [class.warn]="chipTone(l) === 'warn'" [class.danger]="chipTone(l) === 'danger'">{{ i18n.t(resultText(l)) }}</span>
          </li>
        } @empty {
          @if (!loadFailed()) {
            <li class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ไม่มีรายการ', en: 'Nothing here' }) }}</li>
          }
        }
        }
      </ul>
      @if (loadFailed()) {
        <p class="row danger-text" role="alert">
          <span class="grow">{{ i18n.t({ th: 'โหลดประวัติไม่สำเร็จ', en: 'Could not load the log' }) }}</span>
          <button type="button" class="see-all" (click)="retry()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button>
        </p>
      }
      @if (more()) {
        <button type="button" class="btn secondary easy-hide" (click)="loadMore()">{{ i18n.t({ th: 'ดูเพิ่ม', en: 'Load more' }) }}</button>
      }
      <div class="export easy-hide">
        <label class="field">
          <span>{{ i18n.t({ th: 'ส่งออกเป็นไฟล์ Excel (CSV) — ตามตัวกรองด้านบน', en: 'Export as a spreadsheet (CSV) — follows the filters above' }) }}</span>
          <select [value]="days()" (change)="days.set(+$any($event.target).value)">
            <option value="7">{{ i18n.t({ th: '7 วันล่าสุด', en: 'Last 7 days' }) }}</option>
            <option value="30">{{ i18n.t({ th: '30 วันล่าสุด', en: 'Last 30 days' }) }}</option>
            <option value="90">{{ i18n.t({ th: '90 วันล่าสุด', en: 'Last 90 days' }) }}</option>
            <option value="365">{{ i18n.t({ th: '1 ปีล่าสุด', en: 'Last year' }) }}</option>
          </select>
        </label>
        <button type="button" class="btn secondary" [disabled]="exporting()" (click)="exportCsv()">
          {{ exporting() ? i18n.t({ th: 'กำลังเตรียมไฟล์…', en: 'Preparing…' }) : i18n.t({ th: 'ดาวน์โหลด CSV', en: 'Download CSV' }) }}
        </button>
      </div>
      <p class="muted small">{{ i18n.t({ th: 'บันทึกทุกการสแกน/พิมพ์รหัส แม้ไม่ผ่าน · ลบหรือแก้ไม่ได้', en: 'Every scan or typed code is logged, even failures · cannot be edited' }) }}</p>
    </div>
  `,
  styles: `
    /* ≥1280px (คอม): รายการเรียง 2 คอลัมน์ ลดการเลื่อน — ต่ำกว่านั้นเป็นแถวเดียวเหมือนเดิม */
    @media (min-width: 1280px) {
      ul.list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 16px;
      }
      ul.list > .row.muted {
        grid-column: 1 / -1;
      }
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
    /* D4: ตัวกรองเป็นแคปซูลเห็นตลอด (ไม่ใช่การ์ดพับ) */
    .filters {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 16px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
    }
    /* แคปซูลตัวกรองเลื่อนแนวนอนได้ ไม่กินครึ่งจอ */
    .filter-caps {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-block-end: 2px;
      scrollbar-width: thin;
    }
    .filter-caps button {
      flex: none;
      min-block-size: 44px;
    }
    /* D5: หัวกลุ่มตามวันในตาราง */
    .group-head {
      padding: 10px 16px;
      border-block-start: 1px solid var(--line);
      background: var(--icon-bg);
      color: var(--text-muted);
      font-size: var(--fs-sm);
      font-weight: var(--fw-strong);
      list-style: none;
    }
    .fgrid {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-block-start: 12px;
    }
    .dates {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    @media (max-width: 520px) {
      .dates {
        grid-template-columns: 1fr;
      }
    }
    .factions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
  `,
})
export class HeadLog implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  protected readonly display = inject(DisplaySettings);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly onlyProblems = signal(false);
  protected readonly all = signal<LogRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly loadFailed = signal(false);
  private failedPage: number | null = null;
  private page = 1;
  /** โหมดง่าย: แค่ 5 รายการล่าสุด ไม่ต้องโหลดเพิ่ม */
  protected readonly rows = computed(() => (this.display.easyMode() ? this.all().slice(0, 5) : this.all()));

  // ตัวกรอง (ส่งให้เซิร์ฟเวอร์กรอง — ไม่ใช่กรองเฉพาะ 30 แถวที่โหลดมา)
  protected readonly fZone = signal('');
  protected readonly fOfficer = signal('');
  /** ชื่อที่พิมพ์/เลือกในช่องค้นหาเจ้าหน้าที่ (ค่าว่าง = ทุกคน) */
  protected readonly fOfficerName = signal('');
  protected readonly fQ = signal('');
  protected readonly fFrom = signal('');
  protected readonly fTo = signal('');
  /** ช่วงวันที่แบบแคปซูล (today/7d/30d/custom) */
  protected readonly range = signal<'today' | '7d' | '30d' | 'custom'>('custom');
  /** เปิด/ปิดช่องกรองละเอียด — แคปซูลหลักเห็นตลอด */
  protected readonly showFilters = signal(false);
  protected readonly zoneOptions = signal<{ id: string; name: string }[]>([]);
  protected readonly officerOptions = signal<{ id: string; display_name: string }[]>([]);
  protected readonly filtersActive = computed(() => !!(this.fZone() || this.fOfficer() || this.fQ().trim() || this.fFrom() || this.fTo()));

  async ngOnInit(): Promise<void> {
    void this.api.loadAgency().catch(() => undefined);
    void this.api.zones('all').then((z) => this.zoneOptions.set(z.map((x) => ({ id: x.id, name: x.name })))).catch(() => undefined);
    // รวมคนที่ถูกปิดสิทธิ์แล้ว (ประวัติเดิมของเขายังต้องกรองดูได้)
    void Promise.all([this.api.members('active'), this.api.members('disabled').catch(() => [])])
      .then(([a, d]) => this.officerOptions.set([...a, ...d].map((x) => ({ id: x.id, display_name: x.display_name }))))
      .catch(() => undefined);
    await this.fetch();
    this.loading.set(false);
  }

  /** พารามิเตอร์ตัวกรองสำหรับรายการและ CSV */
  private filterQuery(): URLSearchParams {
    const p = new URLSearchParams();
    if (this.fZone()) p.set('zone', this.fZone());
    if (this.fOfficer()) p.set('officer', this.fOfficer());
    if (this.fQ().trim()) p.set('q', this.fQ().trim());
    if (this.fFrom()) p.set('from', this.fFrom());
    if (this.fTo()) p.set('to', this.fTo());
    if (this.onlyProblems()) p.set('problems', 'true');
    return p;
  }

  private async fetch(page = this.page): Promise<void> {
    const p = this.filterQuery();
    p.set('page', String(page));
    const r = await firstValueFrom(this.http.get<{ data: LogRow[]; per_page: number }>(`/api/v1/agency/logs?${p}`)).catch(() => null);
    if (!r) {
      this.loadFailed.set(true);
      this.failedPage = page;
      return;
    }
    this.all.update((a) => (page === 1 ? r.data : [...a, ...r.data]));
    this.page = page;
    this.more.set(r.data.length === r.per_page);
    this.loadFailed.set(false);
  }

  protected retry(): void {
    void this.fetch(this.failedPage ?? 1);
  }

  protected async apply(): Promise<void> {
    if (this.fOfficerName().trim() && !this.fOfficer()) {
      this.toast.show({ th: 'เลือกเจ้าหน้าที่จากรายการที่ขึ้นให้', en: 'Pick an officer from the list' });
      return;
    }
    if (this.fFrom() && this.fTo() && this.fFrom() > this.fTo()) {
      this.toast.show({ th: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด', en: '“From” must not be after “To”' });
      return;
    }
    this.page = 1;
    this.all.set([]);
    this.loading.set(true);
    await this.fetch();
    this.loading.set(false);
  }

  protected setProblems(on: boolean): void {
    this.onlyProblems.set(on);
    void this.apply();
  }

  /** เลือกเจ้าหน้าที่จากชื่อในรายการ — พิมพ์บางส่วนที่ตรงคนเดียวก็ใช้ได้ · ไม่ตรงใคร = ยังไม่กรอง */
  protected pickOfficer(text: string): void {
    const name = text.trim();
    const list = this.officerOptions();
    const exact = list.find((x) => x.display_name.trim() === name);
    const near = name ? list.filter((x) => x.display_name.includes(name)) : [];
    const m = exact ?? (near.length === 1 ? near[0] : undefined);
    this.fOfficerName.set(name);
    this.fOfficer.set(m?.id ?? '');
  }

  /** D4: เลือกช่วงวันด้วยแคปซูลเดียว (คำนวณจากวันนี้เวลาไทย) */
  protected setRange(r: 'today' | '7d' | '30d'): void {
    const today = bkkDay();
    this.range.set(r);
    if (r === 'today') {
      this.fFrom.set(today);
      this.fTo.set(today);
    } else {
      const days = r === '7d' ? 6 : 29;
      this.fFrom.set(bkkDay(new Date(Date.now() - days * 86_400_000)));
      this.fTo.set(today);
    }
    void this.apply();
  }

  protected clearFilters(): void {
    this.fZone.set('');
    this.fOfficer.set('');
    this.fOfficerName.set('');
    this.fQ.set('');
    this.fFrom.set('');
    this.fTo.set('');
    this.range.set('custom');
    void this.apply();
  }

  protected readonly days = signal(30);
  protected readonly exporting = signal(false);

  /** D5: จัดกลุ่มรายการตามวัน (วันนี้/เมื่อวาน/วันที่) — ใช้ร่วมกับตัวกรองด้านบน */
  protected readonly dayGroups = computed(() => {
    const map = new Map<string, LogRow[]>();
    for (const l of this.rows()) {
      const key = bkkDay(l.at);
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    const out = [...map.entries()].map(([key, items]) => ({ key, label: fmtDay(items[0].at, this.i18n.lang()), items }));
    return out.length ? out : [{ key: 'none', label: '', items: [] as LogRow[] }];
  });

  /** GET /agency/logs/export.csv?days= — สูงสุด 10,000 แถว */
  protected async exportCsv(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const p = this.filterQuery();
      // ระบุช่วงวันที่เองแล้วใช้ช่วงนั้น · ไม่ระบุใช้ "ย้อนหลังกี่วัน" ตามตัวเลือก
      if (!this.fFrom() && !this.fTo()) p.set('days', String(this.days()));
      const blob = await firstValueFrom(this.http.get(`/api/v1/agency/logs/export.csv?${p}`, { responseType: 'blob' }));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = bkkDay();
      a.download = `smmb-scan-log-${today}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.toast.show({ th: 'ส่งออกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not export — check your connection and try again' });
    } finally {
      this.exporting.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    await this.fetch(this.page + 1);
  }

  protected isOk(l: LogRow): boolean {
    return OK_RESULTS.has(l.result);
  }

  protected resultText(l: LogRow): Tr {
    if (l.qr_kind === 'badge' && l.result === 'ok') return RESULT_TEXT['pass'];
    return RESULT_TEXT[l.result] ?? { th: l.result, en: l.result };
  }

  protected icon(l: LogRow): IconName {
    return l.qr_kind === 'badge' ? 'shield' : this.isOk(l) ? 'scan' : 'alert';
  }

  /** สีป้ายตามผลจริง (A9): เขียว = ผ่าน · กลาง = รับการสแกน · ส้ม = อ่านไม่ผ่าน · แดง = ไม่ผ่าน */
  protected chipTone(l: LogRow): '' | 'ok' | 'warn' | 'danger' {
    if (l.qr_kind === 'badge' && l.result === 'ok') return 'ok';
    if (l.result === 'pass' || l.result === 'passed') return 'ok';
    if (l.result === 'ok') return ''; // แถวสแกนหน้าตู้ไม่ถูกแก้ภายหลัง (log เพิ่มอย่างเดียว) จึงเป็นสีกลาง
    if (l.result === 'retry' || l.result === 'unreadable') return 'warn';
    return 'danger';
  }

  protected time(iso: string): string {
    return fmtTime(iso);
  }

  /** โหมดละเอียด: วัน + เวลา 24 ชม. ถึงวินาที (รูปแบบกลาง A8) */
  protected exact(iso: string): string {
    return fmtWhenSec(iso, this.i18n.lang());
  }

  protected sub(l: LogRow): string {
    const t = (th: string, en: string) => this.i18n.t({ th, en });
    const who = l.officer?.display_name ?? '—';
    const qr = l.qr_kind === 'badge' ? t('QR ประจำตัว (ตู้อ่าน)', 'Badge QR (box read)') : l.qr_slot === 2 ? t('QR สำรอง', 'Backup QR') : t('QR หน้าตู้', 'Front QR');
    const how = l.method === 'scan' ? t('สแกน', 'scan') : t('พิมพ์รหัส', 'typed code');
    return `${who} · ${qr} · ${how}`;
  }
}

// ── L09 · แจ้งเตือน ─────────────────────────────────────────

@Component({
  selector: 'app-head-notifications',
  imports: [PageHeader, NotificationList, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="api.agency()?.name ?? i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' })"
      [back]="url('L04')"
    />
    <div class="stack">
      <!-- A4: หน้าย่อยเดียวรวมประวัติ + ตั้งค่าชนิดที่รับ (เดิมมี 3 แถวกระดิ่งในหน้าตั้งค่า) -->
      <nav class="menu">
        <a class="menu-row" routerLink="/settings/notifications">
          <app-icon class="mi" name="bell" [size]="20" />
          <span class="grow">
            <strong>{{ i18n.t({ th: 'ตั้งค่าการแจ้งเตือน', en: 'Notification settings' }) }}</strong>
            <span class="sub">{{ i18n.t({ th: 'ชนิดที่รับ · ส่งทดสอบ · วิธีแก้ถ้าไม่เด้ง', en: 'What to receive · send a test · fixes if nothing arrives' }) }}</span>
          </span>
          <app-icon class="chev" name="chevronRight" [size]="18" />
        </a>
      </nav>
      <app-notification-list />
    </div>
  `,
})
export class HeadNotifications implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  protected readonly url = screenUrl;

  ngOnInit(): void {
    void this.api.loadAgency().catch(() => undefined);
  }
}
