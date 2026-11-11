import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi, type AdminBoxDetail, type AdminQrHealth, type AdminQrIssue } from '../../core/admin-api';
import { AdminQrState } from '../../core/admin-qr-state';
import { I18n, type Tr } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { Confirm } from '../../shared/confirm-dialog';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';
import { QrImage } from '../../shared/qr-image';
import { Icon } from '../../shared/icon';

// จัดการ QR ของแอดมิน — ภาพรวมเป็นตารางเคส · แต่ละเคสทำจบในหน้าเดียว (ทุกขั้นอยู่ในหน้าเคส)
// SMMB_ขั้นตอนการใช้งานแต่ละคน.md · api.md §9.4

type Tone = '' | 'warn' | 'danger';

export const HEALTH: Record<AdminQrHealth, { label: Tr; tone: Tone; rank: number }> = {
  maybe_fake: { label: { th: 'อาจปลอม', en: 'Maybe fake' }, tone: 'danger', rank: 0 },
  damaged: { label: { th: 'เสีย', en: 'Damaged' }, tone: 'danger', rank: 1 },
  suspicious: { label: { th: 'น่าสงสัย', en: 'Suspicious' }, tone: 'warn', rank: 2 },
  expiring: { label: { th: 'ใกล้ครบอายุ', en: 'Expiring' }, tone: '', rank: 3 },
};

const SLOT: Record<1 | 2, Tr> = {
  1: { th: 'QR หน้าตู้', en: 'Front QR' },
  2: { th: 'QR สำรอง', en: 'Backup QR' },
};

const FIX_LABEL: Record<'swap' | 'reissue' | 'fake', Tr> = {
  swap: { th: 'ใช้ QR สำรองแทน', en: 'Use the backup QR' },
  reissue: { th: 'ออก QR ใหม่ 2 ใบ', en: 'Issue 2 new QRs' },
  fake: { th: 'ส่งช่างลอก QR ปลอม + ติดใบใหม่', en: 'Technician removes the fake + puts up new QRs' },
};

/** หน้าเคส (ทุกขั้นของทุกวิธีแก้อยู่หน้าเดียว) */
export function caseUrl(c: { id: string }): { path: string; query: { id: string } } {
  return { path: screenUrl('D06-b'), query: { id: c.id } };
}

/** สาเหตุที่เข้าใจได้ ไม่ใช่รหัส */
export function reasonOf(issue: AdminQrIssue): Tr {
  if (issue.health === 'maybe_fake') return { th: 'พบ QR ที่ไม่ใช่ QR ที่ลงทะเบียนกับตู้', en: 'A QR not registered to this box was scanned' };
  const r = issue.health_reasons;
  if (r.includes('reported_damaged')) return { th: 'เจ้าหน้าที่รายงานว่า QR ชำรุด', en: 'An officer reported the QR as damaged' };
  if (r.includes('backup_used')) return { th: 'มีการใช้ QR สำรองแทนใบหน้าตู้', en: 'The backup QR was used in place of the front QR' };
  if (r.includes('rider_typed_often') || r.includes('typed_by_officer')) return { th: 'มีการพิมพ์รหัสใต้ QR บ่อย', en: 'The QR code is being typed often' };
  if (r.includes('slow_scan')) return { th: 'ใช้เวลาสแกนนานผิดปกติ', en: 'The QR takes unusually long to scan' };
  if (issue.health === 'expiring') return { th: 'QR ใกล้ครบอายุการใช้งาน', en: 'The QR is nearing its service age' };
  return { th: 'QR มีสัญญาณผิดปกติ', en: 'The QR has an unusual pattern' };
}

/** สถานะของเคสเป็นภาษาคน + ใครต้องทำอะไรต่อ */
export function progressOf(c: AdminQrIssue): { label: Tr; who: 'admin' | 'owner' | 'tech' | 'none' } {
  if (c.resolved) return { label: { th: 'ปิดเคสแล้ว', en: 'Closed' }, who: 'none' };
  if (!c.fix) return { label: { th: 'ยังไม่เลือกวิธีแก้', en: 'No fix chosen yet' }, who: 'admin' };
  if (c.fix === 'swap') {
    if (c.status === 'owner_notified') return { label: { th: 'รอเจ้าของบ้านติดใบสำรอง', en: 'Waiting for the owner' }, who: 'owner' };
    if (c.status === 'owner_confirmed') return { label: { th: 'เจ้าของติดแล้ว · ออกใบสำรองใหม่', en: 'Owner done · issue a new backup' }, who: 'admin' };
    return { label: { th: 'ออกใบสำรองใหม่แล้ว · ปิดเคส', en: 'New backup issued · close the case' }, who: 'admin' };
  }
  if (c.status === 'open') return { label: { th: 'ยังไม่ได้ออก QR ใหม่', en: 'New QRs not issued yet' }, who: 'admin' };
  if (c.status === 'qr_reissued') return { label: { th: 'ออก QR แล้ว · ส่งช่าง', en: 'QRs issued · send a technician' }, who: 'admin' };
  return { label: { th: 'ช่างกำลังไปติด', en: 'Technician on the way' }, who: 'tech' };
}

const WHO_LABEL: Record<'admin' | 'owner' | 'tech' | 'none', Tr> = {
  admin: { th: 'แอดมิน', en: 'Admin' },
  owner: { th: 'เจ้าของบ้าน', en: 'Owner' },
  tech: { th: 'ช่าง', en: 'Technician' },
  none: { th: '—', en: '—' },
};

