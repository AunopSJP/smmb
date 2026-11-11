import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi, type AdminOverview, type FirmwareInfo } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { LoadError } from '../../shared/state-view';

interface HubItem {
  code: string;
  icon: IconName;
  title: Tr;
  hint: Tr;
  /** ตัวเลขที่ต้องดู (จากภาพรวม) — ไม่มี = ไม่โชว์ */
  count?: (o: AdminOverview) => number;
  /** query string ของหน้าปลายทาง */
  query?: Record<string, string>;
}

/** D16 ระบบและตั้งค่า — ศูนย์รวมเมนูผู้ดูแล (ตามแคนวาสดีไซน์ UX/UI 2026-11-06): เฝ้าระวัง + ตั้งค่า · ใช้หน้าเดิมทั้งหมด */
const WATCH: HubItem[] = [
  { code: 'D05', icon: 'scan', title: { th: 'สุขภาพ QR', en: 'QR health' }, hint: { th: 'เคสที่ต้องจัดการ', en: 'Cases to handle' }, count: (o) => o.qr_issues.total },
  { code: 'D15', icon: 'wifi', title: { th: 'คำขอช่าง', en: 'Technician requests' }, hint: { th: 'รอรับ / รอนัด', en: 'Open requests' }, count: (o) => o.technician_requests_open },
  { code: 'D13', icon: 'layers', title: { th: 'หน่วยงาน', en: 'Agencies' }, hint: { th: 'อนุมัติและสร้างหน่วยงาน', en: 'Approve and create agencies' }, count: (o) => o.agencies_pending },
];
const SETTINGS: HubItem[] = [
  { code: 'D17', icon: 'layers', title: { th: 'เฟิร์มแวร์', en: 'Firmware' }, hint: { th: 'รุ่นของตู้ และอัปเดตอัตโนมัติ', en: 'Box versions and auto update' } },
  { code: 'D10', icon: 'settings', title: { th: 'ตั้งค่าตู้', en: 'Mailbox config' }, hint: { th: 'เวลารายงาน การสแกน ค่ากลาง', en: 'Reporting, scanning, defaults' } },
  { code: 'D14', icon: 'target', title: { th: 'แพ็กเกจ', en: 'Plans' }, hint: { th: 'ช่วงทดลองมีแค่แพ็กเกจฟรี', en: 'Trial has only the free plan' } },
  { code: 'D11', icon: 'list', title: { th: 'บันทึกทั้งหมด', en: 'All logs' }, hint: { th: 'ประวัติการสแกน/ส่งของ/SOS', en: 'Scans, deliveries, SOS' } },
  { code: 'D11', icon: 'shield', title: { th: 'บันทึกการเข้าถึงข้อมูล', en: 'Data access log' }, hint: { th: 'ใครเปิดดูเบอร์/รหัสลับ แก้ลบไม่ได้', en: 'Who opened phones/secrets, cannot be edited' }, query: { type: 'data_access' } },
  { code: 'D12', icon: 'bell', title: { th: 'แจ้งเตือน', en: 'Notifications' }, hint: { th: 'แจ้งเตือนของผู้ดูแล', en: 'Admin notifications' } },
];

