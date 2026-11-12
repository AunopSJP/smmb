import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { DisplaySettings } from '../../core/display-settings';
import { HeadApi, type Member } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
import { Session } from '../../core/session';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Confirm } from '../../shared/confirm-dialog';
import { PageHeader } from '../../shared/page-header';
import { LoadError } from '../../shared/state-view';
import { liveRefresh } from '../../core/live-refresh';

// หัวหน้า: L05 สมาชิก (คำขอรอยืนยันอยู่บนสุด) · L05-b รายละเอียดสมาชิก — ใช้ API จริง (api.md §8.2)

const MEMBER_ERROR: Record<string, Tr> = {
  CANNOT_CHANGE_SELF: { th: 'ทำกับบัญชีตัวเองไม่ได้ — ให้หัวหน้าอีกคนหรือผู้ดูแลระบบทำให้', en: 'You can’t do this to your own account — ask another head or the admin' },
  LAST_HEAD: { th: 'ถอดไม่ได้ เพราะต้องมีหัวหน้าอย่างน้อย 1 คน — ตั้งหัวหน้าคนใหม่ก่อน แล้วค่อยถอด', en: 'Can’t remove: at least one head is required — appoint another head first' },
  RESET_NEEDS_ADMIN: { th: 'รีเซ็ตเองไม่ได้ เพราะคนนี้เป็นเจ้าของบ้าน/หัวหน้าด้วย — ติดต่อผู้ดูแลระบบให้รีเซ็ต', en: 'You can’t reset this: the person is also an owner/head — contact the admin' },
  MEMBER_STATE_INVALID: { th: 'ทำไม่ได้ เพราะสถานะสมาชิกเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วดูสถานะล่าสุด', en: 'Not possible: the member’s status changed — reload to see the latest' },
  RATE_LIMITED: { th: 'ทำบ่อยเกินไป — รอ 1 นาทีแล้วลองอีกครั้ง', en: 'Too many requests — wait a minute and try again' },
  MEMBER_NOT_PENDING: { th: 'คำขอนี้ถูกจัดการไปแล้ว (อาจเป็นหัวหน้าอีกคน) — โหลดหน้าใหม่เพื่อดูผล', en: 'This request was already handled (maybe by another head) — reload to see the result' },
};

const ago = (iso: string | null, lang: 'th' | 'en'): string => {
  if (!iso) return lang === 'th' ? 'ยังไม่เคยตรวจ' : 'no inspections yet';
  return new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
};

// ── L05 · สมาชิก ─────────────────────────────────────────────

