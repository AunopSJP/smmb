import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { AuthDemo, normalizePhone, PASSWORD_MIN, type SignupForm } from '../../core/mock/auth-demo';
import { DemoSession } from '../../core/mock/demo-session';
import { HeadDemo } from '../../core/mock/head-demo';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';
import { Steps, type Step } from '../../shared/steps';
import { SIGNUP_ERROR } from '../auth/auth-owner';
import { contactNotSet, MockNote, nowHHmm, PasswordField, TermsCheck } from '../auth/auth-parts';

// หัวหน้า: L01 สมัครหน่วยงาน → L02 รอแอดมิน (L02-b ไม่อนุมัติ) → L03 อนุมัติแล้ว แชร์รหัสกลุ่ม
// จำลองบนหน้าจอเท่านั้น — ไม่สร้างบัญชีจริง (api.md §2 signup/agency, §9.2)

const AGENCY_TYPES: { v: SignupForm['agency_type']; label: Tr }[] = [
  { v: 'police', label: { th: 'ตำรวจ', en: 'Police' } },
  { v: 'guard', label: { th: 'รปภ.', en: 'Guards' } },
  { v: 'other', label: { th: 'อื่น ๆ', en: 'Other' } },
];
const typeLabel = (v: SignupForm['agency_type']) => AGENCY_TYPES.find((t) => t.v === v)!.label;

// ── L01 · สมัครหน่วยงาน ─────────────────────────────────────

