import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, type OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiConfig, apiError, isOffline } from '../../core/api';
import { I18n, type Tr } from '../../core/i18n';
import { hhmm, type Inspection, InspectionApi, type OfficerSummary, type ProblemReason, type QrCondition } from '../../core/inspection-api';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { QrImage } from '../../shared/qr-image';
import { cameraAsked, cameraPermission, markCameraAsked, QrScanner, type ScannerFailure } from '../../shared/qr-scanner';

/** ตู้ยังไม่พร้อมภายในกี่วินาที → ถามว่าได้ยินเสียงตู้ไหม (api.md §6.3) */
const WAKE_TIMEOUT_S = 30;
/** หน้ารอตู้ / รอผล ถามสถานะทุก 1 วิ (✅) */
const POLL_MS = 1000;

const go = (router: Router, code: string, query?: Record<string, string | number>) =>
  void router.navigate([screenUrl(code)], { queryParams: query, replaceUrl: code !== 'O02' });

/**
 * ผลของ POST /inspections → หน้าถัดไป (ตัดสินจาก code เท่านั้น — กฎข้อ 10)
 * คืนข้อความให้แสดงในหน้าเดิม ถ้าไม่ต้องเปลี่ยนหน้า
 */
async function startInspection(api: InspectionApi, router: Router, body: Parameters<InspectionApi['start']>[0]): Promise<Tr | null> {
  try {
    const ins = await api.start(body);
    go(router, ins.ask_qr_condition ? 'O03' : 'O05', { id: ins.id });
    return null;
  } catch (err) {
    const e = apiError(err);
    switch (e.code) {
      case 'QR_NOT_SYSTEM':
        go(router, 'O04');
        return null;
      case 'NOT_IN_ZONE':
        go(router, 'O04-b', { reason: 'zone' });
        return null;
      case 'OUTSIDE_PATROL_WINDOW': {
        const w = e.body['next_window'] as { start?: string; end?: string } | null;
        go(router, 'O04-b', { reason: 'window', ...(w?.start ? { start: w.start, end: w.end ?? '' } : {}) });
        return null;
      }
      case 'BOX_SERVICE_CLOSED':
        go(router, 'O04-b', { reason: 'closed' });
        return null;
      case 'BOX_OFFLINE':
        go(router, 'O04-b', { reason: 'offline' });
        return null;
      case 'QR_INVALID':
        return 'code' in body
          ? { th: 'รหัสไม่ถูกต้อง ตรวจรหัสใต้ QR อีกครั้ง', en: 'Wrong code — check the code under the QR' }
          : (go(router, 'O04-b', { reason: 'invalid' }), null);
      case 'CODE_ATTEMPTS_EXCEEDED':
      case 'RATE_LIMITED':
        return { th: 'ลองผิดหลายครั้ง รอสักครู่แล้วลองใหม่', en: 'Too many tries — wait a moment and try again' };
      default:
        return isOffline(e)
          ? { th: 'ต่อเน็ตไม่ได้ ตรวจสัญญาณแล้วลองใหม่ (ไม่บันทึกแบบออฟไลน์)', en: 'No connection — check your signal and retry (nothing is saved offline)' }
          : { th: 'มีข้อผิดพลาด ลองใหม่อีกครั้ง', en: 'Something went wrong — try again' };
    }
  }
}

// ── O02 · สแกน QR หน้าตู้ (กล้องจริง) ─────────────────────────────

