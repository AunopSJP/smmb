import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DisplaySettings } from '../core/display-settings';
import { HeadApi, showGroupCode } from '../core/head-api';
import { I18n } from '../core/i18n';
import { liveRefresh } from '../core/live-refresh';
import { screenUrl } from '../screens/registry';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';

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

/** api.md §8 GET /agency/logs — เฉพาะไม่กี่แถวล่าสุดสำหรับโหมดละเอียด */
interface RecentLog {
  id: string;
  at: string;
  officer: { id: string; display_name: string } | null;
  box_id: string | null;
  house_no: string | null;
  result: string;
}

/** L04 หน้าหลักหัวหน้า — ภาพรวมทีมวันนี้ (ตัวกรองโซนของฉัน/ทุกโซน) · ใช้ API จริง · 3 โหมดตามแคนวาส */
@Component({
  selector: 'app-head-home',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })" [title]="api.agency()?.name ?? ''" [bell]="url('L09')" />

    <div class="stack">
      <p class="adv-only code-row">
        <span>{{ i18n.t({ th: 'รหัสกลุ่ม ', en: 'Group code ' }) }}<b>{{ code() || '—' }}</b></span>
      </p>

      <!-- โหมดง่าย: ตัวเลขใหญ่ 3 ตัว + คำขอรออนุมัติ (ตาม HeadEasy) -->
      <div class="easy-only stack">
        <section class="hero">
          <p class="hero-n">{{ checked() }} <small>{{ i18n.t({ th: 'จาก ' + total() + ' ตู้', en: 'of ' + total() }) }}</small></p>
          <p class="hero-label">{{ i18n.t({ th: 'ตรวจแล้ววันนี้', en: 'Checked today' }) }}</p>
          <span class="hero-bar" role="progressbar" [attr.aria-valuenow]="checked()" [attr.aria-valuemax]="total()"><span [style.width.%]="pctTotal()"></span></span>
        </section>

        <a class="big" [class.warn]="offline() > 0" [routerLink]="url('L06')">
          <span class="big-ic"><app-icon name="alert" [size]="26" /></span>
          <span class="grow">
            <b>{{ i18n.t({ th: 'ตู้ที่ต้องดู', en: 'Boxes to check' }) }}</b>
            <span>{{ i18n.t({ th: 'ออฟไลน์หรือยังไม่ได้ตรวจ', en: 'Offline or not checked yet' }) }}</span>
          </span>
          <span class="big-n">{{ offline() }}</span>
        </a>

        <a class="big" [class.sos]="(today()?.sos_open ?? 0) > 0" [routerLink]="url('O12')">
          <span class="big-ic"><app-icon name="shield" [size]="26" /></span>
          <span class="grow">
            <b>SOS</b>
            <span>{{ (today()?.sos_open ?? 0) > 0 ? i18n.t({ th: 'มีเคสเปิดอยู่ตอนนี้', en: 'A case is open now' }) : i18n.t({ th: 'ตอนนี้ไม่มีเคสเปิดอยู่', en: 'No case open right now' }) }}</span>
          </span>
          <span class="big-n">{{ today()?.sos_open ?? 0 }}</span>
        </a>

        @if ((today()?.members_pending ?? 0) > 0) {
          <a class="big" [routerLink]="url('L05')">
            <span class="big-ic"><app-icon name="user" [size]="26" /></span>
            <span class="grow">
              <b>{{ i18n.t({ th: 'คนรออนุมัติ', en: 'Waiting for approval' }) }}</b>
              <span>{{ i18n.t({ th: 'เจ้าหน้าที่ขอเข้าหน่วยงาน', en: 'Officers asking to join' }) }}</span>
            </span>
            <span class="big-n">{{ today()?.members_pending }}</span>
          </a>
        }
      </div>

      <div class="segmented easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'ขอบเขตโซน', en: 'Zone scope' })">
        <button type="button" [attr.aria-pressed]="!zoneId() && filter() === 'mine'" (click)="zoneId.set(''); filter.set('mine')">{{ i18n.t({ th: 'โซนของฉัน', en: 'My zones' }) }}</button>
        <button type="button" [attr.aria-pressed]="!zoneId() && filter() === 'all'" (click)="zoneId.set(''); filter.set('all')">{{ i18n.t({ th: 'ทุกโซน', en: 'All zones' }) }}</button>
      </div>
      @if (zoneOptions().length > 1) {
        <label class="field easy-hide">
          <span>{{ i18n.t({ th: 'เลือกโซนเดียว', en: 'Pick one zone' }) }}</span>
          <select [value]="zoneId()" (change)="pickZone($any($event.target).value)">
            <option value="">{{ i18n.t({ th: '— ดูตามตัวกรองด้านบน —', en: '— follow the filter above —' }) }}</option>
            @for (z of zoneOptions(); track z.id) {
              <option [value]="z.id">{{ z.name }}</option>
            }
          </select>
        </label>
      }

      @if (display.advancedMode()) {
        <!-- โหมดละเอียด: เพิ่มจำนวนออนไลน์ (คำนวณจากตู้ทั้งหมด − ออฟไลน์) ตาม HeadAdv -->
        <div class="stats4">
          <div class="stat">
            <p class="value">{{ checked() }}/{{ total() }}</p>
            <p class="label">{{ i18n.t({ th: 'ตรวจแล้ว', en: 'Checked' }) }}</p>
          </div>
          <div class="stat">
            <p class="value warn">{{ offline() }}</p>
            <p class="label">{{ i18n.t({ th: 'ออฟไลน์', en: 'Offline' }) }}</p>
          </div>
          <div class="stat">
            <p class="value">{{ online() }}</p>
            <p class="label">{{ i18n.t({ th: 'ออนไลน์', en: 'Online' }) }}</p>
          </div>
          <a class="stat link" [routerLink]="url('O12')">
            <p class="value">{{ today()?.sos_open ?? 0 }}</p>
            <p class="label">SOS</p>
          </a>
        </div>
      } @else {
        <div class="stats3 easy-hide">
          <div class="stat">
            <p class="value">{{ checked() }} / {{ total() }}</p>
            <p class="label">{{ i18n.t({ th: 'ตรวจแล้ววันนี้', en: 'Checked today' }) }}</p>
          </div>
          <div class="stat">
            <p class="value warn">{{ offline() }}</p>
            <p class="label">{{ i18n.t({ th: 'ตู้ออฟไลน์', en: 'Offline boxes' }) }}</p>
          </div>
          <a class="stat link" [routerLink]="url('O12')">
            <p class="value">{{ today()?.sos_open ?? 0 }}</p>
            <p class="label">{{ i18n.t({ th: 'SOS เปิดอยู่', en: 'Open SOS' }) }}</p>
          </a>
        </div>
      }

      @if ((today()?.members_pending ?? 0) > 0) {
        <a class="card pend easy-hide" [routerLink]="url('L05')">
          <span class="grow">
            <strong>{{ i18n.t({ th: 'คนรอให้คุณอนุมัติ', en: 'Waiting for your approval' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'เจ้าหน้าที่ขอเข้าหน่วยงาน', en: 'Officers asking to join' }) }}</span>
          </span>
          <span class="count">{{ today()?.members_pending }}</span>
        </a>
      }

      <div class="sec easy-hide">
        <h2 class="section-title">{{ i18n.t({ th: 'โซนวันนี้', en: 'Zones today' }) }}</h2>
        @if (windowsText()) {
          <span class="muted small">{{ i18n.t({ th: 'เวลาตรวจ ', en: 'Patrol hours ' }) }}{{ windowsText() }}</span>
        }
      </div>
      <nav class="list easy-hide">
        @for (z of today()?.zones ?? []; track z.id) {
          <a class="row zone" [routerLink]="url('L07')" [queryParams]="{ zone: z.id }">
            <span class="grow">
              <span class="zt">
                <strong>{{ z.name }}</strong>
                <span class="muted small">{{ z.houses_checked }} / {{ z.houses_total }}</span>
              </span>
              <span class="bar" role="progressbar" [attr.aria-valuenow]="z.houses_checked" [attr.aria-valuemax]="z.houses_total"><span [style.width.%]="pct(z)"></span></span>
              <span class="muted small block">
                @if (z.officers.length) {
                  {{ i18n.t({ th: 'เจ้าหน้าที่ ', en: 'Officers ' }) }}{{ z.officers.length }}{{ i18n.t({ th: ' คน', en: '' }) }}{{ z.houses_offline ? ' · ' + i18n.t({ th: 'ออฟไลน์ ', en: 'offline ' }) + z.houses_offline + i18n.t({ th: ' ตู้', en: '' }) : '' }}
                } @else {
                  {{ i18n.t({ th: 'ยังไม่มีคน', en: 'No officers yet' }) }}
                }
              </span>
              <span class="muted small block adv-only">
                {{ windows(z.windows) }} · {{ i18n.t({ th: 'จนท. ', en: 'officers ' }) }}{{ z.officers.length }} · {{ i18n.t({ th: 'ออนไลน์ ', en: 'online ' }) }}{{ z.houses_total - z.houses_offline }}/{{ z.houses_total }}
                @if (z.officers.length) {
                  · {{ officerNames(z) }}
                }
              </span>
            </span>
          </a>
        } @empty {
          <a class="row" [routerLink]="url('L06')">
            <span class="grow muted">{{ i18n.t({ th: 'ยังไม่มีโซน — แตะเพื่อสร้าง', en: 'No zones yet — tap to create' }) }}</span>
          </a>
        }
      </nav>

      @if (display.advancedMode() && recent().length) {
        <div class="sec adv-only">
          <h2 class="section-title">{{ i18n.t({ th: 'บันทึกล่าสุด', en: 'Latest activity' }) }}</h2>
          <span class="muted small">{{ i18n.t({ th: 'ทั้งหน่วยงาน', en: 'Whole agency' }) }}</span>
        </div>
        <ul class="feed adv-only">
          @for (l of recent(); track l.id) {
            <li>
              {{ exactTime(l.at) }} · {{ l.house_no ?? l.box_id ?? '—' }} · {{ l.officer?.display_name ?? '—' }}
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .stats3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .stats4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .stats3 .stat,
    .stats4 .stat {
      padding: 12px;
      text-align: start;
    }
    .stats4 .stat {
      padding: 8px 10px;
    }
    .stats3 .value,
    .stats4 .value {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1.2;
    }
    .stats4 .value {
      font-size: 1.15rem;
    }
    .stats3 .label,
    .stats4 .label {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .stats3 .value.warn,
    .stats4 .value.warn {
      color: var(--ib-warn-fg);
    }
    .code-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin: 0 2px;
      color: var(--text-muted);
      font-size: 0.75rem;
    }
    .hero {
      background: var(--surface);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 22px 20px;
    }
    .hero-n {
      font-size: 3.5rem;
      font-weight: 800;
      line-height: 1;
      color: var(--brand);
    }
    .hero-n small {
      font-size: 1.25rem;
      color: var(--text-muted);
      font-weight: 600;
    }
    .hero-label {
      margin-block-start: 6px;
      color: var(--text-muted);
      font-size: 1.0625rem;
    }
    .hero-bar {
      display: block;
      block-size: 10px;
      border-radius: 5px;
      background: var(--line);
      margin-block-start: 14px;
      overflow: hidden;
    }
    .hero-bar > span {
      display: block;
      block-size: 100%;
      background: var(--brand);
    }
    .big {
      display: flex;
      align-items: center;
      gap: 14px;
      min-block-size: 88px;
      padding: 16px 18px;
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      text-decoration: none;
      color: inherit;
    }
    .big-ic {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 52px;
      block-size: 52px;
      border-radius: 16px;
      background: var(--icon-bg);
      color: var(--brand);
    }
    .big.warn .big-ic {
      background: var(--ib-warn-bg);
      color: var(--ib-warn-fg);
    }
    .big.sos .big-ic {
      background: var(--danger-bg);
      color: var(--sos);
    }
    .big b {
      display: block;
      font-size: 1.25rem;
    }
    .big .grow > span {
      display: block;
      color: var(--text-muted);
      font-size: 0.9375rem;
    }
    .big-n {
      margin-inline-start: auto;
      display: grid;
      place-items: center;
      min-inline-size: 40px;
      block-size: 40px;
      padding: 0 6px;
      border-radius: 20px;
      background: var(--brand);
      color: #fff;
      font-size: 1.25rem;
      font-weight: 800;
    }
    .big.warn .big-n {
      background: var(--ib-warn-fg);
    }
    .big.sos .big-n {
      background: var(--sos);
    }
    .pend {
      display: flex;
      align-items: center;
      gap: 12px;
      border: 1.5px solid var(--brand);
      text-decoration: none;
      color: inherit;
    }
    .count {
      display: grid;
      place-items: center;
      min-inline-size: 28px;
      block-size: 28px;
      border-radius: 14px;
      background: var(--sos);
      color: #fff;
      font-weight: 700;
      font-size: 0.875rem;
    }
    .sec {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-block-start: 6px;
    }
    .zone {
      align-items: stretch;
    }
    .zt {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .zone .bar {
      display: block;
      block-size: 8px;
      border-radius: 4px;
      background: var(--line);
      margin-block: 8px 6px;
      overflow: hidden;
    }
    .zone .bar > span {
      display: block;
      block-size: 100%;
      background: var(--brand);
    }
    .zone-meta {
      overflow-wrap: break-word;
    }
    .feed {
      list-style: none;
      margin: 0;
      padding: 8px 12px;
      background: var(--surface);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      font-size: 0.75rem;
      line-height: 1.75;
      overflow-wrap: break-word;
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
    .link {
      text-decoration: none;
      color: inherit;
    }
  `,
})
export class HeadHome {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  protected readonly display = inject(DisplaySettings);
  private readonly http = inject(HttpClient);
  protected readonly url = screenUrl;
  protected readonly filter = signal<'mine' | 'all'>('all');
  /** เลือกโซนเดียว ('' = ใช้ตัวกรอง โซนของฉัน/ทุกโซน) */
  protected readonly zoneId = signal('');
  /** รายชื่อโซนทั้งหมดไว้ให้เลือก (ไม่เปลี่ยนตามตัวกรอง) */
  protected readonly zoneOptions = signal<{ id: string; name: string }[]>([]);
  protected readonly today = signal<Today | null>(null);
  protected readonly recent = signal<RecentLog[]>([]);
  protected readonly checked = computed(() => (this.today()?.zones ?? []).reduce((n, z) => n + z.houses_checked, 0));
  protected readonly total = computed(() => (this.today()?.zones ?? []).reduce((n, z) => n + z.houses_total, 0));
  protected readonly offline = computed(() => (this.today()?.zones ?? []).reduce((n, z) => n + z.houses_offline, 0));
  /** ออนไลน์ = ตู้ทั้งหมด − ออฟไลน์ (ค่าที่เซิร์ฟเวอร์ส่งมา ไม่ได้เดาเพิ่ม) */
  protected readonly online = computed(() => Math.max(0, this.total() - this.offline()));
  protected readonly code = computed(() => showGroupCode(this.api.agency()?.group_code ?? null));

  constructor() {
    void this.api.loadAgency().catch(() => undefined);
    void this.api.zones('all').then((z) => this.zoneOptions.set(z.map((x) => ({ id: x.id, name: x.name })))).catch(() => undefined);
    effect(() => {
      const f = this.zoneId() || this.filter();
      untracked(() => void this.load(f));
    });
    // โหมดละเอียดต้องใช้บันทึกล่าสุด — โหลดเมื่อเข้าโหมดเท่านั้น
    effect(() => {
      if (this.display.advancedMode()) untracked(() => void this.loadRecent());
    });
    // SOS / ตรวจแล้ว / คำขอเข้าทีม ของทั้งหน่วยงาน ขึ้นเองโดยไม่ต้องรีเฟรช
    liveRefresh(() => this.refreshAll(), 10_000);
  }

  protected readonly windowsText = computed(() => {
    const w = this.today()?.zones.find((z) => z.windows.length)?.windows ?? [];
    return w.map((x) => x.join('–')).join(' · ');
  });

  protected pct(z: { houses_checked: number; houses_total: number }): number {
    return z.houses_total ? Math.round((z.houses_checked / z.houses_total) * 100) : 0;
  }

  protected pctTotal(): number {
    return this.total() ? Math.round((this.checked() / this.total()) * 100) : 0;
  }

  protected pickZone(id: string): void {
    this.zoneId.set(id);
  }

  protected windows(w: [string, string][]): string {
    return w.map((x) => x.join('–')).join(' · ') || '—';
  }

  protected officerNames(z: { officers: { display_name: string }[] }): string {
    return z.officers.map((o) => o.display_name).join(', ');
  }

  protected exactTime(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok' });
  }

  private async refreshAll(): Promise<void> {
    await this.load(this.zoneId() || this.filter());
    if (this.display.advancedMode()) await this.loadRecent();
  }

  private async load(f: string): Promise<void> {
    this.today.set(await firstValueFrom(this.http.get<Today>(`/api/v1/agency/today?zone=${f}`)).catch(() => null));
  }

  private async loadRecent(): Promise<void> {
    const r = await firstValueFrom(this.http.get<{ data: RecentLog[] }>('/api/v1/agency/logs?page=1')).catch(() => null);
    this.recent.set((r?.data ?? []).slice(0, 5));
  }
}
