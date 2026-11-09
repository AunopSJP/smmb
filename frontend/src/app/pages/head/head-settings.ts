import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DisplaySettings } from '../../core/display-settings';
import { HeadApi, showGroupCode } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
import { Session } from '../../core/session';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { PushStatus } from '../../shared/push-status';

interface Row {
  code: string;
  icon: IconName;
  title: Tr;
  hint: Tr;
}

const AGENCY: Row[] = [
  { code: 'O02', icon: 'scan', title: { th: 'ตรวจตู้เอง', en: 'Inspect a box myself' }, hint: { th: 'ตรวจได้เฉพาะโซนที่คุณอยู่', en: 'Only zones you belong to' } },
  { code: 'L10', icon: 'pin', title: { th: 'ข้อมูลหน่วยงานและหมุดแผนที่', en: 'Agency details and map pin' }, hint: { th: 'ที่อยู่ ช่องทางติดต่อ และรหัสกลุ่ม', en: 'Address, contact and group code' } },
  { code: 'L08', icon: 'list', title: { th: 'ประวัติการสแกน', en: 'Scan log' }, hint: { th: 'ทุกการสแกนของทีม ลบหรือแก้ไม่ได้', en: 'Every scan by your team, cannot be edited' } },
  { code: 'L09', icon: 'bell', title: { th: 'แจ้งเตือนของหัวหน้า', en: 'Head notifications' }, hint: { th: 'เครื่องใหม่ของเจ้าหน้าที่ คำขอเข้าทีม', en: 'New devices, join requests' } },
];
const ACCOUNT: Row[] = [
  { code: 'O13-b', icon: 'settings', title: { th: 'แบบการใช้งานและการแสดงผล', en: 'Mode and display' }, hint: { th: 'โหมด ง่าย / ปกติ / ละเอียด ธีม ภาษา ขนาดตัวอักษร', en: 'Easy / normal / detailed, theme, language, text size' } },
  { code: 'O13', icon: 'user', title: { th: 'บัญชีของฉัน', en: 'My account' }, hint: { th: 'เปลี่ยนรหัสผ่าน บทบาทของฉัน', en: 'Change password, my roles' } },
];

