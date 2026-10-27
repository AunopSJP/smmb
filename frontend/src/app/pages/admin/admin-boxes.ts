import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { AdminDemo, LOW_BATTERY_PCT, type DemoBox } from '../../core/mock/admin-demo';
import { PlanDemo } from '../../core/mock/plan-demo';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { caseUrl, HEALTH } from './admin-qr';

type Tone = '' | 'ok' | 'warn' | 'danger';

/** ป้ายสถานะตู้ — ลำดับ: ยังไม่ผูก > ปิดบริการ > ไม่ออนไลน์ > แบตต่ำ > ออนไลน์ / พักอยู่ */
export function boxBadge(b: DemoBox): { label: Tr; tone: Tone } {
  if (b.status === 'unbound') return { label: { th: 'ว่าง', en: 'Unbound' }, tone: '' };
  if (b.status === 'service_closed') return { label: { th: 'ปิดบริการ', en: 'Closed' }, tone: '' };
  if (b.status === 'offline') return { label: { th: 'ไม่ออนไลน์', en: 'Offline' }, tone: 'danger' };
  if (b.battery_pct < LOW_BATTERY_PCT) return { label: { th: 'แบตต่ำ', en: 'Low battery' }, tone: 'warn' };
  if (b.status === 'online') return { label: { th: 'ออนไลน์', en: 'Online' }, tone: 'ok' };
  return { label: { th: 'พักอยู่', en: 'Sleeping' }, tone: '' };
}

type BoxFilter = 'all' | 'offline' | 'low';

// ── D03 · ตู้ทั้งหมด ─────────────────────────────────────────

@Component({
  selector: 'app-admin-boxes',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'แอดมิน Smart Mailbox', en: 'Smart Mailbox admin' })"
      [title]="i18n.t({ th: 'ตู้ทั้งหมด', en: 'All mailboxes' })"
      [bell]="url('D12')"
    />
    <div class="stack">
      <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'กรอง', en: 'Filter' })">
        @for (f of filters; track f.v) {
          <button type="button" [attr.aria-pressed]="filter() === f.v" (click)="filter.set(f.v)">{{ i18n.t(f.label) }}</button>
        }
      </div>
      @if (plans.plans().length > 1) {
        <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'แพ็กของเจ้าของ', en: 'Owner plan' })">
          <button type="button" [attr.aria-pressed]="planFilter() === 'all'" (click)="planFilter.set('all')">{{ i18n.t({ th: 'ทุกแพ็ก', en: 'All plans' }) }}</button>
          @for (p of plans.plans(); track p.code) {
            <button type="button" [attr.aria-pressed]="planFilter() === p.code" (click)="planFilter.set(p.code)">{{ i18n.t(p.name) }}</button>
          }
        </div>
      }
      <nav class="list">
        @for (b of rows(); track b.id) {
          @let badge = boxBadge(b);
          <a class="row" [routerLink]="url('D04')" [queryParams]="{ id: b.id }">
            <span class="icon-bubble" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">
              <app-icon name="box" [size]="20" />
            </span>
            <span class="grow">
              <strong>{{ title(b) }}</strong>
              <span class="muted small block">{{ sub(b) }}</span>
            </span>
            <span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">
              {{ i18n.t(badge.label) }}
            </span>
          </a>
        } @empty {
          <p class="row muted">{{ i18n.t({ th: 'ไม่มีตู้ในกลุ่มนี้', en: 'No mailboxes here' }) }}</p>
        }
      </nav>
      <p class="muted small">
        {{ i18n.t({ th: 'ข้อมูลตัวอย่าง ' + demo.boxes().length + ' ตู้ จากทั้งหมด ' + demo.totals.boxes_total + ' ตู้', en: 'Sample of ' + demo.boxes().length + ' of ' + demo.totals.boxes_total + ' mailboxes' }) }}
      </p>
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
export class AdminBoxes {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(AdminDemo);
  protected readonly url = screenUrl;
  protected readonly boxBadge = boxBadge;

  /** ?filter=low จากหน้าแจ้งเตือน */
  readonly filterParam = input<string | undefined>(undefined, { alias: 'filter' });
  protected readonly filter = linkedSignal<BoxFilter>(() => {
    const f = this.filterParam();
    return f === 'offline' || f === 'low' ? f : 'all';
  });
  protected readonly filters: { v: BoxFilter; label: Tr }[] = [
    { v: 'all', label: { th: 'ทั้งหมด', en: 'All' } },
    { v: 'offline', label: { th: 'ไม่ออนไลน์', en: 'Offline' } },
    { v: 'low', label: { th: 'แบตต่ำ', en: 'Low battery' } },
  ];