@Component({
  selector: 'app-head-members',
  imports: [RouterLink, PageHeader, LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="i18n.t({ th: 'สมาชิก', en: 'Members' })" [bell]="url('L09')" />
    <div class="stack">
      @if (failed()) {
        <app-load-error (retry)="reload()" />
      }
      <div class="segmented easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'มุมมอง', en: 'View' })">
        <button type="button" [attr.aria-pressed]="view() === 'pending'" (click)="view.set('pending')">{{ i18n.t({ th: 'รออนุมัติ', en: 'Waiting' }) }} {{ pending().length }}</button>
        <button type="button" [attr.aria-pressed]="view() === 'all'" (click)="view.set('all')">{{ i18n.t({ th: 'ทั้งหมด', en: 'All' }) }} {{ team().length + pending().length }}</button>
      </div>
      @if ((view() === 'pending' || display.easyMode()) && !pending().length) {
        <p class="card muted easy-hide">{{ i18n.t({ th: 'ไม่มีคนรออนุมัติ', en: 'Nobody is waiting' }) }}</p>
      }
      @if (pending().length && (view() === 'pending' || display.easyMode() || display.advancedMode())) {
        <h2 class="section-title">{{ i18n.t({ th: 'ขอเข้าหน่วยงาน', en: 'Asking to join' }) }}</h2>
        @for (m of pending(); track m.id) {
          <section class="card pending">
            <strong>{{ m.display_name }}</strong>
            @if (m.position || m.staff_no) {
              <p class="small">
                {{ m.position }}<span class="adv-only">{{ m.position && m.staff_no ? ' · ' : '' }}{{ m.staff_no ? i18n.t({ th: 'เลขประจำตัว ', en: 'Staff no. ' }) + m.staff_no : '' }}</span>
              </p>
            }
            <p class="muted small">{{ i18n.t({ th: 'เบอร์ ', en: 'Phone ' }) }}{{ m.phone }} · {{ i18n.t({ th: 'ขอเมื่อ ', en: 'asked ' }) }}{{ when(m.joined_at) }}</p>
            <p class="muted small adv-only">{{ i18n.t({ th: 'โซน ', en: 'Zones ' }) }}{{ zones(m) }}</p>
            <div class="two">
              <button type="button" class="btn secondary" [disabled]="busy()" (click)="decide(m, false)">{{ i18n.t({ th: 'ปฏิเสธ', en: 'Decline' }) }}</button>
              <button type="button" class="btn" [disabled]="busy()" (click)="decide(m, true)">{{ i18n.t({ th: 'อนุมัติ', en: 'Approve' }) }}</button>
            </div>
          </section>
        }
      }

      <!-- โหมดง่าย: หลังรายการคำขอ แสดงทีมแบบสั้น + ปุ่มโทร (ตาม HeadMembers_E) -->
      @if (display.easyMode() && team().length) {
        <h2 class="section-title">{{ i18n.t({ th: 'ทีมตอนนี้', en: 'Your team' }) }} ({{ team().length }})</h2>
        @for (m of showAllTeam() ? team() : team().slice(0, 3); track m.id) {
          <div class="card easy-member">
            <span class="grow">
              <strong>{{ m.display_name }}</strong>
              <span class="muted small block">{{ m.position || zones(m) }}</span>
            </span>
            <a class="btn secondary call" [href]="'tel:' + m.phone" [attr.aria-label]="i18n.t({ th: 'โทรหา ', en: 'Call ' }) + m.display_name">{{ i18n.t({ th: 'โทร', en: 'Call' }) }}</a>
          </div>
        }
        @if (team().length > 3 && !showAllTeam()) {
          <button type="button" class="btn secondary" (click)="showAllTeam.set(true)">{{ i18n.t({ th: 'ดูทั้งหมด ', en: 'Show all ' }) }}{{ team().length }}{{ i18n.t({ th: ' คน', en: '' }) }}</button>
        }
      }

      @if ((view() === 'all' || display.advancedMode()) && !display.easyMode()) {
      <h2 class="section-title">{{ i18n.t({ th: 'ในหน่วยงานแล้ว', en: 'In the agency' }) }} ({{ team().length }})</h2>
      <nav class="list">
        @for (m of team(); track m.id) {
          <a class="row" [routerLink]="url('L05-b')" [queryParams]="{ id: m.id }">
            <span class="grow">
              <strong>{{ m.display_name }}@if (m.id === meId()) { <span class="muted small"> ({{ i18n.t({ th: 'คุณ', en: 'you' }) }})</span> }</strong>
              <span class="muted small block">{{ zones(m) }}</span>
              <span class="muted small block adv-only">@if (m.staff_no) { {{ i18n.t({ th: 'เลขประจำตัว ', en: 'Staff no. ' }) }}{{ m.staff_no }} · }{{ i18n.t({ th: 'เข้าเมื่อ ', en: 'Joined ' }) }}{{ when(m.joined_at) }}</span>
            </span>
            @if (m.status === 'disabled') {
              <span class="chip">{{ i18n.t({ th: 'ปิดสิทธิ์', en: 'Disabled' }) }}</span>
            } @else if (m.is_head) {
              <span class="chip danger">{{ i18n.t({ th: 'หัวหน้า', en: 'Head' }) }}</span>
            } @else {
              <span class="chip ok">{{ i18n.t({ th: 'ใช้งาน', en: 'Active' }) }}</span>
            }
          </a>
        } @empty {
          <p class="row muted">{{ i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
        }
      </nav>
      <section class="card">
        <span class="muted small">{{ i18n.t({ th: 'รหัสกลุ่ม (ให้ลูกทีมใช้สมัคร)', en: 'Group code (for your team to sign up)' }) }}</span>
        <p class="code">{{ code() }}</p>
        <a class="small tap" [routerLink]="url('L03')">{{ i18n.t({ th: 'แชร์ / แก้ช่องทางติดต่อ', en: 'Share / edit contact' }) }}</a>
      </section>
      }
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
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-block-start: 8px;
    }
    .pending {
      box-shadow: inset 0 0 0 2px var(--brand);
    }
    .easy-member {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .call {
      inline-size: auto;
      min-block-size: 48px;
      padding: 8px 18px;
      text-decoration: none;
    }
    .code {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    a.small {
      color: var(--brand-text);
      font-weight: 700;
    }
  `,
})
export class HeadMembers implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  protected readonly display = inject(DisplaySettings);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  private readonly session = inject(Session);
  protected readonly meId = computed(() => this.session.me()?.id ?? null);
  protected readonly all = signal<Member[]>([]);
  protected readonly failed = signal(false);
  protected readonly pending = computed(() => this.all().filter((m) => m.status === 'pending'));
  /** รออนุมัติ / ทั้งหมด (ตามแคนวาสดีไซน์) */
  protected readonly view = signal<'pending' | 'all'>('pending');
  /** โหมดง่ายแสดงทีม 3 คนแรก — กดดูทั้งหมดได้ (ไม่ให้ทีมใหญ่เป็นทางตัน) */
  protected readonly showAllTeam = signal(false);
  private initialViewSet = false;
  protected readonly team = computed(() => this.all().filter((m) => m.status !== 'pending'));
  protected readonly busy = signal(false);
  protected readonly code = computed(() => {
    const c = this.api.agency()?.group_code ?? '';
    return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
  });

  /** คำขอเข้าทีมใหม่ขึ้นเองโดยไม่ต้องรีเฟรช */
  private readonly _live = liveRefresh(() => this.load(), 15_000);

  async ngOnInit(): Promise<void> {
    void this.api.loadAgency().catch(() => undefined);
    await this.load();
  }

  protected reload(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.all.set(await this.api.members());
      this.failed.set(false);
    } catch {
      this.failed.set(true);
    }
    if (!this.initialViewSet) {
      this.initialViewSet = true;
      this.view.set(this.pending().length ? 'pending' : 'all');
    }
  }

  protected when(iso: string): string {
    return ago(iso, this.i18n.lang());
  }

  protected zones(m: Member): string {
    return m.zones.map((z) => z.name).join(', ') || this.i18n.t({ th: 'ยังไม่อยู่โซนไหน', en: 'not in any zone' });
  }

  /** POST /agency/members/:id/approve|reject → ได้บทบาท officer + แจ้งเตือน */
  protected async decide(m: Member, ok: boolean): Promise<void> {
    this.busy.set(true);
    try {
      await (ok ? this.api.approve(m.id) : this.api.reject(m.id));
      this.toast.show(ok ? { th: 'อนุมัติ ' + m.display_name + ' แล้ว — ใส่เข้าโซนต่อได้', en: 'Approved ' + m.display_name + ' — add them to a zone' } : { th: 'ปฏิเสธแล้ว', en: 'Declined' });
      await this.load();
    } catch (err) {
      this.toast.show(MEMBER_ERROR[apiError(err).code ?? ''] ?? { th: 'ทำรายการไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Couldn’t do it — check your connection and try again' });
    } finally {
      this.busy.set(false);
    }
  }
}

// ── L05-b · รายละเอียดสมาชิก ─────────────────────────────────

@Component({
  selector: 'app-head-member',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (member(); as m) {
      <app-page-header [caption]="i18n.t({ th: 'สมาชิก', en: 'Member' })" [title]="m.display_name" [back]="url('L05')" />
      <div class="stack grow">
        <!-- โหมดง่าย: สรุปใหญ่ + ปุ่มโทร (ตาม HeadMember_E) -->
        <section class="card easy-only">
          <strong class="easy-name">{{ m.display_name }}</strong>
          <p class="muted">{{ m.position || '—' }} · {{ zones(m) }}</p>
          <p>{{ i18n.t({ th: 'ตรวจล่าสุด ', en: 'Last inspection ' }) }}{{ when(m.last_inspection_at) }}</p>
          <a class="btn secondary call-btn" [href]="'tel:' + m.phone">{{ i18n.t({ th: 'โทร ', en: 'Call ' }) }}{{ m.phone }}</a>
        </section>
        <section class="card easy-hide">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'ชื่อ', en: 'Name' }) }}</dt><dd>{{ m.name }}</dd>
            <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt><dd><a [href]="'tel:' + m.phone">{{ m.phone }}</a></dd>
            <dt>{{ i18n.t({ th: 'ตำแหน่ง / ยศ', en: 'Position' }) }}</dt><dd>{{ m.position || '—' }}</dd>
            <dt class="adv-only">{{ i18n.t({ th: 'เลขประจำตัว', en: 'Staff no.' }) }}</dt><dd class="adv-only">{{ m.staff_no || '—' }}</dd>
            <dt class="adv-only">{{ i18n.t({ th: 'เข้าร่วมเมื่อ', en: 'Joined' }) }}</dt><dd class="adv-only">{{ when(m.joined_at) }}</dd>
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt>
            <dd>{{ m.status === 'active' ? i18n.t({ th: 'ใช้งาน', en: 'Active' }) : i18n.t({ th: 'ปิดสิทธิ์', en: 'Disabled' }) }}{{ m.is_head ? ' · ' + i18n.t({ th: 'หัวหน้า', en: 'Head' }) : '' }}</dd>
            <dt>{{ i18n.t({ th: 'โซน', en: 'Zones' }) }}</dt><dd>{{ zones(m) }}</dd>
            <dt>{{ i18n.t({ th: 'ตรวจล่าสุด', en: 'Last inspection' }) }}</dt><dd>{{ when(m.last_inspection_at) }}</dd>
          </dl>
        </section>
        @if (temp(); as t) {
          <div class="info-box">
            <span class="small">{{ i18n.t({ th: 'รหัสชั่วคราว (แสดงครั้งเดียว — ให้ลูกทีมเปลี่ยนตอนเข้าสู่ระบบ)', en: 'Temporary password (shown once — they change it at sign-in)' }) }}</span>
            <p class="temp">{{ t }}</p>
          </div>
        }
        @if (self()) {
          <p class="muted small">{{ i18n.t({ th: 'นี่คือบัญชีของคุณ — เปลี่ยนรหัสที่ "บัญชีของฉัน"', en: 'This is you — change your password in “My account”' }) }}</p>
        } @else {
          <div class="stack push-end">
            @if (m.status === 'active') {
              @if (m.is_head) {
                <button type="button" class="btn secondary" [disabled]="busy()" (click)="run('unhead')">{{ i18n.t({ th: 'ถอดจากหัวหน้า', en: 'Remove as head' }) }}</button>
              } @else {
                <button type="button" class="btn secondary" [disabled]="busy()" (click)="run('head')">{{ i18n.t({ th: 'ตั้งเป็นหัวหน้า', en: 'Make head' }) }}</button>
              }
              <button type="button" class="btn secondary" [disabled]="busy()" (click)="run('reset')">{{ i18n.t({ th: 'รีเซ็ตรหัสผ่าน', en: 'Reset password' }) }}</button>
              <button type="button" class="btn secondary danger-outline" [disabled]="busy()" (click)="run('disable')">{{ i18n.t({ th: 'ปิดสิทธิ์ (ถอดออกจากทุกโซน)', en: 'Disable (removes from all zones)' }) }}</button>
            } @else {
              <button type="button" class="btn" [disabled]="busy()" (click)="run('enable')">{{ i18n.t({ th: 'เปิดสิทธิ์อีกครั้ง', en: 'Re-enable' }) }}</button>
            }
          </div>
        }
      </div>
    } @else {
      <app-page-header [title]="i18n.t({ th: 'สมาชิก', en: 'Member' })" [back]="url('L05')" />
      <p class="muted">{{ i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
    }
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .easy-name {
      display: block;
      font-size: 1.5rem;
    }
    .call-btn {
      margin-block-start: 10px;
      text-decoration: none;
    }
    /* เบอร์โทรในตารางข้อมูล: ให้พื้นที่แตะ ≥44px โดยไม่ทำให้ตัวอักษรขยับ */
    .kv dd a[href^='tel:'] {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
      padding-block: 4px;
    }
    .temp {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .danger-outline {
      color: var(--sos);
    }
  `,
})
export class HeadMember {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(HeadApi);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  private readonly session = inject(Session);
  private readonly confirm = inject(Confirm);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly member = signal<Member | null>(null);
  protected readonly temp = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly self = computed(() => this.member()?.id === this.session.me()?.id);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string | undefined): Promise<void> {
    const all = await this.api.members().catch(() => []);
    const m = all.find((x) => x.id === id);
    if (!m) {
      void this.router.navigateByUrl(screenUrl('L05'));
      return;
    }
    this.member.set(m);
  }

  protected when(iso: string | null): string {
    return ago(iso, this.i18n.lang());
  }

  protected zones(m: Member): string {
    return m.zones.map((z) => z.name).join(', ') || '—';
  }

  private async undoUnhead(id: string): Promise<void> {
    try {
      await this.api.makeHead(id);
      this.toast.show({ th: 'เลิกทำแล้ว · กลับเป็นหัวหน้า', en: 'Undone · head again' });
      await this.load(id);
    } catch {
      this.toast.show({ th: 'เลิกทำไม่สำเร็จ ลองตั้งหัวหน้าอีกครั้ง', en: 'Couldn’t undo — make them head again' }, 'error');
    }
  }

  protected async run(action: 'head' | 'unhead' | 'reset' | 'disable' | 'enable'): Promise<void> {
    const m = this.member();
    if (!m) return;
    if (action === 'disable') {
      const ok = await this.confirm.ask({
        title:
          action === 'disable'
            ? { th: `ปิดสิทธิ์ ${m.display_name}?`, en: `Disable ${m.display_name}?` }
            : { th: `ถอด ${m.display_name} จากหัวหน้า?`, en: `Remove ${m.display_name} as head?` },
        body:
          action === 'disable'
            ? { th: 'เจ้าหน้าที่คนนี้จะถูกถอดออกจากทุกโซนและใช้แอปไม่ได้ (ประวัติยังอยู่)', en: 'This officer is removed from every zone and can no longer use the app (history is kept).' }
            : { th: 'ยังเป็นเจ้าหน้าที่อยู่ แต่จะอนุมัติ/จัดการทีมไม่ได้อีก', en: 'They stay an officer but can no longer approve or manage the team.' },
        confirm: action === 'disable' ? { th: 'ปิดสิทธิ์', en: 'Disable' } : { th: 'ถอดจากหัวหน้า', en: 'Remove as head' },
        danger: true,
      });
      if (!ok) return;
    }
    this.busy.set(true);
    try {
      if (action === 'head') await this.api.makeHead(m.id);
      if (action === 'unhead') await this.api.removeHead(m.id);
      if (action === 'disable') await this.api.setActive(m.id, false);
      if (action === 'enable') await this.api.setActive(m.id, true);
      if (action === 'reset') this.temp.set((await this.api.resetPassword(m.id)).temp_password);
      else if (action === 'unhead') {
        // ย้อนได้จริง: ตั้งกลับเป็นหัวหน้า — ไม่ต้องถามก่อน
        this.toast.showUndo({ th: `ถอด ${m.display_name} จากหัวหน้าแล้ว`, en: `${m.display_name} is no longer a head` }, () => this.undoUnhead(m.id));
      } else this.toast.show({ th: 'บันทึกแล้ว', en: 'Saved' });
      await this.load(m.id);
    } catch (err) {
      this.toast.show(MEMBER_ERROR[apiError(err).code ?? ''] ?? { th: 'ทำรายการไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Couldn’t do it — check your connection and try again' });
    } finally {
      this.busy.set(false);
    }
  }
}
