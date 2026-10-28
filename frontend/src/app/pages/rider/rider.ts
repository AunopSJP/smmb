import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, Injectable, input, type OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiError } from '../../core/api';
import { I18n } from '../../core/i18n';
import { DELIVERY_LIMIT_PER_HOUR, normalizeCode } from '../../core/mock/rider-demo';
import { screenUrl } from '../../screens/registry';
import { Brand } from '../../shared/brand';
import { Icon } from '../../shared/icon';

// ไรเดอร์ — ไม่ต้องสมัคร ไม่ล็อกอิน ไม่เก็บข้อมูลตัวตน (api.md §5)
// ทางเข้าจริง: สแกน QR หน้าตู้ด้วยกล้องมือถือ → ลิงก์ /b/<token> → หน้า R02 · สแกนไม่ได้ → พิมพ์รหัสใต้ QR (R01)
// ตู้ไม่มีปุ่มหน้าตู้แล้ว (2026-10-28) — แจ้งส่งของได้ทาง QR / รหัสใต้ QR เท่านั้น · ใช้ API จริง

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

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
  imports: [Brand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <form class="stack grow" (submit)="$event.preventDefault(); go()">
      <div>
        <h1>{{ i18n.t({ th: 'พิมพ์รหัสตู้', en: 'Type the mailbox code' }) }}</h1>
        <p class="muted small">
          {{ i18n.t({ th: 'ใช้เมื่อสแกน QR ไม่ได้', en: 'Use this if the QR will not scan' }) }}<br />
          {{ i18n.t({ th: 'รหัส 8 ตัว อยู่ใต้ QR หน้าตู้', en: 'The 8-character code is under the QR on the box' }) }}
        </p>
      </div>
      <label class="field">
        <span>{{ i18n.t({ th: 'รหัสตู้', en: 'Mailbox code' }) }}</span>
        <input
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="12"
          [placeholder]="i18n.t({ th: 'เช่น H4KD-9TRW', en: 'e.g. H4KD-9TRW' })"
          [value]="code()"
          (input)="code.set($any($event.target).value)"
        />
      </label>
      @if (locked()) {
        <p class="danger-text small" role="alert">
          {{ i18n.t({ th: 'พิมพ์ผิดหลายครั้ง รอสักครู่แล้วลองใหม่', en: 'Too many wrong codes — wait a moment and try again' }) }}
        </p>
      } @else if (offline()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'ต่อเน็ตไม่ได้ ลองใหม่อีกครั้ง', en: 'No connection — try again' }) }}</p>
      }
      <button type="submit" class="btn dark push-end" [disabled]="!ready() || busy()">{{ i18n.t({ th: 'ไปหน้าส่งของ', en: 'Continue' }) }}</button>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    h1 {
      font-size: 1.5rem;
      margin-top: 12px;
    }
    .field input {
      font-size: 1.25rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .field input::placeholder {
      text-transform: none;
      letter-spacing: 0;
    }
    .demo-tools a {
      color: inherit;
      font-weight: 700;
    }
  `,
})
export class RiderCode {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(RiderApi);
  private readonly router = inject(Router);
  protected readonly code = signal('');
  protected readonly ready = computed(() => normalizeCode(this.code()).length === 8);
  protected readonly busy = signal(false);
  protected readonly locked = signal(false);
  protected readonly offline = signal(false);

  /** GET /public/codes/:code → { house_no, box_status, delivery_ticket } · ผิด 3 ครั้งติดกัน → 429 รอ */
  protected async go(): Promise<void> {
    if (!this.ready() || this.busy()) return;
    this.busy.set(true);
    const code = await this.api.open(`/api/v1/public/codes/${encodeURIComponent(normalizeCode(this.code()))}`);
    this.busy.set(false);
    this.locked.set(code === 'CODE_ATTEMPTS_EXCEEDED' || code === 'RATE_LIMITED');
    this.offline.set(code === 'OFFLINE');
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
          <p class="muted small">{{ i18n.t({ th: 'ส่งของถึง', en: 'Delivering to' }) }}</p>
          <p class="label">{{ i18n.t({ th: 'บ้านเลขที่', en: 'House no.' }) }}</p>
          <p class="no">{{ t.house_no }}</p>
        </section>
        <section class="card">
          <ol class="how">
            <li><strong>{{ i18n.t({ th: 'ใส่ของลงในตู้', en: 'Put the parcel in the box' }) }}</strong></li>
            <li><strong>{{ i18n.t({ th: 'กดปุ่ม "ส่งของ" ด้านล่าง', en: 'Tap “Delivered” below' }) }}</strong></li>
          </ol>
          <p class="muted small">{{ i18n.t({ th: 'เจ้าของบ้านจะได้รับแจ้งเตือนทันที', en: 'The owner is notified right away' }) }}</p>
        </section>

        @if (expired()) {
          <p class="card expired" role="alert">
            {{ i18n.t({ th: 'เปิดหน้านี้ค้างไว้นานเกินไป — สแกน QR หน้าตู้อีกครั้ง', en: 'This page was open too long — scan the QR on the box again' }) }}
            <a [routerLink]="url('R01')">{{ i18n.t({ th: 'หรือพิมพ์รหัสใต้ QR', en: 'or type the code under it' }) }}</a>
          </p>
        }

        <div class="stack push-end">
          <button type="button" class="btn big green" [disabled]="busy() || expired()" (click)="deliver()">
            <app-icon name="box" [size]="24" />
            {{ i18n.t({ th: 'ส่งของ', en: 'Delivered' }) }}
          </button>
          <p class="muted small center">{{ i18n.t({ th: 'เจ้าหน้าที่ กรุณาสแกนผ่านแอป Smart Mailbox', en: 'Officers: please scan with the Smart Mailbox app' }) }}</p>
          @if (failed()) {
            <p class="danger-text small center" role="alert">{{ i18n.t({ th: 'ส่งไม่ได้ ลองใหม่อีกครั้ง', en: 'Couldn’t send — try again' }) }}</p>
          }
        </div>
      </div>
    } @else if (loading()) {
      <p class="muted center">{{ i18n.t({ th: 'กำลังเปิดตู้…', en: 'Opening the mailbox…' }) }}</p>
    } @else {
      <div class="stack grow">
        <p>{{ i18n.t({ th: 'สแกน QR หน้าตู้ด้วยกล้องมือถือ หรือพิมพ์รหัสใต้ QR', en: 'Scan the QR on the box with your phone camera, or type the code under it' }) }}</p>
        <a class="btn dark push-end" [routerLink]="url('R01')">{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Type the code' }) }}</a>
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
        font-weight: 700;
      }
      .no {
        font-size: 3rem;
        font-weight: 700;
        line-height: 1.15;
        font-variant-numeric: tabular-nums;
      }
    }
    .how {
      margin-bottom: 10px;
      li {
        align-items: center;
      }
    }
    .expired {
      border: 2px solid var(--sos);
      color: var(--sos);
      font-weight: 700;
      a {
        display: block;
        margin-top: 4px;
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
  imports: [Brand, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <div class="stack grow">
      <div class="result mid">
        <span class="big-icon warn" aria-hidden="true">!</span>
        <h1>{{ i18n.t({ th: 'QR หรือรหัสไม่ถูกต้อง', en: 'QR or code not valid' }) }}</h1>
        <p class="muted small">
          {{ i18n.t({ th: 'ลองสแกน QR ที่หน้าตู้อีกครั้ง', en: 'Scan the QR on the box again' }) }}<br />
          {{ i18n.t({ th: 'หรือพิมพ์รหัสใต้ QR', en: 'or type the code under it' }) }}
        </p>
      </div>
      <div class="stack push-end">
        <a class="btn dark" [routerLink]="url('R01')">{{ i18n.t({ th: 'พิมพ์รหัสใหม่', en: 'Type the code again' }) }}</a>
        <p class="muted small center">{{ i18n.t({ th: 'สแกนใหม่ได้ด้วยกล้องมือถือ', en: 'You can rescan with your phone camera' }) }}</p>
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .mid {
      margin-top: 18vh;
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
  imports: [Brand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <div class="result mid">
      <span class="big-icon" aria-hidden="true">✕</span>
      <h1>{{ i18n.t({ th: 'ตู้นี้ปิดให้บริการ', en: 'This mailbox is not in service' }) }}</h1>
      <p class="muted small">
        {{ i18n.t({ th: 'ส่งของผ่านตู้นี้ไม่ได้ตอนนี้', en: 'Deliveries through this box are paused' }) }}<br />
        {{ i18n.t({ th: 'กรุณาติดต่อผู้รับโดยตรง', en: 'Please contact the recipient directly' }) }}
      </p>
    </div>
  `,
  styles: `
    .mid {
      margin-top: 22vh;
    }
  `,
})
export class RiderClosed {
  protected readonly i18n = inject(I18n);
}

