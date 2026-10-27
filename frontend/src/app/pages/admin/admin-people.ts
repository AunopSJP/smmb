import { afterNextRender, ChangeDetectionStrategy, Component, computed, type ElementRef, inject, Injector, input, linkedSignal, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { AdminDemo, type AdminRole, type AdminUser, type DemoAgency } from '../../core/mock/admin-demo';
import { PlanDemo } from '../../core/mock/plan-demo';
import { UserPlan } from './admin-plans';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { MockNote } from '../auth/auth-parts';

const AGENCY_TYPE: Record<DemoAgency['type'], Tr> = {
  police: { th: 'ตำรวจ', en: 'Police' },
  guard: { th: 'รปภ.', en: 'Security guards' },
  other: { th: 'อื่น ๆ', en: 'Other' },
};

const copyText = (text: string) => void navigator.clipboard?.writeText(text).catch(() => undefined);

// ── D02 · คำขอหน่วยงาน ──────────────────────────────────────

@Component({
  selector: 'app-admin-agency-requests',
  imports: [RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'คำขอหน่วยงาน', en: 'Agency requests' })" [back]="url('D01')" />
    <div class="stack">
      @if (approved(); as a) {
        <section class="card done" role="status">
          <strong>{{ i18n.t({ th: 'อนุมัติ ', en: 'Approved ' }) }}{{ i18n.t(a.name) }}</strong>
          <span class="muted small">{{ i18n.t({ th: 'รหัสกลุ่ม', en: 'Group code' }) }}</span>
          <p class="code">{{ a.code }}</p>
          <p class="muted small">{{ i18n.t({ th: 'หัวหน้าได้รับแจ้งเตือนแล้ว และเห็นรหัสนี้ในแอป — แชร์ให้ลูกทีมใช้สมัคร', en: 'The head was notified and sees this code in the app — they share it with their team' }) }}</p>
          <div class="two">
            <button type="button" class="btn secondary" (click)="copy(a.code)">{{ i18n.t({ th: 'คัดลอก', en: 'Copy' }) }}</button>
            <a class="btn secondary" [routerLink]="url('D13')">{{ i18n.t({ th: 'ดูหน่วยงาน', en: 'See agencies' }) }}</a>
          </div>
        </section>
      }

      @for (a of demo.pendingAgencies(); track a.id) {
        <section class="card pending">
          <strong class="name">{{ i18n.t(a.name) }}</strong>
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'ประเภท', en: 'Type' }) }}</dt><dd>{{ i18n.t(type[a.type]) }}</dd>
            <dt>{{ i18n.t({ th: 'หัวหน้า', en: 'Head' }) }}</dt><dd>{{ i18n.t(a.head) }}</dd>
            <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt><dd>{{ a.head_phone }}</dd>
            <dt>{{ i18n.t({ th: 'ส่งเมื่อ', en: 'Sent' }) }}</dt><dd>{{ i18n.t(a.sent) }}</dd>
          </dl>
          @if (rejecting() === a.id) {
            <label class="field">
              <span>{{ i18n.t({ th: 'เหตุผล (ไม่บังคับ)', en: 'Reason (optional)' }) }}</span>
              <textarea maxlength="200" [value]="reason()" (input)="reason.set($any($event.target).value)"></textarea>
              <small>{{ i18n.t({ th: 'หัวหน้าจะเห็นข้อความนี้', en: 'The head will see this message' }) }}</small>
            </label>
            <div class="two">
              <button type="button" class="btn secondary" (click)="rejecting.set(null)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
              <button type="button" class="btn" (click)="reject(a.id)">{{ i18n.t({ th: 'ยืนยันปฏิเสธ', en: 'Decline' }) }}</button>
            </div>
          } @else {
            <div class="two">
              <button type="button" class="btn secondary" (click)="startReject(a.id)">{{ i18n.t({ th: 'ปฏิเสธ', en: 'Decline' }) }}</button>
              <button type="button" class="btn" (click)="approve(a)">{{ i18n.t({ th: 'อนุมัติ', en: 'Approve' }) }}</button>
            </div>
          }
        </section>
      } @empty {
        @if (!approved()) {
          <p class="card muted center">{{ i18n.t({ th: 'ไม่มีคำขอรออนุมัติ', en: 'No requests waiting' }) }}</p>
        }
      }
      <p class="muted small">{{ i18n.t({ th: 'อนุมัติแล้วระบบสร้างรหัสกลุ่มให้อัตโนมัติ · การเปิดดูเบอร์หัวหน้าถูกบันทึก', en: 'Approving creates a group code automatically · viewing the head’s phone is logged' }) }}</p>
    </div>
  `,
  styles: `
    .pending {
      display: flex;
      flex-direction: column;
      gap: 10px;
      border: 2px solid var(--sos);
    }
    .name {
      font-size: 1.125rem;
    }
    .done {
      display: flex;
      flex-direction: column;
      gap: 4px;
      border: 2px solid var(--ok);
    }
    .code {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      font-variant-numeric: tabular-nums;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 4px;
    }
    .two .btn {
      min-height: 48px;
    }
  `,
})
export class AdminAgencyRequests {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(AdminDemo);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly type = AGENCY_TYPE;
  protected readonly rejecting = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly approved = signal<{ name: Tr; code: string } | null>(null);

  protected approve(a: DemoAgency): void {
    const code = this.demo.approve(a.id);
    if (!code) return;
    this.approved.set({ name: a.name, code });
    this.toast.show({ th: 'อนุมัติแล้ว', en: 'Approved' });
  }

  protected startReject(id: string): void {
    this.reason.set('');
    this.rejecting.set(id);
  }

  protected reject(id: string): void {
    this.demo.reject(id, this.reason());
    this.rejecting.set(null);
    this.toast.show({ th: 'ปฏิเสธคำขอแล้ว', en: 'Request declined' });
  }

  protected copy(code: string): void {
    copyText(code);
    this.toast.show({ th: 'คัดลอกแล้ว', en: 'Copied' });
  }
}

// ── D13 · หน่วยงาน ──────────────────────────────────────────

@Component({
  selector: 'app-admin-agencies',
  imports: [RouterLink, PageHeader, Icon, MockNote],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'หน่วยงาน', en: 'Agencies' })" [back]="url('D01')" />
    <div class="stack">
      <div class="list">
        @for (a of rows(); track a.id) {
          @if (a.status === 'pending') {
            <a class="row" [routerLink]="url('D02')">
              <span class="icon-bubble"><app-icon name="user" [size]="20" /></span>
              <span class="grow">
                <strong>{{ i18n.t(a.name) }}</strong>
                <span class="muted small block">{{ i18n.t(type[a.type]) }} · {{ i18n.t({ th: 'ส่งคำขอ ', en: 'requested ' }) }}{{ i18n.t(a.sent) }}</span>
              </span>
              <span class="chip danger">{{ i18n.t({ th: 'รออนุมัติ', en: 'Waiting' }) }}</span>
            </a>
          } @else {
            <div class="row">
              <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
              <span class="grow">
                <strong>{{ i18n.t(a.name) }}</strong>
                <span class="muted small block">
                  {{ i18n.t(type[a.type]) }} ·
                  @if (a.status === 'approved') {
                    {{ i18n.t({ th: 'รหัสกลุ่ม ', en: 'code ' }) }}<span class="code">{{ a.group_code }}</span> · {{ a.members }} {{ i18n.t({ th: 'คน', en: 'people' }) }}
                  } @else {
                    {{ a.reject_reason ?? i18n.t({ th: 'ไม่ระบุเหตุผล', en: 'no reason given' }) }}
                  }
                </span>
              </span>
              @if (a.status === 'approved') {
                <span class="chip ok">{{ i18n.t({ th: 'ใช้งาน', en: 'Active' }) }}</span>
              } @else {
                <span class="chip">{{ i18n.t({ th: 'ปฏิเสธแล้ว', en: 'Declined' }) }}</span>
              }
            </div>
          }
        }
      </div>
      <p class="muted small">{{ i18n.t({ th: 'รหัสกลุ่มสร้างให้อัตโนมัติเมื่ออนุมัติ', en: 'Group codes are created on approval' }) }}</p>

      @if (created(); as c) {
        <section class="card done" role="status">
          <strong>{{ i18n.t({ th: 'สร้าง ', en: 'Created ' }) }}{{ c.name }}{{ i18n.t({ th: ' แล้ว', en: '' }) }}</strong>
          <span class="muted small">{{ i18n.t({ th: 'รหัสกลุ่ม', en: 'Group code' }) }}</span>
          <p class="big-code">{{ c.code }}</p>
          @if (c.temp) {
            <span class="muted small">{{ i18n.t({ th: 'รหัสผ่านชั่วคราวของหัวหน้า (แสดงครั้งเดียว)', en: 'Head’s temporary password (shown once)' }) }}</span>
            <p class="big-code">{{ c.temp }}</p>
            <p class="muted small">{{ i18n.t({ th: 'บอกหัวหน้าเอง · เข้าครั้งแรกต้องเปลี่ยนรหัสและยอมรับข้อตกลง', en: 'Tell the head yourself · they must change it and accept the terms on first sign-in' }) }}</p>
          } @else {
            <p class="muted small">{{ i18n.t({ th: 'เบอร์นี้มีบัญชีอยู่แล้ว — ใช้บัญชีเดิม ได้บทบาทหัวหน้าเพิ่ม', en: 'This number already has an account — it keeps it and becomes a head' }) }}</p>
          }
          <button type="button" class="btn secondary" (click)="created.set(null)">{{ i18n.t({ th: 'ปิด', en: 'Close' }) }}</button>
        </section>
      }

      @if (creating()) {
        <form class="card stack" (submit)="$event.preventDefault(); create()">
          <strong>{{ i18n.t({ th: 'สร้างหน่วยงานให้', en: 'Create an agency' }) }}</strong>
          <app-mock-note />
          <label class="field">
            <span>{{ i18n.t({ th: 'ชื่อหน่วยงาน', en: 'Agency name' }) }}</span>
            <input [value]="form().name" (input)="set('name', $any($event.target).value)" />
          </label>
          <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'ประเภท', en: 'Type' })">
            @for (t of typeKeys; track t) {
              <button type="button" [attr.aria-pressed]="form().type === t" (click)="set('type', t)">{{ i18n.t(type[t]) }}</button>
            }
          </div>
          <label class="field">
            <span>{{ i18n.t({ th: 'ชื่อหัวหน้า (ยศ)', en: 'Head’s name (with rank)' }) }}</span>
            <input [value]="form().head" (input)="set('head', $any($event.target).value)" />
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'เบอร์หัวหน้า', en: 'Head’s phone' }) }}</span>
            <input type="tel" inputmode="tel" [value]="form().phone" (input)="set('phone', $any($event.target).value)" />
            <small>{{ i18n.t({ th: 'เบอร์ใหม่ = สร้างบัญชีให้พร้อมรหัสชั่วคราว · เบอร์ที่มีบัญชีแล้ว = ใช้บัญชีเดิม', en: 'New number = account with a temporary password · existing number = keeps its account' }) }}</small>
          </label>
          @if (createError(); as e) {
            <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
          }
          <div class="two">
            <button type="button" class="btn secondary" (click)="creating.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
            <button type="submit" class="btn">{{ i18n.t({ th: 'สร้าง', en: 'Create' }) }}</button>
          </div>
        </form>
      } @else {
        <button type="button" class="btn secondary" (click)="startCreate()">{{ i18n.t({ th: 'สร้างหน่วยงานให้', en: 'Create an agency' }) }}</button>
        <p class="muted small">{{ i18n.t({ th: 'ใช้เมื่อหน่วยงานไม่สะดวกสมัครเอง — สร้างแล้วใช้งานได้ทันที ไม่ต้องรออนุมัติ', en: 'For agencies that cannot sign up themselves — active right away' }) }}</p>
      }
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .code {
      font-weight: 700;
      color: var(--text);
      letter-spacing: 0.04em;
    }
    .done {
      display: flex;
      flex-direction: column;
      gap: 4px;
      border: 2px solid var(--ok);
    }
    .big-code {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      font-variant-numeric: tabular-nums;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
  `,
})
export class AdminAgencies {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AdminDemo);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly type = AGENCY_TYPE;
  protected readonly typeKeys = Object.keys(AGENCY_TYPE) as DemoAgency['type'][];
  protected readonly creating = signal(false);
  protected readonly form = signal({ name: '', type: 'police' as DemoAgency['type'], head: '', phone: '' });
  protected readonly createError = signal<Tr | null>(null);
  protected readonly created = signal<{ name: string; code: string; temp: string | null } | null>(null);

  protected set<K extends 'name' | 'type' | 'head' | 'phone'>(key: K, value: K extends 'type' ? DemoAgency['type'] : string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.createError.set(null);
  }

  protected startCreate(): void {
    this.form.set({ name: '', type: 'police', head: '', phone: '' });
    this.created.set(null);
    this.creating.set(true);
  }

  /** ของจริง: POST /admin/agencies { name, type, head: { name, phone } } — ตัดสินจาก code ของ error */
  protected create(): void {
    const f = this.form();
    const r = this.demo.createAgency(f.name, f.type, f.head, f.phone);
    if (!r.ok) {
      this.createError.set(
        r.code === 'ROLE_EXISTS'
          ? { th: 'เบอร์นี้อยู่หน่วยงานอื่นแล้ว', en: 'This number already belongs to an agency' }
          : r.code === 'ADMIN_ROLE_EXCLUSIVE'
            ? { th: 'บัญชีแอดมินเป็นหัวหน้าหน่วยงานไม่ได้', en: 'An admin account cannot be an agency head' }
            : { th: 'กรอกชื่อหน่วยงาน ชื่อหัวหน้า และเบอร์ 10 หลักให้ครบ', en: 'Fill in the agency name, head’s name and a 10-digit phone' },
      );
      return;
    }
    this.creating.set(false);
    this.created.set({ name: f.name.trim(), code: r.group_code, temp: r.temp_password });
    this.toast.show({ th: 'สร้างหน่วยงานแล้ว', en: 'Agency created' });
  }
  /** รออนุมัติอยู่บนสุด (api.md §9.2) */
  protected readonly rows = computed(() => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    return [...this.demo.agencies()].sort((a, b) => order[a.status] - order[b.status]);
  });
}

