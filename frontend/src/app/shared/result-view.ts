import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../core/i18n';
import { Icon, type IconName } from './icon';

/**
 * หน้าแจ้งผล/ข้อผิดพลาดแบบเดียวทั้งแอป (A7)
 * ลำดับ: ไอคอน → หัวข้อ → คำอธิบาย → หมายเหตุ → เนื้อหาเสริม (ng-content) → ปุ่มหลัก → ปุ่มรอง
 * ปุ่มอยู่ใต้ข้อความทันที (ไม่ดันไปชิดล่างจอ) และจัดกลางแนวตั้งเมื่อมีพื้นที่ว่าง
 */
@Component({
  selector: 'app-result-view',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="result" [attr.role]="role()">
      <span class="bubble" [class]="tone()" aria-hidden="true">
        <app-icon [name]="icon()" [size]="28" />
      </span>
      <h1>{{ title() }}</h1>
      @if (body()) {
        <p class="body">{{ body() }}</p>
      }
      @if (note()) {
        <p class="note">{{ note() }}</p>
      }

      <ng-content />

      <div class="actions">
        @if (primaryLink()) {
          <a class="btn" [routerLink]="primaryLink()">{{ primaryLabel() }}</a>
        } @else if (primaryLabel()) {
          <button type="button" class="btn" (click)="primary.emit()">{{ primaryLabel() }}</button>
        }
        @if (secondaryLink()) {
          <a class="btn secondary" [routerLink]="secondaryLink()">{{ secondaryLabel() }}</a>
        } @else if (secondaryLabel()) {
          <button type="button" class="btn secondary" (click)="secondary.emit()">{{ secondaryLabel() }}</button>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-inline-size: 0;
    }
    .result {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      inline-size: min(440px, 100%);
      margin-inline: auto;
      padding-block: 24px;
      text-align: center;
      overflow-wrap: break-word;
    }
    .bubble {
      display: grid;
      place-items: center;
      /* 64px: เดิม 92px ทำให้ไอคอนในวงกลมใหญ่กลายเป็นตัวเอกของหน้า ทั้งที่ตัวเอกคือหัวข้อ+ปุ่ม */
      inline-size: 64px;
      block-size: 64px;
      border-radius: 50%;
      background: var(--icon-bg);
      color: var(--brand-text);
    }
    /* สีสื่อความหมาย (A9): เขียว = สำเร็จ · ส้ม = ต้องดู · แดง = ปัญหา */
    .bubble.ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
    .bubble.warn {
      background: var(--ib-warn-bg);
      color: var(--ib-warn-fg);
    }
    .bubble.danger {
      background: var(--danger-bg);
      color: var(--sos);
    }
    h1 {
      margin-block-start: 4px;
      font-size: var(--fs-xl);
      line-height: 1.35;
    }
    .body {
      color: var(--text-muted);
      font-size: var(--fs-base);
      line-height: 1.55;
    }
    .note {
      inline-size: 100%;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      background: var(--surface);
      font-size: var(--fs-sm);
      line-height: 1.5;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      inline-size: 100%;
      margin-block-start: 6px;
    }
    /* ปุ่ม/ลิงก์บนมือถือสูงอย่างน้อย 44px (กฎโปรเจกต์) */
    .actions .btn {
      min-block-size: 44px;
    }
  `,
})
export class ResultView {
  protected readonly i18n = inject(I18n);
  readonly icon = input.required<IconName>();
  readonly tone = input<'neutral' | 'ok' | 'warn' | 'danger'>('neutral');
  readonly role = input<'status' | 'alert' | null>('status');
  readonly title = input.required<string>();
  readonly body = input('');
  readonly note = input('');
  readonly primaryLabel = input('');
  readonly primaryLink = input<string | null>(null);
  readonly secondaryLabel = input('');
  readonly secondaryLink = input<string | null>(null);
  readonly primary = output<void>();
  readonly secondary = output<void>();
}
