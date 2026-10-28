import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { Session } from '../../core/session';
import { AuthDemo, normalizePhone, PASSWORD_MIN, ROLE_HOME, type FormKey, type SignupForm } from '../../core/mock/auth-demo';
import { DemoSession, type DemoRole } from '../../core/mock/demo-session';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { ContactCard } from '../../shared/contact-card';
import { MockNote, nowHHmm, PasswordField, TermsCheck } from './auth-parts';
import { SIGNUP_ERROR } from './auth-owner';
import { TERMS, TERMS_VERSION } from '../../core/terms';

// เจ้าหน้าที่: A10 สมัครด้วยรหัสกลุ่ม → A11 รอหัวหน้ายืนยัน (A11-b ถูกปฏิเสธ) → A12 ต้องเปิดแจ้งเตือนก่อน
// จำลองบนหน้าจอเท่านั้น — ไม่สร้างบัญชีจริง

// ── A10 · สมัครเจ้าหน้าที่ ──────────────────────────────────

@Component({
  selector: 'app-auth-signup-officer',
  imports: [PageHeader, PasswordField, TermsCheck, MockNote, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="i18n.t({ th: 'สมัครเจ้าหน้าที่', en: 'Officer sign-up' })" [back]="url('A05')" />
    <form class="stack grow" (submit)="$event.preventDefault(); submit()">
      <app-mock-note />
      <label class="field" [class.invalid]="tried() && !f().name.trim()">
        <span>{{ i18n.t({ th: 'ชื่อ - นามสกุล (ยศ)', en: 'Full name (with rank)' }) }}</span>
        <input autocomplete="name" [value]="f().name" (input)="set('name', $any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && !phoneOk()">
        <span>{{ i18n.t({ th: 'เบอร์โทรศัพท์', en: 'Phone number' }) }}</span>
        <input type="tel" inputmode="tel" autocomplete="tel" [value]="f().phone" (input)="set('phone', $any($event.target).value)" />
      </label>
      <app-password-field [isNew]="true" [value]="f().password" (valueChange)="set('password', $event)" [invalid]="tried() && f().password.length < min" />
      <label class="field" [class.invalid]="errorCode() === 'GROUP_CODE_INVALID'">
        <span>{{ i18n.t({ th: 'รหัสกลุ่มจากหัวหน้า', en: 'Group code from your head' }) }}</span>
        <input autocomplete="off" autocapitalize="characters" spellcheck="false" [placeholder]="i18n.t({ th: 'เช่น PX7K-2MQ9', en: 'e.g. PX7K-2MQ9' })" [value]="f().group_code" (input)="set('group_code', $any($event.target).value)" />
        <small>{{ i18n.t({ th: 'ได้จากหัวหน้าหน่วยงาน', en: 'Your agency head gives you this' }) }}</small>
      </label>
      <app-terms-check from="A10" [checked]="f().terms" (checkedChange)="set('terms', $event)" [showError]="filled() && !f().terms" />
      @if (errorCode(); as e) {
        <p class="danger-text small" role="alert">
          {{ i18n.t(errors[e]) }}
          @if (e === 'PHONE_TAKEN') {
            · <a [routerLink]="url('A04')">{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</a>
          }
        </p>
      }
      <button type="submit" class="btn push-end" [disabled]="!f().terms">{{ i18n.t({ th: 'ส่งคำขอสมัคร', en: 'Send request' }) }}</button>
      <p class="demo-tools">{{ i18n.t({ th: 'จำลอง — รหัสกลุ่มที่ใช้ได้: PX7K-2MQ9 (สภ.เมือง) · RJ4W-9QTC (รปภ.)', en: 'Demo group codes: PX7K-2MQ9 · RJ4W-9QTC' }) }}</p>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    a {
      color: inherit;
      font-weight: 700;
    }
  `,
})
export class AuthSignupOfficer {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly session = inject(DemoSession);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly min = PASSWORD_MIN;
  protected readonly errors = SIGNUP_ERROR;
  protected readonly f = this.demo.forms.officer;
  protected readonly tried = signal(false);
  protected readonly errorCode = signal<string | null>(null);
  protected readonly phoneOk = computed(() => !!normalizePhone(this.f().phone));
  protected readonly filled = computed(() => {
    const f = this.f();
    return !!(f.name.trim() && f.phone && f.password && f.group_code.trim());
  });

  protected set<K extends keyof SignupForm>(key: K, value: SignupForm[K]): void {
    this.f.update((f) => ({ ...f, [key]: value }));
    this.errorCode.set(null);
  }

  /** ของจริง: POST /auth/signup/officer { name, phone, password, group_code, terms_version } */
  protected submit(): void {
    this.tried.set(true);
    const e = this.demo.signupOfficer(this.f(), nowHHmm());
    if (e === 'TERMS_NOT_ACCEPTED') return;
    if (e) {
      this.errorCode.set(e);
      return;
    }
    // สมัครแล้ว = ล็อกอินอยู่ แต่ยังไม่มีบทบาท officer จนกว่าหัวหน้ายืนยัน
    this.session.signIn('officer', [], normalizePhone(this.f().phone) ?? '');
    this.session.agencyPending.set(true);
    void this.router.navigateByUrl(screenUrl('A11'));
  }
}

// ── A11 · รอหัวหน้ายืนยัน (+ A11-b ถูกปฏิเสธ) ─────────────────────

@Component({
  selector: 'app-auth-waiting-head',
  imports: [ContactCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack grow">
      @if (state() === 'rejected') {
        <div class="result">
          <span class="big-icon danger" aria-hidden="true">✕</span>
          <h1>{{ i18n.t({ th: 'คำขอถูกปฏิเสธ', en: 'Request declined' }) }}</h1>
          <p class="muted small">
            {{ i18n.t({ th: 'หัวหน้าไม่ได้ยืนยันคำขอนี้', en: 'Your head did not approve this request.' }) }}<br />
            {{ i18n.t({ th: 'ตรวจรหัสกลุ่มกับหัวหน้าอีกครั้ง', en: 'Check the group code with them' }) }}
          </p>
        </div>
        <app-contact-card [label]="{ th: 'ติดต่อหน่วยงาน · ' + req().agency.th, en: 'Contact the agency · ' + req().agency.en }" [contact]="req().contact" />
        <div class="stack push-end">
          @if (otherHome(); as h) {
            <button type="button" class="btn secondary" (click)="leave(h)">{{ i18n.t({ th: 'กลับหน้าหลัก', en: 'Back to home' }) }}</button>
          } @else {
            <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
          }
        </div>
      } @else {
        <div class="result">
          <span class="big-icon danger dots" aria-hidden="true">•••</span>
          <h1>{{ i18n.t({ th: 'รอหัวหน้ายืนยัน', en: 'Waiting for your head' }) }}</h1>
          <p class="muted small">
            {{ i18n.t({ th: 'ส่งคำขอเข้าหน่วยงานแล้ว', en: 'Your request has been sent.' }) }}<br />
            {{ i18n.t({ th: 'หัวหน้าจะได้รับแจ้งเตือน', en: 'Your head will be notified' }) }}
          </p>
        </div>
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ i18n.t(req().agency) }}</dd>
            <dt>{{ i18n.t({ th: 'ส่งเมื่อ', en: 'Sent' }) }}</dt><dd>{{ req().at }}</dd>
          </dl>
        </section>
        <app-contact-card [label]="{ th: 'รอนานเกินไป? ติดต่อหน่วยงาน', en: 'Waiting too long? Contact the agency' }" [contact]="req().contact" />
        <div class="stack push-end">
          <button type="button" class="btn" (click)="check()">{{ i18n.t({ th: 'ตรวจสถานะอีกครั้ง', en: 'Check again' }) }}</button>
          @if (otherHome(); as h) {
            <button type="button" class="btn secondary" (click)="leave(h)">{{ i18n.t({ th: 'กลับหน้าหลัก', en: 'Back to home' }) }}</button>
          } @else {
            <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
          }
          <div class="demo-tools">
            {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
            <button type="button" (click)="go('A12')">{{ i18n.t({ th: 'หัวหน้าอนุมัติ', en: 'Head approves' }) }}</button>
            <button type="button" (click)="reject()">{{ i18n.t({ th: 'หัวหน้าปฏิเสธ', en: 'Head declines' }) }}</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .result {
      padding-top: 40px;
    }
    .dots {
      letter-spacing: 0.1em;
    }
  `,
})
export class AuthWaitingHead {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly session = inject(DemoSession);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  /** บัญชีมีบทบาทอื่นอยู่แล้ว (เช่น เจ้าของบ้านที่ขอเข้าหน่วยงาน) → กลับไปใช้ต่อได้ระหว่างรอ */
  protected readonly otherHome = computed(() => this.session.roles().find((r) => r !== 'officer' && r !== 'head') ?? null);
  /** ?state=rejected = A11-b */
  readonly state = input<string>();
  /** ของจริง: Me.agency (ชื่อ + contact ที่หน่วยงานกรอกตอนสมัคร) */
  protected readonly req = computed(() => this.demo.officerRequest() ?? { agency: { th: 'สภ.เมือง', en: 'Mueang police' }, contact: 'สถานี 02-111-2222', at: '10:42' });

  /** ของจริง: GET /auth/verify → Me.agency_status */
  protected check(): void {
    this.toast.show({ th: 'ยังรอหัวหน้ายืนยันอยู่', en: 'Still waiting for your head' });
  }

  protected go(code: string): void {
    void this.router.navigateByUrl(screenUrl(code));
  }

  protected reject(): void {
    void this.router.navigate([screenUrl('A11')], { queryParams: { state: 'rejected' } });
  }

  protected leave(role: DemoRole): void {
    this.session.role.set(role);
    void this.router.navigateByUrl(ROLE_HOME[role]);
  }

  /** ของจริง: POST /auth/signout */
  private readonly realSession = inject(Session);
  /** ออกจากระบบจริง (ลบ session ที่ server + cookie) */
  protected signout(): void {
    void this.realSession.signout().then(() => this.router.navigateByUrl(screenUrl('A04')));
  }
}

// ── A12 · ต้องเปิดแจ้งเตือนก่อน (เจ้าหน้าที่ — PUSH_REQUIRED) ────────

@Component({
  selector: 'app-auth-push-required',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack grow">
      <div class="result">
        <span class="big-icon danger"><app-icon name="bell" [size]="34" /></span>
        <h1>{{ i18n.t({ th: 'ต้องเปิดแจ้งเตือนก่อน', en: 'Turn on notifications first' }) }}</h1>
        <p class="muted small">
          {{ i18n.t({ th: 'ไม่งั้นจะไม่ได้รับ SOS จากบ้านในโซน', en: 'Otherwise you will miss SOS alerts from your zone.' }) }}<br />
          {{ i18n.t({ th: 'ยังใช้งานต่อไม่ได้จนกว่าจะเปิด', en: 'You cannot continue until it is on' }) }}
        </p>
      </div>
      @if (help()) {
        <div class="info-box">
          <strong>iPhone</strong>
          <p class="small muted">{{ i18n.t({ th: 'ต้องติดตั้งเป็นแอปก่อน (แชร์ → เพิ่มไปยังหน้าจอหลัก) แล้วเปิดจากไอคอน · ถ้าเคยกดไม่อนุญาต: ตั้งค่า → การแจ้งเตือน → Smart Mailbox', en: 'Install it first (Share → Add to Home Screen) and open it from the icon · if you blocked it: Settings → Notifications → Smart Mailbox' }) }}</p>
          <strong>Android</strong>
          <p class="small muted">{{ i18n.t({ th: 'แตะรูปกุญแจข้างช่องที่อยู่เว็บ → การแจ้งเตือน → อนุญาต', en: 'Tap the lock next to the address bar → Notifications → Allow' }) }}</p>
        </div>
      }
      <div class="stack push-end">
        <button type="button" class="btn" (click)="enable()">{{ i18n.t({ th: 'เปิดแจ้งเตือน', en: 'Turn on notifications' }) }}</button>
        <button type="button" class="btn secondary" [attr.aria-expanded]="help()" (click)="help.set(!help())">{{ i18n.t({ th: 'ดูวิธีเปิดในตั้งค่า', en: 'How to allow it in settings' }) }}</button>
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .result {
      padding-top: 40px;
    }
    .info-box {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `,
})
export class AuthPushRequired {
  protected readonly i18n = inject(I18n);
  private readonly toast = inject(Toast);
  private readonly session = inject(DemoSession);
  private readonly router = inject(Router);
  protected readonly help = signal(false);

  /** ของจริง: PushNotifications.enable() — สำเร็จแล้ว route ของเจ้าหน้าที่หยุดตอบ 403 PUSH_REQUIRED */
  protected enable(): void {
    this.toast.show({ th: 'เปิดแจ้งเตือนแล้ว (จำลอง)', en: 'Notifications on (demo)' });
    this.session.addRole('officer');
    this.session.agencyPending.set(false);
    this.session.role.set('officer');
    void this.router.navigateByUrl('/officer');
  }
}

// ── A13 · ข้อตกลงการใช้งาน ───────────────────────────────────

@Component({
  selector: 'app-auth-terms',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header caption="Smart Mailbox" [title]="t().title" [back]="backUrl()" />
    <div class="stack grow">
      <p class="muted small">{{ t().intro }}</p>
      @for (sec of t().sections; track sec.title; let first = $first) {
        <section class="card sec" [class.first]="first">
          <h2>{{ sec.title }}</h2>
          <ul>
            @for (item of sec.items; track $index) {
              <li>{{ item }}</li>
            }
          </ul>
        </section>
      }
      <p class="muted small">{{ i18n.t({ th: 'ฉบับ ', en: 'Version ' }) }}{{ version }}</p>
      <button type="button" class="btn push-end" (click)="accept()">{{ i18n.t({ th: 'ยอมรับ', en: 'Accept' }) }}</button>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .sec h2 {
      font-size: 1rem;
      margin-bottom: 6px;
    }
    .sec.first {
      box-shadow: inset 0 0 0 2px var(--sos);
      h2 {
        color: var(--sos);
      }
    }
    ul {
      margin: 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.9375rem;
    }
  `,
})
export class AuthTerms {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly router = inject(Router);
  /** ?from=A06|A10|L01|A15|A16 — กลับไปฟอร์มเดิมพร้อมติ๊กยอมรับให้ */
  readonly from = input<string>();
  protected readonly backUrl = computed(() => screenUrl(this.formOf(this.from()) ? this.from()! : 'A04'));
  /** ของจริง: GET /api/v1/terms/current (body_md มีทั้งไทยและอังกฤษ คั่นด้วย <!-- en -->) */
  protected readonly t = computed(() => TERMS[this.i18n.lang()]);
  protected readonly version = TERMS_VERSION;

  private formOf(code: string | undefined): FormKey | null {
    const map: Record<string, FormKey> = { A06: 'owner', A10: 'officer', L01: 'agency', A15: 'addOwner', A16: 'join' };
    return code ? (map[code] ?? null) : null;
  }

  /** ของจริง: ยอมรับตอนสมัคร = ส่ง terms_version ไปกับ signup · ข้อตกลงเปลี่ยน = POST /me/terms */
  protected accept(): void {
    const form = this.formOf(this.from());
    if (form) this.demo.forms[form].update((f) => ({ ...f, terms: true }));
    void this.router.navigateByUrl(this.backUrl());
  }
}
