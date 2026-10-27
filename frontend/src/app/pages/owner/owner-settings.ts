import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DisplaySettings, type TextSize, type Theme } from '../../core/display-settings';
import { I18n, type Lang, type Tr } from '../../core/i18n';
import { MOCK_BOX_SETTINGS, MOCK_OWNER } from '../../core/mock/mock-data';
import { PlanDemo, showDate } from '../../core/mock/plan-demo';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { AccountActions } from '../auth/auth-account';

// ── H13 · ตั้งค่าตู้ ───────────────────────────────────────────

@Component({
  selector: 'app-owner-settings',
  imports: [RouterLink, PageHeader, Icon, AccountActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + house"
      [title]="i18n.t({ th: 'ตั้งค่าตู้', en: 'Mailbox settings' })"
      [bell]="url('H14')"
    />
    <div class="stack grow">
      <section class="card">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'ชื่อตู้', en: 'Name' }) }}</dt><dd>{{ box.name }}</dd>
          <dt>{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt><dd>{{ box.id }}</dd>
          <dt>{{ i18n.t({ th: 'แบต', en: 'Battery' }) }}</dt>
          <dd>{{ box.battery_pct }}%{{ box.charging ? i18n.t({ th: ' · ชาร์จอยู่', en: ' · charging' }) : '' }}</dd>
          <dt>Wi-Fi</dt><dd>{{ box.wifi }}</dd>
          @if (plan(); as p) {
            <dt>{{ i18n.t({ th: 'แพ็กเกจ', en: 'Plan' }) }}</dt>
            <dd>
              {{ p.name }}
              <span class="muted small block" [class.warn-text]="p.status !== 'active'">{{ p.until }}</span>
            </dd>
          }
        </dl>
      </section>

      <nav class="list">
        @for (m of menu; track m.code) {
          <a class="row" [routerLink]="url(m.code)">
            <span class="icon-bubble"><app-icon [name]="m.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(m.title) }}</strong>
              <span class="muted small block">{{ i18n.t(m.sub) }}</span>
            </span>
            @if (m.badge) {
              <span class="chip ok">{{ i18n.t(m.badge) }}</span>
            } @else {
              <app-icon name="chevronRight" [size]="18" />
            }
          </a>
        }
      </nav>

      <app-account-actions current="owner" from="H13" />

      <a class="btn secondary signout" [routerLink]="url('A04')">
        {{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}
      </a>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .signout {
      margin-top: auto;
      color: var(--brand);
      box-shadow: inset 0 0 0 1.5px var(--line);
    }
  `,
})
export class OwnerSettings {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly house = MOCK_OWNER.house_no;
  protected readonly box = MOCK_BOX_SETTINGS;
  private readonly plans = inject(PlanDemo);
  /** GET /me/plan — แพ็กผูกกับบัญชีเจ้าของบ้าน (ต้นแบบ = บัญชี U-0001) · SOS/ตรวจตู้ไม่ขึ้นกับแพ็ก */
  protected readonly plan = computed(() => {
    const id = 'U-0001';
    const cur = this.plans.current(id);
    const p = cur ? this.plans.plan(cur.plan_code) : undefined;
    if (!cur || !p) return null;
    const status = this.plans.status(id);
    const lang = this.i18n.lang();
    const until = cur.ends_at
      ? this.i18n.t({ th: 'ใช้ได้ถึง ', en: 'until ' }) + showDate(cur.ends_at, lang)
      : this.i18n.t({ th: 'ไม่มีวันหมดอายุ', en: 'No end date' });
    return { name: this.i18n.t(p.name) + (p.price_note ? ' · ' + this.i18n.t(p.price_note) : ''), until, status };
  });
  protected readonly menu: { code: string; icon: IconName; title: Tr; sub: Tr; badge?: Tr }[] = [
    { code: 'H13-b', icon: 'layers', title: { th: 'เปลี่ยน Wi-Fi บ้าน', en: 'Change home Wi-Fi' }, sub: { th: 'ทำเองได้ ใช้เวลาราว 5 นาที', en: 'Do it yourself, about 5 minutes' } },
    { code: 'H13-c', icon: 'user', title: { th: 'แจ้งช่าง', en: 'Request a technician' }, sub: { th: 'ให้ช่างนัดมาตั้งค่า / ซ่อม', en: 'A technician will set up or repair' } },
    { code: 'H14', icon: 'bell', title: { th: 'การแจ้งเตือน', en: 'Notifications' }, sub: { th: 'เปิดอยู่', en: 'On' }, badge: { th: 'เปิด', en: 'On' } },
    { code: 'H13-d', icon: 'settings', title: { th: 'การแสดงผล', en: 'Display' }, sub: { th: 'ธีม · ภาษา · ขนาดตัวอักษร', en: 'Theme · language · text size' } },
    { code: 'H15', icon: 'user', title: { th: 'สมาชิกในบ้าน (ข้อเสนอ)', en: 'Family members (proposal)' }, sub: { th: 'ให้คนในบ้านรับแจ้งเตือน / กด SOS', en: 'Let family get alerts / press SOS' } },
  ];
}

// ── H13-b · เปลี่ยน Wi-Fi บ้าน ─────────────────────────────────

@Component({
  selector: 'app-owner-wifi',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ตั้งค่า', en: 'Settings' })" [title]="i18n.t({ th: 'เปลี่ยน Wi-Fi บ้าน', en: 'Change home Wi-Fi' })" [back]="url('H13')" />
    <div class="stack grow">
      <ol class="card steps">
        @for (s of steps; track $index; let i = $index) {
          <li [class.done]="i < step()" [class.now]="i === step()">
            <button type="button" class="num" (click)="step.set(i)" [attr.aria-label]="i18n.t({ th: 'ขั้นที่ ', en: 'Step ' }) + (i + 1)">
              @if (i < step()) {
                <app-icon name="check" [size]="16" />
              } @else {
                {{ i + 1 }}
              }
            </button>
            <span>
              <strong>{{ i18n.t(s.title) }}</strong>
              <small>{{ i18n.t(s.sub) }}</small>
            </span>
          </li>
        }
      </ol>
      <div class="actions">
        @if (step() < steps.length - 1) {
          <button type="button" class="btn" (click)="step.set(step() + 1)">{{ i18n.t({ th: 'ทำขั้นนี้แล้ว', en: 'Done with this step' }) }}</button>
        } @else {
          <a class="btn" [routerLink]="url('H13')">{{ i18n.t({ th: 'เสร็จแล้ว', en: 'Finished' }) }}</a>
        }
        <a class="btn secondary" [routerLink]="url('H13-c')">{{ i18n.t({ th: 'แจ้งช่างแทน', en: 'Ask a technician instead' }) }}</a>
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .steps {
      list-style: none;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
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
      small {
        color: var(--text-muted);
      }
    }
    .num {
      display: grid;
      place-items: center;
      flex: none;
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 50%;
      border: 1.5px solid currentColor;
      background: none;
      color: inherit;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
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
    .actions {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  `,
})
export class OwnerWifi {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly step = signal(0);
  protected readonly steps: { title: Tr; sub: Tr }[] = [
    { title: { th: 'เปิดฝาตู้', en: 'Open the box lid' }, sub: { th: 'ปุ่ม Boot อยู่บนบอร์ด', en: 'The Boot button is on the board' } },
    { title: { th: 'กดปุ่ม Boot ค้าง 5 วินาที', en: 'Hold Boot for 5 seconds' }, sub: { th: 'ไฟฟ้ากะพริบ = เข้าโหมดตั้งค่า', en: 'Blue light blinks = setup mode' } },
    { title: { th: 'มือถือต่อ Wi-Fi ชื่อ MAILBOX-3F9A', en: 'Join Wi-Fi “MAILBOX-3F9A”' }, sub: { th: 'หน้าตั้งค่าจะเด้งขึ้นมา', en: 'The setup page will pop up' } },
    { title: { th: 'เลือก Wi-Fi บ้าน (2.4 GHz) + ใส่รหัส', en: 'Pick home Wi-Fi (2.4 GHz) + password' }, sub: { th: 'ไม่เด้ง: เปิดเว็บ 192.168.4.1', en: 'No pop-up? Open 192.168.4.1' } },
    { title: { th: 'ดูไฟที่ตู้', en: 'Check the box light' }, sub: { th: 'เขียว = เสร็จ · แดง = ลองขั้น 4 ใหม่', en: 'Green = done · red = retry step 4' } },
  ];
}

