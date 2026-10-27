import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { HeadDemo, type DemoLog } from '../../core/mock/head-demo';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

/** ตัวกรอง "โซนของฉัน / ทุกโซน" — เป็นตัวกรอง ไม่ใช่สิทธิ์ หัวหน้าเห็นได้ทุกโซนของหน่วยงาน (design §18) */
@Component({
  selector: 'app-zone-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'โซน', en: 'Zones' })">
      <button type="button" [attr.aria-pressed]="demo.zoneFilter() === 'mine'" (click)="demo.zoneFilter.set('mine')">
        {{ i18n.t({ th: 'โซนของฉัน', en: 'My zones' }) }}
      </button>
      <button type="button" [attr.aria-pressed]="demo.zoneFilter() === 'all'" (click)="demo.zoneFilter.set('all')">
        {{ i18n.t({ th: 'ทุกโซน', en: 'All zones' }) }}
      </button>
    </div>
  `,
})
export class ZoneFilter {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(HeadDemo);
}

const RESULT: Record<DemoLog['result'], { label: Tr; chip: string; icon: IconName; tone: string }> = {
  pass: { label: { th: 'ผ่าน', en: 'Passed' }, chip: 'ok', icon: 'shield', tone: '' },
  fail: { label: { th: 'ไม่ผ่าน', en: 'Failed' }, chip: 'danger', icon: 'alert', tone: 'danger' },
  not_recorded: { label: { th: 'ไม่บันทึก', en: 'Not recorded' }, chip: '', icon: 'alert', tone: '' },
};

// ── L08 · ประวัติการตรวจ ───────────────────────────────────────

@Component({
  selector: 'app-head-log',
  imports: [PageHeader, Icon, ZoneFilter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="agency() + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'ประวัติการตรวจ', en: 'Inspection log' })"
      [bell]="url('L09')"
    />
    <div class="stack">
      <app-zone-filter />
      <div class="segmented chips" role="group">
        @for (p of periods; track p.v) {
          <button type="button" [attr.aria-pressed]="period() === p.v" (click)="period.set(p.v)">{{ i18n.t(p.label) }}</button>
        }
        <span class="sep" aria-hidden="true"></span>
        <button type="button" [attr.aria-pressed]="onlyProblems()" (click)="onlyProblems.set(!onlyProblems())">
          {{ i18n.t({ th: 'เฉพาะที่มีปัญหา', en: 'Problems only' }) }}
        </button>
      </div>

      <ul class="list">
        @for (l of rows(); track l.id) {
          @let r = result[l.result];
          <li class="row">
            <span class="icon-bubble" [class.danger]="r.tone === 'danger'"><app-icon [name]="r.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ l.house }} · {{ l.time }}</strong>
              <span class="muted small block">{{ sub(l) }}</span>
            </span>
            <span class="chip" [class.ok]="r.chip === 'ok'" [class.danger]="r.chip === 'danger'">{{ i18n.t(r.label) }}</span>
          </li>
        } @empty {
          <li class="row muted">{{ i18n.t({ th: 'ไม่มีรายการ', en: 'Nothing here' }) }}</li>
        }
      </ul>
      <p class="muted small">{{ i18n.t({ th: 'บันทึกทุกการสแกน/พิมพ์รหัส แม้ไม่ผ่าน · ลบหรือแก้ไม่ได้', en: 'Every scan or typed code is logged, even failures · cannot be edited' }) }}</p>
    </div>
  `,
  styles: `
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .segmented {
      flex-wrap: wrap;
    }
    .sep {
      width: 1px;
      background: var(--line);
      margin: 4px 2px;
    }
  `,
})
export class HeadLog {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(HeadDemo);
  protected readonly url = screenUrl;
  protected readonly result = RESULT;
  protected readonly periods: { v: 'today' | '7d'; label: Tr }[] = [
    { v: 'today', label: { th: 'วันนี้', en: 'Today' } },
    { v: '7d', label: { th: '7 วัน', en: '7 days' } },
  ];
  protected readonly period = signal<'today' | '7d'>('today');
  protected readonly onlyProblems = signal(false);
  protected readonly agency = computed(() => (this.i18n.lang() === 'th' ? this.demo.agency.name : this.demo.agency.name_en));