@Component({
  selector: 'app-officer-scan',
  imports: [RouterLink, Icon, QrScanner],
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
      @if (ready()) {
        @if (busy()) {
          <p class="checking" role="status">{{ i18n.t({ th: 'กำลังตรวจสอบ…', en: 'Checking…' }) }}</p>
        } @else {
          <app-qr-scanner class="scanner" (scanned)="onScan($event)" (failed)="onFail($event)">
            <span torch-label>{{ i18n.t({ th: 'ไฟฉาย', en: 'Torch' }) }}</span>
          </app-qr-scanner>
        }
      }
      @if (message(); as m) {
        <p class="msg" role="alert">{{ i18n.t(m) }}</p>
        <button type="button" class="torch" (click)="message.set(null)">{{ i18n.t({ th: 'สแกนอีกครั้ง', en: 'Scan again' }) }}</button>
      }
      <p class="hint">{{ i18n.t({ th: 'ระบบสแกนให้อัตโนมัติ · ใช้ปุ่มในแอปเท่านั้น (กล้องมือถือธรรมดาจะเปิดหน้าไรเดอร์)', en: 'Scans automatically · use this button, not the normal camera app' }) }}</p>
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
  styles: `
    .scanner {
      width: min(80vw, 300px);
    }
    .checking {
      margin: 48px 0;
      font-weight: 700;
    }
    .msg {
      background: rgb(255 255 255 / 12%);
      border-radius: 12px;
      padding: 10px 14px;
      text-align: center;
    }
  `,
})
export class OfficerScan implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(InspectionApi);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly url = screenUrl;
  protected readonly ready = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal<Tr | null>(null);

  async ngOnInit(): Promise<void> {
    const perm = await cameraPermission();
    if (perm === 'denied') return go(this.router, 'O02-b', { camera: 'denied' });
    // ครั้งแรก: อธิบายก่อนว่าขอกล้องไปทำอะไร (O02-c) แล้วเบราว์เซอร์ค่อยถาม
    if (perm !== 'granted' && !cameraAsked()) return go(this.router, 'O02-c');
    this.ready.set(true);
  }

  protected back(): void {
    this.location.back();
  }

  protected async onScan(e: { text: string; ms: number }): Promise<void> {
    this.busy.set(true);
    const msg = await startInspection(this.api, this.router, { qr_text: e.text, scan_ms: e.ms });
    this.busy.set(false);
    this.message.set(msg);
  }

  protected onFail(f: ScannerFailure): void {
    go(this.router, 'O02-b', { camera: f });
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
          {{ i18n.t({ th: 'แอปจะขอใช้กล้อง', en: 'The app will ask for the camera' }) }}
        </h2>
        <p class="small">
          {{ i18n.t({ th: 'ใช้สแกน QR หน้าตู้เท่านั้น ไม่ถ่ายรูปเก็บ', en: 'Only to scan mailbox QR codes — no photos are kept' }) }}<br />
          {{ i18n.t({ th: 'กด "อนุญาต" ในหน้าต่างที่เด้งขึ้นมา · ถ้าไม่อนุญาต ต้องพิมพ์รหัสใต้ QR ทุกครั้ง', en: 'Tap "Allow" in the pop-up · without it you must type the code every time' }) }}
        </p>
        <div class="two">
          <button type="button" class="btn secondary" (click)="answer(false)">{{ i18n.t({ th: 'พิมพ์รหัสแทน', en: 'Type instead' }) }}</button>
          <button type="button" class="btn" (click)="answer(true)">{{ i18n.t({ th: 'ใช้กล้อง', en: 'Use camera' }) }}</button>
        </div>
      </section>
    </div>
  `,
  styleUrl: './officer-scan.scss',
})
export class OfficerCamera {
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);

  protected answer(allow: boolean): void {
    markCameraAsked();
    go(this.router, allow ? 'O02' : 'O02-b');
  }
}

// ── O02-b · พิมพ์รหัสใต้ QR ────────────────────────────────────

const CAMERA_NOTE: Record<string, Tr> = {
  denied: { th: 'ไม่ได้ให้สิทธิ์กล้อง จึงใช้วิธีพิมพ์แทน (เปิดสิทธิ์ได้ที่การตั้งค่าเบราว์เซอร์)', en: 'Camera not allowed, so type the code (allow it in browser settings)' },
  unsupported: { th: 'เครื่องนี้เปิดกล้องในเว็บไม่ได้ (ต้องเปิดผ่าน https)', en: 'This browser can’t open the camera (needs https)' },
  error: { th: 'เปิดกล้องไม่ได้ ใช้วิธีพิมพ์แทน', en: 'Couldn’t open the camera — type the code instead' },
};

@Component({
  selector: 'app-officer-code',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      <a class="back-link" [routerLink]="url(camera() ? 'O01' : 'O02')"><app-icon name="chevronLeft" [size]="16" />{{
        camera() ? i18n.t({ th: 'หน้าสรุป', en: 'Summary' }) : i18n.t({ th: 'กลับไปสแกน', en: 'Back to scanning' })
      }}</a>
      <h1>{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Type the code under the QR' }) }}</h1>
      <p class="muted small">{{ i18n.t({ th: 'รหัส 8 ตัว อยู่ใต้ QR หน้าตู้', en: 'The 8-character code under the mailbox QR' }) }}</p>
      @if (note(); as n) {
        <p class="chip warn note">{{ i18n.t(n) }}</p>
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
            (input)="value.set(normalize(code.value)); code.value = value(); error.set(null)"
            [attr.aria-invalid]="!!error()"
            aria-describedby="code-hint"
          />
          <span id="code-hint" class="muted small" [class.err]="!!error()" [attr.role]="error() ? 'alert' : null">
            @if (error(); as e) {
              {{ i18n.t(e) }}
            } @else {
              {{ i18n.t({ th: 'ไม่สนตัวเล็กใหญ่ ไม่มีตัว 0 O 1 I L ให้สับสน', en: 'Any case — no 0, O, 1, I or L to confuse' }) }}
            }
          </span>
        </label>
        <button type="submit" class="btn push-end" [disabled]="busy()">
          {{ busy() ? i18n.t({ th: 'กำลังตรวจสอบ…', en: 'Checking…' }) : i18n.t({ th: 'ตรวจสอบรหัส', en: 'Check the code' }) }}
        </button>
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
  private readonly api = inject(InspectionApi);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  /** ?camera=denied|unsupported|error — มาจากเปิดกล้องไม่ได้ */
  readonly camera = input<string>();
  protected readonly note = computed(() => CAMERA_NOTE[this.camera() ?? ''] ?? null);
  protected readonly value = signal('');
  protected readonly error = signal<Tr | null>(null);
  protected readonly busy = signal(false);

  /** ไม่สนตัวเล็กใหญ่ / ขีด / ช่องว่าง (api.md §5) */
  protected normalize(v: string): string {
    return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  protected async check(e: Event): Promise<void> {
    e.preventDefault();
    if (this.value().length !== 8) {
      this.error.set({ th: 'รหัสต้องมี 8 ตัว', en: 'The code has 8 characters' });
      return;
    }
    this.busy.set(true);
    this.error.set(await startInspection(this.api, this.router, { code: this.value() }));
    this.busy.set(false);
  }
}

// ── O03 · QR หน้าตู้ดูเป็นยังไง ─────────────────────────────────

const CONDITIONS: { v: QrCondition; label: Tr; wide?: boolean }[] = [
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
      <p class="ok-text small strong">{{ i18n.t({ th: 'รหัสถูกต้อง · บ้านเลขที่ ', en: 'Code OK · house ' }) }}{{ ins()?.box?.house_no }}</p>
      <h1>{{ i18n.t({ th: 'QR หน้าตู้ดูเป็นยังไง?', en: 'How does the mailbox QR look?' }) }}</h1>
      <p class="muted small">{{ i18n.t({ th: 'ช่วยบอกหน่อย ระบบจะแจ้งให้เปลี่ยนให้', en: 'Tell us and we will arrange a replacement' }) }}</p>
      <div class="grid" role="radiogroup" [attr.aria-label]="i18n.t({ th: 'สภาพ QR', en: 'QR condition' })">
        @for (c of conditions; track c.v) {
          <button type="button" role="radio" [attr.aria-checked]="picked() === c.v" [class.wide]="c.wide" (click)="picked.set(c.v)">
            {{ i18n.t(c.label) }}
          </button>
        }
      </div>
      <p class="muted small">{{ i18n.t({ th: 'ตอบแล้วตรวจตู้ต่อได้ทันที (ตู้กำลังตื่นอยู่)', en: 'Answer and carry on — the box is already waking' }) }}</p>
      <button type="button" class="btn push-end" [disabled]="!picked() || busy()" (click)="next()">
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
export class OfficerQrCondition implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(InspectionApi);
  private readonly router = inject(Router);
  readonly id = input<string>('');
  protected readonly conditions = CONDITIONS;
  protected readonly picked = signal<QrCondition | null>(null);
  protected readonly busy = signal(false);
  protected readonly ins = signal<Inspection | null>(null);

  async ngOnInit(): Promise<void> {
    this.ins.set(await this.api.get(this.id()).catch(() => null));
  }

  protected async next(): Promise<void> {
    const c = this.picked();
    if (!c) return;
    this.busy.set(true);
    // ส่งไม่ได้ก็ตรวจต่อ (ไม่บล็อกการตรวจ ✅)
    await this.api.qrCondition(this.id(), c).catch(() => null);
    go(this.router, 'O05', { id: this.id() });
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
          {{ i18n.t({ th: 'อาจมีคนแปะ QR ปลอมทับไว้ อย่าสแกนด้วยกล้องมือถือธรรมดา · ไม่ได้บันทึกการตรวจ', en: 'Someone may have stuck a fake QR on top. Don’t scan it with the normal camera · not recorded' }) }}
        </p>
        <p class="info-box">
          <strong class="ok-text"><app-icon name="check" [size]="14" /> {{ i18n.t({ th: 'แจ้งแอดมินแล้วอัตโนมัติ', en: 'Admin alerted automatically' }) }}</strong><br />
          <span class="muted">{{ i18n.t({ th: 'ถ้าเป็น QR หน้าตู้ ลองพิมพ์รหัสใต้ QR แทน', en: 'If this is the mailbox QR, try typing the code under it' }) }}</span>
        </p>
      </div>
      <div class="stack push-end">
        <a class="btn" [routerLink]="url('O02-b')">{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Type the code' }) }}</a>
        <a class="btn secondary" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
      </div>
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

// ── O04-b · ตรวจไม่ได้ ──────────────────────────────────────────

const DENIED: Record<string, { title: Tr; body: Tr }> = {
  zone: {
    title: { th: 'ไม่ใช่บ้านในโซนของคุณ', en: 'Not a house in your zone' },
    body: { th: 'ตรวจได้เฉพาะบ้านในโซนที่หัวหน้าใส่คุณไว้ · ไม่ได้บันทึกการตรวจ', en: 'You can only inspect houses in your zones · not recorded' },
  },
  window: {
    title: { th: 'ตอนนี้นอกเวลาตรวจ', en: 'Outside patrol hours' },
    body: { th: 'ตรวจได้เฉพาะในเวลาตรวจของโซน · ไม่ได้บันทึกการตรวจ', en: 'Inspections only count during patrol hours · not recorded' },
  },
  closed: {
    title: { th: 'ตู้นี้ปิดบริการอยู่', en: 'This mailbox is closed' },
    body: { th: 'แอดมินปิดบริการตู้นี้ไว้ · ไม่ได้บันทึกการตรวจ', en: 'The admin closed this mailbox · not recorded' },
  },
  offline: {
    title: { th: 'ตู้ไม่ออนไลน์', en: 'The mailbox is offline' },
    body: { th: 'ตู้ไม่ได้ต่อเน็ตอยู่ตอนนี้ ปลุกตู้ไม่ได้ · ไม่ได้บันทึกการตรวจ', en: 'The box isn’t connected right now, so it can’t be woken · not recorded' },
  },
  invalid: {
    title: { th: 'QR นี้ใช้ไม่ได้แล้ว', en: 'This QR is no longer valid' },
    body: { th: 'อาจเป็นใบเก่าที่ถูกเปลี่ยนแล้ว ลองพิมพ์รหัสใต้ QR', en: 'It may be an old replaced QR — try typing the code' },
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
        @if (reason() === 'window' && start()) {
          <p class="info-box">{{ i18n.t({ th: 'รอบถัดไป ', en: 'Next round ' }) }}<strong>{{ start() }}–{{ end() }}</strong></p>
        }
      </div>
      <div class="stack push-end">
        <a class="btn" [routerLink]="url(reason() === 'invalid' ? 'O02-b' : 'O02')">{{ i18n.t({ th: 'สแกนหลังอื่น', en: 'Scan another' }) }}</a>
        <a class="btn secondary" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
      </div>
    </div>
  `,
})
export class OfficerDenied {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  /** ?reason=zone|window|closed|offline|invalid (+ start, end ของรอบถัดไป) */
  readonly reason = input<string>('zone');
  readonly start = input<string>();
  readonly end = input<string>();
  protected readonly text = computed(() => DENIED[this.reason() ?? 'zone'] ?? DENIED['zone']);
}

