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

/** ต้องกดค้างกี่วินาทีถึงส่ง SOS (กันกดโดนโดยไม่ตั้งใจ ✅) */
const HOLD_SEC = 3;
/** รีเฟรชหน้าหลักทุกกี่วินาที */
const REFRESH_MS = 20_000;

/** H03 หน้าหลักเจ้าของบ้าน (api.md §4.2) · H03-L แบบเรียบง่าย · H03-e กดค้าง SOS — ข้อมูลจริง */
@Component({
  selector: 'app-owner-home',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (noBox()) {
      <app-page-header [caption]="''" [title]="i18n.t({ th: 'ยังไม่มีตู้', en: 'No mailbox yet' })" />
      <div class="stack page">
        <section class="card stack">
          <p>{{ i18n.t({ th: 'ผูกตู้กับบัญชีก่อน — สแกน QR เปิดใช้ตู้ที่อยู่ด้านในตู้', en: 'Bind your mailbox first — scan the activation QR inside the box' }) }}</p>
          <a class="btn" [routerLink]="url('A07')">{{ i18n.t({ th: 'ผูกตู้', en: 'Add my mailbox' }) }}</a>
        </section>
      </div>
    } @else if (b(); as b) {
      <app-page-header
        [caption]="i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + b.house_no"
        [title]="b.name || b.id"
        [bell]="display.simpleHome() ? undefined : url('H14')"
      />

      <div class="stack page">
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
            <span class="small">{{ i18n.t({ th: 'นำ QR สำรองที่เก็บด้านในมาติดหน้าตู้ แล้วกดยืนยัน ระบบจะปิด QR ใบเก่าและออกใบสำรองใหม่ให้แอดมินจัดส่ง', en: 'Move the backup QR inside the box to the front, then confirm. The old QR will be disabled and a replacement backup issued.' }) }}</span>
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
                <strong class="value">{{ b.last_seen_at ? i18n.t({ th: 'เมื่อกี้', en: 'just now' }) : '—' }}</strong>
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
              <li class="row">
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
              </li>
            }
          </ul>
        }
        @if (error()) {
          <p class="muted small center">{{ i18n.t({ th: 'อัปเดตไม่ได้ · กำลังลองใหม่', en: 'Couldn’t refresh · retrying' }) }}</p>
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
        <p class="card err" role="alert">{{ i18n.t({ th: 'ส่ง SOS ไม่ได้ — โทร 191 / 1669 ทันที', en: 'Couldn’t send the SOS — call 191 / 1669 now' }) }}</p>
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
        <p class="card err" role="alert">{{ i18n.t({ th: 'โหลดข้อมูลไม่ได้', en: 'Couldn’t load' }) }}</p>
        <button type="button" class="btn secondary" (click)="load()">{{ i18n.t({ th: 'ลองใหม่', en: 'Retry' }) }}</button>
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
  protected readonly noBox = signal(false);
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
    const t = setInterval(() => void this.load(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  async load(): Promise<void> {
    try {
      let id = this.box() ?? this.b()?.id;
      if (!id) {
        const boxes = await this.api.boxes();
        if (!boxes.length) {
          this.noBox.set(true);
          return;
        }
        id = boxes[0].id;
      }
      this.b.set(await this.api.box(id));
      this.error.set(false);
    } catch {
      this.error.set(true);
    }
  }

  protected async confirmBackup(boxId: string): Promise<void> {
    if (this.confirmingQr()) return;
    this.confirmingQr.set(true);
    try {
      await this.api.confirmQrBackupPlaced(boxId);
      await this.load();
    } catch {
      this.toast.show({ th: 'บันทึกไม่ได้ · ลองโหลดหน้าใหม่', en: 'Could not save · reload and try again' });
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