  protected readonly plans = inject(PlanDemo);
  /** ?plan= ใน GET /admin/boxes — ตู้กรองตามแพ็กของเจ้าของ */
  protected readonly planFilter = signal('all');

  protected readonly rows = computed(() => {
    const f = this.filter();
    const p = this.planFilter();
    return this.demo.boxes().filter(
      (b) =>
        (f === 'offline' ? b.status === 'offline' : f === 'low' ? b.battery_pct < LOW_BATTERY_PCT && b.status !== 'unbound' : true) &&
        (p === 'all' || (!!b.owner_id && this.plans.current(b.owner_id)?.plan_code === p)),
    );
  });

  protected title(b: DemoBox): string {
    if (!b.house_no || !b.owner) return `${b.id} · ${this.i18n.t({ th: 'ยังไม่ผูก', en: 'not bound' })}`;
    return `${b.house_no} · ${this.i18n.t(b.owner)}`;
  }

  protected sub(b: DemoBox): string {
    const seen = this.i18n.t({ th: `ติดต่อ ${b.last_seen.th}ที่แล้ว`, en: `seen ${b.last_seen.en} ago` });
    return `${this.i18n.t({ th: 'แบต', en: 'Battery' })} ${b.battery_pct}% · ${seen}`;
  }
}

// ── D04 · รายละเอียดตู้ ─────────────────────────────────────

const UNBIND_REASONS: { v: string; label: Tr }[] = [
  { v: 'sold', label: { th: 'ขายบ้าน / ย้ายออก', en: 'House sold / moved out' } },
  { v: 'owner_request', label: { th: 'เจ้าของบ้านขอยกเลิก', en: 'Owner asked to cancel' } },
  { v: 'other', label: { th: 'อื่น ๆ', en: 'Other' } },
];

