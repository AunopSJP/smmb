import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi, type AdminAgency, type AdminUser } from '../../core/admin-api';
import { apiError } from '../../core/api';
import { AGENCY_TYPE_LABEL, showGroupCode } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

// แอดมิน: D02 หน่วยงานรออนุมัติ · D13 หน่วยงานทั้งหมด · D09 ผู้ใช้ — ใช้ API จริง (api.md §9.2–9.3)

const STATUS_LABEL: Record<AdminAgency['status'], Tr> = {
  pending: { th: 'รออนุมัติ', en: 'Pending' },
  approved: { th: 'อนุมัติแล้ว', en: 'Approved' },
  rejected: { th: 'ไม่อนุมัติ', en: 'Rejected' },
};

// ── D02 · หน่วยงานรออนุมัติ ───────────────────────────────────

@Component({
  selector: 'app-admin-agency-requests',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'หน่วยงานรออนุมัติ', en: 'Agency requests' })" [back]="url('D01')" />
    <div class="stack">
      @if (approved(); as a) {
        <section class="card ok-card">
          <strong>{{ i18n.t({ th: 'อนุมัติ ', en: 'Approved ' }) }}{{ a.name }}</strong>
          <p class="small">{{ i18n.t({ th: 'รหัสกลุ่ม (หัวหน้าเห็นในแอปแล้ว)', en: 'Group code (the head sees it in the app)' }) }}</p>
          <p class="code">{{ a.code }}</p>
        </section>
      }
      @for (a of rows(); track a.id) {
        <section class="card stack">
          <div>
            <strong>{{ a.name }}</strong>
            <span class="chip">{{ i18n.t(type(a.type)) }}</span>
          </div>
          <p class="muted small">
            {{ i18n.t({ th: 'หัวหน้า: ', en: 'Head: ' }) }}{{ heads(a) }} · {{ i18n.t({ th: 'ส่งเมื่อ ', en: 'Sent ' }) }}{{ date(a.created_at) }}
          </p>
          @if (rejecting() === a.id) {
            <label class="field">
              <span>{{ i18n.t({ th: 'เหตุผล (หัวหน้าเห็น)', en: 'Reason (shown to the head)' }) }}</span>
              <input maxlength="500" [value]="reason()" (input)="reason.set($any($event.target).value)" />
            </label>
            <div class="two">
              <button type="button" class="btn secondary" (click)="rejecting.set(null)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
              <button type="button" class="btn" [disabled]="busy()" (click)="reject(a)">{{ i18n.t({ th: 'ยืนยันไม่อนุมัติ', en: 'Confirm reject' }) }}</button>
            </div>
          } @else {
            <div class="two">
              <button type="button" class="btn secondary" (click)="startReject(a.id)">{{ i18n.t({ th: 'ไม่อนุมัติ', en: 'Reject' }) }}</button>
              <button type="button" class="btn" [disabled]="busy()" (click)="approve(a)">{{ i18n.t({ th: 'อนุมัติ', en: 'Approve' }) }}</button>
            </div>
          }
        </section>
      } @empty {
        <p class="muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ไม่มีหน่วยงานรออนุมัติ', en: 'No agencies waiting' }) }}</p>
      }
    </div>
  `,
  styles: `
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .chip {
      margin-left: 6px;
    }
    .ok-card {
      background: var(--ok-bg);
      color: var(--ok);
      text-align: center;
    }
    .code {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
  `,
})
export class AdminAgencyRequests implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly type = (t: AdminAgency['type']) => AGENCY_TYPE_LABEL[t];
  protected readonly rows = signal<AdminAgency[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly rejecting = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly approved = signal<{ name: string; code: string } | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      this.rows.set(await this.api.agencies('pending'));
    } finally {
      this.loading.set(false);
    }
  }

  protected heads(a: AdminAgency): string {
    return a.heads.map((h) => h.display_name).join(', ') || '-';
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  }

  /** POST /admin/agencies/:id/approve → หัวหน้าได้บทบาท officer + head · ได้รหัสกลุ่ม */
  protected async approve(a: AdminAgency): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.approveAgency(a.id);
      const d = await this.api.agency(a.id);
      this.approved.set({ name: d.name, code: showGroupCode(d.group_code) });
      await this.load();
    } catch {
      this.toast.show({ th: 'อนุมัติไม่ได้ ลองใหม่', en: 'Couldn’t approve — try again' });
    } finally {
      this.busy.set(false);
    }
  }

  protected startReject(id: string): void {
    this.reason.set('');
    this.rejecting.set(id);
  }

  protected async reject(a: AdminAgency): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.rejectAgency(a.id, this.reason().trim() || undefined);
      this.rejecting.set(null);
      this.toast.show({ th: 'ไม่อนุมัติแล้ว', en: 'Rejected' });
      await this.load();
    } catch {
      this.toast.show({ th: 'ทำไม่ได้ ลองใหม่', en: 'Couldn’t do it — try again' });
    } finally {
      this.busy.set(false);
    }
  }
}

// ── D13 · หน่วยงานทั้งหมด ───────────────────────────────────

@Component({
  selector: 'app-admin-agencies',
  imports: [PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'หน่วยงาน', en: 'Agencies' })" [back]="url('D01')" />
    <div class="stack">
      <a class="btn secondary" [routerLink]="url('D02')">{{ i18n.t({ th: 'ดูคำขอที่รออนุมัติ', en: 'See pending requests' }) }}</a>
      <div class="list">
        @for (a of rows(); track a.id) {
          <div class="row">
            <span class="grow">
              <strong>{{ a.name }}</strong>
              <span class="muted small block">
                {{ i18n.t(type(a.type)) }} · {{ i18n.t({ th: 'หัวหน้า ', en: 'Head ' }) }}{{ heads(a) }}{{ a.group_code ? ' · ' + code(a.group_code) : '' }}
              </span>
            </span>
            <span class="chip" [class.ok]="a.status === 'approved'" [class.warn]="a.status === 'pending'">{{ i18n.t(status[a.status]) }}</span>
          </div>
        } @empty {
          <p class="row muted">{{ i18n.t({ th: 'ยังไม่มีหน่วยงาน', en: 'No agencies yet' }) }}</p>
        }
      </div>
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
  `,
})
export class AdminAgencies implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  protected readonly url = screenUrl;
  protected readonly status = STATUS_LABEL;
  protected readonly code = showGroupCode;
  protected readonly type = (t: AdminAgency['type']) => AGENCY_TYPE_LABEL[t];
  protected readonly all = signal<AdminAgency[]>([]);
  protected readonly rows = computed(() => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    return [...this.all()].sort((a, b) => order[a.status] - order[b.status]);
  });

  async ngOnInit(): Promise<void> {
    this.all.set(await this.api.agencies().catch(() => []));
  }

  protected heads(a: AdminAgency): string {
    return a.heads.map((h) => h.display_name).join(', ') || '-';
  }
}

