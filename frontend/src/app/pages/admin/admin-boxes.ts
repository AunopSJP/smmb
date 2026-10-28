import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiConfig } from '../../core/api';
import { AdminApi, type AdminBoxDetail, type AdminBoxRow, type RegisteredBox } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { minutesAgo, type BoxStatus } from '../../core/owner-api';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { BoxTest } from '../../shared/box-test';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { QrImage } from '../../shared/qr-image';

// แอดมิน: D03 ตู้ทั้งหมด + ลงทะเบียนตู้ใหม่ · D04 รายละเอียดตู้ (QR จริง · ทดสอบปลุกตู้ · รหัสลับเขียนลงบอร์ด) — api.md §9.4

type Tone = '' | 'ok' | 'warn' | 'danger';
export const LOW_BATTERY_PCT = 20;

const STATUS: Record<BoxStatus, { label: Tr; tone: Tone }> = {
  online: { label: { th: 'ออนไลน์', en: 'Online' }, tone: 'ok' },
  sleeping: { label: { th: 'พักอยู่', en: 'Sleeping' }, tone: '' },
  offline: { label: { th: 'ไม่ออนไลน์', en: 'Offline' }, tone: 'danger' },
  service_closed: { label: { th: 'ปิดบริการ', en: 'Closed' }, tone: '' },
  unbound: { label: { th: 'ยังไม่ผูก', en: 'Unbound' }, tone: '' },
};

/** ป้ายสถานะตู้ — แบตต่ำแทนออนไลน์/พักอยู่ */
export function boxBadge(b: Pick<AdminBoxRow, 'status' | 'battery'>): { label: Tr; tone: Tone } {
  if ((b.status === 'online' || b.status === 'sleeping') && b.battery && b.battery.pct < LOW_BATTERY_PCT) {
    return { label: { th: 'แบตต่ำ', en: 'Low battery' }, tone: 'warn' };
  }
  return STATUS[b.status];
}

/** "ไม่เคยติดต่อ" / "5 นาทีที่แล้ว" */
export function seenText(iso: string | null): Tr {
  const m = minutesAgo(iso);
  if (m === null) return { th: 'ยังไม่เคยติดต่อ', en: 'never connected' };
  if (m < 1) return { th: 'เมื่อสักครู่', en: 'just now' };
  if (m < 60) return { th: `${m} นาทีที่แล้ว`, en: `${m} min ago` };
  if (m < 1440) return { th: `${Math.floor(m / 60)} ชม.ที่แล้ว`, en: `${Math.floor(m / 60)} h ago` };
  return { th: `${Math.floor(m / 1440)} วันที่แล้ว`, en: `${Math.floor(m / 1440)} d ago` };
}

const SLOT_LABEL: Record<string, Tr> = {
  '1': { th: 'QR หน้าตู้', en: 'Front QR' },
  '2': { th: 'QR สำรอง', en: 'Backup QR' },
  activate: { th: 'QR เปิดใช้ตู้', en: 'Activation QR' },
};

type BoxFilter = 'all' | 'unbound' | 'offline' | 'low';

// ── D03 · ตู้ทั้งหมด ─────────────────────────────────────────