/** L11 ตั้งค่า (หัวหน้า) — ตามแคนวาสดีไซน์: รวมทางเข้าข้อมูลหน่วยงาน/ประวัติ/แจ้งเตือน/บัญชีไว้ที่เดียว · ใช้หน้าเดิมทั้งหมด */
@Component({
  selector: 'app-head-settings',
  imports: [RouterLink, PageHeader, Icon, PushStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="session.me()?.agency?.name ?? ''" [title]="i18n.t({ th: 'ตั้งค่า', en: 'Settings' })" />
    <div class="stack grow">
      <app-push-status />
      <h2 class="section-title">{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</h2>
      <nav class="list">
        @for (r of agency; track r.code) {
          <a class="row" [class.easy-hide]="r.code !== 'L10'" [routerLink]="url(r.code)">
            <span class="icon-bubble"><app-icon [name]="r.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(r.title) }}</strong>
              <span class="muted small block easy-hide">{{ i18n.t(r.hint) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="18" />
          </a>
        }
        <a class="row easy-hide" [routerLink]="url('L10')">
          <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'รหัสกลุ่ม', en: 'Group code' }) }}</strong>
            <span class="muted small block">{{ code() }} · {{ i18n.t({ th: 'สร้างใหม่ได้', en: 'can be regenerated' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row easy-hide" [routerLink]="url('L09')">
          <span class="icon-bubble"><app-icon name="bell" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'แจ้งเตือนเครื่องใหม่ของเจ้าหน้าที่', en: 'Officer new-device alerts' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'เปิดอยู่ · แจ้งทันทีเมื่อเจ้าหน้าที่เข้าจากเครื่องใหม่', en: 'On · alerts you when an officer signs in from a new device' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row" routerLink="/settings/notifications">
          <span class="icon-bubble"><app-icon name="bell" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'ตั้งค่าการแจ้งเตือน', en: 'Notification settings' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'ชนิดที่รับ · ส่งทดสอบ · วิธีแก้ถ้าไม่เด้ง', en: 'What to receive · send a test · fixes if nothing arrives' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      </nav>
      <h2 class="section-title">{{ i18n.t({ th: 'บัญชี', en: 'Account' }) }}</h2>
      <nav class="list">
        @for (r of account; track r.code) {
          <a class="row" [routerLink]="url(r.code)">
            <span class="icon-bubble"><app-icon [name]="r.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(r.title) }}</strong>
              <span class="muted small block easy-hide">{{ i18n.t(r.hint) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="18" />
          </a>
        }
      </nav>
      <!-- โหมดละเอียด: ข้อมูลบัญชี/หน่วยงานจริงจาก Me + /agency (ตาม SetHead_A) -->
      <section class="card adv-only">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'รหัสหน่วยงาน', en: 'Agency ID' }) }}</dt><dd class="mono">{{ api.agency()?.id ?? '—' }}</dd>
          <dt>{{ i18n.t({ th: 'รหัสกลุ่ม', en: 'Group code' }) }}</dt><dd class="mono">{{ rawCode() || '—' }}</dd>
          <dt>{{ i18n.t({ th: 'หัวหน้าทั้งหมด', en: 'Heads' }) }}</dt><dd class="mono">{{ api.agency()?.heads?.length ?? 0 }}</dd>
          <dt>{{ i18n.t({ th: 'บทบาทของฉัน', en: 'My roles' }) }}</dt><dd class="mono">{{ roles() }}</dd>
          <dt>{{ i18n.t({ th: 'โหมดแสดงผล', en: 'Display mode' }) }}</dt><dd>{{ modeLabel() }}</dd>
          <dt>Web Push</dt><dd class="mono">{{ session.me()?.push?.subscribed ? i18n.t({ th: 'เปิดแล้ว', en: 'subscribed' }) : i18n.t({ th: 'ยังไม่เปิด', en: 'not subscribed' }) }}</dd>
          <dt>{{ i18n.t({ th: 'เครื่องนี้', en: 'This device' }) }}</dt><dd>{{ device() }}</dd>
          <dt>{{ i18n.t({ th: 'ข้อตกลง', en: 'Terms' }) }}</dt><dd>{{ session.me()?.terms_update_required ? i18n.t({ th: 'ต้องยอมรับฉบับใหม่', en: 'new version required' }) : i18n.t({ th: 'ยอมรับแล้ว', en: 'accepted' }) }}</dd>
        </dl>
      </section>
      <button type="button" class="btn secondary push-end" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
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
  `,
})
export class HeadSettings {
  protected readonly i18n = inject(I18n);
  protected readonly session = inject(Session);
  protected readonly api = inject(HeadApi);
  protected readonly display = inject(DisplaySettings);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly agency = AGENCY;
  protected readonly account = ACCOUNT;
  protected readonly rawCode = computed(() => this.api.agency()?.group_code ?? '');
  protected readonly code = computed(() => showGroupCode(this.api.agency()?.group_code ?? null));
  protected readonly roles = computed(() => (this.session.me()?.roles ?? []).join(' · ') || '—');
  protected readonly modeLabel = computed(() => {
    const m = this.display.mode();
    return m === 'easy'
      ? this.i18n.t({ th: 'ง่าย', en: 'Easy' })
      : m === 'advanced'
        ? this.i18n.t({ th: 'ละเอียด', en: 'Detailed' })
        : this.i18n.t({ th: 'ปกติ', en: 'Normal' });
  });

  constructor() {
    void this.api.loadAgency().catch(() => undefined);
  }

  /** ชื่อเครื่องจาก user agent จริง (ไม่มี API รายการเครื่อง — ไม่ประดิษฐ์ข้อมูล) */
  protected device(): string {
    if (typeof navigator === 'undefined') return '—';
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '—';
    return `${browser} · ${os}`;
  }

  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04'), { replaceUrl: true }));
  }
}
