import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { I18n, type Tr } from '../../core/i18n';
import { hhmm } from '../../core/inspection-api';
import { OfficerSosApi, secondsSince, type SosCard } from '../../core/owner-api';
import { Session } from '../../core/session';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

/** หน้ารับเรื่อง / รายการ SOS ถามสถานะทุกกี่วินาที */
const POLL_MS = 2000;

const go = (router: Router, code: string, id?: string) =>
  void router.navigate([screenUrl(code)], { queryParams: id ? { id } : undefined, replaceUrl: true });

// ── O12 · รายการ SOS (แท็บ) ───────────────────────────────────

@Component({
  selector: 'app-officer-sos-list',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="session.me()?.agency?.name ?? ''" [title]="session.me()?.display_name ?? ''" [bell]="url('O14')" />
    <div class="stack">
      @for (c of open(); track c.id) {
        @if (c.mine) {
          <h2 class="section-title danger-text">{{ i18n.t({ th: 'กำลังดูแล', en: 'Handling' }) }}</h2>
          <a class="card current" [routerLink]="url('O10')" [queryParams]="{ id: c.id }">
            <span class="grow">
              <strong class="big">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ c.house_no }}</strong>
              <span class="muted small block">{{ c.owner?.name }}</span>
            </span>
            <span class="chip danger">{{ i18n.t({ th: 'รับแล้วโดยคุณ', en: 'Yours' }) }}</span>
          </a>
        } @else {
          <h2 class="section-title danger-text">{{ i18n.t({ th: 'SOS ใหม่ รอรับเรื่อง', en: 'New SOS — waiting' }) }}</h2>
          <a class="card current" [routerLink]="url('O09')" [queryParams]="{ id: c.id }">
            <span class="grow">
              <strong class="big">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ c.house_no }}</strong>
              <span class="muted small block">{{ time(c.created_at) }} · {{ c.owner?.name }}</span>
            </span>
            <span class="chip danger">{{ i18n.t({ th: 'ยังไม่มีคนรับ', en: 'Not accepted' }) }}</span>
          </a>
        }
      }

      <h2 class="section-title">{{ i18n.t({ th: 'ย้อนหลัง 30 วัน', en: 'Last 30 days' }) }}</h2>
      @if (!closed().length) {
        <p class="muted small">{{ i18n.t({ th: 'ยังไม่มี', en: 'None yet' }) }}</p>
      }
      <ul class="list">
        @for (h of closed(); track h.id) {
          <li class="row">
            <span class="icon-bubble"><app-icon name="alert" [size]="20" /></span>
            <span class="grow">
              <strong>{{ h.house_no }} · {{ day(h.created_at) }}</strong>
              <span class="muted small block">
                @if (h.status === 'closed') {
                  {{ i18n.t({ th: 'รับโดย ', en: 'By ' }) }}{{ h.accepted_by?.display_name }} · {{ i18n.t({ th: 'ปิดเรื่องแล้ว', en: 'closed' }) }}
                } @else {
                  {{ i18n.t({ th: 'เจ้าของบ้านยกเลิก', en: 'Owner cancelled' }) }}
                }
              </span>
            </span>
            <span class="chip" [class.ok]="h.status === 'closed'">
              {{ h.status === 'closed' ? i18n.t({ th: 'ปิดแล้ว', en: 'Closed' }) : i18n.t({ th: 'ยกเลิก', en: 'Cancelled' }) }}
            </span>
          </li>
        }
      </ul>
      <p class="muted small">{{ i18n.t({ th: 'SOS ใหม่จะเด้งเป็นแจ้งเตือนสีแดงทันที (ต้องเปิดแจ้งเตือนไว้)', en: 'A new SOS pops up as a red notification (keep notifications on)' }) }}</p>
    </div>
  `,
  styles: `
    .current {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 2px solid var(--sos);
      text-decoration: none;
      color: inherit;
    }
    .big {
      font-size: 1.125rem;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .danger-text {
      color: var(--sos);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
  `,
})
export class OfficerSosList {
  protected readonly i18n = inject(I18n);
  protected readonly session = inject(Session);
  private readonly api = inject(OfficerSosApi);
  protected readonly url = screenUrl;
  protected readonly time = hhmm;
  protected readonly open = signal<SosCard[]>([]);
  protected readonly closed = signal<SosCard[]>([]);

  constructor() {
    const load = async () => {
      const [open, closed] = await Promise.all([this.api.list('open').catch(() => null), this.api.list('closed').catch(() => null)]);
      if (open) this.open.set(open);
      if (closed) this.closed.set(closed);
    };
    void load();
    const t = setInterval(() => void load(), POLL_MS * 2);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected day(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  }
}

// ── O09 · SOS เข้า / O09-b มีคนรับแล้ว / O09-c เจ้าของยกเลิก ────────

@Component({
  selector: 'app-officer-sos-case',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = card();
    @if (taken() || (c && c.status !== 'open' && c.status !== 'cancelled' && !c.mine)) {
      <div class="pad">
        <div class="result">
          <span class="big-icon danger"><app-icon name="check" [size]="30" /></span>
          <h1>{{ i18n.t({ th: 'มีเจ้าหน้าที่รับเรื่องแล้ว', en: 'Another officer accepted' }) }}</h1>
          <p class="muted small">{{ i18n.t({ th: 'คุณไม่ต้องไป ทำงานต่อได้เลย', en: 'You don’t need to go — carry on' }) }}</p>
        </div>
        <section class="card">
          <dl class="kv">
            <dt>SOS</dt><dd>{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ c?.house_no }}</dd>
            <dt>{{ i18n.t({ th: 'รับโดย', en: 'Accepted by' }) }}</dt><dd>{{ takenBy() ?? c?.accepted_by?.display_name }} · {{ c?.accepted_by?.agency_name }}</dd>
          </dl>
        </section>
        <a class="btn push-end" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
      </div>
    } @else if (c?.status === 'cancelled') {
      <div class="pad">
        <div class="result">
          <span class="big-icon">×</span>
          <h1>{{ i18n.t({ th: 'เจ้าของบ้านยกเลิก SOS แล้ว', en: 'The owner cancelled the SOS' }) }}</h1>
          <p class="muted small">{{ i18n.t({ th: 'ไม่ต้องไปที่บ้านนี้แล้ว', en: 'You no longer need to go' }) }}</p>
        </div>
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'บ้าน', en: 'House' }) }}</dt><dd>{{ i18n.t({ th: 'เลขที่ ', en: 'No. ' }) }}{{ c?.house_no }}</dd>
          </dl>
        </section>
        <a class="btn push-end" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
      </div>
    } @else if (c) {
      <div class="pad incoming" role="alert">
        <div class="toprow">
          <span class="pill">{{ i18n.t({ th: 'SOS ใหม่', en: 'New SOS' }) }}</span>
          <span class="small">{{ ago() }} {{ i18n.t({ th: 'วินาทีที่แล้ว', en: 's ago' }) }}</span>
        </div>
        <p>{{ i18n.t({ th: 'ขอความช่วยเหลือที่', en: 'Help needed at' }) }}</p>
        <h1>{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ c.house_no }}</h1>
        <section class="card on-red">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'เจ้าของบ้าน', en: 'Owner' }) }}</dt><dd>{{ c.owner?.name }}</dd>
            <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt>
            <dd>
              @if (c.owner?.phone; as p) {
                <a [href]="'tel:' + p">{{ p }}</a>
              }
            </dd>
            <dt>{{ i18n.t({ th: 'ขั้น', en: 'Stage' }) }}</dt><dd>{{ c.stage === 'zone' ? i18n.t({ th: 'เจ้าหน้าที่ในโซน', en: 'Zone officers' }) : i18n.t({ th: 'ทุกคนในหน่วยงาน', en: 'Whole agency' }) }}</dd>
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt><dd class="danger-text">{{ i18n.t({ th: 'ยังไม่มีคนรับ', en: 'Not accepted yet' }) }}</dd>
          </dl>
        </section>
        @if (failed()) {
          <p class="card on-red danger-text" role="alert">{{ i18n.t({ th: 'รับเรื่องไม่ได้ ลองใหม่อีกครั้ง', en: 'Couldn’t accept — try again' }) }}</p>
        }
        <div class="stack push-end">
          <button type="button" class="btn on-color big" [disabled]="busy()" (click)="accept()">{{ i18n.t({ th: 'รับเรื่อง', en: 'Accept' }) }}</button>
          <a class="btn outline-light" [routerLink]="url('O01')">{{ i18n.t({ th: 'ไว้ก่อน กลับหน้าสรุป', en: 'Not now — back to summary' }) }}</a>
        </div>
      </div>
    } @else {
      <p class="pad muted">{{ i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
    }
  `,
  styles: `
    .incoming {
      background: var(--sos);
      color: #fff;
      h1 {
        font-size: 2rem;
        line-height: 1.2;
      }
    }
    .toprow {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pill {
      font-weight: 700;
      font-size: 0.875rem;
      padding: 2px 10px;
      border-radius: 999px;
      background: rgb(255 255 255 / 20%);
    }
    .on-red {
      color: var(--text);
    }
    .danger-text {
      color: var(--sos);
    }
  `,
})
export class OfficerSosCase implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(OfficerSosApi);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  protected readonly url = screenUrl;
  readonly id = input<string>('');
  protected readonly card = signal<SosCard | null>(null);
  protected readonly taken = signal(false);
  protected readonly takenBy = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  private readonly now = signal(Date.now());
  protected readonly ago = computed(() => (this.now(), this.card() ? secondsSince(this.card()!.created_at) : 0));

  ngOnInit(): void {
    const tick = async () => {
      const c = await this.api.card(this.id()).catch(() => null);
      this.now.set(Date.now());
      if (!c) return;
      this.card.set(c);
      if (c.mine && c.status === 'accepted') go(this.router, 'O10', c.id);
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    this.destroy.onDestroy(() => clearInterval(t));
  }

  /** คนแรกที่กดได้เรื่อง — server ล็อก · 409 = มีคนรับไปแล้ว · 410 = เจ้าของยกเลิก */
  protected async accept(): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    try {
      const c = await this.api.accept(this.id());
      go(this.router, 'O10', c.id);
    } catch (err) {
      const e = apiError(err);
      if (e.code === 'SOS_ALREADY_TAKEN') {
        this.taken.set(true);
        this.takenBy.set((e.body['accepted_by'] as { display_name?: string } | null)?.display_name ?? null);
      } else if (e.code === 'SOS_CANCELLED') {
        this.card.update((c) => (c ? { ...c, status: 'cancelled' } : c));
      } else {
        this.failed.set(true);
      }
    } finally {
      this.busy.set(false);
    }
  }
}

