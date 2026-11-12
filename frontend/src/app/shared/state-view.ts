import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n, type Tr } from '../core/i18n';
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

export type EmptyKind = 'first' | 'cleared' | 'search' | 'error';

const KIND_DEFAULTS: Record<EmptyKind, { icon: IconName; title: Tr; hint: Tr }> = {
  first: { icon: 'info', title: { th: 'ยังไม่มีรายการ', en: 'Nothing here yet' }, hint: { th: '', en: '' } },
  cleared: { icon: 'info', title: { th: 'จัดการครบแล้ว', en: 'All done' }, hint: { th: 'ไม่มีรายการค้างอยู่', en: 'Nothing is waiting' } },
  search: { icon: 'info', title: { th: 'ไม่พบรายการที่ค้นหา', en: 'No matches found' }, hint: { th: 'ลองเปลี่ยนคำค้นหรือล้างตัวกรอง', en: 'Try another search or clear the filters' } },
  error: { icon: 'alert', title: { th: 'โหลดข้อมูลไม่สำเร็จ', en: 'Couldn’t load' }, hint: { th: 'ตรวจการเชื่อมต่อแล้วลองอีกครั้ง — ไม่ได้แปลว่าไม่มีข้อมูล', en: 'Check your connection and try again — this does not mean there is no data' } },
};

/**
 * สถานะ "ว่าง" กลาง 4 แบบ (ใช้ `kind` เลือก — ห้ามสลับกัน เพราะความหมายต่อผู้ใช้ต่างกัน):
 * - `first`   ว่างครั้งแรก: ยังไม่เคยมีข้อมูล (ชวนให้เริ่ม · ใส่ปุ่มผ่าน ng-content)
 * - `cleared` ว่างหลังเคลียร์: เคยมีแต่จัดการครบแล้ว (ข้อความเชิงบวก)
 * - `search`  ค้นไม่พบ: มีข้อมูลแต่ตัวกรอง/คำค้นไม่ตรง (ชวนล้างตัวกรอง)
 * - `error`   โหลดไม่ได้: หน้าตาต่างจากสามแบบข้างบนชัดเจน (กรอบ+สีเตือน · role=alert · ปุ่ม "ลองอีกครั้ง" เมื่อมี (retry))
 * `compact` ใช้ในแถวของรายการ/การ์ดที่ฝังอยู่ (ไม่มีพื้นหลังการ์ดซ้อน)
 */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty" [class.compact]="compact()" [class.error]="kind() === 'error'" [attr.role]="kind() === 'error' ? 'alert' : 'status'">
      <span class="ico" aria-hidden="true"><app-icon [name]="icon() ?? d().icon" [size]="compact() ? 24 : 30" /></span>
      <strong>{{ title() || i18n.t(d().title) }}</strong>
      @if (hint() || i18n.t(d().hint)) {
        <span class="muted small">{{ hint() || i18n.t(d().hint) }}</span>
      }
      <ng-content />
      @if (kind() === 'error') {
        <button type="button" class="btn secondary" (click)="retry.emit()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button>
      }
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
    .empty.compact {
      padding: 20px 12px;
      background: none;
      box-shadow: none;
    }
    .empty.error {
      border: 1px solid var(--line-strong, var(--line));
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
    .compact .ico {
      inline-size: 48px;
      block-size: 48px;
    }
    .error .ico {
      background: var(--danger-bg);
      color: var(--sos);
    }
    strong {
      font-size: 1.0625rem;
      line-height: 1.4;
    }
    .muted {
      max-inline-size: 34ch;
      line-height: 1.5;
    }
    .btn {
      inline-size: auto;
      margin-block-start: 4px;
    }
  `,
})
export class EmptyState {
  protected readonly i18n = inject(I18n);
  readonly kind = input<EmptyKind>('first');
  /** ไม่ใส่ = ใช้ไอคอน/ข้อความตาม kind */
  readonly icon = input<IconName | undefined>(undefined);
  readonly title = input<string>('');
  readonly hint = input<string>('');
  readonly compact = input(false, { transform: booleanAttribute });
  /** kind="error" เท่านั้น — ผู้ใช้กด "ลองอีกครั้ง" */
  readonly retry = output<void>();
  protected readonly d = computed(() => KIND_DEFAULTS[this.kind()]);
}

/**
 * สถานะ "โหลดไม่สำเร็จ" กลาง — ใช้แทนการกลืน error แล้วแสดง empty state
 * (ผู้ใช้ต้องแยกออกว่า "ไม่มีข้อมูลจริง" กับ "โหลดพัง" — กดลองใหม่ได้)
 */
@Component({
  selector: 'app-load-error',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="err card" role="alert">
      <span class="ico" aria-hidden="true"><app-icon name="alert" [size]="26" /></span>
      <strong>{{ i18n.t({ th: 'โหลดข้อมูลไม่สำเร็จ', en: 'Couldn’t load' }) }}</strong>
      <span class="muted small">{{ i18n.t({ th: 'ตรวจการเชื่อมต่อแล้วลองอีกครั้ง — ข้อมูลเดิมยังไม่ถูกแทนที่', en: 'Check your connection and try again — nothing was replaced' }) }}</span>
      <button type="button" class="btn secondary" (click)="retry.emit()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button>
    </div>
  `,
  styles: `
    .err {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      border: 1px solid var(--line-strong, var(--line));
    }
    .ico {
      display: grid;
      place-items: center;
      inline-size: 44px;
      block-size: 44px;
      border-radius: 12px;
      background: var(--danger-bg);
      color: var(--sos);
    }
    .btn {
      margin-block-start: 4px;
      inline-size: auto;
    }
  `,
})
export class LoadError {
  protected readonly i18n = inject(I18n);
  readonly retry = output<void>();
}