@Component({
  selector: 'app-admin-hub',
  imports: [RouterLink, PageHeader, Icon, LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'ระบบ', en: 'System' })" />
    @if (failed()) {
      <app-load-error (retry)="load()" />
    }
    <div class="stack">
      <!-- โหมดง่าย (SetAdmin_E): 4 ทางเข้าหลักที่ต้องใช้บ่อย -->
      <nav class="list easy-only">
        <a class="row" [routerLink]="url('D05')">
          <span class="icon-bubble"><app-icon name="scan" [size]="20" /></span>
          <span class="grow"><strong>{{ i18n.t({ th: 'สุขภาพ QR', en: 'QR health' }) }}</strong><span class="muted small block">{{ i18n.t({ th: 'เคสที่ต้องจัดการ', en: 'Cases to handle' }) }}</span></span>
          @if (o(); as ov) { <span class="chip warn">{{ ov.qr_issues.total }}</span> }
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row" [routerLink]="url('D15')">
          <span class="icon-bubble"><app-icon name="wifi" [size]="20" /></span>
          <span class="grow"><strong>{{ i18n.t({ th: 'คำขอช่าง', en: 'Technician requests' }) }}</strong><span class="muted small block">{{ i18n.t({ th: 'รอรับ / รอนัด', en: 'Open requests' }) }}</span></span>
          @if (o(); as ov) { <span class="chip warn">{{ ov.technician_requests_open }}</span> }
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row" [routerLink]="url('D13')">
          <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
          <span class="grow"><strong>{{ i18n.t({ th: 'หน่วยงานรออนุมัติ', en: 'Agencies waiting' }) }}</strong><span class="muted small block">{{ i18n.t({ th: 'อนุมัติหรือสร้างหน่วยงาน', en: 'Approve or create' }) }}</span></span>
          @if (o(); as ov) { <span class="chip warn">{{ ov.agencies_pending }}</span> }
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row" [routerLink]="url('D11')" [queryParams]="{ type: 'data_access' }">
          <span class="icon-bubble"><app-icon name="list" [size]="20" /></span>
          <span class="grow"><strong>{{ i18n.t({ th: 'บันทึกการเข้าถึงข้อมูล', en: 'Data access log' }) }}</strong><span class="muted small block">{{ i18n.t({ th: 'แก้หรือลบไม่ได้', en: 'Cannot be edited' }) }}</span></span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row" routerLink="/settings/notifications">
          <span class="icon-bubble"><app-icon name="bell" [size]="20" /></span>
          <span class="grow"><strong>{{ i18n.t({ th: 'ตั้งค่าการแจ้งเตือน', en: 'Notification settings' }) }}</strong><span class="muted small block">{{ i18n.t({ th: 'ชนิดที่รับ · ส่งทดสอบ', en: 'What to receive · send a test' }) }}</span></span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row" routerLink="/settings/display">
          <span class="icon-bubble"><app-icon name="settings" [size]="20" /></span>
          <span class="grow"><strong>{{ i18n.t({ th: 'โหมดการแสดงผล', en: 'Display mode' }) }}</strong><span class="muted small block">{{ i18n.t({ th: 'ง่าย · ปกติ · ละเอียด', en: 'Easy · normal · detailed' }) }}</span></span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      </nav>

      <h2 class="section-title easy-hide">{{ i18n.t({ th: 'เฝ้าระวัง', en: 'Watch' }) }}</h2>
      <nav class="list easy-hide">
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
      <h2 class="section-title easy-hide">{{ i18n.t({ th: 'ตั้งค่า', en: 'Settings' }) }}</h2>
      <nav class="list easy-hide">
        @for (it of settings; track it.title.th) {
          <a class="row" [routerLink]="url(it.code)" [queryParams]="it.query ?? null">
            <span class="icon-bubble"><app-icon [name]="it.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(it.title) }}</strong>
              <span class="muted small block easy-hide">{{ i18n.t(it.hint) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="18" />
          </a>
        }
        <a class="row" routerLink="/settings/notifications">
          <span class="icon-bubble"><app-icon name="bell" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'ตั้งค่าการแจ้งเตือน', en: 'Notification settings' }) }}</strong>
            <span class="muted small block easy-hide">{{ i18n.t({ th: 'ชนิดที่รับ · ส่งทดสอบ · วิธีแก้ถ้าไม่เด้ง', en: 'What to receive · send a test · fixes if nothing arrives' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a class="row" routerLink="/settings/display">
          <span class="icon-bubble"><app-icon name="settings" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'โหมดการแสดงผล', en: 'Display mode' }) }}</strong>
            <span class="muted small block easy-hide">{{ i18n.t({ th: 'ง่าย · ปกติ · ละเอียด · ธีม · ภาษา · ขนาดตัวอักษร', en: 'Easy · normal · detailed · theme · language · text size' }) }}</span>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      </nav>
      @if (o(); as ov) {
        <section class="card adv-only">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'ตู้ทั้งหมด', en: 'Total boxes' }) }}</dt><dd>{{ ov.boxes.total }}</dd>
            <dt>{{ i18n.t({ th: 'ออนไลน์ / ออฟไลน์', en: 'Online / offline' }) }}</dt><dd>{{ ov.boxes.online }} / {{ ov.boxes.offline }}</dd>
            <dt>{{ i18n.t({ th: 'ตู้ออฟไลน์', en: 'Boxes offline' }) }}</dt><dd>{{ ov.boxes.offline }}</dd>
            <dt>{{ i18n.t({ th: 'แบตต่ำ', en: 'Low battery' }) }}</dt><dd>{{ ov.boxes.low_battery }}</dd>
            <dt>{{ i18n.t({ th: 'พัก / ปิดบริการ / ยังไม่ผูก', en: 'Sleeping / closed / unbound' }) }}</dt><dd>{{ ov.boxes.sleeping }} / {{ ov.boxes.service_closed }} / {{ ov.boxes.unbound }}</dd>
            <dt>{{ i18n.t({ th: 'ปัญหา QR', en: 'QR issues' }) }}</dt><dd>{{ ov.qr_issues.total }}</dd>
            <dt>{{ i18n.t({ th: 'คำขอช่างเปิด', en: 'Open technician requests' }) }}</dt><dd>{{ ov.technician_requests_open }}</dd>
            <dt>{{ i18n.t({ th: 'หน่วยงานรออนุมัติ', en: 'Agencies pending' }) }}</dt><dd>{{ ov.agencies_pending }}</dd>
            <dt>{{ i18n.t({ th: 'SOS ที่เปิดอยู่', en: 'Open SOS' }) }}</dt><dd>{{ ov.sos_open }}</dd>
            <dt>{{ i18n.t({ th: 'เฟิร์มแวร์ล่าสุด', en: 'Latest firmware' }) }}</dt><dd>{{ latestFw() || '—' }}</dd>
            <dt>{{ i18n.t({ th: 'อัปเดตอัตโนมัติ', en: 'Auto update' }) }}</dt><dd>{{ fwAuto() ?? i18n.t({ th: 'ปิด', en: 'Off' }) }}</dd>
            <dt>{{ i18n.t({ th: 'เจ้าของบ้านตามแพ็กเกจ', en: 'Owners by plan' }) }}</dt><dd>{{ planText() }}</dd>
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
  protected readonly firmware = signal<FirmwareInfo[]>([]);
  protected readonly fwAuto = signal<string | null>(null);
  protected readonly configVer = signal<number | null>(null);
  protected readonly latestFw = computed(() => this.firmware()[0]?.version ?? '');
  protected readonly failed = signal(false);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.failed.set(false);
    const [overview, firmware, auto, config] = await Promise.all([
      this.api.overview().catch(() => null),
      this.api.firmwareList().catch(() => null),
      this.api.firmwareAuto().catch(() => null),
      this.api.config().catch(() => null),
    ]);
    if (overview) this.o.set(overview);
    else this.failed.set(true);
    if (firmware) this.firmware.set(firmware);
    if (auto) this.fwAuto.set(auto.version);
    if (config) this.configVer.set(config.config_ver);
  }

  protected planText(): string {
    const plans = this.o()?.owners_by_plan ?? [];
    const name = (code: string) => code === 'free' ? this.i18n.t({ th: 'ฟรี', en: 'Free' }) : code === 'plus' ? this.i18n.t({ th: 'พลัส', en: 'Plus' }) : code;
    return plans.length ? plans.map((p) => `${name(p.plan_code)} ${p.owners_count}`).join(' · ') : '—';
  }
}
