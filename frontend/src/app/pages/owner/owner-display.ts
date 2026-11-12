import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Session } from '../../core/session';
import { DisplaySettings, type TextSize, type Theme, type UiMode } from '../../core/display-settings';
import { I18n, type Lang, type Tr } from '../../core/i18n';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-owner-display',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.shared-page]': 'shared',
    // เปิดนอก AreaShell (/settings/display) ต้องมี landmark main เอง — ใน AreaShell มี <main> อยู่แล้ว
    '[attr.role]': 'shared ? "main" : null',
    '[attr.id]': 'shared ? "main-content" : null',
    '[attr.tabindex]': 'shared ? "-1" : null',
  },
  template: `
    <app-page-header [title]="i18n.t({ th: 'แบบการใช้งาน', en: 'How you use the app' })" [back]="backUrl()" />
    <div class="stack">
      <p class="muted easy-hide">{{ i18n.t({ th: 'เลือกแบบที่อ่านง่ายที่สุดสำหรับคุณ เปลี่ยนได้ทุกเมื่อ ข้อมูลและความปลอดภัยเหมือนเดิมทุกแบบ', en: 'Pick the layout that is easiest for you. You can change it anytime — your data and safety stay the same.' }) }}</p>
      <p class="muted easy-only">{{ i18n.t({ th: 'ให้แอปเป็นแบบไหน เลือกแบบที่อ่านง่ายที่สุดสำหรับคุณ', en: 'How should the app look? Pick what is easiest to read.' }) }}</p>

      <div class="modes" role="radiogroup" [attr.aria-label]="i18n.t({ th: 'โหมดการแสดงผล', en: 'Display mode' })">
        @for (m of modeOptions; track m.value) {
          <button type="button" role="radio" class="mode" [class.on]="display.mode() === m.value" [attr.aria-checked]="display.mode() === m.value" (click)="display.setMode(m.value)">
            <span class="thumb" [attr.data-m]="m.value" aria-hidden="true"><i class="g"></i><i></i><i></i><i></i><i></i><i class="r"></i></span>
            <span class="mtxt">
              <strong>{{ i18n.t(m.label) }}@if (display.mode() === m.value) {<span class="tick" aria-hidden="true"><app-icon name="check" [size]="14" /></span>}</strong>
              <span class="muted small block easy-hide">{{ i18n.t(m.hint) }}</span>
              <span class="muted small block easy-only">{{ i18n.t(m.short) }}</span>
            </span>
          </button>
        }
      </div>

      <!-- ภาษาเห็นทุกโหมด: โหมดง่ายซ่อนเฉพาะตัวเลือกการแสดงผล แต่ผู้ใช้ที่อ่านไทยไม่ได้ต้องเปลี่ยนภาษาได้ -->
      <section class="card stack">
        <span class="lbl">{{ i18n.t({ th: 'ภาษา', en: 'Language' }) }}</span>
        <div class="segmented" role="group" [attr.aria-label]="i18n.t({ th: 'ภาษา', en: 'Language' })">
          @for (o of langs; track o.v) {
            <button type="button" [attr.aria-pressed]="display.lang() === o.v" (click)="display.lang.set(o.v)" [attr.lang]="o.v">{{ o.label }}</button>
          }
        </div>
      </section>

      <section class="card stack easy-hide">
        <span class="lbl">{{ i18n.t({ th: 'ขนาดตัวอักษร', en: 'Text size' }) }}</span>
        <div class="segmented" role="group" [attr.aria-label]="i18n.t({ th: 'ขนาดตัวอักษร', en: 'Text size' })">
          @for (o of sizes; track o.v) {
            <button type="button" [attr.aria-pressed]="display.textSize() === o.v" (click)="display.textSize.set(o.v)">{{ i18n.t(o.label) }}</button>
          }
        </div>
        <span class="muted small">{{ i18n.t({ th: 'ขนาดตัวอักษรถูกจำกัดตามชนิดจอ (มือถือ / แท็บเล็ต / คอม) เพื่อให้อ่านสบายและไม่ล้น', en: 'Text size is capped per screen type (phone / tablet / desktop) so it stays readable and never overflows.' }) }}</span>
        <span class="lbl">{{ i18n.t({ th: 'ธีม', en: 'Theme' }) }}</span>
        <div class="segmented" role="group" [attr.aria-label]="i18n.t({ th: 'ธีม', en: 'Theme' })">
          @for (o of themes; track o.v) {
            <button type="button" [attr.aria-pressed]="display.theme() === o.v" (click)="display.theme.set(o.v)">{{ i18n.t(o.label) }}</button>
          }
        </div>
      </section>

      @if (officer()) {
        <!-- O13-b: เจ้าหน้าที่ตรวจตอนกลางคืน -->
        <label class="card toggle easy-hide">
          <span>
            <strong>{{ i18n.t({ th: 'ธีมมืดอัตโนมัติตอนตรวจกลางคืน', en: 'Auto dark theme for night patrols' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: '18:00–06:00 · ถนอมสายตา ประหยัดแบตเตอรี่', en: '18:00–06:00 · easier on the eyes, saves battery' }) }}</span>
          </span>
          <input type="checkbox" class="switch" role="switch" [checked]="display.nightAutoDark()" (change)="display.nightAutoDark.set($any($event.target).checked)" />
        </label>
        @if (display.nightActive()) {
          <p class="muted small">{{ i18n.t({ th: 'ตอนนี้กลางคืน จึงใช้ธีมมืดอยู่', en: 'It’s night now, so the dark theme is on' }) }}</p>
        }
      }


      <p class="muted small center">{{ i18n.t({ th: 'บันทึกอัตโนมัติ — เปลี่ยนแล้วมีผลทันที', en: 'Saved automatically — changes apply right away' }) }}</p>
    </div>
  `,
  styles: `
    :host(.shared-page) {
      display: block;
      padding: 16px 16px calc(20px + env(safe-area-inset-bottom));
      max-inline-size: 720px;
      margin-inline: auto;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
    }
    .lbl {
      font-size: 0.8125rem;
      color: var(--text-muted);
    }
    .modes {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .mode {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      inline-size: 100%;
      padding: 14px;
      border: 2px solid transparent;
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .mode.on {
      border-color: var(--brand-text);
    }
    .mtxt {
      flex: 1;
      min-inline-size: 0;
    }
    .mtxt strong {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.0625rem;
    }
    .tick {
      display: inline-grid;
      place-items: center;
      inline-size: 22px;
      block-size: 22px;
      border-radius: 50%;
      background: var(--action-bg);
      color: var(--action-fg);
    }
    .thumb {
      display: flex;
      flex-direction: column;
      gap: 5px;
      flex: none;
      inline-size: 64px;
      padding: 8px;
      border-radius: 12px;
      background: var(--bg);
      border: 1px solid var(--line);
      i {
        display: block;
        block-size: 8px;
        border-radius: 3px;
        background: var(--line-strong);
      }
      i.g {
        block-size: 16px;
        background: var(--ok);
      }
      i.r {
        margin-block-start: auto;
        background: var(--sos);
        block-size: 8px;
      }
    }
    /* ง่าย: ก้อนใหญ่น้อยชิ้น · ปกติ: กลาง · ละเอียด: บางหลายแถว */
    .thumb[data-m='easy'] {
      i:nth-child(n + 4):not(.r) {
        display: none;
      }
      i.r {
        block-size: 20px;
      }
    }
    .thumb[data-m='default'] i:nth-child(5):not(.r) {
      display: none;
    }
    .thumb[data-m='advanced'] i:not(.g):not(.r) {
      block-size: 5px;
    }
    .t {
      inline-size: 20px;
      text-align: center;
      font-weight: 700;
    }
    .preview {
      background: var(--bg);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
    }
    .sample {
      font-weight: 700;
      font-size: 1.125rem;
      color: var(--ok);
    }
    .toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
    }
    .toggle > span {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
  `,
})
/** H13-d (เจ้าของบ้าน) และ O13-b (เจ้าหน้าที่) ใช้หน้านี้ร่วมกัน — ต่างกันที่สวิตช์ล่างสุด */
export class OwnerDisplay {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  protected readonly url = screenUrl;
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(Session);
  /** เปิดจากเมนูกลาง /settings/display (ทุกบทบาท) — ไม่ใช่ H13-d/O13-b ของเจ้าของ/เจ้าหน้าที่ */
  protected readonly shared = this.route.snapshot.data['shared'] === true;
  protected readonly officer = computed(
    () =>
      this.route.snapshot.data['code'] === 'O13-b' ||
      (this.shared && (this.session.me()?.roles ?? []).some((r) => r === 'officer' || r === 'head')),
  );
  protected readonly backUrl = computed(() => {
    if (!this.shared) return screenUrl(this.officer() ? 'O13' : 'H13');
    const roles = this.session.me()?.roles ?? [];
    if (roles.includes('admin')) return screenUrl('D16');
    if (roles.includes('head')) return screenUrl('L11');
    if (roles.includes('officer')) return screenUrl('O13');
    return screenUrl('H13');
  });
  protected readonly themes: { v: Theme; label: Tr }[] = [
    { v: 'light', label: { th: 'สว่าง', en: 'Light' } },
    { v: 'dark', label: { th: 'มืด', en: 'Dark' } },
    { v: 'system', label: { th: 'ตามเครื่อง', en: 'System' } },
  ];
  protected readonly langs: { v: Lang; label: string }[] = [
    { v: 'th', label: 'ไทย' },
    { v: 'en', label: 'English' },
  ];
  protected readonly sizes: { v: TextSize; label: Tr }[] = [
    { v: 'normal', label: { th: 'ปกติ', en: 'Normal' } },
    { v: 'large', label: { th: 'ใหญ่', en: 'Large' } },
    { v: 'xlarge', label: { th: 'ใหญ่มาก', en: 'Extra large' } },
  ];

