import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, model, signal, type OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HeadApi } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
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
      <div class="segmented chips" role="group">
        <button type="button" [attr.aria-pressed]="!onlyProblems()" (click)="onlyProblems.set(false)">{{ i18n.t({ th: 'ทั้งหมด', en: 'All' }) }}</button>
        <button type="button" [attr.aria-pressed]="onlyProblems()" (click)="onlyProblems.set(true)">{{ i18n.t({ th: 'เฉพาะที่มีปัญหา', en: 'Problems only' }) }}</button>
      </div>
      <ul class="list">
        @for (l of rows(); track l.id) {
          @let ok = isOk(l);
          <li class="row">
            <span class="icon-bubble" [class.danger]="!ok"><app-icon [name]="icon(l)" [size]="20" /></span>
            <span class="grow">
              <strong>{{ l.house_no ?? l.box_id ?? '—' }} · {{ time(l.at) }}</strong>
              <span class="muted small block">{{ sub(l) }}</span>
            </span>
            <span class="chip" [class.ok]="ok" [class.danger]="!ok">{{ i18n.t(resultText(l)) }}</span>
          </li>
        } @empty {
          <li class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ไม่มีรายการ', en: 'Nothing here' }) }}</li>
        }
      </ul>
      @if (more()) {
        <button type="button" class="btn secondary" (click)="loadMore()">{{ i18n.t({ th: 'ดูเพิ่ม', en: 'Load more' }) }}</button>
      }
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
      min-width: 0;
    }
    .block {
      display: block;
    }
  `,
})
export class HeadLog implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  private readonly http = inject(HttpClient);
  protected readonly url = screenUrl;
  protected readonly onlyProblems = signal(false);
  protected readonly all = signal<LogRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  private page = 1;
  protected readonly rows = computed(() => this.all().filter((l) => !this.onlyProblems() || !this.isOk(l)));

  async ngOnInit(): Promise<void> {
    void this.api.loadAgency().catch(() => undefined);
    await this.fetch();
    this.loading.set(false);
  }

  private async fetch(): Promise<void> {
    const r = await firstValueFrom(this.http.get<{ data: LogRow[]; per_page: number }>(`/api/v1/agency/logs?page=${this.page}`)).catch(() => null);
    if (!r) return;
    this.all.update((a) => [...a, ...r.data]);
    this.more.set(r.data.length === r.per_page);
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
