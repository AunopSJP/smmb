import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { PASSWORD_MIN } from '../../core/mock/auth-demo';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';

/** ช่องรหัสผ่าน + ปุ่มแสดง/ซ่อน (ผู้ใช้สูงอายุพิมพ์ผิดบ่อย) */
@Component({
  selector: 'app-password-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="field" [class.invalid]="invalid()">
      <span>{{ i18n.t(label()) }}</span>
      <span class="with-unit">
        <input
          [type]="show() ? 'text' : 'password'"
          [attr.autocomplete]="isNew() ? 'new-password' : 'current-password'"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          maxlength="128"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
        />
        <button type="button" class="toggle" [attr.aria-pressed]="show()" (click)="show.set(!show())">
          {{ show() ? i18n.t({ th: 'ซ่อน', en: 'Hide' }) : i18n.t({ th: 'แสดง', en: 'Show' }) }}
        </button>
      </span>
      @if (isNew() && hint()) {
        <small [class.danger-text]="invalid()">{{ i18n.t({ th: 'อย่างน้อย ' + min + ' ตัว', en: 'At least ' + min + ' characters' }) }}</small>
      }
    </label>
  `,
  styles: `
    .toggle {
      flex: none;
      min-height: 52px;
      padding: 0 14px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
  `,
})
export class PasswordField {
  protected readonly i18n = inject(I18n);
  protected readonly min = PASSWORD_MIN;
  readonly value = model('');
  readonly label = input<Tr>({ th: 'รหัสผ่าน', en: 'Password' });
  /** ช่องยืนยัน = ไม่ต้องบอกความยาวซ้ำ */
  readonly hint = input(true);
  /** สมัครใหม่ = บอกความยาวขั้นต่ำ */
  readonly isNew = input(false);
  readonly invalid = input(false);
  protected readonly show = signal(false);
}

/** ช่องติ๊ก "ยอมรับข้อตกลง" + ลิงก์ไปอ่าน (A13) — ไม่ติ๊ก = ไม่สร้างบัญชี */
@Component({
  selector: 'app-terms-check',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="terms">
      <input type="checkbox" [checked]="checked()" (change)="checked.set($any($event.target).checked)" />
      <span>
        {{ i18n.t({ th: 'ยอมรับ', en: 'I accept the ' }) }}<a [routerLink]="terms" [queryParams]="{ from: from() }">{{ i18n.t({ th: 'ข้อตกลงการใช้งาน', en: 'terms of use' }) }}</a>
      </span>
    </label>
    @if (showError()) {
      <p class="danger-text small" role="alert">{{ i18n.t({ th: 'ต้องยอมรับข้อตกลงก่อน จึงจะสร้างบัญชีได้', en: 'You must accept the terms before an account can be created' }) }}</p>
    }
  `,
  styles: `
    .terms {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      cursor: pointer;
    }
    input {
      width: 24px;
      height: 24px;
      margin: 0;
      accent-color: var(--brand);
      flex: none;
    }
    a {
      color: var(--brand);
      font-weight: 700;
    }
  `,
})
export class TermsCheck {
  protected readonly i18n = inject(I18n);
  protected readonly terms = screenUrl('A13');
  readonly checked = model(false);
  /** รหัสหน้าที่จะกลับมาหลังอ่านข้อตกลง */
  readonly from = input.required<string>();
  readonly showError = input(false);
}

/** แถบบอกว่าหน้านี้ไม่สร้างบัญชีจริง */
@Component({
  selector: 'app-mock-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="demo-tools">{{ i18n.t({ th: 'ต้นแบบ — ยังไม่สร้างบัญชีจริง (รอตัดสินใจเรื่องฐานข้อมูล)', en: 'Prototype — no real account is created yet' }) }}</p>`,
})
export class MockNote {
  protected readonly i18n = inject(I18n);
}

/** เวลาตอนนี้ HH:mm (เวลาไทย) */
export const nowHHmm = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