// ── R03-c · แจ้งส่งของบ่อยเกินไป ───────────────────────────────

@Component({
  selector: 'app-rider-limited',
  imports: [Brand, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <div class="stack grow">
      <div class="result">
        <span class="big-icon warn" aria-hidden="true">!</span>
        <h1>{{ i18n.t({ th: 'แจ้งส่งของบ่อยเกินไป', en: 'Too many delivery reports' }) }}</h1>
        <p class="muted small">
          {{ i18n.t({ th: 'ตู้นี้แจ้งส่งของได้ไม่เกิน ' + limit + ' ครั้ง/ชั่วโมง', en: 'This box takes at most ' + limit + ' reports an hour' }) }}<br />
          {{ i18n.t({ th: 'กันการกดซ้ำจากรูป QR', en: 'to stop repeats from photos of the QR' }) }}
        </p>
      </div>
      <p class="info-box tip">
        <strong>{{ i18n.t({ th: 'ถ้าส่งของจริง ใส่ของไว้ในตู้ได้เลย', en: 'Real delivery? Just leave it in the box' }) }}</strong><br />
        <span class="muted small">{{ i18n.t({ th: 'เจ้าของบ้านจะเห็นตอนเปิดตู้', en: 'The owner will find it when they open the box' }) }}</span>
      </p>
      <a class="btn secondary push-end" [routerLink]="url('R02')">{{ i18n.t({ th: 'ลองใหม่ภายหลัง', en: 'Try again later' }) }}</a>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
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
        <p class="house">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ house() ?? '99/9' }}</p>
        <p class="small">
          {{ i18n.t({ th: 'แจ้งเจ้าของบ้านแล้ว ', en: 'Owner notified at ' }) }}{{ at() ?? '' }}<br />
          {{ i18n.t({ th: 'ปิดหน้านี้ได้เลย ขอบคุณครับ', en: 'You can close this page. Thank you!' }) }}
        </p>
      </div>
    </div>
  `,
  styles: `
    .done {
      background: #157347;
      color: #fff;
    }
    .mid {
      margin-top: 20vh;
    }
    .result h1 {
      font-size: 1.75rem;
    }
    .house {
      font-size: 1.125rem;
      font-weight: 700;
    }
  `,
})
export class RiderDone {
  protected readonly i18n = inject(I18n);
  readonly house = input<string>();
  readonly at = input<string>();
}