// ── D09 · ผู้ใช้ ──────────────────────────────────────────

const ROLE_LABEL: Record<string, Tr> = {
  admin: { th: 'แอดมิน', en: 'Admin' },
  owner: { th: 'เจ้าของบ้าน', en: 'Owner' },
  officer: { th: 'เจ้าหน้าที่', en: 'Officer' },
  head: { th: 'หัวหน้า', en: 'Head' },
};

@Component({
  selector: 'app-admin-users',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'ผู้ใช้', en: 'Users' })" [back]="url('D01')" />
    <div class="stack">
      <form class="search" (submit)="$event.preventDefault(); search()">
        <input type="search" [placeholder]="i18n.t({ th: 'ค้นชื่อ / เบอร์', en: 'Search name / phone' })" [value]="q()" (input)="q.set($any($event.target).value)" />
        <button type="submit" class="btn secondary">{{ i18n.t({ th: 'ค้น', en: 'Search' }) }}</button>
      </form>

      @if (selected(); as u) {
        <section class="card stack">
          <div>
            <strong>{{ u.name }}</strong> <span class="muted small">{{ u.phone }}</span>
          </div>
          <p class="small">
            @for (b of badges(u); track b) {
              <span class="chip">{{ i18n.t(roleLabel[b]) }}</span>
            }
            @if (u.agency) {
              <span class="muted"> · {{ u.agency.name }} ({{ u.agency.status }})</span>
            }
          </p>
          <p class="small">
            {{ i18n.t({ th: 'สถานะบัญชี: ', en: 'Account: ' }) }}<strong [class.danger-text]="u.status === 'disabled'">{{ u.status === 'active' ? i18n.t({ th: 'ใช้งาน', en: 'active' }) : i18n.t({ th: 'ปิด', en: 'disabled' }) }}</strong>
          </p>
          @if (temp(); as t) {
            <div class="info-box">
              <span class="small">{{ i18n.t({ th: 'รหัสชั่วคราว (แสดงครั้งเดียว — ให้ผู้ใช้เปลี่ยนตอนล็อกอิน)', en: 'Temporary password (shown once — they must change it at sign-in)' }) }}</span>
              <p class="temp">{{ t }}</p>
            </div>
          }
          @if (error(); as e) {
            <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
          }
          <div class="two">
            <button type="button" class="btn secondary" [disabled]="busy()" (click)="reset(u)">{{ i18n.t({ th: 'รีเซ็ตรหัส', en: 'Reset password' }) }}</button>
            @if (u.status === 'active') {
              <button type="button" class="btn secondary" [disabled]="busy()" (click)="setStatus(u, 'disabled')">{{ i18n.t({ th: 'ปิดบัญชี', en: 'Disable' }) }}</button>
            } @else {
              <button type="button" class="btn" [disabled]="busy()" (click)="setStatus(u, 'active')">{{ i18n.t({ th: 'เปิดบัญชี', en: 'Enable' }) }}</button>
            }
          </div>
        </section>
      }

      <nav class="list">
        @for (u of users(); track u.id) {
          <button type="button" class="row" [class.on]="u.id === selectedId()" (click)="select(u.id)">
            <span class="grow">
              <strong>{{ u.name }}</strong>
              <span class="muted small block">{{ u.phone }} · {{ roles(u) }}</span>
            </span>
            @if (u.status === 'disabled') {
              <span class="chip danger">{{ i18n.t({ th: 'ปิด', en: 'Off' }) }}</span>
            }
            <app-icon name="chevronRight" [size]="18" />
          </button>
        } @empty {
          <p class="row muted">{{ i18n.t({ th: 'ไม่พบผู้ใช้', en: 'No users found' }) }}</p>
        }
      </nav>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    .block {
      display: block;
    }
    .search {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      input {
        min-height: 44px;
        padding: 8px 12px;
        border-radius: var(--radius-sm);
        border: 1.5px solid var(--line);
        background: var(--surface);
        color: var(--text);
        font: inherit;
      }
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .row.on {
      box-shadow: inset 3px 0 0 var(--brand);
    }
    button.row {
      width: 100%;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
    .temp {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .chip {
      margin-right: 4px;
    }
  `,
})
export class AdminUsers implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly roleLabel = ROLE_LABEL;
  /** ?id= จากหน้าอื่น */
  readonly id = input<string>();
  protected readonly selectedId = linkedSignal<string | null>(() => this.id() ?? null);
  protected readonly q = signal('');
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly selected = computed(() => this.users().find((u) => u.id === this.selectedId()) ?? null);
  protected readonly temp = signal<string | null>(null);
  protected readonly error = signal<Tr | null>(null);
  protected readonly busy = signal(false);

  async ngOnInit(): Promise<void> {
    await this.search();
  }

  protected async search(): Promise<void> {
    const r = await this.api.users(this.q().trim()).catch(() => null);
    this.users.set(r?.data ?? []);
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.temp.set(null);
    this.error.set(null);
  }

  protected badges(u: AdminUser): string[] {
    const out: string[] = u.roles.filter((r) => r.status === 'active').map((r) => r.role);
    if (u.agency?.is_head) out.push('head');
    return out;
  }

  protected roles(u: AdminUser): string {
    return this.badges(u).map((b) => this.i18n.t(ROLE_LABEL[b])).join(', ') || this.i18n.t({ th: 'ยังไม่มีบทบาท', en: 'no role yet' });
  }

  /** POST /admin/users/:id/reset-password → รหัสชั่วคราว ครั้งเดียว + เตะทุก session */
  protected async reset(u: AdminUser): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.temp.set((await this.api.resetPassword(u.id)).temp_password);
    } catch (err) {
      const e = apiError(err);
      this.error.set(e.code === 'CANNOT_CHANGE_SELF' ? { th: 'รีเซ็ตรหัสตัวเองไม่ได้ — ใช้เปลี่ยนรหัสผ่าน', en: 'Can’t reset yourself — use change password' } : { th: 'รีเซ็ตไม่ได้', en: 'Couldn’t reset' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async setStatus(u: AdminUser, status: 'active' | 'disabled'): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.setUserStatus(u.id, status);
      this.toast.show(status === 'active' ? { th: 'เปิดบัญชีแล้ว', en: 'Enabled' } : { th: 'ปิดบัญชีแล้ว', en: 'Disabled' });
      await this.search();
    } catch (err) {
      const e = apiError(err);
      this.error.set(e.code === 'CANNOT_CHANGE_SELF' ? { th: 'ปิดบัญชีตัวเองไม่ได้', en: 'Can’t disable yourself' } : { th: 'ทำไม่ได้', en: 'Couldn’t do it' });
    } finally {
      this.busy.set(false);
    }
  }
}
