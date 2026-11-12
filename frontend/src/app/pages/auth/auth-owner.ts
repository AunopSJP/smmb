import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiError } from '../../core/api';
import { I18n, type Tr } from '../../core/i18n';
import { AuthDemo, normalizePhone, PASSWORD_MIN, type SignupForm } from '../../core/mock/auth-demo';
import { Session } from '../../core/session';
import { QrScanner } from '../../shared/qr-scanner';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { Steps, type Step } from '../../shared/steps';
import { ContactCard } from '../../shared/contact-card';
import { PasswordField, TermsCheck } from './auth-parts';
import { emptyHouseProfile, HouseFields, houseProfilePayload, houseProfileValid } from '../../shared/house-fields';
import { TERMS_VERSION } from '../../core/terms';

// เจ้าของบ้าน: A06 สมัคร → A07 สแกน QR เปิดใช้ตู้ → A08 ตั้งชื่อตู้ → A09 เสร็จ (api.md §2, §4.1) — ใช้ API จริง

/** api.md §4.2 */
interface BoxSummary {
  id: string;
  name: string;
  house_no: string;
  status: string;
}

export const SIGNUP_ERROR: Record<string, Tr> = {
  PHONE_TAKEN: { th: 'เบอร์นี้มีบัญชีแล้ว — เข้าสู่ระบบแล้วเพิ่มบทบาทแทน', en: 'This number already has an account — sign in and add the role instead' },
  GROUP_CODE_INVALID: { th: 'รหัสกลุ่มไม่ถูกต้อง — ตรวจสอบกับหัวหน้าอีกครั้ง', en: 'Group code not found — check it with your head' },
  INVALID: { th: 'กรอกข้อมูลให้ครบและถูกต้อง', en: 'Please complete the form correctly' },
  NETWORK: { th: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not reach the server — check your internet and try again' },
  SERVER: { th: 'เซิร์ฟเวอร์ขัดข้อง — ลองอีกครั้งภายหลัง', en: 'The server is having trouble — try again later' },
};

// ── A06 · สมัครเจ้าของบ้าน (+ A06-b ไม่ยอมรับข้อตกลง) ──────────────

@Component({
  selector: 'app-auth-signup-owner',
  imports: [RouterLink, PageHeader, PasswordField, TermsCheck, HouseFields],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ขั้น ' + step() + ' จาก 3', en: 'Step ' + step() + ' of 3' })" [title]="i18n.t({ th: 'สมัครเจ้าของบ้าน', en: 'Homeowner sign-up' })" [back]="step() === 1 ? url('A05') : undefined" />
    <span class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="3" [attr.aria-valuenow]="step()"><span [style.width.%]="(step() / 3) * 100"></span></span>
    <form class="stack grow" (submit)="$event.preventDefault(); step() < 3 ? next() : submit()">
      @if (stepError(); as e) {
        <p class="card err" role="alert" id="signup-error">{{ i18n.t(e) }}</p>
      }
      @if (step() === 1) {
      <section class="form-section">
        <h2 class="form-title">{{ i18n.t({ th: 'ข้อมูลบัญชี', en: 'Your account' }) }}</h2>
      <label class="field" [class.invalid]="tried() && !f().name.trim()">
        <span>{{ i18n.t({ th: 'ชื่อ - นามสกุล', en: 'Full name' }) }}</span>
        <input autocomplete="name" [value]="f().name" (input)="set('name', $any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && !phoneOk()">
        <span>{{ i18n.t({ th: 'เบอร์โทรศัพท์', en: 'Phone number' }) }}</span>
        <input type="tel" inputmode="tel" autocomplete="tel" [value]="f().phone" (input)="set('phone', $any($event.target).value)" />
        <small class="easy-hide">{{ i18n.t({ th: 'ใช้เข้าสู่ระบบ · เจ้าหน้าที่เห็นเฉพาะตอนคุณกด SOS', en: 'Used to sign in · officers see it only during your SOS' }) }}</small>
      </label>
      <app-password-field [isNew]="true" [value]="f().password" (valueChange)="set('password', $event)" [invalid]="tried() && f().password.length < min" />
      <p class="small easy-only">{{ i18n.t({ th: 'รหัสผ่านอย่างน้อย 8 ตัว · ลืมแล้วติดต่อผู้ดูแลระบบ', en: 'At least 8 characters · if you forget it, contact the admin' }) }}</p>
      
      </section>
      }
      @if (step() === 2) {
      <section class="form-section">
        <h2 class="form-title">{{ i18n.t({ th: 'บ้านของคุณ', en: 'Your house' }) }}</h2>
      <label class="field" [class.invalid]="tried() && !f().house_no.trim()">
        <span>{{ i18n.t({ th: 'บ้านเลขที่', en: 'House number' }) }}</span>
        <input autocomplete="address-line1" [value]="f().house_no" (input)="set('house_no', $any($event.target).value)" />
      </label>
      <label class="field easy-hide">
        <span>{{ i18n.t({ th: 'หมู่บ้าน / ย่าน (ไม่บังคับ)', en: 'Village / area (optional)' }) }}</span>
        <input maxlength="100" autocomplete="address-level3" [placeholder]="i18n.t({ th: 'เช่น หมู่บ้านสุขใจ', en: 'e.g. Sukjai Village' })" [value]="f().area" (input)="set('area', $any($event.target).value)" />
        <small>{{ i18n.t({ th: 'ช่วยให้เจ้าหน้าที่แยกบ้านเลขที่ซ้ำกันคนละหมู่บ้าน', en: 'Helps officers tell apart the same house number in different villages' }) }}</small>
      </label>
      </section>
      <app-house-fields [(value)]="house" [tried]="tried()" />
      <p class="small easy-only">{{ i18n.t({ th: 'ปักหมุดบ้านช่วยให้เจ้าหน้าที่มาถึงเร็วขึ้นตอน SOS', en: 'Pinning your house helps officers reach you faster during SOS' }) }}</p>
      
      }
      @if (step() === 3) {
      <app-terms-check from="A06" [checked]="f().terms" (checkedChange)="set('terms', $event)" [showError]="termsTried() && !f().terms" />
      
      }

      @if (error(); as e) {
        <p class="danger-text small" role="alert">
          {{ i18n.t(e) }}
          @if (errorCode(); as code) {
            
          }
          @if (errorCode() === 'PHONE_TAKEN') {
            · <a [routerLink]="url('A04')">{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</a>
          }
        </p>
      }
      @if (step() < 3) {
        <button type="button" class="btn push-end" (click)="next()">{{ i18n.t({ th: 'ถัดไป', en: 'Next' }) }}</button>
      } @else {
        <button type="submit" class="btn push-end" [disabled]="busy()">{{ i18n.t({ th: 'สมัครและไปผูกตู้', en: 'Sign up and add my mailbox' }) }}</button>
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
export class AuthSignupOwner implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly session = inject(Session);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly url = screenUrl;
  protected readonly min = PASSWORD_MIN;
  protected readonly version = TERMS_VERSION;
  /** ?state=no-terms = A06-b (กรอกครบแต่ยังไม่ติ๊กยอมรับ) */
  readonly state = input<string>();
  protected readonly f = this.demo.forms.owner;
  protected readonly tried = signal(false);
  /** กดสมัครทั้งที่ยังไม่ติ๊กยอมรับ — ค่อยเตือน (ไม่ขึ้นแดงตั้งแต่เพิ่งมาถึงขั้นนี้) */
  protected readonly termsTried = signal(false);
  /** ขั้นของฟอร์ม 1 บัญชี · 2 บ้าน · 3 ข้อตกลง (ตามแคนวาสดีไซน์) — จำไว้ใน AuthDemo เพื่อกลับจากข้อตกลงแล้วไม่เริ่มใหม่ */
  protected readonly step = this.demo.ownerStep;
  /** ที่อยู่ + หมุด + ผู้ติดต่อฉุกเฉิน (✅ 2026-11-04) — เก็บร่างใน AuthDemo */
  protected readonly house = signal(this.demo.ownerHouseForm() ?? emptyHouseProfile());
  /** สรุปว่าขั้นนี้ยังขาดอะไร — แสดงเป็นข้อความ ไม่ใช่แค่ขอบแดง */
  protected readonly stepError = computed<Tr | null>(() => {
    if (!this.tried()) return null;
    const f = this.f();
    if (this.step() === 1) {
      if (!f.name.trim()) return { th: 'กรอกชื่อ - นามสกุล', en: 'Enter your full name' };
      if (!normalizePhone(f.phone)) return { th: 'กรอกเบอร์โทร 10 หลักให้ถูกต้อง', en: 'Enter a valid 10-digit phone number' };
      if (f.password.length < this.min) return { th: `รหัสผ่านต้องมีอย่างน้อย ${this.min} ตัว`, en: `Password must be at least ${this.min} characters` };
    }
    if (this.step() === 2) {
      if (!f.house_no.trim()) return { th: 'กรอกบ้านเลขที่', en: 'Enter the house number' };
      if (!houseProfileValid(this.house())) return { th: 'กรอกที่อยู่บ้าน ประเภทบ้าน รหัสไปรษณีย์ และจำนวนผู้อยู่อาศัยให้ครบ (ช่องที่มีขอบแดง)', en: 'Fill in the home address, house type, postal code and number of residents (red fields)' };
    }
    return null;
  });
  protected readonly errorCode = signal<string | null>(null);
  protected readonly error = computed(() => (this.errorCode() ? SIGNUP_ERROR[this.errorCode()!] : null));
  protected readonly phoneOk = computed(() => !!normalizePhone(this.f().phone));
  protected readonly filled = computed(() => {
    const f = this.f();
    return !!(f.name.trim() && f.phone && f.password && f.house_no.trim());
  });

  constructor() {
    // เก็บร่างข้อมูลบ้านไว้ให้กลับจากหน้าข้อตกลงได้
    effect(() => this.demo.ownerHouseForm.set(this.house()));
  }

  ngOnInit(): void {
    // A06-b: กลับมาขั้น 3 (ข้อตกลง) ได้เฉพาะเมื่อมีร่างจริงอยู่แล้ว — ห้ามเติมข้อมูลตัวอย่างแทนผู้ใช้
    if (this.state() === 'no-terms' && this.filled()) this.step.set(3);
  }

  protected set<K extends keyof SignupForm>(key: K, value: SignupForm[K]): void {
    this.f.update((f) => ({ ...f, [key]: value }));
    this.errorCode.set(null);
  }

  protected next(): void {
    this.tried.set(true);
    if (this.stepError()) {
      setTimeout(() => document.getElementById('signup-error')?.scrollIntoView({ block: 'center' }), 0);
      return;
    }
    this.tried.set(false);
    this.step.update((n) => n + 1);
  }

  /** POST /auth/signup/owner { name, phone, password, house_no, terms_version } → ได้ cookie = ล็อกอินแล้ว */
  protected async submit(): Promise<void> {
    this.tried.set(true);
    this.termsTried.set(true);
    const f = this.f();
    const phone = normalizePhone(f.phone);
    if (!f.terms || !f.name.trim() || !phone || f.password.length < this.min || !f.house_no.trim() || !houseProfileValid(this.house())) {
      if (f.terms) this.errorCode.set('INVALID');
      return;
    }
    this.busy.set(true);
    try {
      const terms = await firstValueFrom(this.http.get<{ version: string }>('/api/v1/terms/current'));
      await firstValueFrom(
        this.http.post('/api/v1/auth/signup/owner', { name: f.name.trim(), phone, password: f.password, house_no: f.house_no.trim(), area: f.area.trim() || undefined, ...houseProfilePayload(this.house()), terms_version: terms.version }),
      );
      await this.session.refresh();
      this.session.use('owner');
      this.f.set({ ...f, password: '' });
      this.house.set(emptyHouseProfile());
      this.demo.ownerHouseForm.set(null);
      this.demo.ownerStep.set(1);
      void this.router.navigate([screenUrl('A07')], { queryParams: { from: 'A06' }, replaceUrl: true });
    } catch (err) {
      const e = apiError(err);
      this.errorCode.set(e.code === 'PHONE_TAKEN' ? 'PHONE_TAKEN' : e.status === 0 ? 'NETWORK' : (e.status ?? 0) >= 500 ? 'SERVER' : 'INVALID');
    } finally {
      this.busy.set(false);
    }
  }
}

// ── A07 · ผูกตู้กับบัญชี (+ A07-b QR ไม่ถูกต้อง · A07-c ตู้มีเจ้าของแล้ว) ──

const ACTIVATE_STEPS: Step[] = [
  { title: { th: 'เปิดฝาตู้', en: 'Open the box lid' }, sub: { th: 'QR เปิดใช้ตู้ อยู่ด้านในตู้', en: 'The activation QR is inside the box' } },
  { title: { th: 'สแกน QR เปิดใช้ตู้', en: 'Scan the activation QR' }, sub: { th: 'ใช้ได้ครั้งเดียว', en: 'Works only once' } },
  { title: { th: 'ตั้งชื่อตู้', en: 'Name your mailbox' }, sub: { th: 'เช่น ตู้หน้าบ้าน', en: 'e.g. Front gate' } },
];

@Component({
  selector: 'app-auth-activate',
  imports: [PageHeader, Steps, Icon, ContactCard, RouterLink, QrScanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (view()) {
      @case ('invalid') {
        <div class="stack grow">
          <div class="result">
            <span class="big-icon warn" aria-hidden="true">!</span>
            <h1>{{ i18n.t({ th: 'QR ไม่ถูกต้อง', en: 'Not the right QR' }) }}</h1>
            <p class="muted small">
              {{ i18n.t({ th: 'ต้องใช้ QR เปิดใช้ตู้ ที่อยู่ด้านในตู้', en: 'Use the activation QR inside the box,' }) }}<br />
              {{ i18n.t({ th: 'ไม่ใช่ QR ที่ติดหน้าตู้', en: 'not the QR on the front' }) }}
            </p>
          </div>
          <p class="info-box muted">{{ i18n.t({ th: 'ระบบบันทึกการลองครั้งนี้ไว้แล้ว', en: 'This attempt has been logged' }) }}</p>
          <div class="stack push-end">
            <button type="button" class="btn" (click)="retry()">{{ i18n.t({ th: 'สแกนใหม่', en: 'Scan again' }) }}</button>
            <button type="button" class="btn secondary" (click)="retry(true)">{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR แทน', en: 'Type the code instead' }) }}</button>
            <a class="later" [routerLink]="backUrl()">{{ i18n.t({ th: 'ไว้ทีหลัง', en: 'Not now' }) }}</a>
          </div>
        </div>
      }
      @case ('taken') {
        <div class="stack grow">
          <div class="result">
            <span class="big-icon danger" aria-hidden="true">✕</span>
            <h1>{{ i18n.t({ th: 'ตู้นี้ถูกผูกแล้ว', en: 'This mailbox is already bound' }) }}</h1>
            <p class="muted small">
              {{ i18n.t({ th: 'ตู้นี้มีเจ้าของอยู่แล้ว', en: 'It already has an owner.' }) }}<br />
              {{ i18n.t({ th: 'โปรดติดต่อผู้ดูแลระบบ พร้อมรหัสใต้ QR', en: 'Contact the admin with the code under the QR' }) }}
            </p>
          </div>
          <app-contact-card [label]="{ th: 'ติดต่อผู้ดูแลระบบ', en: 'Contact the admin' }" [contact]="support()" />
          <div class="stack push-end">
            <button type="button" class="btn secondary" (click)="retry()">{{ i18n.t({ th: 'สแกนใหม่', en: 'Scan again' }) }}</button>
          </div>
        </div>
      }
      @default {
        <app-page-header [caption]="i18n.t({ th: 'ผูกตู้', en: 'Link a mailbox' })" [title]="i18n.t({ th: 'ผูกตู้กับบัญชี', en: 'Add your mailbox' })" [back]="backUrl()" />
        <div class="stack grow">
          <app-steps [steps]="steps" [current]="1" />
          @if (needSignin()) {
            <p class="info-box">
              {{ i18n.t({ th: 'เข้าสู่ระบบหรือสมัครเจ้าของบ้านก่อน แล้วระบบจะพากลับมาผูกตู้นี้', en: 'Sign in or sign up first — we’ll bring you back to bind this box' }) }}<br />
              <a [routerLink]="url('A04')" [queryParams]="{ next: here() }">{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</a> ·
              <a [routerLink]="url('A06')">{{ i18n.t({ th: 'สมัครเจ้าของบ้าน', en: 'Sign up' }) }}</a>
            </p>
          } @else if (qr()) {
            <p class="info-box ok-text"><strong>{{ i18n.t({ th: 'เปิดจากลิงก์ QR เปิดใช้ตู้แล้ว — กดผูกตู้ได้ทันที', en: 'Opened from the activation QR link — tap to bind' }) }}</strong></p>
            
          } @else if (scanning()) {
            <app-qr-scanner (scanned)="send({ qr_text: $event.text })" (failed)="scanning.set(false); typing.set(true)" />
          }
          @if (message(); as m) {
            <p class="danger-text small" role="alert">{{ i18n.t(m) }}</p>
          }
          @if (typing()) {
            <label class="field">
              <span>{{ i18n.t({ th: 'รหัสใต้ QR เปิดใช้ตู้', en: 'Code under the activation QR' }) }}</span>
              <input autocomplete="off" autocapitalize="characters" spellcheck="false" [placeholder]="i18n.t({ th: 'เช่น K7M2-QX9A', en: 'e.g. K7M2-QX9A' })" [value]="code()" (input)="code.set($any($event.target).value)" />
            </label>
          }
          <div class="stack push-end">
            @if (typing()) {
              <button type="button" class="btn" [disabled]="code().replace('-', '').length < 8 || busy() || needSignin()" (click)="byCode()">{{ i18n.t({ th: 'ผูกตู้', en: 'Bind mailbox' }) }}</button>
              <button type="button" class="btn secondary" (click)="typing.set(false)">{{ i18n.t({ th: 'กลับไปสแกน', en: 'Back to scanning' }) }}</button>
            } @else {
              <button type="button" class="btn" [disabled]="busy() || needSignin() || scanning()" (click)="scan()">
                <app-icon name="scan" [size]="22" />
                {{ qr() ? i18n.t({ th: 'ผูกตู้นี้กับบัญชี', en: 'Bind this mailbox' }) : i18n.t({ th: 'สแกน QR เปิดใช้ตู้', en: 'Scan the activation QR' }) }}
              </button>
              <button type="button" class="btn secondary" (click)="typing.set(true)">{{ i18n.t({ th: 'พิมพ์รหัสใต้ QR', en: 'Type the code under the QR' }) }}</button>
            }
          </div>
        </div>
      }
    }
  `,
  styles: `
    .grow {
      flex: 1;
    }
    app-qr-scanner {
      inline-size: min(100%, 300px);
      align-self: center;
    }
    .later {
      align-self: center;
      padding: 10px 16px;
      color: var(--text-muted);
      font-weight: 600;
    }
  `,
})
export class AuthActivate implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly steps = ACTIVATE_STEPS;
  readonly from = input<string>();
  protected readonly backUrl = computed(() => {
    const from = this.from();
    // เพิ่งสมัครเสร็จ (มาจาก A06) = ล็อกอินแล้ว — ย้อนกลับต้องไปหน้าหลัก ไม่ใช่ฟอร์มสมัครซ้ำ
    if (from === 'A06' && this.session.me()) return screenUrl('H03');
    if (from) {
      try {
        return screenUrl(from);
      } catch {
        // Ignore invalid return codes and choose a destination from the session.
      }
    }
    const me = this.session.me();
    if (!me) return screenUrl('A06');
    if (me.roles.includes('head')) return screenUrl('L04');
    if (me.roles.includes('officer')) return screenUrl('O13');
    return screenUrl('H13');
  });
  /** ?state=invalid|taken = A07-b / A07-c · ?qr= มาจากลิงก์ /a/<token> (กล้องมือถือธรรมดาเปิดลิงก์มา) */
  readonly state = input<string>();
  readonly qr = input<string>();
  protected readonly view = computed(() => (this.state() === 'invalid' || this.state() === 'taken' ? this.state() : 'scan'));
  protected readonly typing = signal(false);
  protected readonly scanning = signal(false);
  protected readonly busy = signal(false);
  protected readonly needSignin = signal(false);
  protected readonly message = signal<Tr | null>(null);
  protected readonly failCode = signal<string | null>(null);
  protected readonly code = signal('');
  protected readonly support = signal<string | null>(null);
  protected readonly here = computed(() => screenUrl('A07') + (this.qr() ? `?qr=${encodeURIComponent(this.qr()!)}` : ''));

  async ngOnInit(): Promise<void> {
    const me = await this.session.ensure();
    this.needSignin.set(!me);
    if (this.view() === 'taken') {
      const r = await firstValueFrom(this.http.get<{ contact: string | null }>('/api/v1/support')).catch(() => null);
      this.support.set(r?.contact ?? null);
    }
  }

  /** มาจากลิงก์ → ผูกเลย · ไม่งั้นเปิดกล้อง */
  protected scan(): void {
    const token = this.qr();
    if (token) void this.send({ qr_text: new URL(`a/${token}`, document.baseURI).href });
    else this.scanning.set(true);
  }

  protected byCode(): void {
    void this.send({ code: this.code() });
  }

  /** POST /boxes/activate { qr_text } | { code } → A08 · ตัดสินจาก code ของ error */
  protected async send(body: { qr_text: string } | { code: string }): Promise<void> {
    this.scanning.set(false);
    this.busy.set(true);
    this.message.set(null);
    this.failCode.set(null);
    try {
      const r = await firstValueFrom(this.http.post<{ box: BoxSummary }>('/api/v1/boxes/activate', body));
      this.session.use('owner');
      void this.router.navigate([screenUrl('A08')], { queryParams: { box: r.box.id, from: this.from() }, replaceUrl: true });
    } catch (err) {
      const e = apiError(err);
      this.failCode.set(e.code ? `${e.code} · HTTP ${e.status}` : `HTTP ${e.status}`);
      if (e.code === 'QR_INVALID' && 'code' in body) {
        // พิมพ์รหัสผิด (มักพิมพ์ตก/ใช้รหัสหน้าตู้) — อยู่หน้าเดิม รหัสที่พิมพ์ไว้ไม่หาย แก้แล้วกดใหม่ได้เลย
        this.message.set({ th: 'รหัสไม่ถูกต้อง — ใช้รหัสใต้ QR เปิดใช้ตู้ที่อยู่ด้านในตู้ (ไม่ใช่รหัสหน้าตู้) แล้วตรวจตัวอักษรอีกครั้ง', en: 'Wrong code — use the code under the activation QR inside the box (not the one on the front) and check each character' });
      } else if (e.code === 'BOX_ALREADY_OWNED' || e.code === 'QR_INVALID') {
        void this.router.navigate([screenUrl('A07')], { queryParams: { state: e.code === 'BOX_ALREADY_OWNED' ? 'taken' : 'invalid', from: this.from() }, replaceUrl: true });
      } else if (e.code === 'CODE_ATTEMPTS_EXCEEDED') {
        this.message.set({ th: 'พิมพ์ผิดหลายครั้ง รอสักครู่แล้วลองอีกครั้ง', en: 'Too many wrong codes — wait a moment and retry' });
      } else if (e.status === 404 || e.status === 401) {
        // ยังไม่มีบทบาทเจ้าของบ้าน / ยังไม่ล็อกอิน
        this.message.set({ th: 'บัญชีนี้ยังไม่ใช่เจ้าของบ้าน — เพิ่มบทบาทเจ้าของบ้านก่อน', en: 'This account isn’t a homeowner yet — add the homeowner role first' });
      } else {
        this.message.set({ th: 'ผูกตู้ไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t bind the box — try again' });
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected retry(typing = false): void {
    this.typing.set(typing);
    this.message.set(null);
    void this.router.navigate([screenUrl('A07')], { queryParams: { from: this.from() }, replaceUrl: true });
  }
}

// ── A08 · ตั้งชื่อตู้ ───────────────────────────────────────

@Component({
  selector: 'app-auth-name-box',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ผูกตู้', en: 'Link a mailbox' })" [title]="i18n.t({ th: 'ตั้งชื่อตู้', en: 'Name your mailbox' })" [back]="backUrl()" />
    <form class="stack grow" (submit)="$event.preventDefault(); save()">
      <p class="ok-text found"><app-icon name="check" [size]="18" /> {{ i18n.t({ th: 'พบตู้ ', en: 'Found mailbox ' }) }}{{ boxId() }}{{ i18n.t({ th: ' แล้ว', en: '' }) }}</p>
      <label class="field" [class.invalid]="!valid()">
        <span>{{ i18n.t({ th: 'ชื่อตู้', en: 'Mailbox name' }) }}</span>
        <input maxlength="40" [value]="name()" (input)="name.set($any($event.target).value)" />
        <small class="easy-hide">{{ i18n.t({ th: 'ไม่เกิน 40 ตัว', en: 'Up to 40 characters' }) }}</small>
      </label>
      
      <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'ชื่อแนะนำ', en: 'Suggestions' })">
        @for (s of suggestions; track s.th) {
          <button type="button" [attr.aria-pressed]="name() === i18n.t(s)" (click)="name.set(i18n.t(s))">{{ i18n.t(s) }}</button>
        }
      </div>
      @if (failed()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save — try again' }) }}</p>
      }
      <button type="submit" class="btn push-end" [disabled]="!valid()">{{ i18n.t({ th: 'บันทึกชื่อตู้', en: 'Save name' }) }}</button>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .found {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
    }
    .segmented {
      flex-wrap: wrap;
    }
  `,
})
export class AuthNameBox {
  protected readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  readonly from = input<string>();
  protected readonly backUrl = computed(() => {
    const from = this.from();
    return from ? `${screenUrl('A07')}?from=${encodeURIComponent(from)}` : screenUrl('A07');
  });
  /** ?box=BX-00042 */
  readonly box = input<string>('');
  protected readonly boxId = computed(() => this.box());
  protected readonly name = signal('');
  protected readonly failed = signal(false);
  protected readonly valid = computed(() => {
    const n = this.name().trim();
    return n.length >= 1 && n.length <= 40;
  });
  protected readonly suggestions: Tr[] = [
    { th: 'ตู้หน้าบ้าน', en: 'Front gate' },
    { th: 'ตู้ประตูหลัง', en: 'Back door' },
    { th: 'บ้านแม่', en: "Mum's house" },
  ];

  /** PATCH /boxes/:box_id { name } */
  protected async save(): Promise<void> {
    if (!this.valid()) return;
    this.failed.set(false);
    try {
      await firstValueFrom(this.http.patch(`/api/v1/boxes/${encodeURIComponent(this.box())}`, { name: this.name().trim() }));
      void this.router.navigate([screenUrl('A09')], { queryParams: { box: this.box() }, replaceUrl: true });
    } catch {
      this.failed.set(true);
    }
  }
}

// ── A09 · ตู้เป็นของคุณแล้ว ──────────────────────────────────

@Component({
  selector: 'app-auth-owner-done',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad done" role="status">
      <div class="result">
        <span class="big-icon white"><app-icon name="check" [size]="36" /></span>
        <h1>{{ i18n.t({ th: 'ตู้เป็นของคุณแล้ว', en: 'The mailbox is yours' }) }}</h1>
        <p>{{ boxInfo()?.name }} · {{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ boxInfo()?.house_no }}</p>
      </div>
      <p class="summary">
        <strong>{{ i18n.t({ th: 'ต่อไป', en: 'Next' }) }}</strong><br />
        <span class="small">{{ i18n.t({ th: 'รอหัวหน้าหน่วยงานเพิ่มบ้านเข้าโซน ระหว่างนี้หน้าหลักจะขึ้นว่า "ยังไม่มีเจ้าหน้าที่ดูแล"', en: 'An agency head will add your house to a zone. Until then your home screen says “No officer yet”' }) }}</span>
      </p>
      @if (boxInfo(); as b) {
        <p class="small">{{ i18n.t({ th: 'ตู้ ', en: 'Mailbox ' }) }}{{ b.house_no }}{{ b.name ? ' · ' + b.name : '' }}</p>
      }
      <button type="button" class="btn on-color push-end" (click)="home()">{{ i18n.t({ th: 'ไปหน้าหลัก', en: 'Go to home' }) }}</button>
    </div>
  `,
  styles: `
    .done {
      background: var(--success-bg);
      color: var(--success-fg);
    }
    .result h1 {
      font-size: 1.5rem;
    }
    .summary {
      background: rgb(255 255 255 / 15%);
      border-radius: var(--radius-sm);
      padding: 12px 14px;
    }
    .on-color {
      color: var(--success-text) !important;
    }
  `,
})
export class AuthOwnerDone implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly box = input<string>('');
  protected readonly boxInfo = signal<BoxSummary | null>(null);

  async ngOnInit(): Promise<void> {
    const boxes = await firstValueFrom(this.http.get<BoxSummary[]>('/api/v1/boxes')).catch(() => []);
    this.boxInfo.set(boxes.find((b) => b.id === this.box()) ?? boxes[0] ?? null);
  }

  protected home(): void {
    void this.router.navigateByUrl('/home');
  }
}