@Component({
  selector: 'app-admin-box',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (box(); as b) {
      @let badge = boxBadge(b);
      @let qrCase = demo.caseOfBox(b.id);
      <app-page-header [caption]="b.id" [title]="i18n.t({ th: 'ตู้ ', en: 'Mailbox ' }) + (b.house_no ?? i18n.t({ th: 'ยังไม่ผูก', en: 'not bound' }))" [back]="url('D03')" />
      <div class="stack grow">
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt>
            <dd><span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">{{ i18n.t(badge.label) }}</span></dd>
            @if (b.owner) {
              <dt>{{ i18n.t({ th: 'เจ้าของ', en: 'Owner' }) }}</dt>
              <dd><a [routerLink]="url('D09')" [queryParams]="{ id: b.owner_id }">{{ i18n.t(b.owner) }}</a></dd>
              @if (ownerPlan(); as p) {
                <dt>{{ i18n.t({ th: 'แพ็กเกจ', en: 'Plan' }) }}</dt>
                <dd>{{ i18n.t(p.name) }}</dd>
              }
            }
            <dt>{{ i18n.t({ th: 'แบต', en: 'Battery' }) }}</dt>
            <dd [class.warn-text]="b.battery_pct < low">{{ b.battery_pct }}%{{ b.charging ? i18n.t({ th: ' · ชาร์จอยู่', en: ' · charging' }) : '' }}</dd>
            <dt>{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last seen' }) }}</dt>
            <dd>{{ i18n.t({ th: b.last_seen.th + 'ที่แล้ว', en: b.last_seen.en + ' ago' }) }}</dd>
            <dt>{{ i18n.t({ th: 'โซน', en: 'Zone' }) }}</dt>
            <dd>{{ b.zone ? i18n.t(b.zone) : '—' }}</dd>
            <dt>{{ i18n.t({ th: 'ค่าตั้งค่า', en: 'Config' }) }}</dt>
            <dd [class.warn-text]="b.config_ver !== demo.config().ver">
              v{{ b.config_ver }}
              {{ b.config_ver === demo.config().ver ? i18n.t({ th: '(ตรงกัน)', en: '(up to date)' }) : i18n.t({ th: '(รอตู้ดึงค่าใหม่)', en: '(waiting for the box)' }) }}
            </dd>
          </dl>
        </section>

        <nav class="list">
          @if (qrCase && qrCase.slot === 1) {
            <a class="row" [routerLink]="caseLink(qrCase).path" [queryParams]="caseLink(qrCase).query">
              <span class="grow">
                <strong>{{ i18n.t({ th: 'QR หน้าตู้', en: 'Front QR' }) }}</strong>
                <span class="muted small block">{{ i18n.t(qrCase.reason) }}</span>
              </span>
              <span class="chip" [class.danger]="health[qrCase.health].tone === 'danger'" [class.warn]="health[qrCase.health].tone === 'warn'">{{ i18n.t(health[qrCase.health].label) }}</span>
              <app-icon name="chevronRight" [size]="18" />
            </a>
          } @else {
            <div class="row">
              <span class="grow">
                <strong>{{ i18n.t({ th: 'QR หน้าตู้', en: 'Front QR' }) }}</strong>
                <span class="muted small block">{{ i18n.t(b.qr_front_age) }}</span>
              </span>
              <span class="chip ok">{{ i18n.t({ th: 'ปกติ', en: 'OK' }) }}</span>
            </div>
          }
          <div class="row">
            <span class="grow">
              <strong>{{ i18n.t({ th: 'QR สำรอง', en: 'Backup QR' }) }}</strong>
              <span class="muted small block">{{ i18n.t(b.qr_backup) }}</span>
            </span>
            <span class="chip ok">{{ i18n.t({ th: 'ปกติ', en: 'OK' }) }}</span>
          </div>
          <div class="row">
            <span class="grow">
              <strong>{{ i18n.t({ th: 'QR เปิดใช้ตู้', en: 'Activation QR' }) }}</strong>
              <span class="muted small block">{{ b.qr_activate ? i18n.t(b.qr_activate) : i18n.t({ th: 'ใบใหม่ · รอเจ้าของบ้านสแกน', en: 'New · waiting for the owner' }) }}</span>
            </span>
            <span class="chip">{{ b.qr_activate ? i18n.t({ th: 'ใช้แล้ว', en: 'Used' }) : i18n.t({ th: 'รอใช้', en: 'Unused' }) }}</span>
          </div>
        </nav>

        @if (b.tech_request; as r) {
          @if (r.status !== 'done') {
            <section class="card tech">
              <div class="tech-head">
                <app-icon name="wifi" [size]="20" />
                <strong class="grow">{{ i18n.t({ th: 'เจ้าของบ้านขอช่าง · ', en: 'Technician request · ' }) }}{{ i18n.t(r.reason) }}</strong>
                <span class="chip" [class.warn]="r.status === 'open'">{{ r.status === 'open' ? i18n.t({ th: 'รอนัด', en: 'To schedule' }) : i18n.t({ th: 'นัดแล้ว', en: 'Scheduled' }) }}</span>
              </div>
              <p class="muted small">{{ i18n.t(r.when) }} · {{ i18n.t({ th: 'เจ้าของบ้านได้รับแจ้งทุกครั้งที่เปลี่ยนสถานะ', en: 'The owner is notified on every change' }) }}</p>
              @if (r.status === 'open') {
                <button type="button" class="btn secondary" (click)="tech(b.id, 'scheduled')">{{ i18n.t({ th: 'นัดช่างแล้ว', en: 'Mark as scheduled' }) }}</button>
              } @else {
                <button type="button" class="btn secondary" (click)="tech(b.id, 'done')">{{ i18n.t({ th: 'ช่างทำเสร็จแล้ว', en: 'Mark as done' }) }}</button>
              }
            </section>
          }
        }

        @if (b.status === 'unbound') {
          <p class="info-box muted">{{ i18n.t({ th: 'ยังไม่มีเจ้าของ — ติดตั้งเสร็จแล้วให้เจ้าของบ้านสมัคร และสแกน QR เปิดใช้ตู้ที่อยู่ในตู้', en: 'No owner yet — after install, the owner signs up and scans the activation QR kept inside the box' }) }}</p>
        }
        <p class="muted small">{{ i18n.t({ th: 'การเปิดดูข้อมูลเจ้าของในหน้านี้ถูกบันทึก', en: 'Viewing owner details on this page is logged' }) }}</p>

        <div class="stack push-end">
          @if (b.status === 'unbound') {
            <a class="btn" [routerLink]="url('T01')" [queryParams]="{ id: b.id }">{{ i18n.t({ th: 'เปิดเช็กลิสต์ติดตั้ง', en: 'Open the install checklist' }) }}</a>
          } @else if (unbinding()) {
            <fieldset class="card options confirm">
              <legend>{{ i18n.t({ th: 'ยกเลิกการผูกตู้ ', en: 'Unbind mailbox ' }) }}{{ b.house_no }}?</legend>
              @for (r of reasons; track r.v) {
                <label><input type="radio" name="unbind" [value]="r.v" [checked]="reason() === r.v" (change)="reason.set(r.v)" /> {{ i18n.t(r.label) }}</label>
              }
              <p class="muted small">{{ i18n.t({ th: 'เจ้าของบ้านจะไม่เห็นตู้นี้อีก · ระบบออก QR เปิดใช้ตู้ใบใหม่ให้ เจ้าของคนใหม่ผูกได้', en: 'The owner loses this mailbox · a new activation QR is issued for the next owner' }) }}</p>
              <div class="two">
                <button type="button" class="btn secondary" (click)="unbinding.set(false)">{{ i18n.t({ th: 'ไม่ยกเลิก', en: 'Keep' }) }}</button>
                <button type="button" class="btn" [disabled]="!reason()" (click)="unbind(b.id)">{{ i18n.t({ th: 'ยืนยันยกเลิกการผูก', en: 'Unbind' }) }}</button>
              </div>
            </fieldset>
          } @else {
            <div class="two">
              @if (b.status === 'service_closed') {
                <button type="button" class="btn secondary" (click)="service(b.id, true)">{{ i18n.t({ th: 'เปิดให้บริการ', en: 'Reopen service' }) }}</button>
              } @else {
                <button type="button" class="btn secondary" (click)="service(b.id, false)">{{ i18n.t({ th: 'ปิดให้บริการ', en: 'Close service' }) }}</button>
              }
              <button type="button" class="btn secondary danger" (click)="unbinding.set(true)">{{ i18n.t({ th: 'ยกเลิกการผูกตู้', en: 'Unbind' }) }}</button>
            </div>
            @if (b.status === 'service_closed') {
              <p class="muted small center">{{ i18n.t({ th: 'ปิดบริการอยู่: ไรเดอร์แจ้งส่งของไม่ได้ และเจ้าหน้าที่ตรวจไม่ได้', en: 'Closed: riders cannot report deliveries and officers cannot inspect' }) }}</p>
            }
          }
        </div>
      </div>
    }
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .row .grow {
      min-width: 0;
    }
    .block {
      display: block;
    }
    .kv a {
      color: var(--brand);
    }
    .tech {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tech-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .btn.danger {
      color: var(--sos);
      box-shadow: inset 0 0 0 1.5px var(--sos);
    }
    .confirm legend {
      float: left;
      width: 100%;
    }
    .confirm .btn {
      min-height: 48px;
    }
  `,
})
export class AdminBox {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(AdminDemo);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly boxBadge = boxBadge;
  protected readonly health = HEALTH;
  protected readonly low = LOW_BATTERY_PCT;
  protected readonly reasons = UNBIND_REASONS;
  readonly id = input<string>();

  protected readonly box = computed(() => this.demo.box(this.id()) ?? this.demo.boxes()[0]);
  private readonly plans = inject(PlanDemo);
  /** แพ็กของเจ้าของตู้ (อ่านอย่างเดียว — เปลี่ยนที่หน้าผู้ใช้) */
  protected readonly ownerPlan = computed(() => {
    const id = this.box()?.owner_id;
    const cur = id ? this.plans.current(id) : undefined;
    return cur ? this.plans.plan(cur.plan_code) : undefined;
  });
  protected readonly unbinding = signal(false);
  protected readonly reason = signal<string | null>(null);

  protected caseLink = caseUrl;

  protected service(id: string, active: boolean): void {
    this.demo.setService(id, active);
    this.toast.show(active ? { th: 'เปิดให้บริการแล้ว', en: 'Service reopened' } : { th: 'ปิดให้บริการตู้นี้แล้ว', en: 'Service closed for this mailbox' });
  }

  protected unbind(id: string): void {
    this.demo.unbind(id);
    this.unbinding.set(false);
    this.reason.set(null);
    this.toast.show({ th: 'ยกเลิกการผูกตู้แล้ว', en: 'Mailbox unbound' });
  }

  protected tech(id: string, status: 'scheduled' | 'done'): void {
    this.demo.setTechRequest(id, status);
    this.toast.show(status === 'scheduled' ? { th: 'บันทึกนัดช่างแล้ว', en: 'Marked as scheduled' } : { th: 'ปิดคำขอช่างแล้ว', en: 'Request closed' });
  }
}
