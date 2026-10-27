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
    <div class="wrap" role="status" aria-live="polite">
      @if (toast.message(); as m) {
        <button type="button" class="toast" (click)="toast.message.set(null)">
          <app-icon name="check" [size]="20" />
          {{ i18n.t(m) }}
        </button>
      }
    </div>
  `,
  styles: `
    .wrap {
      position: sticky;
      bottom: 80px;
      z-index: 5;
      display: flex;
      justify-content: center;
      height: 0;
      overflow: visible;
    }
    .toast {
      transform: translateY(-100%);
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: calc(100% - 32px);
      padding: 14px 20px;
      border: 0;
      border-radius: 16px;
      background: #111827;
      color: #fff;
      font: inherit;
      font-weight: 700;
      box-shadow: 0 8px 20px rgb(0 0 0 / 25%);
      cursor: pointer;
      app-icon {
        color: #6ee7b7;
      }
    }
  `,
})
export class ToastHost {
  protected readonly i18n = inject(I18n);
  protected readonly toast = inject(Toast);
}
