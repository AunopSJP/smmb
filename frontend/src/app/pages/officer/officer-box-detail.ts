import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { InspectionApi, type OfficerBoxDetail } from '../../core/inspection-api';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { LoadingRows } from '../../shared/state-view';

const STATUS: Record<OfficerBoxDetail['box']['status'], { label: Tr; icon: IconName; tone: '' | 'warn' | 'danger' }> = {
  online: { label: { th: 'ตู้ออนไลน์ พร้อมตรวจ', en: 'Online — ready to inspect' }, icon: 'check', tone: '' },
  sleeping: { label: { th: 'ตู้พักอยู่ (นอกเวลาตรวจ)', en: 'Sleeping outside patrol hours' }, icon: 'info', tone: 'warn' },
  offline: { label: { th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' }, icon: 'alert', tone: 'danger' },
  service_closed: { label: { th: 'ตู้ปิดให้บริการ', en: 'Mailbox service closed' }, icon: 'alert', tone: 'danger' },
  unbound: { label: { th: 'ตู้ยังไม่ผูกบ้าน', en: 'Mailbox not linked to a house' }, icon: 'alert', tone: 'danger' },
};

/** OffBoxDetail — รายละเอียดตู้ก่อนเริ่มตรวจ (เฉพาะตู้ในโซนของเจ้าหน้าที่) */
@Component({
  selector: 'app-officer-box-detail',
  imports: [RouterLink, PageHeader, Icon, LoadingRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="caption()" [title]="detail()?.box?.name || (detail()?.box?.house_no ?? i18n.t({ th: 'รายละเอียดตู้', en: 'Mailbox details' }))" [back]="url('O01')" />
    <div class="stack grow">
      @if (loading()) {
        <app-loading-rows [rows]="3" [label]="i18n.t({ th: 'กำลังโหลดรายละเอียดตู้', en: 'Loading mailbox details' })" />
      } @else if (error()) {
        <section class="card stack">
          <strong>{{ i18n.t({ th: 'เปิดรายละเอียดตู้ไม่ได้', en: 'Could not open this mailbox' }) }}</strong>
          <span class="muted small">{{ i18n.t({ th: 'ตู้อาจไม่อยู่ในโซนของคุณ หรือถูกลบไปแล้ว', en: 'It may not be in your zones, or it was removed.' }) }}</span>
          <a class="btn secondary" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
        </section>
      } @else if (detail(); as d) {
        <section class="card status-card" [class.warn]="s().tone === 'warn'" [class.danger]="s().tone === 'danger'">
          <span class="status-icon"><app-icon [name]="s().icon" [size]="24" /></span>
          <div class="grow">
            <strong>{{ i18n.t(s().label) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ d.box.house_no }}@if (d.box.area) { · {{ d.box.area }} }</span>
          </div>
          @if (d.box.battery) {
            <span class="chip">{{ d.box.battery.pct }}%</span>
          }
        </section>

        <section class="card easy-hide">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'โซน', en: 'Zones' }) }}</dt>
            <dd>{{ d.zones.map((z) => z.name).join(' · ') || '—' }}</dd>
            <dt>{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last seen' }) }}</dt>
            <dd>{{ d.box.last_seen_at ? when(d.box.last_seen_at) : '—' }}</dd>
            <dt>{{ i18n.t({ th: 'แบตเตอรี่', en: 'Battery' }) }}</dt>
            <dd>{{ d.box.battery ? d.box.battery.pct + '%' + (d.box.battery.charging ? i18n.t({ th: ' · ชาร์จอยู่', en: ' · charging' }) : '') : i18n.t({ th: 'ยังไม่รายงาน', en: 'No report yet' }) }}</dd>
            <dt class="adv-only">{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt>
            <dd class="mono adv-only">{{ d.box.id }}</dd>
          </dl>
        </section>

        <h2 class="section-title">{{ i18n.t({ th: 'การตรวจ 3 ครั้งล่าสุด', en: 'Last 3 inspections' }) }}</h2>
        @if (d.recent.length) {
          <ul class="list">
            @for (r of d.recent; track r.id) {
              <li class="row">
                <span class="icon-bubble"><app-icon name="check" [size]="18" /></span>
                <span class="grow">
                  <strong>{{ r.officer_name }}</strong>
                  <span class="muted small block">{{ r.agency_name }}</span>
                </span>
                <span class="muted small">{{ when(r.checked_at) }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="muted small">{{ i18n.t({ th: 'ยังไม่มีประวัติการตรวจ', en: 'No inspection history yet' }) }}</p>
        }

        <a class="btn big push-end" [routerLink]="url('O02')">
          <app-icon name="scan" [size]="22" />
          {{ i18n.t({ th: 'สแกน QR หน้าตู้', en: 'Scan mailbox QR' }) }}
        </a>
      }
    </div>
  `,
  styles: `
    .grow { flex: 1; min-inline-size: 0; }
    .block { display: block; }
    .status-card { display: flex; align-items: center; gap: 12px; }
    .status-card.warn { border-color: var(--warn); }
    .status-card.danger { border-color: var(--sos); }
    .status-icon {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 44px;
      block-size: 44px;
      border-radius: 14px;
      background: var(--ok-bg);
      color: var(--ok);
    }
    .status-card.warn .status-icon { background: var(--warn-bg); color: var(--warn); }
    .status-card.danger .status-icon { background: var(--danger-bg); color: var(--sos); }
    .push-end { margin-block-start: 8px; }
  `,
})
export class OfficerBoxDetailPage implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(InspectionApi);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly detail = signal<OfficerBoxDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly s = computed(() => STATUS[this.detail()?.box.status ?? 'offline']);
  protected readonly caption = computed(() => {
    const d = this.detail();
    return d ? `${this.i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' })}${d.box.house_no}` : this.i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' });
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const id = this.id();
    if (!id) {
      this.loading.set(false);
      this.error.set(true);
      return;
    }
    try {
      this.detail.set(await this.api.boxDetail(id));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
    });
  }
}
