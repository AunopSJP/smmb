import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, Injectable, signal, viewChild } from '@angular/core';
import { I18n, type Tr } from '../core/i18n';

export interface ConfirmOptions {
  title: Tr;
  body?: Tr;
  /** ป้ายปุ่มยืนยัน เช่น “ลบตู้” · ไม่ใส่ = “ยืนยัน” */
  confirm?: Tr;
  cancel?: Tr;
  /** งานที่ย้อนกลับไม่ได้ (ลบ/ปิดบริการ/คืนตู้) → ปุ่มยืนยันเป็นสีแดง */
  danger?: boolean;
}

/**
 * กล่องยืนยันแบบในแอป แทน `window.confirm`
 * — ใช้ธีม/ฟอนต์/ภาษาเดียวกับแอป, รองรับโหมดง่าย (ปุ่มใหญ่), โฟกัสย้ายเข้าปุ่มแรก, Esc = ยกเลิก
 */
@Injectable({ providedIn: 'root' })
export class Confirm {
  readonly state = signal<ConfirmOptions | null>(null);
  private resolver: ((ok: boolean) => void) | null = null;

  ask(opts: ConfirmOptions): Promise<boolean> {
    this.resolver?.(false);
    this.state.set(opts);
    return new Promise((resolve) => (this.resolver = resolve));
  }

  answer(ok: boolean): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.state.set(null);
    resolve?.(ok);
  }
}

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirm.state(); as o) {
      <div class="backdrop" aria-hidden="true" (click)="confirm.answer(false)"></div>
      <div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" (keydown.escape)="confirm.answer(false)">
        <h2 id="confirm-title">{{ i18n.t(o.title) }}</h2>
        @if (o.body) {
          <p class="muted">{{ i18n.t(o.body) }}</p>
        }
        <button #first type="button" class="btn" [class.danger]="o.danger" (click)="confirm.answer(true)">
          {{ i18n.t(o.confirm ?? { th: 'ยืนยัน', en: 'Confirm' }) }}
        </button>
        <button type="button" class="btn secondary" (click)="confirm.answer(false)">
          {{ i18n.t(o.cancel ?? { th: 'ยกเลิก', en: 'Cancel' }) }}
        </button>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgb(10 12 14 / 55%);
    }
    .sheet {
      position: fixed;
      inset-inline: 16px;
      inset-block-end: calc(16px + env(safe-area-inset-bottom, 0px));
      z-index: 91;
      display: flex;
      flex-direction: column;
      gap: 10px;
      inline-size: min(100% - 32px, 420px);
      margin-inline: auto;
      padding: 20px;
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: 0 12px 40px rgb(0 0 0 / 28%);
    }
    h2 {
      margin: 0;
      font-size: 1.25rem;
      line-height: 1.35;
    }
    p {
      margin: 0;
      font-size: 0.9375rem;
      overflow-wrap: break-word;
    }
    .btn.danger {
      background: var(--sos-bg);
      color: var(--sos-fg);
    }
    @media (min-width: 701px) {
      .sheet {
        inset-block-start: 50%;
        inset-block-end: auto;
        translate: 0 -50%;
      }
    }
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(Confirm);
  protected readonly i18n = inject(I18n);
  private readonly first = viewChild<ElementRef<HTMLButtonElement>>('first');

  constructor() {
    effect(() => {
      if (!this.confirm.state()) return;
      // ให้ template วาดปุ่มก่อนแล้วค่อยย้ายโฟกัส (คีย์บอร์ด/โปรแกรมอ่านหน้าจอ)
      setTimeout(() => this.first()?.nativeElement.focus(), 0);
    });
  }
}
