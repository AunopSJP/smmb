import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi, type AdminLog, type AdminLogType, type BoxConfig } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';

type BoxConfigDefaults = Omit<BoxConfig, 'windows'>;
import { downloadText, toCsv } from '../../core/csv';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { NotificationList } from '../../shared/notification-list';
import { PageHeader } from '../../shared/page-header';
import { caseUrl } from './admin-qr';

// ── D10 · ค่าตั้งค่าตู้ ──────────────────────────────────────

/** ช่วงที่ยอมให้ตั้ง (✅ 2026-10-27 — server ตรวจซ้ำด้วยช่วงเดียวกัน) */
const LIMITS = {
  scan_timeout_s: [10, 60],
  max_attempts: [1, 5],
  longpoll_wait_s: [20, 55],
} as const;
/** อายุงานตรวจ 1 งาน (CLAUDE.md: job อายุ 60 วิ) */
const JOB_LIFETIME_S = 60;

type NumKey = keyof typeof LIMITS;

@Component({
  selector: 'app-admin-config',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'ค่าตั้งค่าตู้', en: 'Mailbox config' })" [back]="url('D01')" />
    <form class="stack grow" (submit)="$event.preventDefault(); save()">
      <label class="field">
        <span>{{ i18n.t({ th: 'เวลารายงานสถานะรายวัน', en: 'Daily report time' }) }}</span>
        <input type="time" required [value]="form().report_at" (input)="set('report_at', $any($event.target).value)" />
        <small>{{ i18n.t({ th: 'ตู้ส่งสถานะ + แบตวันละครั้ง และดึงค่าใหม่ตอนนี้', en: 'The box reports status + battery once a day and picks up new settings then' }) }}</small>
      </label>

      @for (f of numbers; track f.key) {
        <label class="field" [class.invalid]="!valid(f.key)">
          <span>{{ i18n.t(f.label) }}</span>
          <span class="with-unit">
            <input type="number" inputmode="numeric" [min]="limits[f.key][0]" [max]="limits[f.key][1]" [value]="form()[f.key]" (input)="setNum(f.key, $any($event.target).value)" />
            <span>{{ i18n.t(f.unit) }}</span>
          </span>
          <small [class.danger-text]="!valid(f.key)">{{ i18n.t(f.hint) }} · {{ limits[f.key][0] }}–{{ limits[f.key][1] }}</small>
        </label>
      }
      @if (tooLong()) {
        <p class="warn-text small" role="alert">
          {{ i18n.t({ th: 'รอสแกน × จำนวนครั้ง เกิน ' + jobLife + ' วิ (อายุงานตรวจ) — ครั้งท้าย ๆ อาจไม่ทันได้ใช้', en: 'Wait × tries is over ' + jobLife + ' s (inspection job lifetime) — the last tries may never run' }) }}
        </p>
      }

      <label class="row card switch-row">
        <span class="grow">
          <strong>{{ i18n.t({ th: 'เปิดไฟส่องกล้องเมื่อมืด', en: 'Camera light when dark' }) }}</strong>
          <span class="muted small block">{{ i18n.t({ th: 'ช่วยกล้องอ่าน QR ประจำตัวตอนกลางคืน', en: 'Helps the camera read the badge QR at night' }) }}</span>
        </span>
        <input type="checkbox" class="switch" [checked]="form().flash_when_dark" (change)="set('flash_when_dark', $any($event.target).checked)" />
      </label>

      <p class="info-box muted">{{ i18n.t({ th: 'ช่วงเวลาตรวจไม่ได้ตั้งที่นี่ — มาจากโซนของแต่ละหน่วยงาน', en: 'Patrol hours are not set here — they come from each agency’s zones' }) }}</p>
      <p class="muted small">
        {{ i18n.t({ th: 'รุ่นปัจจุบัน v', en: 'Current version v' }) }}{{ ver() }}<br />
        {{ i18n.t({ th: 'ตู้ดึงค่าใหม่ไปใช้ภายใน 1 วัน', en: 'Boxes pick up new settings within 1 day' }) }}
      </p>

      <button type="submit" class="btn push-end" [disabled]="!allValid() || !changed() || busy()">{{ i18n.t({ th: 'บันทึกค่า', en: 'Save' }) }}</button>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .row .grow {
      min-width: 0;
    }
    .block {
      display: block;
    }
    .switch-row {
      cursor: pointer;
    }
  `,
})
export class AdminConfig implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly limits = LIMITS;
  protected readonly jobLife = JOB_LIFETIME_S;
  protected readonly numbers: { key: NumKey; label: Tr; unit: Tr; hint: Tr }[] = [
    { key: 'max_attempts', label: { th: 'ลองสแกน QR ประจำตัวได้', en: 'Badge QR tries' }, unit: { th: 'ครั้ง', en: 'times' }, hint: { th: 'ไม่ผ่านครบ = แจ้งปัญหาตู้', en: 'All failed = box problem reported' } },
    { key: 'scan_timeout_s', label: { th: 'รอสแกนแต่ละครั้ง', en: 'Wait per try' }, unit: { th: 'วินาที', en: 'sec' }, hint: { th: 'ตู้เปิดกล้องรอ QR ประจำตัว', en: 'How long the camera waits for the badge QR' } },
    { key: 'longpoll_wait_s', label: { th: 'ตู้ถามงานใหม่ทุก', en: 'Box asks for jobs every' }, unit: { th: 'วินาที', en: 'sec' }, hint: { th: 'ในเวลาตรวจ · สั้นลงถ้าเราเตอร์บ้านตัดสายเงียบเร็ว', en: 'During patrol hours · shorter if home routers drop idle links' } },
  ];

  /** ค่าที่ server มีอยู่ (GET /admin/box-config) — ฟอร์มเริ่มจากค่านี้ */
  private readonly saved = signal<BoxConfigDefaults>({ report_at: '03:00', scan_timeout_s: 15, max_attempts: 3, flash_when_dark: true, longpoll_wait_s: 50 });
  protected readonly form = signal<BoxConfigDefaults>(this.saved());
  protected readonly ver = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly changed = computed(() => JSON.stringify(this.form()) !== JSON.stringify(this.saved()));

  async ngOnInit(): Promise<void> {
    const r = await this.api.config().catch(() => null);
    if (!r) return;
    const v = { report_at: r.config.report_at, scan_timeout_s: r.config.scan_timeout_s, max_attempts: r.config.max_attempts, flash_when_dark: r.config.flash_when_dark, longpoll_wait_s: r.config.longpoll_wait_s };
    this.saved.set(v);
    this.form.set({ ...v });
    this.ver.set(r.config_ver);
  }
  protected readonly allValid = computed(() => this.numbers.every((f) => this.valid(f.key)) && /^\d{2}:\d{2}$/.test(this.form().report_at));
  protected readonly tooLong = computed(() => this.form().max_attempts * this.form().scan_timeout_s > JOB_LIFETIME_S);

  protected valid(key: NumKey): boolean {
    const v = this.form()[key];
    const [min, max] = LIMITS[key];
    return Number.isInteger(v) && v >= min && v <= max;
  }

  protected set<K extends keyof BoxConfigDefaults>(key: K, value: BoxConfigDefaults[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setNum(key: NumKey, raw: string): void {
    this.set(key, raw === '' ? Number.NaN : Number(raw));
  }

  /** PUT /admin/box-config → config_ver ใหม่ (ตู้ดึงไปตอน boot / รายงานรายวัน) */
  protected async save(): Promise<void> {
    if (!this.allValid() || !this.changed()) return;
    this.busy.set(true);
    try {
      await this.api.setConfig(this.form());
      await this.ngOnInit();
      this.toast.show({ th: 'บันทึกแล้ว ตู้ดึงค่าใหม่ภายใน 1 วัน', en: 'Saved — boxes update within 1 day' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่ได้ ตรวจค่าอีกครั้ง', en: 'Couldn’t save — check the values' });
    } finally {
      this.busy.set(false);
    }
  }
}

// ── D11 · ประวัติทั้งหมด ─────────────────────────────────────

const LOG_TYPE: Record<AdminLogType, { label: Tr; icon: IconName; tone: '' | 'warn' | 'danger' }> = {
  inspection: { label: { th: 'ตรวจ', en: 'Inspections' }, icon: 'shield', tone: '' },
  delivery: { label: { th: 'ส่งของ', en: 'Deliveries' }, icon: 'box', tone: 'warn' },
  sos: { label: { th: 'SOS', en: 'SOS' }, icon: 'alert', tone: 'danger' },
  box_problem: { label: { th: 'ตู้มีปัญหา', en: 'Box problems' }, icon: 'info', tone: '' },
  scan: { label: { th: 'สแกน', en: 'Scans' }, icon: 'scan', tone: '' },
  data_access: { label: { th: 'เปิดดูข้อมูล', en: 'Data views' }, icon: 'user', tone: '' },
};

@Component({
  selector: 'app-admin-logs',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'แอดมิน Smart Mailbox', en: 'Smart Mailbox admin' })"
      [title]="i18n.t({ th: 'ประวัติทั้งหมด', en: 'All logs' })"
      [bell]="url('D12')"
    />
    <div class="stack">
      <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'ประเภท', en: 'Type' })">
        @for (t of types; track t) {
          <button type="button" [attr.aria-pressed]="picked().has(t)" (click)="toggle(t)">{{ i18n.t(meta[t].label) }}</button>
        }
      </div>
      <ul class="list">
        @for (l of rows(); track l.id) {
          @let m = meta[l.type];
          <li class="row">
            <span class="icon-bubble" [class.warn]="m.tone === 'warn'" [class.danger]="m.tone === 'danger' || l.fail"><app-icon [name]="m.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(title(l)) }}</strong>
              <span class="muted small block">{{ i18n.t(sub(l)) }}</span>
            </span>
            @if (l.fail) {
              <span class="chip danger">{{ i18n.t({ th: 'ไม่ผ่าน', en: 'Failed' }) }}</span>
            }
          </li>
        } @empty {
          <li class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ไม่มีรายการ', en: 'Nothing here' }) }}</li>
        }
      </ul>
      @if (error()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'โหลดประวัติไม่ได้ · ลองใหม่', en: 'Could not load logs · try again' }) }}</p>
        <button type="button" class="btn secondary" (click)="load()">{{ i18n.t({ th: 'ลองใหม่', en: 'Retry' }) }}</button>
      }
      <button type="button" class="btn secondary" [disabled]="!rows().length" (click)="exportCsv()">{{ i18n.t({ th: 'ส่งออก CSV (ตามตัวกรอง)', en: 'Export CSV (filtered)' }) }}</button>
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
    .segmented {
      flex-wrap: wrap;
    }
  `,
})
export class AdminLogs {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  protected readonly url = screenUrl;
  protected readonly meta = LOG_TYPE;
  protected readonly types = Object.keys(LOG_TYPE) as AdminLogType[];