// ── O10 · กำลังดูแล ──────────────────────────────────────────

@Component({
  selector: 'app-officer-sos-handling',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = card();
    <header class="head">
      <a [routerLink]="url('O01')" class="back"><app-icon name="chevronLeft" [size]="16" />{{ i18n.t({ th: 'หน้าสรุป', en: 'Summary' }) }}</a>
      <p class="small">{{ i18n.t({ th: 'คุณรับเรื่องแล้ว', en: 'You accepted' }) }}</p>
      <h1>{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ c?.house_no }}</h1>
    </header>
    <div class="pad">
      @if (c?.status === 'cancelled') {
        <p class="card" role="alert">{{ i18n.t({ th: 'เจ้าของบ้านยกเลิก SOS แล้ว — ไม่ต้องไปแล้ว', en: 'The owner cancelled the SOS — no need to go' }) }}</p>
        <a class="btn push-end" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
      } @else {
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'เจ้าของบ้าน', en: 'Owner' }) }}</dt><dd>{{ c?.owner?.name }}</dd>
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt><dd class="ok">{{ i18n.t({ th: 'เจ้าของบ้านเห็นว่าคุณรับแล้ว', en: 'The owner sees you accepted' }) }}</dd>
          </dl>
        </section>
        @if (c?.owner?.phone; as p) {
          <a class="btn big" [href]="'tel:' + p">{{ i18n.t({ th: 'โทรหาเจ้าของบ้าน ', en: 'Call the owner ' }) }}{{ p }}</a>
        }
        <a class="btn green big push-end" [routerLink]="url('O11')" [queryParams]="{ id: id() }">{{ i18n.t({ th: 'ถึงแล้ว ปิดเรื่อง', en: 'Arrived — close the case' }) }}</a>
      }
    </div>
  `,
  styles: `
    .head {
      background: var(--sos);
      color: #fff;
      padding: 14px 16px 20px;
      border-radius: 0 0 20px 20px;
      h1 {
        font-size: 1.75rem;
      }
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #fff;
      font-weight: 700;
      font-size: 0.875rem;
      text-decoration: none;
    }
  `,
})
export class OfficerSosHandling implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(OfficerSosApi);
  private readonly destroy = inject(DestroyRef);
  protected readonly url = screenUrl;
  readonly id = input<string>('');
  protected readonly card = signal<SosCard | null>(null);

  ngOnInit(): void {
    const tick = async () => {
      const c = await this.api.card(this.id()).catch(() => null);
      if (c) this.card.set(c);
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_MS * 2);
    this.destroy.onDestroy(() => clearInterval(t));
  }
}

// ── O11 · ปิดเรื่อง + หมายเหตุ ─────────────────────────────────

const OUTCOMES: { v: string; label: Tr }[] = [
  { v: 'safe', label: { th: 'ไม่มีเหตุร้าย ปลอดภัย', en: 'No incident, all safe' } },
  { v: 'helped', label: { th: 'ช่วยเหลือเรียบร้อย', en: 'Helped, resolved' } },
  { v: 'handed_over', label: { th: 'ส่งต่อหน่วยอื่น', en: 'Handed to another unit' } },
];

@Component({
  selector: 'app-officer-sos-close',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="pad" (submit)="close($event)">
      <a class="back" [routerLink]="url('O10')" [queryParams]="{ id: id() }"><app-icon name="chevronLeft" [size]="16" />{{ i18n.t({ th: 'กลับ', en: 'Back' }) }}</a>
      <h1>{{ i18n.t({ th: 'ปิดเรื่อง SOS', en: 'Close the SOS' }) }}</h1>
      <fieldset class="options">
        <legend>{{ i18n.t({ th: 'เกิดอะไรขึ้น', en: 'What happened' }) }}</legend>
        @for (o of outcomes; track o.v) {
          <label><input type="radio" name="outcome" [value]="o.v" [checked]="outcome() === o.v" (change)="outcome.set(o.v)" />{{ i18n.t(o.label) }}</label>
        }
      </fieldset>
      <label class="note">
        <strong>{{ i18n.t({ th: 'หมายเหตุ (เจ้าของบ้านจะเห็น)', en: 'Note (the owner will see it)' }) }}</strong>
        <textarea rows="4" maxlength="480" [value]="note()" (input)="note.set($any($event.target).value)" [placeholder]="i18n.t({ th: 'เช่น ตรวจรอบบ้านแล้ว ไม่พบสิ่งผิดปกติ', en: 'e.g. Checked around the house, nothing unusual' })"></textarea>
      </label>
      @if (failed()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'ปิดเรื่องไม่ได้ ลองใหม่อีกครั้ง', en: 'Couldn’t close — try again' }) }}</p>
      }
      <button type="submit" class="btn green big push-end" [disabled]="busy()">{{ i18n.t({ th: 'ยืนยันปิดเรื่อง', en: 'Confirm and close' }) }}</button>
    </form>
  `,
  styles: `
    h1 {
      font-size: 1.375rem;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--brand);
      font-weight: 700;
      font-size: 0.875rem;
      text-decoration: none;
    }
    .note {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    textarea {
      font: inherit;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      resize: vertical;
    }
    textarea:focus {
      outline: none;
      border-color: var(--brand);
    }
  `,
})
export class OfficerSosClose {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(OfficerSosApi);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  readonly id = input<string>('');
  protected readonly outcomes = OUTCOMES;
  protected readonly outcome = signal('safe');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  /** POST /sos/:id/close { note } — หมายเหตุ = ผลที่เลือก + ข้อความที่พิมพ์ */
  protected async close(e: Event): Promise<void> {
    e.preventDefault();
    const outcome = OUTCOMES.find((o) => o.v === this.outcome())!;
    const note = [this.i18n.t(outcome.label), this.note().trim()].filter(Boolean).join(' · ');
    this.busy.set(true);
    this.failed.set(false);
    try {
      await this.api.close(this.id(), note.slice(0, 500));
      void this.router.navigateByUrl(screenUrl('O12'), { replaceUrl: true });
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
