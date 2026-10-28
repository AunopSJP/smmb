import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { HeadApi, type Member } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
import { Session } from '../../core/session';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';

// หัวหน้า: L05 สมาชิก (คำขอรอยืนยันอยู่บนสุด) · L05-b รายละเอียดสมาชิก — ใช้ API จริง (api.md §8.2)

const MEMBER_ERROR: Record<string, Tr> = {
  CANNOT_CHANGE_SELF: { th: 'ทำกับบัญชีตัวเองไม่ได้', en: 'You can’t do this to yourself' },
  LAST_HEAD: { th: 'ต้องมีหัวหน้าอย่างน้อย 1 คน', en: 'At least one head is required' },
  RESET_NEEDS_ADMIN: { th: 'คนนี้เป็นเจ้าของบ้าน/หัวหน้าด้วย — ให้แอดมินรีเซ็ต', en: 'This person is also an owner/head — ask the admin to reset' },
  MEMBER_STATE_INVALID: { th: 'สถานะสมาชิกเปลี่ยนไปแล้ว ลองโหลดใหม่', en: 'The member changed — reload' },
  MEMBER_NOT_PENDING: { th: 'คำขอนี้ถูกจัดการไปแล้ว', en: 'This request was already handled' },
};

const ago = (iso: string | null, lang: 'th' | 'en'): string => {
  if (!iso) return lang === 'th' ? 'ยังไม่เคยตรวจ' : 'no inspections yet';
  return new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
};

// ── L05 · สมาชิก ─────────────────────────────────────────────

@Component({
  selector: 'app-head-members',
  imports: [RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="(api.agency()?.name ?? '') + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'สมาชิก', en: 'Members' })"
      [bell]="url('L09')"
    />
    <div class="stack">
      @if (pending().length) {
        <h2 class="section-title danger-text">{{ i18n.t({ th: 'รอยืนยัน', en: 'Waiting for you' }) }} ({{ pending().length }})</h2>
        @for (m of pending(); track m.id) {
          <section class="card pending">
            <strong>{{ m.display_name }}</strong>
            <p class="muted small">{{ i18n.t({ th: 'เบอร์ ', en: 'Phone ' }) }}{{ m.phone }} · {{ i18n.t({ th: 'ขอเมื่อ ', en: 'asked ' }) }}{{ when(m.joined_at) }}</p>
            <div class="two">
              <button type="button" class="btn secondary" [disabled]="busy()" (click)="decide(m, false)">{{ i18n.t({ th: 'ปฏิเสธ', en: 'Decline' }) }}</button>
              <button type="button" class="btn" [disabled]="busy()" (click)="decide(m, true)">{{ i18n.t({ th: 'อนุมัติ', en: 'Approve' }) }}</button>
            </div>
          </section>
        }
      }

      <h2 class="section-title">{{ i18n.t({ th: 'ในทีม', en: 'Team' }) }} ({{ team().length }})</h2>
      <nav class="list">
        @for (m of team(); track m.id) {
          <a class="row" [routerLink]="url('L05-b')" [queryParams]="{ id: m.id }">
            <span class="grow">
              <strong>{{ m.display_name }}@if (m.id === meId()) { <span class="muted small"> ({{ i18n.t({ th: 'คุณ', en: 'you' }) }})</span> }</strong>
              <span class="muted small block">{{ zones(m) }}</span>
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
        <a class="small" [routerLink]="url('L03')">{{ i18n.t({ th: 'แชร์ / แก้ช่องทางติดต่อ', en: 'Share / edit contact' }) }}</a>
      </section>
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
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 8px;
    }
    .pending {
      box-shadow: inset 0 0 0 2px var(--brand);
    }
    .code {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    a.small {
      color: var(--brand);
      font-weight: 700;
    }
  `,
})
export class HeadMembers implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  private readonly session = inject(Session);
  protected readonly meId = computed(() => this.session.me()?.id ?? null);
  protected readonly all = signal<Member[]>([]);
  protected readonly pending = computed(() => this.all().filter((m) => m.status === 'pending'));
  protected readonly team = computed(() => this.all().filter((m) => m.status !== 'pending'));
  protected readonly busy = signal(false);
  protected readonly code = computed(() => {
    const c = this.api.agency()?.group_code ?? '';
    return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
  });

  async ngOnInit(): Promise<void> {
    void this.api.loadAgency().catch(() => undefined);
    await this.load();
  }

  private async load(): Promise<void> {
    this.all.set(await this.api.members().catch(() => []));
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
      this.toast.show(MEMBER_ERROR[apiError(err).code ?? ''] ?? { th: 'ทำไม่ได้ ลองใหม่', en: 'Couldn’t do it — try again' });
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
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'ชื่อ', en: 'Name' }) }}</dt><dd>{{ m.name }}</dd>
            <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt><dd><a [href]="'tel:' + m.phone">{{ m.phone }}</a></dd>
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt>
            <dd>{{ m.status === 'active' ? i18n.t({ th: 'ใช้งาน', en: 'Active' }) : i18n.t({ th: 'ปิดสิทธิ์', en: 'Disabled' }) }}{{ m.is_head ? ' · ' + i18n.t({ th: 'หัวหน้า', en: 'Head' }) : '' }}</dd>
            <dt>{{ i18n.t({ th: 'โซน', en: 'Zones' }) }}</dt><dd>{{ zones(m) }}</dd>
            <dt>{{ i18n.t({ th: 'ตรวจล่าสุด', en: 'Last inspection' }) }}</dt><dd>{{ when(m.last_inspection_at) }}</dd>
          </dl>
        </section>
        @if (temp(); as t) {
          <div class="info-box">
            <span class="small">{{ i18n.t({ th: 'รหัสชั่วคราว (แสดงครั้งเดียว — ให้ลูกทีมเปลี่ยนตอนล็อกอิน)', en: 'Temporary password (shown once — they change it at sign-in)' }) }}</span>
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

  protected async run(action: 'head' | 'unhead' | 'reset' | 'disable' | 'enable'): Promise<void> {
    const m = this.member();
    if (!m) return;
    this.busy.set(true);
    try {
      if (action === 'head') await this.api.makeHead(m.id);
      if (action === 'unhead') await this.api.removeHead(m.id);
      if (action === 'disable') await this.api.setActive(m.id, false);
      if (action === 'enable') await this.api.setActive(m.id, true);
      if (action === 'reset') this.temp.set((await this.api.resetPassword(m.id)).temp_password);
      else this.toast.show({ th: 'บันทึกแล้ว', en: 'Saved' });
      await this.load(m.id);
    } catch (err) {
      this.toast.show(MEMBER_ERROR[apiError(err).code ?? ''] ?? { th: 'ทำไม่ได้ ลองใหม่', en: 'Couldn’t do it — try again' });
    } finally {
      this.busy.set(false);
    }
  }
}
