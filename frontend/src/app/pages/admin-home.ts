import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, type Tr } from '../core/i18n';
import { AdminDemo } from '../core/mock/admin-demo';
import { PlanDemo } from '../core/mock/plan-demo';
import { caseUrl } from './admin/admin-qr';
import { screenUrl } from '../screens/registry';
import { Icon, type IconName } from '../shared/icon';
import { PageHeader } from '../shared/page-header';

/** D01 ภาพรวมแอดมิน */
@Component({
  selector: 'app-admin-home',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'แอดมิน Smart Mailbox', en: 'Smart Mailbox admin' })"
      [title]="i18n.t({ th: 'ภาพรวม', en: 'Overview' })"
      [bell]="url('D12')"
    />

    <div class="stack">
      <div class="stats">
        <a class="stat link" [routerLink]="url('D03')">
          <p class="label">{{ i18n.t({ th: 'ตู้ออนไลน์', en: 'Boxes online' }) }}</p>
          <p class="value ok">{{ demo.totals.boxes_online }}/{{ demo.totals.boxes_total }}</p>
        </a>
        <a class="stat link" [routerLink]="url('D03')" [queryParams]="{ filter: 'low' }">
          <p class="label">{{ i18n.t({ th: 'แบตต่ำ', en: 'Low battery' }) }}</p>
          <p class="value warn">{{ demo.totals.low_battery }}</p>
        </a>
        <a class="stat link" [routerLink]="url('D05')">
          <p class="label">{{ i18n.t({ th: 'QR มีปัญหา', en: 'QR problems' }) }}</p>
          <p class="value danger">{{ demo.openQr().length }}</p>
        </a>
        <a class="stat link" [routerLink]="url('D02')">
          <p class="label">{{ i18n.t({ th: 'หน่วยงานรอ', en: 'Agencies waiting' }) }}</p>
          <p class="value">{{ demo.pendingAgencies().length }}</p>
        </a>
      </div>

      <a class="card plans link" [routerLink]="url('D14')">
        <span class="muted small">{{ i18n.t({ th: 'เจ้าของบ้านตามแพ็กเกจ', en: 'Owners by plan' }) }}</span>
        <span>
          @for (p of plans.plans(); track p.code; let last = $last) {
            <strong>{{ i18n.t(p.name) }}</strong> {{ plans.ownersCount(p.code) }}{{ last ? '' : ' · ' }}
          }
        </span>
      </a>

      <h2 class="section-title">{{ i18n.t({ th: 'ต้องจัดการ', en: 'To do' }) }}</h2>
      <nav class="list">
        @for (t of todo(); track t.key) {
          <a class="row" [routerLink]="t.path" [queryParams]="t.query ?? null">
            <span class="icon-bubble" [class.danger]="t.tag === 'urgent'" [class.warn]="t.tag === 'box'">
              <app-icon [name]="t.icon" [size]="20" />
            </span>
            <span class="grow">
              <strong>{{ i18n.t(t.title) }}</strong>
              <span class="muted small block">{{ i18n.t(t.sub) }}</span>
            </span>
            <span class="chip" [class.danger]="t.tag === 'urgent'" [class.warn]="t.tag === 'box'">
              {{ i18n.t(tagLabel[t.tag]) }}
            </span>
          </a>
        } @empty {
          <p class="row muted">{{ i18n.t({ th: 'ไม่มีงานค้าง', en: 'Nothing to do' }) }}</p>
        }
      </nav>

      <nav class="list">
        @for (m of menu; track m.code) {
          <a class="row" [routerLink]="url(m.code)" [queryParams]="m.code === 'A14' ? { from: 'D01' } : null">
            <span class="icon-bubble"><app-icon [name]="m.icon" [size]="20" /></span>
            <strong class="grow">{{ i18n.t(m.label) }}</strong>
            <app-icon name="chevronRight" [size]="18" />
          </a>
        }
      </nav>
      <a class="btn secondary signout" [routerLink]="url('A04')">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</a>
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
    .link {
      text-decoration: none;
      color: inherit;
    }
    .plans {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .signout {
      color: var(--brand);
      box-shadow: inset 0 0 0 1.5px var(--line);
    }
  `,
})
export class AdminHome {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(AdminDemo);
  protected readonly plans = inject(PlanDemo);
  protected readonly url = screenUrl;

  /** งานค้าง: QR อาจปลอม · หน่วยงานรออนุมัติ · ตู้เงียบ — หายไปเมื่อจัดการแล้ว */
  protected readonly todo = computed(() => {
    const items: { key: string; icon: IconName; tag: 'urgent' | 'pending' | 'box'; title: Tr; sub: Tr; path: string; query?: Record<string, string> }[] = [];
    for (const c of this.demo.openQr().filter((q) => q.health === 'maybe_fake')) {
      const link = caseUrl(c);
      items.push({ key: c.id, icon: 'alert', tag: 'urgent', title: { th: 'QR อาจปลอม · ' + c.house, en: 'Possible fake QR · ' + c.house }, sub: c.reason, path: link.path, query: link.query });
    }
    for (const a of this.demo.pendingAgencies()) {
      items.push({ key: a.id, icon: 'user', tag: 'pending', title: { th: 'หน่วยงานใหม่ · ' + a.name.th, en: 'New agency · ' + a.name.en }, sub: { th: 'ส่งคำขอ ' + a.sent.th, en: 'Requested ' + a.sent.en }, path: screenUrl('D02') });
    }
    for (const b of this.demo.boxes().filter((x) => x.status === 'offline')) {
      items.push({ key: b.id, icon: 'box', tag: 'box', title: { th: 'ตู้ ' + b.house_no + ' ไม่ติดต่อ ' + b.last_seen.th, en: 'Box ' + b.house_no + ' silent ' + b.last_seen.en }, sub: { th: 'ไม่ได้รายงานเกิน 26 ชม.', en: 'No report for over 26 h' }, path: screenUrl('D04'), query: { id: b.id } });
    }
    return items;
  });

  protected readonly tagLabel = {
    urgent: { th: 'ด่วน', en: 'Urgent' },
    pending: { th: 'รอ', en: 'Waiting' },
    box: { th: 'ตู้', en: 'Box' },
  };
  protected readonly menu: { code: string; icon: IconName; label: Tr }[] = [
    { code: 'D09', icon: 'user', label: { th: 'ผู้ใช้', en: 'Users' } },
    { code: 'D10', icon: 'target', label: { th: 'ค่าตั้งค่าตู้', en: 'Mailbox config' } },
    { code: 'D13', icon: 'shield', label: { th: 'หน่วยงาน', en: 'Agencies' } },
    { code: 'D14', icon: 'layers', label: { th: 'แพ็กเกจ', en: 'Plans' } },
    { code: 'T01', icon: 'settings', label: { th: 'งานช่าง (ติดตั้ง)', en: 'Technician (install)' } },
    { code: 'A14', icon: 'user', label: { th: 'เปลี่ยนรหัสผ่านของฉัน', en: 'Change my password' } },
  ];
}
