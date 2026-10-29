import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminApi, type AdminBoxDetail, type AdminQrIssue, type ReissuedQr } from '../../core/admin-api';
import { AdminQrState } from '../../core/admin-qr-state';
import { I18n, type Tr } from '../../core/i18n';
import type { QrCase, QrHealth } from '../../core/mock/admin-demo';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { QrImage } from '../../shared/qr-image';
import { Steps, type Step } from '../../shared/steps';

// ขั้นตอน "จัดการ QR เสีย" ของแอดมิน — SMMB_ขั้นตอนการใช้งานแต่ละคน.md · api.md §9.4

export const HEALTH: Record<QrHealth, { label: Tr; tone: '' | 'warn' | 'danger'; icon: IconName }> = {
  damaged: { label: { th: 'เสีย', en: 'Damaged' }, tone: 'danger', icon: 'scan' },
  suspicious: { label: { th: 'น่าสงสัย', en: 'Suspicious' }, tone: 'warn', icon: 'scan' },
  maybe_fake: { label: { th: 'อาจปลอม', en: 'Maybe fake' }, tone: 'danger', icon: 'alert' },
  expiring: { label: { th: 'ใกล้ครบอายุ', en: 'Expiring' }, tone: '', icon: 'scan' },
};

const SLOT: Record<1 | 2, Tr> = {
  1: { th: 'QR หน้าตู้', en: 'Front QR' },
  2: { th: 'QR สำรอง', en: 'Backup QR' },
};

/** หน้าที่ต้องเปิดของเคสนี้ ตามทางแก้ที่เลือกแล้ว */
export function caseUrl(c: QrCase): { path: string; query: { id: string } } {
  const code = c.resolved ? 'D08' : c.fix === 'fake' || c.health === 'maybe_fake' ? 'D06' : c.fix === 'swap' ? 'D07' : c.fix === 'reissue' ? 'D07-b' : 'D06-b';
  return { path: screenUrl(code), query: { id: c.id } };
}

/** สถานะสั้น ๆ ของเคสที่กำลังแก้ (แสดงในรายการ) */
function progress(c: QrCase): Tr | null {
  if (c.fix === 'swap') return c.step === 1 ? { th: 'รอเจ้าของบ้านติดใบสำรอง', en: 'Waiting for the owner' } : { th: 'รอออกใบสำรองใหม่', en: 'New backup to issue' };
  if (c.fix === 'reissue') return c.step === 2 ? { th: 'ออกใหม่ 2 ใบแล้ว · รอส่งช่าง', en: '2 new QRs issued · send a technician' } : { th: 'ช่างกำลังไปติด', en: 'Technician on the way' };
  if (c.fix === 'fake' && c.step === 1) return { th: 'ส่งช่างด่วนแล้ว', en: 'Technician sent' };
  return null;
}

const caseTitle = (c: QrCase, i18n: I18n) => `${i18n.t({ th: 'ตู้ ', en: 'Box ' })}${c.house} · ${i18n.t(SLOT[c.slot])}`;

// ── ใบพิมพ์ QR ใบใหม่ (ซ่อนบนจอ — window.print()) ───────────────────

/**
 * ต้นแบบของไฟล์พิมพ์ · ของจริง: GET /admin/boxes/:box_id/qr/print.pdf?slots=1,2 (💡 api.md §9.4)
 * QR + รหัสใต้ QR + รหัสตู้ · ระดับแก้ข้อผิดพลาด H · เคลือบกันแดดกันน้ำ
 */
