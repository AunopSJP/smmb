import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, type OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { DELIVERY_LIMIT_PER_HOUR, normalizeCode, RiderDemo, type RiderError } from '../../core/mock/rider-demo';
import { screenUrl } from '../../screens/registry';
import { Brand } from '../../shared/brand';
import { Icon } from '../../shared/icon';

// ไรเดอร์ — ไม่ต้องสมัคร ไม่ล็อกอิน ไม่เก็บข้อมูลตัวตน (api.md §5)
// ทางเข้าจริง: สแกน QR หน้าตู้ด้วยกล้องมือถือ → ลิงก์ /b/<token> → หน้า R02 · สแกนไม่ได้ → พิมพ์รหัสใต้ QR (R01)
// ปุ่มส่งของหน้าตู้ยังรอยืนยัน — จึงยังไม่บอกในหน้าจอ (CLAUDE.md "ห้ามทำ")

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

/** ตัดสินจาก code ของ error เท่านั้น (CLAUDE.md กฎข้อ 10) */
const ERROR_SCREEN: Partial<Record<RiderError, string>> = {
  QR_INVALID: 'R03',
  BOX_SERVICE_CLOSED: 'R03-b',
  DELIVERY_LIMIT: 'R03-c',
};

// ── R01 · พิมพ์รหัสตู้ ──────────────────────────────────────

@Component({
  selector: 'app-rider-code',
  imports: [Brand, RouterLink],
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
          {{ i18n.t({ th: 'พิมพ์ผิดหลายครั้ง รอ ' + waitSec() + ' วินาทีแล้วลองใหม่', en: 'Too many wrong codes — try again in ' + waitSec() + ' s' }) }}
        </p>
      }
      <button type="submit" class="btn dark push-end" [disabled]="!ready() || locked()">{{ i18n.t({ th: 'ไปหน้าส่งของ', en: 'Continue' }) }}</button>
      <div class="demo-tools">
        {{ i18n.t({ th: 'จำลอง — รหัส:', en: 'Demo codes:' }) }} H4KD-9TRW (99/9) · C2PZ-8HNM (12/4) · T6WB-3KRV ({{ i18n.t({ th: 'ปิดบริการ', en: 'closed' }) }})
        · {{ i18n.t({ th: 'เปิดจากลิงก์ QR:', en: 'Open a QR link:' }) }}
        <a routerLink="/b/BX00042-1-K7M2QX">99/9</a>
      </div>
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
  private readonly demo = inject(RiderDemo);
  private readonly router = inject(Router);
  protected readonly code = signal('');
  protected readonly ready = computed(() => normalizeCode(this.code()).length === 8);

  /** นาฬิกาสำหรับนับถอยหลังตอนถูกพักการพิมพ์รหัส */
  private readonly now = signal(Date.now());
  protected readonly locked = computed(() => this.now() < this.demo.codeLockedUntil());
  protected readonly waitSec = computed(() => Math.max(0, Math.ceil((this.demo.codeLockedUntil() - this.now()) / 1000)));

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** ของจริง: GET /public/codes/:code → { house_no, box_status, delivery_ticket } */
  protected go(): void {
    if (!this.ready()) return;
    const r = this.demo.openCode(this.code());
    this.now.set(Date.now());
    if (r.ok) {
      void this.router.navigateByUrl(screenUrl('R02'));
      return;
    }
    const target = ERROR_SCREEN[r.code];
    if (target) void this.router.navigateByUrl(screenUrl(target));
  }

}

// ── R02 · ส่งของ ────────────────────────────────────────────

@Component({
  selector: 'app-rider-deliver',
  imports: [Brand, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    @if (demo.ticket(); as t) {
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
          <div class="demo-tools">
            {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
            <button type="button" (click)="demo.expireTicket()">{{ i18n.t({ th: 'เปิดค้าง 10 นาที', en: 'Left open 10 min' }) }}</button>
            <button type="button" (click)="demo.fillLimit(t.box_id)">{{ i18n.t({ th: 'ตู้นี้แจ้งครบ ' + limit + ' ครั้งแล้ว', en: 'Box hit ' + limit + ' this hour' }) }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .grow {
      flex: 1;
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
  protected readonly demo = inject(RiderDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly limit = DELIVERY_LIMIT_PER_HOUR;
  /** ?qr=<token> มาจากลิงก์ /b/<token> */
  readonly qr = input<string>();
  protected readonly busy = signal(false);
  protected readonly expired = signal(false);

  /** ของจริง: GET /public/qr/:token */
  ngOnInit(): void {
    const token = this.qr() ?? (this.demo.ticket() ? null : 'BX00042-1-K7M2QX'); // ต้นแบบ: เปิดตรง ๆ = ตู้ 99/9
    if (!token) return;
    const r = this.demo.openQr(token);
    if (!r.ok) {
      const target = ERROR_SCREEN[r.code] ?? 'R03';
      void this.router.navigateByUrl(screenUrl(target), { replaceUrl: true });
    }
  }

  /** ของจริง: POST /public/deliveries { delivery_ticket } — กันกดซ้ำระหว่างส่ง */
  protected deliver(): void {
    const t = this.demo.ticket();
    if (!t || this.busy()) return;
    this.busy.set(true);
    const r = this.demo.deliver(t);
    this.busy.set(false);
    if (r.ok) {
      this.demo.ticket.set(null);
      void this.router.navigate([screenUrl('R04')], { queryParams: { house: t.house_no, at: hhmm(r.at) }, replaceUrl: true });
      return;
    }
    if (r.code === 'TICKET_EXPIRED') {
      this.expired.set(true);
      return;
    }
    const target = ERROR_SCREEN[r.code];
    if (target) void this.router.navigateByUrl(screenUrl(target));
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
