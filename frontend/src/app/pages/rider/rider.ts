import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, Injectable, input, type OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiError } from '../../core/api';
import { I18n } from '../../core/i18n';
import { CODE_ALPHABET, DELIVERY_LIMIT_PER_HOUR, formatCode, normalizeCode } from '../../core/rider-rules';
import { screenUrl } from '../../screens/registry';
import { fmtTime } from '../../core/time';
import { Brand } from '../../shared/brand';
import { CodeKeypad } from '../../shared/code-keypad';
import { DisplaySettings } from '../../core/display-settings';
import { Icon } from '../../shared/icon';
import { ResultView } from '../../shared/result-view';

// ไรเดอร์ — ไม่ต้องสมัคร ไม่ล็อกอิน ไม่เก็บข้อมูลตัวตน (api.md §5)
// ทางเข้าจริง: สแกน QR หน้าตู้ด้วยกล้องมือถือ → ลิงก์ /b/<token> → หน้า R02 · สแกนไม่ได้ → พิมพ์รหัสใต้ QR (R01)
// ตู้ไม่มีปุ่มหน้าตู้แล้ว (2026-10-28) — แจ้งส่งของได้ทาง QR / รหัสใต้ QR เท่านั้น · ใช้ API จริง

/** เวลา 24 ชม. ตามรูปแบบกลาง (A8) */
const hhmm = (ts: number) => fmtTime(new Date(ts));

/** ตัดสินจาก code ของ error เท่านั้น (CLAUDE.md กฎข้อ 10) */
const ERROR_SCREEN: Record<string, string> = {
  QR_INVALID: 'R03',
  QR_REVOKED: 'R03',
  BOX_SERVICE_CLOSED: 'R03-b',
  DELIVERY_LIMIT: 'R03-c',
};

interface Ticket {
  house_no: string;
  box_status: 'active' | 'service_closed';
  delivery_ticket: string;
}

/** ตู้ที่ไรเดอร์เพิ่งสแกน/พิมพ์รหัสผ่าน (api.md §5) — เก็บในหน่วยความจำเท่านั้น ไม่เก็บอะไรของไรเดอร์ */
@Injectable({ providedIn: 'root' })
export class RiderApi {
  private readonly http = inject(HttpClient);
  readonly ticket = signal<Ticket | null>(null);

  /** คืน code ของ error (หรือ null ถ้าผ่าน) */
  async open(path: string): Promise<string | null> {
    try {
      const t = await firstValueFrom(this.http.get<Ticket>(path));
      this.ticket.set(t);
      return t.box_status === 'active' ? null : 'BOX_SERVICE_CLOSED';
    } catch (err) {
      const e = apiError(err);
      return e.code ?? (e.status === 0 ? 'OFFLINE' : 'QR_INVALID');
    }
  }

  async deliver(): Promise<string | null> {
    const t = this.ticket();
    if (!t) return 'TICKET_EXPIRED';
    try {
      await firstValueFrom(this.http.post('/api/v1/public/deliveries', { delivery_ticket: t.delivery_ticket }));
      this.ticket.set(null);
      return null;
    } catch (err) {
      const e = apiError(err);
      return e.code ?? (e.status === 0 ? 'OFFLINE' : 'ERROR');
    }
  }
}

// ── R01 · พิมพ์รหัสตู้ ──────────────────────────────────────

