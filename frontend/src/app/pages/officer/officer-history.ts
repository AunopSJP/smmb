import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n, type Tr } from '../../core/i18n';
import { DisplaySettings } from '../../core/display-settings';
import { InspectionApi, type MyLog } from '../../core/inspection-api';
import { Session } from '../../core/session';
import { fmtWhen, fmtWhenSec } from '../../core/time';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { EmptyState, LoadingRows } from '../../shared/state-view';

/** ผลที่ถือว่าผ่าน — ที่เหลือคือมีปัญหา (ตรงกับหน้าประวัติของหัวหน้า) */
const OK = new Set(['ok', 'pass', 'passed']);

const RESULT: Record<string, Tr> = {
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
  bad_sig: { th: 'QR ประจำตัวปลอม', en: 'Forged badge' },
  wrong_job: { th: 'QR ของงานอื่น', en: 'Badge for another job' },
  wrong_user: { th: 'QR ของคนอื่น', en: 'Someone else’s badge' },
  expired: { th: 'QR หมดอายุ', en: 'Badge expired' },
  unreadable: { th: 'กล้องอ่านไม่ได้', en: 'Camera couldn’t read' },
};


/** O15 ประวัติการสแกนของฉัน (ตามแคนวาสดีไซน์) — ข้อมูลจริง `GET /officer/logs` · เห็นเฉพาะของตัวเอง · บันทึกทุกครั้งแม้ไม่ผ่าน */
@Component({
  selector: 'app-officer-history',
  imports: [PageHeader, Icon, EmptyState, LoadingRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="session.me()?.agency?.name ?? ''" [title]="i18n.t({ th: 'ประวัติ', en: 'History' })" />
    <div class="stack grow">
      <div class="segmented chips easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'กรองผล', en: 'Filter' })">
        <button type="button" [attr.aria-pressed]="filter() === 'all'" (click)="filter.set('all')">{{ i18n.t({ th: 'ทั้งหมด', en: 'All' }) }}</button>
        <button type="button" [attr.aria-pressed]="filter() === 'problems'" (click)="filter.set('problems')">
          {{ i18n.t({ th: 'ไม่ผ่าน', en: 'Problems' }) }}{{ problemCount() ? ' ' + problemCount() : '' }}
        </button>
      </div>
      @if (!rows().length) {
        @if (loading()) {
          <app-loading-rows [rows]="3" [label]="i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' })" />
        } @else if (error()) {
          <app-empty-state kind="error" (retry)="retryLoad()" />
        } @else if (logs().length) {
          <app-empty-state kind="search" [hint]="i18n.t({ th: 'ลองเลือก “ทั้งหมด” เพื่อดูทุกรายการ', en: 'Try “All” to see every entry' })" />
        } @else {
          <app-empty-state kind="first" [title]="i18n.t({ th: 'ยังไม่มีประวัติการสแกน', en: 'No scans yet' })" [hint]="i18n.t({ th: 'ตรวจตู้ครั้งแรกแล้วจะแสดงที่นี่', en: 'Your first inspection will show up here' })" />
        }
      } @else {
      <ul class="list">
        @for (l of rows(); track l.id) {
          <li class="row">
            <span class="icon-bubble" [class.danger]="chipTone(l) === 'danger'" [class.ok]="chipTone(l) === 'ok'"><app-icon [name]="chipTone(l) === 'ok' ? 'check' : chipTone(l) === 'danger' ? 'alert' : 'info'" [size]="20" /></span>
            <span class="grow">
              <strong>{{ title(l) }}</strong>
              <span class="muted small block">{{ when(l.at) }}<span class="easy-hide"> · {{ i18n.t(how(l)) }}</span></span>
            </span>
            <span class="chip" [class.ok]="chipTone(l) === 'ok'" [class.warn]="chipTone(l) === 'warn'" [class.danger]="chipTone(l) === 'danger'">{{ i18n.t(resultText(l)) }}</span>
          </li>
        }
      </ul>
      }
      @if (more()) {
        <button type="button" class="btn secondary" [disabled]="loading()" (click)="loadMore()">{{ i18n.t({ th: 'ดูเพิ่ม', en: 'Show more' }) }}</button>
      }
      @if (error() && rows().length) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'โหลดหน้าถัดไปไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วกด “ดูเพิ่ม” อีกครั้ง', en: 'Couldn’t load more — check your connection and tap “Show more” again' }) }}</p>
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
      font-size: var(--fs-xs);
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

  protected retryLoad(): void {
    void this.load();
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

  /** สีป้ายตามผลจริง (A9): เขียว = ผ่าน · กลาง = รับการสแกน · ส้ม = อ่านไม่ผ่าน · แดง = ไม่ผ่าน */
  protected chipTone(l: MyLog): '' | 'ok' | 'warn' | 'danger' {
    if (l.qr_kind === 'badge' && l.result === 'ok') return 'ok';
    if (l.result === 'pass' || l.result === 'passed') return 'ok';
    if (l.result === 'ok') return ''; // แถวสแกนหน้าตู้ไม่ถูกแก้ภายหลัง (log เพิ่มอย่างเดียว) จึงเป็นสีกลาง
    if (l.result === 'retry' || l.result === 'unreadable') return 'warn';
    return 'danger';
  }

  /** วัน + เวลา 24 ชม. ตามรูปแบบกลาง (A8) */
  protected when(iso: string): string {
    return fmtWhen(iso, this.i18n.lang());
  }

  /** เวลาเต็มพร้อมวันที่และวินาที (โหมดละเอียด) */
  protected stamp(iso: string): string {
    return fmtWhenSec(iso, this.i18n.lang());
  }
}
