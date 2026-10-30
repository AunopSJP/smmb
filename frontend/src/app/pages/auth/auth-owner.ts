import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';
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

// เจ้าของบ้าน: A06 สมัคร → A07 สแกน QR เปิดใช้ตู้ → A08 ตั้งชื่อตู้ → A09 เสร็จ (api.md §2, §4.1) — ใช้ API จริง

/** api.md §4.2 */
interface BoxSummary {
  id: string;
  name: string;
  house_no: string;
  status: string;
}

export const SIGNUP_ERROR: Record<string, Tr> = {
  PHONE_TAKEN: { th: 'เบอร์นี้มีบัญชีแล้ว — ล็อกอินแล้วเพิ่มบทบาทแทน', en: 'This number already has an account — sign in and add the role instead' },
  GROUP_CODE_INVALID: { th: 'รหัสกลุ่มไม่ถูกต้อง — ตรวจกับหัวหน้าอีกครั้ง', en: 'Group code not found — check it with your head' },
  INVALID: { th: 'กรอกข้อมูลให้ครบและถูกต้อง', en: 'Please complete the form correctly' },
};

// ── A06 · สมัครเจ้าของบ้าน (+ A06-b ไม่ยอมรับข้อตกลง) ──────────────

@Component({
  selector: 'app-auth-signup-owner',
  imports: [RouterLink, PageHeader, PasswordField, TermsCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ขั้น 1 จาก 2', en: 'Step 1 of 2' })" [title]="i18n.t({ th: 'สมัครเจ้าของบ้าน', en: 'Homeowner sign-up' })" [back]="url('A05')" />
    <form class="stack grow" (submit)="$event.preventDefault(); submit()">
      <label class="field" [class.invalid]="tried() && !f().name.trim()">
        <span>{{ i18n.t({ th: 'ชื่อ - นามสกุล', en: 'Full name' }) }}</span>
        <input autocomplete="name" [value]="f().name" (input)="set('name', $any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && !phoneOk()">
        <span>{{ i18n.t({ th: 'เบอร์โทรศัพท์', en: 'Phone number' }) }}</span>
        <input type="tel" inputmode="tel" autocomplete="tel" [value]="f().phone" (input)="set('phone', $any($event.target).value)" />
        <small>{{ i18n.t({ th: 'ใช้ล็อกอิน · เจ้าหน้าที่เห็นเฉพาะตอนคุณกด SOS', en: 'Used to sign in · officers see it only during your SOS' }) }}</small>
      </label>
      <app-password-field [isNew]="true" [value]="f().password" (valueChange)="set('password', $event)" [invalid]="tried() && f().password.length < min" />
      <label class="field" [class.invalid]="tried() && !f().house_no.trim()">
        <span>{{ i18n.t({ th: 'บ้านเลขที่', en: 'House number' }) }}</span>
        <input autocomplete="address-line1" [value]="f().house_no" (input)="set('house_no', $any($event.target).value)" />
      </label>
      <label class="field">
        <span>{{ i18n.t({ th: 'หมู่บ้าน / ย่าน (ไม่บังคับ)', en: 'Village / area (optional)' }) }}</span>
        <input maxlength="100" autocomplete="address-level3" [placeholder]="i18n.t({ th: 'เช่น หมู่บ้านสุขใจ', en: 'e.g. Sukjai Village' })" [value]="f().area" (input)="set('area', $any($event.target).value)" />
        <small>{{ i18n.t({ th: 'ช่วยให้เจ้าหน้าที่แยกบ้านเลขที่ซ้ำกันคนละหมู่บ้าน', en: 'Helps officers tell apart the same house number in different villages' }) }}</small>
      </label>
      <app-terms-check from="A06" [checked]="f().terms" (checkedChange)="set('terms', $event)" [showError]="filled() && !f().terms" />

      @if (error(); as e) {
        <p class="danger-text small" role="alert">
          {{ i18n.t(e) }}
          @if (errorCode() === 'PHONE_TAKEN') {
            · <a [routerLink]="url('A04')">{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</a>
          }
        </p>
      }
      <button type="submit" class="btn push-end" [disabled]="!f().terms || busy()">{{ i18n.t({ th: 'สมัครและไปผูกตู้', en: 'Sign up and add my mailbox' }) }}</button>
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
export class AuthSignupOwner implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AuthDemo);
  private readonly session = inject(Session);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly url = screenUrl;
  protected readonly min = PASSWORD_MIN;
  /** ?state=no-terms = A06-b (กรอกครบแต่ยังไม่ติ๊กยอมรับ) */
  readonly state = input<string>();
  protected readonly f = this.demo.forms.owner;
  protected readonly tried = signal(false);
  protected readonly errorCode = signal<string | null>(null);
  protected readonly error = computed(() => (this.errorCode() ? SIGNUP_ERROR[this.errorCode()!] : null));
  protected readonly phoneOk = computed(() => !!normalizePhone(this.f().phone));
  protected readonly filled = computed(() => {
    const f = this.f();
    return !!(f.name.trim() && f.phone && f.password && f.house_no.trim());
  });

  ngOnInit(): void {
    if (this.state() === 'no-terms') {
      this.f.set({ ...this.f(), name: 'สมศรี ใจดี', phone: '089-123-4567', password: 'demo-pass', house_no: '99/9', terms: false });
    }
  }

  protected set<K extends keyof SignupForm>(key: K, value: SignupForm[K]): void {
    this.f.update((f) => ({ ...f, [key]: value }));
    this.errorCode.set(null);
  }

  /** POST /auth/signup/owner { name, phone, password, house_no, terms_version } → ได้ cookie = ล็อกอินแล้ว */
  protected async submit(): Promise<void> {
    this.tried.set(true);
    const f = this.f();
    const phone = normalizePhone(f.phone);
    if (!f.terms || !f.name.trim() || !phone || f.password.length < this.min || !f.house_no.trim()) {
      if (f.terms) this.errorCode.set('INVALID');
      return;
    }
    this.busy.set(true);
    try {
      const terms = await firstValueFrom(this.http.get<{ version: string }>('/api/v1/terms/current'));
      await firstValueFrom(
        this.http.post('/api/v1/auth/signup/owner', { name: f.name.trim(), phone, password: f.password, house_no: f.house_no.trim(), area: f.area.trim() || undefined, terms_version: terms.version }),
      );
      await this.session.refresh();
      this.session.use('owner');
      this.f.set({ ...f, password: '' });
      void this.router.navigateByUrl(screenUrl('A07'));
    } catch (err) {
      const e = apiError(err);
      this.errorCode.set(e.code === 'PHONE_TAKEN' ? 'PHONE_TAKEN' : 'INVALID');
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
          <button type="button" class="btn push-end" (click)="retry()">{{ i18n.t({ th: 'สแกนใหม่', en: 'Scan again' }) }}</button>
        </div>
      }
      @case ('taken') {
        <div class="stack grow">
          <div class="result">
            <span class="big-icon danger" aria-hidden="true">✕</span>
            <h1>{{ i18n.t({ th: 'ตู้นี้ถูกผูกแล้ว', en: 'This mailbox is already bound' }) }}</h1>
            <p class="muted small">
              {{ i18n.t({ th: 'ตู้นี้มีเจ้าของอยู่แล้ว', en: 'It already has an owner.' }) }}<br />
              {{ i18n.t({ th: 'กรุณาติดต่อผู้ดูแลระบบ พร้อมรหัสใต้ QR', en: 'Contact the admin with the code under the QR' }) }}
            </p>
          </div>
          <app-contact-card [label]="{ th: 'ติดต่อผู้ดูแลระบบ', en: 'Contact the admin' }" [contact]="support()" />
          <div class="stack push-end">
            <button type="button" class="btn secondary" (click)="retry()">{{ i18n.t({ th: 'สแกนใหม่', en: 'Scan again' }) }}</button>
          </div>
        </div>
      }
      @default {
        <app-page-header [caption]="i18n.t({ th: 'ขั้น 2 จาก 2', en: 'Step 2 of 2' })" [title]="i18n.t({ th: 'ผูกตู้กับบัญชี', en: 'Add your mailbox' })" [back]="url('A06')" />
        <div class="stack grow">
          <app-steps [steps]="steps" [current]="1" />
          @if (needSignin()) {
            <p class="info-box">
              {{ i18n.t({ th: 'ล็อกอินหรือสมัครเจ้าของบ้านก่อน แล้วระบบจะพากลับมาผูกตู้นี้', en: 'Sign in or sign up first — we’ll bring you back to bind this box' }) }}<br />
              <a [routerLink]="url('A04')" [queryParams]="{ next: here() }">{{ i18n.t({ th: 'เข้าสู่ระบบ', en: 'Sign in' }) }}</a> ·
              <a [routerLink]="url('A06')">{{ i18n.t({ th: 'สมัครเจ้าของบ้าน', en: 'Sign up' }) }}</a>
            </p>
          } @else if (qr()) {
            <p class="info-box ok-text"><strong>{{ i18n.t({ th: 'เปิดจากลิงก์ QR เปิดใช้ตู้แล้ว — กดผูกตู้ได้เลย', en: 'Opened from the activation QR link — tap to bind' }) }}</strong></p>
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
      width: min(100%, 300px);
      align-self: center;
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
  /** ?state=invalid|taken = A07-b / A07-c · ?qr= มาจากลิงก์ /a/<token> (กล้องมือถือธรรมดาเปิดลิงก์มา) */
  readonly state = input<string>();
  readonly qr = input<string>();
  protected readonly view = computed(() => (this.state() === 'invalid' || this.state() === 'taken' ? this.state() : 'scan'));
  protected readonly typing = signal(false);
  protected readonly scanning = signal(false);
  protected readonly busy = signal(false);
  protected readonly needSignin = signal(false);
  protected readonly message = signal<Tr | null>(null);
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
    try {
      const r = await firstValueFrom(this.http.post<{ box: BoxSummary }>('/api/v1/boxes/activate', body));
      this.session.use('owner');
      void this.router.navigate([screenUrl('A08')], { queryParams: { box: r.box.id } });
    } catch (err) {
      const e = apiError(err);
      if (e.code === 'BOX_ALREADY_OWNED' || e.code === 'QR_INVALID') {
        void this.router.navigate([screenUrl('A07')], { queryParams: { state: e.code === 'BOX_ALREADY_OWNED' ? 'taken' : 'invalid' } });
      } else if (e.code === 'CODE_ATTEMPTS_EXCEEDED') {
        this.message.set({ th: 'พิมพ์ผิดหลายครั้ง รอสักครู่แล้วลองใหม่', en: 'Too many wrong codes — wait a moment and retry' });
      } else if (e.status === 404 || e.status === 401) {
        // ยังไม่มีบทบาทเจ้าของบ้าน / ยังไม่ล็อกอิน
        this.message.set({ th: 'บัญชีนี้ยังไม่ใช่เจ้าของบ้าน — เพิ่มบทบาทเจ้าของบ้านก่อน', en: 'This account isn’t a homeowner yet — add the homeowner role first' });
      } else {
        this.message.set({ th: 'ผูกตู้ไม่ได้ ลองใหม่อีกครั้ง', en: 'Couldn’t bind the box — try again' });
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected retry(): void {
    void this.router.navigateByUrl(screenUrl('A07'));
  }
}

// ── A08 · ตั้งชื่อตู้ ───────────────────────────────────────

@Component({
  selector: 'app-auth-name-box',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ขั้น 2 จาก 2', en: 'Step 2 of 2' })" [title]="i18n.t({ th: 'ตั้งชื่อตู้', en: 'Name your mailbox' })" [back]="url('A07')" />
    <form class="stack grow" (submit)="$event.preventDefault(); save()">
      <p class="ok-text found"><app-icon name="check" [size]="18" /> {{ i18n.t({ th: 'พบตู้ ', en: 'Found mailbox ' }) }}{{ boxId() }}{{ i18n.t({ th: ' แล้ว', en: '' }) }}</p>
      <label class="field" [class.invalid]="!valid()">
        <span>{{ i18n.t({ th: 'ชื่อตู้', en: 'Mailbox name' }) }}</span>
        <input maxlength="40" [value]="name()" (input)="name.set($any($event.target).value)" />
        <small>{{ i18n.t({ th: 'ไม่เกิน 40 ตัว', en: 'Up to 40 characters' }) }}</small>
      </label>
      <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'ชื่อแนะนำ', en: 'Suggestions' })">
        @for (s of suggestions; track s.th) {
          <button type="button" [attr.aria-pressed]="name() === i18n.t(s)" (click)="name.set(i18n.t(s))">{{ i18n.t(s) }}</button>
        }
      </div>
      @if (failed()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'บันทึกไม่ได้ ลองใหม่อีกครั้ง', en: 'Couldn’t save — try again' }) }}</p>
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
      void this.router.navigate([screenUrl('A09')], { queryParams: { box: this.box() } });
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
      <button type="button" class="btn on-color push-end" (click)="home()">{{ i18n.t({ th: 'ไปหน้าหลัก', en: 'Go to home' }) }}</button>
    </div>
  `,
  styles: `
    .done {
      background: #157347;
      color: #fff;
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
      color: #157347 !important;
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