// ── H13-c · แจ้งช่างแล้ว ──────────────────────────────────────

@Component({
  selector: 'app-owner-technician',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack page">
      <span class="check"><app-icon name="check" [size]="30" /></span>
      <h1 class="center">{{ i18n.t({ th: 'แจ้งช่างแล้ว', en: 'Technician requested' }) }}</h1>
      <p class="muted center">{{ i18n.t({ th: 'ช่างจะโทรนัดภายใน 1 วันทำการ', en: 'A technician will call within 1 business day' }) }}</p>
      <section class="card">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'เรื่อง', en: 'Subject' }) }}</dt><dd>{{ i18n.t({ th: 'เปลี่ยน Wi-Fi / ตู้ไม่ออนไลน์', en: 'Wi-Fi change / box offline' }) }}</dd>
          <dt>{{ i18n.t({ th: 'ส่งเมื่อ', en: 'Sent' }) }}</dt><dd>{{ i18n.t({ th: '26 ต.ค. 14:20', en: '26 Oct 14:20' }) }}</dd>
          <dt>{{ i18n.t({ th: 'เบอร์ติดต่อกลับ', en: 'Call-back number' }) }}</dt><dd>{{ phone }}</dd>
        </dl>
      </section>
      <a class="btn end" [routerLink]="url('H03')">{{ i18n.t({ th: 'กลับหน้าหลัก', en: 'Back to home' }) }}</a>
    </div>
  `,
  styles: `
    .page {
      flex: 1;
    }
    .check {
      align-self: center;
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      margin-top: 32px;
      border-radius: 50%;
      background: var(--ok-bg);
      color: var(--ok);
    }
    h1 {
      font-size: 1.375rem;
    }
    .center {
      text-align: center;
    }
    .end {
      margin-top: auto;
    }
  `,
})
export class OwnerTechnician {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly phone = MOCK_BOX_SETTINGS.callback_phone;
}

// ── H13-d · การแสดงผล ─────────────────────────────────────────

@Component({
  selector: 'app-owner-display',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="officer ? i18n.t({ th: 'บัญชี', en: 'Account' }) : i18n.t({ th: 'ตั้งค่า', en: 'Settings' })"
      [title]="i18n.t({ th: 'การแสดงผล', en: 'Display' })"
      [back]="url(officer ? 'O13' : 'H13')"
    />
    <div class="stack">
      <section class="card stack">
        <h2 class="head"><app-icon name="target" [size]="20" />{{ i18n.t({ th: 'ธีม', en: 'Theme' }) }}</h2>
        <div class="segmented" role="group">
          @for (o of themes; track o.v) {
            <button type="button" [attr.aria-pressed]="display.theme() === o.v" (click)="display.theme.set(o.v)">{{ i18n.t(o.label) }}</button>
          }
        </div>
      </section>

      <section class="card stack">
        <h2 class="head"><app-icon name="layers" [size]="20" />{{ i18n.t({ th: 'ภาษา', en: 'Language' }) }}</h2>
        <div class="segmented" role="group">
          @for (o of langs; track o.v) {
            <button type="button" [attr.aria-pressed]="display.lang() === o.v" (click)="display.lang.set(o.v)" [attr.lang]="o.v">{{ o.label }}</button>
          }
        </div>
      </section>

      <section class="card stack">
        <h2 class="head"><span class="t" aria-hidden="true">T</span>{{ i18n.t({ th: 'ขนาดตัวอักษร', en: 'Text size' }) }}</h2>
        <div class="segmented" role="group">
          @for (o of sizes; track o.v) {
            <button type="button" [attr.aria-pressed]="display.textSize() === o.v" (click)="display.textSize.set(o.v)">{{ i18n.t(o.label) }}</button>
          }
        </div>
        <div class="preview">
          <p class="muted small">{{ i18n.t({ th: 'ตัวอย่าง', en: 'Preview' }) }}</p>
          <p class="sample">{{ i18n.t({ th: 'ตู้ออนไลน์ ปกติดี', en: 'Online · all good' }) }}</p>
        </div>
      </section>

      @if (officer) {
        <!-- O13-b: เจ้าหน้าที่ตรวจตอนกลางคืน -->
        <label class="card toggle">
          <span>
            <strong>{{ i18n.t({ th: 'ธีมมืดอัตโนมัติตอนตรวจกลางคืน', en: 'Auto dark theme for night patrols' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: '18:00–06:00 · ไม่แสบตา ประหยัดแบต', en: '18:00–06:00 · easier on the eyes, saves battery' }) }}</span>
          </span>
          <input type="checkbox" class="switch" role="switch" [checked]="display.nightAutoDark()" (change)="display.nightAutoDark.set($any($event.target).checked)" />
        </label>
        @if (display.nightActive()) {
          <p class="muted small">{{ i18n.t({ th: 'ตอนนี้กลางคืน จึงใช้ธีมมืดอยู่', en: 'It’s night now, so the dark theme is on' }) }}</p>
        }
      } @else {
        <label class="card toggle">
          <span>
            <strong>{{ i18n.t({ th: 'หน้าหลักแบบเรียบง่าย', en: 'Simple home screen' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'เหลือแค่สถานะตู้ เหตุการณ์ล่าสุด และปุ่ม SOS', en: 'Only mailbox status, latest event and the SOS button' }) }}</span>
          </span>
          <input type="checkbox" class="switch" role="switch" [checked]="display.simpleHome()" (change)="display.simpleHome.set($any($event.target).checked)" />
        </label>
      }
    </div>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
    }
    .t {
      width: 20px;
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
      gap: 12px;
      cursor: pointer;
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
  protected readonly officer = inject(ActivatedRoute).snapshot.data['code'] === 'O13-b';
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
}
