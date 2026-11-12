import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiError } from '../../core/api';
import { HeadApi, showGroupCode, type Agency } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
import { Session } from '../../core/session';
import { AuthDemo, normalizePhone, PASSWORD_MIN, type SignupForm } from '../../core/mock/auth-demo';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';
import { PushStatus } from '../../shared/push-status';
import { Steps, type Step } from '../../shared/steps';
import { SIGNUP_ERROR } from '../auth/auth-owner';
import { ContactCard } from '../../shared/contact-card';
import { PasswordField, TermsCheck } from '../auth/auth-parts';
import { AgencyFields, agencyDetailPayload, agencyDetailValid, emptyAgencyDetail } from '../../shared/agency-fields';
import { emptyExtras, extrasPayload, extrasValid, ProfileExtras } from '../../shared/profile-extras';

// หัวหน้า: L01 สมัครหน่วยงาน → L02 รอแอดมิน (L02-b ไม่อนุมัติ) → L03 อนุมัติแล้ว แชร์รหัสกลุ่ม
// ใช้ API จริง (api.md §2 signup/agency, §8.1, §9.2)

const AGENCY_TYPES: { v: SignupForm['agency_type']; label: Tr }[] = [
  { v: 'police', label: { th: 'ตำรวจ', en: 'Police' } },
  { v: 'guard', label: { th: 'รปภ.', en: 'Guards' } },
  { v: 'other', label: { th: 'อื่น ๆ', en: 'Other' } },
];
const typeLabel = (v: SignupForm['agency_type']) => AGENCY_TYPES.find((t) => t.v === v)!.label;

// ── L01 · สมัครหน่วยงาน ─────────────────────────────────────

