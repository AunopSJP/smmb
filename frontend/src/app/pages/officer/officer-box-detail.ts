import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HouseNav } from '../../core/house-nav';
import { I18n, type Tr } from '../../core/i18n';
import { InspectionApi, type OfficerBoxDetail } from '../../core/inspection-api';
import { Session } from '../../core/session';
import { DisplaySettings } from '../../core/display-settings';
import { fmtWhen } from '../../core/time';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { EmptyState, LoadingRows, LoadError } from '../../shared/state-view';

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
  imports: [RouterLink, PageHeader, Icon, LoadingRows, LoadError, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="caption()" [title]="detail()?.box?.name || (detail()?.box?.house_no ?? i18n.t({ th: 'รายละเอียดตู้', en: 'Mailbox details' }))" [back]="url('O01')" />
    <div class="stack grow">
      @if (loading()) {
        <app-loading-rows [rows]="3" [label]="i18n.t({ th: 'กำลังโหลดรายละเอียดตู้', en: 'Loading mailbox details' })" />
      } @else if (error()) {
        <app-load-error (retry)="load()" />
      } @else if (detail(); as d) {
        <section class="card status-card" [class.warn]="s().tone === 'warn'" [class.danger]="s().tone === 'danger'">
          <span class="status-icon"><app-icon [name]="s().icon" [size]="24" /></span>
          <div class="grow">
            <strong>{{ i18n.t(s().label) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ d.box.house_no }}@if (d.box.area) { · {{ d.box.area }} }</span>
          </div>
          <!-- โหมดง่ายซ่อนตารางด้านล่าง จึงโชว์แบตที่นี่แทน (โหมดอื่นมีในตารางแล้ว ไม่ซ้ำ) -->
          @if (d.box.battery) {
            <span class="chip easy-only">{{ d.box.battery.pct }}%</span>
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
          <app-empty-state compact [title]="i18n.t({ th: 'ยังไม่มีประวัติการตรวจ', en: 'No inspection history yet' })" />
        }

        <!-- นำทาง: เฉพาะบ้านที่เจ้าของปักหมุดไว้ · server ให้พิกัดเฉพาะในเวลาตรวจ (นอกเวลา = แจ้งเป็นข้อความ) -->
        @if (d.box.has_pin) {
          <button type="button" class="btn secondary" [disabled]="nav.busy() === d.box.id" (click)="nav.open(d.box.id)">
            <app-icon name="pin" [size]="20" />
            {{ i18n.t({ th: 'นำทางไปบ้านนี้', en: 'Directions to this house' }) }}
          </button>
        }

        @if (ready()) {
          <a class="btn big push-end" [routerLink]="url('O02')">
            <app-icon name="scan" [size]="22" />
            {{ i18n.t({ th: 'สแกน QR หน้าตู้', en: 'Scan mailbox QR' }) }}
          </a>
        } @else {
          <!-- ตู้ยังตรวจไม่ได้: ไม่ชวนสแกน (สแกนแล้วก็ไม่ผ่าน) · ปุ่มหลัก = ไปหลังอื่น · ยังลองสแกนได้เผื่อตู้เพิ่งกลับมา -->
          <p class="muted small not-ready" role="status">{{ i18n.t(notReadyHint()) }}</p>
          <div class="stack push-end">
            <a class="btn" [routerLink]="url('O01')">{{ i18n.t({ th: 'กลับหน้าสรุป ไปหลังอื่น', en: 'Back to summary — go to another house' }) }}</a>
            <a class="btn secondary" [routerLink]="url('O02')">
              <app-icon name="scan" [size]="20" />
              {{ i18n.t({ th: 'ลองสแกนอีกครั้ง', en: 'Try scanning anyway' }) }}
            </a>
          </div>
        }
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
      border-radius: var(--radius-sm);
      background: var(--ok-bg);
      color: var(--ok);
    }
    .status-card.warn .status-icon { background: var(--warn-bg); color: var(--warn); }
    .status-card.danger .status-icon { background: var(--danger-bg); color: var(--sos); }
    .push-end { margin-block-start: 8px; }
    .not-ready { margin: 0; }
    .btn.secondary { display: flex; align-items: center; justify-content: center; gap: 8px; }
  `,
})
export class OfficerBoxDetailPage implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(InspectionApi);
  private readonly session = inject(Session);
  private readonly display = inject(DisplaySettings);
  protected readonly nav = inject(HouseNav);
  protected readonly url = screenUrl;
  readonly id = input<string>();
  protected readonly detail = signal<OfficerBoxDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly s = computed(() => STATUS[this.detail()?.box.status ?? 'offline']);
  /** บริบทหัวหน้าเพจ (A6): เจ้าหน้าที่ใช้ชื่อหน่วยงาน — บ้านเลขที่อยู่ในชื่อหน้า/เนื้อหา */
  protected readonly caption = computed(() => this.session.me()?.agency?.name ?? this.i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' }));

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
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

  /** ตรวจได้เฉพาะตู้ที่ออนไลน์ — สถานะอื่นสแกนแล้วเซิร์ฟเวอร์จะปฏิเสธ */
  protected readonly ready = computed(() => this.detail()?.box.status === 'online');

  /** คำอธิบายสั้น ๆ ว่าทำไมยังตรวจตู้นี้ไม่ได้ */
  protected readonly notReadyHint = computed<Tr>(() => {
    switch (this.detail()?.box.status) {
      case 'sleeping':
        return { th: 'ตรวจได้เมื่อถึงเวลาตรวจของโซน', en: 'You can inspect it during the zone’s patrol hours' };
      case 'offline':
        return { th: 'ตรวจไม่ได้จนกว่าตู้จะกลับมาออนไลน์ · บ้านนี้ยังไม่นับว่าตรวจแล้ว', en: 'It can’t be inspected until it is back online · this house is not counted as checked' };
      default:
        return { th: 'ตู้นี้ยังตรวจไม่ได้ · บ้านนี้ยังไม่นับว่าตรวจแล้ว', en: 'This mailbox can’t be inspected yet · this house is not counted as checked' };
    }
  });

  /** เวลา: โหมดปกติถึงนาที (เหมือนฝั่งเจ้าของบ้าน) · วินาทีเฉพาะโหมดละเอียด */
  protected when(iso: string): string {
    return fmtWhen(iso, this.i18n.lang());
  }
}
