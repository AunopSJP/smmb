import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18n, type Tr } from '../core/i18n';
import { Icon } from './icon';

export interface Step {
  title: Tr;
  sub: Tr;
}

/** รายการขั้นตอนแบบมีเลข — ขั้นก่อน `current` = เสร็จ (เครื่องหมายถูก) · ขั้น `current` = กำลังทำ (สีแดง) */
@Component({
  selector: 'app-steps',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="card steps">
      @for (s of steps(); track $index; let i = $index) {
        <li [class.done]="i < current()" [class.now]="i === current()" [attr.aria-current]="i === current() ? 'step' : null">
          <span class="num" aria-hidden="true">
            @if (i < current()) {
              <app-icon name="check" [size]="16" />
            } @else {
              {{ i + 1 }}
            }
          </span>
          <span>
            <strong>{{ i18n.t(s.title) }}</strong>
            <small>{{ i18n.t(s.sub) }}</small>
          </span>
        </li>
      }
    </ol>
  `,
  styles: `
    .steps {
      list-style: none;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    li {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      color: var(--text-muted);
    }
    li.now,
    li.done {
      color: var(--text);
    }
    strong,
    small {
      display: block;
    }
    li:not(.now) strong {
      font-weight: 400;
    }
    small {
      color: var(--text-muted);
    }
    .num {
      display: grid;
      place-items: center;
      flex: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1.5px solid currentColor;
      font-size: 0.8125rem;
      font-weight: 700;
    }
    li.now .num {
      background: var(--brand);
      border-color: var(--brand);
      color: #fff;
    }
    li.done .num {
      background: var(--ok);
      border-color: var(--ok);
      color: #fff;
    }
  `,
})
export class Steps {
  protected readonly i18n = inject(I18n);
  readonly steps = input.required<Step[]>();
  readonly current = input.required<number>();
}
