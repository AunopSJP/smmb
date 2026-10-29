import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiError } from '../../core/api';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { Session } from '../../core/session';
import { AuthDemo, formatPhone, PASSWORD_MIN, ROLE_HOME, type SignupForm } from '../../core/mock/auth-demo';
import { DemoSession, type DemoRole } from '../../core/mock/demo-session';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { PasswordField, TermsCheck } from './auth-parts';

// บัญชีที่มีอยู่แล้ว: A14 เปลี่ยนรหัสผ่าน · A15 เพิ่มบทบาทเจ้าของบ้าน · A16 ขอเข้าหน่วยงาน · ส่วน "บัญชี" + สลับบทบาท
// ไม่มีใน wireframe — เพิ่มตาม api.md §2; actions ใช้ API จริง ส่วน state ของร่างฟอร์มเก็บในเครื่อง

const ROLE_LABEL: Record<DemoRole, { label: Tr; icon: IconName }> = {
  owner: { label: { th: 'เจ้าของบ้าน', en: 'Homeowner' }, icon: 'home' },
  officer: { label: { th: 'เจ้าหน้าที่ (ตรวจตู้)', en: 'Officer (inspections)' }, icon: 'shield' },
  head: { label: { th: 'หัวหน้าหน่วยงาน', en: 'Agency head' }, icon: 'user' },
  admin: { label: { th: 'แอดมิน', en: 'Admin' }, icon: 'settings' },
};

/** หน้าที่กดเข้ามา → กลับไปหน้านั้น */
const backTo = (code: string | undefined, fallback: string) => {
  try {
    return screenUrl(code ?? fallback);
  } catch {
    return screenUrl(fallback);
  }
};

const ADD_ROLE_ERROR: Record<string, Tr> = {
  ROLE_EXISTS: { th: 'บัญชีนี้มีบทบาทนี้อยู่แล้ว หรือมีคำขอค้างอยู่', en: 'This account already has this role or a pending request' },
  ADMIN_ROLE_EXCLUSIVE: { th: 'บัญชีแอดมินเพิ่มบทบาทอื่นไม่ได้', en: 'Admin accounts cannot have other roles' },
  GROUP_CODE_INVALID: { th: 'รหัสกลุ่มไม่ถูกต้อง — ตรวจกับหัวหน้าอีกครั้ง', en: 'Group code not found — check it with your head' },
  INVALID: { th: 'กรอกข้อมูลให้ครบ', en: 'Please fill in the form' },
};

// ── ส่วน "บัญชี" ในหน้าตั้งค่า/บัญชีของแต่ละบทบาท ───────────────────

