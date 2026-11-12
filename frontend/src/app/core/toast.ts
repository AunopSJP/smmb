import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';
import { I18n, type Tr } from './i18n';
import { Icon } from '../shared/icon';

/** ข้อความยืนยันสั้น ๆ ด้านล่างจอ (เช่น "อนุมัติแล้ว") — หายเองใน 4 วิ (error 8 วิ) */
@Injectable({ providedIn: 'root' })
export class Toast {
  readonly message = signal<Tr | null>(null);
  readonly kind = signal<'ok' | 'error'>('ok');
  /** มีค่า = toast นี้มีปุ่ม "เลิกทำ" (การกระทำที่ย้อนกลับได้จริงเท่านั้น) */
  readonly undoAction = signal<(() => void | Promise<void>) | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * `kind` ไม่ส่ง = เดาจากข้อความ (ข้อความแจ้งล้มเหลวต้องไม่หน้าตาเหมือนสำเร็จ)
   * ผู้เรียกใหม่ควรส่ง 'error' ตรง ๆ
   */
  show(message: Tr, kind?: 'ok' | 'error'): void {
    const isError = kind ? kind === 'error' : /ไม่สำเร็จ|ไม่ได้|ผิดพลาด|ล้มเหลว|Could not|Couldn’t|Couldn't|failed/i.test(`${message.th} ${message.en}`);
    this.kind.set(isError ? 'error' : 'ok');
    this.undoAction.set(null);
    this.message.set(message);
    this.arm(isError ? 8000 : 4000);
  }

  /**
   * ทำไปแล้วทันที + ให้เวลาเลิกทำ 8 วิ — ใช้กับการกระทำที่ย้อนกลับได้จริงด้วยคำสั่งตรงข้าม
   * (งานย้อนไม่ได้ เช่น คืนตู้ ปิดบริการ รีเซ็ตรหัส ยังต้องใช้ ConfirmDialog ก่อนทำ)
   */
  showUndo(message: Tr, undo: () => void | Promise<void>, ms = 8000): void {
    this.kind.set('ok');
    this.undoAction.set(undo);
    this.message.set(message);
    this.arm(ms);
  }

  async runUndo(): Promise<void> {
    const fn = this.undoAction();
    this.dismiss();
    if (fn) await fn();
  }

  dismiss(): void {
    if (this.timer) clearTimeout(this.timer);
    this.undoAction.set(null);
    this.message.set(null);
  }

  private arm(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.dismiss(), ms);
  }

  error(message: Tr): void {
    this.show(message, 'error');
  }
}

@Component({
  selector: 'app-toast',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (toast.message(); as m) {
      <div class="wrap" [attr.role]="toast.kind() === 'error' ? 'alert' : 'status'" [attr.aria-live]="toast.kind() === 'error' ? 'assertive' : 'polite'">
        <div class="toast" [class.err]="toast.kind() === 'error'">
          <button type="button" class="body" (click)="toast.dismiss()" [attr.aria-label]="i18n.t({ th: 'ปิดข้อความ', en: 'Dismiss' })">
            <span class="tick" [class.err]="toast.kind() === 'error'"><app-icon [name]="toast.kind() === 'error' ? 'alert' : 'check'" [size]="16" /></span>
            <span class="text">{{ i18n.t(m) }}</span>
          </button>
          @if (toast.undoAction()) {
            <button type="button" class="undo" (click)="toast.runUndo()">{{ i18n.t({ th: 'เลิกทำ', en: 'Undo' }) }}</button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    /* ลอยเหนือแถบเมนูล่าง · สลับสีตามธีม (พื้นตัวอักษรสวนกับพื้นหน้า) ให้เห็นชัดทั้งโหมดสว่างและมืด */
    .wrap {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: calc(176px + env(safe-area-inset-bottom, 0px));
      z-index: 50;
      display: flex;
      justify-content: center;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      width: fit-content;
      max-width: min(100%, 520px);
      padding: 12px 16px;
      border: 0;
      border-radius: 14px;
      background: var(--text);
      color: var(--surface);
      font: inherit;
      font-size: 0.9375rem;
      font-weight: 600;
      line-height: 1.45;
      text-align: left;
      box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
      cursor: pointer;
    }
    .body {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .undo {
      flex: none;
      min-block-size: 44px;
      padding: 0 12px;
      border: 1px solid currentColor;
      border-radius: 10px;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    /* toast พื้นสลับสี (var(--text)) — กรอบโฟกัสทั่วไปสีชมพู/แดงกลืนกับพื้น จึงใช้สีตัวอักษรของ toast (ตัดกัน ≥14:1) */
    .toast:focus-visible,
    .body:focus-visible,
    .undo:focus-visible {
      outline: 3px solid var(--surface);
      outline-offset: 2px;
    }
    .tick {
      flex: none;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      margin-top: 1px;
      border-radius: 50%;
      background: var(--success-bg);
      color: var(--success-fg);
    }
    .tick.err {
      background: var(--sos-fg);
      color: var(--sos-bg);
    }
    .toast.err {
      background: var(--sos-bg);
      color: var(--sos-fg);
    }
    .text {
      flex: 1;
      min-width: 0;
      overflow-wrap: break-word;
    }
  `,
})
export class ToastHost {
  protected readonly i18n = inject(I18n);
  protected readonly toast = inject(Toast);
}
