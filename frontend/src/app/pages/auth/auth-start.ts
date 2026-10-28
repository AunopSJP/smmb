import { ChangeDetectionStrategy, Component, inject, input, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { normalizePhone, type DemoAccountRole } from '../../core/mock/auth-demo';
import { ROLE_HOME, Session } from '../../core/session';
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
          <button type="submit" class="btn" [disabled]="!ready() || busy()">{{ error() ? i18n.t({ th: 'ลองอีกครั้ง', en: 'Try again' }) : i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</button>
          <p class="center small">
            {{ i18n.t({ th: 'ยังไม่มีบัญชี? ', en: 'No account? ' }) }}<a class="link" [routerLink]="url('A05')">{{ i18n.t({ th: 'สมัครสมาชิก', en: 'Sign up' }) }}</a>
          </p>
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
  private readonly session = inject(Session);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly roleChoice = ROLE_CHOICE;
  /** ช่องทางติดต่อผู้ดูแล (api.md §3.1 — public) */
  protected readonly support = signal<string | null>(null);

  /** ?next=/officer/… — กลับไปหน้าที่ตั้งใจเปิดหลังล็อกอิน */
  readonly next = input<string>();
  protected readonly phone = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<{ title: Tr; sub: Tr } | null>(null);
  protected readonly choose = signal<DemoAccountRole[] | null>(null);

  protected ready(): boolean {
    return !!normalizePhone(this.phone()) && this.password().length > 0;
  }

  async ngOnInit(): Promise<void> {
    const r = await firstValueFrom(this.http.get<{ contact: string | null }>('/api/v1/support')).catch(() => null);
    this.support.set(r?.contact ?? null);
  }

  /** POST /auth/signin → ตัดสินจาก code ของ error เท่านั้น (กฎข้อ 10) */
  protected async submit(): Promise<void> {
    if (!this.ready() || this.busy()) return;
    this.busy.set(true);
    const r = await this.session.signin(normalizePhone(this.phone()) ?? this.phone(), this.password());
    this.busy.set(false);
    if (!r.ok) {
      this.password.set('');
      this.error.set(this.errorText(r.code, r.status));
      return;
    }
    this.error.set(null);
    const me = r.me;
    // ถูกรีเซ็ตรหัส → ต้องเปลี่ยนก่อน (403 PASSWORD_CHANGE_REQUIRED ทุก route)
    if (me.must_change_password) {
      void this.router.navigate([screenUrl('A14')], { queryParams: { forced: 1 } });
      return;
    }
    if (me.terms_update_required) {
      void this.router.navigate([screenUrl('A13')], { queryParams: { update: 1 } });
      return;
    }
    // คำขอเป็นเจ้าหน้าที่/หน่วยงานที่ยังรออยู่ และไม่มีบทบาทอื่นให้ใช้ → หน้ารอ
    if (!me.roles.length && me.agency_status === 'pending') {
      void this.router.navigateByUrl(screenUrl(me.agency?.is_head ? 'L02' : 'A11'));
      return;
    }
    const next = this.next();
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      void this.router.navigateByUrl(next);
      return;
    }
    // หัวหน้าเป็นเจ้าหน้าที่อยู่แล้ว — ไม่ต้องให้เลือกระหว่างสองอย่างนี้
    const roles = (me.roles.includes('head') ? me.roles.filter((x) => x !== 'officer') : me.roles) as DemoAccountRole[];
    if (roles.length > 1) this.choose.set(roles);
    else if (roles.length === 1) this.enter(roles[0]);
    else this.error.set({ title: { th: 'บัญชีนี้ยังไม่มีบทบาทที่ใช้ได้', en: 'This account has no usable role yet' }, sub: { th: 'ติดต่อผู้ดูแล', en: 'Contact the admin' } });
  }

  private errorText(code: string | null, status: number): { title: Tr; sub: Tr } {
    switch (code) {
      case 'ACCOUNT_LOCKED':
        return { title: { th: 'ลองผิดหลายครั้ง พักไว้ 15 นาที', en: 'Too many tries — locked for 15 minutes' }, sub: { th: 'ลืมรหัส ติดต่อหัวหน้าหรือผู้ดูแลให้รีเซ็ต', en: 'Forgot it? Ask your head or the admin to reset it' } };
      case 'ACCOUNT_DISABLED':
        return { title: { th: 'บัญชีนี้ถูกปิด', en: 'This account is disabled' }, sub: { th: 'ติดต่อผู้ดูแล', en: 'Contact the admin' } };
      case 'RATE_LIMITED':
        return { title: { th: 'ลองบ่อยเกินไป', en: 'Too many attempts' }, sub: { th: 'รอ 1 นาทีแล้วลองใหม่', en: 'Wait a minute and try again' } };
      case 'INVALID_CREDENTIALS':
        return { title: { th: 'เบอร์หรือรหัสผ่านไม่ถูกต้อง', en: 'Wrong phone number or password' }, sub: { th: 'ผิด 5 ครั้งจะถูกพักบัญชี 15 นาที', en: '5 wrong tries locks the account for 15 minutes' } };
      default:
        return status === 0
          ? { title: { th: 'ต่อเซิร์ฟเวอร์ไม่ได้', en: 'Can’t reach the server' }, sub: { th: 'ตรวจเน็ตแล้วลองใหม่', en: 'Check your connection and retry' } }
          : { title: { th: 'เข้าสู่ระบบไม่ได้', en: 'Couldn’t sign in' }, sub: { th: 'ลองใหม่อีกครั้ง', en: 'Please try again' } };
    }
  }

  protected enter(role: DemoAccountRole): void {
    this.session.use(role);
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
