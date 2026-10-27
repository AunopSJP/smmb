import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { HeadDemo, type DemoMember } from '../../core/mock/head-demo';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

/** รหัสชั่วคราวจำลอง (ของจริงมาจาก POST /agency/members/:id/reset-password — แสดงครั้งเดียว) */
const fakeTempPassword = () =>
  Array.from({ length: 10 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

// ── L05 · สมาชิก ─────────────────────────────────────────────

@Component({
  selector: 'app-head-members',
  imports: [RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="agency() + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'สมาชิก', en: 'Members' })"
      [bell]="url('L09')"
    />
    <div class="stack">
      @if (demo.pending().length) {
        <h2 class="section-title danger-text">{{ i18n.t({ th: 'รอยืนยัน', en: 'Waiting for you' }) }} ({{ demo.pending().length }})</h2>
        @for (m of demo.pending(); track m.id) {
          <section class="card pending">
            <strong>{{ name(m) }}</strong>
            <p class="muted small">{{ i18n.t({ th: 'เบอร์ ', en: 'Phone ' }) }}{{ m.phone }} · {{ i18n.t({ th: 'ขอเมื่อ ', en: 'asked at ' }) }}{{ m.requested_at }}</p>
            <div class="two">
              <button type="button" class="btn secondary" (click)="reject(m)">{{ i18n.t({ th: 'ปฏิเสธ', en: 'Decline' }) }}</button>
              <button type="button" class="btn" (click)="approve(m)">{{ i18n.t({ th: 'อนุมัติ', en: 'Approve' }) }}</button>
            </div>
          </section>
        }
      }

      <h2 class="section-title">{{ i18n.t({ th: 'ในทีม', en: 'Team' }) }} ({{ demo.team().length }})</h2>
      <nav class="list">
        @for (m of demo.team(); track m.id) {
          <a class="row" [routerLink]="url('L05-b')" [queryParams]="{ id: m.id }">
            <span class="grow">
              <strong>{{ name(m) }}@if (m.self) { <span class="muted small"> ({{ i18n.t({ th: 'คุณ', en: 'you' }) }})</span> }</strong>
              <span class="muted small block">{{ sub(m) }}</span>
            </span>
            @if (m.status === 'disabled') {
              <span class="chip">{{ i18n.t({ th: 'ปิดสิทธิ์', en: 'Disabled' }) }}</span>
            } @else if (m.is_head) {
              <span class="chip danger">{{ i18n.t({ th: 'หัวหน้า', en: 'Head' }) }}</span>
            } @else {
              <span class="chip ok">{{ i18n.t({ th: 'ใช้งาน', en: 'Active' }) }}</span>
            }
          </a>
        }
      </nav>
    </div>
  `,
  styles: `
    .danger-text {
      color: var(--sos);
    }
    .pending {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border: 2px solid var(--sos);
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 4px;
    }
    .two .btn {
      min-height: 44px;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
  `,
})
export class HeadMembers {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(HeadDemo);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly agency = computed(() => (this.i18n.lang() === 'th' ? this.demo.agency.name : this.demo.agency.name_en));

  protected name(m: DemoMember): string {
    return this.i18n.lang() === 'th' ? m.name : m.name_en;
  }

  protected sub(m: DemoMember): string {
    const zones = this.demo.zoneOf(m.id).join(', ') || this.i18n.t({ th: 'ยังไม่มีโซน', en: 'No zone' });
    const role = m.is_head ? this.i18n.t({ th: 'หัวหน้า', en: 'Head' }) : this.i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' });
    return `${zones} · ${role}`;
  }

  /** ของจริง: POST /agency/members/:id/approve → แจ้งเตือนคนนั้น */
  protected approve(m: DemoMember): void {
    this.demo.setStatus(m.id, 'active');
    this.toast.show({ th: 'อนุมัติแล้ว', en: 'Approved' });
  }

  protected reject(m: DemoMember): void {
    this.demo.reject(m.id);
    this.toast.show({ th: 'ปฏิเสธแล้ว', en: 'Declined' });
  }
}

// ── L05-b · จัดการสมาชิก ────────────────────────────────────

@Component({
  selector: 'app-head-member',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (member(); as m) {
      <app-page-header [caption]="i18n.t({ th: 'สมาชิก', en: 'Member' })" [title]="th() ? m.name : m.name_en" [back]="url('L05')" />
      <div class="stack grow">
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt><dd>{{ m.phone }}</dd>
            <dt>{{ i18n.t({ th: 'โซน', en: 'Zone' }) }}</dt><dd>{{ demo.zoneOf(m.id).join(', ') || '—' }}</dd>
            <dt>{{ i18n.t({ th: 'ตรวจเดือนนี้', en: 'Checks this month' }) }}</dt><dd>{{ m.checks_this_month }} {{ i18n.t({ th: 'หลัง', en: 'houses' }) }}</dd>
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt>
            <dd [class.ok]="m.status === 'active'">
              {{ m.status === 'disabled' ? i18n.t({ th: 'ปิดสิทธิ์ชั่วคราว', en: 'Temporarily disabled' }) : m.is_head ? i18n.t({ th: 'หัวหน้า', en: 'Head' }) : i18n.t({ th: 'ใช้งาน', en: 'Active' }) }}
            </dd>
          </dl>
        </section>

        @if (temp(); as t) {
          <!-- รหัสชั่วคราวแสดงครั้งเดียว — ระบบไม่มี SMS/OTP หัวหน้าบอกลูกทีมเอง -->
          <section class="card temp" role="alert">
            <strong>{{ i18n.t({ th: 'รหัสผ่านชั่วคราว (แสดงครั้งเดียว)', en: 'Temporary password (shown once)' }) }}</strong>
            <p class="code">{{ t }}</p>
            <p class="muted small">{{ i18n.t({ th: 'บอกลูกทีมเอง · เข้าครั้งแรกต้องเปลี่ยนรหัสใหม่ · เครื่องเดิมถูกออกจากระบบแล้ว', en: 'Tell them yourself · they must change it on first sign-in · their devices were signed out' }) }}</p>
            <button type="button" class="btn secondary" (click)="copy(t)">{{ i18n.t({ th: 'คัดลอก', en: 'Copy' }) }}</button>
          </section>
        }

        <div class="stack push-end">
          @if (m.self) {
            <p class="muted small center">{{ i18n.t({ th: 'นี่คือบัญชีของคุณ — เปลี่ยนรหัสที่หน้าบัญชี', en: 'This is your account — change your password from Account' }) }}</p>
          } @else {
            @if (m.also_owner || m.is_head) {
              <p class="muted small center">
                <app-icon name="alert" [size]="14" />
                {{ i18n.t({ th: 'คนนี้เป็นเจ้าของบ้านหรือหัวหน้าด้วย — รีเซ็ตรหัสต้องให้แอดมินทำ', en: 'This person is also a homeowner or a head — only an admin can reset their password' }) }}
              </p>
            }
            <button type="button" class="btn secondary" [disabled]="m.also_owner || m.is_head || m.status === 'disabled'" (click)="reset()">
              {{ i18n.t({ th: 'รีเซ็ตรหัสผ่าน', en: 'Reset password' }) }}
            </button>
            @if (m.status === 'active') {
              @if (m.is_head) {
                <button type="button" class="btn secondary" (click)="setHead(m.id, false)">{{ i18n.t({ th: 'ถอดจากหัวหน้า', en: 'Remove as head' }) }}</button>
              } @else {
                <button type="button" class="btn secondary" (click)="setHead(m.id, true)">{{ i18n.t({ th: 'ตั้งเป็นหัวหน้าเพิ่ม', en: 'Make a head too' }) }}</button>
              }
              <button type="button" class="btn secondary danger" (click)="disable(m.id)">{{ i18n.t({ th: 'ปิดสิทธิ์ชั่วคราว', en: 'Disable for now' }) }}</button>
            } @else if (m.status === 'disabled') {
              <button type="button" class="btn" (click)="enable(m.id)">{{ i18n.t({ th: 'เปิดสิทธิ์อีกครั้ง', en: 'Enable again' }) }}</button>
            }
          }
        </div>
      </div>
    }
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .temp {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border: 2px solid var(--ok);
    }
    .code {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      font-variant-numeric: tabular-nums;
    }
    .danger {
      color: var(--sos);
      box-shadow: inset 0 0 0 1.5px var(--sos);
    }
  `,
})
export class HeadMember {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(HeadDemo);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly member = computed(() => this.demo.member(this.id()) ?? this.demo.team().find((m) => !m.self));
  protected readonly th = computed(() => this.i18n.lang() === 'th');
  protected readonly temp = signal<string | null>(null);

  /** ของจริง: POST /agency/members/:id/reset-password → { temp_password } ครั้งเดียว */
  protected reset(): void {
    this.temp.set(fakeTempPassword());
    this.toast.show({ th: 'รีเซ็ตรหัสแล้ว', en: 'Password reset' });
  }

  protected copy(text: string): void {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    this.toast.show({ th: 'คัดลอกแล้ว', en: 'Copied' });
  }

  protected setHead(id: string, on: boolean): void {
    this.demo.setHead(id, on);
    this.toast.show(on ? { th: 'ตั้งเป็นหัวหน้าเพิ่มแล้ว', en: 'Now a head too' } : { th: 'ถอดจากหัวหน้าแล้ว', en: 'Removed as head' });
  }

  /** ไม่เตะ session — ถ้าเป็นเจ้าของบ้านด้วย ยังใช้บทบาทนั้นต่อได้ (api.md §8.2) */
  protected disable(id: string): void {
    this.demo.setStatus(id, 'disabled');
    this.toast.show({ th: 'ปิดสิทธิ์ชั่วคราวแล้ว', en: 'Disabled' });
    void this.router.navigateByUrl(screenUrl('L05'));
  }

  protected enable(id: string): void {
    this.demo.setStatus(id, 'active');
    this.toast.show({ th: 'เปิดสิทธิ์แล้ว', en: 'Enabled' });
  }
}
