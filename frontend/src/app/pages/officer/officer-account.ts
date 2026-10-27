import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { MOCK_OFFICER, MOCK_OFFICER_ACCOUNT } from '../../core/mock/mock-data';
import { AuthDemo, formatPhone } from '../../core/mock/auth-demo';
import { DemoSession } from '../../core/mock/demo-session';
import { OfficerDemo } from '../../core/mock/officer-demo';
import { AccountActions } from '../auth/auth-account';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

/** O13 บัญชีเจ้าหน้าที่ */
@Component({
  selector: 'app-officer-account',
  imports: [RouterLink, PageHeader, Icon, AccountActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="me.agency + ' · ' + me.zone" [title]="me.display_name" />
    <div class="stack grow">
      <section class="card">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'ชื่อ', en: 'Name' }) }}</dt><dd>{{ name() }}</dd>
          <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt><dd>{{ phone() }}</dd>
          <dt>{{ i18n.t({ th: 'หน่วยงาน', en: 'Agency' }) }}</dt><dd>{{ th() ? a.agency : a.agency_en }}</dd>
          <dt>{{ i18n.t({ th: 'โซน', en: 'Zone' }) }}</dt><dd>{{ th() ? a.zone : a.zone_en }}</dd>
          <dt>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</dt><dd>{{ a.windows }}</dd>
        </dl>
      </section>

      <nav class="list">
        <div class="row">
          <span class="icon-bubble ok"><app-icon name="bell" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'ต้องเปิดไว้เสมอ เพื่อรับ SOS', en: 'Must stay on to receive SOS' }) }}</span>
          </span>
          <span class="chip ok">{{ i18n.t({ th: 'เปิด', en: 'On' }) }}</span>
        </div>
        <div class="row">
          <span class="icon-bubble"><app-icon name="scan" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'กล้อง', en: 'Camera' }) }}</strong>
            <span class="muted small block">
              {{ demo.camera() === 'denied'
                ? i18n.t({ th: 'ไม่อนุญาต ต้องพิมพ์รหัสใต้ QR', en: 'Not allowed — type codes instead' })
                : i18n.t({ th: 'อนุญาตแล้ว ใช้สแกน QR หน้าตู้', en: 'Allowed — used to scan mailbox QR' }) }}
            </span>
          </span>
          @if (demo.camera() === 'denied') {
            <span class="chip warn">{{ i18n.t({ th: 'ไม่อนุญาต', en: 'Blocked' }) }}</span>
          } @else {
            <span class="chip ok">{{ i18n.t({ th: 'อนุญาต', en: 'Allowed' }) }}</span>
          }
        </div>
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
      <a class="btn secondary signout push-end" [routerLink]="url('A04')">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</a>
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
    .icon-bubble.ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
    .signout {
      color: var(--brand);
      box-shadow: inset 0 0 0 1.5px var(--line);
    }
  `,
})
export class OfficerAccount {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(OfficerDemo);
  protected readonly url = screenUrl;
  protected readonly me = MOCK_OFFICER;
  protected readonly a = MOCK_OFFICER_ACCOUNT;
  protected readonly th = computed(() => this.i18n.lang() === 'th');
  private readonly session = inject(DemoSession);
  private readonly auth = inject(AuthDemo);
  /** ชื่อ/เบอร์ของบัญชีที่ล็อกอินอยู่ (หัวหน้าก็ใช้หน้านี้) */
  protected readonly name = computed(() => {
    const acc = this.auth.account(this.session.phone());
    return acc ? this.i18n.t(acc.name) : this.th() ? this.a.name : this.a.name_en;
  });
  protected readonly phone = computed(() => {
    const p = this.session.phone();
    return p ? formatPhone(p) : this.a.phone;
  });
}