  /** เลือกได้หลายประเภท · ไม่เลือกเลย = ทั้งหมด */
  protected readonly picked = signal(new Set<AdminLogType>());
  protected readonly allRows = signal<AdminLog[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly rows = computed(() => {
    const p = this.picked();
    return this.allRows().filter((l) => !p.size || p.has(l.type));
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.allRows.set((await this.api.logs()).data);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected title(log: AdminLog): Tr {
    const place = log.house_no ?? log.box_id ?? log.result ?? log.type;
    const date = new Date(log.created_at).toLocaleTimeString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok',
    });
    return { th: `${LOG_TYPE[log.type].label.th} · ${place} · ${date}`, en: `${LOG_TYPE[log.type].label.en} · ${place} · ${date}` };
  }

  protected sub(log: AdminLog): Tr {
    const actor = log.actor_name ?? '—';
    const qr = log.qr_slot ? `QR ${log.qr_slot}` : '';
    const method = log.method ?? '';
    const result = log.result ?? '';
    const extra = log.details ?? '';
    const th = [actor, qr, method, result, extra].filter(Boolean).join(' · ');
    return { th, en: th };
  }

  /** ส่งออกแถวที่โหลดจาก GET /admin/logs และผ่านตัวกรองบนหน้าจอ */
  protected exportCsv(): void {
    const t = (x: Tr) => this.i18n.t(x);
    const head = [t({ th: 'ประเภท', en: 'Type' }), t({ th: 'รายการ', en: 'Event' }), t({ th: 'รายละเอียด', en: 'Details' }), t({ th: 'ผล', en: 'Result' })];
    const body = this.rows().map((l) => [t(this.meta[l.type].label), t(this.title(l)), t(this.sub(l)), l.fail ? t({ th: 'ไม่ผ่าน', en: 'Failed' }) : '']);
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    downloadText(`smmb-logs-${day}.csv`, toCsv([head, ...body]));
  }

  protected toggle(t: AdminLogType): void {
    this.picked.update((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }
}

// ── D12 · แจ้งเตือน (GET /me/notifications ของแอดมิน) ─────────────────

@Component({
  selector: 'app-admin-notifications',
  imports: [PageHeader, NotificationList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' })" [back]="url('D01')" />
    <div class="stack">
      <app-notification-list />
    </div>
  `,
})
export class AdminNotifications {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
}
