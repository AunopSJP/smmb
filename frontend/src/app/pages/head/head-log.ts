import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, model, signal, type OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DisplaySettings } from '../../core/display-settings';
import { HeadApi } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
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
  ok: { th: 'เริ่มตรวจ', en: 'Started' },
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
      [caption]="(api.agency()?.name ?? '') + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'ประวัติการสแกน', en: 'Scan log' })"
      [bell]="url('L09')"
    />
    <div class="stack">
      <div class="segmented chips easy-hide" role="group">
        <button type="button" [attr.aria-pressed]="!onlyProblems()" (click)="setProblems(false)">{{ i18n.t({ th: 'ทั้งหมด', en: 'All' }) }}</button>
        <button type="button" [attr.aria-pressed]="onlyProblems()" (click)="setProblems(true)">{{ i18n.t({ th: 'เฉพาะที่มีปัญหา', en: 'Problems only' }) }}</button>
      </div>
      <details class="filters easy-hide" [open]="filtersActive()">
        <summary>
          {{ i18n.t({ th: 'ตัวกรอง', en: 'Filters' }) }}
          @if (filtersActive()) {
            <span class="chip ok">{{ i18n.t({ th: 'กำลังกรอง', en: 'active' }) }}</span>
          }
        </summary>
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
            <select [value]="fOfficer()" (change)="fOfficer.set($any($event.target).value)">
              <option value="">{{ i18n.t({ th: 'ทุกคน', en: 'Everyone' }) }}</option>
              @for (m of officerOptions(); track m.id) {
                <option [value]="m.id">{{ m.display_name }}</option>
              }
            </select>
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
      </details>
      <ul class="list">
        @for (l of rows(); track l.id) {
          @let ok = isOk(l);
          <li class="row">
            <span class="icon-bubble" [class.danger]="!ok"><app-icon [name]="icon(l)" [size]="20" /></span>
            <span class="grow">
              <strong>{{ l.house_no ?? l.box_id ?? '—' }} · {{ time(l.at) }}</strong>
              <span class="muted small block easy-hide">{{ sub(l) }}</span>
              <span class="muted small block easy-only">{{ l.officer?.display_name ?? '—' }}</span>
              <span class="muted small block mono adv-only">#{{ l.id }} · {{ l.box_id ?? '—' }} · {{ l.result }} · {{ l.qr_kind }}{{ l.qr_slot ? ' /slot ' + l.qr_slot : '' }} · {{ l.method }} · {{ l.officer?.id ?? '—' }}</span>
              <span class="muted small block mono adv-only">{{ exact(l.at) }}</span>
            </span>
            <span class="chip" [class.ok]="ok" [class.danger]="!ok">{{ i18n.t(resultText(l)) }}</span>
          </li>
        } @empty {
          <li class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ไม่มีรายการ', en: 'Nothing here' }) }}</li>
        }
      </ul>
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
    .filters {
      background: var(--surface);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 12px 16px;
    }
    .filters > summary {
      cursor: pointer;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
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
  private page = 1;
  /** โหมดง่าย: แค่ 5 รายการล่าสุด ไม่ต้องโหลดเพิ่ม */
  protected readonly rows = computed(() => (this.display.easyMode() ? this.all().slice(0, 5) : this.all()));

  // ตัวกรอง (ส่งให้เซิร์ฟเวอร์กรอง — ไม่ใช่กรองเฉพาะ 30 แถวที่โหลดมา)
  protected readonly fZone = signal('');
  protected readonly fOfficer = signal('');
  protected readonly fQ = signal('');
  protected readonly fFrom = signal('');
  protected readonly fTo = signal('');
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

  private async fetch(): Promise<void> {
    const p = this.filterQuery();
    p.set('page', String(this.page));
    const r = await firstValueFrom(this.http.get<{ data: LogRow[]; per_page: number }>(`/api/v1/agency/logs?${p}`)).catch(() => null);
    if (!r) return;
    this.all.update((a) => [...a, ...r.data]);
    this.more.set(r.data.length === r.per_page);
  }

  protected async apply(): Promise<void> {
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

  protected clearFilters(): void {
    this.fZone.set('');
    this.fOfficer.set('');
    this.fQ.set('');
    this.fFrom.set('');
    this.fTo.set('');
    void this.apply();
  }

  protected readonly days = signal(30);
  protected readonly exporting = signal(false);

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
      a.download = `smmb-scan-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.toast.show({ th: 'ส่งออกไม่สำเร็จ ลองอีกครั้ง', en: 'Could not export — try again' });
    } finally {
      this.exporting.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    this.page++;
    await this.fetch();
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

  protected time(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  }

  /** โหมดละเอียด: เวลาที่มีความละเอียดถึงวินาที */
  protected exact(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok' });
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
  imports: [PageHeader, NotificationList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="(api.agency()?.name ?? '') + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' })"
      [back]="url('L04')"
    />
    <div class="stack">
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
