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
import { CodeKeypad } from '../../shared/code-keypad';
import { DisplaySettings } from '../../core/display-settings';
import { Session } from '../../core/session';
import { cleanCode, formatCode } from '../../core/rider-rules';

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
          ? { th: 'รหัสไม่ถูกต้อง ตรวจสอบรหัสใต้ QR อีกครั้ง', en: 'Wrong code — check the code under the QR' }
          : (go(router, 'O04-b', { reason: 'invalid' }), null);
      case 'CODE_ATTEMPTS_EXCEEDED':
      case 'RATE_LIMITED':
        return { th: 'กรอกผิดหลายครั้ง รอสักครู่แล้วลองอีกครั้ง', en: 'Too many tries — wait a moment and try again' };
      default:
        return isOffline(e)
          ? { th: 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจสอบสัญญาณแล้วลองอีกครั้ง (ไม่บันทึกแบบออฟไลน์)', en: 'No connection — check your signal and retry (nothing is saved offline)' }
          : { th: 'เกิดข้อผิดพลาด ลองอีกครั้ง', en: 'Something went wrong — try again' };
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
      <p class="adv-only">{{ i18n.t({ th: 'อ่าน QR อัตโนมัติ · ไม่บันทึกภาพ', en: 'auto-reads the QR · no photo kept' }) }}</p>
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
      <p class="hint easy-hide">{{ i18n.t({ th: 'ระบบสแกนให้อัตโนมัติ · ใช้ปุ่มในแอปเท่านั้น (กล้องมือถือธรรมดาจะเปิดหน้าไรเดอร์)', en: 'Scans automatically · use this button, not the normal camera app' }) }}</p>
      <section class="sheet">
        <h2 class="easy-hide">{{ i18n.t({ th: 'สแกนไม่ติด?', en: 'Can’t scan?' }) }}</h2>
        <p class="muted small easy-hide">
          {{ i18n.t({ th: 'พิมพ์รหัส 8 ตัวที่อยู่ใต้ QR แทนได้ ระบบจะถามสภาพ QR ต่อ', en: 'Type the 8-character code under the QR instead — we will ask about the QR’s condition' }) }}
        </p>
        <a class="btn secondary" [routerLink]="url('O02-b')">{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Type the code' }) }}</a>
      </section>
    </div>
  `,
  styleUrl: './officer-scan.scss',
  styles: `
    .scanner {
      inline-size: min(80vw, 300px);
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
    .cam-strip {
      align-self: stretch;
      margin: 0;
      border-radius: 6px;
      background: rgb(0 0 0 / 45%);
      padding: 4px 10px;
      font-size: 0.75rem;
      color: rgb(255 255 255 / 85%);
    }
    :host-context([data-mode='easy']) .aim {
      margin-block-start: 40px;
      font-size: 1.625rem;
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
          {{ i18n.t({ th: 'กด "อนุญาต" ในหน้าต่างที่ขึ้นมา · ถ้าไม่อนุญาต ต้องพิมพ์รหัสใต้ QR ทุกครั้ง', en: 'Tap "Allow" in the pop-up · without it you must type the code every time' }) }}
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
  imports: [RouterLink, Icon, CodeKeypad],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      <a class="back-link" [routerLink]="url(camera() ? 'O01' : 'O02')"><app-icon name="chevronLeft" [size]="16" />{{
        camera() ? i18n.t({ th: 'หน้าสรุป', en: 'Summary' }) : i18n.t({ th: 'กลับไปสแกน', en: 'Back to scanning' })
      }}</a>
      <h1>{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Type the code under the QR' }) }}</h1>
      <p class="muted small">{{ i18n.t({ th: 'รหัส 8 ตัว อยู่ใต้ QR หน้าตู้', en: 'The 8-character code under the mailbox QR' }) }}</p>
      <p class="muted small adv-only">{{ i18n.t({ th: 'รหัส 8 ตัว คั่นขีดกลางที่ตัวที่ 4 · ไม่แยกตัวพิมพ์เล็ก/ใหญ่ · บันทึกทุกครั้งที่ลอง', en: '8 characters, dash after the 4th · case-insensitive · every try is logged' }) }}</p>
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
            [attr.inputmode]="display.easyMode() ? 'none' : 'text'"
            maxlength="9"
            [value]="fmt(value())"
            (input)="value.set(normalize(code.value)); code.value = fmt(value()); error.set(null)"
            [attr.aria-invalid]="!!error()"
            aria-describedby="code-hint"
          />
          <span id="code-hint" class="muted small" [class.err]="!!error()" [attr.role]="error() ? 'alert' : null">
            @if (error(); as e) {
              {{ i18n.t(e) }}
            } @else {
              {{ i18n.t({ th: 'พิมพ์ตัวเล็กหรือตัวใหญ่ก็ได้ · ไม่มีตัว 0 O 1 I L ที่สับสนง่าย', en: 'Any case — no 0, O, 1, I or L to confuse' }) }}
            }
          </span>
        </label>
        @if (display.easyMode()) {
          <app-code-keypad (key)="press($event)" (back)="backspace()" />
        }
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
      min-block-size: 44px;
      padding-block: 6px;
      gap: 4px;
      color: var(--brand-text);
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
      min-block-size: 60px;
      padding: 8px 14px;
      border-radius: var(--radius-sm);
      border: 2px solid var(--line);
      background: var(--surface);
      color: var(--text);
      text-transform: uppercase;
    }
    input:focus {
      border-color: var(--brand-text);
    }
    input[aria-invalid='true'] {
      border-color: var(--sos);
    }
    .err {
      color: var(--sos);
    }
    .tech {
      font-size: 0.75rem;
      line-height: 1.7;
      padding: 8px 12px;
    }
    :host-context([data-mode='easy']) input {
      font-size: 2.125rem;
      min-block-size: 76px;
      text-align: center;
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
    return cleanCode(v);
  }

  protected readonly fmt = formatCode;
  protected readonly display = inject(DisplaySettings);
  protected press(c: string): void {
    this.value.set(cleanCode(this.value() + c));
    this.error.set(null);
  }
  protected backspace(): void {
    this.value.set(this.value().slice(0, -1));
    this.error.set(null);
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
      <h1>{{ i18n.t({ th: 'สภาพ QR หน้าตู้เป็นอย่างไร?', en: 'How does the mailbox QR look?' }) }}</h1>
      <p class="muted small easy-hide">{{ i18n.t({ th: 'เลือกสภาพ QR แล้วระบบจะแจ้งให้เปลี่ยนใบใหม่', en: 'Tell us and we will arrange a replacement' }) }}</p>
      <div class="grid" role="radiogroup" [attr.aria-label]="i18n.t({ th: 'สภาพ QR', en: 'QR condition' })">
        @for (c of conditions; track c.v) {
          <button type="button" role="radio" [attr.aria-checked]="picked() === c.v" [class.wide]="c.wide" (click)="picked.set(c.v)">
            {{ i18n.t(c.label) }}
          </button>
        }
      </div>
      <p class="muted small easy-hide">{{ i18n.t({ th: 'ตอบแล้วตรวจตู้ต่อได้ทันที (ตู้กำลังตื่นอยู่)', en: 'Answer and carry on — the box is already waking' }) }}</p>
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
    .tech {
      margin: 0;
      font-size: 0.75rem;
      color: var(--text-muted);
      overflow-wrap: break-word;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      button {
        min-block-size: 60px;
        border-radius: var(--radius-sm);
        border: 1.5px solid var(--line);
        background: var(--surface);
        color: var(--text);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      button[aria-checked='true'] {
        border-color: var(--brand-text);
        background: var(--brand-lighter);
        color: var(--brand-text);
      }
      .wide {
        grid-column: 1 / -1;
      }
    }
    :host-context([data-mode='easy']) .grid button {
      min-block-size: 76px;
      font-size: 1.125rem;
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
        <p class="muted small easy-hide">
          {{ i18n.t({ th: 'อาจมีคนแปะ QR ปลอมทับไว้ อย่าสแกนด้วยกล้องมือถือธรรมดา · ไม่ได้บันทึกการตรวจ', en: 'Someone may have stuck a fake QR on top. Don’t scan it with the normal camera · not recorded' }) }}
        </p>
        <p class="info-box">
          <strong class="ok-text"><app-icon name="check" [size]="14" /> {{ i18n.t({ th: 'แจ้งผู้ดูแลระบบแล้วอัตโนมัติ', en: 'Admin alerted automatically' }) }}</strong><br />
          <span class="muted easy-hide">{{ i18n.t({ th: 'ควรทำ: ถ่ายภาพตู้ไว้เป็นหลักฐาน แล้วแจ้งหัวหน้า ระบบบันทึกและแจ้งผู้ดูแลให้แล้ว · ถ้าเป็น QR หน้าตู้ ลองพิมพ์รหัสใต้ QR แทน', en: 'What to do: photograph the box as evidence and tell your head. The system has logged it and alerted the admin · if this is the mailbox QR, try typing the code under it' }) }}</span>
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
    .tech {
      font-size: 0.75rem;
      color: var(--text-muted);
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
    body: { th: 'ผู้ดูแลระบบปิดบริการตู้นี้ไว้ · ไม่ได้บันทึกการตรวจ', en: 'The admin closed this mailbox · not recorded' },
  },
  offline: {
    title: { th: 'ตู้ไม่ออนไลน์', en: 'The mailbox is offline' },
    body: { th: 'ตู้ไม่ได้เชื่อมต่ออินเทอร์เน็ตอยู่ตอนนี้ ปลุกตู้ไม่ได้ · ไม่ได้บันทึกการตรวจ', en: 'The box isn’t connected right now, so it can’t be woken · not recorded' },
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
  styles: `
    .tech {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
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
  { v: 'no_response', label: { th: 'ไม่มีเสียงจากตู้', en: 'No sound from the box at all' } },
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
          <p class="muted small">{{ i18n.t({ th: 'แจ้งเจ้าของบ้านและผู้ดูแลระบบแล้ว · บ้านนี้ยังไม่นับว่าตรวจแล้ว', en: 'Owner and admin notified · this house is not counted as checked' }) }}</p>
        </div>
        <a class="btn push-end" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
      } @else if (noResponse()) {
        <div class="result">
          <span class="big-icon warn" aria-hidden="true">!</span>
          <h1>{{ expiredJob() ? i18n.t({ th: 'งานตรวจหมดเวลา', en: 'The inspection timed out' }) : i18n.t({ th: 'ตู้ไม่ตอบ', en: 'The mailbox isn’t responding' }) }}</h1>
          <p class="muted small">{{ expiredJob() ? i18n.t({ th: 'ครบ 60 วินาทีแล้ว — กลับไปสแกน QR หน้าตู้ใหม่', en: '60 seconds passed — scan the front QR again' }) : i18n.t({ th: 'รอมา 30 วินาทีแล้ว ได้ยินเสียงจากตู้ไหม?', en: 'Waited 30 seconds. Did you hear the box beep?' }) }}</p>
          @if (ins()?.box; as b) {
            <p class="ok-text small strong">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ b.house_no }} · {{ b.name }}</p>
          }
        </div>
        <fieldset class="options">
          <legend class="small">{{ i18n.t({ th: 'ฟังที่ตู้แล้วเลือก', en: 'Listen at the box and choose' }) }}</legend>
          @for (p of problems; track p.v) {
            <label><input type="radio" name="problem" [value]="p.v" [checked]="problem() === p.v" (change)="problem.set(p.v)" />{{ i18n.t(p.label) }}</label>
          }
        </fieldset>
        @if (failed()) {
          <p class="err small" role="alert">{{ i18n.t({ th: 'ส่งไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t send — try again' }) }}</p>
        }
        <p class="muted small easy-hide">{{ i18n.t({ th: 'ระบบจะแจ้งเจ้าของบ้านและผู้ดูแลระบบให้', en: 'We will tell the owner and the admin' }) }}</p>
        <div class="stack push-end">
          <button type="button" class="btn orange" [disabled]="busy()" (click)="report()">{{ i18n.t({ th: 'แจ้งปัญหาตู้', en: 'Report a box problem' }) }}</button>
          <a class="btn secondary" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนปลุกตู้ใหม่', en: 'Scan to wake it again' }) }}</a>
          <a class="btn secondary" [routerLink]="url('O01')">{{ i18n.t({ th: 'ยกเลิก · กลับหน้าสรุป', en: 'Cancel · back to summary' }) }}</a>
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
          <p class="muted small">{{ i18n.t({ th: 'ปกติใช้ 1–3 วินาที', en: 'Usually 1–3 seconds' }) }}</p>
          <a class="btn secondary" [routerLink]="url('O01')">{{ i18n.t({ th: 'ยกเลิก · กลับหน้าสรุป', en: 'Cancel · back to summary' }) }}</a>
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
    .tech {
      margin: 0;
      font-size: 0.75rem;
      color: var(--text-muted);
      overflow-wrap: break-word;
    }
    .waking {
      padding-block-start: 48px;
    }
    .spinner {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 120px;
      block-size: 120px;
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
        border-block-start-color: var(--sos);
        border-inline-end-color: var(--sos);
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
  protected readonly expiredJob = signal(false);
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
      // ยังโหลดงานเพื่อแสดงบ้านเลขที่ — ไม่ให้แจ้งปัญหาผิดบ้าน
      void this.api.get(this.id()).then((ins) => this.ins.set(ins)).catch(() => undefined);
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
      } else if (ins.status === 'expired') {
        this.stop();
        this.expiredJob.set(true);
        this.noResponse.set(true);
      } else if (this.waited() >= WAKE_TIMEOUT_S) {
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
      <p class="muted small easy-hide">{{ i18n.t({ th: 'ห่างประมาณ 1 ฝ่ามือ ถือนิ่ง ๆ · ตู้ส่งเสียงเมื่ออ่านได้', en: 'About a hand’s width away, hold still · the box beeps when it reads it' }) }}</p>

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

      <div class="adv-only grid3 mono">
        <div>{{ i18n.t({ th: 'เปลี่ยนใน', en: 'Rotate in' }) }}<b>{{ left() }} {{ i18n.t({ th: 'วิ', en: 's' }) }}</b></div>
        <div>{{ i18n.t({ th: 'หมดอายุ', en: 'Expires' }) }}<b>{{ expText() }}</b></div>
        <div>{{ i18n.t({ th: 'ครั้งที่', en: 'Try' }) }}<b>{{ ins()?.attempt ?? 1 }} / {{ ins()?.attempts_max ?? 3 }}</b></div>
      </div>

      <div class="countdown" aria-live="off">
        <span class="sec">{{ left() }}</span>
        <span>
          <strong>{{ badgeExpired() ? i18n.t({ th: 'QR หมดอายุแล้ว', en: 'QR expired' }) : i18n.t({ th: 'QR เปลี่ยนใหม่ใน ', en: 'New QR in ' }) + left() + i18n.t({ th: ' วินาที', en: 's' }) }}</strong>
          <span class="muted small block easy-hide">{{ i18n.t({ th: 'ถ่ายรูปไปใช้แทนไม่ได้', en: 'A photo of it won’t work' }) }}</span>
        </span>
      </div>
      @if (badgeExpired() || badgeError()) {
        <div class="card stack" role="alert">
          <strong>{{ badgeExpired() ? i18n.t({ th: 'QR หมดอายุ — อย่ายื่นให้ตู้', en: 'QR expired — don’t show it to the box' }) : i18n.t({ th: 'โหลด QR ใหม่ไม่ได้', en: 'Could not load a new QR' }) }}</strong>
          <span class="muted small">{{ i18n.t({ th: 'กดสร้าง QR ใหม่ก่อนยื่นให้กล้องตู้', en: 'Create a new QR before showing it to the box camera' }) }}</span>
          <button type="button" class="btn secondary" (click)="retryBadge()">{{ i18n.t({ th: 'สร้าง QR ใหม่', en: 'Create a new QR' }) }}</button>
        </div>
      }
      @if (ins(); as i) {
        <div class="attempts" [attr.aria-label]="i18n.t({ th: 'ครั้งที่ ', en: 'Try ' }) + i.attempt + ' / ' + i.attempts_max">
          @for (n of range(i.attempts_max); track n) {
            <span [class.failed]="n < i.attempt" [class.now]="n === i.attempt"></span>
          }
          <small class="muted">{{ i18n.t({ th: 'ครั้งที่ ', en: 'Try ' }) }}{{ i.attempt }} {{ i18n.t({ th: 'จาก', en: 'of' }) }} {{ i.attempts_max }}</small>
        </div>
      }
      <p class="muted small center push-end easy-hide">{{ i18n.t({ th: 'เพิ่มความสว่างจอให้สุดจะอ่านง่ายขึ้น', en: 'Turn screen brightness up for an easier read' }) }}</p>
      <a class="btn secondary" [routerLink]="url('O05')" [queryParams]="{ id: id(), problem: 1 }">
        {{ i18n.t({ th: 'ตู้ไม่สแกน · แจ้งปัญหาตู้', en: 'Box won’t scan · report a problem' }) }}
      </a>
      <a class="btn secondary" [routerLink]="url('O01')">{{ i18n.t({ th: 'ยกเลิก · กลับหน้าสรุป', en: 'Cancel · back to summary' }) }}</a>
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
      inline-size: min(100%, 320px);
      padding: 8px;
      border: 2px solid var(--text);
      border-radius: var(--radius);
      background: var(--qr-bg);
    }
    .copy-qr {
      display: block;
      inline-size: 100%;
      margin-block-start: 6px;
      border: 0;
      background: none;
      color: var(--text-muted);
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
        inline-size: 40px;
        block-size: 40px;
        border-radius: 50%;
        border: 2px solid var(--line);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
    }
    .block {
      display: block;
    }
    .grid3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      align-self: stretch;
      div {
        border-radius: 9px;
        background: var(--bg);
        padding: 6px 8px;
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      b {
        display: block;
        font-size: 0.75rem;
        color: var(--text);
      }
    }
    .tech {
      align-self: stretch;
      margin: 0;
      font-size: 0.75rem;
      color: var(--text-muted);
      overflow-wrap: break-word;
    }
    .attempts {
      display: flex;
      align-items: center;
      gap: 6px;
      span {
        inline-size: 32px;
        block-size: 6px;
        border-radius: 3px;
        background: var(--line);
      }
      .failed {
        background: var(--orange);
      }
      .now {
        background: var(--brand);
      }
      small {
        margin-inline-start: 6px;
      }
    }
  `,
})
export class OfficerBadge implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly session = inject(Session);
  /** config.json devTools: true — ทดสอบกับ npm run box:sim live (ตู้จำลองไม่มีกล้อง) */
  protected readonly devTools = inject(ApiConfig).devTools;
  private readonly api = inject(InspectionApi);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  readonly id = input<string>('');
  protected readonly ins = signal<Inspection | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly left = signal(15);
  /** เวลาหมดอายุจริงจาก server (โหมดละเอียด) */
  private readonly expiresIso = signal<string | null>(null);
  protected readonly expText = computed(() => {
    const iso = this.expiresIso();
    return iso
      ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' })
      : '—';
  });
  private expiresAt = 0;
  private poll: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  protected readonly badgeError = signal(false);
  protected readonly badgeExpired = signal(false);
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
    this.startClock();
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

  /** นับถอยหลัง · เหลือ ≤ 6 วิ ขอใหม่ล่วงหน้า · หมดอายุแล้วหยุด ไม่ยิงซ้ำทุก 500 ms */
  private startClock(): void {
    if (this.clock) return;
    this.clock = setInterval(() => {
      const s = Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 1000));
      this.left.set(s);
      if (s <= 0) {
        this.badgeExpired.set(true);
        this.stopClock();
        return;
      }
      if (s <= 6 && !this.badgeError() && !this.badgeExpired()) void this.refreshBadge();
    }, 500);
  }

  private stopClock(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
  }

  protected retryBadge(): void {
    this.badgeError.set(false);
    this.badgeExpired.set(false);
    void this.refreshBadge();
    this.startClock();
  }

  private async refreshBadge(): Promise<void> {
    if (this.fetching) return;
    this.fetching = true;
    try {
      const b = await this.api.badge(this.id());
      this.qr.set(b.qr);
      this.expiresIso.set(b.expires_at);
      this.expiresAt = new Date(b.expires_at).getTime();
      this.left.set(Math.ceil((this.expiresAt - Date.now()) / 1000));
      this.badgeError.set(false);
      this.badgeExpired.set(false);
    } catch (err) {
      // 410 = การตรวจจบแล้ว → ตัวถามสถานะจะพาไปหน้าผลเอง
      if (apiError(err).code === 'NOT_READY') go(this.router, 'O05', { id: this.id() });
      else this.badgeError.set(true);
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
    this.stopClock();
    this.poll = null;
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
          {{ i18n.t({ th: 'กดแจ้งปัญหา ระบบจะบอกเจ้าของบ้านและผู้ดูแลระบบให้', en: 'Report it and we’ll tell the owner and the admin' }) }}
        </p>
      </div>
      <div class="stack push-end">
        <a class="btn orange" [routerLink]="url('O05')" [queryParams]="{ id: id(), problem: 1, reason: 'scan_failed_3' }">{{ i18n.t({ th: 'แจ้งปัญหาตู้', en: 'Report a box problem' }) }}</a>
        <a class="btn secondary" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนใหม่ / หลังถัดไป', en: 'Scan again / next house' }) }}</a>
      </div>
    </div>
  `,
  styles: `
    .tech {
      font-size: 0.75rem;
      color: var(--text-muted);
      overflow-wrap: break-word;
    }
  `,
})
export class OfficerBadgeFailed implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(InspectionApi);
  protected readonly url = screenUrl;
  readonly id = input<string>('');
  protected readonly ins = signal<Inspection | null>(null);

  async ngOnInit(): Promise<void> {
    this.ins.set(await this.api.get(this.id()).catch(() => null));
  }
}

// ── O08 · ตรวจแล้ว ───────────────────────────────────────────

/**
 * หลังตู้ตอบ "ผ่าน" ตู้ยังทำงานต่ออีกไม่กี่วินาที (ผู้ใช้สั่ง 2026-11-06: ให้เจ้าหน้าที่ยืนอยู่หน้าตู้จนตู้ทำงานครบ)
 * ตู้รอ 1.5–4 วิ + ส่งข้อมูล ~1–2 วิ → 8 วิพอ · ข้อความบนจอต้องไม่บอกว่าตู้ทำอะไร
 */
const HOLD_MS = 8000;

@Component({
  selector: 'app-officer-done',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (holding()) {
      <!-- ช่วงสั้น ๆ หลังตู้ตอบผ่าน: ให้เจ้าหน้าที่ยืนหน้าตู้ต่ออีกครู่ (ตู้ยังทำงานอยู่) — ไม่บอกว่าตู้ทำอะไร -->
      <div class="pad done" role="status" aria-live="polite">
        <div class="result">
          <span class="spinner" aria-hidden="true"></span>
          <h1>{{ i18n.t({ th: 'กำลังบันทึกผลการตรวจ…', en: 'Saving the inspection…' }) }}</h1>
          <p class="small">{{ i18n.t({ th: 'กรุณายืนอยู่หน้าตู้จนกว่าจะเสร็จ', en: 'Please stay in front of the mailbox until it finishes' }) }}</p>
          <div class="bar easy-hide" aria-hidden="true"><span [style.width.%]="progress()"></span></div>
        </div>
      </div>
    } @else if (failed()) {
      <div class="pad done" role="alert">
        <div class="result">
          <span class="big-icon white danger"><app-icon name="alert" [size]="32" /></span>
          <h1>{{ i18n.t({ th: 'ยืนยันผลการตรวจไม่ได้', en: 'Could not confirm the inspection' }) }}</h1>
          <p class="small">{{ i18n.t({ th: 'เน็ตอาจหลุดหรือเซิร์ฟเวอร์ไม่ตอบ — อย่าเพิ่งออกจากหน้าจอ ลองโหลดใหม่', en: 'The network or server did not respond — try again before leaving' }) }}</p>
        </div>
        <div class="stack push-end">
          <button type="button" class="btn" (click)="retry()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Try again' }) }}</button>
          <a class="btn secondary" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
        </div>
      </div>
    } @else {
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
        <!-- ครบทุกหลังแล้ว → ปุ่มหลักคือกลับหน้าสรุป (ไม่ชวนสแกน "หลังถัดไป" ที่ไม่มี) -->
        @if (summary() && !summary()?.next_house) {
          <a class="btn on-color" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
          <a class="btn outline-light" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนตรวจซ้ำ', en: 'Scan again' }) }}</a>
        } @else {
          <a class="btn on-color" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนหลังถัดไป', en: 'Scan the next house' }) }}</a>
          <a class="btn outline-light" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
        }
      </div>
    </div>
    }
  `,
  styles: `
    .done {
      background: var(--success-bg);
      color: var(--success-fg);
    }
    .result h1 {
      font-size: 1.75rem;
    }
    .spinner {
      display: inline-block;
      width: 56px;
      height: 56px;
      border: 5px solid rgba(255, 255, 255, 0.35);
      border-top-color: var(--success-fg);
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation-duration: 3s;
      }
    }
    .bar {
      margin: 16px auto 0;
      width: min(260px, 70%);
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.3);
      overflow: hidden;
      span {
        display: block;
        height: 100%;
        background: var(--success-fg);
        transition: width 0.25s linear;
      }
    }
    .house {
      font-size: 1.125rem;
      font-weight: 700;
    }
    .tech {
      margin: 0;
      font-size: 0.75rem;
      line-height: 1.7;
      color: rgb(255 255 255 / 82%);
      overflow-wrap: break-word;
    }
    .summary {
      background: rgb(255 255 255 / 15%);
      border-radius: var(--radius-sm);
      padding: 12px 14px;
    }
    .on-color {
      color: var(--success-text) !important;
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
  /** true = โหลดผลการตรวจไม่ได้ (ห้ามแสดง "ตรวจแล้ว" ทั้งที่ไม่มีข้อมูล) */
  protected readonly failed = signal(false);
  /** นับจากที่ตู้ตอบ "ผ่าน" · ตู้ยังมีงานต่ออีกไม่กี่วินาที (ดู HOLD_MS) */
  protected readonly holding = signal(false);
  protected readonly progress = signal(0);
  private readonly destroyRef = inject(DestroyRef);

  async ngOnInit(): Promise<void> {
    this.failed.set(false);
    const [ins, summary] = await Promise.all([this.api.get(this.id()).catch(() => null), this.api.summary().catch(() => null)]);
    this.ins.set(ins);
    this.summary.set(summary);
    if (!ins) {
      this.failed.set(true);
      return;
    }
    this.hold(ins.checked_at ? Date.parse(ins.checked_at) : NaN);
  }

  protected retry(): void {
    void this.ngOnInit();
  }

  /** ค้างหน้า "กำลังบันทึก" จนครบ HOLD_MS นับจากเวลาที่ผ่าน (เปิดหน้านี้ทีหลัง/รีเฟรช = ไม่ค้างซ้ำ) */
  private hold(checkedAt: number): void {
    const elapsed = Number.isFinite(checkedAt) ? Date.now() - checkedAt : 0;
    const start = Math.min(Math.max(elapsed, 0), HOLD_MS);
    if (!Number.isFinite(checkedAt) || elapsed >= HOLD_MS) return;
    const t0 = Date.now() - start;
    this.holding.set(true);
    const timer = setInterval(() => {
      const spent = Date.now() - t0;
      this.progress.set(Math.min(100, (spent / HOLD_MS) * 100));
      if (spent >= HOLD_MS) {
        clearInterval(timer);
        this.holding.set(false);
      }
    }, 250);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}
