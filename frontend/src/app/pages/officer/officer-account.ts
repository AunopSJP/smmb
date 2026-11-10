import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { InspectionApi } from '../../core/inspection-api';
import { Session } from '../../core/session';
import { AccountActions } from '../auth/auth-account';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { PushStatus } from '../../shared/push-status';

/** O13 บัญชีเจ้าหน้าที่ — ใช้ session, ข้อมูลโซน และ Web Push จริง */
@Component({
  selector: 'app-officer-account',
  imports: [RouterLink, PageHeader, Icon, AccountActions, PushStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="caption()" [title]="i18n.t({ th: 'ตั้งค่า', en: 'Settings' })" />
    <div class="stack grow">
      <app-push-status [required]="true" deviceLabel="officer" />

      <h2 class="section-title easy-hide">{{ i18n.t({ th: 'ข้อมูลของฉัน', en: 'My details' }) }}</h2>
      <section class="card easy-hide">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'ชื่อ', en: 'Name' }) }}</dt><dd>{{ me()?.name ?? '—' }}</dd>
          @if (rank()) {
            <dt>{{ i18n.t({ th: 'ยศ / ตำแหน่ง', en: 'Rank' }) }}</dt><dd>{{ rank() }}</dd>
          }
          <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt><dd>{{ me()?.phone ?? '—' }}</dd>
          <dt>{{ i18n.t({ th: 'บทบาท', en: 'Roles' }) }}</dt><dd>{{ roleText() }}</dd>
          <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ me()?.agency?.name ?? i18n.t({ th: 'ยังไม่ได้เข้าหน่วยงาน', en: 'No agency' }) }}</dd>
          <dt>{{ i18n.t({ th: 'โซนตรวจ', en: 'Patrol zone' }) }}</dt>
          <dd>{{ summary()?.window?.zone_name ?? (summary()?.houses_total ? i18n.t({ th: 'มีบ้านในโซน แต่ไม่มีรอบตรวจถัดไปวันนี้', en: 'Assigned, no more patrol windows today' }) : i18n.t({ th: 'ยังไม่ถูกจัดเข้าโซน', en: 'Not assigned to a zone' })) }}</dd>
          <dt>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</dt>
          <dd>{{ summary()?.window ? summary()!.window!.start + '–' + summary()!.window!.end : '—' }}</dd>
          @if (email()) {
            <dt>{{ i18n.t({ th: 'อีเมล', en: 'Email' }) }}</dt>
            <dd>{{ email() }}</dd>
          }
        </dl>
        @if (loading()) { <p class="muted small">{{ i18n.t({ th: 'กำลังโหลดข้อมูลโซน…', en: 'Loading patrol assignment…' }) }}</p> }
        @if (error()) { <p class="danger-text small" role="alert">{{ i18n.t({ th: 'โหลดข้อมูลโซนไม่สำเร็จ', en: 'Could not load patrol assignment' }) }}</p> }
      </section>

      <h2 class="section-title">{{ i18n.t({ th: 'การใช้งาน', en: 'Usage' }) }}</h2>
      <nav class="list">
        <a class="row easy-hide" [routerLink]="url('O02')">
          <span class="icon-bubble"><app-icon name="scan" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'กล้องสแกน QR', en: 'QR scanner camera' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'เบราว์เซอร์จะขอสิทธิ์เมื่อเริ่มสแกน · พิมพ์รหัสใต้ QR แทนได้', en: 'Browser asks when scanning starts · you can type the printed code instead' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row" routerLink="/settings/notifications">
          <span class="icon-bubble"><app-icon name="bell" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'ตั้งค่าการแจ้งเตือน', en: 'Notification settings' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'เจ้าหน้าที่ต้องเปิดไว้เสมอเพื่อรับ SOS', en: 'Officers must keep this on to receive SOS' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row" [routerLink]="url('O13-b')">
          <span class="icon-bubble"><app-icon name="settings" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'การแสดงผล', en: 'Display' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'ธีมกลางคืน · ภาษา · ขนาดตัวอักษร', en: 'Night theme · language · text size' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      </nav>
      <div class="easy-hide"><app-account-actions current="officer" from="O13" /></div>
      <nav class="list easy-only">
        <a class="row" [routerLink]="url('A14')" [queryParams]="{ from: 'O13' }">
          <span class="icon-bubble"><app-icon name="settings" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'เปลี่ยนรหัสผ่าน', en: 'Change password' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'ลืมรหัส? ให้หัวหน้ารีเซ็ตให้', en: 'Forgot it? Ask your head to reset it' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      </nav>
      <p class="muted small easy-hide">{{ i18n.t({ th: 'ลืมรหัสผ่าน ติดต่อหัวหน้าให้รีเซ็ต', en: 'Forgot your password? Ask your head to reset it' }) }}</p>
      <button type="button" class="btn secondary signout push-end" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
    </div>
  `,
  styles: `
    .grow { flex: 1; min-inline-size: 0; }
    .block { display: block; }
    .icon-bubble.ok { background: var(--ok-bg); color: var(--ok); }
    .push-toggle { min-block-size: 40px; padding: 6px 12px; }
    .signout { color: var(--brand); box-shadow: inset 0 0 0 1.5px var(--line); }
    .tech { margin: 0; font-size: 0.6875rem; color: var(--text-muted); }
  `,
})
export class OfficerAccount {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(InspectionApi);
  private readonly router = inject(Router);
  protected readonly session = inject(Session);
  protected readonly me = this.session.me;
  protected readonly url = screenUrl;
  protected readonly summary = signal<Awaited<ReturnType<InspectionApi['summary']>> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly caption = computed(() => {
    const agency = this.me()?.agency?.name ?? this.i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' });
    const zone = this.summary()?.window?.zone_name;
    return zone ? agency + ' · ' + zone : agency;
  });
  /** รายละเอียดที่ผู้ใช้กรอกตอนสมัคร (Me.profile) — มีเฉพาะช่องที่กรอก */
  protected readonly rank = computed(() => {
    const v = this.me()?.profile?.['rank'];
    return typeof v === 'string' ? v.trim() : '';
  });
  protected readonly email = computed(() => {
    const v = this.me()?.profile?.['email'];
    return typeof v === 'string' ? v.trim() : '';
  });
  protected readonly roleText = computed(() =>
    (this.me()?.roles ?? [])
      .map((r) =>
        r === 'owner'
          ? this.i18n.t({ th: 'เจ้าของบ้าน', en: 'Owner' })
          : r === 'officer'
            ? this.i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' })
            : r === 'head'
              ? this.i18n.t({ th: 'หัวหน้า', en: 'Head' })
              : this.i18n.t({ th: 'ผู้ดูแลระบบ', en: 'Admin' }),
      )
      .join(' · '),
  );

  constructor() {
    void this.api.summary().then((summary) => this.summary.set(summary)).catch(() => this.error.set(true)).finally(() => this.loading.set(false));
  }

  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04'), { replaceUrl: true }));
  }
}