@Component({
  selector: 'app-account-actions',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="section-title">{{ i18n.t({ th: 'บัญชี', en: 'Account' }) }}</h2>
    <nav class="list">
      @for (r of switchTo(); track r) {
        <button type="button" class="row as-button" (click)="switchRole(r)">
          <span class="icon-bubble"><app-icon [name]="roles[r].icon" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'ใช้งานเป็น', en: 'Switch to ' }) }}{{ i18n.t(roles[r].label) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'บัญชีเดียวกัน ไม่ต้องล็อกอินใหม่', en: 'Same account, no new sign-in' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </button>
      }
      @if (session.agencyPending()) {
        <a class="row" [routerLink]="url('A11')">
          <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'คำขอเข้าหน่วยงาน', en: 'Agency request' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'หัวหน้ายังไม่ได้ยืนยัน', en: 'Your head has not approved it yet' }) }}</span>
          </span>
          <span class="chip warn">{{ i18n.t({ th: 'รอ', en: 'Waiting' }) }}</span>
        </a>
      } @else if (canJoin()) {
        <a class="row" [routerLink]="url('A16')" [queryParams]="{ from: from() }">
          <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'ขอเข้าหน่วยงาน', en: 'Join an agency' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'เป็นเจ้าหน้าที่ด้วย? ใช้รหัสกลุ่มจากหัวหน้า', en: 'Also an officer? Use your head’s group code' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      }
      @if (canAddOwner()) {
        <a class="row" [routerLink]="url('A15')" [queryParams]="{ from: from() }">
          <span class="icon-bubble"><app-icon name="home" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'เพิ่มบทบาทเจ้าของบ้าน', en: 'Add the homeowner role' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'มีตู้ที่บ้าน? ใช้บัญชีนี้ ไม่ต้องสมัครใหม่', en: 'Mailbox at home? Same account, no new sign-up' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      }
      <a class="row" [routerLink]="url('A14')" [queryParams]="{ from: from() }">
        <span class="icon-bubble"><app-icon name="settings" [size]="20" /></span>
        <span class="grow">
          <strong>{{ i18n.t({ th: 'เปลี่ยนรหัสผ่าน', en: 'Change password' }) }}</strong>
          <span class="muted small block">{{ i18n.t({ th: 'เปลี่ยนแล้วต้องล็อกอินใหม่ทุกเครื่อง', en: 'You will be signed out on every device' }) }}</span>
        </span>
        <app-icon name="chevronRight" [size]="18" />
      </a>
    </nav>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .as-button {
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
export class AccountActions {
  protected readonly i18n = inject(I18n);
  protected readonly session = inject(DemoSession);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly roles = ROLE_LABEL;
  /** หน้าจอของบทบาทไหนที่เปิดอยู่ */
  readonly current = input.required<DemoRole>();
  /** รหัสหน้านี้ (ให้หน้าถัดไปย้อนกลับมาถูก) */
  readonly from = input.required<string>();

  protected readonly switchTo = computed(() => this.session.roles().filter((r) => r !== this.current()));
  /** แอดมินมีบทบาทอื่นร่วมไม่ได้ (ADMIN_ROLE_EXCLUSIVE) */
  protected readonly canAddOwner = computed(() => !this.session.roles().includes('owner') && !this.session.roles().includes('admin'));
  protected readonly canJoin = computed(() => !this.session.roles().includes('officer') && !this.session.roles().includes('admin'));

  /** สลับหน้าจอฝั่งเว็บ — session ไม่มี "โหมดปัจจุบัน" (สิทธิ์ตรวจจากบทบาทที่ route ต้องใช้) */
  protected switchRole(r: DemoRole): void {
    this.session.role.set(r);
    void this.router.navigateByUrl(ROLE_HOME[r]);
  }
}

// ── A14 · เปลี่ยนรหัสผ่าน (+ บังคับหลังถูกรีเซ็ต) ─────────────────────

@Component({
  selector: 'app-auth-change-password',
  imports: [PageHeader, PasswordField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (forced()) {
      <app-page-header [caption]="i18n.t({ th: 'ต้องทำก่อนใช้งาน', en: 'Required before you continue' })" [title]="i18n.t({ th: 'ตั้งรหัสผ่านใหม่', en: 'Set a new password' })" />
    } @else {
      <app-page-header [title]="i18n.t({ th: 'เปลี่ยนรหัสผ่าน', en: 'Change password' })" [back]="backUrl()" />
    }
    <form class="stack grow" (submit)="$event.preventDefault(); submit()">
      @if (forced()) {
        <p class="info-box">
          <strong>{{ i18n.t({ th: 'หัวหน้าหรือแอดมินรีเซ็ตรหัสให้คุณ', en: 'Your head or the admin reset your password' }) }}</strong><br />
          <span class="muted small">{{ i18n.t({ th: 'ใส่รหัสชั่วคราวที่ได้รับ แล้วตั้งรหัสใหม่ที่จำได้ — ยังใช้หน้าอื่นไม่ได้จนกว่าจะเปลี่ยน', en: 'Enter the temporary password you were given, then choose one you will remember — nothing else works until you do' }) }}</span>
        </p>
      }
      @if (error(); as e) {
        <p class="card err" role="alert">{{ i18n.t(e) }}</p>
      }
      <app-password-field
        [label]="forced() ? { th: 'รหัสชั่วคราว', en: 'Temporary password' } : { th: 'รหัสผ่านปัจจุบัน', en: 'Current password' }"
        [(value)]="current"
      />
      <app-password-field [label]="{ th: 'รหัสผ่านใหม่', en: 'New password' }" [isNew]="true" [(value)]="next" [invalid]="tried() && !nextOk()" />
      <app-password-field [label]="{ th: 'ยืนยันรหัสผ่านใหม่', en: 'Repeat new password' }" [isNew]="true" [hint]="false" [(value)]="confirm" [invalid]="tried() && !match()" />
      @if (tried() && !match()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'รหัสใหม่สองช่องไม่ตรงกัน', en: 'The new passwords do not match' }) }}</p>
      } @else if (tried() && same()) {
        <p class="danger-text small" role="alert">{{ i18n.t({ th: 'ใช้รหัสเดิมไม่ได้ ตั้งรหัสใหม่', en: 'Choose a different password' }) }}</p>
      }
      <p class="muted small">{{ i18n.t({ th: 'เปลี่ยนแล้ว ทุกเครื่องจะออกจากระบบ ต้องล็อกอินใหม่ด้วยรหัสใหม่', en: 'After changing, every device is signed out — sign in again with the new password' }) }}</p>
      <div class="stack push-end">
        <button type="submit" class="btn" [disabled]="!current() || !next() || !confirm()">{{ i18n.t({ th: 'บันทึกรหัสใหม่', en: 'Save new password' }) }}</button>
        @if (forced()) {
          <button type="button" class="btn secondary" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
        }
      </div>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .err {
      background: var(--danger-bg);
      color: var(--sos);
      box-shadow: none;
      font-weight: 700;
    }
  `,
})
export class AuthChangePassword {
  protected readonly i18n = inject(I18n);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  /** ?forced=1 หลังถูกรีเซ็ต (Me.must_change_password / 403 PASSWORD_CHANGE_REQUIRED) · ?from= หน้าที่กดมา */
  readonly forcedParam = input<string | undefined>(undefined, { alias: 'forced' });
  readonly from = input<string>();
  protected readonly forced = computed(() => this.forcedParam() === '1');
  protected readonly backUrl = computed(() => backTo(this.from(), 'A04'));

  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly confirm = signal('');
  protected readonly tried = signal(false);
  protected readonly error = signal<Tr | null>(null);
  protected readonly nextOk = computed(() => this.next().length >= PASSWORD_MIN);
  protected readonly match = computed(() => this.next() === this.confirm());
  protected readonly same = computed(() => this.next() === this.current());

  /** POST /auth/change-password { current_password, new_password } → ตัดสินจาก code ของ error · สำเร็จ = ทุกเครื่องออกจากระบบ */
  protected async submit(): Promise<void> {
    this.tried.set(true);
    this.error.set(null);
    if (!this.nextOk() || !this.match() || this.same()) return;
    try {
      await firstValueFrom(this.http.post('/api/v1/auth/change-password', { current_password: this.current(), new_password: this.next() }));
    } catch (err) {
      const e = apiError(err);
      this.current.set('');
      this.error.set(
        e.code === 'ACCOUNT_LOCKED'
          ? { th: 'ลองผิดหลายครั้ง พักไว้ 15 นาที', en: 'Too many tries — locked for 15 minutes' }
          : e.code === 'INVALID_CREDENTIALS'
            ? { th: `รหัส${this.forced() ? 'ชั่วคราว' : 'ปัจจุบัน'}ไม่ถูกต้อง · ผิด 5 ครั้งจะถูกพักบัญชี`, en: `Wrong ${this.forced() ? 'temporary' : 'current'} password · 5 wrong tries locks the account` }
            : e.status === 400
              ? { th: 'รหัสใหม่ต้องยาว 8–128 ตัว', en: 'The new password must be 8–128 characters' }
              : { th: 'เปลี่ยนรหัสไม่ได้ ลองใหม่อีกครั้ง', en: 'Couldn’t change it — try again' },
      );
      return;
    }
    await this.realSession.signout();
    this.toast.show({ th: 'เปลี่ยนรหัสแล้ว — ล็อกอินใหม่ด้วยรหัสใหม่', en: 'Password changed — sign in with the new one' });
    void this.router.navigateByUrl(screenUrl('A04'));
  }

  private readonly http = inject(HttpClient);
  private readonly realSession = inject(Session);
  /** ออกจากระบบจริง (ลบ session ที่ server + cookie) */
  protected signout(): void {
    void this.realSession.signout().then(() => this.router.navigateByUrl(screenUrl('A04')));
  }
}

// ── A15 · เพิ่มบทบาทเจ้าของบ้าน ───────────────────────────────

@Component({
  selector: 'app-auth-add-owner',
  imports: [PageHeader, TermsCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'บัญชีเดิม · ', en: 'Your account · ' }) + phone()" [title]="i18n.t({ th: 'เพิ่มบทบาทเจ้าของบ้าน', en: 'Add homeowner role' })" [back]="backUrl()" />
    <form class="stack grow" (submit)="$event.preventDefault(); submit()">
      <p class="info-box muted small">{{ i18n.t({ th: 'ใช้บัญชีนี้ต่อ ไม่ต้องสมัครใหม่ · ได้แพ็กฟรีอัตโนมัติ · ขั้นต่อไปสแกน QR เปิดใช้ตู้', en: 'Keep this account, no new sign-up · free plan included · next you scan the activation QR' }) }}</p>
      <label class="field" [class.invalid]="errorCode() === 'INVALID'">
        <span>{{ i18n.t({ th: 'บ้านเลขที่', en: 'House number' }) }}</span>
        <input autocomplete="address-line1" [value]="f().house_no" (input)="set('house_no', $any($event.target).value)" />
      </label>
      <app-terms-check from="A15" [checked]="f().terms" (checkedChange)="set('terms', $event)" [showError]="!!f().house_no.trim() && !f().terms" />
      @if (errorCode(); as e) {
        <p class="danger-text small" role="alert">{{ i18n.t(errors[e]) }}</p>
      }
      <button type="submit" class="btn push-end" [disabled]="!f().terms || busy()">{{ i18n.t({ th: 'เพิ่มบทบาทแล้วไปผูกตู้', en: 'Add role and bind my mailbox' }) }}</button>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
  `,
})
export class AuthAddOwner {
  protected readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  private readonly realSession = inject(Session);
  private readonly demo = inject(AuthDemo);
  private readonly router = inject(Router);
  protected readonly errors = ADD_ROLE_ERROR;
  protected readonly phone = computed(() => formatPhone(this.realSession.me()?.phone ?? ''));
  readonly from = input<string>();
  protected readonly backUrl = computed(() => backTo(this.from(), 'O13'));
  protected readonly f = this.demo.forms.addOwner;
  protected readonly errorCode = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected set<K extends keyof SignupForm>(key: K, value: SignupForm[K]): void {
    this.f.update((f) => ({ ...f, [key]: value }));
    this.errorCode.set(null);
  }

