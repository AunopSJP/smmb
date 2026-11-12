import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n, type Tr } from '../../core/i18n';
import { DisplaySettings } from '../../core/display-settings';
import { hhmm, InspectionApi, type MyLog } from '../../core/inspection-api';
import { Session } from '../../core/session';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

/** ผลที่ถือว่าผ่าน — ที่เหลือคือมีปัญหา (ตรงกับหน้าประวัติของหัวหน้า) */
const OK = new Set(['ok', 'pass', 'passed']);

const RESULT: Record<string, Tr> = {
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
  bad_sig: { th: 'QR ประจำตัวปลอม', en: 'Forged badge' },
  wrong_job: { th: 'QR ของงานอื่น', en: 'Badge for another job' },
  wrong_user: { th: 'QR ของคนอื่น', en: 'Someone else’s badge' },
  expired: { th: 'QR หมดอายุ', en: 'Badge expired' },
  unreadable: { th: 'กล้องอ่านไม่ได้', en: 'Camera couldn’t read' },
};

const bkkDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);

/** O15 ประวัติการสแกนของฉัน (ตามแคนวาสดีไซน์) — ข้อมูลจริง `GET /officer/logs` · เห็นเฉพาะของตัวเอง · บันทึกทุกครั้งแม้ไม่ผ่าน */
@Component({
  selector: 'app-officer-history',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="session.me()?.agency?.name ?? ''" [title]="i18n.t({ th: 'ประวัติ', en: 'History' })" />
    <div class="stack grow">
      <p class="adv-only">{{ i18n.t({ th: 'เฉพาะของคุณ · แก้ไขย้อนหลังไม่ได้', en: 'yours only · cannot be edited later' }) }}</p>
      <div class="segmented chips easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'กรองผล', en: 'Filter' })">
        <button type="button" [attr.aria-pressed]="filter() === 'all'" (click)="filter.set('all')">{{ i18n.t({ th: 'ทั้งหมด', en: 'All' }) }}</button>
        <button type="button" class="adv-only" [attr.aria-pressed]="filter() === 'ok'" (click)="filter.set('ok')">
          {{ i18n.t({ th: 'ผ่าน', en: 'Passed' }) }}
        </button>
        <button type="button" [attr.aria-pressed]="filter() === 'problems'" (click)="filter.set('problems')">
          {{ i18n.t({ th: 'ไม่ผ่าน', en: 'Problems' }) }}{{ problemCount() ? ' ' + problemCount() : '' }}
        </button>
      </div>
      <ul class="list">
        @for (l of rows(); track l.id) {
          @let ok = isOk(l);
          <li class="row">
            <span class="icon-bubble" [class.danger]="!ok" [class.ok]="ok"><app-icon [name]="ok ? 'check' : 'alert'" [size]="20" /></span>
            <span class="grow">
              <strong>{{ title(l) }}</strong>
              <span class="muted small block">{{ when(l.at) }}<span class="easy-hide"> · {{ i18n.t(how(l)) }}</span></span>
              <span class="muted small block adv-only">{{ i18n.t({ th: 'เวลาบันทึก ', en: 'Logged ' }) }}{{ stamp(l.at) }}</span>
            </span>
            <span class="chip" [class.ok]="ok" [class.danger]="!ok">{{ i18n.t(resultText(l)) }}</span>
          </li>
        } @empty {
          <li class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ยังไม่มีประวัติ', en: 'No history yet' }) }}</li>
        }
      </ul>
      @if (more()) {
        <button type="button" class="btn secondary" [disabled]="loading()" (click)="loadMore()">{{ i18n.t({ th: 'ดูเพิ่ม', en: 'Show more' }) }}</button>
      }
      @if (error()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'โหลดประวัติไม่สำเร็จ ลองอีกครั้ง', en: 'Could not load — try again' }) }}</p>
      }
      <p class="muted small easy-hide">{{ i18n.t({ th: 'ทุกการสแกนและพิมพ์รหัสถูกบันทึก แม้ไม่ผ่าน · หัวหน้าเห็นประวัติเดียวกันนี้ · ลบหรือแก้ไม่ได้', en: 'Every scan and typed code is logged, even failures · your head sees the same log · it cannot be edited' }) }}</p>
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
    .tech {
      margin: 0;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
  `,
})
export class OfficerHistory {
  protected readonly i18n = inject(I18n);
  protected readonly session = inject(Session);
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(InspectionApi);
  protected readonly logs = signal<MyLog[]>([]);
  protected readonly filter = signal<'all' | 'ok' | 'problems'>('all');
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly more = signal(false);
  private page = 1;

  protected readonly rows = computed(() => {
    const list = this.logs();
    if (this.display.easyMode()) return list;
    if (this.filter() === 'problems') return list.filter((l) => !this.isOk(l));
    if (this.filter() === 'ok') return list.filter((l) => this.isOk(l));
    return list;
  });
  protected readonly problemCount = computed(() => this.logs().filter((l) => !this.isOk(l)).length);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const r = await this.api.logs(this.page);
      this.logs.update((cur) => [...cur, ...r.data]);
      this.more.set(r.data.length === r.per_page);
      this.error.set(false);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected loadMore(): void {
    this.page++;
    void this.load();
  }

  protected isOk(l: MyLog): boolean {
    return OK.has(l.result);
  }

  protected resultText(l: MyLog): Tr {
    // ตู้อ่าน QR ประจำตัวได้ = ตรวจผ่าน (แถวของตู้บันทึกเป็น ok เหมือนตอนสแกนหน้าตู้ — แยกด้วย qr_kind เหมือนหน้าประวัติของหัวหน้า)
    if (l.qr_kind === 'badge' && l.result === 'ok') return RESULT['pass'];
    return RESULT[l.result] ?? { th: l.result, en: l.result };
  }

  /** ขั้นไหนของการตรวจ: ตู้อ่าน QR ประจำตัว / พิมพ์รหัสใต้ QR / สแกน QR หน้าตู้ */
  protected how(l: MyLog): Tr {
    if (l.qr_kind === 'badge') return { th: 'ตู้อ่าน QR ประจำตัว', en: 'Box read your badge' };
    return l.method === 'code' ? { th: 'พิมพ์รหัสใต้ QR', en: 'Typed the code' } : { th: 'สแกน QR หน้าตู้', en: 'Scanned the front QR' };
  }

  protected title(l: MyLog): string {
    return l.house_no ? this.i18n.t({ th: 'บ้าน ', en: 'House ' }) + l.house_no : this.i18n.t({ th: 'ไม่ทราบตู้', en: 'Unknown box' });
  }

  protected when(iso: string): string {
    const today = bkkDay(new Date()) === bkkDay(new Date(iso));
    const d = new Date(iso).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
    return (today ? this.i18n.t({ th: 'วันนี้', en: 'Today' }) : d) + ' ' + hhmm(iso);
  }

  /** เวลาเต็มพร้อมวันที่และวินาที (โหมดละเอียด) */
  protected stamp(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    });
  }
}
