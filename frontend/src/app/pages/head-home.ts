import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../core/i18n';
import { HeadDemo } from '../core/mock/head-demo';
import { screenUrl } from '../screens/registry';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';
import { ZoneFilter } from './head/head-log';

/** L04 หน้าหลักหัวหน้า — ภาพรวมทีมวันนี้ (มีตัวกรองโซนของฉัน/ทุกโซน) */
@Component({
  selector: 'app-head-home',
  imports: [RouterLink, PageHeader, Icon, ZoneFilter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="agency() + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'ภาพรวมทีมวันนี้', en: 'Team today' })"
      [bell]="url('L09')"
    />

    <div class="stack">
      <app-zone-filter />
      <div class="stats">
        <div class="stat">
          <p class="label">{{ i18n.t({ th: 'ตรวจแล้ว', en: 'Checked' }) }}</p>
          <p class="value ok">{{ checked() }}/{{ total() }}</p>
        </div>
        <div class="stat">
          <p class="label">{{ i18n.t({ th: 'SOS วันนี้', en: 'SOS today' }) }}</p>
          <p class="value danger">1</p>
        </div>
        <div class="stat">
          <p class="label">{{ i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Offline boxes' }) }}</p>
          <p class="value warn">{{ demo.zoneFilter() === 'mine' ? 0 : 2 }}</p>
        </div>
        <a class="stat link" [routerLink]="url('L05')">
          <p class="label">{{ i18n.t({ th: 'รอยืนยัน', en: 'To approve' }) }}</p>
          <p class="value">{{ demo.pending().length }} {{ i18n.t({ th: 'คน', en: '' }) }}</p>
        </a>
      </div>

      <nav class="list">
        @for (z of demo.visibleZones(); track z.id) {
          <a class="row" [routerLink]="url('L07')" [queryParams]="{ zone: z.id }">
            <span class="grow">
              <strong>{{ z.name }}</strong>
              @if (z.mine) {
                <span class="chip ok mine">{{ i18n.t({ th: 'โซนที่ฉันอยู่', en: 'My zone' }) }}</span>
              }
              <span class="muted small block">
                @if (z.officer_ids.length) {
                  {{ demo.memberName(z.officer_ids[0], i18n.lang()) }}{{ z.officer_ids.length > 1 ? ' +' + (z.officer_ids.length - 1) : '' }} · {{ z.windows.join(' · ') }}
                } @else {
                  {{ i18n.t({ th: 'ยังไม่มีคน', en: 'No officers yet' }) }}
                }
              </span>
            </span>
            <span class="chip" [class.ok]="z.checked_today === z.house_count" [class.warn]="z.checked_today > 0 && z.checked_today < z.house_count" [class.danger]="z.checked_today === 0">
              {{ z.checked_today }}/{{ z.house_count }}
            </span>
          </a>
        }
      </nav>

      <a class="btn big" [routerLink]="url('O02')">
        <app-icon name="scan" [size]="26" />
        {{ i18n.t({ th: 'ตรวจตู้เอง', en: 'Inspect a box myself' }) }}
      </a>
      <p class="muted small center">{{ i18n.t({ th: 'ตรวจได้เฉพาะโซนที่คุณอยู่', en: 'You can only inspect zones you belong to' }) }}</p>
      <nav class="list">
        <a class="row" [routerLink]="url('O13')">
          <span class="icon-bubble"><app-icon name="user" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'บัญชีของฉัน', en: 'My account' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'เปลี่ยนรหัส · การแสดงผล · ออกจากระบบ', en: 'Password · display · sign out' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      </nav>
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
    .mine {
      margin-left: 6px;
      font-size: 0.6875rem;
    }
    .link {
      text-decoration: none;
      color: inherit;
    }
  `,
})
export class HeadHome {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(HeadDemo);
  protected readonly url = screenUrl;
  protected readonly agency = computed(() => (this.i18n.lang() === 'th' ? this.demo.agency.name : this.demo.agency.name_en));
  protected readonly checked = computed(() => this.demo.visibleZones().reduce((n, z) => n + z.checked_today, 0));
  protected readonly total = computed(() => this.demo.visibleZones().reduce((n, z) => n + z.house_count, 0));
}