const fmtDate = (iso: string, lang: 'th' | 'en') => new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

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
          <div class="qr"><app-qr-image [text]="item?.url ?? ''" level="H" [label]="i18n.t(slot[s])" /></div>
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
      inline-size: 55mm;
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

// ── D05 · สุขภาพ QR (ตารางเคส) ────────────────────────────────

@Component({
  selector: 'app-admin-qr',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })"
      [title]="i18n.t({ th: 'สุขภาพ QR', en: 'QR health' })"
      [back]="url('D16')"
      [bell]="url('D12')"
    />
    <div class="stack">
      <div class="toolbar easy-hide">
        <label class="search-box">
          <app-icon name="search" [size]="18" />
          <input type="search" [attr.aria-label]="i18n.t({ th: 'ค้นบ้านเลขที่ / รหัสตู้', en: 'Search house no. / box id' })" [placeholder]="i18n.t({ th: 'ค้นบ้านเลขที่ / รหัสตู้', en: 'Search house no. / box id' })" [value]="q()" (input)="q.set($any($event.target).value)" />
        </label>
        <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'กรองตามปัญหา', en: 'Filter by problem' })">
          @for (h of healths; track h) {
            <button type="button" [attr.aria-pressed]="picked().has(h)" (click)="toggle(h)">{{ i18n.t(health[h].label) }} <span class="n">{{ counts()[h] }}</span></button>
          }
        </div>
      </div>

      <!-- โหมดง่าย (AdmQrList_E): เฉพาะเคสที่เปิดอยู่ อ่านง่าย -->
      <div class="list easy-only">
        @for (c of rows(); track c.id) {
          @let h = health[c.health];
          <a class="row easy-case" [routerLink]="link(c).path" [queryParams]="link(c).query">
            <span class="grow">
              <strong>{{ i18n.t({ th: 'บ้าน ', en: 'House ' }) }}{{ c.house_no }}</strong>
              <span class="muted small block">{{ i18n.t(slot[c.slot]) }} · {{ i18n.t(reason(c)) }}</span>
            </span>
            <span class="chip" [class.danger]="h.tone === 'danger'" [class.warn]="h.tone === 'warn'">{{ i18n.t(h.label) }}</span>
          </a>
        } @empty {
          <p class="row muted">{{ loadFailed() ? i18n.t({ th: 'โหลดรายการ QR ไม่สำเร็จ — ลองอีกครั้ง', en: 'Could not load QR cases — try again' }) : loaded() ? i18n.t({ th: 'QR ทุกใบปกติ', en: 'Every QR is fine' }) : i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
        }
      </div>

      <div class="list easy-hide">
        <div class="list-head qcols desktop-only" aria-hidden="true">
          <span>{{ i18n.t({ th: 'ตู้ · บ้าน', en: 'Box · house' }) }}</span>
          <span>{{ i18n.t({ th: 'ปัญหา', en: 'Problem' }) }}</span>
          <span>{{ i18n.t({ th: 'สาเหตุ', en: 'Reason' }) }}</span>
          <span>{{ i18n.t({ th: 'สถานะเคส', en: 'Case status' }) }}</span>
          <span>{{ i18n.t({ th: 'รอใคร', en: 'Waiting on' }) }}</span>
          <span></span>
        </div>
        @for (c of rows(); track c.id) {
          @let h = health[c.health];
          @let p = progress(c);
          <a class="row qcols" [routerLink]="link(c).path" [queryParams]="link(c).query">
            <span>
              <strong>{{ c.house_no }}</strong>
              <span class="muted small block">{{ c.box_id }} · {{ i18n.t(slot[c.slot]) }}</span>
            </span>
            <span><span class="chip" [class.danger]="h.tone === 'danger'" [class.warn]="h.tone === 'warn'">{{ i18n.t(h.label) }}</span></span>
            <span class="small">{{ i18n.t(reason(c)) }}</span>
            <span class="small">{{ i18n.t(p.label) }}</span>
            <span class="small who" [class.me]="p.who === 'admin'">{{ i18n.t(who[p.who]) }}</span>
            <span class="go desktop-only">{{ i18n.t({ th: 'จัดการ', en: 'Open' }) }}</span>
          </a>
        } @empty {
          <p class="row muted">{{ loadFailed() ? i18n.t({ th: 'โหลดรายการ QR ไม่สำเร็จ — รีเฟรชหน้า', en: 'Could not load QR cases — refresh the page' }) : loaded() ? i18n.t({ th: 'QR ทุกใบปกติ ไม่มีเคสที่ต้องจัดการ', en: 'Every QR is fine — no cases to handle' }) : i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
        }
      </div>
      @if (closed().length) {
        <details class="closed-cases easy-hide">
          <summary>{{ i18n.t({ th: 'เคสที่ปิดแล้ว', en: 'Closed cases' }) }} ({{ closed().length }})</summary>
          <div class="list">
            @for (c of closed(); track c.id) {
              <a class="row closed-row" [routerLink]="link(c).path" [queryParams]="link(c).query">
                <span>
                  <strong>{{ c.house_no }}</strong>
                  <span class="muted small block">{{ c.box_id }} · {{ i18n.t(slot[c.slot]) }} · {{ i18n.t(health[c.health].label) }}</span>
                </span>
                <span class="muted small">{{ date(c.updated_at) }}</span>
              </a>
            }
          </div>
        </details>
      }
      <p class="muted small easy-hide">{{ i18n.t({ th: 'ตรวจอัตโนมัติทุกคืน 23:00 · QR ที่อาจปลอมแจ้งทันที · รายการรีเฟรชเองทุก 10 วินาที', en: 'Checked every night at 23:00 · possible fakes are reported at once · refreshes every 10 s' }) }}</p>
      <p class="muted small adv-only">
        {{ i18n.t({ th: 'เปิด ', en: 'Open ' }) }}{{ open().length }} · {{ i18n.t({ th: 'ปิด ', en: 'Closed ' }) }}{{ closed().length }} ·
        {{ i18n.t({ th: 'อาจปลอม ', en: 'Maybe fake ' }) }}{{ counts().maybe_fake }} · {{ i18n.t({ th: 'เสีย ', en: 'Damaged ' }) }}{{ counts().damaged }} ·
        {{ i18n.t({ th: 'น่าสงสัย ', en: 'Suspicious ' }) }}{{ counts().suspicious }} · {{ i18n.t({ th: 'ใกล้หมดอายุ ', en: 'Expiring ' }) }}{{ counts().expiring }}
      </p>
    </div>
  `,
  styles: `
    .block {
      display: block;
    }
    .closed-cases summary {
      cursor: pointer;
      font-weight: 600;
      padding-block: 8px;
    }
    .closed-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }
    .n {
      margin-inline-start: 4px;
      font-variant-numeric: tabular-nums;
      opacity: 0.75;
    }
    .who.me {
      font-weight: 700;
      color: var(--brand-text);
    }
    .go {
      color: var(--brand-text);
      font-weight: 600;
      justify-self: end;
    }
    .easy-case {
      min-block-size: 76px;
    }
    .qcols {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      align-items: center;
    }
    .qcols > :nth-child(3),
    .qcols > :nth-child(4),
    .qcols > :nth-child(5) {
      grid-column: 1 / -1;
    }
    @media (min-width: 1024px) {
      .qcols {
        grid-template-columns: minmax(0, 1.2fr) 110px minmax(0, 1.6fr) minmax(0, 1.4fr) 110px 70px;
        gap: 16px;
      }
      .qcols > :nth-child(n) {
        grid-column: auto;
      }
    }
  `,
})
export class AdminQr {
  protected readonly i18n = inject(I18n);
  private readonly state = inject(AdminQrState);
  protected readonly url = screenUrl;
  protected readonly health = HEALTH;
  protected readonly slot = SLOT;
  protected readonly who = WHO_LABEL;
  protected readonly link = caseUrl;
  protected readonly progress = progressOf;
  protected readonly reason = reasonOf;
  protected readonly healths: AdminQrHealth[] = ['maybe_fake', 'damaged', 'suspicious', 'expiring'];

  protected readonly q = signal('');
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  /** เลือกได้หลายอย่าง · ไม่เลือกเลย = แสดงทั้งหมด */
  protected readonly picked = signal(new Set<AdminQrHealth>());

  protected readonly open = computed(() => this.state.issues().filter((c) => !c.resolved));
  /** เคสที่ปิดแล้ว — พับเก็บไว้ ใหม่สุดก่อน */
  protected readonly closed = computed(() => this.state.issues().filter((c) => c.resolved).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  protected date(iso: string): string {
    return fmtDate(iso, this.i18n.lang());
  }
  protected readonly counts = computed(() => {
    const out: Record<AdminQrHealth, number> = { maybe_fake: 0, damaged: 0, suspicious: 0, expiring: 0 };
    for (const c of this.open()) out[c.health]++;
    return out;
  });
  /** เรียงตามความร้ายแรง แล้วเคสใหม่ก่อน */
  protected readonly rows = computed(() => {
    const p = this.picked();
    const q = this.q().trim().toLowerCase();
    return this.open()
      .filter((c) => (!p.size || p.has(c.health)) && (!q || c.house_no.toLowerCase().includes(q) || c.box_id.toLowerCase().includes(q)))
      .sort((a, b) => HEALTH[a.health].rank - HEALTH[b.health].rank || b.updated_at.localeCompare(a.updated_at));
  });

  constructor() {
    const load = () =>
      this.state
        .refresh()
        .then(() => {
          this.loaded.set(true);
          this.loadFailed.set(false);
        })
        .catch(() => this.loadFailed.set(true));
    void load();
    // ไม่ยิง endpoint หนักตอนแท็บถูกซ่อน (มือถือสลับแอป/ปิดจอ) — กลับมาแสดงผลค่อยดึงใหม่
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10_000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  protected toggle(h: AdminQrHealth): void {
    this.picked.update((s) => {
      const next = new Set(s);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
  }
}

// ── หน้าเคส (D06 / D06-b / D07 / D07-b / D08 ใช้หน้านี้หน้าเดียว) ─────────

interface FlowStep {
  title: Tr;
  hint: Tr;
}

const SWAP_STEPS: FlowStep[] = [
  { title: { th: 'แจ้งเจ้าของบ้าน', en: 'Notify the owner' }, hint: { th: 'ขอให้นำ QR สำรองไปติดแทน', en: 'Ask them to put the backup QR up' } },
  { title: { th: 'เจ้าของบ้านติดใบสำรอง', en: 'Owner puts the backup up' }, hint: { th: 'รอเจ้าของกด "ติดแล้ว" · ใบเก่าถูกปิดรหัสอัตโนมัติ', en: 'Waiting for “Done” · the old QR is cancelled automatically' } },
  { title: { th: 'ออก QR สำรองใบใหม่', en: 'Issue a new backup QR' }, hint: { th: 'ส่งให้เจ้าของทางไปรษณีย์หรือช่างนำไป', en: 'By post or via a technician' } },
  { title: { th: 'ปิดเคส', en: 'Close the case' }, hint: { th: 'เก็บประวัติการเปลี่ยน', en: 'Keeps a change history' } },
];

const REISSUE_STEPS: FlowStep[] = [
  { title: { th: 'เลือกวิธีแก้', en: 'Choose a fix' }, hint: { th: 'บันทึกเคสแล้ว', en: 'Case saved' } },
  { title: { th: 'ออก QR ใหม่ 2 ใบ', en: 'Issue 2 new QRs' }, hint: { th: 'ใบเก่าทั้งสองใบถูกปิดรหัสทันที · พิมพ์ได้', en: 'Both old QRs stop working at once · printable' } },
  { title: { th: 'ส่งช่างไปติด', en: 'Send a technician' }, hint: { th: 'ติด QR หน้าตู้ + เก็บ QR สำรองในตู้', en: 'Front QR on the box + backup inside' } },
  { title: { th: 'ปิดเคส', en: 'Close the case' }, hint: { th: 'ช่างติดครบแล้ว', en: 'Technician finished' } },
];

@Component({
  selector: 'app-admin-qr-case',
  imports: [RouterLink, PageHeader, QrPrintSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="crumb" [routerLink]="url('D05')">← {{ i18n.t({ th: 'กลับรายการ QR', en: 'Back to QR list' }) }}</a>

    @if (c(); as c) {
      @let h = health[c.health];
      <app-page-header
        [caption]="i18n.t({ th: 'เคส QR · ', en: 'QR case · ' }) + i18n.t(h.label)"
        [title]="i18n.t({ th: 'ตู้ ', en: 'Box ' }) + c.house_no + ' · ' + i18n.t(slot[c.slot])"
        [back]="url('D05')"
      />

      <div class="case">
        <div class="main">
          <!-- ตอนนี้ต้องทำอะไร -->
          <section class="panel now" [class.done]="c.resolved">
            <p class="eyebrow">{{ c.resolved ? i18n.t({ th: 'เสร็จแล้ว', en: 'Done' }) : i18n.t({ th: 'ตอนนี้ต้องทำ', en: 'Next action' }) }}</p>

            @if (c.resolved) {
              <h2>{{ i18n.t({ th: 'QR กลับมาปกติแล้ว', en: 'The QR is back to normal' }) }}</h2>
              @if (summary(c); as s) {
                <ul class="plain">
                  <li>{{ i18n.t(s[0]) }}</li>
                  <li>{{ i18n.t(s[1]) }}</li>
                </ul>
              }
              @if (printableQr().length) {
                <button type="button" class="btn secondary" (click)="print()">{{ i18n.t({ th: 'พิมพ์ QR ใบใหม่', en: 'Print the new QR' }) }}</button>
              }
            } @else if (!c.fix) {
              <!-- ยังไม่เลือกวิธีแก้ -->
              @if (c.health === 'maybe_fake') {
                <h2>{{ i18n.t({ th: 'อาจมีคนติด QR ปลอม — ส่งช่างไปลอกออกและติดใบใหม่', en: 'A fake QR may be up — send a technician to replace it' }) }}</h2>
                <p class="muted">{{ i18n.t({ th: 'ระบบจะออก QR ใหม่ 2 ใบ ปิดรหัสใบเก่าทันที แล้วแจ้งช่าง', en: 'Two new QRs are issued, the old ones stop working at once, then a technician is notified' }) }}</p>
                <button type="button" class="btn" [disabled]="busy()" (click)="issueAll(c, true)">
                  {{ busy() ? i18n.t({ th: 'กำลังทำรายการ…', en: 'Working…' }) : i18n.t({ th: 'ออก QR ใหม่ 2 ใบและส่งช่าง', en: 'Issue 2 new QRs and dispatch' }) }}
                </button>
              } @else {
                <h2>{{ i18n.t({ th: 'เลือกวิธีแก้', en: 'Choose how to fix it' }) }}</h2>
                <fieldset class="options">
                  <legend class="sr-only">{{ i18n.t({ th: 'วิธีแก้', en: 'Fix' }) }}</legend>
                  <label>
                    <input type="radio" name="fix" value="swap" [checked]="fixPick() === 'swap'" [disabled]="c.backup_used" (change)="fixPick.set('swap')" />
                    <span>
                      {{ i18n.t({ th: 'ใช้ QR สำรองที่อยู่ในตู้', en: 'Use the backup QR inside the box' }) }}
                      <small>{{ c.backup_used ? i18n.t({ th: 'ใช้ไม่ได้ — ใบสำรองถูกสแกนไปแล้ว', en: 'Not possible — the backup was already scanned' }) : i18n.t({ th: 'แจ้งเตือนเจ้าของบ้านให้นำไปติดแทน แล้วออกใบสำรองใหม่ให้', en: 'The owner is notified to put it up; a new backup is issued afterwards' }) }}</small>
                    </span>
                  </label>
                  <label>
                    <input type="radio" name="fix" value="reissue" [checked]="fixPick() === 'reissue'" (change)="fixPick.set('reissue')" />
                    <span>
                      {{ i18n.t({ th: 'ออก QR ใหม่ทั้ง 2 ใบ + ส่งช่างไปติด', en: 'Issue 2 new QRs + a technician puts them up' }) }}
                      <small>{{ i18n.t({ th: 'ใบเก่าทั้งสองใบใช้ไม่ได้ทันที', en: 'Both old QRs stop working at once' }) }}</small>
                    </span>
                  </label>
                </fieldset>
                @if (c.health === 'expiring') {
                  <p class="muted small">{{ i18n.t({ th: 'ใบสำรองอายุเท่าใบหน้าตู้ — แนะนำออกใหม่ทั้ง 2 ใบ', en: 'The backup is as old as the front QR — issuing 2 new ones is better' }) }}</p>
                }
                <button type="button" class="btn" [disabled]="busy()" (click)="start(c)">
                  {{ fixPick() === 'swap' ? i18n.t({ th: 'แจ้งเจ้าของบ้านให้ใช้ QR สำรอง', en: 'Ask the owner to use the backup' }) : i18n.t({ th: 'ออก QR ใหม่ 2 ใบ', en: 'Issue 2 new QRs' }) }}
                </button>
              }
            } @else if (c.fix === 'swap') {
              @switch (c.status) {
                @case ('owner_notified') {
                  <h2>{{ i18n.t({ th: 'รอเจ้าของบ้านนำ QR สำรองไปติด', en: 'Waiting for the owner to put the backup up' }) }}</h2>
                  <p class="muted">{{ i18n.t({ th: 'ส่งแจ้งเตือนให้เจ้าของแล้ว · หน้านี้รีเฟรชเองทุก 3 วินาทีและจะขึ้นขั้นต่อไปเมื่อเจ้าของกด "ติดแล้ว"', en: 'The owner was notified · this page refreshes every 3 s and moves on once they tap “Done”' }) }}</p>
                }
                @case ('owner_confirmed') {
                  <h2>{{ i18n.t({ th: 'เจ้าของติดใบสำรองแล้ว — ออก QR สำรองใบใหม่', en: 'Backup is up — issue a new backup QR' }) }}</h2>
                  <fieldset class="options">
                    <legend>{{ i18n.t({ th: 'ส่งใบสำรองใหม่ให้เจ้าของบ้านทาง', en: 'Send the new backup by' }) }}</legend>
                    <label><input type="radio" name="delivery" [checked]="delivery() === 'post'" (change)="delivery.set('post')" /> <span>{{ i18n.t({ th: 'ไปรษณีย์', en: 'Post' }) }}</span></label>
                    <label><input type="radio" name="delivery" [checked]="delivery() === 'technician'" (change)="delivery.set('technician')" /> <span>{{ i18n.t({ th: 'ช่างนำไปให้', en: 'Technician brings it' }) }}</span></label>
                  </fieldset>
                  <button type="button" class="btn" [disabled]="busy()" (click)="issueBackup(c)">{{ busy() ? i18n.t({ th: 'กำลังออก QR…', en: 'Issuing…' }) : i18n.t({ th: 'ออก QR สำรองใหม่และปิดเคส', en: 'Issue a new backup and close' }) }}</button>
                }
                @default {
                  <h2>{{ i18n.t({ th: 'ออกใบสำรองใหม่แล้ว — ปิดเคส', en: 'New backup issued — close the case' }) }}</h2>
                  <button type="button" class="btn" [disabled]="busy()" (click)="close(c)">{{ i18n.t({ th: 'ปิดเคส', en: 'Close the case' }) }}</button>
                }
              }
            } @else {
              <!-- reissue / fake -->
              @switch (c.status) {
                @case ('open') {
                  <h2>{{ i18n.t({ th: 'ออก QR ใหม่ 2 ใบ', en: 'Issue 2 new QRs' }) }}</h2>
                  <p class="muted">{{ i18n.t({ th: 'ใบเก่าทั้งสองใบจะใช้ไม่ได้ทันทีที่ออก', en: 'The old QRs stop working the moment these are issued' }) }}</p>
                  <button type="button" class="btn" [disabled]="busy()" (click)="issueAll(c, c.fix === 'fake')">
                    {{ busy() ? i18n.t({ th: 'กำลังออก QR…', en: 'Issuing…' }) : c.fix === 'fake' ? i18n.t({ th: 'ออก QR ใหม่ 2 ใบและส่งช่าง', en: 'Issue 2 new QRs and dispatch' }) : i18n.t({ th: 'ออก QR ใหม่ 2 ใบ', en: 'Issue 2 new QRs' }) }}
                  </button>
                }
                @case ('qr_reissued') {
                  <h2>{{ i18n.t({ th: 'ออก QR แล้ว — พิมพ์และส่งช่างไปติด', en: 'QRs issued — print them and send a technician' }) }}</h2>
                  <div class="actions">
                    <button type="button" class="btn secondary" (click)="print()">{{ i18n.t({ th: 'พิมพ์ QR ใหม่ 2 ใบ', en: 'Print the 2 new QRs' }) }}</button>
                    <button type="button" class="btn" [disabled]="busy()" (click)="dispatch(c)">{{ i18n.t({ th: 'ส่งช่างไปติด', en: 'Send a technician' }) }}</button>
                  </div>
                }
                @default {
                  <h2>{{ i18n.t({ th: 'ช่างกำลังไปติด QR', en: 'A technician is putting the QRs up' }) }}</h2>
                  <p class="muted">{{ i18n.t({ th: 'กดปิดเคสเมื่อช่างติดครบ 2 ใบแล้ว', en: 'Close the case once both are in place' }) }}</p>
                  <div class="actions">
                    <button type="button" class="btn secondary" (click)="print()">{{ i18n.t({ th: 'พิมพ์ QR ใหม่ 2 ใบ', en: 'Print the 2 new QRs' }) }}</button>
                    <button type="button" class="btn" [disabled]="busy()" (click)="close(c)">{{ i18n.t({ th: 'ช่างติดแล้ว · ปิดเคส', en: 'Both in place · close the case' }) }}</button>
                  </div>
                }
              }
            }
          </section>

          <!-- ขั้นตอน -->
          @if (flow(c); as f) {
            <section class="panel easy-hide">
              <h2 class="small-title">{{ i18n.t({ th: 'ขั้นตอน', en: 'Steps' }) }} · {{ i18n.t(fixLabel[c.fix!]) }}</h2>
              <ol class="steps">
                @for (s of f.steps; track $index; let i = $index) {
                  <li [class.done]="i < f.at" [class.now]="i === f.at && !c.resolved">
                    <span class="num" aria-hidden="true">{{ i < f.at ? '✓' : i + 1 }}</span>
                    <span>
                      <strong>{{ i18n.t(s.title) }}</strong>
                      <small>{{ i18n.t(s.hint) }}</small>
                    </span>
                  </li>
                }
              </ol>
            </section>
          }
        </div>

        <!-- ข้อมูลของเคส -->
        <aside class="panel facts easy-hide">
          <h2 class="small-title">{{ i18n.t({ th: 'ข้อมูลเคส', en: 'Case details' }) }}</h2>
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'ปัญหา', en: 'Problem' }) }}</dt>
            <dd><span class="chip" [class.danger]="h.tone === 'danger'" [class.warn]="h.tone === 'warn'">{{ i18n.t(h.label) }}</span></dd>
            <dt>{{ i18n.t({ th: 'สาเหตุ', en: 'Reason' }) }}</dt>
            <dd>{{ i18n.t(reasonOf(c)) }}</dd>
            <dt>{{ i18n.t({ th: 'ตู้', en: 'Box' }) }}</dt>
            <dd>{{ c.box_id }}</dd>
            <dt>{{ i18n.t({ th: 'บ้าน', en: 'House' }) }}</dt>
            <dd>{{ c.house_no }}</dd>
            <dt>{{ i18n.t({ th: 'สแกนล่าสุด', en: 'Last scanned' }) }}</dt>
            <dd>{{ c.last_scanned_at ? date(c.last_scanned_at) : '—' }}</dd>
            <dt>{{ i18n.t({ th: 'เปิดเคส', en: 'Opened' }) }}</dt>
            <dd>{{ date(c.created_at) }}</dd>
            <dt>{{ i18n.t({ th: 'QR สำรอง', en: 'Backup QR' }) }}</dt>
            <dd [class.danger-text]="c.backup_used">{{ c.backup_used ? i18n.t({ th: 'ถูกสแกนไปแล้ว', en: 'Already scanned' }) : i18n.t({ th: 'ยังไม่เคยใช้', en: 'Never used' }) }}</dd>
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt>
            <dd>{{ i18n.t(progressOf(c).label) }}</dd>
          </dl>
          <a class="btn secondary" [routerLink]="url('D04')" [queryParams]="{ id: c.box_id }">{{ i18n.t({ th: 'เปิดหน้าตู้', en: 'Open the box page' }) }}</a>
        </aside>
      </div>

      @if (printableQr().length && printSlots(c); as slots) {
        <app-qr-print-sheet [boxId]="c.box_id" [house]="c.house_no" [slots]="slots" [qr]="printableQr()" />
      }
    } @else {
      <app-page-header [title]="i18n.t({ th: 'เคส QR', en: 'QR case' })" [back]="url('D05')" />
      <section class="panel" role="status">
        @if (loading()) {
          <p class="muted">{{ i18n.t({ th: 'กำลังโหลดเคส…', en: 'Loading the case…' }) }}</p>
        } @else {
          <strong>{{ i18n.t({ th: loadError() ? 'โหลดเคสไม่ได้' : 'ไม่พบเคส QR นี้', en: loadError() ? 'Could not load the case' : 'QR case not found' }) }}</strong>
          <p class="muted">{{ i18n.t({ th: 'เคสอาจปิดไปแล้ว หรือลิงก์ไม่ถูกต้อง', en: 'It may be closed already, or the link is wrong' }) }}</p>
          <a class="btn secondary" [routerLink]="url('D05')">{{ i18n.t({ th: 'กลับรายการ QR', en: 'Back to QR list' }) }}</a>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .crumb {
      display: inline-block;
      margin-block-start: 8px;
      color: var(--brand-text);
      font-weight: 600;
      text-decoration: none;
    }
    .case {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    @media (min-width: 1200px) {
      .case {
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: 24px;
      }
      .facts {
        position: sticky;
        inset-block-start: 16px;
      }
    }
    .main {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-inline-size: 0;
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--surface);
      border: 1px solid var(--line-strong, var(--line));
      border-radius: 10px;
      padding: 18px 20px;
    }
    .panel.now {
      border-color: var(--brand-text);
      border-width: 2px;
    }
    .panel.now.done {
      border-color: var(--ok);
    }
    .eyebrow {
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--brand-text);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .done .eyebrow {
      color: var(--ok);
    }
    h2 {
      font-size: 1.25rem;
      line-height: 1.35;
    }
    h2.small-title {
      font-size: 1rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .options {
      display: flex;
      flex-direction: column;
      gap: 10px;
      border: 0;
      padding: 0;
      margin: 0;
    }
    .options legend {
      font-weight: 700;
      margin-block-end: 6px;
    }
    .options label {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 14px;
      border: 1.5px solid var(--line-strong, var(--line));
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .options label:has(input:checked) {
      border-color: var(--brand-text);
      background: var(--brand-lighter);
    }
    .options label:has(input:disabled) {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .options input {
      margin-block-start: 4px;
    }
    .options span {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .options small {
      font-weight: 400;
      color: var(--text-muted);
    }
    .plain {
      margin: 0;
      padding-inline-start: 20px;
    }
    .steps {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .steps li {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      color: var(--text-muted);
    }
    .steps li.done,
    .steps li.now {
      color: var(--text);
    }
    .steps .num {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 26px;
      block-size: 26px;
      border-radius: 50%;
      border: 1.5px solid var(--line-strong, var(--line));
      font-size: 0.8125rem;
      font-weight: 700;
    }
    .steps li.done .num {
      background: var(--ok);
      border-color: var(--ok);
      color: #fff;
    }
    .steps li.now .num {
      background: var(--action-bg);
      border-color: var(--brand-text);
      color: var(--action-fg);
    }
    .steps small {
      display: block;
      color: var(--text-muted);
      font-size: 0.8125rem;
    }
    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  `,
})
export class AdminQrCase {
  protected readonly i18n = inject(I18n);
  private readonly state = inject(AdminQrState);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(Confirm);
  protected readonly url = screenUrl;
  protected readonly health = HEALTH;
  protected readonly slot = SLOT;
  protected readonly fixLabel = FIX_LABEL;
  protected readonly reasonOf = reasonOf;
  protected readonly progressOf = progressOf;

  readonly id = input<string>();
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);
  protected readonly fixPick = signal<'swap' | 'reissue'>('reissue');
  protected readonly delivery = signal<'post' | 'technician'>('post');
  private defaultedFor = '';
  protected readonly printableQr = signal<AdminBoxDetail['qr']>([]);

  /** เปิดเฉพาะเคสที่ id ตรง — ไม่ "เดา" เคสอื่นแทน (กันทำผิดเคส) */
  protected readonly c = computed(() => {
    const id = this.id();
    return id ? (this.state.issues().find((item) => item.id === id) ?? null) : null;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (!id) {
        this.loading.set(false);
        this.loadError.set(false);
        return;
      }
      void this.load(id);
    });
    // ค่าเริ่มต้นของวิธีแก้: ใบสำรองเคยถูกใช้/ใกล้หมดอายุ → ออกใหม่ 2 ใบ · อย่างอื่นใช้ใบสำรอง
    // (ตั้งครั้งเดียวต่อเคส — รีเฟรชทุก 3 วินาทีต้องไม่ทับตัวเลือกที่แอดมินกดไว้)
    effect(() => {
      const c = this.c();
      if (c && !c.fix && this.defaultedFor !== c.id) {
        this.defaultedFor = c.id;
        this.fixPick.set(c.backup_used || c.health === 'expiring' ? 'reissue' : 'swap');
      }
    });
    // ที่ต้องมี QR ใบใหม่ในมือ (พิมพ์) → โหลดจากหน้าตู้
    effect(() => {
      const c = this.c();
      if (c && (c.status === 'qr_reissued' || c.status === 'technician_dispatched' || (c.resolved && c.fix))) void this.loadPrintable(c);
      else this.printableQr.set([]);
    });
    // เคสที่ยังไม่ปิด → รีเฟรชเอง (เห็นตอนเจ้าของบ้านกดติดแล้ว)
    const timer = setInterval(() => {
      const id = this.id();
      const c = this.c();
      if (id && c && !c.resolved && !this.busy()) void this.state.get(id).catch(() => undefined);
    }, 3_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      await this.state.get(id);
    } catch (e) {
      // 404 = ไม่พบ · อย่างอื่น = โหลดไม่ได้
      this.loadError.set((e as { status?: number })?.status !== 404);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPrintable(c: AdminQrIssue): Promise<void> {
    const slots = this.printSlots(c);
    if (!slots) return;
    try {
      const box = await this.api.box(c.box_id);
      this.printableQr.set(box.qr.filter((q) => q.status === 'active' && (q.slot === 1 || q.slot === 2) && slots.includes(q.slot)));
    } catch {
      this.printableQr.set([]);
    }
  }

  /** ใบที่ออกใหม่: swap → ใบสำรองใหม่ (2) · ออกใหม่/ปลอม → ทั้งคู่ */
  protected printSlots(c: AdminQrIssue): (1 | 2)[] | null {
    return c.fix === 'swap' ? [2] : c.fix === 'reissue' || c.fix === 'fake' ? [1, 2] : null;
  }

  protected flow(c: AdminQrIssue): { steps: FlowStep[]; at: number } | null {
    if (!c.fix) return null;
    if (c.fix === 'swap') {
      const at = c.resolved ? 4 : c.status === 'owner_notified' ? 1 : c.status === 'owner_confirmed' ? 2 : c.status === 'qr_reissued' ? 3 : 0;
      return { steps: SWAP_STEPS, at };
    }
    const at = c.resolved ? 4 : c.status === 'open' ? 1 : c.status === 'qr_reissued' ? 2 : 3;
    return { steps: REISSUE_STEPS, at };
  }

  protected summary(c: AdminQrIssue): [Tr, Tr] | null {
    if (c.fix === 'swap') {
      return [
        { th: 'ใบเก่าถูกปิดรหัสแล้ว', en: 'The old QR was cancelled' },
        c.delivery_method === 'technician' ? { th: 'ใบสำรองใหม่: ช่างนำไปให้', en: 'New backup: brought by a technician' } : { th: 'ใบสำรองใหม่: ส่งไปรษณีย์', en: 'New backup: sent by post' },
      ];
    }
    if (c.fix === 'reissue') return [{ th: 'ใบเก่าทั้ง 2 ใบถูกปิดรหัสแล้ว', en: 'Both old QRs were cancelled' }, { th: 'ช่างติด QR หน้าตู้ + เก็บ QR สำรองในตู้แล้ว', en: 'Front QR put up + backup stored inside' }];
    if (c.fix === 'fake') return [{ th: 'ลอก QR ปลอมออก + ติดใบใหม่แล้ว', en: 'Fake removed + new QR put up' }, { th: 'แจ้งหัวหน้าโซนแล้ว', en: 'Zone head notified' }];
    return null;
  }

  protected date(iso: string): string {
    return fmtDate(iso, this.i18n.lang());
  }

  protected print(): void {
    window.print();
  }

  /** เริ่มแก้: swap = แจ้งเจ้าของ · reissue = บันทึกเคสแล้วออก QR ในขั้นถัดไป */
  protected async start(c: AdminQrIssue): Promise<void> {
    await this.run(async () => {
      if (this.fixPick() === 'swap') {
        await this.state.requestBackupSwap(c.id);
        this.toast.show({ th: 'แจ้งเจ้าของบ้านแล้ว', en: 'Owner notified' });
      } else {
        await this.state.chooseFix(c.id, 'reissue');
        this.toast.show({ th: 'บันทึกเคสแล้ว · ออก QR ได้ทันที', en: 'Case saved · you can issue the QRs now' });
      }
    });
  }

  /** ออก QR ใหม่ 2 ใบ (+ ส่งช่างต่อทันทีถ้าเป็นเคสปลอม) */
  protected async issueAll(c: AdminQrIssue, thenDispatch: boolean): Promise<void> {
    const ok = await this.confirm.ask({
      title: { th: 'ออก QR ใหม่ 2 ใบ?', en: 'Issue 2 new QRs?' },
      body: {
        th: 'ใบเก่าทั้งสองใบจะใช้ไม่ได้ทันที — เจ้าหน้าที่ตรวจตู้และไรเดอร์ส่งของไม่ได้จนกว่าจะติดใบใหม่',
        en: 'Both old QRs stop working immediately — officers cannot inspect and riders cannot deliver until the new ones are in place.',
      },
      confirm: { th: 'ออก QR ใหม่', en: 'Issue new QRs' },
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      let cur = c;
      if (!cur.fix) cur = await this.state.chooseFix(c.id, thenDispatch && c.health === 'maybe_fake' ? 'fake' : 'reissue');
      if (cur.status === 'open') {
        await this.api.reissueQr(c.box_id, [1, 2], this.requestKey(c.id, '12'));
        cur = await this.state.recordReissue(c.id, [1, 2]);
      }
      if (thenDispatch && cur.status === 'qr_reissued') await this.state.dispatchTechnician(c.id);
      this.toast.show(thenDispatch ? { th: 'ออก QR ใหม่แล้ว · ส่งช่างไปติด', en: 'New QRs issued · technician dispatched' } : { th: 'ออก QR ใหม่ 2 ใบแล้ว · ใบเก่าถูกปิด', en: 'Issued 2 new QRs · the old ones are revoked' });
    });
  }

  protected async dispatch(c: AdminQrIssue): Promise<void> {
    await this.run(async () => {
      await this.state.dispatchTechnician(c.id);
      this.toast.show({ th: 'ส่งช่างแล้ว', en: 'Technician dispatched' });
    });
  }

  /** swap: ออกใบสำรองใหม่ + ปิดเคส */
  protected async issueBackup(c: AdminQrIssue): Promise<void> {
    const ok = await this.confirm.ask({
      title: { th: 'ออก QR สำรองใหม่?', en: 'Issue a new backup QR?' },
      body: {
        th: 'QR สำรองใบเดิมจะใช้ไม่ได้ทันที และเคสจะถูกปิด',
        en: 'The old backup QR stops working immediately and the case will be closed.',
      },
      confirm: { th: 'ออกใบสำรองใหม่', en: 'Issue a new backup' },
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      await this.api.reissueQr(c.box_id, [2], this.requestKey(c.id, '2'));
      await this.state.recordReissue(c.id, [2], this.delivery());
      await this.state.resolve(c.id);
      this.toast.show({ th: 'ออก QR สำรองใหม่แล้ว · ปิดเคส', en: 'New backup QR issued · case closed' });
    });
  }

  protected async close(c: AdminQrIssue): Promise<void> {
    await this.run(async () => {
      await this.state.resolve(c.id);
      this.toast.show({ th: 'ปิดเคสแล้ว', en: 'Case closed' });
    });
  }

  /** กดซ้ำไม่ได้ · ล้มเหลว = บอกชัด แล้วโหลดสถานะจริงมาแสดง (ไม่ปล่อยให้หน้าค้างสถานะเก่า) */
  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      const code = (e as { error?: { error?: { code?: string } } })?.error?.error?.code;
      this.toast.show({
        th: `ทำรายการไม่สำเร็จ${code ? ` (${code})` : ''} · โหลดสถานะล่าสุดให้แล้ว`,
        en: `That did not work${code ? ` (${code})` : ''} · the latest state was reloaded`,
      });
      const id = this.id();
      if (id) await this.state.get(id).catch(() => undefined);
    } finally {
      this.busy.set(false);
    }
  }

  /** คีย์กันออก QR ซ้ำเมื่อกดซ้ำ/โหลดหน้าใหม่ (คงที่ต่อเคส+ช่อง) */
  private requestKey(caseId: string, slots: string): string {
    const key = `smmb.qr-reissue.${caseId}.${slots}`;
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
