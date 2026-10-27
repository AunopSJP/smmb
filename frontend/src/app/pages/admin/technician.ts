import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { AdminDemo } from '../../core/mock/admin-demo';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { Steps, type Step } from '../../shared/steps';

// ช่างติดตั้งตู้ — ใช้บัญชีแอดมิน (api.md §10) · ขั้นตอนตาม SMMB_ขั้นตอนการใช้งานแต่ละคน.md "ช่าง : ติดตั้งตู้"
// ยังไม่มี API ของช่าง — หน้านี้เป็นเช็กลิสต์ + ดูสถานะตู้ (ของจริงอ่านจาก GET /admin/boxes/:box_id)

const DEFAULT_BOX = 'BX-00071';

const INSTALL_STEPS: Step[] = [
  { title: { th: 'ติดตู้ + แผงโซลาร์', en: 'Mount the box + solar panel' }, sub: { th: 'รับแดด ไม่มีเงาบัง · ติด QR หน้าตู้ · เก็บ QR สำรอง + QR เปิดใช้ตู้ไว้ในตู้', en: 'Full sun, no shade · front QR outside · backup + activation QR inside' } },
  { title: { th: 'ตั้ง Wi-Fi (2.4 GHz)', en: 'Set up Wi-Fi (2.4 GHz)' }, sub: { th: 'ต่อ Wi-Fi ของตู้ แล้วเปิด 192.168.4.1 ตั้งค่า', en: 'Join the box Wi-Fi, then open 192.168.4.1' } },
  { title: { th: 'ไฟที่ตู้เป็นสีเขียว', en: 'Box light is green' }, sub: { th: 'ไฟแดง = กลับไปข้อ 2', en: 'Red = back to step 2' } },
  { title: { th: 'ทดสอบสแกน QR หน้าตู้ และ QR สำรอง', en: 'Test-scan the front and backup QR' }, sub: { th: 'ตู้ตื่น + กล้องเปิด', en: 'Box wakes + camera turns on' } },
  { title: { th: 'ส่งต่อเจ้าของบ้าน', en: 'Hand over to the owner' }, sub: { th: 'สมัคร + ผูกตู้ต่อหน้าช่าง', en: 'They sign up + bind the box with you there' } },
];

// ── T01 · เช็กลิสต์ติดตั้ง ───────────────────────────────────

