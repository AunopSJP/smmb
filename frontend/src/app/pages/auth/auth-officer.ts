import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiError } from '../../core/api';
import { I18n } from '../../core/i18n';
import { Session } from '../../core/session';
import { PushBlockedError, PushNotifications } from '../../core/push-notifications';
import { AuthDemo, normalizePhone, PASSWORD_MIN, ROLE_HOME, type FormKey, type SignupForm } from '../../core/mock/auth-demo';
import { DemoSession, type DemoRole } from '../../core/mock/demo-session';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { ContactCard } from '../../shared/contact-card';
import { emptyExtras, extrasPayload, extrasValid, ProfileExtras } from '../../shared/profile-extras';
import { PasswordField, TermsCheck } from './auth-parts';
import { SIGNUP_ERROR } from './auth-owner';
import { TERMS, TERMS_VERSION } from '../../core/terms';

// เจ้าหน้าที่: A10 สมัครด้วยรหัสกลุ่ม → A11 รอหัวหน้ายืนยัน (A11-b ถูกปฏิเสธ) → A12 ต้องเปิดแจ้งเตือนก่อน — ใช้ API จริง (api.md §2)

// ── A10 · สมัครเจ้าหน้าที่ ──────────────────────────────────

@Component({
  selector: 'app-auth-signup-officer',
  imports: [PageHeader, PasswordField, TermsCheck, RouterLink, ProfileExtras],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ขั้น ' + step() + ' จาก 2', en: 'Step ' + step() + ' of 2' })" [title]="i18n.t({ th: 'สมัครเจ้าหน้าที่', en: 'Officer sign-up' })" [back]="step() === 1 ? url('A05') : undefined" />
    <span class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="2" [attr.aria-valuenow]="step()"><span [style.width.%]="(step() / 2) * 100"></span></span>
    <form class="stack grow" (submit)="$event.preventDefault(); step() < 2 ? next() : submit()">
      @if (step() === 1) {
      <label class="field" [class.invalid]="errorCode() === 'GROUP_CODE_INVALID'">
        <span>{{ i18n.t({ th: 'รหัสกลุ่มจากหัวหน้า', en: 'Group code from your head' }) }}</span>
        <input autocomplete="off" autocapitalize="characters" spellcheck="false" [placeholder]="i18n.t({ th: 'เช่น PX7K-2MQ9', en: 'e.g. PX7K-2MQ9' })" [value]="f().group_code" (input)="set('group_code', $any($event.target).value)" />
        <small class="easy-hide">{{ i18n.t({ th: 'ได้จากหัวหน้าหน่วยงาน', en: 'Your agency head gives you this' }) }}</small>
      </label>
      <label class="field" [class.invalid]="tried() && !f().name.trim()">
        <span>{{ i18n.t({ th: 'ชื่อ - นามสกุล (ยศ)', en: 'Full name (with rank)' }) }}</span>
        <input autocomplete="name" [value]="f().name" (input)="set('name', $any($event.target).value)" />
      </label>
      <div class="two-col">
        <label class="field" [class.invalid]="tried() && !f().position.trim()">
          <span>{{ i18n.t({ th: 'ตำแหน่ง / ยศ', en: 'Position / rank' }) }}</span>
          <input maxlength="100" [placeholder]="i18n.t({ th: 'เช่น ผบ.หมู่ / หัวหน้าเวร', en: 'e.g. Sergeant / shift lead' })" [value]="f().position" (input)="set('position', $any($event.target).value)" />
        </label>
        <label class="field easy-hide">
          <span>{{ i18n.t({ th: 'เลขประจำตัว (ไม่บังคับ)', en: 'Staff no. (optional)' }) }}</span>
          <input maxlength="50" autocomplete="off" [value]="f().staff_no" (input)="set('staff_no', $any($event.target).value)" />
        </label>
      </div>
      <div class="easy-hide"><app-profile-extras kind="officer" [(value)]="extras" [tried]="tried()" /></div>
      <section class="form-section easy-hide" [class.invalid]="tried() && !emergencyOk()">
        <h2 class="form-title">{{ i18n.t({ th: 'ผู้ติดต่อฉุกเฉินของคุณ (ไม่บังคับ)', en: 'Your emergency contact (optional)' }) }}</h2>
        <div class="two-col">
          <label class="field">
            <span>{{ i18n.t({ th: 'ชื่อผู้ติดต่อ', en: 'Contact name' }) }}</span>
            <input maxlength="100" autocomplete="off" [value]="emName()" (input)="emName.set($any($event.target).value)" />
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'เบอร์โทร', en: 'Phone' }) }}</span>
            <input type="tel" inputmode="tel" autocomplete="off" [value]="emPhone()" (input)="emPhone.set($any($event.target).value)" />
          </label>
        </div>
        <p class="form-hint">{{ i18n.t({ th: 'กรอกทั้งชื่อและเบอร์ หรือเว้นว่างทั้งคู่ · หัวหน้าหน่วยงานเห็นเพื่อใช้ตอนเกิดเหตุกับคุณ', en: 'Fill in both, or leave both empty · your agency head can see it for emergencies involving you' }) }}</p>
      </section>
      <p class="small easy-only">{{ i18n.t({ th: 'หัวหน้าต้องอนุมัติก่อน จึงจะเริ่มตรวจได้', en: 'Your head must approve before you can start inspections' }) }}</p>
      
      }
      @if (step() === 2) {
      <label class="field" [class.invalid]="tried() && !phoneOk()">
        <span>{{ i18n.t({ th: 'เบอร์โทรศัพท์', en: 'Phone number' }) }}</span>
        <input type="tel" inputmode="tel" autocomplete="tel" [value]="f().phone" (input)="set('phone', $any($event.target).value)" />
      </label>
      <app-password-field [isNew]="true" [value]="f().password" (valueChange)="set('password', $event)" [invalid]="tried() && f().password.length < min" />
      <p class="small easy-only">{{ i18n.t({ th: 'หลังสมัครต้องเปิดแจ้งเตือนก่อนใช้งาน เพื่อรับ SOS', en: 'After signing up, notifications must be on before you can work, so you get SOS alerts' }) }}</p>
      <app-terms-check from="A10" [checked]="f().terms" (checkedChange)="set('terms', $event)" [showError]="filled() && !f().terms" />
      
      }
      @if (errorCode(); as e) {
        <p class="danger-text small" role="alert">
          {{ i18n.t(errors[e]) }}
          @if (e === 'PHONE_TAKEN') {
            · <a [routerLink]="url('A04')">{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</a>
          }
        </p>
      }
      @if (step() < 2) {
        <button type="button" class="btn push-end" (click)="next()">{{ i18n.t({ th: 'ถัดไป', en: 'Next' }) }}</button>
      } @else {
        <button type="submit" class="btn push-end" [disabled]="!f().terms || busy()">{{ i18n.t({ th: 'ส่งคำขอสมัคร', en: 'Send request' }) }}</button>
        <button type="button" class="btn secondary" (click)="step.set(1)">{{ i18n.t({ th: 'ย้อนกลับ', en: 'Back' }) }}</button>
      }
    </form>
  `,
  styles: `
    .two-col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr));
      gap: 12px;
      align-items: end;
    }
    .grow {
      flex: 1;
    }
    a {
      color: inherit;
      font-weight: 700;
    }
    .progress {
      display: block;
      block-size: 6px;
      border-radius: 3px;
      background: var(--line);
      overflow: hidden;
      margin-block: 4px;
      span {
        display: block;
        block-size: 100%;
        background: var(--brand);
        transition: width 0.2s;
      }
    }
  `,
})
export class AuthSignupOfficer {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly session = inject(Session);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly url = screenUrl;
  protected readonly min = PASSWORD_MIN;
  protected readonly errors = SIGNUP_ERROR;
  protected readonly f = this.demo.forms.officer;
  protected readonly tried = signal(false);
  /** 1 ข้อมูลและรหัสกลุ่ม · 2 เบอร์/รหัสผ่าน/ข้อตกลง (ตามแคนวาสดีไซน์) */
  protected readonly step = signal(1);
  protected readonly extras = signal(emptyExtras());
  protected readonly emName = signal('');
  protected readonly emPhone = signal('');
  protected readonly emergencyOk = computed(() => {
    const n = this.emName().trim();
    const p = this.emPhone().trim();
    return (!n && !p) || (!!n && !!normalizePhone(p));
  });
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

  protected next(): void {
    this.tried.set(true);
    const f = this.f();
    if (!f.group_code.trim() || !f.name.trim() || !f.position.trim() || !this.emergencyOk() || !extrasValid(this.extras(), 'officer')) return;
    this.tried.set(false);
    this.step.set(2);
  }

  /** POST /auth/signup/officer { name, phone, password, group_code, terms_version } → ล็อกอินแล้ว แต่ยังไม่มีบทบาท officer จนกว่าหัวหน้ายืนยัน */
  protected async submit(): Promise<void> {
    this.tried.set(true);
    const f = this.f();
    const phone = normalizePhone(f.phone);
    if (!f.terms) return;
    if (!f.name.trim() || !phone || f.password.length < this.min || !f.group_code.trim() || !f.position.trim() || !this.emergencyOk() || !extrasValid(this.extras(), 'officer')) {
      this.errorCode.set('INVALID');
      return;
    }
    this.busy.set(true);
    try {
      const terms = await firstValueFrom(this.http.get<{ version: string }>('/api/v1/terms/current'));
      await firstValueFrom(
        this.http.post('/api/v1/auth/signup/officer', {
          name: f.name.trim(),
          phone,
          password: f.password,
          group_code: f.group_code.replace(/[\s-]/g, '').toUpperCase(),
          position: f.position.trim(),
          staff_no: f.staff_no.trim() || undefined,
          ...(this.emName().trim() && normalizePhone(this.emPhone()) ? { emergency_name: this.emName().trim(), emergency_phone: normalizePhone(this.emPhone()) } : {}),
          ...(Object.keys(extrasPayload(this.extras(), 'officer')).length ? { profile: extrasPayload(this.extras(), 'officer') } : {}),
          terms_version: terms.version,
        }),
      );
      await this.session.refresh();
      this.f.set({ ...f, password: '' });
      void this.router.navigateByUrl(screenUrl('A11'), { replaceUrl: true });
    } catch (err) {
      const e = apiError(err);
      this.errorCode.set(e.code === 'PHONE_TAKEN' || e.code === 'GROUP_CODE_INVALID' ? e.code : e.status === 0 ? 'NETWORK' : (e.status ?? 0) >= 500 ? 'SERVER' : 'INVALID');
      if (e.code === 'GROUP_CODE_INVALID') this.step.set(1);
    } finally {
      this.busy.set(false);
    }
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
            {{ i18n.t({ th: 'ตรวจสอบรหัสกลุ่มกับหัวหน้าอีกครั้ง', en: 'Check the group code with them' }) }}
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
          <p class="small easy-only">{{ i18n.t({ th: 'หัวหน้าจะอนุมัติ แล้วเราจะแจ้งเตือนคุณ', en: 'Your head will approve it and we will notify you' }) }}</p>
        </div>
        <section class="card easy-hide">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ i18n.t(req().agency) }}</dd>
          </dl>
        </section>
        <app-contact-card class="easy-hide" [label]="{ th: 'รอนานเกินไป? ติดต่อหน่วยงาน', en: 'Waiting too long? Contact the agency' }" [contact]="req().contact" />
        
        <div class="stack push-end">
          <button type="button" class="btn" (click)="check()">{{ i18n.t({ th: 'ตรวจสถานะอีกครั้ง', en: 'Check again' }) }}</button>
          @if (otherHome(); as h) {
            <button type="button" class="btn secondary" (click)="leave(h)">{{ i18n.t({ th: 'กลับหน้าหลัก', en: 'Back to home' }) }}</button>
          } @else {
            <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .result {
      padding-block-start: 40px;
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
  private readonly realSession = inject(Session);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  /** ข้อมูลบัญชีจริง (สถานะคำขอ) — แสดงเฉพาะโหมดละเอียด */
  protected readonly me = this.realSession.me;
  /** บัญชีมีบทบาทอื่นอยู่แล้ว (เช่น เจ้าของบ้านที่ขอเข้าหน่วยงาน) → กลับไปใช้ต่อได้ระหว่างรอ */
  protected readonly otherHome = computed(() => this.session.roles().find((r) => r !== 'officer' && r !== 'head') ?? null);
  /** ?state=rejected = A11-b */
  readonly state = input<string>();
  /** Me.agency (ชื่อ + contact ที่หน่วยงานกรอกตอนสมัคร) */
  protected readonly req = computed(() => {
    const a = this.realSession.me()?.agency;
    return { agency: { th: a?.name ?? '-', en: a?.name ?? '-' }, contact: a?.contact ?? '' };
  });

  /** GET /me → agency_status: active → ใช้งาน (หรือหน้าเปิดแจ้งเตือน) · rejected → A11-b */
  protected async check(): Promise<void> {
    const me = await this.realSession.refresh();
    if (!me) {
      void this.router.navigateByUrl(screenUrl('A04'));
    } else if (me.agency_status === 'active' && (me.roles.includes('officer') || me.roles.includes('head'))) {
      this.toast.show({ th: 'หัวหน้ายืนยันแล้ว', en: 'Approved by your head' });
      // ต้องเปิดแจ้งเตือนก่อนไหม — server ตัดสิน (403 PUSH_REQUIRED → A12 ผ่าน apiInterceptor)
      void this.router.navigateByUrl('/officer', { replaceUrl: true });
    } else if (me.agency_status === 'rejected') {
      void this.router.navigate([screenUrl('A11')], { queryParams: { state: 'rejected' }, replaceUrl: true });
    } else {
      this.toast.show({ th: 'ยังรอหัวหน้ายืนยันอยู่', en: 'Still waiting for your head' });
    }
  }

  protected leave(role: DemoRole): void {
    this.session.role.set(role);
    void this.router.navigateByUrl(ROLE_HOME[role]);
  }

  /** ออกจากระบบจริง (ลบ session ที่ server + cookie) */
  protected signout(): void {
    void this.realSession.signout().then(() => this.router.navigateByUrl(screenUrl('A04'), { replaceUrl: true }));
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
          {{ i18n.t({ th: 'หากไม่เปิด จะไม่ได้รับ SOS จากบ้านในโซน', en: 'Otherwise you will miss SOS alerts from your zone.' }) }}<br />
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
        <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
      </div>
      
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .result {
      padding-block-start: 40px;
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
  /** สิทธิ์แจ้งเตือนของเบราว์เซอร์ (แสดงเฉพาะโหมดละเอียด) */
  protected readonly permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

  private readonly push = inject(PushNotifications);
  private readonly realSession = inject(Session);

  protected signout(): void {
    void this.realSession.signout().then(() => this.router.navigateByUrl('/auth/signin', { replaceUrl: true }));
  }

  /** PushNotifications.enable() — สำเร็จแล้ว route ของเจ้าหน้าที่หยุดตอบ 403 PUSH_REQUIRED */
  protected async enable(): Promise<void> {
    try {
      await this.push.enable();
      await this.realSession.refresh();
      this.toast.show({ th: 'เปิดแจ้งเตือนแล้ว', en: 'Notifications on' });
      const home = this.realSession.me()?.roles.includes('head') ? '/agency' : '/officer';
      void this.router.navigateByUrl(home, { replaceUrl: true });
    } catch (err) {
      this.help.set(true);
      this.toast.show(
        err instanceof PushBlockedError && err.reason === 'unsupported'
          ? { th: 'เบราว์เซอร์นี้เปิดแจ้งเตือนไม่ได้', en: 'This browser can’t do notifications' }
          : { th: 'เปิดแจ้งเตือนไม่ได้ ดูวิธีด้านบน', en: 'Couldn’t turn on notifications — see the steps above' },
      );
    }
  }
}

// ── A13 · ข้อตกลงการใช้งาน ───────────────────────────────────

@Component({
  selector: 'app-auth-terms',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header caption="Smart Mailbox" [title]="t().title" [back]="update() ? undefined : backUrl()" />
    <div class="stack grow">
      <p class="muted small easy-hide">{{ t().intro }}</p>
      @for (sec of t().sections; track sec.title; let first = $first; let i = $index) {
        <section class="card sec" [class.first]="first" [class.easy-hide]="i > 1">
          <h2>{{ sec.title }}</h2>
          <ul>
            @for (item of sec.items; track $index) {
              <li>{{ item }}</li>
            }
          </ul>
        </section>
      }
      <p class="muted small">{{ i18n.t({ th: 'ฉบับ ', en: 'Version ' }) }}<span class="mono">{{ version }}</span></p>
      
      @if (failed()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'ยอมรับไม่สำเร็จ — ลองอีกครั้ง หรือออกจากระบบ', en: 'Could not accept — try again, or sign out' }) }}</p>
      }
      <p class="muted small easy-only">{{ i18n.t({ th: 'โหมดง่ายแสดงเฉพาะสาระสำคัญ — อ่านฉบับเต็มได้ในโหมดปกติ', en: 'Easy mode shows the key points only — read the full text in normal mode' }) }}</p>
      <button type="button" class="btn push-end" [disabled]="busy()" (click)="accept()">{{ busy() ? i18n.t({ th: 'กำลังบันทึก…', en: 'Saving…' }) : i18n.t({ th: 'ยอมรับ', en: 'Accept' }) }}</button>
      @if (update()) {
        <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
      }
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .sec h2 {
      font-size: 1rem;
      margin-block-end: 6px;
    }
    .sec.first {
      box-shadow: inset 0 0 0 2px var(--sos);
      h2 {
        color: var(--sos);
      }
    }
    ul {
      margin: 0;
      padding-inline-start: 20px;
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
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  /** ?from=A06|A10|L01|A15|A16 — กลับไปฟอร์มเดิมพร้อมติ๊กยอมรับให้ */
  readonly from = input<string>();
  readonly returnTo = input<string>();
  protected readonly backUrl = computed(() => {
    const code = this.formOf(this.from()) ? this.from()! : 'A04';
    const target = screenUrl(code);
    const returnTo = this.returnTo();
    if (returnTo && (code === 'A15' || code === 'A16')) {
      try {
        screenUrl(returnTo);
        return `${target}?from=${encodeURIComponent(returnTo)}`;
      } catch {
        return target;
      }
    }
    return target;
  });
  /** ของจริง: GET /api/v1/terms/current (body_md มีทั้งไทยและอังกฤษ คั่นด้วย <!-- en -->) */
  protected readonly t = computed(() => TERMS[this.i18n.lang()]);
  protected readonly version = TERMS_VERSION;

  private formOf(code: string | undefined): FormKey | null {
    const map: Record<string, FormKey> = { A06: 'owner', A10: 'officer', L01: 'agency', A15: 'addOwner', A16: 'join' };
    return code ? (map[code] ?? null) : null;
  }

  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  /** ?update=1 — ข้อตกลงเปลี่ยน ต้องยอมรับก่อนใช้งานต่อ */
  readonly update = input<string>();

  /** ยอมรับตอนสมัคร = ส่ง terms_version ไปกับ signup · ข้อตกลงเปลี่ยน = POST /me/terms */
  protected async accept(): Promise<void> {
    if (this.busy()) return;
    if (this.update()) {
      this.busy.set(true);
      this.failed.set(false);
      try {
        const terms = await firstValueFrom(this.http.get<{ version: string }>('/api/v1/terms/current'));
        await firstValueFrom(this.http.post('/api/v1/me/terms', { terms_version: terms.version }));
        await this.session.refresh();
        void this.router.navigateByUrl('/', { replaceUrl: true });
      } catch {
        this.failed.set(true);
      } finally {
        this.busy.set(false);
      }
      return;
    }
    const form = this.formOf(this.from());
    if (form) this.demo.forms[form].update((f) => ({ ...f, terms: true }));
    void this.router.navigateByUrl(this.backUrl(), { replaceUrl: true });
  }

  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl('/auth/signin', { replaceUrl: true }));
  }
}
