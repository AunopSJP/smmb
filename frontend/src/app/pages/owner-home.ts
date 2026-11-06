import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiError } from '../core/api';
import { DisplaySettings } from '../core/display-settings';
import { I18n } from '../core/i18n';
import { hhmm } from '../core/inspection-api';
import { type BoxDetail, minutesAgo, OwnerApi, type Sos } from '../core/owner-api';
import { screenUrl } from '../screens/registry';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';
import { Toast } from '../core/toast';
import { Session } from '../core/session';
import { liveRefresh } from '../core/live-refresh';

/** ต้องกดค้างกี่วินาทีถึงส่ง SOS (กันกดโดนโดยไม่ตั้งใจ ✅) */
const HOLD_SEC = 3;
/** รีเฟรชหน้าหลักทุกกี่วินาที */
const REFRESH_MS = 10_000;

/** H03 หน้าหลักเจ้าของบ้าน (api.md §4.2) · H03-L แบบเรียบง่าย · H03-e กดค้าง SOS — ข้อมูลจริง */
@Component({
  selector: 'app-owner-home',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (noBox()) {
      <app-page-header [caption]="greeting()" [title]="i18n.t({ th: 'เริ่มใช้งานตู้ของคุณ', en: 'Set up your mailbox' })" />
      <div class="stack page onboard">
        <section class="hero" aria-hidden="true">
          <svg viewBox="0 0 240 170" class="art">
            <ellipse cx="120" cy="158" rx="78" ry="8" class="shadow" />
            <rect x="96" y="96" width="14" height="60" rx="3" class="post" />
            <path d="M60 60a40 40 0 0 1 40-40h70a28 28 0 0 1 28 28v56H60z" class="body" />
            <path d="M60 60a40 40 0 0 1 80 0v44H60z" class="door" />
            <rect x="78" y="58" width="44" height="6" rx="3" class="slot" />
            <g class="qr" transform="translate(150 50)">
              <rect width="34" height="34" rx="5" class="qr-bg" />
              <path d="M6 6h9v9H6zM19 6h9v9h-9zM6 19h9v9H6zM20 20h3v3h-3zM25 20h3v3h-3zM20 25h3v3h-3zM25 25h3v3h-3z" class="qr-ink" />
            </g>
            <path d="M198 40v34" class="flag-pole" />
            <path d="M198 40h22l-6 8 6 8h-22z" class="flag" />
            <circle cx="40" cy="36" r="4" class="spark" />
            <circle cx="214" cy="112" r="3" class="spark" />
            <circle cx="30" cy="118" r="2.5" class="spark" />
          </svg>
        </section>

        <section class="intro">
          <h2>{{ i18n.t({ th: 'ยังไม่ได้ผูกตู้กับบัญชีนี้', en: 'No mailbox linked to this account' }) }}</h2>
          <p class="muted">{{ i18n.t({ th: 'ผูกตู้ครั้งเดียว แล้วจะรู้ทันทีเมื่อเจ้าหน้าที่มาตรวจ มีของมาส่ง และกด SOS ขอความช่วยเหลือได้', en: 'Link it once to know right away when an officer checks in or a parcel arrives — and to send SOS' }) }}</p>
        </section>

        <ol class="steps">
          <li>
            <span class="num">1</span>
            <span><strong>{{ i18n.t({ th: 'เปิดฝาตู้', en: 'Open the mailbox' }) }}</strong><small>{{ i18n.t({ th: 'QR เปิดใช้ตู้ติดอยู่ด้านใน', en: 'The activation QR is inside' }) }}</small></span>
          </li>
          <li>
            <span class="num">2</span>
            <span><strong>{{ i18n.t({ th: 'สแกน QR เปิดใช้ตู้', en: 'Scan the activation QR' }) }}</strong><small>{{ i18n.t({ th: 'หรือพิมพ์รหัส 8 ตัวใต้ QR', en: 'or type the 8-character code below it' }) }}</small></span>
          </li>
          <li>
            <span class="num">3</span>
            <span><strong>{{ i18n.t({ th: 'ตั้งชื่อตู้', en: 'Name your mailbox' }) }}</strong><small>{{ i18n.t({ th: 'เช่น ตู้หน้าบ้าน — พร้อมใช้งานทันที', en: 'e.g. Front gate — ready to use' }) }}</small></span>
          </li>
        </ol>

        <div class="stack push-end">
          <a class="btn big" [routerLink]="url('A07')">
            <app-icon name="scan" [size]="20" />
            {{ i18n.t({ th: 'ผูกตู้ตอนนี้', en: 'Link my mailbox' }) }}
          </a>
          <p class="muted small center">{{ i18n.t({ th: 'ไม่พบ QR ในตู้? ติดต่อผู้ติดตั้งหรือผู้ดูแลระบบ', en: 'No QR inside? Contact your installer or the admin' }) }}</p>
        </div>
      </div>
    } @else if (b(); as b) {
      <app-page-header
        [caption]="i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + b.house_no"
        [title]="b.name || b.id"
        [bell]="display.simpleHome() ? undefined : url('H14')"
      />

      <div class="stack page">
        @if (boxes().length > 1) {
          <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'เลือกตู้', en: 'Choose a mailbox' })">
            @for (x of boxes(); track x.id) {
              <button type="button" [attr.aria-pressed]="b.id === x.id" (click)="select(x.id)">{{ x.house_no }} · {{ x.name || x.id }}</button>
            }
          </div>
        }
        @if (b.open_sos; as s) {
          <a class="card sos-open" [routerLink]="url(s.status === 'accepted' ? 'H11' : 'H09')" [queryParams]="{ id: s.id }">
            <app-icon name="alert" [size]="22" />
            <strong class="grow">{{ s.status === 'accepted' ? i18n.t({ th: 'มีเจ้าหน้าที่รับ SOS แล้ว', en: 'An officer took your SOS' }) : i18n.t({ th: 'SOS ของคุณยังเปิดอยู่', en: 'Your SOS is still open' }) }}</strong>
            <span>{{ i18n.t({ th: 'เปิด', en: 'Open' }) }}</span>
          </a>
        }
        @if (b.qr_task) {
          <section class="card warn-card stack">
            <strong>{{ i18n.t({ th: 'QR หน้าตู้ชำรุด', en: 'Front QR is damaged' }) }}</strong>
            <span class="small">{{ i18n.t({ th: 'นำ QR สำรองที่เก็บด้านในมาติดหน้าตู้ แล้วกดยืนยัน ระบบจะปิด QR ใบเก่าและออกใบสำรองใหม่ให้ผู้ดูแลระบบจัดส่ง', en: 'Move the backup QR inside the box to the front, then confirm. The old QR will be disabled and a replacement backup issued.' }) }}</span>
            <button type="button" class="btn secondary" [disabled]="confirmingQr()" (click)="confirmBackup(b.id)">
              {{ confirmingQr() ? i18n.t({ th: 'กำลังบันทึก…', en: 'Saving…' }) : i18n.t({ th: 'ติด QR สำรองแล้ว', en: 'Backup QR is in place' }) }}
            </button>
          </section>
        }
        @if (!b.coverage.has_officer) {
          <p class="card warn-card">
            <strong>{{ i18n.t({ th: 'ยังไม่มีเจ้าหน้าที่ดูแลบ้านนี้', en: 'No officer covers this house yet' }) }}</strong><br />
            <span class="small">{{ i18n.t({ th: 'กด SOS ระบบจะบอกให้โทร 191 / 1669 ทันที', en: 'SOS will tell you to call 191 / 1669 straight away' }) }}</span>
          </p>
        }

        <section class="card stack" [class.simple]="display.simpleHome()">
          @if (b.status === 'offline') {
            <p class="status off"><app-icon name="alert" [size]="22" />{{ i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' }) }}</p>
          } @else if (b.status === 'service_closed') {
            <p class="status off"><app-icon name="alert" [size]="22" />{{ i18n.t({ th: 'ตู้ปิดบริการอยู่', en: 'Mailbox not in service' }) }}</p>
          } @else if (b.status === 'sleeping') {
            <p class="status"><span class="dot"></span>{{ i18n.t({ th: 'ตู้พักอยู่ (นอกเวลาตรวจ) ปกติดี', en: 'Asleep outside patrol hours · all good' }) }}</p>
          } @else {
            <p class="status"><span class="dot"></span>{{ i18n.t({ th: 'ตู้ออนไลน์ ปกติดี', en: 'Online · all good' }) }}</p>
          }
          <div class="stats">
            <div class="mini">
              <span class="label">{{ i18n.t({ th: 'แบตเตอรี่', en: 'Battery' }) }}</span>
              <strong class="value">{{ b.battery ? b.battery.pct + '%' : '—' }}</strong>
              @if (b.battery) {
                <span class="bar"><span [style.width.%]="b.battery.pct"></span></span>
              }
            </div>
            <div class="mini">
              <span class="label">{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last contact' }) }}</span>
              @if (ago(b.last_seen_at); as m) {
                <strong class="value">{{ m }} {{ i18n.t({ th: 'นาที', en: 'min' }) }}</strong>
                <span class="label">{{ i18n.t({ th: 'ที่แล้ว', en: 'ago' }) }}</span>
              } @else {
                <strong class="value">{{ b.last_seen_at ? i18n.t({ th: 'เมื่อสักครู่', en: 'just now' }) : '—' }}</strong>
              }
            </div>
          </div>
          @if (b.coverage.agency_names.length) {
            <p class="muted small">{{ i18n.t({ th: 'ดูแลโดย ', en: 'Covered by ' }) }}{{ b.coverage.agency_names.join(' · ') }}</p>
          }
        </section>

        <div class="title-row">
          <h2 class="section-title">{{ i18n.t({ th: 'เหตุการณ์ล่าสุด', en: 'Recent activity' }) }}</h2>
        </div>
        @if (!b.latest_events.length) {
          <section class="empty">
            <strong>{{ i18n.t({ th: 'ยังไม่มีเหตุการณ์', en: 'No activity yet' }) }}</strong>
            <span class="muted small">{{ i18n.t({ th: 'การตรวจและการส่งของจะขึ้นที่นี่', en: 'Inspections and deliveries will show here' }) }}</span>
          </section>
        } @else {
          <ul class="list">
            @for (e of b.latest_events; track e.id) {
              <li>
               <a class="row" [routerLink]="url(e.type === 'inspected' ? 'H12-b' : 'H12-c')" [queryParams]="{ id: e.id }">
                @if (e.type === 'inspected') {
                  <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
                  <span class="grow">
                    <strong>{{ i18n.t({ th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' }) }}</strong>
                    <span class="muted small block">{{ e.officer?.agency_name }} · {{ e.officer?.display_name }}</span>
                  </span>
                } @else {
                  <span class="icon-bubble warn"><app-icon name="box" [size]="20" /></span>
                  <span class="grow">
                    <strong>{{ i18n.t({ th: 'มีของมาส่ง', en: 'Parcel delivered' }) }}</strong>
                    <span class="muted small block">{{ e.method === 'code' ? i18n.t({ th: 'ไรเดอร์พิมพ์รหัส', en: 'Rider typed the code' }) : i18n.t({ th: 'ไรเดอร์สแกน QR', en: 'Rider scanned the QR' }) }}</span>
                  </span>
                }
                <span class="muted small">{{ day(e.at) }} {{ time(e.at) }}</span>
                <app-icon name="chevronRight" [size]="18" />
               </a>
              </li>
            }
          </ul>
        }
        @if (error()) {
          <p class="muted small center">{{ i18n.t({ th: 'อัปเดตไม่สำเร็จ · กำลังลองอีกครั้ง', en: 'Couldn’t refresh · retrying' }) }}</p>
        }
      </div>

      <div class="sos-bar">
        <button
          type="button"
          class="btn big sos"
          [class.simple-sos]="display.simpleHome()"
          [disabled]="sending()"
          (pointerdown)="startHold($event)"
          (pointerup)="stopHold()"
          (pointerleave)="stopHold()"
          (pointercancel)="stopHold()"
          (keydown.enter)="startHold($event)"
          (keydown.space)="startHold($event)"
          (keyup.enter)="stopHold()"
          (keyup.space)="stopHold()"
          (contextmenu)="$event.preventDefault()"
        >
          <span class="sos-text">
            {{ sending() ? i18n.t({ th: 'กำลังส่ง SOS…', en: 'Sending SOS…' }) : i18n.t({ th: 'SOS ขอความช่วยเหลือ', en: 'SOS — Get help' }) }}
            <small>
              @if (b.status === 'offline') {
                {{ i18n.t({ th: 'ยังใช้ได้ แม้ตู้ไม่ออนไลน์', en: 'Still works while the mailbox is offline' }) }}
              } @else {
                {{ i18n.t({ th: 'กดค้างไว้ 3 วินาที', en: 'Press and hold 3 seconds' }) }}
              }
            </small>
          </span>
        </button>
      </div>
      @if (sosError()) {
        <p class="card err" role="alert">{{ i18n.t({ th: 'ส่ง SOS ไม่สำเร็จ — โปรดโทร 191 / 1669 ทันที', en: 'Couldn’t send the SOS — call 191 / 1669 now' }) }}</p>
      }

      @if (holding()) {
        <!-- H03-e: นับถอยหลังระหว่างกดค้าง · ปล่อยก่อน = ยกเลิก -->
        <div class="hold" role="alert" aria-live="assertive">
          <p>{{ i18n.t({ th: 'กดค้างไว้ อย่าเพิ่งปล่อย', en: 'Keep holding' }) }}</p>
          <div class="ring" [style.--p]="progress()">
            <span>SOS</span>
            <strong>{{ remaining() }}</strong>
            <small>{{ i18n.t({ th: 'วินาที', en: 'sec' }) }}</small>
          </div>
          <p class="small">
            {{ i18n.t({ th: 'ครบ 3 วินาที ระบบจะส่ง SOS ทันที', en: 'At 3 seconds the SOS is sent' }) }}<br />
            {{ i18n.t({ th: 'ปล่อยนิ้วก่อน = ยกเลิก ไม่ส่ง', en: 'Let go before that = cancelled' }) }}
          </p>
        </div>
      }
    } @else if (error()) {
      <div class="stack page">
        <p class="card err" role="alert">{{ i18n.t({ th: 'โหลดข้อมูลไม่สำเร็จ', en: 'Couldn’t load' }) }}</p>
        <button type="button" class="btn secondary" (click)="load()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button>
      </div>
    } @else {
      <p class="muted center page">{{ i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
    }
  `,
  styleUrl: './owner-home.scss',
  styles: `
    .sos-open {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--sos);
      color: #fff;
      text-decoration: none;
    }
    .warn-card {
      background: var(--warn-bg);
      color: var(--warn);
      box-shadow: none;
    }
    .err {
      background: var(--danger-bg);
      color: var(--sos);
      box-shadow: none;
    }
    .center {
      text-align: center;
    }
    .block {
      display: block;
    }
  `,
})
export class OwnerHome implements OnDestroy {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(OwnerApi);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly time = hhmm;
  protected readonly ago = minutesAgo;
  /** ?box=BX-00042 เมื่อมีหลายตู้ (ไม่ใส่ = ตู้แรก) */
  readonly box = input<string>();
  protected readonly b = signal<BoxDetail | null>(null);
  protected readonly boxes = signal<{ id: string; name: string; house_no: string }[]>([]);
  protected readonly noBox = signal(false);
  private readonly me = inject(Session).me;
  protected readonly greeting = computed(() => {
    const n = this.me()?.display_name;
    return n ? this.i18n.t({ th: `สวัสดี คุณ${n}`, en: `Hello, ${n}` }) : '';
  });
  protected readonly error = signal(false);
  protected readonly sending = signal(false);
  protected readonly sosError = signal(false);
  protected readonly confirmingQr = signal(false);

  protected readonly holding = signal(false);
  private readonly heldMs = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  protected readonly progress = computed(() => Math.min(1, this.heldMs() / (HOLD_SEC * 1000)));
  protected readonly remaining = computed(() => Math.max(1, HOLD_SEC - Math.floor(this.heldMs() / 1000)));

  constructor() {
    void this.load();
    liveRefresh(() => this.load(), REFRESH_MS);
  }

  async load(): Promise<void> {
    try {
      let id = this.box() ?? this.b()?.id;
      if (!id || !this.boxes().length) {
        const boxes = await this.api.boxes();
        if (!boxes.length) {
          this.noBox.set(true);
          return;
        }
        this.boxes.set(boxes);
        id ??= boxes[0].id;
      }
      this.b.set(await this.api.box(id));
      this.error.set(false);
    } catch {
      this.error.set(true);
    }
  }

  /** สลับตู้ (เจ้าของมีหลายตู้) — จำใน ?box= ให้รีเฟรชแล้วยังอยู่ตู้เดิม */
  protected async select(id: string): Promise<void> {
    if (id === this.b()?.id) return;
    await this.router.navigate([], { queryParams: { box: id }, replaceUrl: true });
    await this.load();
  }

  protected async confirmBackup(boxId: string): Promise<void> {
    if (this.confirmingQr()) return;
    this.confirmingQr.set(true);
    try {
      await this.api.confirmQrBackupPlaced(boxId);
      await this.load();
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ · โหลดหน้าใหม่', en: 'Could not save · reload and try again' });
    } finally {
      this.confirmingQr.set(false);
    }
  }

  protected day(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const same = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) === today.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    return same ? this.i18n.t({ th: 'วันนี้', en: 'Today' }) : d.toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
  }

  protected startHold(event: Event): void {
    event.preventDefault();
    if (this.timer || this.sending()) return; // ปุ่มคีย์บอร์ดค้างส่ง keydown ซ้ำ
    // ล็อกการสัมผัสไว้กับปุ่ม: นิ้วเลื่อนเล็กน้อยก็ไม่ถูกนับว่าออกจากปุ่ม
    if (event instanceof PointerEvent) (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
    const started = Date.now();
    this.heldMs.set(0);
    this.holding.set(true);
    this.timer = setInterval(() => {
      this.heldMs.set(Date.now() - started);
      if (this.heldMs() >= HOLD_SEC * 1000) {
        this.stopHold();
        void this.sendSos();
      }
    }, 50);
  }

  protected stopHold(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.holding.set(false);
  }

  /** POST /sos → H09 รอเจ้าหน้าที่ · ไม่มีโซน → H08 โทรเอง · มีอยู่แล้ว → หน้าเดิม */
  private async sendSos(): Promise<void> {
    const b = this.b();
    if (!b) return;
    this.sending.set(true);
    this.sosError.set(false);
    try {
      const r = await this.api.startSos(b.id);
      if ('code' in r) void this.router.navigateByUrl(screenUrl('H08'));
      else void this.router.navigate([screenUrl('H09')], { queryParams: { id: r.id } });
    } catch (err) {
      const e = apiError(err);
      const existing = e.body['sos'] as Sos | undefined;
      if (e.code === 'SOS_ALREADY_OPEN' && existing) {
        void this.router.navigate([screenUrl(existing.status === 'accepted' ? 'H11' : 'H09')], { queryParams: { id: existing.id } });
      } else {
        this.sosError.set(true);
      }
    } finally {
      this.sending.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stopHold();
  }
}
