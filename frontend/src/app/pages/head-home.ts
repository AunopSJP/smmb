import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HeadApi } from '../core/head-api';
import { I18n } from '../core/i18n';
import { screenUrl } from '../screens/registry';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';
import { ZoneFilter } from './head/head-log';

/** api.md §8.1 GET /agency/today */
interface Today {
  date: string;
  zones: {
    id: string;
    name: string;
    is_mine: boolean;
    windows: [string, string][];
    houses_total: number;
    houses_checked: number;
    houses_offline: number;
    officers: { id: string; display_name: string }[];
  }[];
  sos_today: number;
  sos_open: number;
  members_pending: number;
}

/** L04 หน้าหลักหัวหน้า — ภาพรวมทีมวันนี้ (ตัวกรองโซนของฉัน/ทุกโซน) · ใช้ API จริง */
@Component({
  selector: 'app-head-home',
  imports: [RouterLink, PageHeader, Icon, ZoneFilter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="(api.agency()?.name ?? '') + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'ภาพรวมทีมวันนี้', en: 'Team today' })"
      [bell]="url('L09')"
    />

    <div class="stack">
      <app-zone-filter [(value)]="filter" />
      <div class="stats">
        <div class="stat">
          <p class="label">{{ i18n.t({ th: 'ตรวจแล้ว', en: 'Checked' }) }}</p>
          <p class="value ok">{{ checked() }}/{{ total() }}</p>
        </div>
        <a class="stat link" [routerLink]="url('O12')">
          <p class="label">{{ i18n.t({ th: 'SOS วันนี้', en: 'SOS today' }) }}</p>
          <p class="value danger">{{ today()?.sos_today ?? 0 }}</p>
        </a>
        <div class="stat">
          <p class="label">{{ i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Offline boxes' }) }}</p>
          <p class="value warn">{{ offline() }}</p>
        </div>
        <a class="stat link" [routerLink]="url('L05')">
          <p class="label">{{ i18n.t({ th: 'รอยืนยัน', en: 'To approve' }) }}</p>
          <p class="value">{{ today()?.members_pending ?? 0 }} {{ i18n.t({ th: 'คน', en: '' }) }}</p>
        </a>
      </div>

      <nav class="list">
        @for (z of today()?.zones ?? []; track z.id) {
          <a class="row" [routerLink]="url('L07')" [queryParams]="{ zone: z.id }">
            <span class="grow">
              <strong>{{ z.name }}</strong>
              @if (z.is_mine) {
                <span class="chip ok mine">{{ i18n.t({ th: 'โซนที่ฉันอยู่', en: 'My zone' }) }}</span>
              }
              <span class="muted small block">
                @if (z.officers.length) {
                  {{ z.officers[0].display_name }}{{ z.officers.length > 1 ? ' +' + (z.officers.length - 1) : '' }} · {{ windows(z.windows) }}
                } @else {
                  {{ i18n.t({ th: 'ยังไม่มีคน', en: 'No officers yet' }) }}
                }
              </span>
            </span>
            <span class="chip" [class.ok]="z.houses_total && z.houses_checked === z.houses_total" [class.warn]="z.houses_checked > 0 && z.houses_checked < z.houses_total" [class.danger]="z.houses_total > 0 && z.houses_checked === 0">
              {{ z.houses_checked }}/{{ z.houses_total }}
            </span>
          </a>
        } @empty {
          <a class="row" [routerLink]="url('L06')">
            <span class="grow muted">{{ i18n.t({ th: 'ยังไม่มีโซน — แตะเพื่อสร้าง', en: 'No zones yet — tap to create' }) }}</span>
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
    .center {
      text-align: center;
    }
  `,
})
export class HeadHome {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  private readonly http = inject(HttpClient);
  protected readonly url = screenUrl;
  protected readonly filter = signal<'mine' | 'all'>('all');
  protected readonly today = signal<Today | null>(null);
  protected readonly checked = computed(() => (this.today()?.zones ?? []).reduce((n, z) => n + z.houses_checked, 0));
  protected readonly total = computed(() => (this.today()?.zones ?? []).reduce((n, z) => n + z.houses_total, 0));
  protected readonly offline = computed(() => (this.today()?.zones ?? []).reduce((n, z) => n + z.houses_offline, 0));

  constructor() {
    void this.api.loadAgency().catch(() => undefined);
    effect(() => {
      const f = this.filter();
      untracked(() => void this.load(f));
    });
  }

  private async load(f: 'mine' | 'all'): Promise<void> {
    this.today.set(await firstValueFrom(this.http.get<Today>(`/api/v1/agency/today?zone=${f}`)).catch(() => null));
  }

  protected windows(w: [string, string][]): string {
    return w.map((x) => x.join('–')).join(' · ') || '—';
  }
}
