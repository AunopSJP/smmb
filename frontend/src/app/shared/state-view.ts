import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon, type IconName } from './icon';

/**
 * Skeleton กลางสำหรับสถานะ "กำลังโหลด" — ใช้แทนข้อความลอย ๆ
 * เพื่อให้จังหวะหน้าจอไม่กระโดด และผู้ใช้เห็นโครงของเนื้อหาที่กำลังมา
 * (แถวสูงเท่าเนื้อหาจริงโดยประมาณ · ไม่มี animation ที่กระตุ้น motion sickness)
 */
@Component({
  selector: 'app-loading-rows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rows" role="status" [attr.aria-label]="label()">
      @for (i of items(); track i) {
        <div class="row">
          <span class="avatar" aria-hidden="true"></span>
          <span class="lines" aria-hidden="true"><i></i><i></i></span>
        </div>
      }
      <span class="sr-only">{{ label() }}</span>
    </div>
  `,
  styles: `
    .rows {
      display: flex;
      flex-direction: column;
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
    }
    .row + .row {
      border-block-start: 1px solid var(--line);
    }
    .avatar {
      flex: none;
      inline-size: 40px;
      block-size: 40px;
      border-radius: 12px;
      background: var(--icon-bg);
    }
    .lines {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-block-start: 3px;
    }
    .lines i {
      display: block;
      block-size: 12px;
      border-radius: 999px;
      background: var(--icon-bg);
    }
    .lines i:first-child {
      inline-size: min(72%, 28ch);
    }
    .lines i:last-child {
      inline-size: min(46%, 18ch);
    }
    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }
    @media (prefers-reduced-motion: no-preference) {
      .avatar,
      .lines i {
        animation: pulse 1.4s ease-in-out infinite;
      }
      .row:nth-child(2) .lines i {
        animation-delay: 0.12s;
      }
      .row:nth-child(3) .lines i {
        animation-delay: 0.24s;
      }
    }
    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.55;
      }
    }
  `,
})
export class LoadingRows {
  readonly rows = input(3);
  readonly label = input('Loading…');
  protected readonly items = computed(() => Array.from({ length: Math.max(1, this.rows()) }, (_, i) => i));
}

/**
 * สถานะ "ว่าง" กลาง — ไอคอน + หัวข้อ + คำอธิบาย + ปุ่ม/ลิงก์ที่ส่งผ่าน ng-content
 * ทุกหน้าจอใช้โครงเดียวกัน เพื่อไม่ให้ข้อความว่างกระจัดกระจายคนละแบบ
 */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty" role="status">
      <span class="ico" aria-hidden="true"><app-icon [name]="icon()" [size]="30" /></span>
      <strong>{{ title() }}</strong>
      @if (hint()) {
        <span class="muted small">{{ hint() }}</span>
      }
      <ng-content />
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 40px 16px;
      text-align: center;
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow-wrap: break-word;
    }
    .ico {
      display: grid;
      place-items: center;
      inline-size: 72px;
      block-size: 72px;
      border-radius: 50%;
      background: var(--brand-light);
      color: var(--brand-text);
    }
    strong {
      font-size: 1.0625rem;
      line-height: 1.4;
    }
    .muted {
      max-inline-size: 34ch;
      line-height: 1.5;
    }
  `,
})
export class EmptyState {
  readonly icon = input<IconName>('info');
  readonly title = input.required<string>();
  readonly hint = input<string>('');
}
