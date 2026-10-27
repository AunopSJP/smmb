import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DisplaySettings, type TextSize, type Theme } from '../core/display-settings';
import { I18n, type Lang } from '../core/i18n';
import { DemoSession, type DemoRole } from '../core/mock/demo-session';
import { AREA_LABEL, SCREENS, screenUrl, type Area } from '../screens/registry';
import { Icon, type IconName } from '../shared/icon';

/** หน้าเริ่มต้นของต้นแบบ — เลือกบทบาทจำลอง + ตั้งค่าการแสดงผล (ยังไม่มีล็อกอินจริง) */
@Component({
  selector: 'app-demo-start',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <header>
        <h1>Smart Mailbox</h1>
        <p class="muted">
          {{ i18n.t({ th: 'ต้นแบบหน้าจอ · ใช้ข้อมูลจำลอง ยังไม่เชื่อมเซิร์ฟเวอร์', en: 'Screen prototype · sample data, no server yet' }) }}
        </p>
      </header>

      <h2 class="section-title">{{ i18n.t({ th: 'ดูในฐานะ', en: 'View as' }) }}</h2>
      <nav class="list">
        @for (a of areas; track a.area) {
          <button class="row" type="button" (click)="open(a.area)">
            <span class="icon-bubble"><app-icon [name]="a.icon" [size]="22" /></span>
            <span class="grow">
              <strong>{{ i18n.t(label(a.area)) }}</strong>
              <span class="muted small block">{{ count(a.area) }} {{ i18n.t({ th: 'หน้า', en: 'screens' }) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="18" />
          </button>
        }
      </nav>

      <h2 class="section-title">{{ i18n.t({ th: 'การแสดงผล', en: 'Display' }) }}</h2>
      <section class="card stack">
        <label class="field">
          <span>{{ i18n.t({ th: 'ภาษา', en: 'Language' }) }}</span>
          <select [value]="display.lang()" (change)="display.lang.set($any($event.target).value)">
            @for (o of langs; track o.v) {
              <option [value]="o.v">{{ o.label }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>{{ i18n.t({ th: 'ธีม', en: 'Theme' }) }}</span>
          <select [value]="display.theme()" (change)="display.theme.set($any($event.target).value)">
            @for (o of themes; track o.v) {
              <option [value]="o.v">{{ i18n.t(o.label) }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>{{ i18n.t({ th: 'ขนาดตัวอักษร', en: 'Text size' }) }}</span>
          <select [value]="display.textSize()" (change)="display.textSize.set($any($event.target).value)">
            @for (o of sizes; track o.v) {
              <option [value]="o.v">{{ i18n.t(o.label) }}</option>
            }
          </select>
        </label>
      </section>
    </main>
  `,
  styles: `
    main {
      max-width: 480px;
      margin: 0 auto;
      padding: 24px 16px 40px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    h1 {
      color: var(--brand);
      font-size: 1.75rem;
    }
    button.row {
      width: 100%;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .grow {
      flex: 1;
    }
    .block {
      display: block;
    }
    .field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    select {
      font: inherit;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--bg);
      color: var(--text);
      min-height: 44px;
    }
  `,
})
export class DemoStart {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  private readonly session = inject(DemoSession);
  private readonly router = inject(Router);

  protected readonly areas: { area: Area; icon: IconName }[] = [
    { area: 'owner', icon: 'home' },
    { area: 'officer', icon: 'shield' },
    { area: 'head', icon: 'user' },
    { area: 'admin', icon: 'settings' },
    { area: 'rider', icon: 'box' },
    { area: 'auth', icon: 'layers' },
  ];
  protected readonly langs: { v: Lang; label: string }[] = [
    { v: 'th', label: 'ไทย' },
    { v: 'en', label: 'English' },
  ];
  protected readonly themes: { v: Theme; label: { th: string; en: string } }[] = [
    { v: 'system', label: { th: 'ตามเครื่อง', en: 'System' } },
    { v: 'light', label: { th: 'สว่าง', en: 'Light' } },
    { v: 'dark', label: { th: 'มืด', en: 'Dark' } },
  ];
  protected readonly sizes: { v: TextSize; label: { th: string; en: string } }[] = [
    { v: 'normal', label: { th: 'ปกติ', en: 'Normal' } },
    { v: 'large', label: { th: 'ใหญ่', en: 'Large' } },
    { v: 'xlarge', label: { th: 'ใหญ่มาก', en: 'Extra large' } },
  ];

  protected label(a: Area) {
    return AREA_LABEL[a];
  }

  protected count(a: Area): number {
    return SCREENS.filter((s) => s.area === a).length;
  }

  protected open(area: Area): void {
    if (area === 'owner' || area === 'officer' || area === 'head' || area === 'admin') {
      this.session.useDefault(area as DemoRole);
    }
    // ล็อกอิน/สมัคร เริ่มที่หน้าเข้าสู่ระบบ (A01–A03 เป็นหน้าก่อนล็อกอินที่ขึ้นตามเครื่อง)
    const start = area === 'auth' ? 'A04' : SCREENS.find((s) => s.area === area)!.code;
    void this.router.navigateByUrl(screenUrl(start));
  }
}
