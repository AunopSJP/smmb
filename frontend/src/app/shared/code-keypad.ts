import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { CODE_ALPHABET } from '../core/rider-rules';
import { I18n } from '../core/i18n';

/** แป้นพิมพ์รหัสใต้ QR บนหน้าจอ (โหมดง่าย · ตามแคนวาสดีไซน์ 2026-11-06) — มีเฉพาะตัวอักษรในชุดรหัส (ไม่มี 0 1 O I L) */
@Component({
  selector: 'app-code-keypad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad" role="group" [attr.aria-label]="i18n.t({ th: 'แป้นพิมพ์รหัส', en: 'Code keypad' })">
      @for (c of keys; track c) {
        <button type="button" (click)="key.emit(c)">{{ c }}</button>
      }
      <button type="button" class="back" [attr.aria-label]="i18n.t({ th: 'ลบ', en: 'Delete' })" (click)="back.emit()">⌫</button>
    </div>
  `,
  styles: `
    .pad {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      inline-size: 100%;
      gap: 6px;
    }
    button {
      min-block-size: 48px;
      min-inline-size: 0;
      padding: 0;
      border: 0;
      border-radius: 10px;
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: 1.25rem;
      font-weight: 700;
      box-shadow: var(--shadow);
      cursor: pointer;
      touch-action: manipulation;
    }
    button:active {
      background: var(--brand-light);
    }
    .back {
      grid-column: span 2;
      color: var(--brand-text);
    }
  `,
})
export class CodeKeypad {
  protected readonly i18n = inject(I18n);
  protected readonly keys = CODE_ALPHABET.split('');
  readonly key = output<string>();
  readonly back = output<void>();
}