@Component({
  selector: 'app-rider-code',
  imports: [Brand, CodeKeypad],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <form class="stack grow" (submit)="$event.preventDefault(); go()">
      <div>
        <h1>{{ i18n.t({ th: 'พิมพ์รหัสตู้', en: 'Type the mailbox code' }) }}</h1>
        <p class="muted small easy-hide">
          {{ i18n.t({ th: 'ใช้เมื่อสแกน QR ไม่ได้', en: 'Use this if the QR will not scan' }) }}<br />
          {{ i18n.t({ th: 'รหัส 8 ตัว อยู่ใต้ QR หน้าตู้', en: 'The 8-character code is under the QR on the box' }) }}
        </p>
        <p class="small easy-only">{{ i18n.t({ th: 'รหัส 8 ตัวใต้ QR ที่หน้าตู้ · ไม่ต้องมีบัญชี', en: 'The 8-character code under the QR on the box · no account needed' }) }}</p>
      </div>
      <label class="field">
        <span>{{ i18n.t({ th: 'รหัสตู้', en: 'Mailbox code' }) }}</span>
        <input
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="12"
          [attr.inputmode]="display.easyMode() ? 'none' : null"
          [placeholder]="i18n.t({ th: 'เช่น H4KD-9TRW', en: 'e.g. H4KD-9TRW' })"
          [value]="code()"
          (input)="code.set(fmt($any($event.target).value)); $any($event.target).value = code(); tooShort.set(false)"
        />
      </label>
      @if (locked()) {
        <p class="danger-text small" role="alert">
          {{ i18n.t({ th: 'พิมพ์ผิดหลายครั้ง รอสักครู่แล้วลองอีกครั้ง', en: 'Too many wrong codes — wait a moment and try again' }) }}
        </p>
      } @else if (offline()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ลองอีกครั้ง', en: 'No connection — try again' }) }}</p>
      } @else if (failed()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Something went wrong — try again' }) }}</p>
      }
      <p class="muted small adv-only">
        {{ i18n.t({ th: 'รหัส 8 ตัวอักษร · ตั๋วใช้ได้ 10 นาที · ผิดซ้ำจะถูกพักชั่วคราว', en: '8-character code · ticket valid for 10 minutes · repeated errors pause you briefly' }) }}
      </p>
      @if (display.easyMode()) {
        <app-code-keypad (key)="press($event)" (back)="backspace()" />
      }
      @if (tooShort()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'รหัสต้องมี 8 ตัว — ดูใต้ QR ที่หน้าตู้', en: 'The code has 8 characters — see under the QR on the box' }) }}</p>
      }
      <!-- ปุ่มหลักอยู่ล่างจอ ใกล้นิ้ว (ผู้ใช้เลือก 2026-11-18) · รหัสไม่ครบ = บอกเหตุผล แทนปุ่มเทากดไม่ได้ -->
      <button type="submit" class="btn rider-submit" [disabled]="busy()">{{ i18n.t({ th: 'ไปหน้าส่งของ', en: 'Continue' }) }}</button>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    h1 {
      font-size: var(--fs-xl);
      margin-block-start: 12px;
    }
    .field input {
      font-size: var(--fs-lg);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .rider-submit {
      margin-block-start: auto;
    }
    /* แท็บเล็ต/จอคอม: ปุ่มต่อใต้ช่องสุดท้าย ไม่ปักล่างจอสูง ๆ */
    @media (min-width: 700px) {
      .rider-submit {
        margin-block-start: 24px;
      }
    }
    .field input::placeholder {
      text-transform: none;
      letter-spacing: 0;
    }
    .demo-tools a {
      color: inherit;
      font-weight: var(--fw-strong);
    }
  `,
})
export class RiderCode {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(RiderApi);
  private readonly router = inject(Router);
  protected readonly code = signal('');
  protected readonly fmt = formatCode;
  protected readonly alphabet = CODE_ALPHABET;
  protected readonly display = inject(DisplaySettings);
  protected press(c: string): void {
    this.tooShort.set(false);
    this.code.set(formatCode(this.code() + c));
  }
  protected backspace(): void {
    this.code.set(formatCode(normalizeCode(this.code()).slice(0, -1)));
  }
  protected readonly ready = computed(() => normalizeCode(this.code()).length === 8);
  protected readonly busy = signal(false);
  protected readonly locked = signal(false);
  protected readonly offline = signal(false);
  protected readonly failed = signal(false);
  /** กดไปต่อทั้งที่รหัสยังไม่ครบ 8 ตัว */
  protected readonly tooShort = signal(false);

  /** GET /public/codes/:code → { house_no, box_status, delivery_ticket } · ผิด 3 ครั้งติดกัน → 429 รอ */
  protected async go(): Promise<void> {
    if (this.busy()) return;
    if (!this.ready()) {
      this.tooShort.set(true);
      return;
    }
    this.busy.set(true);
    const code = await this.api.open(`/api/v1/public/codes/${encodeURIComponent(normalizeCode(this.code()))}`);
    this.busy.set(false);
    this.locked.set(code === 'CODE_ATTEMPTS_EXCEEDED' || code === 'RATE_LIMITED');
    this.offline.set(code === 'OFFLINE');
    this.failed.set(!!code && !ERROR_SCREEN[code] && code !== 'OFFLINE' && code !== 'CODE_ATTEMPTS_EXCEEDED' && code !== 'RATE_LIMITED');
    if (code === null) void this.router.navigateByUrl(screenUrl('R02'));
    else if (ERROR_SCREEN[code]) void this.router.navigateByUrl(screenUrl(ERROR_SCREEN[code]));
  }
}

// ── R02 · ส่งของ ────────────────────────────────────────────

@Component({
  selector: 'app-rider-deliver',
  imports: [Brand, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    @if (api.ticket(); as t) {
      <div class="stack grow">
        <section class="card house">
          <p class="muted small">{{ i18n.t({ th: 'คุณกำลังส่งของที่บ้านเลขที่', en: 'You are delivering to house no.' }) }}</p>
          <p class="no">{{ t.house_no }}</p>
        </section>
        <section class="card easy-hide">
          <ol class="how">
            <li><strong>{{ i18n.t({ th: 'ใส่ของลงในตู้', en: 'Put the parcel in the box' }) }}</strong></li>
            <li><strong>{{ i18n.t({ th: 'กดปุ่ม "วางของในตู้แล้ว" ด้านล่าง', en: 'Tap “Parcel is in the box” below' }) }}</strong></li>
          </ol>
          <p class="muted small">{{ i18n.t({ th: 'เจ้าของบ้านจะได้รับแจ้งเตือนทันที', en: 'The owner is notified right away' }) }}</p>
        </section>
        <p class="small easy-only">{{ i18n.t({ th: 'วางของลงตู้ก่อน แล้วค่อยกดปุ่ม', en: 'Put the parcel in first, then tap the button' }) }}</p>
        <p class="muted small adv-only">
          {{ i18n.t({ th: 'ตั๋วลงลายเซ็น ใช้ครั้งเดียว 10 นาที · ไม่เก็บข้อมูลตัวตนของผู้ส่ง', en: 'signed ticket · single use · 10 minutes · the sender’s identity is not stored' }) }}
        </p>

        @if (expired()) {
          <p class="card expired" role="alert">
            {{ i18n.t({ th: 'เปิดหน้านี้ค้างไว้นานเกินไป — สแกน QR หน้าตู้อีกครั้ง', en: 'This page was open too long — scan the QR on the box again' }) }}
            <a [routerLink]="url('R01')">{{ i18n.t({ th: 'หรือพิมพ์รหัสใต้ QR', en: 'or type the code under it' }) }}</a>
          </p>
        }

        <div class="stack push-end">
          <button type="button" class="btn big green" [disabled]="busy() || expired()" (click)="deliver()">
            <app-icon name="box" [size]="24" />
            {{ i18n.t({ th: 'วางของในตู้แล้ว', en: 'Parcel is in the box' }) }}
          </button>
          <p class="muted small center easy-hide">{{ i18n.t({ th: 'เจ้าหน้าที่โปรดสแกนผ่านแอป Smart Mailbox', en: 'Officers: please scan with the Smart Mailbox app' }) }}</p>
          @if (failed()) {
            <p class="danger-text small center" role="alert">{{ i18n.t({ th: 'ส่งไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t send — try again' }) }}</p>
          }
        </div>
      </div>
    } @else if (loading()) {
      <p class="muted center">{{ i18n.t({ th: 'กำลังเปิดตู้…', en: 'Opening the mailbox…' }) }}</p>
    } @else {
      <div class="stack grow">
        <p>{{ i18n.t({ th: 'สแกน QR หน้าตู้ด้วยกล้องมือถือ หรือพิมพ์รหัสใต้ QR', en: 'Scan the QR on the box with your phone camera, or type the code under it' }) }}</p>
        <a class="btn push-end" [routerLink]="url('R01')">{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Type the code' }) }}</a>
      </div>
    }
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .center {
      text-align: center;
    }
    .house {
      text-align: center;
      .label {
        font-weight: var(--fw-strong);
      }
      .no {
        font-size: var(--fs-3xl);
        font-weight: var(--fw-strong);
        line-height: 1.15;
        font-variant-numeric: tabular-nums;
      }
    }
    .how {
      margin-block-end: 10px;
      li {
        align-items: center;
      }
    }
    .expired {
      border: 2px solid var(--sos);
      color: var(--sos);
      font-weight: var(--fw-strong);
      a {
        display: block;
        margin-block-start: 4px;
        font-weight: 400;
      }
    }
  `,
})
export class RiderDeliver implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(RiderApi);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  /** ?qr=<token> มาจากลิงก์ /b/<token> (กล้องมือถือเปิดลิงก์ใน QR หน้าตู้) */
  readonly qr = input<string>();
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly expired = signal(false);
  protected readonly failed = signal(false);

  /** GET /public/qr/:token */
  async ngOnInit(): Promise<void> {
    const token = this.qr();
    if (!token) return; // มาจาก R01 (มี ticket แล้ว) หรือเปิดตรง ๆ
    this.loading.set(true);
    const code = await this.api.open(`/api/v1/public/qr/${encodeURIComponent(token)}`);
    this.loading.set(false);
    if (code) void this.router.navigateByUrl(screenUrl(ERROR_SCREEN[code] ?? 'R03'), { replaceUrl: true });
  }

  /** POST /public/deliveries { delivery_ticket } — กันกดซ้ำระหว่างส่ง */
  protected async deliver(): Promise<void> {
    const t = this.api.ticket();
    if (!t || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    const code = await this.api.deliver();
    this.busy.set(false);
    if (code === null) {
      void this.router.navigate([screenUrl('R04')], { queryParams: { house: t.house_no, at: hhmm(Date.now()) }, replaceUrl: true });
    } else if (code === 'TICKET_EXPIRED') {
      this.expired.set(true);
    } else if (ERROR_SCREEN[code]) {
      void this.router.navigateByUrl(screenUrl(ERROR_SCREEN[code]));
    } else {
      this.failed.set(true);
    }
  }
}

