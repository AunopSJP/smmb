import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';
import { I18n, type Tr } from './i18n';
import { Icon } from '../shared/icon';

/** ข้อความยืนยันสั้น ๆ ด้านล่างจอ (เช่น "อนุมัติแล้ว") — หายเองใน 2.5 วิ */
@Injectable({ providedIn: 'root' })
export class Toast {
  readonly message = signal<Tr | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: Tr): void {
    this.message.set(message);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), 2500);
  }
}

@Component({
  selector: 'app-toast',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (toast.message(); as m) {
      <div class="wrap" role="status" aria-live="polite">
        <button type="button" class="toast" (click)="toast.message.set(null)">
          <span class="tick"><app-icon name="check" [size]="16" /></span>
          <span class="text">{{ i18n.t(m) }}</span>
        </button>
      </div>
    }
  `,
  styles: `
    /* ลอยเหนือแถบเมนูล่าง · สลับสีตามธีม (พื้นตัวอักษรสวนกับพื้นหน้า) ให้เห็นชัดทั้งโหมดสว่างและมืด */
    .wrap {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: calc(88px + env(safe-area-inset-bottom, 0px));
      z-index: 50;
      display: flex;
      justify-content: center;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
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
    .tick {
      flex: none;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      margin-top: 1px;
      border-radius: 50%;
      background: #16a34a;
      color: #fff;
    }
    .text {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `,
})
export class ToastHost {
  protected readonly i18n = inject(I18n);
  protected readonly toast = inject(Toast);
}
