import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi, type AdminOverview } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

interface HubItem {
  code: string;
  icon: IconName;
  title: Tr;
  hint: Tr;
  /** ตัวเลขที่ต้องดู (จากภาพรวม) — ไม่มี = ไม่โชว์ */
  count?: (o: AdminOverview) => number;
}

/** D16 ระบบและตั้งค่า — ศูนย์รวมเมนูผู้ดูแล (ตามแคนวาสดีไซน์ UX/UI 2026-11-06): เฝ้าระวัง + ตั้งค่า · ใช้หน้าเดิมทั้งหมด */
const WATCH: HubItem[] = [
  { code: 'D05', icon: 'scan', title: { th: 'สุขภาพ QR', en: 'QR health' }, hint: { th: 'เคสที่ต้องจัดการ', en: 'Cases to handle' }, count: (o) => o.qr_issues.total },
  { code: 'D15', icon: 'wifi', title: { th: 'คำขอช่าง', en: 'Technician requests' }, hint: { th: 'รอรับ / รอนัด', en: 'Open requests' }, count: (o) => o.technician_requests_open },
  { code: 'D13', icon: 'layers', title: { th: 'หน่วยงาน', en: 'Agencies' }, hint: { th: 'อนุมัติและสร้างหน่วยงาน', en: 'Approve and create agencies' }, count: (o) => o.agencies_pending },
];
const SETTINGS: HubItem[] = [
  { code: 'D10', icon: 'settings', title: { th: 'ตั้งค่าตู้', en: 'Mailbox config' }, hint: { th: 'เวลารายงาน การสแกน ค่ากลาง', en: 'Reporting, scanning, defaults' } },
  { code: 'D14', icon: 'target', title: { th: 'แพ็กเกจ', en: 'Plans' }, hint: { th: 'ช่วงทดลองมีแค่แพ็กเกจฟรี', en: 'Trial has only the free plan' } },
  { code: 'D11', icon: 'list', title: { th: 'บันทึกทั้งหมด', en: 'All logs' }, hint: { th: 'ประวัติการสแกน/ส่งของ/SOS', en: 'Scans, deliveries, SOS' } },
  { code: 'D12', icon: 'bell', title: { th: 'แจ้งเตือน', en: 'Notifications' }, hint: { th: 'แจ้งเตือนของผู้ดูแล', en: 'Admin notifications' } },
];

@Component({
  selector: 'app-admin-hub',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'ระบบ', en: 'System' })" />
    <div class="stack">
      <h2 class="section-title">{{ i18n.t({ th: 'เฝ้าระวัง', en: 'Watch' }) }}</h2>
      <nav class="list">
        @for (it of watch; track it.code) {
          <a class="row" [routerLink]="url(it.code)">
            <span class="icon-bubble"><app-icon [name]="it.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(it.title) }}</strong>
              <span class="muted small block">{{ i18n.t(it.hint) }}</span>
            </span>
            @if (it.count && o(); as ov) {
              @if (it.count(ov); as n) {
                <span class="chip warn">{{ n }}</span>
              }
            }
            <app-icon name="chevronRight" [size]="18" />
          </a>
        }
      </nav>
      <h2 class="section-title">{{ i18n.t({ th: 'ตั้งค่า', en: 'Settings' }) }}</h2>
      <nav class="list">
        @for (it of settings; track it.code) {
          <a class="row" [routerLink]="url(it.code)">
            <span class="icon-bubble"><app-icon [name]="it.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(it.title) }}</strong>
              <span class="muted small block easy-hide">{{ i18n.t(it.hint) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="18" />
          </a>
        }
      </nav>
      @if (o(); as ov) {
        <section class="card adv-only">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'ตู้ออฟไลน์', en: 'Boxes offline' }) }}</dt><dd class="mono">{{ ov.boxes.offline }}</dd>
            <dt>{{ i18n.t({ th: 'แบตต่ำ', en: 'Low battery' }) }}</dt><dd class="mono">{{ ov.boxes.low_battery }}</dd>
            <dt>{{ i18n.t({ th: 'SOS ที่เปิดอยู่', en: 'Open SOS' }) }}</dt><dd class="mono">{{ ov.sos_open }}</dd>
          </dl>
        </section>
      }
    </div>
  `,
  styles: `
    .block {
      display: block;
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
  `,
})
export class AdminHub {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  protected readonly url = screenUrl;
  protected readonly watch = WATCH;
  protected readonly settings = SETTINGS;
  protected readonly o = signal<AdminOverview | null>(null);

  constructor() {
    this.api.overview().then((v) => this.o.set(v)).catch(() => undefined);
  }
}