@Component({
  selector: 'app-admin-boxes',
  imports: [RouterLink, PageHeader, Icon, QrImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'แอดมิน Smart Mailbox', en: 'Smart Mailbox admin' })"
      [title]="i18n.t({ th: 'ตู้ทั้งหมด', en: 'All mailboxes' })"
      [bell]="url('D12')"
    />
    <div class="stack">
      @if (created().length) {
        <section class="card stack new">
          <h2 class="section-title">{{ i18n.t({ th: 'ลงทะเบียนแล้ว — จดรหัสลับไปเขียนลงบอร์ด', en: 'Registered — copy the secret onto the board' }) }}</h2>
          @for (b of created(); track b.box_id) {
            <div class="stack reg">
              <strong>{{ b.box_id }}</strong>
              <code class="secret">{{ b.device_secret }}</code>
              <div class="qr-grid">
                @for (q of b.qr; track q.slot) {
                  <figure>
                    <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
                    <figcaption class="small">{{ i18n.t(slot(q.slot)) }}<br /><strong>{{ q.print_code }}</strong></figcaption>
                  </figure>
                }
              </div>
            </div>
          }
          <button type="button" class="btn secondary" (click)="created.set([])">{{ i18n.t({ th: 'จดแล้ว ปิด', en: 'Done, close' }) }}</button>
        </section>
      }

      <form class="add" (submit)="$event.preventDefault(); register()">
        <label class="field">
          <span>{{ i18n.t({ th: 'ลงทะเบียนตู้ใหม่ (จำนวน)', en: 'Register new boxes (count)' }) }}</span>
          <input type="number" min="1" max="50" inputmode="numeric" [value]="count()" (input)="count.set(+$any($event.target).value)" />
        </label>
        <button type="submit" class="btn" [disabled]="busy() || count() < 1 || count() > 50">{{ i18n.t({ th: 'สร้าง', en: 'Create' }) }}</button>
      </form>

      <input class="search" type="search" [placeholder]="i18n.t({ th: 'ค้นรหัสตู้ / บ้านเลขที่', en: 'Search box id / house no.' })" [value]="q()" (input)="q.set($any($event.target).value)" />
      <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'กรอง', en: 'Filter' })">
        @for (f of filters; track f.v) {
          <button type="button" [attr.aria-pressed]="filter() === f.v" (click)="filter.set(f.v)">{{ i18n.t(f.label) }}</button>
        }
      </div>
      <nav class="list">
        @for (b of rows(); track b.id) {
          @let badge = boxBadge(b);
          <a class="row" [routerLink]="url('D04')" [queryParams]="{ id: b.id }">
            <span class="icon-bubble" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">
              <app-icon name="box" [size]="20" />
            </span>
            <span class="grow">
              <strong>{{ b.id }}{{ b.house_no ? ' · ' + b.house_no : '' }}</strong>
              <span class="muted small block">
                {{ b.battery ? i18n.t({ th: 'แบต ', en: 'Battery ' }) + b.battery.pct + '% · ' : '' }}{{ i18n.t(seen(b.last_seen_at)) }}
              </span>
            </span>
            <span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">
              {{ i18n.t(badge.label) }}
            </span>
          </a>
        } @empty {
          <p class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ไม่มีตู้ในกลุ่มนี้', en: 'No mailboxes here' }) }}</p>
        }
      </nav>
      <p class="muted small">{{ i18n.t({ th: 'ทั้งหมด ' + total() + ' ตู้', en: total() + ' mailboxes' }) }}</p>
    </div>
  `,
  styles: `
    .status {
      margin: 0 0 12px;
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      background: var(--icon-bg);
      color: var(--text-muted);
      font-weight: 700;
    }
    .status.ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
    .status.warn {
      background: var(--warn-bg, var(--icon-bg));
      color: var(--warn, var(--text));
    }
    .status.danger {
      background: var(--danger-bg, var(--icon-bg));
      color: var(--danger, var(--sos));
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .add {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: end;
    }
    .search {
      min-height: 44px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }
    .new {
      box-shadow: inset 0 0 0 2px var(--ok);
    }
    .secret {
      word-break: break-all;
      font-size: 0.8125rem;
      background: var(--icon-bg);
      padding: 6px 8px;
      border-radius: var(--radius-sm);
    }
    .qr-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      figure {
        margin: 0;
        text-align: center;
      }
      app-qr-image {
        background: #fff;
      }
    }
  `,
})
export class AdminBoxes implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly boxBadge = boxBadge;
  protected readonly seen = seenText;
  protected readonly slot = (s: string | number) => SLOT_LABEL[String(s)];

  /** ?filter=low|offline จากหน้าแจ้งเตือน */
  readonly filterParam = input<string | undefined>(undefined, { alias: 'filter' });
  protected readonly filter = signal<BoxFilter>('all');
  protected readonly filters: { v: BoxFilter; label: Tr }[] = [
    { v: 'all', label: { th: 'ทั้งหมด', en: 'All' } },
    { v: 'unbound', label: { th: 'ยังไม่ผูก', en: 'Unbound' } },
    { v: 'offline', label: { th: 'ไม่ออนไลน์', en: 'Offline' } },
    { v: 'low', label: { th: 'แบตต่ำ', en: 'Low battery' } },
  ];
  protected readonly boxes = signal<AdminBoxRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly q = signal('');
  protected readonly count = signal(1);
  protected readonly busy = signal(false);
  protected readonly created = signal<RegisteredBox[]>([]);

  protected readonly rows = computed(() => {
    const f = this.filter();
    const q = this.q().trim().toLowerCase();
    return this.boxes().filter(
      (b) =>
        (f === 'unbound' ? b.status === 'unbound' : f === 'offline' ? b.status === 'offline' : f === 'low' ? !!b.battery && b.battery.pct < LOW_BATTERY_PCT : true) &&
        (!q || b.id.toLowerCase().includes(q) || (b.house_no ?? '').toLowerCase().includes(q)),
    );
  });

  ngOnInit(): void {
    const f = this.filterParam();
    if (f === 'offline' || f === 'low' || f === 'unbound') this.filter.set(f);
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const r = await this.api.boxes();
      this.boxes.set(r.data);
      this.total.set(r.total);
    } finally {
      this.loading.set(false);
    }
  }

  /** POST /admin/boxes { count } → รหัสลับ + QR ชุดแรก (พิมพ์ได้จากหน้านี้หรือ D04) */
  protected async register(): Promise<void> {
    this.busy.set(true);
    try {
      this.created.set(await this.api.registerBoxes(this.count()));
      this.toast.show({ th: 'ลงทะเบียนตู้แล้ว', en: 'Boxes registered' });
      await this.load();
    } catch {
      this.toast.show({ th: 'สร้างไม่ได้ ลองใหม่', en: 'Couldn’t create — try again' });
    } finally {
      this.busy.set(false);
    }
  }
}

// ── D04 · รายละเอียดตู้ ─────────────────────────────────────

@Component({
  selector: 'app-admin-box',
  imports: [RouterLink, PageHeader, QrImage, BoxTest],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="id() ?? ''" [title]="i18n.t({ th: 'ตู้ ', en: 'Mailbox ' }) + (box()?.house_no ?? id() ?? '')" [back]="url('D03')" />
    @if (box(); as b) {
      @let badge = boxBadge(b);
      <div class="stack grow">
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt>
            <dd><span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">{{ i18n.t(badge.label) }}</span></dd>
            <dt>{{ i18n.t({ th: 'บ้าน', en: 'House' }) }}</dt>
            <dd>{{ b.bound ? (b.house_no + (b.name ? ' · ' + b.name : '')) : i18n.t({ th: 'ยังไม่ผูก', en: 'not bound' }) }}</dd>
            <dt>{{ i18n.t({ th: 'แบต', en: 'Battery' }) }}</dt>
            <dd>{{ b.battery ? b.battery.pct + '%' + (b.battery.charging ? i18n.t({ th: ' · ชาร์จอยู่', en: ' · charging' }) : '') : '—' }}</dd>
            <dt>{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last seen' }) }}</dt>
            <dd>{{ i18n.t(seen(b.last_seen_at)) }}</dd>
            <dt>{{ i18n.t({ th: 'ถือ long-poll ล่าสุด', en: 'Last long-poll' }) }}</dt>
            <dd>{{ i18n.t(seen(b.last_poll_at)) }}</dd>
            <dt>{{ i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' }) }}</dt>
            <dd>{{ b.fw ?? '—' }}</dd>
            <dt>{{ i18n.t({ th: 'ค่าตั้งค่า', en: 'Config' }) }}</dt>
            <dd [class.warn-text]="!b.config.in_sync">
              v{{ b.config.config_ver }}
              {{ b.config.in_sync ? i18n.t({ th: '(ตู้มีค่าล่าสุด)', en: '(up to date)' }) : i18n.t({ th: '(รอตู้ดึงค่าใหม่)', en: '(waiting for the box)' }) }}
            </dd>
            <dt>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</dt>
            <dd>{{ windows(b) }}</dd>
          </dl>
        </section>

        <h2 class="section-title">{{ i18n.t({ th: 'ทดสอบปลุกตู้', en: 'Wake test' }) }}</h2>
        <app-box-test [boxId]="b.id" (finished)="reload()" />

        <h2 class="section-title">{{ i18n.t({ th: 'สถานะบอร์ดและกล้อง', en: 'Board and camera status' }) }}</h2>
        <section class="card">
          @if (b.camera_diagnostics; as camera) {
            @switch (camera.state) {
              @case ('started') {
                <p class="status warn">{{ i18n.t({ th: 'เริ่มทดสอบกล้องแล้ว', en: 'Camera test started' }) }}</p>
              }
              @case ('ready') {
                <p class="status ok">{{ i18n.t({ th: 'กล้องเริ่มทำงานแล้ว รอผลอ่าน QR', en: 'Camera initialized; waiting for QR scan' }) }}</p>
              }
              @case ('scan_result') {
                @if (camera.read_ok) {
                  <p class="status ok">{{ i18n.t({ th: 'กล้องอ่าน QR ได้', en: 'Camera read a QR code' }) }}</p>
                } @else if ((camera.frames ?? 0) > 0) {
                  <p class="status warn">{{ i18n.t({ th: 'กล้องรับภาพได้ แต่ยังไม่พบ QR', en: 'Camera captured frames but found no QR code' }) }}</p>
                } @else {
                  <p class="status danger">{{ i18n.t({ th: 'ยังไม่ได้ภาพจากกล้อง', en: 'No camera frames were captured' }) }}</p>
                }
              }
              @case ('error') {
                <p class="status danger">{{ i18n.t({ th: 'เปิดกล้องไม่สำเร็จ', en: 'Camera initialization failed' }) }}</p>
              }
            }
            <dl class="kv small">
              <dt>{{ i18n.t({ th: 'รายงานล่าสุด', en: 'Latest report' }) }}</dt><dd>{{ i18n.t(seen(camera.at)) }}</dd>
              @if (camera.job_id) {
                <dt>{{ i18n.t({ th: 'งานทดสอบ', en: 'Test job' }) }}</dt><dd>{{ camera.job_id }}</dd>
              }
              @if (camera.width !== null && camera.height !== null) {
                <dt>{{ i18n.t({ th: 'ความละเอียด', en: 'Resolution' }) }}</dt><dd>{{ camera.width }} × {{ camera.height }}</dd>
              }
              @if (camera.frames !== null) {
                <dt>{{ i18n.t({ th: 'จำนวนภาพที่อ่าน', en: 'Frames captured' }) }}</dt><dd>{{ camera.frames }}</dd>
              }
              @if (camera.qr_shapes !== null) {
                <dt>{{ i18n.t({ th: 'ภาพที่พบรูปทรง QR', en: 'Frames with a QR shape' }) }}</dt><dd>{{ camera.qr_shapes }}</dd>
              }
              @if (camera.read_ms !== null) {
                <dt>{{ i18n.t({ th: 'เวลาอ่าน', en: 'Scan time' }) }}</dt><dd>{{ camera.read_ms }} {{ i18n.t({ th: 'มิลลิวินาที', en: 'ms' }) }}</dd>
              }
            </dl>
          } @else {
            <p class="muted small">{{ i18n.t({ th: 'ยังไม่มีรายงานทดสอบกล้อง · กด “ทดสอบปลุกตู้” ด้านบน', en: 'No camera test report yet · run the wake test above' }) }}</p>
          }
        </section>

        <h2 class="section-title">{{ i18n.t({ th: 'QR ของตู้ (พิมพ์ได้)', en: 'Box QR codes (printable)' }) }}</h2>
        <div class="qr-grid">
          @for (q of activeQr(); track q.id) {
            <figure class="card">
              <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
              <figcaption class="small">
                <strong>{{ i18n.t(slot(q.slot)) }}</strong> v{{ q.version }}<br />
                {{ q.print_code }}
                @if (q.slot === 'activate') {
                  <br /><span class="chip" [class.ok]="q.status === 'active'">{{ q.status === 'active' ? i18n.t({ th: 'ยังไม่ใช้', en: 'unused' }) : i18n.t({ th: 'ใช้แล้ว', en: 'used' }) }}</span>
                }
              </figcaption>
            </figure>
          }
        </div>
        <button type="button" class="btn secondary" (click)="print()">{{ i18n.t({ th: 'พิมพ์หน้านี้', en: 'Print this page' }) }}</button>

        <h2 class="section-title">{{ i18n.t({ th: 'เขียนลงบอร์ด', en: 'Board provisioning' }) }}</h2>
        <section class="card stack">
          <dl class="kv small">
            <dt>box_id</dt><dd><code>{{ b.id }}</code></dd>
            <dt>{{ i18n.t({ th: 'URL เซิร์ฟเวอร์', en: 'Server URL' }) }}</dt><dd><code>{{ apiUrl }}</code></dd>
            @if (secret(); as s) {
              <dt>device_secret</dt><dd><code class="secret">{{ s }}</code></dd>
            }
          </dl>
          @if (!secret()) {
            <button type="button" class="btn secondary" (click)="reveal()">{{ i18n.t({ th: 'ดูรหัสลับประจำตู้ (บันทึกการเปิดดู)', en: 'Show device secret (access is logged)' }) }}</button>
          } @else {
            <button type="button" class="btn secondary" (click)="copy(secret()!)">{{ i18n.t({ th: 'คัดลอกรหัสลับ', en: 'Copy secret' }) }}</button>
          }
          <p class="muted small">{{ i18n.t({ th: 'ตู้ต้องเซ็นทุกคำขอด้วยรหัสนี้ (โปรโตคอล §1.1) · ห้ามส่งในแชต', en: 'The box signs every request with it (protocol §1.1) · never paste it in chat' }) }}</p>
        </section>

        <h2 class="section-title">{{ i18n.t({ th: 'รายงานจากตู้ล่าสุด', en: 'Latest box reports' }) }}</h2>
        <div class="list">
          @for (r of b.reports.slice(0, 8); track $index) {
            <div class="row">
              <span class="grow">
                <strong>{{ r.kind }}{{ r.body['type'] ? ' · ' + r.body['type'] : '' }}</strong>
                <span class="muted small block">{{ reportLine(r.body) }}</span>
              </span>
              <span class="muted small">{{ i18n.t(seen(r.at)) }}</span>
            </div>
          } @empty {
            <p class="row muted">{{ i18n.t({ th: 'ตู้ยังไม่เคยส่งรายงาน (ยังไม่เปิดเครื่อง / ยังไม่ต่อ Wi-Fi)', en: 'No reports yet (not powered on / no Wi-Fi yet)' }) }}</p>
          }
        </div>
        @if (b.auth_failures.length) {
          <h2 class="section-title">{{ i18n.t({ th: 'คำขอที่ลายเซ็นไม่ผ่าน', en: 'Rejected box requests' }) }}</h2>
          <div class="list">
            @for (a of b.auth_failures; track $index) {
              <div class="row"><span class="grow"><strong>{{ a.reason }}</strong></span><span class="muted small">{{ i18n.t(seen(a.at)) }}</span></div>
            }
          </div>
        }
        <a class="btn secondary" [routerLink]="url('T01')" [queryParams]="{ id: b.id }">{{ i18n.t({ th: 'เปิดเช็กลิสต์ติดตั้ง (ช่าง)', en: 'Open install checklist' }) }}</a>
      </div>
    } @else {
      <p class="muted">{{ notFound() ? i18n.t({ th: 'ไม่พบตู้นี้', en: 'Mailbox not found' }) : i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
    }
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .qr-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      figure {
        margin: 0;
        padding: 8px;
        text-align: center;
      }
      app-qr-image {
        background: #fff;
      }
    }
    .secret {
      word-break: break-all;
    }
    code {
      font-size: 0.8125rem;
      word-break: break-all;
    }
    @media print {
      .qr-grid {
        grid-template-columns: repeat(3, 5cm);
      }
    }
  `,
})
export class AdminBox implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly boxBadge = boxBadge;
  protected readonly seen = seenText;
  protected readonly slot = (s: string | number) => SLOT_LABEL[String(s)];
  readonly id = input<string>();
  protected readonly box = signal<AdminBoxDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly secret = signal<string | null>(null);
  protected readonly activeQr = computed(() => (this.box()?.qr ?? []).filter((q) => q.status === 'active' || q.slot === 'activate'));
  /** URL ที่ตู้ใช้ = origin + apiBase ของเว็บนี้ (ไม่ฮาร์ดโค้ดโดเมน) */
  protected readonly apiUrl = location.origin + inject(ApiConfig).apiBase();

  constructor() {
    const t = setInterval(() => void this.reload(), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      this.box.set(await this.api.box(id));
    } catch {
      if (!this.box()) this.notFound.set(true);
    }
  }

  protected windows(b: AdminBoxDetail): string {
    const w = b.config.config.windows ?? [];
    return w.length ? w.map((x) => x.join('–')).join(' · ') : this.i18n.t({ th: 'ยังไม่อยู่ในโซนไหน', en: 'not in any zone' });
  }

  protected reportLine(body: Record<string, unknown>): string {
    const parts: string[] = [];
    if (body['battery_pct'] !== undefined) parts.push(`${body['battery_pct']}%`);
    if (body['rssi'] !== undefined) parts.push(`rssi ${body['rssi']}`);
    if (body['fw']) parts.push(`fw ${body['fw']}`);
    if (body['reset_reason']) parts.push(String(body['reset_reason']));
    return parts.join(' · ');
  }

  protected async reveal(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      this.secret.set((await this.api.revealSecret(id)).device_secret);
    } catch {
      this.toast.show({ th: 'เปิดดูไม่ได้', en: 'Couldn’t load it' });
    }
  }

  protected copy(text: string): void {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    this.toast.show({ th: 'คัดลอกแล้ว', en: 'Copied' });
  }

  protected print(): void {
    window.print();
  }
}