@Component({
  selector: 'app-head-signup',
  imports: [PageHeader, PasswordField, TermsCheck, RouterLink, AgencyFields, ProfileExtras],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ขั้น ' + step() + ' จาก 3', en: 'Step ' + step() + ' of 3' })" [title]="i18n.t({ th: 'สมัครหน่วยงาน', en: 'Register an agency' })" [back]="step() === 1 ? url('A05') : undefined" />
    <span class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="3" [attr.aria-valuenow]="step()"><span [style.width.%]="(step() / 3) * 100"></span></span>
    <form class="stack grow" (submit)="$event.preventDefault(); step() < 3 ? next() : submit()">
      @if (step() === 1) {
      <section class="form-section">
        <h2 class="form-title">{{ i18n.t({ th: 'ผู้สมัคร (หัวหน้าหน่วยงาน)', en: 'Applicant (agency head)' }) }}</h2>
      <label class="field" [class.invalid]="tried() && !f().name.trim()">
        <span>{{ i18n.t({ th: 'ชื่อหัวหน้า (ยศ)', en: 'Head’s name (with rank)' }) }}</span>
        <input autocomplete="name" [value]="f().name" (input)="set('name', $any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && !phoneOk()">
        <span>{{ i18n.t({ th: 'เบอร์โทรศัพท์', en: 'Phone number' }) }}</span>
        <input type="tel" inputmode="tel" autocomplete="tel" [value]="f().phone" (input)="set('phone', $any($event.target).value)" />
        <small class="easy-hide">{{ i18n.t({ th: 'ใช้เข้าสู่ระบบ · ผู้ดูแลระบบใช้ติดต่อตอนตรวจคำขอ', en: 'Used to sign in · the admin may call while reviewing' }) }}</small>
      </label>
      <app-password-field [isNew]="true" [value]="f().password" (valueChange)="set('password', $event)" [invalid]="tried() && f().password.length < min" />
      </section>
      <app-profile-extras kind="head" [(value)]="headExtras" [tried]="tried()" />
      }
      @if (step() === 2) {
      <section class="form-section">
        <h2 class="form-title">{{ i18n.t({ th: 'ข้อมูลหน่วยงาน', en: 'Agency details' }) }}</h2>
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
      <label class="field" [class.invalid]="tried() && !contactOk()">
        <span>{{ i18n.t({ th: 'ช่องทางติดต่อหน่วยงาน', en: 'Agency contact' }) }}</span>
        <input maxlength="200" [placeholder]="i18n.t({ th: 'เช่น สถานี 02-111-2222', en: 'e.g. Station 02-111-2222' })" [value]="f().contact" (input)="set('contact', $any($event.target).value)" />
        <small class="easy-hide">{{ i18n.t({ th: 'แสดงให้คนที่ขอเข้าหน่วยงานเห็น — ใส่เฉพาะที่ยินดีเปิดเผย', en: 'Shown to people asking to join — only what you are happy to share' }) }}</small>
      </label>
      <label class="field" [class.invalid]="tried() && !f().agency_address.trim()">
        <span>{{ i18n.t({ th: 'ที่ตั้งหน่วยงาน', en: 'Agency address' }) }}</span>
        <input maxlength="300" autocomplete="street-address" [placeholder]="i18n.t({ th: 'เช่น สภ.เมือง ถ.ราชดำเนิน อ.เมือง จ.เชียงใหม่', en: 'e.g. Muang Police Station, Ratchadamnoen Rd, Chiang Mai' })" [value]="f().agency_address" (input)="set('agency_address', $any($event.target).value)" />
      </label>
      <label class="field">
        <span>{{ i18n.t({ th: 'เลขทะเบียนหน่วยงาน / ใบอนุญาต (ไม่บังคับ)', en: 'Registration / licence no. (optional)' }) }}</span>
        <input maxlength="100" autocomplete="off" [value]="f().registration_no" (input)="set('registration_no', $any($event.target).value)" />
        <small class="easy-hide">{{ i18n.t({ th: 'ผู้ดูแลระบบใช้ประกอบการอนุมัติ ไม่แสดงให้คนอื่นเห็น', en: 'Used by the admin when approving · not shown to others' }) }}</small>
      </label>
      </section>
      <section class="form-section">
        <h2 class="form-title">{{ i18n.t({ th: 'ที่ตั้งและช่องทางติดต่อ', en: 'Location and contact' }) }}</h2>
        <app-agency-fields [(value)]="detail" [tried]="tried()" />
      </section>
      }
      @if (step() === 3) {
      <app-terms-check from="L01" [checked]="f().terms" (checkedChange)="set('terms', $event)" [showError]="termsTried() && !f().terms" />
      }
      @if (errorCode(); as e) {
        <p class="danger-text small" role="alert">
          {{ i18n.t(errors[e]) }}
          @if (e === 'PHONE_TAKEN') {
            · <a [routerLink]="url('A04')">{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</a>
          }
        </p>
      }
      @if (step() < 3) {
        <button type="button" class="btn push-end" (click)="next()">{{ i18n.t({ th: 'ถัดไป', en: 'Next' }) }}</button>
      } @else {
        <button type="submit" class="btn push-end" [disabled]="busy()">{{ i18n.t({ th: 'ส่งคำขอหน่วยงาน', en: 'Send agency request' }) }}</button>
      }
      @if (step() > 1) {
        <button type="button" class="btn secondary" (click)="step.set(step() - 1)">{{ i18n.t({ th: 'ย้อนกลับ', en: 'Back' }) }}</button>
      }
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
        margin-block-end: 6px;
      }
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
export class HeadSignup {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly session = inject(Session);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly url = screenUrl;
  protected readonly min = PASSWORD_MIN;
  protected readonly types = AGENCY_TYPES;
  protected readonly errors = SIGNUP_ERROR;
  protected readonly f = this.demo.forms.agency;
  protected readonly tried = signal(false);
  /** กดส่งทั้งที่ยังไม่ติ๊กยอมรับ — ค่อยเตือน (แบบเดียวกับ A06/A10/A15/A16) */
  protected readonly termsTried = signal(false);
  /** 1 บัญชีหัวหน้า · 2 ข้อมูลหน่วยงาน · 3 ข้อตกลง (ตามแคนวาสดีไซน์) */
  protected readonly step = signal(1);
  protected readonly detail = signal(emptyAgencyDetail());
  protected readonly headExtras = signal(emptyExtras());
  protected readonly errorCode = signal<string | null>(null);
  protected readonly phoneOk = computed(() => !!normalizePhone(this.f().phone));
  protected readonly contactOk = computed(() => this.f().contact.trim().length >= 3);
  protected readonly filled = computed(() => {
    const f = this.f();
    return !!(f.agency_name.trim() && f.name.trim() && f.phone && f.password && f.contact.trim());
  });

  protected set<K extends keyof SignupForm>(key: K, value: SignupForm[K]): void {
    this.f.update((f) => ({ ...f, [key]: value }));
    this.errorCode.set(null);
  }

  protected next(): void {
    this.tried.set(true);
    const f = this.f();
    if (this.step() === 1 && (!f.name.trim() || !normalizePhone(f.phone) || f.password.length < this.min || !extrasValid(this.headExtras(), 'head'))) return;
    if (this.step() === 2 && (!f.agency_name.trim() || !this.contactOk() || !f.agency_address.trim() || !agencyDetailValid(this.detail()))) return;
    this.tried.set(false);
    this.step.update((n) => n + 1);
  }

  /** POST /auth/signup/agency { agency: { name, type, contact }, head: { name, phone, password }, terms_version } → ล็อกอินแล้ว รอแอดมินอนุมัติ */
  protected async submit(): Promise<void> {
    this.tried.set(true);
    this.termsTried.set(true);
    const f = this.f();
    const phone = normalizePhone(f.phone);
    if (!f.terms) return;
    if (!f.agency_name.trim() || !f.name.trim() || !phone || f.password.length < this.min || !this.contactOk() || !f.agency_address.trim() || !agencyDetailValid(this.detail()) || !extrasValid(this.headExtras(), 'head')) {
      this.errorCode.set('INVALID');
      return;
    }
    this.busy.set(true);
    try {
      const terms = await firstValueFrom(this.http.get<{ version: string }>('/api/v1/terms/current'));
      await firstValueFrom(
        this.http.post('/api/v1/auth/signup/agency', {
          agency: {
            name: f.agency_name.trim(),
            type: f.agency_type,
            contact: f.contact.trim(),
            address: f.agency_address.trim(),
            registration_no: f.registration_no.trim() || undefined,
            ...agencyDetailPayload(this.detail()),
          },
          head: { name: f.name.trim(), phone, password: f.password, ...(Object.keys(extrasPayload(this.headExtras(), 'head')).length ? { profile: extrasPayload(this.headExtras(), 'head') } : {}) },
          terms_version: terms.version,
        }),
      );
      await this.session.refresh();
      this.f.set({ ...f, password: '' });
      void this.router.navigateByUrl(screenUrl('L02'), { replaceUrl: true });
    } catch (err) {
      const e = apiError(err);
      this.errorCode.set(e.code === 'PHONE_TAKEN' ? 'PHONE_TAKEN' : 'INVALID');
    } finally {
      this.busy.set(false);
    }
  }
}

// ── L02 · รอแอดมินตรวจ (+ L02-b ไม่อนุมัติ) ─────────────────────

@Component({
  selector: 'app-head-pending',
  imports: [ContactCard, PushStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack grow">
      @if (state() === 'rejected') {
        <div class="result">
          <span class="big-icon danger" aria-hidden="true">✕</span>
          <h1>{{ i18n.t({ th: 'ไม่อนุมัติ', en: 'Not approved' }) }}</h1>
          <p class="muted small">{{ i18n.t({ th: 'ผู้ดูแลระบบไม่อนุมัติหน่วยงานนี้', en: 'The admin did not approve this agency' }) }}</p>
        </div>
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'เหตุผล', en: 'Reason' }) }}</dt>
            <dd>{{ req()?.reject_reason || '-' }}</dd>
          </dl>
        </section>
        <app-contact-card [label]="{ th: 'ติดต่อผู้ดูแลระบบ', en: 'Contact the admin' }" [contact]="support()" />
        <div class="stack push-end">
          <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
        </div>
      } @else {
        <div class="result">
          <span class="big-icon danger dots" aria-hidden="true">•••</span>
          <h1>{{ i18n.t({ th: 'รอผู้ดูแลระบบตรวจ', en: 'Waiting for the admin' }) }}</h1>
          <p class="muted small">{{ i18n.t({ th: 'ส่งคำขอแล้ว ปกติใช้ไม่เกิน 1 วันทำการ', en: 'Request sent — usually within 1 working day' }) }}</p>
        </div>
        <section class="card easy-hide">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ req()?.name }}</dd>
            @if (req(); as r) {
              <dt>{{ i18n.t({ th: 'ประเภท', en: 'Type' }) }}</dt><dd>{{ i18n.t(type(r.type)) }}</dd>
            }
          </dl>
        </section>
        <!-- โหมดละเอียด: สถานะจริงจาก /agency + /me (ตาม AuthPending_A) -->
        <section class="card adv-only">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' }) }}</dt><dd>{{ realSession.me()?.push?.subscribed ? i18n.t({ th: 'เปิดแล้ว', en: 'on' }) : i18n.t({ th: 'ยังไม่เปิด', en: 'off' }) }}</dd>
          </dl>
          <p class="muted small">{{ i18n.t({ th: 'ระหว่างรอ หัวหน้าต้องอนุมัติก่อน จึงจะใช้งานฟังก์ชันเจ้าหน้าที่ได้', en: 'Your head must approve the request before officer features become available.' }) }}</p>
        </section>
        <div class="easy-only">
          <app-push-status [compact]="true" />
        </div>
        <div class="stack push-end">
          <button type="button" class="btn" (click)="check()">{{ i18n.t({ th: 'ตรวจสถานะอีกครั้ง', en: 'Check again' }) }}</button>
          <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
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
export class HeadPending implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(HeadApi);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  /** ?state=rejected = L02-b */
  readonly state = input<string>();
  protected readonly type = typeLabel;
  /** GET /agency (หัวหน้าของหน่วยงานที่ยังรอดูได้) */
  protected readonly req = signal<Agency | null>(null);
  /** GET /api/v1/support */
  protected readonly support = signal('');

  async ngOnInit(): Promise<void> {
    this.req.set(await this.api.loadAgency().catch(() => null));
    const s = await firstValueFrom(this.http.get<{ contact: string | null }>('/api/v1/support')).catch(() => null);
    this.support.set(s?.contact ?? '');
  }

  /** อนุมัติแล้ว → L03 (ต้องโหลด Me ใหม่ให้ได้บทบาท head) · ไม่อนุมัติ → L02-b */
  protected async check(): Promise<void> {
    const a = await this.api.loadAgency().catch(() => null);
    this.req.set(a);
    if (a?.status === 'approved') {
      await this.realSession.refresh();
      this.realSession.use('head');
      void this.router.navigateByUrl(screenUrl('L03'), { replaceUrl: true });
    } else if (a?.status === 'rejected') {
      void this.router.navigate([screenUrl('L02')], { queryParams: { state: 'rejected' }, replaceUrl: true });
    } else {
      this.toast.show({ th: 'ยังรอผู้ดูแลระบบตรวจอยู่', en: 'Still waiting for the admin' });
    }
  }

  protected readonly realSession = inject(Session);
  /** ออกจากระบบจริง (ลบ session ที่ server + cookie) */
  protected signout(): void {
    void this.realSession.signout().then(() => this.router.navigateByUrl(screenUrl('A04'), { replaceUrl: true }));
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
        <p class="code">{{ code() }}</p>
        <p class="small">{{ i18n.t({ th: 'ส่งให้ลูกทีมใช้ตอนสมัคร', en: 'Your team uses it to sign up' }) }}</p>
      </section>
      <div class="two">
        <button type="button" class="btn secondary" (click)="copy()">{{ i18n.t({ th: 'คัดลอกรหัสกลุ่ม', en: 'Copy code' }) }}</button>
        <button type="button" class="btn" (click)="share()">{{ i18n.t({ th: 'แชร์ให้ลูกทีม', en: 'Share with team' }) }}</button>
      </div>
      <section class="card contact">
        <span class="muted small">{{ i18n.t({ th: 'ช่องทางติดต่อหน่วยงาน (แสดงให้คนที่ขอเข้าเห็น)', en: 'Agency contact (shown to people asking to join)' }) }}</span>
        @if (editingContact()) {
          <input class="contact-input" maxlength="200" [value]="draft()" (input)="draft.set($any($event.target).value)" />
          @if (draft().trim().length < 3) {
            <span class="danger-text small">{{ i18n.t({ th: 'อย่างน้อย 3 ตัวอักษร', en: 'At least 3 characters' }) }}</span>
          }
          <div class="two">
            <button type="button" class="btn secondary" (click)="editingContact.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
            <button type="button" class="btn" [disabled]="draft().trim().length < 3" (click)="saveContact()">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
          </div>
        } @else {
          <strong>{{ api.agency()?.contact }}</strong>
          <button type="button" class="btn secondary" (click)="editContact()">{{ i18n.t({ th: 'แก้ไข', en: 'Edit' }) }}</button>
        }
      </section>
      <h2 class="section-title easy-hide">{{ i18n.t({ th: 'ต่อไปต้องทำ', en: 'Next steps' }) }}</h2>
      <div class="easy-hide"><app-steps [steps]="steps" [current]="0" /></div>
      <section class="card adv-only">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'ช่องทางติดต่อ', en: 'Contact' }) }}</dt><dd>{{ api.agency()?.contact ?? '—' }}</dd>
        </dl>
      </section>
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
    .contact {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .contact-input {
      min-block-size: 48px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }
  `,
})
export class HeadApproved implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  protected readonly editingContact = signal(false);
  protected readonly draft = signal('');

  ngOnInit(): void {
    void this.api.loadAgency().catch(() => undefined);
  }

  protected editContact(): void {
    this.draft.set(this.api.agency()?.contact ?? '');
    this.editingContact.set(true);
  }

  /** PATCH /agency { contact } */
  protected async saveContact(): Promise<void> {
    if (this.draft().trim().length < 3) return;
    try {
      await this.api.setContact(this.draft().trim());
      this.editingContact.set(false);
      this.toast.show({ th: 'บันทึกช่องทางติดต่อแล้ว', en: 'Contact saved' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save — try again' });
    }
  }
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly steps = NEXT_STEPS;
  /** GET /agency (group_code) — มีหลังแอดมินอนุมัติ */
  protected readonly code = computed(() => showGroupCode(this.api.agency()?.group_code ?? null));
  protected readonly agency = computed(() => this.api.agency()?.name ?? '');
  protected readonly agencyId = computed(() => this.api.agency()?.id ?? '');

  private text(): string {
    // ไม่ฮาร์ดโค้ดโดเมน — ใช้ origin ที่เปิดอยู่
    return this.i18n.t({
      th: `รหัสกลุ่ม ${this.agency()}: ${this.code()}\nสมัครเจ้าหน้าที่ที่ ${location.origin}${screenUrl('A10')}`,
      en: `${this.agency()} group code: ${this.code()}\nSign up as an officer at ${location.origin}${screenUrl('A10')}`,
    });
  }

  protected copy(): void {
    void navigator.clipboard?.writeText(this.code()).catch(() => undefined);
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