@Component({
  selector: 'app-tech-checklist',
  imports: [RouterLink, PageHeader, Steps],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ช่าง · ', en: 'Technician · ' }) + boxId()" [title]="i18n.t({ th: 'ติดตั้งตู้ใหม่', en: 'Install a mailbox' })" [back]="url('D01')" />
    <div class="stack grow">
      <app-steps [steps]="steps" [current]="step()" />

      @if (step() >= 3) {
        <p class="status ok">{{ i18n.t({ th: 'ออนไลน์ · แบต 76% กำลังชาร์จ', en: 'Online · battery 76% charging' }) }}</p>
      } @else {
        <p class="status">{{ i18n.t({ th: 'ตู้ยังไม่ออนไลน์', en: 'The box is not online yet' }) }}</p>
      }

      <div class="stack push-end">
        @switch (step()) {
          @case (0) {
            <button type="button" class="btn" (click)="demo.installStep.set(1)">{{ i18n.t({ th: 'ติดตั้งเสร็จแล้ว', en: 'Mounted' }) }}</button>
          }
          @case (1) {
            <p class="muted small center">
              {{ i18n.t({ th: 'มือถือต่อ Wi-Fi ชื่อ ', en: 'Join the Wi-Fi named ' }) }}<strong>{{ ap() }}</strong>
              {{ i18n.t({ th: ' — หน้าตั้งค่าเด้งขึ้นเอง · ไม่เด้ง: ปิดเน็ตมือถือแล้วเปิด 192.168.4.1', en: ' — the setup page pops up · if not, turn off mobile data and open 192.168.4.1' }) }}
            </p>
            <a class="btn" [routerLink]="url('T02')" [queryParams]="{ id: boxId() }">{{ i18n.t({ th: 'ไปหน้าตั้ง Wi-Fi ของตู้', en: 'Open the box Wi-Fi page' }) }}</a>
          }
          @case (2) {
            <a class="btn" [routerLink]="url('T02-b')">{{ i18n.t({ th: 'ดูไฟที่ตู้', en: 'Check the box light' }) }}</a>
          }
          @case (3) {
            <div class="two">
              <button type="button" class="btn" [class.tested]="demo.qrTested().front" (click)="test('front')">
                {{ demo.qrTested().front ? '✓ ' : '' }}{{ i18n.t({ th: 'ทดสอบ QR หน้าตู้', en: 'Test front QR' }) }}
              </button>
              <button type="button" class="btn secondary" [class.tested]="demo.qrTested().backup" (click)="test('backup')">
                {{ demo.qrTested().backup ? '✓ ' : '' }}{{ i18n.t({ th: 'ทดสอบ QR สำรอง', en: 'Test backup QR' }) }}
              </button>
            </div>
            <p class="muted small center">{{ i18n.t({ th: 'ไม่ผ่าน: ย้ายจุดติดตั้ง / เพิ่มตัวขยายสัญญาณ / แจ้งทีมฮาร์ดแวร์', en: 'Fails: move the box / add a Wi-Fi extender / tell the hardware team' }) }}</p>
          }
          @case (4) {
            <p class="info-box muted">{{ i18n.t({ th: 'ให้เจ้าของบ้านสมัครในแอป แล้วสแกน QR เปิดใช้ตู้ (อยู่ในตู้) ต่อหน้าช่าง — ผูกเสร็จ ตู้จะขึ้นชื่อเจ้าของในหลังบ้าน', en: 'The owner signs up in the app and scans the activation QR (inside the box) with you there — once bound, the owner shows up in admin' }) }}</p>
            <div class="demo-tools">
              {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
              <button type="button" (click)="demo.installStep.set(5)">{{ i18n.t({ th: 'เจ้าของบ้านผูกตู้แล้ว', en: 'Owner bound the box' }) }}</button>
            </div>
          }
          @default {
            <p class="status ok center" role="status">{{ i18n.t({ th: 'ติดตั้งเสร็จ ส่งต่อเจ้าของบ้านแล้ว', en: 'Installed and handed over' }) }}</p>
            <a class="btn" [routerLink]="url('D01')">{{ i18n.t({ th: 'กลับภาพรวม', en: 'Back to overview' }) }}</a>
            <div class="demo-tools">
              {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
              <button type="button" (click)="restart()">{{ i18n.t({ th: 'เริ่มใหม่', en: 'Start over' }) }}</button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .status {
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      background: var(--icon-bg);
      color: var(--text-muted);
      font-weight: 700;
    }
    .status.ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .two .btn {
      font-size: 0.9375rem;
    }
    .btn.tested {
      background: var(--ok-bg);
      color: var(--ok);
      box-shadow: none;
    }
  `,
})
export class TechChecklist {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(AdminDemo);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly steps = INSTALL_STEPS;
  readonly id = input<string>();
  protected readonly boxId = computed(() => this.id() ?? DEFAULT_BOX);
  /** ชื่อ Wi-Fi ที่ตู้ปล่อยตอนตั้งค่า (MAILBOX-xxxx) */
  protected readonly ap = computed(() => this.demo.box(this.boxId())?.ap ?? 'MAILBOX');
  protected readonly step = this.demo.installStep;

  /** ทดสอบสแกน — ตู้ตื่น กล้องเปิด (ยังไม่มี API: api.md §10 สงวนไว้) */
  protected test(which: 'front' | 'backup'): void {
    this.demo.qrTested.update((t) => ({ ...t, [which]: true }));
    this.toast.show(
      which === 'front'
        ? { th: 'QR หน้าตู้ผ่าน: ตู้ตื่น กล้องเปิด', en: 'Front QR OK: box woke, camera on' }
        : { th: 'QR สำรองผ่าน: ตู้ตื่น กล้องเปิด', en: 'Backup QR OK: box woke, camera on' },
    );
    const t = this.demo.qrTested();
    if (t.front && t.backup) this.demo.installStep.set(4);
  }

  protected restart(): void {
    this.demo.qrTested.set({ front: false, backup: false });
    this.demo.installStep.set(0);
  }
}

// ── T02 · หน้าตั้ง Wi-Fi ของตู้ (หน้านี้มาจากตู้ — เฟิร์มแวร์ทำ) ───────

@Component({
  selector: 'app-tech-wifi',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo-tools">
      {{ i18n.t({ th: 'ตัวอย่างหน้าที่ตู้แสดงเอง (192.168.4.1) — ทีมฮาร์ดแวร์ทำ ไม่ใช่หน้าในแอปนี้', en: 'Preview of the page served by the box (192.168.4.1) — built by the hardware team, not this app' }) }}
    </div>
    <app-page-header [caption]="'192.168.4.1 · ' + ap()" [title]="i18n.t({ th: 'ตั้ง Wi-Fi ให้ตู้', en: 'Set up box Wi-Fi' })" [back]="url('T01')" />
    <form class="stack grow" (submit)="$event.preventDefault(); connect()">
      <p class="card joined">
        <strong>{{ i18n.t({ th: 'มือถือต่อ ', en: 'Phone is on ' }) }}{{ ap() }}{{ i18n.t({ th: ' อยู่', en: '' }) }}</strong>
        <span class="small">{{ i18n.t({ th: 'หน้านี้มาจากตู้ ไม่ต้องใช้เน็ต', en: 'This page comes from the box — no internet needed' }) }}</span>
      </p>

      <fieldset class="nets">
        <legend class="section-title">{{ i18n.t({ th: 'เลือก Wi-Fi บ้าน', en: 'Pick the home Wi-Fi' }) }}</legend>
        <div class="list">
          @for (n of networks; track n.ssid) {
            <label class="row" [class.off]="!n.ok">
              <input type="radio" name="ssid" [value]="n.ssid" [disabled]="!n.ok" [checked]="ssid() === n.ssid" (change)="ssid.set(n.ssid)" />
              <span class="icon-bubble"><app-icon name="wifi" [size]="20" /></span>
              <span class="grow">
                <strong>{{ n.ssid }}</strong>
                <span class="muted small block">{{ n.band }} · {{ i18n.t(n.ok ? { th: 'สัญญาณดี', en: 'good signal' } : { th: 'ตู้ใช้ไม่ได้', en: 'not supported' }) }}</span>
              </span>
              @if (!n.ok) {
                <span class="chip">{{ i18n.t({ th: 'ใช้ไม่ได้', en: 'Not usable' }) }}</span>
              } @else if (ssid() === n.ssid) {
                <span class="chip danger">{{ i18n.t({ th: 'เลือกแล้ว', en: 'Selected' }) }}</span>
              }
            </label>
          }
        </div>
      </fieldset>

      <label class="field">
        <span>{{ i18n.t({ th: 'รหัส Wi-Fi', en: 'Wi-Fi password' }) }}</span>
        <input type="password" autocomplete="off" [value]="password()" (input)="password.set($any($event.target).value)" />
      </label>

      <button type="submit" class="btn push-end" [disabled]="!ssid() || !password()">{{ i18n.t({ th: 'เชื่อมต่อ', en: 'Connect' }) }}</button>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .row .grow {
      min-width: 0;
    }
    .block {
      display: block;
    }
    .demo-tools {
      margin-bottom: 4px;
    }
    .joined {
      display: flex;
      flex-direction: column;
      background: var(--brand-lighter);
      color: var(--brand);
      box-shadow: none;
    }
    .nets {
      border: 0;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      legend {
        float: left;
        width: 100%;
        padding: 0;
        margin: 0 4px 8px;
      }
    }
    .row {
      cursor: pointer;
      input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
    }
    .row:has(input:checked) {
      background: var(--brand-lighter);
    }
    .row:has(input:focus-visible) {
      outline: 2px solid var(--brand);
      outline-offset: -2px;
    }
    .row.off {
      cursor: default;
      opacity: 0.7;
    }
  `,
})
export class TechWifi {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AdminDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly boxId = computed(() => this.id() ?? DEFAULT_BOX);
  /** ชื่อ Wi-Fi ที่ตู้ปล่อยตอนตั้งค่า (MAILBOX-xxxx) */
  protected readonly ap = computed(() => this.demo.box(this.boxId())?.ap ?? 'MAILBOX');
  protected readonly networks = [
    { ssid: 'บ้านสมศรี_2.4G', band: '2.4 GHz', ok: true },
    { ssid: 'บ้านสมศรี_5G', band: '5 GHz', ok: false },
  ];
  protected readonly ssid = signal<string | null>('บ้านสมศรี_2.4G');
  protected readonly password = signal('');

  protected connect(): void {
    if (!this.ssid() || !this.password()) return;
    if (this.demo.installStep() < 2) this.demo.installStep.set(2);
    void this.router.navigateByUrl(screenUrl('T02-b'));
  }
}

// ── T02-b · ดูไฟที่ตู้ ──────────────────────────────────────

@Component({
  selector: 'app-tech-lights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="stack grow">
      <div class="result">
        <span class="big-icon danger"><app-icon name="wifi" [size]="34" /></span>
        <h1>{{ i18n.t({ th: 'ดูไฟที่ตู้', en: 'Check the box light' }) }}</h1>
        <p class="muted">{{ i18n.t({ th: 'รอประมาณ 30 วินาที แล้วเลือกสีที่เห็น', en: 'Wait about 30 seconds, then pick the colour you see' }) }}</p>
      </div>
      <div class="stack push-end">
        <button type="button" class="btn big green two-line" (click)="green()">
          {{ i18n.t({ th: 'ไฟเขียว', en: 'Green light' }) }}
          <small>{{ i18n.t({ th: 'ต่อเน็ตได้ ไปทดสอบต่อ', en: 'Online — go test' }) }}</small>
        </button>
        <button type="button" class="btn big red two-line" (click)="red()">
          {{ i18n.t({ th: 'ไฟแดง', en: 'Red light' }) }}
          <small>{{ i18n.t({ th: 'ต่อไม่ได้', en: 'Could not connect' }) }}</small>
        </button>
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .two-line {
      flex-direction: column;
      gap: 0;
      small {
        font-size: 0.8125rem;
        font-weight: 400;
      }
    }
    .red {
      background: var(--sos);
    }
  `,
})
export class TechLights {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AdminDemo);
  private readonly router = inject(Router);

  protected green(): void {
    if (this.demo.installStep() < 3) this.demo.installStep.set(3);
    void this.router.navigateByUrl(screenUrl('T01'));
  }

  protected red(): void {
    void this.router.navigateByUrl(screenUrl('T02-c'));
  }
}

// ── T02-c · ตู้ต่อ Wi-Fi ไม่ได้ ──────────────────────────────

@Component({
  selector: 'app-tech-wifi-failed',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack grow">
      <div class="result">
        <span class="big-icon danger" aria-hidden="true">!</span>
        <h1>{{ i18n.t({ th: 'ตู้ต่อ Wi-Fi ไม่ได้', en: 'The box could not join Wi-Fi' }) }}</h1>
      </div>
      <div class="info-box">
        <strong>{{ i18n.t({ th: 'เช็กทีละข้อ', en: 'Check one by one' }) }}</strong>
        <ol>
          <li>{{ i18n.t({ th: 'รหัส Wi-Fi ถูกไหม (ตัวพิมพ์เล็ก/ใหญ่)', en: 'Is the password right? (upper/lower case)' }) }}</li>
          <li>{{ i18n.t({ th: 'เป็น Wi-Fi 2.4 GHz ไหม (5 GHz ใช้ไม่ได้)', en: 'Is it 2.4 GHz Wi-Fi? (5 GHz will not work)' }) }}</li>
          <li>{{ i18n.t({ th: 'สัญญาณถึงตู้ไหม: ย้ายจุดติดตั้ง หรือเพิ่มตัวขยายสัญญาณ', en: 'Does the signal reach? Move the box or add an extender' }) }}</li>
          <li>{{ i18n.t({ th: 'ยังไม่ได้: แจ้งทีมฮาร์ดแวร์', en: 'Still failing: tell the hardware team' }) }}</li>
        </ol>
      </div>
      <p class="muted small center">{{ i18n.t({ th: 'ต่อไม่ได้ ตู้จะกลับเข้าโหมดตั้งค่าเอง — ต่อ Wi-Fi ของตู้ใหม่อีกครั้ง', en: 'After a failure the box goes back to setup mode — join its Wi-Fi again' }) }}</p>
      <div class="stack push-end">
        <a class="btn" [routerLink]="url('T02')">{{ i18n.t({ th: 'ลองตั้งใหม่', en: 'Try again' }) }}</a>
        <a class="btn secondary" [routerLink]="url('T01')">{{ i18n.t({ th: 'กลับเช็กลิสต์', en: 'Back to checklist' }) }}</a>
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    ol {
      margin: 6px 0 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `,
})
export class TechWifiFailed {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
}