// ── R03 · QR ไม่ถูกต้อง ────────────────────────────────────────

@Component({
  selector: 'app-rider-invalid',
  imports: [Brand, ResultView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <app-result-view
      class="grow"
      icon="search"
      tone="warn"
      role="alert"
      [title]="i18n.t({ th: 'QR หรือรหัสไม่ถูกต้อง', en: 'QR or code not valid' })"
      [body]="i18n.t({ th: 'ลองสแกน QR ที่หน้าตู้อีกครั้ง หรือพิมพ์รหัสใต้ QR', en: 'Scan the QR on the box again, or type the code under it' })"
      [primaryLabel]="i18n.t({ th: 'พิมพ์รหัสใหม่', en: 'Type the code again' })"
      [primaryLink]="url('R01')"
    >
      <p class="muted small easy-hide">{{ i18n.t({ th: 'สแกนใหม่ได้ด้วยกล้องมือถือ', en: 'You can rescan with your phone camera' }) }}</p>
    </app-result-view>
  `,
  styles: `
    /* หน้าแจ้งผลเต็มพื้นที่ที่เหลือ — จัดกลางแนวตั้งด้วย ResultView (A7) */
    .grow {
      flex: 1;
    }
  `,
})
export class RiderInvalid {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
}

// ── R03-b · ตู้ปิดบริการ ─────────────────────────────────────

@Component({
  selector: 'app-rider-closed',
  imports: [Brand, ResultView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <app-result-view
      icon="box"
      tone="warn"
      [title]="i18n.t({ th: 'ตู้นี้ปิดให้บริการ', en: 'This mailbox is not in service' })"
      [body]="i18n.t({ th: 'ส่งของผ่านตู้นี้ไม่ได้ตอนนี้ · โปรดติดต่อผู้รับโดยตรง', en: 'Deliveries through this box are paused · please contact the recipient directly' })"
      [primaryLabel]="i18n.t({ th: 'สแกน / พิมพ์รหัสตู้อื่น', en: 'Scan or enter another box' })"
      [primaryLink]="url('R01')"
    />
  `,
})
export class RiderClosed {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
}

// ── R03-c · แจ้งส่งของบ่อยเกินไป ───────────────────────────────

@Component({
  selector: 'app-rider-limited',
  imports: [Brand, ResultView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <app-result-view
      class="grow"
      icon="alert"
      tone="warn"
      [title]="i18n.t({ th: 'แจ้งส่งของบ่อยเกินไป', en: 'Too many delivery reports' })"
      [body]="i18n.t({ th: 'ตู้นี้แจ้งส่งของได้ไม่เกิน ' + limit + ' ครั้ง/ชั่วโมง', en: 'This box takes at most ' + limit + ' reports an hour' })"
      [note]="i18n.t({ th: 'ป้องกันการแจ้งซ้ำจากรูปถ่าย QR', en: 'to stop repeats from photos of the QR' })"
      [primaryLabel]="i18n.t({ th: 'ลองอีกครั้งภายหลัง', en: 'Try again later' })"
      [primaryLink]="url('R02')"
    >
      <p class="info-box tip">
        <strong>{{ i18n.t({ th: 'นำของใส่ไว้ในตู้ได้', en: 'Real delivery? Just leave it in the box' }) }}</strong><br />
        <span class="muted small">{{ i18n.t({ th: 'เจ้าของบ้านจะเห็นตอนเปิดตู้', en: 'The owner will find it when they open the box' }) }}</span>
      </p>
    </app-result-view>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .tip {
      inline-size: 100%;
      text-align: start;
    }
    .tip strong {
      color: var(--ok);
    }
  `,
})
export class RiderLimited {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly limit = DELIVERY_LIMIT_PER_HOUR;
}

// ── R04 · ส่งสำเร็จ ─────────────────────────────────────────

@Component({
  selector: 'app-rider-done',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad done" role="status">
      <div class="result mid">
        <span class="big-icon white"><app-icon name="check" [size]="40" /></span>
        <h1>{{ i18n.t({ th: 'ส่งสำเร็จ', en: 'Delivered' }) }}</h1>
        <p class="house">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ house() }}</p>
        <p class="small">
          {{ i18n.t({ th: 'แจ้งเจ้าของบ้านแล้ว', en: 'Owner notified' }) }}<span class="easy-hide"> {{ at() ?? '' }}</span><br />
          {{ i18n.t({ th: 'ปิดหน้านี้ได้ ขอบคุณที่ใช้บริการ', en: 'You can close this page. Thank you' }) }}
        </p>
        <p class="small adv-only">{{ i18n.t({ th: 'ตั๋วใช้แล้ว · ไม่เก็บข้อมูลผู้ส่ง', en: 'ticket used · no sender identity stored' }) }}</p>
      </div>
    </div>
  `,
  styles: `
    .done {
      background: var(--success-bg);
      color: var(--success-fg);
    }
    .done .adv-only {
      color: rgb(255 255 255 / 75%);
    }
    .mid {
      margin-block-start: 20vh;
    }
    .result h1 {
      font-size: var(--fs-xl);
    }
    .house {
      font-size: var(--fs-md);
      font-weight: var(--fw-strong);
    }
  `,
})
export class RiderDone {
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  readonly house = input<string>();
  readonly at = input<string>();

  constructor() {
    // เปิดหน้านี้ตรง ๆ โดยไม่ได้แจ้งส่งของจริง (ไม่มีบ้านเลขที่) → อย่าขึ้น "ส่งสำเร็จ" ลอย ๆ กลับหน้าแรกของไรเดอร์
    queueMicrotask(() => {
      if (!this.house()) void this.router.navigateByUrl(screenUrl('R01'), { replaceUrl: true });
    });
  }
}