// ── O05 · กำลังปลุกตู้ / O05-b ตู้ไม่ตอบ ─────────────────────────

const PROBLEMS: { v: ProblemReason; label: Tr }[] = [
  { v: 'no_response', label: { th: 'ไม่มีเสียงจากตู้เลย', en: 'No sound from the box at all' } },
  { v: 'no_scan', label: { th: 'ตู้มีเสียง แต่ไม่สแกน', en: 'The box beeped, but isn’t scanning' } },
  { v: 'scan_failed_3', label: { th: 'ตู้สแกนไม่ผ่าน 3 ครั้ง', en: 'The box failed to scan 3 times' } },
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
          <p class="muted small">{{ i18n.t({ th: 'รอมา 30 วินาทีแล้ว ได้ยินเสียงจากตู้ไหม?', en: 'Waited 30 seconds. Did you hear the box beep?' }) }}</p>
        </div>
        <fieldset class="options">
          <legend class="small">{{ i18n.t({ th: 'ฟังที่ตู้แล้วเลือก', en: 'Listen at the box and choose' }) }}</legend>
          @for (p of problems; track p.v) {
            <label><input type="radio" name="problem" [value]="p.v" [checked]="problem() === p.v" (change)="problem.set(p.v)" />{{ i18n.t(p.label) }}</label>
          }
        </fieldset>
        @if (failed()) {
          <p class="err small" role="alert">{{ i18n.t({ th: 'ส่งไม่ได้ ลองใหม่อีกครั้ง', en: 'Couldn’t send — try again' }) }}</p>
        }
        <p class="muted small">{{ i18n.t({ th: 'ระบบจะแจ้งเจ้าของบ้านและแอดมินให้', en: 'We will tell the owner and the admin' }) }}</p>
        <div class="stack push-end">
          <button type="button" class="btn orange" [disabled]="busy()" (click)="report()">{{ i18n.t({ th: 'แจ้งปัญหาตู้', en: 'Report a box problem' }) }}</button>
          <a class="btn secondary" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนปลุกตู้ใหม่', en: 'Scan to wake it again' }) }}</a>
        </div>
      } @else {
        <div class="result waking" aria-live="polite">
          <p class="ok-text small strong"><app-icon name="check" [size]="14" /> {{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ ins()?.box?.house_no }} · {{ i18n.t({ th: 'ในโซนของคุณ', en: 'in your zone' }) }}</p>
          <div class="spinner" aria-hidden="true"><span>{{ i18n.t({ th: 'ตู้', en: 'Box' }) }}</span></div>
          <h1>{{ i18n.t({ th: 'กำลังปลุกตู้…', en: 'Waking the mailbox…' }) }}</h1>
          <p class="muted small">
            {{ i18n.t({ th: 'ไม่ต้องกดอะไรที่ตู้', en: 'No need to touch the box' }) }}<br />
            {{ i18n.t({ th: 'ตู้จะส่งเสียงปี๊บ แล้วกล้องเปิดเอง', en: 'It beeps and its camera starts by itself' }) }}
          </p>
          <p class="muted small">{{ i18n.t({ th: 'ปกติใช้ 1–3 วินาที', en: 'Usually 1–3 seconds' }) }} · {{ waited() }}s</p>
        </div>
      }
    </div>
  `,
  styles: `
    .strong {
      font-weight: 700;
    }
    .err {
      color: var(--sos);
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
  private readonly api = inject(InspectionApi);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly problems = PROBLEMS;
  readonly id = input<string>('');
  /** ?problem=1 → เปิดที่หน้าแจ้งปัญหาตู้เลย · ?reason=… เลือกไว้ก่อน */
  readonly problemParam = input<string>(undefined, { alias: 'problem' });
  readonly reasonParam = input<string>(undefined, { alias: 'reason' });
  protected readonly ins = signal<Inspection | null>(null);
  protected readonly noResponse = signal(false);
  protected readonly problem = signal<ProblemReason>('no_response');
  protected readonly reported = signal(false);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly waited = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  protected copyQr(q: string): void {
    void navigator.clipboard?.writeText(q).catch(() => undefined);
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  ngOnInit(): void {
    if (this.problemParam()) {
      this.noResponse.set(true);
      const r = this.reasonParam();
      if (PROBLEMS.some((p) => p.v === r)) this.problem.set(r as ProblemReason);
      else this.problem.set('no_scan');
      return;
    }
    const started = Date.now();
    const tick = async () => {
      this.waited.set(Math.floor((Date.now() - started) / 1000));
      const ins = await this.api.get(this.id()).catch(() => null);
      if (!ins) return;
      this.ins.set(ins);
      if (ins.status === 'ready') return this.leave('O06');
      if (ins.status === 'passed') return this.leave('O08');
      if (ins.status === 'failed') return this.leave('O06-c');
      if (ins.status === 'box_problem') {
        this.stop();
        this.reported.set(true);
      } else if (ins.status === 'expired' || this.waited() >= WAKE_TIMEOUT_S) {
        this.stop();
        this.noResponse.set(true);
      }
    };
    void tick();
    this.timer = setInterval(() => void tick(), POLL_MS);
  }

  protected async report(): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    try {
      await this.api.problem(this.id(), this.problem());
      this.reported.set(true);
    } catch {
      this.failed.set(true);
    }
    this.busy.set(false);
  }

  private leave(code: string): void {
    this.stop();
    go(this.router, code, { id: this.id() });
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

// ── O06 · QR ประจำตัว ─────────────────────────────────────────

/** ตอนแสดง QR ประจำตัว: กันจอดับ (Screen Wake Lock — เบราว์เซอร์ที่ไม่รองรับก็ข้ามไป) */
interface WakeLockSentinelLike {
  release(): Promise<void>;
}

@Component({
  selector: 'app-officer-badge',
  imports: [RouterLink, Icon, QrImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      @if ((ins()?.attempt ?? 1) > 1) {
        <p class="retry" role="alert">
          <strong>{{ i18n.t({ th: 'ตู้อ่านไม่ผ่าน ลองอีกครั้ง', en: 'The box couldn’t read it — try again' }) }}</strong><br />
          <span class="small">{{ i18n.t({ th: 'ลองขยับให้ใกล้ขึ้น หรือเอียงจอเลี่ยงแสงสะท้อน', en: 'Move closer, or tilt to avoid glare' }) }}</span>
        </p>
      } @else {
        <p class="ok-text small strong"><app-icon name="check" [size]="14" /> {{ i18n.t({ th: 'ตู้บ้านเลขที่ ', en: 'Mailbox at ' }) }}{{ ins()?.box?.house_no }} {{ i18n.t({ th: 'พร้อมแล้ว', en: 'is ready' }) }}</p>
      }
      <h1>{{ i18n.t({ th: 'หันจอนี้เข้าหากล้องตู้', en: 'Point this screen at the box camera' }) }}</h1>
      <p class="muted small">{{ i18n.t({ th: 'ห่างประมาณ 1 ฝ่ามือ ถือนิ่ง ๆ · ตู้ส่งเสียงเมื่ออ่านได้', en: 'About a hand’s width away, hold still · the box beeps when it reads it' }) }}</p>

      <div class="qr">
        @if (qr(); as q) {
          <app-qr-image [text]="q" level="L" [label]="i18n.t({ th: 'QR ประจำตัว', en: 'Your badge QR' })" />
          @if (devTools()) {
            <button type="button" class="copy-qr" (click)="copyQr(q)">{{ i18n.t({ th: 'คัดลอกข้อความ QR (ตู้จำลอง)', en: 'Copy QR text (box simulator)' }) }}</button>
          }
        } @else {
          <p class="muted small center">{{ i18n.t({ th: 'กำลังสร้าง QR…', en: 'Making your QR…' }) }}</p>
        }
      </div>

      <div class="countdown" aria-live="off">
        <span class="sec">{{ left() }}</span>
        <span>
          <strong>{{ i18n.t({ th: 'QR เปลี่ยนใหม่ใน ', en: 'New QR in ' }) }}{{ left() }} {{ i18n.t({ th: 'วินาที', en: 's' }) }}</strong>
          <span class="muted small block">{{ i18n.t({ th: 'ถ่ายรูปไปใช้แทนไม่ได้', en: 'A photo of it won’t work' }) }}</span>
        </span>
      </div>
      @if (ins(); as i) {
        <div class="attempts" [attr.aria-label]="i18n.t({ th: 'ครั้งที่ ', en: 'Try ' }) + i.attempt + ' / ' + i.attempts_max">
          @for (n of range(i.attempts_max); track n) {
            <span [class.failed]="n < i.attempt" [class.now]="n === i.attempt"></span>
          }
          <small class="muted">{{ i18n.t({ th: 'ครั้งที่ ', en: 'Try ' }) }}{{ i.attempt }} {{ i18n.t({ th: 'จาก', en: 'of' }) }} {{ i.attempts_max }}</small>
        </div>
      }
      <p class="muted small center push-end">{{ i18n.t({ th: 'เพิ่มความสว่างจอให้สุดจะอ่านง่ายขึ้น', en: 'Turn screen brightness up for an easier read' }) }}</p>
      <a class="btn secondary" [routerLink]="url('O05')" [queryParams]="{ id: id(), problem: 1 }">
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
      width: min(100%, 320px);
      padding: 8px;
      border: 2px solid var(--text);
      border-radius: var(--radius);
      background: #fff;
    }
    .copy-qr {
      display: block;
      width: 100%;
      margin-top: 6px;
      border: 0;
      background: none;
      color: #555;
      font: inherit;
      font-size: 0.75rem;
      text-decoration: underline;
      cursor: pointer;
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
export class OfficerBadge implements OnInit {
  protected readonly i18n = inject(I18n);
  /** config.json devTools: true — ทดสอบกับ npm run box:sim live (ตู้จำลองไม่มีกล้อง) */
  protected readonly devTools = inject(ApiConfig).devTools;
  private readonly api = inject(InspectionApi);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  readonly id = input<string>('');
  protected readonly ins = signal<Inspection | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly left = signal(30);
  private expiresAt = 0;
  private poll: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private wakeLock: WakeLockSentinelLike | null = null;
  private fetching = false;
  protected readonly range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  protected copyQr(q: string): void {
    void navigator.clipboard?.writeText(q).catch(() => undefined);
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  async ngOnInit(): Promise<void> {
    await this.keepScreenOn();
    await this.refreshBadge();
    // นับถอยหลัง · เหลือ ≤ 2 วิ ขอ QR ใหม่ล่วงหน้า (ตู้อ่าน QR ที่หมดอายุแล้วไม่ผ่าน)
    this.clock = setInterval(() => {
      const s = Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 1000));
      this.left.set(s);
      if (s <= 2) void this.refreshBadge();
    }, 500);
    const tick = async () => {
      const ins = await this.api.get(this.id()).catch(() => null);
      if (!ins) return;
      this.ins.set(ins);
      if (ins.status === 'passed') this.leave('O08');
      else if (ins.status === 'failed' || ins.status === 'expired') this.leave('O06-c');
      else if (ins.status === 'box_problem') this.leave('O01');
    };
    void tick();
    this.poll = setInterval(() => void tick(), POLL_MS);
  }

  private async refreshBadge(): Promise<void> {
    if (this.fetching) return;
    this.fetching = true;
    try {
      const b = await this.api.badge(this.id());
      this.qr.set(b.qr);
      this.expiresAt = new Date(b.expires_at).getTime();
      this.left.set(Math.ceil((this.expiresAt - Date.now()) / 1000));
    } catch (err) {
      // 410 = การตรวจจบแล้ว → ตัวถามสถานะจะพาไปหน้าผลเอง
      if (apiError(err).code === 'NOT_READY') go(this.router, 'O05', { id: this.id() });
    } finally {
      this.fetching = false;
    }
  }

  private async keepScreenOn(): Promise<void> {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
      this.wakeLock = (await wl?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  private leave(code: string): void {
    this.stop();
    go(this.router, code, { id: this.id() });
  }

  private stop(): void {
    if (this.poll) clearInterval(this.poll);
    if (this.clock) clearInterval(this.clock);
    this.poll = this.clock = null;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
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
        <h1>{{ i18n.t({ th: 'ตู้สแกนไม่ผ่าน', en: 'The box couldn’t scan your QR' }) }}</h1>
        <p class="muted small">{{ i18n.t({ th: 'ตู้อาจมีปัญหา เช่น กล้องสกปรก หรือหมดเวลาก่อนอ่านได้', en: 'The box may have a problem, like a dirty camera, or time ran out' }) }}</p>
        <p class="info-box muted">
          {{ i18n.t({ th: 'บ้านนี้ยังไม่นับว่าตรวจแล้ว', en: 'This house is not counted as checked' }) }}<br />
          {{ i18n.t({ th: 'กดแจ้งปัญหา ระบบจะบอกเจ้าของบ้านและแอดมินให้', en: 'Report it and we’ll tell the owner and the admin' }) }}
        </p>
      </div>
      <div class="stack push-end">
        <a class="btn orange" [routerLink]="url('O05')" [queryParams]="{ id: id(), problem: 1, reason: 'scan_failed_3' }">{{ i18n.t({ th: 'แจ้งปัญหาตู้', en: 'Report a box problem' }) }}</a>
        <a class="btn secondary" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนใหม่ / หลังถัดไป', en: 'Scan again / next house' }) }}</a>
      </div>
    </div>
  `,
})
export class OfficerBadgeFailed {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  readonly id = input<string>('');
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
        <p class="house">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ ins()?.box?.house_no }} · {{ time(ins()?.checked_at) }}</p>
        <p class="small">{{ i18n.t({ th: 'เจ้าของบ้านได้รับแจ้งเตือนแล้ว', en: 'The owner has been notified' }) }}</p>
      </div>
      @if (summary(); as s) {
        <p class="summary">
          <strong>{{ i18n.t({ th: 'ตรวจแล้ว ', en: 'Checked ' }) }}{{ s.houses_checked }} / {{ s.houses_total }} {{ i18n.t({ th: 'หลัง', en: 'houses' }) }}</strong><br />
          @if (s.next_house; as next) {
            <span class="small">{{ i18n.t({ th: 'หลังถัดไป บ้านเลขที่ ', en: 'Next: house ' }) }}{{ next.house_no }}</span>
          } @else {
            <span class="small">{{ i18n.t({ th: 'ครบทุกหลังในโซนแล้ว', en: 'Every house in your zone is done' }) }}</span>
          }
        </p>
      }
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
export class OfficerDone implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(InspectionApi);
  protected readonly url = screenUrl;
  protected readonly time = hhmm;
  readonly id = input<string>('');
  protected readonly ins = signal<Inspection | null>(null);
  protected readonly summary = signal<OfficerSummary | null>(null);

  async ngOnInit(): Promise<void> {
    const [ins, summary] = await Promise.all([this.api.get(this.id()).catch(() => null), this.api.summary().catch(() => null)]);
    this.ins.set(ins);
    this.summary.set(summary);
  }
}
