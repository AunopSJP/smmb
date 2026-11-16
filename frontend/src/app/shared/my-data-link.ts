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
      <!-- C1: ชื่อไม่ซ้ำกับ "ข้อมูลของฉัน" เดิม · A3: แถวเมนูธรรมดา ไม่มีกล่องไอคอน -->
      <a class="menu-row" routerLink="/settings/my-data">
        <app-icon class="mi" name="shield" [size]="20" />
        <span class="grow">
          <strong>{{ i18n.t({ th: 'บัญชีและความเป็นส่วนตัว', en: 'Account and privacy' }) }}</strong>
        </span>
        <app-icon class="chev" name="chevronRight" [size]="18" />
      </a>
    }
  `,
  styles: `
    :host { display: contents; }
  `,
})
export class MyDataLink {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(MyDataApi);

  constructor() {
    void this.api.probe();
  }
}