  /** ของจริง: POST /me/roles/owner { house_no, terms_version } → 201 Me (มี owner แล้ว) → A07 */
  protected async submit(): Promise<void> {
    if (!this.f().terms || !this.f().house_no.trim() || this.busy()) return;
    this.busy.set(true);
    try {
      const terms = await firstValueFrom(this.http.get<{ version: string }>('/api/v1/terms/current'));
      await firstValueFrom(this.http.post('/api/v1/me/roles/owner', { house_no: this.f().house_no.trim(), terms_version: terms.version }));
      await this.realSession.refresh();
      this.realSession.use('owner');
      void this.router.navigateByUrl(screenUrl('A07'));
    } catch (err) {
      const { code } = apiError(err);
      this.errorCode.set(code && ADD_ROLE_ERROR[code] ? code : 'INVALID');
    } finally {
      this.busy.set(false);
    }
  }
}

// ── A16 · ขอเข้าหน่วยงาน ────────────────────────────────────

@Component({
  selector: 'app-auth-join-agency',
  imports: [PageHeader, TermsCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'บัญชีเดิม · ', en: 'Your account · ' }) + phone()" [title]="i18n.t({ th: 'ขอเข้าหน่วยงาน', en: 'Join an agency' })" [back]="backUrl()" />
    <form class="stack grow" (submit)="$event.preventDefault(); submit()">
      <p class="info-box muted small">{{ i18n.t({ th: 'ใช้บัญชีนี้ต่อ · หัวหน้าต้องยืนยันก่อนจึงจะใช้หน้าเจ้าหน้าที่ได้ · ระหว่างรอใช้งานแบบเดิมได้ตามปกติ', en: 'Keep this account · your head must approve before you get officer screens · meanwhile everything else works as before' }) }}</p>
      <label class="field" [class.invalid]="errorCode() === 'GROUP_CODE_INVALID'">
        <span>{{ i18n.t({ th: 'รหัสกลุ่มจากหัวหน้า', en: 'Group code from your head' }) }}</span>
        <input autocomplete="off" autocapitalize="characters" spellcheck="false" [placeholder]="i18n.t({ th: 'เช่น PX7K-2MQ9', en: 'e.g. PX7K-2MQ9' })" [value]="f().group_code" (input)="set('group_code', $any($event.target).value)" />
      </label>
      <app-terms-check from="A16" [checked]="f().terms" (checkedChange)="set('terms', $event)" [showError]="!!f().group_code.trim() && !f().terms" />
      @if (errorCode(); as e) {
        <p class="danger-text small" role="alert">{{ i18n.t(errors[e]) }}</p>
      }
      <button type="submit" class="btn push-end" [disabled]="!f().terms || !f().group_code.trim() || busy()">{{ i18n.t({ th: 'ส่งคำขอ', en: 'Send request' }) }}</button>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
  `,
})
export class AuthJoinAgency {
  protected readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  private readonly realSession = inject(Session);
  private readonly demo = inject(AuthDemo);
  private readonly router = inject(Router);
  protected readonly errors = ADD_ROLE_ERROR;
  protected readonly phone = computed(() => formatPhone(this.realSession.me()?.phone ?? ''));
  readonly from = input<string>();
  protected readonly backUrl = computed(() => backTo(this.from(), 'H13'));
  protected readonly f = this.demo.forms.join;
  protected readonly errorCode = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected set<K extends keyof SignupForm>(key: K, value: SignupForm[K]): void {
    this.f.update((f) => ({ ...f, [key]: value }));
    this.errorCode.set(null);
  }

  /** ของจริง: POST /me/agency/join { group_code, terms_version } → สถานะ pending (A11) */
  protected async submit(): Promise<void> {
    const groupCode = this.f().group_code.replace(/[\s-]/g, '').toUpperCase();
    if (!this.f().terms || !groupCode || this.busy()) return;
    this.busy.set(true);
    try {
      const terms = await firstValueFrom(this.http.get<{ version: string }>('/api/v1/terms/current'));
      await firstValueFrom(this.http.post('/api/v1/me/agency/join', { group_code: groupCode, terms_version: terms.version }));
      await this.realSession.refresh();
      void this.router.navigateByUrl(screenUrl('A11'));
    } catch (err) {
      const { code } = apiError(err);
      this.errorCode.set(code && ADD_ROLE_ERROR[code] ? code : 'INVALID');
    } finally {
      this.busy.set(false);
    }
  }
}
