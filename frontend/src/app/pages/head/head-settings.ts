import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
      <app-push-status [compact]="true" />
      <h2 class="section-title">{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</h2>
      <nav class="list">
        @for (r of agency; track r.code) {
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
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly agency = AGENCY;
  protected readonly account = ACCOUNT;

  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04'), { replaceUrl: true }));
  }
}