  /** แจ้งเตือนที่ปิดรับได้ ตามบทบาทของหน้านี้ (type ต้องตรงกับ MUTABLE_NOTIFICATION_TYPES ของ backend) */
  protected readonly modeOptions: { value: UiMode; label: Tr; hint: Tr; short: Tr }[] = [
    { value: 'easy', label: { th: 'โหมดง่าย', en: 'Easy' }, hint: { th: 'ตัวใหญ่ ปุ่มใหญ่ เห็นเฉพาะสิ่งที่จำเป็นจริง ๆ ใช้งานไม่ยาก', en: 'Large text and buttons — only what you really need' }, short: { th: 'ตัวใหญ่ ปุ่มใหญ่', en: 'Large text, large buttons' } },
    { value: 'default', label: { th: 'โหมดปกติ', en: 'Default' }, hint: { th: 'ใช้งานทั่วไป เห็นมากกว่าโหมดง่าย แต่ไม่แสดงรายละเอียดทางเทคนิค', en: 'Everyday use — more than Easy, without technical details' }, short: { th: 'ข้อมูลพอดี', en: 'Just the right amount' } },
    { value: 'advanced', label: { th: 'โหมดละเอียด', en: 'Advanced' }, hint: { th: 'แสดงข้อมูลเพิ่มเติมที่เป็นประโยชน์ เช่น ประวัติครบและเวลาแบบละเอียด', en: 'Extra useful details, like the full history and exact times' }, short: { th: 'ข้อมูลครบขึ้น', en: 'More detail' } },
  ];
  protected readonly notifyOptions = computed<{ type: string; label: Tr; hint: Tr }[]>(() =>
    this.officer()
      ? [{ type: 'sos_taken', label: { th: 'มีเจ้าหน้าที่รับ SOS แล้ว', en: 'SOS taken by another officer' }, hint: { th: 'แจ้งเมื่อเพื่อนร่วมโซนรับเรื่องไปแล้ว', en: 'When a teammate has taken the case' } }]
      : [
          { type: 'inspected', label: { th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer inspection' }, hint: { th: 'ทุกครั้งที่ตรวจผ่านหน้าตู้', en: 'Each time the mailbox is checked' } },
          { type: 'delivered', label: { th: 'มีของมาส่ง', en: 'Parcel delivered' }, hint: { th: 'เมื่อไรเดอร์แจ้งส่งของที่ตู้', en: 'When a rider reports a drop-off' } },
          { type: 'low_battery', label: { th: 'แบตเตอรี่ตู้ใกล้หมด', en: 'Low mailbox battery' }, hint: { th: 'เตือนก่อนตู้ดับ', en: 'Warning before the box goes dark' } },
          { type: 'technician_scheduled', label: { th: 'นัดช่างแล้ว', en: 'Technician scheduled' }, hint: { th: 'วันเวลาที่ช่างจะมา', en: 'When the technician will visit' } },
          { type: 'technician_done', label: { th: 'ช่างทำงานเสร็จ', en: 'Technician finished' }, hint: { th: 'ผลการซ่อมหรือติดตั้ง', en: 'Repair or install result' } },
          { type: 'box_service_opened', label: { th: 'ตู้เปิดให้บริการอีกครั้ง', en: 'Mailbox service resumed' }, hint: { th: 'หลังหยุดให้บริการชั่วคราว', en: 'After a temporary pause' } },
          { type: 'box_service_closed', label: { th: 'ตู้หยุดให้บริการ', en: 'Mailbox service paused' }, hint: { th: 'เมื่อผู้ดูแลระบบปิดตู้ชั่วคราว', en: 'When an admin pauses the box' } },
          { type: 'plan_expiring', label: { th: 'แพ็กเกจใกล้หมดอายุ', en: 'Plan expiring' }, hint: { th: 'เตือนก่อนหมด 7 วัน', en: '7 days before it ends' } },
        ],
  );
}
