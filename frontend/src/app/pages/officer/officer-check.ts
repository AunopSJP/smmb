import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { nowHHmm, OfficerDemo } from '../../core/mock/officer-demo';
import { screenUrl } from '../../screens/registry';
import { FakeQr } from '../../shared/fake-qr';
import { Icon } from '../../shared/icon';

/** QR ประจำตัวเปลี่ยนทุกกี่วินาที (api.md §6.3) */
const BADGE_TTL = 30;
/** ลองยื่น QR ประจำตัวได้กี่ครั้ง */
const MAX_ATTEMPTS = 3;

const go = (router: Router, code: string, query?: Record<string, string>) =>
  void router.navigate([screenUrl(code)], { queryParams: query });

// ── O02 · สแกน QR หน้าตู้ ─────────────────────────────────────

@Component({
  selector: 'app-officer-scan',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="camera">
      <header class="top">
        <button type="button" class="round" (click)="back()" [attr.aria-label]="i18n.t({ th: 'ย้อนกลับ', en: 'Back' })">
          <app-icon name="chevronLeft" [size]="20" />
        </button>
        <h1>{{ i18n.t({ th: 'สแกน QR หน้าตู้', en: 'Scan the mailbox QR' }) }}</h1>
      </header>
      <p class="aim">{{ i18n.t({ th: 'เล็ง QR หน้าตู้ให้อยู่ในกรอบ', en: 'Fit the mailbox QR inside the frame' }) }}</p>
      <div class="frame" role="img" [attr.aria-label]="i18n.t({ th: 'ภาพกล้อง', en: 'Camera view' })">
        <span class="line"></span>
      </div>
      <p class="hint">{{ i18n.t({ th: 'ภาพกล้อง · ระบบสแกนให้อัตโนมัติ', en: 'Camera view · scans automatically' }) }}</p>
      <button type="button" class="torch" [attr.aria-pressed]="torch()" (click)="torch.set(!torch())">
        {{ torch() ? i18n.t({ th: 'ปิดไฟฉาย', en: 'Torch off' }) : i18n.t({ th: 'เปิดไฟฉาย', en: 'Torch on' }) }}
      </button>
      <div class="demo-tools light">
        {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
        <button type="button" (click)="scanned()">{{ i18n.t({ th: 'สแกนติด 99/9', en: 'Scanned 99/9' }) }}</button>
        <button type="button" (click)="fake()">{{ i18n.t({ th: 'QR ปลอม', en: 'Fake QR' }) }}</button>
        <button type="button" (click)="otherZone()">{{ i18n.t({ th: 'บ้านโซนอื่น', en: 'Other zone' }) }}</button>
      </div>
      <section class="sheet">
        <h2>{{ i18n.t({ th: 'สแกนไม่ติด?', en: 'Can’t scan?' }) }}</h2>
        <p class="muted small">
          {{ i18n.t({ th: 'พิมพ์รหัส 8 ตัวที่อยู่ใต้ QR แทนได้ ระบบจะถามสภาพ QR ต่อ', en: 'Type the 8-character code under the QR instead — we will ask about the QR’s condition' }) }}
        </p>
        <a class="btn secondary" [routerLink]="url('O02-b')">{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Type the code' }) }}</a>
      </section>
    </div>
  `,
  styleUrl: './officer-scan.scss',
})
export class OfficerScan implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(OfficerDemo);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly url = screenUrl;
  protected readonly torch = signal(false);

  ngOnInit(): void {
    // ครั้งแรกต้องขอสิทธิ์กล้องก่อน (O02-c)
    if (this.demo.camera() === 'unknown') void this.router.navigateByUrl(screenUrl('O02-c'), { replaceUrl: true });
    else if (this.demo.camera() === 'denied') void this.router.navigateByUrl(screenUrl('O02-b'), { replaceUrl: true });
  }

  protected back(): void {
    this.location.back();
  }

  protected scanned(): void {
    this.demo.startInspection(this.demo.nextHouse() ?? '99/9');
    go(this.router, 'O05');
  }

  protected fake(): void {
    go(this.router, 'O04');
  }

  protected otherZone(): void {
    go(this.router, 'O04-b', { reason: 'zone' });
  }
}

// ── O02-c · ขอสิทธิ์กล้อง ──────────────────────────────────────

@Component({
  selector: 'app-officer-camera',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="camera dim">
      <div class="faded">
        <h1>{{ i18n.t({ th: 'สแกน QR หน้าตู้', en: 'Scan the mailbox QR' }) }}</h1>
        <p>{{ i18n.t({ th: 'ครั้งแรกต้องอนุญาตกล้องก่อน', en: 'Allow the camera the first time' }) }}</p>
      </div>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="cam-title">
        <h2 id="cam-title" class="perm">
          <span class="icon-bubble"><app-icon name="scan" [size]="20" /></span>
          {{ host }} {{ i18n.t({ th: 'ต้องการใช้กล้อง', en: 'wants to use the camera' }) }}
        </h2>
        <p class="small">
          {{ i18n.t({ th: 'ใช้สแกน QR หน้าตู้เท่านั้น', en: 'Only to scan mailbox QR codes' }) }}<br />
          {{ i18n.t({ th: 'ถ้าไม่อนุญาต ต้องพิมพ์รหัสใต้ QR ทุกครั้ง', en: 'Without it you must type the code every time' }) }}
        </p>
        <div class="two">
          <button type="button" class="btn secondary" (click)="answer(false)">{{ i18n.t({ th: 'ไม่อนุญาต', en: 'Don’t allow' }) }}</button>
          <button type="button" class="btn" (click)="answer(true)">{{ i18n.t({ th: 'อนุญาต', en: 'Allow' }) }}</button>
        </div>
      </section>
    </div>
  `,
  styleUrl: './officer-scan.scss',
})
export class OfficerCamera {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(OfficerDemo);
  private readonly router = inject(Router);
  /** ชื่อโดเมนจริงของเว็บ (ห้ามฮาร์ดโค้ด — CLAUDE.md กฎข้อ 8) */
  protected readonly host = location.host;

  protected answer(allow: boolean): void {
    this.demo.camera.set(allow ? 'granted' : 'denied');
    void this.router.navigateByUrl(screenUrl(allow ? 'O02' : 'O02-b'), { replaceUrl: true });
  }
}

// ── O02-b · พิมพ์รหัสใต้ QR ────────────────────────────────────

@Component({
  selector: 'app-officer-code',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      @if (demo.camera() !== 'denied') {
        <a class="back-link" [routerLink]="url('O02')"><app-icon name="chevronLeft" [size]="16" />{{ i18n.t({ th: 'กลับไปสแกน', en: 'Back to scanning' }) }}</a>
      } @else {
        <a class="back-link" [routerLink]="url('O01')"><app-icon name="chevronLeft" [size]="16" />{{ i18n.t({ th: 'หน้าสรุป', en: 'Summary' }) }}</a>
      }
      <h1>{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Type the code under the QR' }) }}</h1>
      <p class="muted small">{{ i18n.t({ th: 'รหัส 8 ตัว อยู่ใต้ QR หน้าตู้', en: 'The 8-character code under the mailbox QR' }) }}</p>
      @if (demo.camera() === 'denied') {
        <p class="chip warn note">{{ i18n.t({ th: 'ไม่ได้ให้สิทธิ์กล้อง จึงใช้วิธีพิมพ์แทน', en: 'Camera not allowed, so type the code instead' }) }}</p>
      }
      <form class="stack grow" (submit)="check($event)">
        <label class="field">
          <strong>{{ i18n.t({ th: 'รหัสตู้', en: 'Mailbox code' }) }}</strong>
          <input
            #code
            name="code"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            inputmode="text"
            maxlength="9"
            [value]="value()"
            (input)="value.set(normalize(code.value)); code.value = value(); error.set(false)"
            [attr.aria-invalid]="error()"
            aria-describedby="code-hint"
          />
          <span id="code-hint" class="muted small" [class.err]="error()">
            @if (error()) {
              {{ i18n.t({ th: 'รหัสต้องมี 8 ตัว', en: 'The code has 8 characters' }) }}
            } @else {
              {{ i18n.t({ th: 'ตัวพิมพ์ใหญ่ทั้งหมด ไม่มีตัว O กับ I ให้สับสน', en: 'Capital letters only — no O or I to confuse' }) }}
            }
          </span>
        </label>
        <div class="demo-tools">
          {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
          <button type="button" (click)="value.set('H4KD9TRW')">{{ i18n.t({ th: 'ใส่รหัสถูก', en: 'Fill a valid code' }) }}</button>
          <button type="button" (click)="wrong()">{{ i18n.t({ th: 'รหัสผิด', en: 'Wrong code' }) }}</button>
        </div>
        <button type="submit" class="btn push-end">{{ i18n.t({ th: 'ตรวจสอบรหัส', en: 'Check the code' }) }}</button>
      </form>
    </div>
  `,
  styles: `
    h1 {
      font-size: 1.375rem;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--brand);
      font-weight: 700;
      font-size: 0.875rem;
      text-decoration: none;
    }
    .note {
      align-self: flex-start;
      white-space: normal;
    }
    .grow {
      flex: 1;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    input {
      font: inherit;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      min-height: 60px;
      padding: 8px 14px;
      border-radius: var(--radius-sm);
      border: 2px solid var(--line);
      background: var(--surface);
      color: var(--text);
      text-transform: uppercase;
    }
    input:focus {
      outline: none;
      border-color: var(--brand);
    }
    input[aria-invalid='true'] {
      border-color: var(--sos);
    }
    .err {
      color: var(--sos);
    }
  `,
})
export class OfficerCode {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(OfficerDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly value = signal('');
  protected readonly error = signal(false);

  /** ไม่สนตัวเล็กใหญ่ / ขีด / ช่องว่าง (api.md §5) */
  protected normalize(v: string): string {
    return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  protected check(e: Event): void {
    e.preventDefault();
    if (this.value().length !== 8) {
      this.error.set(true);
      return;
    }
    this.demo.startInspection(this.demo.nextHouse() ?? '99/9');
    go(this.router, 'O03');
  }

  protected wrong(): void {
    go(this.router, 'O04-b', { reason: 'code' });
  }
}

// ── O03 · QR หน้าตู้ดูเป็นยังไง ─────────────────────────────────

const CONDITIONS: { v: string; label: Tr; wide?: boolean }[] = [
  { v: 'faded', label: { th: 'ซีด / จาง', en: 'Faded' } },
  { v: 'torn', label: { th: 'ขาด / ฉีก', en: 'Torn' } },
  { v: 'missing', label: { th: 'หาย / ไม่มี', en: 'Missing' } },
  { v: 'covered', label: { th: 'มีอะไรติดทับ', en: 'Covered' } },
  { v: 'ok', label: { th: 'ดูปกติ', en: 'Looks fine' }, wide: true },
];

@Component({
  selector: 'app-officer-qr-condition',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      <p class="ok-text small strong">{{ i18n.t({ th: 'รหัสถูกต้อง · บ้านเลขที่ ', en: 'Code OK · house ' }) }}{{ demo.inspecting() }}</p>
      <h1>{{ i18n.t({ th: 'QR หน้าตู้ดูเป็นยังไง?', en: 'How does the mailbox QR look?' }) }}</h1>
      <p class="muted small">{{ i18n.t({ th: 'ช่วยบอกหน่อย ระบบจะแจ้งให้เปลี่ยนให้', en: 'Tell us and we will arrange a replacement' }) }}</p>
      <div class="grid" role="radiogroup" [attr.aria-label]="i18n.t({ th: 'สภาพ QR', en: 'QR condition' })">
        @for (c of conditions; track c.v) {
          <button type="button" role="radio" [attr.aria-checked]="picked() === c.v" [class.wide]="c.wide" (click)="picked.set(c.v)">
            {{ i18n.t(c.label) }}
          </button>
        }
      </div>
      <p class="muted small">{{ i18n.t({ th: 'ตอบแล้วตรวจตู้ต่อได้ทันที', en: 'Answer and carry on with the inspection' }) }}</p>
      <button type="button" class="btn push-end" [disabled]="!picked()" (click)="next()">
        {{ i18n.t({ th: 'ส่ง แล้วตรวจต่อ', en: 'Send and continue' }) }}
      </button>
    </div>
  `,
  styles: `
    h1 {
      font-size: 1.375rem;
    }
    .strong {
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      button {
        min-height: 60px;
        border-radius: var(--radius-sm);
        border: 1.5px solid var(--line);
        background: var(--surface);
        color: var(--text);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      button[aria-checked='true'] {
        border-color: var(--brand);
        background: var(--brand-lighter);
        color: var(--brand);
      }
      .wide {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class OfficerQrCondition {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(OfficerDemo);
  private readonly router = inject(Router);
  protected readonly conditions = CONDITIONS;
  protected readonly picked = signal<string | null>(null);

  protected next(): void {
    go(this.router, 'O05');
  }
}

// ── O04 · QR ไม่ใช่ของระบบ ─────────────────────────────────────

@Component({
  selector: 'app-officer-not-system',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      <div class="result">
        <span class="big-icon danger" aria-hidden="true">!</span>
        <h1 class="danger-text">{{ i18n.t({ th: 'QR นี้ไม่ใช่ของระบบ', en: 'This QR is not from our system' }) }}</h1>
        <p class="muted small">
          {{ i18n.t({ th: 'อาจมีคนแปะ QR ปลอมทับไว้ อย่าสแกนด้วยกล้องมือถือธรรมดา', en: 'Someone may have stuck a fake QR on top. Don’t scan it with the normal phone camera' }) }}
        </p>
        <p class="info-box">
          <strong class="ok-text"><app-icon name="check" [size]="14" /> {{ i18n.t({ th: 'แจ้งแอดมินแล้วอัตโนมัติ', en: 'Admin alerted automatically' }) }}</strong><br />
          <span class="muted">{{ i18n.t({ th: 'แอดมินจะส่งช่างมาตรวจ และแจ้งหัวหน้าโซน', en: 'A technician will be sent and the zone head told' }) }}</span>
        </p>
      </div>
      <a class="btn push-end" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
    </div>
  `,
  styles: `
    .danger-text {
      color: var(--sos);
    }
  `,
})
export class OfficerNotSystem {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
}

// ── O04-b · ตรวจไม่ได้ (ไม่ใช่โซน / นอกเวลา / รหัสผิด) ─────────────

const DENIED: Record<string, { title: Tr; body: Tr }> = {
  zone: {
    title: { th: 'ไม่ใช่บ้านในโซนของคุณ', en: 'Not a house in your zone' },
    body: { th: 'บ้านเลขที่ 88/1 อยู่โซน B · ไม่ได้บันทึกการตรวจ', en: 'House 88/1 is in zone B · not recorded' },
  },
  window: {
    title: { th: 'ตอนนี้นอกเวลาตรวจ', en: 'Outside patrol hours' },
    body: { th: 'รอบถัดไป 17:00–21:00 · ไม่ได้บันทึกการตรวจ', en: 'Next round 17:00–21:00 · not recorded' },
  },
  code: {
    title: { th: 'รหัสไม่ถูกต้อง', en: 'Wrong code' },
    body: { th: 'ตรวจรหัสใต้ QR อีกครั้ง · ผิดหลายครั้งจะต้องรอสักพัก', en: 'Check the code again · too many tries means a short wait' },
  },
};

@Component({
  selector: 'app-officer-denied',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = text();
    <div class="pad">
      <div class="result">
        <span class="big-icon warn" aria-hidden="true">!</span>
        <h1>{{ i18n.t(d.title) }}</h1>
        <p class="muted small">{{ i18n.t(d.body) }}</p>
      </div>
      <div class="stack push-end">
        <a class="btn" [routerLink]="url(reason() === 'code' ? 'O02-b' : 'O02')">{{ i18n.t({ th: 'สแกนใหม่', en: 'Scan again' }) }}</a>
        <a class="btn secondary" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
      </div>
    </div>
  `,
})
export class OfficerDenied {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  /** ?reason=zone|window|code */
  readonly reason = input<string>('zone');
  protected readonly text = computed(() => DENIED[this.reason() ?? 'zone'] ?? DENIED['zone']);
}

// ── O05 · กำลังปลุกตู้ / O05-b ตู้ไม่ตอบ ─────────────────────────

const PROBLEMS: { v: string; label: Tr }[] = [
  { v: 'no_light', label: { th: 'ไฟไม่ติดเลย', en: 'No light at all' } },
  { v: 'light_no_scan', label: { th: 'ไฟติด แต่ไม่สแกน', en: 'Light on, but not scanning' } },
  { v: 'damaged', label: { th: 'ตู้เสียหาย / ถูกงัด', en: 'Damaged / forced open' } },
];

@Component({
  selector: 'app-officer-wake',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      @if (reported()) {
        <div class="result">
          <span class="big-icon ok"><app-icon name="check" [size]="30" /></span>
          <h1>{{ i18n.t({ th: 'แจ้งปัญหาตู้แล้ว', en: 'Problem reported' }) }}</h1>
          <p class="muted small">{{ i18n.t({ th: 'แจ้งเจ้าของบ้านและแอดมินแล้ว · บ้านนี้ยังไม่นับว่าตรวจแล้ว', en: 'Owner and admin notified · this house is not counted as checked' }) }}</p>
        </div>
        <a class="btn push-end" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
      } @else if (noResponse()) {
        <div class="result">
          <span class="big-icon warn" aria-hidden="true">!</span>
          <h1>{{ i18n.t({ th: 'ตู้ไม่ตอบ', en: 'The mailbox isn’t responding' }) }}</h1>
          <p class="muted small">{{ i18n.t({ th: 'รอมา 30 วินาทีแล้ว ไฟที่ตู้ติดไหม?', en: 'Waited 30 seconds. Is the box light on?' }) }}</p>
        </div>
        <fieldset class="options">
          <legend class="small">{{ i18n.t({ th: 'ดูที่ตู้แล้วเลือก', en: 'Look at the box and choose' }) }}</legend>
          @for (p of problems; track p.v) {
            <label><input type="radio" name="problem" [value]="p.v" [checked]="problem() === p.v" (change)="problem.set(p.v)" />{{ i18n.t(p.label) }}</label>
          }
        </fieldset>
        <p class="muted small">{{ i18n.t({ th: 'ระบบจะแจ้งเจ้าของบ้านและแอดมินให้', en: 'We will tell the owner and the admin' }) }}</p>
        <div class="stack push-end">
          <button type="button" class="btn orange" (click)="reported.set(true)">{{ i18n.t({ th: 'แจ้งปัญหาตู้', en: 'Report a box problem' }) }}</button>
          <button type="button" class="btn secondary" (click)="retry()">{{ i18n.t({ th: 'ลองปลุกตู้อีกครั้ง', en: 'Try waking it again' }) }}</button>
        </div>
      } @else {
        <div class="result waking" aria-live="polite">
          <p class="ok-text small strong"><app-icon name="check" [size]="14" /> {{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ demo.inspecting() }} · {{ i18n.t({ th: 'ในโซนของคุณ', en: 'in your zone' }) }}</p>
          <div class="spinner" aria-hidden="true"><span>{{ i18n.t({ th: 'ตู้', en: 'Box' }) }}</span></div>
          <h1>{{ i18n.t({ th: 'กำลังปลุกตู้…', en: 'Waking the mailbox…' }) }}</h1>
          <p class="muted small">
            {{ i18n.t({ th: 'ไม่ต้องกดอะไรที่ตู้', en: 'No need to touch the box' }) }}<br />
            {{ i18n.t({ th: 'ไฟที่ตู้จะติด แล้วกล้องเปิดเอง', en: 'Its light turns on and the camera starts by itself' }) }}
          </p>
          <p class="muted small">{{ i18n.t({ th: 'ปกติใช้ 1–3 วินาที', en: 'Usually 1–3 seconds' }) }}</p>
        </div>
        <div class="demo-tools push-end">
          {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
          <button type="button" (click)="noResponse.set(true)">{{ i18n.t({ th: 'ตู้ไม่ตอบ', en: 'No response' }) }}</button>
        </div>
      }
    </div>
  `,
  styles: `
    .strong {
      font-weight: 700;
    }
    .waking {
      padding-top: 48px;
    }
    .spinner {
      position: relative;
      display: grid;
      place-items: center;
      width: 120px;
      height: 120px;
      margin: 16px 0;
      border-radius: 50%;
      background: var(--danger-bg);
      color: var(--sos);
      font-size: 1.75rem;
      font-weight: 700;
      &::after {
        content: '';
        position: absolute;
        inset: -6px;
        border-radius: 50%;
        border: 4px solid transparent;
        border-top-color: var(--sos);
        border-right-color: var(--sos);
        animation: spin 1s linear infinite;
      }
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner::after {
        animation-duration: 3s;
      }
    }
  `,
})
export class OfficerWake implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(OfficerDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly problems = PROBLEMS;
  /** ?problem=1 → เปิดที่หน้าแจ้งปัญหาตู้เลย (มาจาก "ตู้ไม่สแกน") */
  readonly problemParam = input<string>(undefined, { alias: 'problem' });
  protected readonly noResponse = signal(false);
  protected readonly problem = signal('no_light');
  protected readonly reported = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  ngOnInit(): void {
    if (this.problemParam()) {
      this.noResponse.set(true);
      this.problem.set('light_no_scan');
    } else {
      this.wake();
    }
  }

  protected retry(): void {
    this.noResponse.set(false);
    this.wake();
  }

  /** ตู้ตอบ (จำลอง 2.5 วิ) → หน้า QR ประจำตัว */
  private wake(): void {
    this.clear();
    this.timer = setTimeout(() => {
      if (!this.noResponse()) go(this.router, 'O06');
    }, 2500);
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

// ── O06 · QR ประจำตัว ─────────────────────────────────────────

@Component({
  selector: 'app-officer-badge',
  imports: [RouterLink, Icon, FakeQr],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      @if (demo.attempt() > 1) {
        <p class="retry" role="alert">
          <strong>{{ i18n.t({ th: 'ตู้อ่านไม่ผ่าน ลองอีกครั้ง', en: 'The box couldn’t read it — try again' }) }}</strong><br />
          <span class="small">{{ i18n.t({ th: 'ลองขยับให้ใกล้ขึ้น หรือเอียงจอเลี่ยงแสงสะท้อน', en: 'Move closer, or tilt to avoid glare' }) }}</span>
        </p>
      } @else {
        <p class="ok-text small strong"><app-icon name="check" [size]="14" /> {{ i18n.t({ th: 'ตู้บ้านเลขที่ ', en: 'Mailbox at ' }) }}{{ demo.inspecting() }} {{ i18n.t({ th: 'พร้อมแล้ว', en: 'is ready' }) }}</p>
      }
      <h1>{{ i18n.t({ th: 'หันจอนี้เข้าหากล้องตู้', en: 'Point this screen at the box camera' }) }}</h1>
      <p class="muted small">{{ i18n.t({ th: 'ห่างประมาณ 1 ฝ่ามือ ถือนิ่ง ๆ', en: 'About a hand’s width away, hold still' }) }}</p>

      <div class="qr">
        <app-fake-qr [seed]="seed()" [label]="i18n.t({ th: 'QR ประจำตัว', en: 'Your badge QR' })" />
      </div>

      <div class="countdown" aria-live="off">
        <span class="sec">{{ left() }}</span>
        <span>
          <strong>{{ i18n.t({ th: 'QR เปลี่ยนใหม่ใน ', en: 'New QR in ' }) }}{{ left() }} {{ i18n.t({ th: 'วินาที', en: 's' }) }}</strong>
          <span class="muted small block">{{ i18n.t({ th: 'ถ่ายรูปไปใช้แทนไม่ได้', en: 'A photo of it won’t work' }) }}</span>
        </span>
      </div>
      <div class="attempts" [attr.aria-label]="i18n.t({ th: 'ครั้งที่ ', en: 'Try ' }) + demo.attempt() + ' / 3'">
        @for (i of [1, 2, 3]; track i) {
          <span [class.failed]="i < demo.attempt()" [class.now]="i === demo.attempt()"></span>
        }
        <small class="muted">{{ i18n.t({ th: 'ครั้งที่ ', en: 'Try ' }) }}{{ demo.attempt() }} {{ i18n.t({ th: 'จาก', en: 'of' }) }} 3</small>
      </div>

      <div class="demo-tools">
        {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
        <button type="button" (click)="pass()">{{ i18n.t({ th: 'ตู้อ่านผ่าน', en: 'Box reads OK' }) }}</button>
        <button type="button" (click)="fail()">{{ i18n.t({ th: 'ตู้อ่านไม่ผ่าน', en: 'Box fails to read' }) }}</button>
      </div>
      <p class="muted small center push-end">{{ i18n.t({ th: 'แอปเพิ่มความสว่างจอให้อัตโนมัติ', en: 'Screen brightness is raised automatically' }) }}</p>
      <a class="btn secondary" [routerLink]="url('O05')" [queryParams]="{ problem: 1 }">
        {{ i18n.t({ th: 'ตู้ไม่สแกน · แจ้งปัญหาตู้', en: 'Box won’t scan · report a problem' }) }}
      </a>
    </div>
  `,
  styles: `
    h1 {
      font-size: 1.375rem;
    }
    .strong {
      font-weight: 700;
    }
    .retry {
      background: var(--warn-bg);
      color: var(--warn);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
    }
    .qr {
      align-self: center;
      width: min(100%, 240px);
      padding: 12px;
      border: 2px solid var(--text);
      border-radius: var(--radius);
      background: #fff;
    }
    .countdown {
      display: flex;
      align-items: center;
      gap: 10px;
      .sec {
        display: grid;
        place-items: center;
        flex: none;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 2px solid var(--line);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
    }
    .block {
      display: block;
    }
    .attempts {
      display: flex;
      align-items: center;
      gap: 6px;
      span {
        width: 32px;
        height: 6px;
        border-radius: 3px;
        background: var(--line);
      }
      .failed {
        background: #b45309;
      }
      .now {
        background: var(--brand);
      }
      small {
        margin-left: 6px;
      }
    }
  `,
})
export class OfficerBadge {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(OfficerDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly seed = signal(Date.now() % 100000);
  protected readonly left = signal(BADGE_TTL);

  constructor() {
    // นับถอยหลัง · ครบ 30 วิ ขอ QR ใหม่ (ของจริง: GET /inspections/:id/badge)
    const t = setInterval(() => {
      if (this.left() <= 1) {
        this.seed.update((s) => s + 1);
        this.left.set(BADGE_TTL);
      } else {
        this.left.update((s) => s - 1);
      }
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected pass(): void {
    this.demo.markChecked(this.demo.inspecting(), nowHHmm());
    go(this.router, 'O08');
  }

  protected fail(): void {
    if (this.demo.attempt() >= MAX_ATTEMPTS) {
      go(this.router, 'O06-c');
      return;
    }
    this.demo.attempt.update((a) => a + 1);
    this.seed.update((s) => s + 1);
    this.left.set(BADGE_TTL);
  }
}

// ── O06-c · ไม่ผ่าน 3 ครั้ง ─────────────────────────────────────

@Component({
  selector: 'app-officer-badge-failed',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      <div class="result">
        <span class="big-icon warn" aria-hidden="true">!</span>
        <h1>{{ i18n.t({ th: 'ตู้สแกนไม่ผ่าน 3 ครั้ง', en: 'The box failed to scan 3 times' }) }}</h1>
        <p class="muted small">{{ i18n.t({ th: 'ตู้อาจมีปัญหา เช่น กล้องสกปรก หรือไฟส่องเสีย', en: 'The box may have a problem, like a dirty camera or broken light' }) }}</p>
        <p class="info-box muted">
          {{ i18n.t({ th: 'บ้านนี้ยังไม่นับว่าตรวจแล้ว', en: 'This house is not counted as checked' }) }}<br />
          {{ i18n.t({ th: 'ระบบจะแจ้งเจ้าของบ้านและแอดมินให้', en: 'We will tell the owner and the admin' }) }}
        </p>
      </div>
      <div class="stack push-end">
        <a class="btn orange" [routerLink]="url('O05')" [queryParams]="{ problem: 1 }">{{ i18n.t({ th: 'แจ้งปัญหาตู้', en: 'Report a box problem' }) }}</a>
        <a class="btn secondary" [routerLink]="url('O02')">{{ i18n.t({ th: 'ข้ามไปหลังถัดไป', en: 'Skip to the next house' }) }}</a>
      </div>
    </div>
  `,
})
export class OfficerBadgeFailed {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
}

// ── O08 · ตรวจแล้ว ───────────────────────────────────────────

@Component({
  selector: 'app-officer-done',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad done" role="status">
      <div class="result">
        <span class="big-icon white"><app-icon name="check" [size]="36" /></span>
        <h1>{{ i18n.t({ th: 'ตรวจแล้ว', en: 'Inspection recorded' }) }}</h1>
        <p class="house">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ demo.inspecting() }} · {{ time }}</p>
        <p class="small">{{ i18n.t({ th: 'เจ้าของบ้านได้รับแจ้งเตือนแล้ว', en: 'The owner has been notified' }) }}</p>
      </div>
      <p class="summary">
        <strong>{{ i18n.t({ th: 'ตรวจแล้ว ', en: 'Checked ' }) }}{{ demo.checked() }} / {{ demo.zoneTotal }} {{ i18n.t({ th: 'หลัง', en: 'houses' }) }}</strong><br />
        @if (demo.nextHouse(); as next) {
          <span class="small">{{ i18n.t({ th: 'หลังถัดไป บ้านเลขที่ ', en: 'Next: house ' }) }}{{ next }}</span>
        } @else {
          <span class="small">{{ i18n.t({ th: 'ครบทุกหลังในรายการแล้ว', en: 'Every house on the list is done' }) }}</span>
        }
      </p>
      <div class="stack push-end">
        <a class="btn on-color" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนหลังถัดไป', en: 'Scan the next house' }) }}</a>
        <a class="btn outline-light" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
      </div>
    </div>
  `,
  styles: `
    .done {
      background: #157347;
      color: #fff;
    }
    .result h1 {
      font-size: 1.75rem;
    }
    .house {
      font-size: 1.125rem;
      font-weight: 700;
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
export class OfficerDone {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(OfficerDemo);
  protected readonly url = screenUrl;
  protected readonly time = nowHHmm();
}
