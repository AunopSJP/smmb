import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi, type AdminAgency, type AdminUser } from '../../core/admin-api';
import { apiError } from '../../core/api';
import { AGENCY_TYPE_LABEL, showGroupCode } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { UserPlan } from './admin-plans';
import { Icon } from '../../shared/icon';
import { Confirm } from '../../shared/confirm-dialog';
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
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'หน่วยงานรออนุมัติ', en: 'Agency requests' })" [back]="url('D16')" />
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
          <p class="muted small easy-hide">
            {{ i18n.t({ th: 'หัวหน้า: ', en: 'Head: ' }) }}{{ heads(a) }} · {{ i18n.t({ th: 'ส่งเมื่อ ', en: 'Sent ' }) }}{{ date(a.created_at) }}
          </p>
          <p class="small adv-only">{{ i18n.t({ th: 'หัวหน้า: ', en: 'Head: ' }) }}{{ heads(a) }}</p>
          @if (a.address || a.registration_no) {
            <p class="small easy-hide">
              @if (a.address) { {{ i18n.t({ th: 'ที่ตั้ง: ', en: 'Address: ' }) }}{{ a.address }} }
              @if (a.registration_no) { <br />{{ i18n.t({ th: 'เลขทะเบียน/ใบอนุญาต: ', en: 'Registration no.: ' }) }}{{ a.registration_no }} }
            </p>
          }
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
        <section class="card empty">
          <app-icon [name]="loadFailed() ? 'alert' : 'check'" [size]="28" />
          @if (loadFailed()) {
            <p class="muted">{{ i18n.t({ th: 'โหลดคิวอนุมัติไม่สำเร็จ', en: 'Couldn’t load the approval queue' }) }}</p>
            <button type="button" class="btn secondary" (click)="load()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button>
          } @else {
            <p class="muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ไม่มีหน่วยงานรออนุมัติ — จัดการครบแล้ว', en: 'No agencies waiting — all done' }) }}</p>
          }
        </section>
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
      margin-inline-start: 6px;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 40px 24px;
      color: var(--text-muted);
    }
    @media (min-width: 1024px) {
      .stack {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
        align-items: start;
      }
      .stack > .empty,
      .stack > .ok-card {
        grid-column: 1 / -1;
      }
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
  /** โหลดคิวอนุมัติไม่สำเร็จ (ห้ามขึ้น "จัดการครบแล้ว") */
  protected readonly loadFailed = signal(false);
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
      this.loadFailed.set(false);
    } catch {
      if (!this.rows().length) this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected heads(a: AdminAgency): string {
    return a.heads.map((h) => h.display_name).join(', ') || '-';
  }

  protected headIds(a: AdminAgency): string {
    return a.heads.map((h) => h.id).join(', ') || '—';
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
      this.toast.show({ th: 'อนุมัติไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t approve — try again' });
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
      this.toast.show({ th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t do it — try again' });
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
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'หน่วยงาน', en: 'Agencies' })" [back]="url('D16')" />
    <div class="stack">
      <a class="btn secondary" [routerLink]="url('D02')">{{ i18n.t({ th: 'ดูคำขอที่รออนุมัติ', en: 'See pending requests' }) }}</a>
      <div class="list">
        <div class="list-head acols desktop-only" aria-hidden="true">
          <span>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</span>
          <span class="easy-hide">{{ i18n.t({ th: 'หัวหน้า', en: 'Head' }) }}</span>
          <span class="easy-hide">{{ i18n.t({ th: 'รหัสกลุ่ม', en: 'Group code' }) }}</span>
          <span>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</span>
        </div>
        @for (a of rows(); track a.id) {
          <div class="row acols">
            <span class="grow">
              <strong>{{ a.name }}</strong>
              <span class="muted small block">{{ i18n.t(type(a.type)) }}</span>
            </span>
            <span class="small easy-hide">{{ heads(a) }}</span>
            <span class="small code easy-hide">{{ a.group_code ? code(a.group_code) : '—' }}</span>
            <span><span class="chip" [class.ok]="a.status === 'approved'" [class.warn]="a.status === 'pending'">{{ i18n.t(status[a.status]) }}</span></span>
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
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
    .acols {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      align-items: center;
    }
    .acols > :nth-child(2),
    .acols > :nth-child(3) {
      grid-column: 1;
    }
    .acols > :nth-child(4) {
      grid-column: 2;
      grid-row: 1;
    }
    .code {
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.03em;
    }
    @media (min-width: 1024px) {
      .acols {
        grid-template-columns: minmax(0, 2fr) minmax(0, 1.5fr) 160px 130px;
        gap: 16px;
      }
      .acols > :nth-child(n) {
        grid-column: auto;
        grid-row: auto;
      }
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

  protected headIds(a: AdminAgency): string {
    return a.heads.map((h) => h.id).join(', ') || '—';
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
  imports: [PageHeader, UserPlan],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="i18n.t({ th: 'ผู้ใช้', en: 'Users' })" [bell]="url('D12')" />
    <div class="stack">
      <form class="search" (submit)="$event.preventDefault(); search()">
        <input type="search" [placeholder]="i18n.t({ th: 'ค้นเบอร์โทรหรือชื่อ', en: 'Search phone or name' })" [value]="q()" (input)="q.set($any($event.target).value)" />
        <button type="submit" class="btn secondary">{{ i18n.t({ th: 'ค้น', en: 'Search' }) }}</button>
      </form>

      <div class="segmented chips easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'กรองตามบทบาท', en: 'Filter by role' })">
        @for (f of roleFilters; track f.v) {
          <button type="button" [attr.aria-pressed]="roleFilter() === f.v" (click)="roleFilter.set(f.v)">{{ i18n.t(f.label) }} <span class="n">{{ roleCounts()[f.v] }}</span></button>
        }
      </div>

      <div class="split">
      <aside class="detail">
      @if (selected(); as u) {
        <section class="card stack">
          <div class="who-head">
            <span class="avatar" aria-hidden="true">{{ (u.name?.trim()?.charAt(0) || '?').toUpperCase() }}</span>
            <div>
              <strong>{{ u.name }}</strong>
              <span class="muted small block">{{ u.phone }}</span>
            </div>
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
          <a class="btn big easy-only" [href]="'tel:' + u.phone">{{ i18n.t({ th: 'โทร ', en: 'Call ' }) }}{{ u.phone }}</a>
          @if (temp(); as t) {
            <div class="info-box">
              <span class="small">{{ i18n.t({ th: 'รหัสชั่วคราว (แสดงครั้งเดียว — ให้ผู้ใช้เปลี่ยนตอนเข้าสู่ระบบ)', en: 'Temporary password (shown once — they must change it at sign-in)' }) }}</span>
              <p class="temp">{{ t }}</p>
            </div>
          }
          @if (error(); as e) {
            <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
          }
          <div class="two easy-hide">
            <button type="button" class="btn secondary" [disabled]="busy()" (click)="reset(u)">{{ i18n.t({ th: 'รีเซ็ตรหัส', en: 'Reset password' }) }}</button>
            @if (u.status === 'active') {
              <button type="button" class="btn secondary" [disabled]="busy()" (click)="setStatus(u, 'disabled')">{{ i18n.t({ th: 'ปิดบัญชี', en: 'Disable' }) }}</button>
            } @else {
              <button type="button" class="btn" [disabled]="busy()" (click)="setStatus(u, 'active')">{{ i18n.t({ th: 'เปิดบัญชี', en: 'Enable' }) }}</button>
            }
          </div>
        </section>
        @if (badges(u).includes('owner')) {
          <app-user-plan [userId]="u.id" />
        }
      } @else {
        <section class="card empty desktop-only">
          <p class="muted">{{ i18n.t({ th: 'เลือกผู้ใช้จากรายการ เพื่อรีเซ็ตรหัส ปิด/เปิดบัญชี หรือดูแพ็กเกจ', en: 'Pick a user from the list to reset the password, enable/disable the account or see the plan' }) }}</p>
        </section>
      }
      </aside>

      <nav class="list">
        <div class="list-head ucols desktop-only" aria-hidden="true">
          <span>{{ i18n.t({ th: 'ชื่อ', en: 'Name' }) }}</span>
          <span>{{ i18n.t({ th: 'เบอร์โทร · บทบาท', en: 'Phone · roles' }) }}</span>
          <span>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</span>
        </div>
        @for (u of shown(); track u.id) {
          <button type="button" class="row ucols" [class.on]="u.id === selectedId()" (click)="select(u.id)">
            <strong class="name">{{ u.name }}</strong>
            <span class="info small"><span class="muted">{{ u.phone }}</span> · {{ roles(u) }}</span>
            <span class="st"><span class="chip" [class.ok]="u.status === 'active'" [class.danger]="u.status === 'disabled'">{{ u.status === 'active' ? i18n.t({ th: 'ใช้งาน', en: 'Active' }) : i18n.t({ th: 'ปิด', en: 'Off' }) }}</span></span>
          </button>
        } @empty {
          @if (usersFailed()) {
            <p class="row muted"><span class="grow danger-text">{{ i18n.t({ th: 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ', en: 'Couldn’t load users' }) }}</span><button type="button" class="see-all" (click)="search()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button></p>
          } @else {
            <p class="row muted">{{ i18n.t({ th: 'ไม่พบผู้ใช้', en: 'No users found' }) }}</p>
          }
        }
      </nav>
      @if (users().length < total()) {
        <button type="button" class="btn secondary" [disabled]="loadingMore()" (click)="loadMore()">
          {{ loadingMore() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'โหลดเพิ่ม ', en: 'Load more ' }) + users().length + '/' + total() }}
        </button>
      }
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-inline-size: 0;
      text-align: start;
    }
    .block {
      display: block;
    }
    .search {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      input {
        min-block-size: 44px;
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
      background: var(--brand-lighter);
    }
    /* มือถือ: รายละเอียดอยู่เหนือรายการ · จอคอม: รายการซ้าย รายละเอียดขวา (ติดบนเมื่อเลื่อน) */
    .split {
      display: flex;
      flex-direction: column;
      gap: var(--gap);
    }
    .detail {
      order: -1;
      display: flex;
      flex-direction: column;
      gap: var(--gap);
      min-inline-size: 0;
    }
    @media (min-width: 1360px) {
      .split {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 400px;
        align-items: start;
      }
      .detail {
        order: 0;
        grid-column: 2;
        grid-row: 1;
        position: sticky;
        inset-block-start: 16px;
      }
      .split > .list {
        grid-column: 1;
        grid-row: 1;
      }
    }
    .ucols {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'name st' 'info st';
      gap: 2px 12px;
      align-items: center;
      text-align: start;
    }
    .ucols .name {
      grid-area: name;
      overflow-wrap: break-word;
    }
    .ucols .info {
      grid-area: info;
    }
    .ucols .st {
      grid-area: st;
    }
    .list-head.ucols > :nth-child(1) {
      grid-area: name;
    }
    .list-head.ucols > :nth-child(2) {
      grid-area: info;
    }
    .list-head.ucols > :nth-child(3) {
      grid-area: st;
    }
    @media (min-width: 1024px) {
      .ucols {
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.6fr) 84px;
        grid-template-areas: 'name info st';
        gap: 12px;
      }
    }
    .n {
      margin-inline-start: 4px;
      font-variant-numeric: tabular-nums;
      opacity: 0.75;
    }
    .who-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .avatar {
      display: grid;
      place-items: center;
      inline-size: 44px;
      block-size: 44px;
      border-radius: 50%;
      background: var(--brand-light);
      color: var(--brand-dark);
      font-weight: 800;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 40px 24px;
      text-align: center;
      color: var(--text-muted);
    }
    button.row {
      inline-size: 100%;
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
      margin-inline-end: 4px;
    }
  `,
})
export class AdminUsers implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(Confirm);
  protected readonly url = screenUrl;
  protected readonly roleLabel = ROLE_LABEL;
  /** ?id= จากหน้าอื่น */
  readonly id = input<string>();
  protected readonly selectedId = linkedSignal<string | null>(() => this.id() ?? null);
  protected readonly q = signal('');
  protected readonly users = signal<AdminUser[]>([]);
  /** ค้นหาไม่สำเร็จ (ห้ามขึ้น "ไม่พบผู้ใช้") */
  protected readonly usersFailed = signal(false);
  protected readonly total = signal(0);
  protected readonly loadingMore = signal(false);
  private page = 1;
  /** ?role= จากเมนูย่อยข้างซ้าย */
  readonly roleParam = input<string | undefined>(undefined, { alias: 'role' });
  protected readonly roleFilter = linkedSignal<'all' | 'owner' | 'officer' | 'head' | 'admin' | 'off'>(() => {
    const r = this.roleParam();
    return r === 'owner' || r === 'officer' || r === 'head' || r === 'admin' || r === 'off' ? r : 'all';
  });
  protected readonly roleFilters: { v: 'all' | 'owner' | 'officer' | 'head' | 'admin' | 'off'; label: Tr }[] = [
    { v: 'all', label: { th: 'ทั้งหมด', en: 'All' } },
    { v: 'owner', label: { th: 'เจ้าของบ้าน', en: 'Owners' } },
    { v: 'officer', label: { th: 'เจ้าหน้าที่', en: 'Officers' } },
    { v: 'head', label: { th: 'หัวหน้า', en: 'Heads' } },
    { v: 'admin', label: { th: 'แอดมิน', en: 'Admins' } },
    { v: 'off', label: { th: 'ปิดบัญชี', en: 'Disabled' } },
  ];
  private readonly inFilter = (f: string, u: AdminUser): boolean => (f === 'all' ? true : f === 'off' ? u.status === 'disabled' : this.badges(u).includes(f));
  protected readonly roleCounts = computed(() => {
    const out: Record<string, number> = {};
    for (const f of this.roleFilters) out[f.v] = this.users().filter((u) => this.inFilter(f.v, u)).length;
    return out;
  });
  protected readonly shown = computed(() => this.users().filter((u) => this.inFilter(this.roleFilter(), u)));
  protected readonly selected = computed(() => this.users().find((u) => u.id === this.selectedId()) ?? null);
  protected readonly temp = signal<string | null>(null);
  protected readonly error = signal<Tr | null>(null);
  protected readonly busy = signal(false);

  async ngOnInit(): Promise<void> {
    await this.search();
  }

  protected async search(): Promise<void> {
    const r = await this.api.users(this.q().trim(), undefined, 1).catch(() => null);
    if (r) {
      this.users.set(r.data);
      this.total.set(r.total);
      this.page = 1;
      this.usersFailed.set(false);
    } else {
      // เก็บผลเดิมไว้ — ไม่ล้างเป็น "ไม่พบผู้ใช้" เพราะอาจแค่โหลดไม่ได้
      this.usersFailed.set(true);
    }
  }

  protected async loadMore(): Promise<void> {
    if (this.loadingMore() || this.users().length >= this.total()) return;
    this.loadingMore.set(true);
    try {
      const r = await this.api.users(this.q().trim(), undefined, this.page + 1);
      this.users.update((list) => [...list, ...r.data]);
      this.total.set(r.total);
      this.page += 1;
    } catch {
      this.usersFailed.set(true);
    } finally {
      this.loadingMore.set(false);
    }
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

  protected roleText(u: AdminUser): string {
    return u.roles.map((r) => `${r.role}:${r.level}:${r.status}`).join(' · ') || '—';
  }

  /** POST /admin/users/:id/reset-password → รหัสชั่วคราว ครั้งเดียว + เตะทุก session */
  protected async reset(u: AdminUser): Promise<void> {
    const ok = await this.confirm.ask({
      title: { th: `รีเซ็ตรหัสของ ${u.display_name || u.phone}?`, en: `Reset the password for ${u.display_name || u.phone}?` },
      body: {
        th: 'รหัสเดิมใช้ไม่ได้ทันที และผู้ใช้จะถูกออกจากระบบทุกเครื่อง — ต้องนำรหัสชั่วคราวไปให้ผู้ใช้',
        en: 'The old password stops working immediately and they are signed out on every device — you must give them the temporary password.',
      },
      confirm: { th: 'รีเซ็ตรหัส', en: 'Reset password' },
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.temp.set((await this.api.resetPassword(u.id)).temp_password);
    } catch (err) {
      const e = apiError(err);
      this.error.set(e.code === 'CANNOT_CHANGE_SELF' ? { th: 'รีเซ็ตรหัสตัวเองไม่ได้ — ใช้เปลี่ยนรหัสผ่าน', en: 'Can’t reset yourself — use change password' } : { th: 'รีเซ็ตไม่สำเร็จ', en: 'Couldn’t reset' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async setStatus(u: AdminUser, status: 'active' | 'disabled'): Promise<void> {
    if (status === 'disabled') {
      const ok = await this.confirm.ask({
        title: { th: `ปิดบัญชี ${u.display_name || u.phone}?`, en: `Disable ${u.display_name || u.phone}?` },
        body: {
          th: 'ผู้ใช้จะถูกออกจากระบบทุกเครื่องทันที และเข้าสู่ระบบไม่ได้จนกว่าจะเปิดบัญชีใหม่',
          en: 'They will be signed out on every device and cannot sign in until you enable the account again.',
        },
        confirm: { th: 'ปิดบัญชี', en: 'Disable' },
        danger: true,
      });
      if (!ok) return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.setUserStatus(u.id, status);
      this.toast.show(status === 'active' ? { th: 'เปิดบัญชีแล้ว', en: 'Enabled' } : { th: 'ปิดบัญชีแล้ว', en: 'Disabled' });
      await this.search();
    } catch (err) {
      const e = apiError(err);
      this.error.set(e.code === 'CANNOT_CHANGE_SELF' ? { th: 'ปิดบัญชีตัวเองไม่ได้', en: 'Can’t disable yourself' } : { th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t do it' });
    } finally {
      this.busy.set(false);
    }
  }
}