  protected readonly rows = computed(() => {
    const zones = new Set(this.demo.visibleZones().map((z) => z.id));
    return this.demo.logs.filter((l) => zones.has(l.zone_id) && (!this.onlyProblems() || l.result !== 'pass'));
  });

  protected sub(l: DemoLog): string {
    const t = (th: string, en: string) => this.i18n.t({ th, en });
    const who = this.demo.memberName(l.officer_id, this.i18n.lang());
    if (l.note) return `${who} · ${this.i18n.t(l.note)}`;
    const qr = l.qr === 'front' ? t('QR หน้าตู้', 'Front QR') : t('QR สำรอง', 'Backup QR');
    const how = l.method === 'scan' ? t('สแกน', 'scan') : t('พิมพ์รหัส', 'typed code');
    return `${who} · ${qr} · ${how}`;
  }
}

// ── L09 · แจ้งเตือน ─────────────────────────────────────────

const NOTIFS: { icon: IconName; tone: string; title: Tr; body: Tr; open: string; query?: Record<string, string> }[] = [
  { icon: 'user', tone: '', title: { th: 'ลูกทีมขอเข้าหน่วยงาน 2 คน', en: '2 people want to join' }, body: { th: 'รอคุณยืนยัน · 10:42', en: 'Waiting for you · 10:42' }, open: 'L05' },
  { icon: 'alert', tone: 'danger', title: { th: 'SOS บ้าน 99/9 (โซน A)', en: 'SOS at 99/9 (zone A)' }, body: { th: 'ยังไม่มีคนรับใน 30 วินาที · 22:15', en: 'Nobody accepted within 30 s · 22:15' }, open: 'O09' },
  { icon: 'scan', tone: 'danger', title: { th: 'อาจมี QR ปลอม · 77/3', en: 'Possible fake QR · 77/3' }, body: { th: 'โซน C · แอดมินส่งช่างแล้ว', en: 'Zone C · admin sent a technician' }, open: 'L08' },
  { icon: 'alert', tone: 'warn', title: { th: 'ตู้ไม่ออนไลน์ 2 ตู้', en: '2 mailboxes offline' }, body: { th: 'โซน B · ตอนเริ่มเวลาตรวจ 17:00', en: 'Zone B · at patrol start 17:00' }, open: 'L06' },
  { icon: 'pin', tone: 'warn', title: { th: 'โซน C ยังไม่มีเจ้าหน้าที่', en: 'Zone C has no officers' }, body: { th: 'บ้าน 8 หลังยังไม่มีคนดูแล', en: '8 houses have no one assigned' }, open: 'L07', query: { zone: 'z3' } },
];

@Component({
  selector: 'app-head-notifications',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="agency() + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' })"
      [back]="url('L04')"
    />
    <div class="stack">
      <nav class="list">
        @for (n of items; track $index) {
          <a class="row" [routerLink]="url(n.open)" [queryParams]="n.query ?? null">
            <span class="icon-bubble" [class.danger]="n.tone === 'danger'" [class.warn]="n.tone === 'warn'"><app-icon [name]="n.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(n.title) }}</strong>
              <span class="muted small block">{{ i18n.t(n.body) }}</span>
            </span>
          </a>
        }
      </nav>
      <p class="muted small">{{ i18n.t({ th: 'แตะรายการเพื่อดูรายละเอียด', en: 'Tap an item for details' }) }}</p>
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
  `,
})
export class HeadNotifications {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(HeadDemo);
  protected readonly url = screenUrl;
  protected readonly items = NOTIFS;
  protected readonly agency = computed(() => (this.i18n.lang() === 'th' ? this.demo.agency.name : this.demo.agency.name_en));
}
