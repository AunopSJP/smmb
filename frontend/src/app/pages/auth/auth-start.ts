import { ChangeDetectionStrategy, Component, inject, input, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { AuthDemo, DEMO_PASSWORD, normalizePhone, ROLE_HOME, type DemoAccountRole } from '../../core/mock/auth-demo';
import { AdminDemo } from '../../core/mock/admin-demo';
import { DemoSession } from '../../core/mock/demo-session';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Brand } from '../../shared/brand';
import { Icon, type IconName } from '../../shared/icon';
import { PasswordField } from './auth-parts';

// เริ่มใช้งาน: A01 เปิดใน LINE → A02 ติดตั้ง (iPhone) → A03 แจ้งเตือน → A04 ล็อกอิน → A05 เลือกประเภทสมัคร
// จำลองบนหน้าจอเท่านั้น — ไม่ล็อกอินจริง ไม่สร้างบัญชีจริง

// ── A01 · เปิดใน LINE ───────────────────────────────────────

@Component({
  selector: 'app-auth-line',
  imports: [Brand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <div class="stack grow">
      <div class="result">
        <span class="big-icon warn" aria-hidden="true">!</span>
        <h1>{{ i18n.t({ th: 'เปิดในเบราว์เซอร์ก่อนนะ', en: 'Please open this in your browser' }) }}</h1>
        <p class="muted small">
          {{ i18n.t({ th: 'ถ้าเปิดใน LINE จะไม่ได้รับแจ้งเตือน', en: 'Inside LINE you will not get notifications' }) }}<br />
          {{ i18n.t({ th: 'กดปุ่มด้านล่างเพื่อเปิดใน Safari / Chrome', en: 'Tap below to open it in Safari / Chrome' }) }}
        </p>
      </div>
      <p class="info-box">
        <strong>{{ i18n.t({ th: 'ถ้าปุ่มไม่ทำงาน', en: 'If the button does nothing' }) }}</strong><br />
        <span class="muted small">{{ i18n.t({ th: 'กดจุด 3 จุดมุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์"', en: 'Tap the ⋮ menu at the top right and choose “Open in browser”' }) }}</span>
      </p>
      <div class="stack push-end">
        <!-- LINE เปิดลิงก์ที่มี openExternalBrowser=1 ในเบราว์เซอร์หลักของเครื่อง -->
        <a class="btn" [href]="external">{{ i18n.t({ th: 'เปิดใน Safari / Chrome', en: 'Open in Safari / Chrome' }) }}</a>
        <button type="button" class="btn secondary" (click)="copy()">{{ i18n.t({ th: 'คัดลอกลิงก์', en: 'Copy link' }) }}</button>
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
  `,
})
export class AuthLine {
  protected readonly i18n = inject(I18n);
  private readonly toast = inject(Toast);
  /** ไม่ฮาร์ดโค้ดโดเมน — ใช้ origin ที่เปิดอยู่ */
  protected readonly external = `${location.origin}/?openExternalBrowser=1`;

  protected copy(): void {
    void navigator.clipboard?.writeText(`${location.origin}/`).catch(() => undefined);
    this.toast.show({ th: 'คัดลอกลิงก์แล้ว — วางใน Safari / Chrome', en: 'Link copied — paste it into Safari / Chrome' });
  }
}

// ── A02 · ติดตั้งเป็นแอป (iPhone) ─────────────────────────────

@Component({
  selector: 'app-auth-install',
  imports: [Brand, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <div class="stack grow">
      <div>
        <h1>{{ i18n.t({ th: 'ติดตั้งเป็นแอป', en: 'Install the app' }) }}</h1>
        <p class="muted small">{{ i18n.t({ th: 'ทำครั้งเดียว แล้วเปิดจากไอคอนได้เลย', en: 'Do this once, then open it from the icon' }) }}</p>
      </div>
      <ol class="card how">
        <li><span><strong>{{ i18n.t({ th: 'กดปุ่มแชร์', en: 'Tap Share' }) }}</strong><small>{{ i18n.t({ th: 'อยู่ด้านล่างของ Safari', en: 'At the bottom of Safari' }) }}</small></span></li>
        <li><span><strong>{{ i18n.t({ th: 'เลือก "เพิ่มไปยังหน้าจอหลัก"', en: 'Choose “Add to Home Screen”' }) }}</strong><small>{{ i18n.t({ th: 'เลื่อนลงหาในเมนู', en: 'Scroll down the menu' }) }}</small></span></li>
        <li><span><strong>{{ i18n.t({ th: 'เปิดแอปจากไอคอน Smart Mailbox', en: 'Open Smart Mailbox from its icon' }) }}</strong><small>{{ i18n.t({ th: 'ที่หน้าจอโฮมของมือถือ', en: 'On your home screen' }) }}</small></span></li>
      </ol>
      <p class="info-box android">
        <strong>{{ i18n.t({ th: 'Android ไม่ต้องทำขั้นนี้', en: 'Android: skip this step' }) }}</strong><br />
        <span class="small">{{ i18n.t({ th: 'ใช้งานต่อได้เลย', en: 'You can carry on' }) }}</span>
      </p>
      <p class="muted small">{{ i18n.t({ th: 'iPhone ต้องติดตั้งก่อน จึงจะรับแจ้งเตือนได้', en: 'On iPhone, notifications only work after installing' }) }}</p>
      <a class="btn push-end" [routerLink]="url('A03')">{{ i18n.t({ th: 'ทำแล้ว ไปต่อ', en: 'Done, continue' }) }}</a>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    h1 {
      font-size: 1.5rem;
    }
    .android {
      background: var(--brand-lighter);
      color: var(--brand);
    }
  `,
})
export class AuthInstall {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
}

// ── A03 · เปิดแจ้งเตือน ─────────────────────────────────────

@Component({
  selector: 'app-auth-notifications',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack grow">
      <div class="result">
        <span class="big-icon danger"><app-icon name="bell" [size]="32" /></span>
        <h1>{{ i18n.t({ th: 'เปิดการแจ้งเตือน', en: 'Turn on notifications' }) }}</h1>
        <p class="muted small">
          {{ i18n.t({ th: 'รู้ทันทีเมื่อเจ้าหน้าที่มาตรวจ', en: 'Know right away when an officer checks your box,' }) }}<br />
          {{ i18n.t({ th: 'มีของมาส่ง หรือมีเหตุ SOS', en: 'a parcel arrives, or there is an SOS' }) }}
        </p>
      </div>
      <p class="info-box">
        <span class="muted small">{{ i18n.t({ th: 'จะมีแจ้งเตือนทดสอบ 1 ครั้ง', en: 'You will get one test notification' }) }}</span><br />
        <strong class="danger-text small">{{ i18n.t({ th: 'เจ้าหน้าที่ต้องเปิด ไม่งั้นจะไม่ได้รับ SOS', en: 'Officers must turn this on or they will miss SOS alerts' }) }}</strong>
      </p>
      <div class="stack push-end">
        <button type="button" class="btn" (click)="allow()">{{ i18n.t({ th: 'อนุญาตแจ้งเตือน', en: 'Allow notifications' }) }}</button>
        <a class="btn secondary" [routerLink]="url('A04')">{{ i18n.t({ th: 'ข้ามไปก่อน', en: 'Skip for now' }) }}</a>
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .result {
      padding-top: 48px;
    }
  `,
})
export class AuthNotifications {
  protected readonly i18n = inject(I18n);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;

  /**
   * ต้นแบบ: แค่แสดงผล · ของจริง: ขอสิทธิ์เบราว์เซอร์ตอนนี้ แล้วส่ง subscription ให้ server หลังล็อกอิน
   * (push ผูกกับ session — api.md §3) ผ่าน core/push-notifications.ts
   */
  protected allow(): void {
    this.toast.show({ th: 'เปิดแจ้งเตือนแล้ว (จำลอง)', en: 'Notifications on (demo)' });
    void this.router.navigateByUrl(screenUrl('A04'));
  }
}

// ── A04 · เข้าสู่ระบบ (+ A04-b รหัสผิด) ────────────────────────

const ROLE_CHOICE: Record<DemoAccountRole, { label: Tr; icon: IconName }> = {
  owner: { label: { th: 'เจ้าของบ้าน', en: 'Homeowner' }, icon: 'home' },
  officer: { label: { th: 'เจ้าหน้าที่', en: 'Officer' }, icon: 'shield' },
  head: { label: { th: 'หัวหน้าหน่วยงาน', en: 'Agency head' }, icon: 'user' },
  admin: { label: { th: 'แอดมิน', en: 'Admin' }, icon: 'settings' },
};

@Component({
  selector: 'app-auth-signin',
  imports: [Brand, Icon, RouterLink, PasswordField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    @if (choose(); as roles) {
      <div class="stack">
        <h1>{{ i18n.t({ th: 'เข้าใช้งานเป็น', en: 'Continue as' }) }}</h1>
        <p class="muted small">{{ i18n.t({ th: 'บัญชีนี้มีหลายบทบาท — เลือกที่จะใช้ตอนนี้', en: 'This account has several roles — pick one for now' }) }}</p>
        <nav class="list">
          @for (r of roles; track r) {
            <button type="button" class="row pick" (click)="enter(r)">
              <span class="icon-bubble"><app-icon [name]="roleChoice[r].icon" [size]="20" /></span>
              <strong class="grow">{{ i18n.t(roleChoice[r].label) }}</strong>
              <app-icon name="chevronRight" [size]="18" />
            </button>
          }
        </nav>
      </div>
    } @else {
      <form class="stack grow" (submit)="$event.preventDefault(); submit()">
        <h1>{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</h1>
        @if (error(); as e) {
          <p class="card err" role="alert">
            <strong>{{ i18n.t(e.title) }}</strong><br />
            <span class="small">{{ i18n.t(e.sub) }}</span>
          </p>
        }
        <label class="field">
          <span>{{ i18n.t({ th: 'เบอร์โทรศัพท์', en: 'Phone number' }) }}</span>
          <input type="tel" inputmode="tel" autocomplete="tel" [value]="phone()" (input)="phone.set($any($event.target).value)" />
        </label>
        <app-password-field [(value)]="password" [invalid]="!!error()" />
        <p class="small">
          <span class="danger-text">{{ i18n.t({ th: 'ลืมรหัสผ่าน? ', en: 'Forgot it? ' }) }}</span>
          {{ i18n.t({ th: 'เจ้าหน้าที่ขอให้หัวหน้ารีเซ็ต · คนอื่นติดต่อผู้ดูแล: ', en: 'Officers ask their head · everyone else contacts the admin: ' }) }}<strong>{{ support() ?? '—' }}</strong>
        </p>

        <div class="stack push-end">
          <button type="submit" class="btn" [disabled]="!ready()">{{ error() ? i18n.t({ th: 'ลองอีกครั้ง', en: 'Try again' }) : i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</button>
          <p class="center small">
            {{ i18n.t({ th: 'ยังไม่มีบัญชี? ', en: 'No account? ' }) }}<a class="link" [routerLink]="url('A05')">{{ i18n.t({ th: 'สมัครสมาชิก', en: 'Sign up' }) }}</a>
          </p>
          <div class="demo-tools">
            {{ i18n.t({ th: 'บัญชีทดลอง (รหัส ' + demoPassword + '):', en: 'Demo accounts (password ' + demoPassword + '):' }) }}
            @for (a of demoAccounts; track a.phone) {
              <button type="button" (click)="phone.set(a.phone)">{{ a.phone }} {{ i18n.t(a.label) }}</button>
            }
          </div>
        </div>
      </form>
    }
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .row .grow {
      min-width: 0;
    }
    h1 {
      font-size: 1.5rem;
      margin-top: 8px;
    }
    .err {
      background: var(--danger-bg);
      color: var(--sos);
      box-shadow: none;
    }
    .link {
      color: var(--brand);
      font-weight: 700;
    }
    .pick {
      width: 100%;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
  `,
})
export class AuthSignin implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly session = inject(DemoSession);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly roleChoice = ROLE_CHOICE;
  protected readonly demoPassword = DEMO_PASSWORD;
  /** ของจริง: GET /api/v1/support (public — ยังไม่ล็อกอินก็เห็น) */
  protected readonly support = inject(AdminDemo).supportContact;
  protected readonly demoAccounts: { phone: string; label: Tr }[] = [
    { phone: '089-111-2222', label: { th: 'เจ้าของบ้าน', en: 'owner' } },
    { phone: '081-234-5678', label: { th: 'เจ้าหน้าที่', en: 'officer' } },
    { phone: '081-000-1111', label: { th: 'หัวหน้า', en: 'head' } },
    { phone: '086-444-5555', label: { th: 'สองบทบาท', en: 'two roles' } },
    { phone: '087-666-7777', label: { th: 'ถูกรีเซ็ตรหัส', en: 'password reset' } },
    { phone: '080-000-0000', label: { th: 'แอดมิน', en: 'admin' } },
  ];

  /** ?state=wrong = A04-b */
  readonly state = input<string>();
  protected readonly phone = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<{ title: Tr; sub: Tr } | null>(null);
  protected readonly choose = signal<DemoAccountRole[] | null>(null);
  /** บัญชีที่เพิ่งล็อกอินผ่าน (ใช้ตอนเลือกบทบาท) */
  private signedIn: { phone: string; roles: DemoAccountRole[] } | null = null;

  protected ready(): boolean {
    return !!normalizePhone(this.phone()) && this.password().length > 0;
  }

  ngOnInit(): void {
    if (this.state() === 'wrong') {
      this.phone.set('081-234-5678');
      this.error.set(this.wrong(4));
    }
  }

  private wrong(left: number): { title: Tr; sub: Tr } {
    return {
      title: { th: 'เบอร์หรือรหัสผ่านไม่ถูกต้อง', en: 'Wrong phone number or password' },
      sub: { th: `ลองใหม่ได้อีก ${left} ครั้ง`, en: `${left} tries left` },
    };
  }

  /** ของจริง: POST /auth/signin → ตัดสินจาก code ของ error เท่านั้น */
  protected submit(): void {
    if (!this.ready()) return;
    const r = this.demo.signin(this.phone(), this.password());
    if (!r.ok) {
      this.password.set('');
      this.error.set(
        r.code === 'ACCOUNT_LOCKED'
          ? { title: { th: 'ลองผิดหลายครั้ง พักไว้ 15 นาที', en: 'Too many tries — locked for 15 minutes' }, sub: { th: 'ลืมรหัส ติดต่อหัวหน้าหรือผู้ดูแลให้รีเซ็ต', en: 'Forgot it? Ask your head or the admin to reset it' } }
          : this.wrong(r.left ?? 0),
      );
      return;
    }
    this.error.set(null);
    this.signedIn = { phone: r.phone, roles: r.roles };
    // ถูกรีเซ็ตรหัส → ต้องเปลี่ยนก่อน (403 PASSWORD_CHANGE_REQUIRED ทุก route)
    if (r.must_change_password) {
      this.session.signIn(r.roles[0] ?? 'owner', r.roles, r.phone);
      void this.router.navigate([screenUrl('A14')], { queryParams: { forced: 1 } });
      return;
    }
    // คำขอที่ยังรออยู่ → หน้ารอ (403 ACCOUNT_PENDING)
    if (r.pending) {
      this.session.signIn(r.pending === 'agency' ? 'head' : 'officer', r.roles, r.phone);
      this.session.agencyPending.set(r.pending === 'officer');
      void this.router.navigateByUrl(screenUrl(r.pending === 'agency' ? 'L02' : 'A11'));
      return;
    }
    // หัวหน้าเป็นเจ้าหน้าที่อยู่แล้ว — ไม่ต้องให้เลือกระหว่างสองอย่างนี้
    const roles = r.roles.includes('head') ? r.roles.filter((x) => x !== 'officer') : r.roles;
    if (roles.length > 1) this.choose.set(roles);
    else this.enter(roles[0]);
  }

  protected enter(role: DemoAccountRole): void {
    this.session.signIn(role, this.signedIn?.roles ?? [role], this.signedIn?.phone ?? '');
    void this.router.navigateByUrl(ROLE_HOME[role]);
  }
}