// ── D09 · ผู้ใช้ ─────────────────────────────────────────────

const ROLE_LABEL: Record<AdminRole | 'head', Tr> = {
  owner: { th: 'เจ้าของบ้าน', en: 'Homeowner' },
  officer: { th: 'เจ้าหน้าที่', en: 'Officer' },
  head: { th: 'หัวหน้า', en: 'Head' },
  admin: { th: 'แอดมิน', en: 'Admin' },
};

const ROLE_ERROR: Record<string, Tr> = {
  ADMIN_ROLE_EXCLUSIVE: { th: 'แอดมินมีบทบาทอื่นร่วมไม่ได้ — เลือกแอดมินอย่างเดียว หรือเอาแอดมินออก', en: 'An admin cannot have other roles — pick admin alone or remove it' },
  NO_ROLE: { th: 'ต้องมีอย่างน้อย 1 บทบาท — ถ้าจะหยุดใช้ ให้ปิดบัญชีแทน', en: 'Keep at least one role — to stop access, disable the account instead' },
  CANNOT_CHANGE_SELF: { th: 'แก้บัญชีตัวเองไม่ได้', en: 'You cannot change your own account' },
};

@Component({
  selector: 'app-admin-users',
  imports: [PageHeader, UserPlan],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'ผู้ใช้', en: 'Users' })" [back]="url('D01')" />
    <div class="stack">
      <label class="field">
        <span>{{ i18n.t({ th: 'ค้นหา', en: 'Search' }) }}</span>
        <input type="search" [placeholder]="i18n.t({ th: 'ชื่อ / เบอร์', en: 'Name / phone' })" [value]="q()" (input)="q.set($any($event.target).value)" />
      </label>
      @if (plans.plans().length > 1) {
        <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'แพ็กเกจ', en: 'Plan' })">
          <button type="button" [attr.aria-pressed]="planFilter() === 'all'" (click)="planFilter.set('all')">{{ i18n.t({ th: 'ทุกแพ็ก', en: 'All plans' }) }}</button>
          @for (p of plans.plans(); track p.code) {
            <button type="button" [attr.aria-pressed]="planFilter() === p.code" (click)="planFilter.set(p.code)">{{ i18n.t(p.name) }}</button>
          }
        </div>
      }

      <div class="list">
        @for (u of results(); track u.id) {
          <button type="button" class="row user" [attr.aria-pressed]="selectedId() === u.id" (click)="select(u.id)">
            <span class="grow">
              <strong>{{ i18n.t(u.name) }}@if (u.self) { <span class="muted small"> ({{ i18n.t({ th: 'คุณ', en: 'you' }) }})</span> }</strong>
              <span class="muted small block">{{ u.phone }}{{ u.house_no ? ' · ' + u.house_no : '' }}{{ u.agency ? ' · ' + i18n.t(u.agency) : '' }}</span>
            </span>
            <span class="chips">
              @if (u.status === 'disabled') {
                <span class="chip">{{ i18n.t({ th: 'ปิดบัญชี', en: 'Disabled' }) }}</span>
              } @else {
                @for (r of badges(u); track r) {
                  <span class="chip" [class.danger]="r === 'officer' || r === 'head'" [class.dark]="r === 'admin'">{{ i18n.t(roleLabel[r]) }}</span>
                }
              }
            </span>
          </button>
        } @empty {
          <p class="row muted">{{ i18n.t({ th: 'ไม่พบผู้ใช้', en: 'No users found' }) }}</p>
        }
      </div>

      @if (selected(); as u) {
        <section #detail class="card detail" aria-live="polite">
          <strong class="name">{{ i18n.t(u.name) }}</strong>
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt><dd>{{ u.phone }}</dd>
            @if (u.house_no) {
              <dt>{{ i18n.t({ th: 'บ้านเลขที่', en: 'House no.' }) }}</dt><dd>{{ u.house_no }}</dd>
            }
            @if (u.agency) {
              <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ i18n.t(u.agency) }}</dd>
            }
            <dt>{{ i18n.t({ th: 'เครื่องที่ล็อกอินอยู่', en: 'Signed-in devices' }) }}</dt><dd>{{ u.active_sessions }}</dd>
            @if (u.must_change_password) {
              <dt>{{ i18n.t({ th: 'รหัสผ่าน', en: 'Password' }) }}</dt><dd class="warn-text">{{ i18n.t({ th: 'ต้องเปลี่ยนตอนเข้าครั้งถัดไป', en: 'Must change on next sign-in' }) }}</dd>
            }
          </dl>
          <p class="muted small">{{ i18n.t({ th: 'การเปิดดูข้อมูลนี้ถูกบันทึก', en: 'Viewing these details is logged' }) }}</p>
        </section>

        @if (u.roles.includes('owner')) {
          <app-user-plan [userId]="u.id" />
        }

        @if (temp(); as t) {
          <!-- ไม่มี SMS/OTP — รหัสชั่วคราวแสดงครั้งเดียว แอดมินบอกเจ้าของบัญชีเอง -->
          <section class="card temp" role="alert">
            <strong>{{ i18n.t({ th: 'รหัสผ่านชั่วคราว (แสดงครั้งเดียว)', en: 'Temporary password (shown once)' }) }}</strong>
            <p class="code">{{ t }}</p>
            <p class="muted small">{{ i18n.t({ th: 'บอกเจ้าของบัญชีเอง · เข้าครั้งแรกต้องเปลี่ยนรหัส · ทุกเครื่องถูกออกจากระบบแล้ว', en: 'Tell the account owner yourself · they must change it on first sign-in · all devices were signed out' }) }}</p>
            <button type="button" class="btn secondary" (click)="copy(t)">{{ i18n.t({ th: 'คัดลอก', en: 'Copy' }) }}</button>
          </section>
        }

        @if (u.self) {
          <p class="muted small center">{{ i18n.t({ th: 'นี่คือบัญชีของคุณ — แก้บทบาท รีเซ็ตรหัส หรือปิดบัญชีตัวเองไม่ได้', en: 'This is your account — you cannot change your own roles, password or status here' }) }}</p>
        } @else if (editing()) {
          <fieldset class="card roles">
            <legend>{{ i18n.t({ th: 'บทบาทของ ', en: 'Roles for ' }) }}{{ i18n.t(u.name) }}</legend>
            @for (r of editable; track r) {
              <label class="role-row">
                <span class="grow">{{ i18n.t(roleLabel[r]) }}</span>
                <input type="checkbox" class="switch" [checked]="draft().includes(r)" (change)="toggleRole(r)" />
              </label>
            }
            @if (u.is_head) {
              <p class="muted small">{{ i18n.t({ th: 'หัวหน้าตั้งที่หน่วยงาน (หัวหน้าคนอื่นถอดได้)', en: 'Head is set by the agency (another head can remove it)' }) }}</p>
            }
            @if (u.roles.includes('officer') && !draft().includes('officer')) {
              <p class="warn-text small">{{ i18n.t({ th: 'ถอดเจ้าหน้าที่ = ออกจากหน่วยงาน และออกจากทุกโซน', en: 'Removing officer also removes them from the agency and every zone' }) }}</p>
            }
            @if (error(); as e) {
              <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
            }
            <div class="two">
              <button type="button" class="btn secondary" (click)="editing.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
              <button type="button" class="btn" (click)="saveRoles(u)">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
            </div>
          </fieldset>
        } @else {
          <div class="two">
            <button type="button" class="btn secondary" [disabled]="u.status === 'disabled'" (click)="reset(u)">{{ i18n.t({ th: 'รีเซ็ตรหัสผ่าน', en: 'Reset password' }) }}</button>
            <button type="button" class="btn secondary" [disabled]="u.status === 'disabled'" (click)="editRoles(u)">{{ i18n.t({ th: 'เปลี่ยนบทบาท', en: 'Change roles' }) }}</button>
          </div>
          @if (u.status === 'active') {
            <button type="button" class="btn secondary danger" (click)="setStatus(u, 'disabled')">{{ i18n.t({ th: 'ปิดบัญชี (ออกจากทุกเครื่อง)', en: 'Disable account (signs out everywhere)' }) }}</button>
          } @else {
            <button type="button" class="btn" (click)="setStatus(u, 'active')">{{ i18n.t({ th: 'เปิดบัญชีอีกครั้ง', en: 'Enable account' }) }}</button>
          }
        }
      } @else {
        <p class="muted small center">{{ i18n.t({ th: 'แตะชื่อเพื่อดูรายละเอียดและจัดการ', en: 'Tap a name to see details and manage' }) }}</p>
      }
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .user {
      width: 100%;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .user[aria-pressed='true'] {
      background: var(--brand-lighter);
      box-shadow: inset 4px 0 0 var(--brand);
    }
    .chips {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }
    .chip.dark {
      background: var(--text);
      color: var(--surface);
    }
    .detail,
    .temp {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .name {
      font-size: 1.125rem;
    }
    .temp {
      border: 2px solid var(--ok);
    }
    .code {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      font-variant-numeric: tabular-nums;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .btn.danger {
      color: var(--sos);
      box-shadow: inset 0 0 0 1.5px var(--sos);
    }
    .roles {
      border: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      legend {
        float: left;
        width: 100%;
        padding: 0;
        font-weight: 700;
      }
    }
    .role-row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 44px;
      font-weight: 700;
    }
  `,
})
export class AdminUsers {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(AdminDemo);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly editable: AdminRole[] = ['owner', 'officer', 'admin'];

  /** ?id= จากหน้าตู้ (ลิงก์ชื่อเจ้าของ) */
  readonly id = input<string>();
  protected readonly selectedId = linkedSignal<string | null>(() => this.id() ?? null);
  protected readonly q = signal('');
  protected readonly plans = inject(PlanDemo);
  /** ?plan= ใน GET /admin/users — กรองเจ้าของบ้านตามแพ็กปัจจุบัน */
  protected readonly planFilter = signal('all');
  protected readonly results = computed(() => {
    const list = this.demo.searchUsers(this.q());
    const f = this.planFilter();
    return f === 'all' ? list : list.filter((u) => this.plans.current(u.id)?.plan_code === f);
  });
  protected readonly selected = computed(() => this.demo.user(this.selectedId() ?? undefined));

  protected readonly temp = signal<string | null>(null);
  protected readonly editing = signal(false);
  protected readonly draft = signal<AdminRole[]>([]);
  protected readonly error = signal<Tr | null>(null);

  protected badges(u: AdminUser): (AdminRole | 'head')[] {
    return u.is_head ? [...u.roles.filter((r) => r !== 'officer'), 'head'] : u.roles;
  }

  private readonly injector = inject(Injector);
  private readonly detail = viewChild<ElementRef<HTMLElement>>('detail');

  /** เลือกแล้วเลื่อนให้เห็นรายละเอียด (อยู่ใต้รายการ บนมือถือมักพ้นจอ) */
  protected select(id: string): void {
    this.selectedId.set(id);
    this.temp.set(null);
    this.editing.set(false);
    afterNextRender(() => this.detail()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), { injector: this.injector });
  }

  protected reset(u: AdminUser): void {
    const t = this.demo.resetPassword(u.id);
    if (!t) return;
    this.temp.set(t);
    this.toast.show({ th: 'รีเซ็ตรหัสแล้ว', en: 'Password reset' });
  }

  protected copy(text: string): void {
    copyText(text);
    this.toast.show({ th: 'คัดลอกแล้ว', en: 'Copied' });
  }

  protected editRoles(u: AdminUser): void {
    this.draft.set([...u.roles]);
    this.error.set(null);
    this.temp.set(null);
    this.editing.set(true);
  }

  protected toggleRole(r: AdminRole): void {
    this.error.set(null);
    this.draft.update((d) => (d.includes(r) ? d.filter((x) => x !== r) : [...d, r]));
  }

  /** ของจริง: PUT/DELETE /admin/users/:id/roles/:role ทีละบทบาท → ตัดสินจาก code ของ error */
  protected saveRoles(u: AdminUser): void {
    const code = this.demo.setRoles(u.id, this.draft());
    if (code) {
      this.error.set(ROLE_ERROR[code]);
      return;
    }
    this.editing.set(false);
    this.toast.show({ th: 'เปลี่ยนบทบาทแล้ว', en: 'Roles updated' });
  }

  protected setStatus(u: AdminUser, status: 'active' | 'disabled'): void {
    this.demo.setUserStatus(u.id, status);
    this.temp.set(null);
    this.toast.show(status === 'disabled' ? { th: 'ปิดบัญชีแล้ว', en: 'Account disabled' } : { th: 'เปิดบัญชีแล้ว', en: 'Account enabled' });
  }
}
