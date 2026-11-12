import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../core/i18n';
import { MyDataApi } from '../core/my-data-api';
import { Icon } from './icon';

/**
 * แถวเมนู "ข้อมูลของฉัน" ในหน้าตั้งค่าของทุกบทบาท
 * ซ่อนจนกว่า backend จะมี route (F-002) — ตรวจครั้งเดียวตอนเปิดหน้าตั้งค่า (ผลจำไว้ใน MyDataApi.availability)
 */
@Component({
  selector: 'app-my-data-link',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (api.availability() === 'yes') {
      <a class="row" routerLink="/settings/my-data">
        <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
        <span class="grow">
          <strong>{{ i18n.t({ th: 'ข้อมูลของฉัน', en: 'My data' }) }}</strong>
          <span class="muted small block easy-hide">{{ i18n.t({ th: 'เครื่องที่ล็อกอิน · ส่งออกข้อมูล · ลบบัญชี', en: 'Signed-in devices · export · delete account' }) }}</span>
        </span>
        <app-icon name="chevronRight" [size]="18" />
      </a>
    }
  `,
  styles: `
    :host { display: contents; }
    .grow { flex: 1; min-inline-size: 0; }
    .block { display: block; }
  `,
})
export class MyDataLink {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(MyDataApi);

  constructor() {
    void this.api.probe();
  }
}