// ── A05 · สมัครเป็น… ───────────────────────────────────────

@Component({
  selector: 'app-auth-choose',
  imports: [RouterLink, Icon, Brand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-brand />
    <div class="stack grow">
      <div>
        <h1>{{ i18n.t({ th: 'สมัครเป็น…', en: 'Sign up as…' }) }}</h1>
        <p class="muted small">{{ i18n.t({ th: 'เลือกให้ตรงกับคุณ', en: 'Pick the one that fits you' }) }}</p>
      </div>
      @for (c of choices; track c.code) {
        <a class="card choice" [routerLink]="url(c.code)">
          <span class="icon-bubble"><app-icon [name]="c.icon" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t(c.title) }}</strong>
            <span class="muted small block">{{ i18n.t(c.sub) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      }
      <p class="center small push-end">
        {{ i18n.t({ th: 'มีบัญชีแล้ว? ', en: 'Have an account? ' }) }}<a class="link" [routerLink]="url('A04')">{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</a>
      </p>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .choice .grow {
      min-width: 0;
    }
    h1 {
      font-size: 1.5rem;
      margin-top: 8px;
    }
    .choice {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
      min-height: 72px;
    }
    .block {
      display: block;
    }
    .link {
      color: var(--brand);
      font-weight: 700;
    }
  `,
})
export class AuthChoose {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly choices: { code: string; icon: IconName; title: Tr; sub: Tr }[] = [
    { code: 'A06', icon: 'home', title: { th: 'เจ้าของบ้าน', en: 'Homeowner' }, sub: { th: 'มีตู้ Smart Mailbox หน้าบ้าน', en: 'You have a Smart Mailbox at home' } },
    { code: 'A10', icon: 'shield', title: { th: 'เจ้าหน้าที่', en: 'Officer' }, sub: { th: 'มีรหัสกลุ่มจากหัวหน้า', en: 'You have a group code from your head' } },
    { code: 'L01', icon: 'user', title: { th: 'หัวหน้าหน่วยงาน', en: 'Agency head' }, sub: { th: 'ตำรวจ / รปภ. / อื่น ๆ', en: 'Police / guards / other' } },
  ];
}