@Component({
  selector: 'app-head-signup',
  imports: [PageHeader, PasswordField, TermsCheck, MockNote, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="i18n.t({ th: 'สมัครหน่วยงาน', en: 'Register an agency' })" [back]="url('A05')" />
    <form class="stack grow" (submit)="$event.preventDefault(); submit()">
      <app-mock-note />
      <label class="field" [class.invalid]="tried() && !f().agency_name.trim()">
        <span>{{ i18n.t({ th: 'ชื่อหน่วยงาน', en: 'Agency name' }) }}</span>
        <input autocomplete="organization" [value]="f().agency_name" (input)="set('agency_name', $any($event.target).value)" />
      </label>
      <fieldset class="type">
        <legend>{{ i18n.t({ th: 'ประเภท', en: 'Type' }) }}</legend>
        <div class="segmented chips">
          @for (t of types; track t.v) {
            <button type="button" [attr.aria-pressed]="f().agency_type === t.v" (click)="set('agency_type', t.v)">{{ i18n.t(t.label) }}</button>
          }
        </div>
      </fieldset>
      <label class="field" [class.invalid]="tried() && !f().name.trim()">
        <span>{{ i18n.t({ th: 'ชื่อหัวหน้า (ยศ)', en: 'Head’s name (with rank)' }) }}</span>
        <input autocomplete="name" [value]="f().name" (input)="set('name', $any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && !phoneOk()">
        <span>{{ i18n.t({ th: 'เบอร์โทรศัพท์', en: 'Phone number' }) }}</span>
        <input type="tel" inputmode="tel" autocomplete="tel" [value]="f().phone" (input)="set('phone', $any($event.target).value)" />
        <small>{{ i18n.t({ th: 'ใช้ล็อกอิน · แอดมินใช้ติดต่อตอนตรวจคำขอ', en: 'Used to sign in · the admin may call while reviewing' }) }}</small>
      </label>
      <app-password-field [isNew]="true" [value]="f().password" (valueChange)="set('password', $event)" [invalid]="tried() && f().password.length < min" />
      <app-terms-check from="L01" [checked]="f().terms" (checkedChange)="set('terms', $event)" [showError]="filled() && !f().terms" />
      @if (errorCode(); as e) {
        <p class="danger-text small" role="alert">
          {{ i18n.t(errors[e]) }}
          @if (e === 'PHONE_TAKEN') {
            · <a [routerLink]="url('A04')">{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</a>
          }
        </p>
      }
      <button type="submit" class="btn push-end" [disabled]="!f().terms">{{ i18n.t({ th: 'ส่งคำขอหน่วยงาน', en: 'Send agency request' }) }}</button>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .type {
      border: 0;
      margin: 0;
      padding: 0;
      legend {
        font-weight: 700;
        font-size: 0.9375rem;
        padding: 0;
        margin-bottom: 6px;
      }
    }
    a {
      color: inherit;
      font-weight: 700;
    }
  `,
})
export class HeadSignup {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly session = inject(DemoSession);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly min = PASSWORD_MIN;
  protected readonly types = AGENCY_TYPES;
  protected readonly errors = SIGNUP_ERROR;
  protected readonly f = this.demo.forms.agency;
  protected readonly tried = signal(false);
  protected readonly errorCode = signal<string | null>(null);
  protected readonly phoneOk = computed(() => !!normalizePhone(this.f().phone));
  protected readonly filled = computed(() => {
    const f = this.f();
    return !!(f.agency_name.trim() && f.name.trim() && f.phone && f.password);
  });

  protected set<K extends keyof SignupForm>(key: K, value: SignupForm[K]): void {
    this.f.update((f) => ({ ...f, [key]: value }));
    this.errorCode.set(null);
  }

  /** ของจริง: POST /auth/signup/agency { agency: { name, type }, head: { name, phone, password }, terms_version } */
  protected submit(): void {
    this.tried.set(true);
    const e = this.demo.signupAgency(this.f(), nowHHmm());
    if (e === 'TERMS_NOT_ACCEPTED') return;
    if (e) {
      this.errorCode.set(e);
      return;
    }
    // สมัครแล้ว = ล็อกอินอยู่ แต่ยังไม่มีบทบาทจนกว่าแอดมินอนุมัติหน่วยงาน
    this.session.signIn('head', [], normalizePhone(this.f().phone) ?? '');
    void this.router.navigateByUrl(screenUrl('L02'));
  }
}

// ── L02 · รอแอดมินตรวจ (+ L02-b ไม่อนุมัติ) ─────────────────────

@Component({
  selector: 'app-head-pending',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack grow">
      @if (state() === 'rejected') {
        <div class="result">
          <span class="big-icon danger" aria-hidden="true">✕</span>
          <h1>{{ i18n.t({ th: 'ไม่อนุมัติ', en: 'Not approved' }) }}</h1>
          <p class="muted small">{{ i18n.t({ th: 'แอดมินไม่อนุมัติหน่วยงานนี้', en: 'The admin did not approve this agency' }) }}</p>
        </div>
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'เหตุผล', en: 'Reason' }) }}</dt>
            <dd>{{ i18n.t({ th: 'ข้อมูลไม่ครบ', en: 'Incomplete details' }) }}</dd>
          </dl>
        </section>
        <div class="stack push-end">
          <button type="button" class="btn" (click)="contact()">{{ i18n.t({ th: 'ติดต่อผู้ดูแล', en: 'Contact the admin' }) }}</button>
          <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
        </div>
      } @else {
        <div class="result">
          <span class="big-icon danger dots" aria-hidden="true">•••</span>
          <h1>{{ i18n.t({ th: 'รอแอดมินตรวจ', en: 'Waiting for the admin' }) }}</h1>
          <p class="muted small">{{ i18n.t({ th: 'ส่งคำขอแล้ว ปกติใช้ไม่เกิน 1 วันทำการ', en: 'Request sent — usually within 1 working day' }) }}</p>
        </div>
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ req().name }}</dd>
            <dt>{{ i18n.t({ th: 'ประเภท', en: 'Type' }) }}</dt><dd>{{ i18n.t(type(req().type)) }}</dd>
            <dt>{{ i18n.t({ th: 'ส่งเมื่อ', en: 'Sent' }) }}</dt><dd>{{ req().at }}</dd>
          </dl>
        </section>
        <div class="stack push-end">
          <button type="button" class="btn" (click)="check()">{{ i18n.t({ th: 'ตรวจสถานะอีกครั้ง', en: 'Check again' }) }}</button>
          <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
          <div class="demo-tools">
            {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
            <button type="button" (click)="approved()">{{ i18n.t({ th: 'แอดมินอนุมัติ', en: 'Admin approves' }) }}</button>
            <button type="button" (click)="rejected()">{{ i18n.t({ th: 'แอดมินไม่อนุมัติ', en: 'Admin declines' }) }}</button>
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
export class HeadPending {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  /** ?state=rejected = L02-b (ของจริง: Me.agency_status + reject_reason) */
  readonly state = input<string>();
  protected readonly type = typeLabel;
  protected readonly req = computed(() => this.demo.agencyRequest() ?? { name: 'สภ.บางพลี', type: 'police' as const, at: '26 ต.ค. 10:42' });

  protected check(): void {
    this.toast.show({ th: 'ยังรอแอดมินตรวจอยู่', en: 'Still waiting for the admin' });
  }

  protected approved(): void {
    void this.router.navigateByUrl(screenUrl('L03'));
  }

  protected rejected(): void {
    void this.router.navigate([screenUrl('L02')], { queryParams: { state: 'rejected' } });
  }

  protected contact(): void {
    contactNotSet(this.toast);
  }

  protected signout(): void {
    void this.router.navigateByUrl(screenUrl('A04'));
  }
}

// ── L03 · อนุมัติแล้ว · แชร์รหัสกลุ่ม ─────────────────────────────

const NEXT_STEPS: Step[] = [
  { title: { th: 'ยืนยันลูกทีม', en: 'Approve your team' }, sub: { th: 'เมนู "สมาชิก"', en: '“Members” tab' } },
  { title: { th: 'สร้างโซน + ใส่บ้าน', en: 'Create zones + add houses' }, sub: { th: 'เมนู "โซน"', en: '“Zones” tab' } },
  { title: { th: 'ตั้งเวลาตรวจ', en: 'Set patrol hours' }, sub: { th: 'เช่น 06:00–09:00', en: 'e.g. 06:00–09:00' } },
];

@Component({
  selector: 'app-head-approved',
  imports: [PageHeader, Steps],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="agency() + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })" [title]="i18n.t({ th: 'อนุมัติแล้ว', en: 'Approved' })" [bell]="url('L09')" />
    <div class="stack">
      <section class="code-card">
        <p class="small strong">{{ i18n.t({ th: 'รหัสกลุ่มของหน่วยงาน', en: 'Your agency’s group code' }) }}</p>
        <p class="code">{{ code }}</p>
        <p class="small">{{ i18n.t({ th: 'ส่งให้ลูกทีมใช้ตอนสมัคร', en: 'Your team uses it to sign up' }) }}</p>
      </section>
      <div class="two">
        <button type="button" class="btn secondary" (click)="copy()">{{ i18n.t({ th: 'คัดลอกรหัสกลุ่ม', en: 'Copy code' }) }}</button>
        <button type="button" class="btn" (click)="share()">{{ i18n.t({ th: 'แชร์ให้ลูกทีม', en: 'Share with team' }) }}</button>
      </div>
      <h2 class="section-title">{{ i18n.t({ th: 'ต่อไปต้องทำ', en: 'Next steps' }) }}</h2>
      <app-steps [steps]="steps" [current]="0" />
    </div>
  `,
  styles: `
    .code-card {
      text-align: center;
      padding: 18px 16px;
      border-radius: var(--radius);
      background: var(--ok-bg);
      color: var(--ok);
    }
    .strong {
      font-weight: 700;
    }
    .code {
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      font-variant-numeric: tabular-nums;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
  `,
})
export class HeadApproved {
  protected readonly i18n = inject(I18n);
  private readonly head = inject(HeadDemo);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly steps = NEXT_STEPS;
  /** ของจริง: ได้จาก GET /agency (group_code) หลังแอดมินอนุมัติ */
  protected readonly code = 'PX7K-2MQ9';
  protected readonly agency = computed(() => this.i18n.t({ th: this.head.agency.name, en: this.head.agency.name_en }));

  constructor() {
    // อนุมัติแล้ว: หัวหน้าได้บทบาท officer + head (api.md §9.2)
    const s = inject(DemoSession);
    s.addRole('officer');
    s.addRole('head');
    s.role.set('head');
  }

  private text(): string {
    // ไม่ฮาร์ดโค้ดโดเมน — ใช้ origin ที่เปิดอยู่
    return this.i18n.t({
      th: `รหัสกลุ่ม ${this.agency()}: ${this.code}\nสมัครเจ้าหน้าที่ที่ ${location.origin}${screenUrl('A10')}`,
      en: `${this.agency()} group code: ${this.code}\nSign up as an officer at ${location.origin}${screenUrl('A10')}`,
    });
  }

  protected copy(): void {
    void navigator.clipboard?.writeText(this.code).catch(() => undefined);
    this.toast.show({ th: 'คัดลอกรหัสกลุ่มแล้ว', en: 'Code copied' });
  }

  /** แชร์ผ่านเมนูแชร์ของมือถือ (ไม่มี = คัดลอกข้อความแทน) */
  protected share(): void {
    const text = this.text();
    if (navigator.share) {
      void navigator.share({ text }).catch(() => undefined);
      return;
    }
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    this.toast.show({ th: 'คัดลอกข้อความเชิญแล้ว', en: 'Invite text copied' });
  }
}