@Component({
  selector: 'app-qr-print-sheet',
  imports: [QrImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="print-sheet">
      @for (s of slots(); track s) {
        <section class="print-card">
          <header><img src="icons/icon-96x96.png" width="28" height="28" alt="" /> Smart Mailbox</header>
          @let item = itemFor(s);
          <div class="qr"><app-qr-image [text]="item?.url ?? ''" level="H" logo="icons/icon-128x128.png" [label]="i18n.t(slot[s])" /></div>
          <p class="code">{{ item?.print_code ?? '' }}</p>
          <p class="slot">{{ s === 1 ? i18n.t({ th: 'QR หน้าตู้ — ติดด้านนอกตู้', en: 'Front QR — stick on the outside' }) : i18n.t({ th: 'QR สำรอง — เก็บไว้ในตู้', en: 'Backup QR — keep inside the box' }) }}</p>
          <p class="meta">{{ i18n.t({ th: 'ตู้ ', en: 'Box ' }) }}{{ boxId() }} · {{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ house() }}</p>
        </section>
      }
    </div>
  `,
  styles: `
    .print-card {
      border: 1px solid #000;
      border-radius: 4mm;
      padding: 6mm;
      text-align: center;
      break-inside: avoid;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-weight: 700;
    }
    .qr {
      width: 55mm;
      margin: 4mm auto;
    }
    .code {
      font-size: 20pt;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .meta,
    .note {
      font-size: 9pt;
    }
    .note {
      grid-column: 1 / -1;
    }
  `,
})
export class QrPrintSheet {
  protected readonly i18n = inject(I18n);
  protected readonly slot = SLOT;
  readonly boxId = input.required<string>();
  readonly house = input.required<string>();
  readonly slots = input.required<(1 | 2)[]>();
  readonly qr = input.required<{ slot: string | number; url: string; print_code: string }[]>();

  protected itemFor(slot: 1 | 2) {
    return this.qr().find((item) => item.slot === slot);
  }
}

// ── D05 · สุขภาพ QR ──────────────────────────────────────────

@Component({
  selector: 'app-admin-qr',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'แอดมิน Smart Mailbox', en: 'Smart Mailbox admin' })"
      [title]="i18n.t({ th: 'สุขภาพ QR', en: 'QR health' })"
      [bell]="url('D12')"
    />
    <div class="stack">
      <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'กรอง', en: 'Filter' })">
        @for (h of healths; track h) {
          <button type="button" [attr.aria-pressed]="picked().has(h)" (click)="toggle(h)">{{ i18n.t(health[h].label) }}</button>
        }
      </div>
      <nav class="list">
        @for (c of rows(); track c.id) {
          @let h = health[c.health];
          @let link = caseLink(c);
          <a class="row" [routerLink]="link.path" [queryParams]="link.query">
            <span class="icon-bubble" [class.danger]="h.tone === 'danger'" [class.warn]="h.tone === 'warn'"><app-icon [name]="h.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ c.house }} · {{ i18n.t(slot[c.slot]) }}</strong>
              <span class="muted small block">{{ i18n.t(c.reason) }}</span>
              @if (progressOf(c); as p) {
                <span class="small block progress">{{ i18n.t(p) }}</span>
              }
            </span>
            <span class="chip" [class.danger]="h.tone === 'danger'" [class.warn]="h.tone === 'warn'">{{ i18n.t(h.label) }}</span>
          </a>
        } @empty {
          <p class="row muted">{{ i18n.t({ th: 'QR ทุกใบปกติ', en: 'Every QR is fine' }) }}</p>
        }
      </nav>
      <p class="muted small">{{ i18n.t({ th: 'ตรวจอัตโนมัติทุกคืน 23:00 · QR ที่อาจปลอมแจ้งทันที', en: 'Checked every night at 23:00 · possible fakes are reported at once' }) }}</p>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .progress {
      color: var(--brand);
      font-weight: 700;
    }
    .segmented {
      flex-wrap: wrap;
    }
  `,
})
export class AdminQr {
  protected readonly i18n = inject(I18n);
  private readonly state = inject(AdminQrState);
  protected readonly url = screenUrl;
  protected readonly health = HEALTH;
  protected readonly slot = SLOT;
  protected readonly caseLink = caseUrl;
  protected readonly progressOf = progress;
  protected readonly healths: QrHealth[] = ['damaged', 'suspicious', 'maybe_fake', 'expiring'];

  /** เลือกได้หลายอย่าง · ไม่เลือกเลย = แสดงทั้งหมด */
  protected readonly picked = signal(new Set<QrHealth>());
  protected readonly rows = computed(() => {
    const p = this.picked();
    return this.state.issues().map(toQrCase).filter((c) => !c.resolved && (!p.size || p.has(c.health)));
  });

  constructor() {
    void this.state.refresh().catch(() => undefined);
    const timer = setInterval(() => void this.state.refresh().catch(() => undefined), 10_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected toggle(h: QrHealth): void {
    this.picked.update((s) => {
      const next = new Set(s);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
  }
}

/** เคสที่เปิดอยู่จาก ?id= (ไม่มี/ไม่เจอ = เคสแรกที่ตรงเงื่อนไข) */
function toQrCase(issue: AdminQrIssue): QrCase {
  const reason = issue.health === 'maybe_fake'
    ? { th: 'พบ QR ที่ไม่ใช่ QR ที่ลงทะเบียนกับตู้', en: 'A QR not registered to this box was scanned' }
    : issue.health_reasons.includes('reported_damaged')
      ? { th: 'เจ้าหน้าที่รายงานว่า QR ชำรุด', en: 'An officer reported the QR as damaged' }
      : issue.health_reasons.includes('backup_used')
        ? { th: 'มีการใช้ QR สำรองแทนใบหน้าตู้', en: 'The backup QR was used in place of the front QR' }
        : issue.health_reasons.includes('rider_typed_often') || issue.health_reasons.includes('typed_by_officer')
          ? { th: 'มีการพิมพ์รหัสใต้ QR บ่อย', en: 'The QR code is being typed often' }
          : issue.health_reasons.includes('slow_scan')
            ? { th: 'ใช้เวลาสแกนนานผิดปกติ', en: 'The QR takes unusually long to scan' }
            : issue.health === 'expiring'
              ? { th: 'QR ใกล้ครบอายุการใช้งาน', en: 'The QR is nearing its service age' }
              : { th: 'QR มีสัญญาณผิดปกติ', en: 'The QR has an unusual pattern' };
  const when = new Date(issue.updated_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  return {
    id: issue.id,
    box_id: issue.box_id,
    house: issue.house_no,
    slot: issue.slot,
    health: issue.health,
    reason,
    when: { th: when, en: new Date(issue.updated_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) },
    backup_used: issue.backup_used,
    fix: issue.fix,
    step: issue.step,
    resolved: issue.resolved,
    ...(issue.delivery_method ? { delivery: issue.delivery_method } : {}),
  };
}

function pickCase(issues: AdminQrIssue[], id: string | undefined, ok: (c: QrCase) => boolean): QrCase | undefined {
  const issue = issues.find((item) => item.id === id);
  const current = issue ? toQrCase(issue) : undefined;
  return current && ok(current) ? current : issues.map(toQrCase).find(ok);
}

// ── D06 · อาจเป็น QR ปลอม ────────────────────────────────────

const FAKE_STEPS: Step[] = [
  { title: { th: 'ส่งช่างไปตรวจด่วน', en: 'Send a technician now' }, sub: { th: 'ลอก QR ปลอมออก', en: 'Remove the fake QR' } },
  { title: { th: 'ติด QR ใบใหม่', en: 'Put up a new QR' }, sub: { th: 'ระบบออกให้อัตโนมัติ', en: 'Issued automatically' } },
  { title: { th: 'บันทึกสถานะเป็นปกติ', en: 'Mark as fixed' }, sub: { th: 'เก็บประวัติการเปลี่ยน', en: 'Keeps a change history' } },
];

@Component({
  selector: 'app-admin-qr-fake',
  imports: [RouterLink, Icon, Steps, QrPrintSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (qr(); as c) {
      <header class="fake-head">
        <a class="back" [routerLink]="url('D05')" [attr.aria-label]="i18n.t({ th: 'ย้อนกลับ', en: 'Back' })"><app-icon name="chevronLeft" [size]="22" /></a>
        <span class="pill">{{ i18n.t({ th: 'อาจเป็น QR ปลอม', en: 'Possibly a fake QR' }) }}</span>
        <h1>{{ title(c) }}</h1>
        <p>{{ i18n.t(c.reason) }}</p>
        <p>{{ i18n.t(c.when) }} · {{ i18n.t({ th: 'แจ้งหัวหน้าโซนแล้ว', en: 'Zone head notified' }) }}</p>
      </header>
      <div class="pad">
        <app-steps [steps]="steps" [current]="c.step" />
        @if (issued().length) {
          <app-qr-print-sheet [boxId]="c.box_id" [house]="c.house" [slots]="[1, 2]" [qr]="issued()" />
          <button type="button" class="btn secondary" (click)="print()">{{ i18n.t({ th: 'พิมพ์ QR ใหม่', en: 'Print new QRs' }) }}</button>
        }
        <div class="stack push-end">
          @if (c.step === 0) {
            <button type="button" class="btn" [disabled]="busy()" (click)="dispatch(c.id, c.box_id)">{{ busy() ? i18n.t({ th: 'กำลังออก QR และส่งช่าง…', en: 'Issuing QRs and dispatching…' }) : i18n.t({ th: 'ออก QR ใหม่ 2 ใบและส่งช่าง', en: 'Issue 2 new QRs and dispatch a technician' }) }}</button>
          } @else {
            <p class="muted small center">{{ i18n.t({ th: 'ช่างกำลังไป — กดเมื่อช่างลอกของปลอมและติดใบใหม่แล้ว', en: 'Technician on the way — press once the fake is removed and the new QR is up' }) }}</p>
            <button type="button" class="btn" (click)="resolve(c.id)">{{ i18n.t({ th: 'ช่างติดใบใหม่แล้ว · บันทึกเป็นปกติ', en: 'New QR is up · mark as fixed' }) }}</button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .fake-head {
      position: relative;
      background: var(--sos);
      color: #fff;
      padding: 20px 16px 22px 72px;
      border-radius: 0 0 24px 24px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;

      h1 {
        font-size: 1.5rem;
        line-height: 1.3;
      }
      p {
        font-size: 0.875rem;
        opacity: 0.92;
      }
    }
    .back {
      position: absolute;
      left: 16px;
      top: 18px;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgb(255 255 255 / 18%);
      color: #fff;
    }
    .pill {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 2px 10px;
      border-radius: 999px;
      background: rgb(255 255 255 / 20%);
    }
  `,
})
export class AdminQrFake {
  protected readonly i18n = inject(I18n);
  private readonly state = inject(AdminQrState);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly steps = FAKE_STEPS;
  readonly id = input<string>();
  protected readonly issued = signal<ReissuedQr[]>([]);
  protected readonly busy = signal(false);
  protected readonly qr = computed(() => pickCase(this.state.issues(), this.id(), (c) => c.fix === 'fake' || c.health === 'maybe_fake'));

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.state.get(id);
    });
  }
  protected title(c: QrCase): string {
    return caseTitle(c, this.i18n);
  }

  protected async dispatch(id: string, boxId: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      if (this.qr()?.fix !== 'fake') await this.state.chooseFix(id, 'fake');
      if (!this.issued().length) {
        const key = this.requestId(id);
        const result = await this.api.reissueQr(boxId, [1, 2], key);
        this.issued.set(result.qr);
        await this.state.recordReissue(id, [1, 2]);
      }
      await this.state.dispatchTechnician(id);
      this.toast.show({ th: 'ออก QR ใหม่แล้ว · ส่งช่างไปติด', en: 'New QRs issued · technician dispatched' });
    } catch {
      this.toast.show({ th: 'ดำเนินการไม่ได้ · โหลดเคสใหม่แล้วลองอีกครั้ง', en: 'Could not continue · reload the case and try again' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async resolve(id: string): Promise<void> {
    try {
      await this.state.resolve(id);
      void this.router.navigate([screenUrl('D08')], { queryParams: { id } });
    } catch {
      this.toast.show({ th: 'ปิดเคสไม่ได้ · ตรวจสถานะช่างก่อน', en: 'Could not close the case · check the technician status' });
    }
  }

  protected print(): void {
    window.print();
  }

  private requestId(caseId: string): string {
    const key = `smmb.qr-reissue.${caseId}`;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) return stored;
      const created = crypto.randomUUID();
      sessionStorage.setItem(key, created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  }
}

// ── D06-b · QR เสีย · เลือกวิธีแก้ ─────────────────────────────

@Component({
  selector: 'app-admin-qr-damaged',
  imports: [RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (qr(); as c) {
      <app-page-header [caption]="i18n.t({ th: 'QR ', en: 'QR · ' }) + i18n.t(health[c.health].label)" [title]="title(c)" [back]="url('D05')" />
      <div class="stack grow">
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'สาเหตุ', en: 'Reason' }) }}</dt>
            <dd>{{ i18n.t(c.reason) }}</dd>
            <dt>{{ i18n.t({ th: 'เมื่อ', en: 'When' }) }}</dt>
            <dd>{{ i18n.t(c.when) }}</dd>
            <dt>{{ i18n.t({ th: 'QR สำรองในตู้', en: 'Backup QR in box' }) }}</dt>
            <dd [class.ok]="!c.backup_used" [class.danger-text]="c.backup_used">
              {{ c.backup_used ? i18n.t({ th: 'มีการสแกนแล้ว', en: 'Already scanned' }) : i18n.t({ th: 'ยังไม่เคยใช้', en: 'Never used' }) }}
            </dd>
          </dl>
        </section>

        @if (c.fix) {
          <p class="info-box muted">{{ i18n.t({ th: 'เลือกวิธีแก้ไปแล้ว', en: 'A fix is already in progress' }) }}</p>
          <a class="btn push-end" [routerLink]="link(c).path" [queryParams]="link(c).query">{{ i18n.t({ th: 'ดูความคืบหน้า', en: 'See progress' }) }}</a>
        } @else {
          <fieldset class="options">
            <legend>{{ i18n.t({ th: 'QR สำรองยังอยู่ในตู้ไหม?', en: 'Is the backup QR still in the box?' }) }}</legend>
            <label>
              <input type="radio" name="fix" value="swap" [checked]="fix() === 'swap'" (change)="fix.set('swap')" />
              <span>
                {{ i18n.t({ th: 'ยังอยู่: ให้เจ้าของบ้านเอาไปติด', en: 'Still there: the owner puts it up' }) }}
                <small>{{ i18n.t({ th: 'แจ้งเตือนเจ้าของบ้านทันที', en: 'The owner is notified now' }) }}</small>
              </span>
            </label>
            <label>
              <input type="radio" name="fix" value="reissue" [checked]="fix() === 'reissue'" (change)="fix.set('reissue')" />
              <span>
                {{ i18n.t({ th: 'ใช้ไปแล้ว: ออก QR ใหม่ทั้ง 2 ใบ', en: 'Used already: issue 2 new QRs' }) }}
                <small>{{ i18n.t({ th: 'ช่างติด QR หน้าตู้ + เก็บ QR สำรองในตู้ · ใบเก่าใช้ไม่ได้ทันที', en: 'A technician puts up the front QR + stores the backup · old ones stop working at once' }) }}</small>
              </span>
            </label>
          </fieldset>
          @if (c.health === 'expiring') {
            <p class="muted small">{{ i18n.t({ th: 'QR สำรองอายุเท่ากับใบหน้าตู้ — แนะนำออกใหม่ทั้ง 2 ใบ', en: 'The backup is as old as the front QR — issuing 2 new ones is better' }) }}</p>
          }
          <button type="button" class="btn push-end" (click)="go(c)">
            {{ fix() === 'swap' ? i18n.t({ th: 'ให้เจ้าของบ้านใช้ QR สำรอง', en: 'Ask the owner to use the backup' }) : i18n.t({ th: 'ออก QR ใหม่ 2 ใบ', en: 'Issue 2 new QRs' }) }}
          </button>
        }
      </div>
    }
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .options span {
      display: flex;
      flex-direction: column;
    }
    .options small {
      font-weight: 400;
      color: var(--text-muted);
    }
  `,
})
export class AdminQrDamaged {
  protected readonly i18n = inject(I18n);
  private readonly state = inject(AdminQrState);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly health = HEALTH;
  protected readonly link = caseUrl;
  readonly id = input<string>();
  protected readonly busy = signal(false);
  protected readonly qr = computed(() => pickCase(this.state.issues(), this.id(), (c) => c.health !== 'maybe_fake' && !c.resolved));
  /** ค่าเริ่มต้น: ใบสำรองเคยถูกใช้ หรือใกล้ครบอายุ → ออกใหม่ 2 ใบ */
  protected readonly fix = linkedSignal<'swap' | 'reissue'>(() => {
    const c = this.qr();
    return c && (c.backup_used || c.health === 'expiring') ? 'reissue' : 'swap';
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.state.get(id);
    });
  }

  protected title(c: QrCase): string {
    return caseTitle(c, this.i18n);
  }

  protected async go(c: QrCase): Promise<void> {
    if (this.busy()) return;
    const fix = this.fix();
    this.busy.set(true);
    try {
      if (fix === 'swap') await this.state.requestBackupSwap(c.id);
      else await this.state.chooseFix(c.id, 'reissue');
      this.toast.show(fix === 'swap' ? { th: 'แจ้งเจ้าของบ้านแล้ว', en: 'Owner notified' } : { th: 'บันทึกเคสแล้ว · ออก QR ในขั้นถัดไป', en: 'Case saved · issue the QRs in the next step' });
      await this.router.navigate([screenUrl(fix === 'swap' ? 'D07' : 'D07-b')], { queryParams: { id: c.id } });
    } catch {
      this.toast.show({ th: 'บันทึกเคสไม่ได้ · ลองโหลดหน้าใหม่', en: 'Could not save the case · reload and try again' });
    } finally {
      this.busy.set(false);
    }
  }
}

// ── D07 · รอเจ้าของบ้านติด QR สำรอง ───────────────────────────

@Component({
  selector: 'app-admin-qr-swap',
  imports: [PageHeader, Steps, QrPrintSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (qr(); as c) {
      <app-page-header
        [caption]="c.step < 3 ? i18n.t({ th: 'รอเจ้าของบ้าน', en: 'Waiting for the owner' }) : i18n.t({ th: 'ออกใบสำรองใหม่', en: 'Issue a new backup' })"
        [title]="title(c)"
        [back]="url('D05')"
      />
      <div class="stack grow">
        <app-steps [steps]="steps(c)" [current]="c.step" />

        @if (issued().length) {
          <app-qr-print-sheet [boxId]="c.box_id" [house]="c.house" [slots]="[2]" [qr]="issued()" />
        }
        @if (c.step >= 3) {
          <fieldset class="options">
            <legend>{{ i18n.t({ th: 'ส่งใบสำรองใหม่ให้เจ้าของบ้านทาง', en: 'Send the new backup by' }) }}</legend>
            <label><input type="radio" name="delivery" [checked]="delivery() === 'post'" (change)="delivery.set('post')" /> {{ i18n.t({ th: 'ไปรษณีย์', en: 'Post' }) }}</label>
            <label><input type="radio" name="delivery" [checked]="delivery() === 'technician'" (change)="delivery.set('technician')" /> {{ i18n.t({ th: 'ช่างนำไปให้', en: 'Technician brings it' }) }}</label>
          </fieldset>
        }

        <div class="stack push-end">
          @if (c.step === 1) {
            <p class="muted small center">{{ i18n.t({ th: 'ส่งแจ้งเตือนให้เจ้าของบ้านแล้ว · รอเจ้าของบ้านยืนยันจากหน้าหลัก', en: 'The owner was notified · waiting for them to confirm from their home page' }) }}</p>
          }
          @if (c.step >= 3 && !issued().length) {
            <button type="button" class="btn" [disabled]="busy()" (click)="issue(c)">{{ busy() ? i18n.t({ th: 'กำลังออก QR…', en: 'Issuing QR…' }) : i18n.t({ th: 'ออก QR สำรองใหม่', en: 'Issue a new backup QR' }) }}</button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .grow {
      flex: 1;
    }
  `,
})
export class AdminQrSwap {
  protected readonly i18n = inject(I18n);
  private readonly state = inject(AdminQrState);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly busy = signal(false);
  protected readonly issued = signal<ReissuedQr[]>([]);
  protected readonly qr = computed(() => pickCase(this.state.issues(), this.id(), (c) => c.fix === 'swap'));

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.state.get(id).catch(() => undefined);
    });
    const timer = setInterval(() => {
      const id = this.id();
      if (id) void this.state.get(id).catch(() => undefined);
    }, 3_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  protected readonly delivery = signal<'post' | 'technician'>('post');

  protected title(c: QrCase): string {
    return caseTitle(c, this.i18n);
  }

  protected steps(c: QrCase): Step[] {
    return [
      { title: { th: 'แจ้งเจ้าของบ้านแล้ว', en: 'Owner notified' }, sub: c.when },
      { title: { th: 'รอเจ้าของบ้านกด "ติดแล้ว"', en: 'Waiting for the owner to tap “Done”' }, sub: { th: 'หรือรอมีการสแกน QR สำรอง', en: 'or for the backup QR to be scanned' } },
      { title: { th: 'ปิดรหัสใบเก่า', en: 'Cancel the old QR' }, sub: { th: 'ใช้ไม่ได้แล้ว', en: 'It stops working' } },
      { title: { th: 'ออก QR สำรองใบใหม่', en: 'Issue a new backup QR' }, sub: { th: 'ส่งไปรษณีย์ / ช่างนำไป', en: 'By post / technician' } },
    ];
  }

  protected async issue(c: QrCase): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const result = await this.api.reissueQr(c.box_id, [2], this.requestId(c.id));
      this.issued.set(result.qr);
      await this.state.recordReissue(c.id, [2], this.delivery());
      await this.state.resolve(c.id);
      this.toast.show({ th: 'ออก QR สำรองใหม่แล้ว · ใบเดิมใช้ไม่ได้', en: 'New backup QR issued · the old front QR is disabled' });
      await this.router.navigate([screenUrl('D08')], { queryParams: { id: c.id } });
    } catch {
      this.toast.show({ th: 'ออก QR ไม่สำเร็จ · โหลดเคสใหม่แล้วลองอีกครั้ง', en: 'Could not issue the QR · reload the case and try again' });
    } finally {
      this.busy.set(false);
    }
  }

  private requestId(caseId: string): string {
    const key = `smmb.qr-reissue.${caseId}.backup`;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) return stored;
      const created = crypto.randomUUID();
      sessionStorage.setItem(key, created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  }
}

// ── D07-b · ใบสำรองใช้ไปแล้ว · ออกใหม่ 2 ใบ ────────────────────

const REISSUE_STEPS: Step[] = [
  { title: { th: 'ออก QR ใหม่ 2 ใบ', en: 'Issue 2 new QRs' }, sub: { th: 'ระบบสร้างให้แล้ว พร้อมพิมพ์', en: 'Created and ready to print' } },
  { title: { th: 'ปิดรหัสใบเก่าทั้ง 2 ใบ', en: 'Cancel both old QRs' }, sub: { th: 'ใช้ไม่ได้แล้ว', en: 'They stop working' } },
  { title: { th: 'ส่งช่างไปติด', en: 'Send a technician' }, sub: { th: 'ติด QR หน้าตู้ + เก็บ QR สำรองในตู้', en: 'Front QR on the box + backup stored inside' } },
  { title: { th: 'บันทึกสถานะเป็นปกติ', en: 'Mark as fixed' }, sub: { th: 'เก็บประวัติการเปลี่ยน', en: 'Keeps a change history' } },
];

@Component({
  selector: 'app-admin-qr-reissue',
  imports: [PageHeader, Steps, QrPrintSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (qr(); as c) {
      <app-page-header [caption]="i18n.t({ th: 'QR สำรองใช้ไปแล้ว', en: 'Backup already used' })" [title]="title(c)" [back]="url('D05')" />
      @if (issued().length) {
        <app-qr-print-sheet [boxId]="c.box_id" [house]="c.house" [slots]="[1, 2]" [qr]="issued()" />
      }
      <div class="stack grow">
        <app-steps [steps]="steps" [current]="c.step" />
        <div class="stack push-end">
          @if (!issued().length) {
            <button type="button" class="btn secondary" [disabled]="issuing()" (click)="issue(c.box_id, c.id)">{{ issuing() ? i18n.t({ th: 'กำลังออก QR…', en: 'Issuing QRs…' }) : i18n.t({ th: 'ออก QR ใหม่ 2 ใบ', en: 'Issue 2 new QRs' }) }}</button>
          } @else {
            <button type="button" class="btn secondary" (click)="print()">{{ i18n.t({ th: 'พิมพ์ QR ใหม่ 2 ใบ', en: 'Print the 2 new QRs' }) }}</button>
          }
          @if (c.step === 2) {
            <button type="button" class="btn" [disabled]="!issued().length" (click)="dispatch(c.id)">{{ i18n.t({ th: 'ส่งช่างไปติด', en: 'Send a technician' }) }}</button>
          } @else if (c.step === 3) {
            <p class="muted small center">{{ i18n.t({ th: 'ช่างกำลังไป — กดเมื่อติดครบ 2 ใบแล้ว', en: 'Technician on the way — press once both are in place' }) }}</p>
            <button type="button" class="btn" (click)="resolve(c.id)">{{ i18n.t({ th: 'ช่างติดแล้ว · บันทึกเป็นปกติ', en: 'Both in place · mark as fixed' }) }}</button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .grow {
      flex: 1;
    }
  `,
})
export class AdminQrReissue {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly state = inject(AdminQrState);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly steps = REISSUE_STEPS;
  readonly id = input<string>();
  protected readonly issued = signal<ReissuedQr[]>([]);
  protected readonly issuing = signal(false);
  protected readonly qr = computed(() => pickCase(this.state.issues(), this.id(), (c) => c.fix === 'reissue'));

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.loadIssue(id);
    });
  }

  private async loadIssue(id: string): Promise<void> {
    try {
      const issue = await this.state.get(id);
      if (issue.status === 'qr_reissued' || issue.status === 'technician_dispatched') await this.loadIssued(issue.box_id);
    } catch {
      this.toast.show({ th: 'โหลดเคส QR ไม่ได้', en: 'Could not load QR case' });
    }
  }

  private async loadIssued(boxId: string): Promise<void> {
    const box = await this.api.box(boxId);
    this.issued.set(box.qr.filter((qr): qr is typeof qr & { slot: 1 | 2 } => (qr.slot === 1 || qr.slot === 2) && qr.status === 'active').map((qr) => ({
      id: qr.id,
      slot: qr.slot,
      version: qr.version,
      url: qr.url,
      print_code: qr.print_code,
    })));
  }

  protected title(c: QrCase): string {
    return caseTitle(c, this.i18n);
  }

  protected async dispatch(id: string): Promise<void> {
    try {
      await this.state.dispatchTechnician(id);
      this.toast.show({ th: 'ส่งช่างแล้ว', en: 'Technician dispatched' });
    } catch {
      this.toast.show({ th: 'ส่งช่างไม่ได้ · ตรวจว่าออก QR ใหม่แล้ว', en: 'Could not dispatch · issue the new QRs first' });
    }
  }

  protected print(): void {
    window.print();
  }

  protected async issue(boxId: string, caseId: string): Promise<void> {
    if (this.issuing()) return;
    this.issuing.set(true);
    try {
      if (this.state.issues().find((issue) => issue.id === caseId)?.status !== 'qr_reissued') {
        const result = await this.api.reissueQr(boxId, [1, 2], this.requestId(caseId));
        this.issued.set(result.qr);
        await this.state.recordReissue(caseId, [1, 2]);
      } else {
        await this.loadIssued(boxId);
      }
      this.toast.show({ th: 'ออก QR จริง 2 ใบแล้ว · QR เก่าถูกปิด', en: 'Issued 2 scannable QRs · old QRs revoked' });
    } catch {
      this.toast.show({ th: 'ออก QR ไม่สำเร็จ · โหลดหน้าใหม่แล้วลองอีกครั้ง', en: 'Could not issue QRs · reload and try again' });
    } finally {
      this.issuing.set(false);
    }
  }

  private requestId(caseId: string): string {
    const key = `smmb.qr-reissue.${caseId}`;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) return stored;
      const created = crypto.randomUUID();
      sessionStorage.setItem(key, created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  }

  protected async resolve(id: string): Promise<void> {
    try {
      await this.state.resolve(id);
      void this.router.navigate([screenUrl('D08')], { queryParams: { id } });
    } catch {
      this.toast.show({ th: 'ปิดเคสไม่ได้ · ส่งช่างก่อน', en: 'Could not close the case · dispatch a technician first' });
    }
  }
}

// ── D08 · QR กลับมาปกติแล้ว ─────────────────────────────────

@Component({
  selector: 'app-admin-qr-fixed',
  imports: [RouterLink, Icon, QrPrintSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="muted center">{{ i18n.t({ th: 'กำลังโหลดผลการแก้ไข QR…', en: 'Loading QR resolution…' }) }}</p>
    } @else if (qr(); as c) {
      @if (c.resolved) {
    <div class="pad fixed" role="status">
      <div class="result">
        <span class="big-icon white"><app-icon name="check" [size]="36" /></span>
        <h1>{{ i18n.t({ th: 'QR กลับมาปกติแล้ว', en: 'QR is back to normal' }) }}</h1>
        @if (qr(); as c) {
          <p>{{ i18n.t({ th: 'ตู้ ', en: 'Box ' }) }}{{ c.house }} · {{ i18n.t({ th: 'บันทึกประวัติการเปลี่ยนแล้ว', en: 'change history saved' }) }}</p>
        }
      </div>
      @if (summary(); as s) {
        <p class="summary">
          <strong>{{ i18n.t(s[0]) }}</strong><br />
          <span class="small">{{ i18n.t(s[1]) }}</span>
        </p>
      }
      <div class="stack push-end">
        @if (qr(); as c) {
          @if (printSlots(); as slots) {
            @if (printableQr().length) {
              <app-qr-print-sheet [boxId]="c.box_id" [house]="c.house" [slots]="slots" [qr]="printableQr()" />
              <button type="button" class="btn outline-light" (click)="print()">{{ i18n.t({ th: 'พิมพ์ QR ใบใหม่', en: 'Print the new QR' }) }}</button>
            }
          }
        }
        <a class="btn on-color" [routerLink]="url('D05')">{{ i18n.t({ th: 'กลับรายการ QR', en: 'Back to QR list' }) }}</a>
      </div>
    </div>
      } @else {
        <section class="card stack" role="alert">
          <strong>{{ i18n.t({ th: 'เคสนี้ยังไม่ได้ปิด', en: 'This case is not resolved yet' }) }}</strong>
          <span class="muted small">{{ i18n.t({ th: 'ดำเนินการขั้นก่อนหน้าให้ครบก่อน แล้วค่อยเปิดผลการแก้ไข', en: 'Complete the previous steps before viewing the resolution' }) }}</span>
          <a class="btn secondary" [routerLink]="url('D05')">{{ i18n.t({ th: 'กลับรายการ QR', en: 'Back to QR list' }) }}</a>
        </section>
      }
    } @else {
      <section class="card stack" role="alert">
        <strong>{{ i18n.t({ th: loadError() ? 'โหลดผลการแก้ไขไม่ได้' : 'ไม่พบเคส QR นี้', en: loadError() ? 'Could not load the resolution' : 'QR case not found' }) }}</strong>
        <a class="btn secondary" [routerLink]="url('D05')">{{ i18n.t({ th: 'กลับรายการ QR', en: 'Back to QR list' }) }}</a>
      </section>
    }
  `,
  styles: `
    .fixed {
      background: #157347;
      color: #fff;
    }
    .result h1 {
      font-size: 1.5rem;
    }
    .summary {
      background: rgb(255 255 255 / 15%);
      border-radius: var(--radius-sm);
      padding: 12px 14px;
    }
    .on-color {
      color: #157347 !important;
    }
  `,
})
export class AdminQrFixed {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly state = inject(AdminQrState);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly printableQr = signal<AdminBoxDetail['qr']>([]);
  protected readonly qr = computed(() => {
    const issue = this.state.issues().find((item) => item.id === this.id());
    return issue ? toQrCase(issue) : undefined;
  });

  /** ใบที่ออกใหม่: ใช้ใบสำรอง → ใบ 2 ใหม่ · ออกใหม่/QR ปลอม → ทั้งคู่ */
  protected readonly printSlots = computed<(1 | 2)[] | null>(() => {
    const f = this.qr()?.fix;
    return f === 'swap' ? [2] : f === 'reissue' || f === 'fake' ? [1, 2] : null;
  });

  constructor() {
    effect(() => {
      const box = this.qr();
      const slots = this.printSlots();
      if (!box || !slots || !box.resolved) {
        this.printableQr.set([]);
        return;
      }
      void this.api.box(box.box_id)
        .then((detail) => this.printableQr.set(detail.qr.filter((item) =>
          item.status === 'active' && (item.slot === 1 || item.slot === 2) && slots.includes(item.slot),
        )))
        .catch(() => this.printableQr.set([]));
    });
    effect(() => {
      const id = this.id();
      if (id) void this.loadIssue(id);
      else {
        this.loading.set(false);
        this.loadError.set(true);
      }
    });
  }

  private async loadIssue(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const issue = await this.state.get(id);
      if (!issue.resolved) this.loadError.set(true);
    } catch {
      this.loadError.set(true);
      this.toast.show({ th: 'โหลดประวัติ QR ไม่ได้', en: 'Could not load the QR case' });
    } finally {
      this.loading.set(false);
    }
  }

  protected print(): void {
    window.print();
  }

  protected readonly summary = computed<[Tr, Tr] | null>(() => {
    const c = this.qr();
    if (!c?.fix) return null;
    if (c.fix === 'swap') {
      return [
        { th: 'ใบเก่าถูกปิดรหัสแล้ว', en: 'The old QR was cancelled' },
        c.delivery === 'technician'
          ? { th: 'ใบสำรองใหม่: ช่างนำไปให้', en: 'New backup: brought by a technician' }
          : { th: 'ใบสำรองใหม่: ส่งไปรษณีย์', en: 'New backup: sent by post' },
      ];
    }
    if (c.fix === 'reissue') {
      return [
        { th: 'ใบเก่าทั้ง 2 ใบถูกปิดรหัสแล้ว', en: 'Both old QRs were cancelled' },
        { th: 'ช่างติด QR หน้าตู้ + เก็บ QR สำรองในตู้แล้ว', en: 'Front QR put up + backup stored inside' },
      ];
    }
    return [
      { th: 'ลอก QR ปลอมออก + ติดใบใหม่แล้ว', en: 'Fake removed + new QR put up' },
      { th: 'แจ้งหัวหน้าโซนแล้ว', en: 'Zone head notified' },
    ];
  });
}
