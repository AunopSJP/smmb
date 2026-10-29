import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { InspectionApi } from '../../core/inspection-api';
import { PushBlockedError, PushNotifications } from '../../core/push-notifications';
import { Session } from '../../core/session';
import { Toast } from '../../core/toast';
import { AccountActions } from '../auth/auth-account';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

/** O13 บัญชีเจ้าหน้าที่ — ใช้ session, ข้อมูลโซน และ Web Push จริง */
@Component({
  selector: 'app-officer-account',
  imports: [RouterLink, PageHeader, Icon, AccountActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="me()?.agency?.name ?? i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' })" [title]="me()?.display_name ?? ''" />
    <div class="stack grow">
      <section class="card">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'ชื่อ', en: 'Name' }) }}</dt><dd>{{ me()?.name ?? '—' }}</dd>
          <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt><dd>{{ me()?.phone ?? '—' }}</dd>
          <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ me()?.agency?.name ?? i18n.t({ th: 'ยังไม่ได้เข้าหน่วยงาน', en: 'No agency' }) }}</dd>
          <dt>{{ i18n.t({ th: 'โซนตรวจ', en: 'Patrol zone' }) }}</dt>
          <dd>{{ summary()?.window?.zone_name ?? (summary()?.houses_total ? i18n.t({ th: 'มีบ้านในโซน แต่ไม่มีรอบตรวจถัดไปวันนี้', en: 'Assigned, no more patrol windows today' }) : i18n.t({ th: 'ยังไม่ถูกจัดเข้าโซน', en: 'Not assigned to a zone' })) }}</dd>
          <dt>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</dt>
          <dd>{{ summary()?.window ? summary()!.window!.start + '–' + summary()!.window!.end : '—' }}</dd>
        </dl>
        @if (loading()) { <p class="muted small">{{ i18n.t({ th: 'กำลังโหลดข้อมูลโซน…', en: 'Loading patrol assignment…' }) }}</p> }
        @if (error()) { <p class="danger-text small" role="alert">{{ i18n.t({ th: 'โหลดข้อมูลโซนไม่สำเร็จ', en: 'Could not load patrol assignment' }) }}</p> }
      </section>

      <nav class="list">
        <section class="row">
          <span class="icon-bubble" [class.ok]="me()?.push?.subscribed"><app-icon name="bell" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'การแจ้งเตือน SOS', en: 'SOS notifications' }) }}</strong>
            <span class="muted small block">{{ me()?.push?.subscribed ? i18n.t({ th: 'เปิดรับบนอุปกรณ์นี้', en: 'Enabled on this device' }) : i18n.t({ th: 'ยังไม่ได้เปิดบนอุปกรณ์นี้', en: 'Not enabled on this device' }) }}</span>
          </span>
          <button type="button" class="btn secondary push-toggle" [disabled]="pushBusy()" (click)="togglePush()">
            {{ me()?.push?.subscribed ? i18n.t({ th: 'ปิด', en: 'Turn off' }) : i18n.t({ th: 'เปิด', en: 'Turn on' }) }}
          </button>
        </section>
        @if (pushError()) {
          <p class="danger-text small" role="alert">{{ i18n.t({ th: 'เปิด/ปิดแจ้งเตือนไม่สำเร็จ ตรวจสิทธิ์แจ้งเตือนของเบราว์เซอร์แล้วลองใหม่', en: 'Could not update notifications. Check browser permission and try again.' }) }}</p>
        }
        <a class="row" [routerLink]="url('O02')">
          <span class="icon-bubble"><app-icon name="scan" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'กล้องสแกน QR', en: 'QR scanner camera' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'เบราว์เซอร์จะขอสิทธิ์เมื่อเริ่มสแกน · พิมพ์รหัสใต้ QR แทนได้', en: 'Browser asks when scanning starts · you can type the printed code instead' }) }}</span>
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
      <app-account-actions current="officer" from="O13" />
      <p class="muted small">{{ i18n.t({ th: 'ลืมรหัสผ่าน ติดต่อหัวหน้าให้รีเซ็ต', en: 'Forgot your password? Ask your head to reset it' }) }}</p>
      <button type="button" class="btn secondary signout push-end" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
    </div>
  `,
  styles: `
    .grow { flex: 1; min-width: 0; }
    .block { display: block; }
    .icon-bubble.ok { background: var(--ok-bg); color: var(--ok); }
    .push-toggle { min-height: 40px; padding: 6px 12px; }
    .signout { color: var(--brand); box-shadow: inset 0 0 0 1.5px var(--line); }
  `,
})
export class OfficerAccount {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(InspectionApi);
  private readonly push = inject(PushNotifications);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  protected readonly session = inject(Session);
  protected readonly me = this.session.me;
  protected readonly url = screenUrl;
  protected readonly summary = signal<Awaited<ReturnType<InspectionApi['summary']>> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly pushBusy = signal(false);
  protected readonly pushError = signal(false);

  constructor() {
    void this.api.summary().then((summary) => this.summary.set(summary)).catch(() => this.error.set(true)).finally(() => this.loading.set(false));
  }

  protected async togglePush(): Promise<void> {
    if (this.pushBusy()) return;
    this.pushBusy.set(true);
    this.pushError.set(false);
    try {
      if (this.me()?.push.subscribed) await this.push.disable();
      else await this.push.enable('officer');
      await this.session.refresh();
      this.toast.show({ th: 'อัปเดตการแจ้งเตือนแล้ว', en: 'Notification settings updated' });
    } catch (error) {
      this.pushError.set(true);
      if (error instanceof PushBlockedError) this.toast.show({ th: 'เบราว์เซอร์นี้ยังเปิดแจ้งเตือนไม่ได้', en: 'Notifications are blocked in this browser' });
    } finally {
      this.pushBusy.set(false);
    }
  }

  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04')));
  }
}
