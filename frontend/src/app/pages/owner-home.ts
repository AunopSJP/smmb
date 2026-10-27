import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DisplaySettings } from '../core/display-settings';
import { I18n } from '../core/i18n';
import { MOCK_OWNER } from '../core/mock/mock-data';
import { HOME_STATES, OwnerHomeState, type HomeState } from '../core/mock/owner-home-state';
import { SosDemo } from '../core/mock/sos-demo';
import { screenUrl } from '../screens/registry';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';
import { OwnerHomeAlerts } from './owner/owner-home-alerts';

/** ต้องกดค้างกี่วินาทีถึงส่ง SOS (กันกดโดนโดยไม่ตั้งใจ) */
const HOLD_SEC = 3;

/**
 * H03 หน้าหลักเจ้าของบ้าน · H03-L แบบเรียบง่าย (ตั้งที่ H13-d) · H03-e กดค้าง SOS
 */
@Component({
  selector: 'app-owner-home',
  imports: [RouterLink, PageHeader, Icon, OwnerHomeAlerts],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + data.house_no"
      [title]="data.box.name"
      [bell]="display.simpleHome() ? undefined : url('H14')"
    />

    <div class="stack page">
      <div class="demo-tools" role="group" [attr.aria-label]="i18n.t({ th: 'จำลองสถานะหน้าหลัก', en: 'Demo home state' })">
        {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
        @for (o of states; track o.v) {
          <button type="button" [attr.aria-pressed]="home.state() === o.v" (click)="home.set(o.v)">
            {{ lang() === 'th' ? o.th : o.en }}
          </button>
        }
      </div>

      @if (display.simpleHome()) {
        <!-- H03-L: เหลือแค่สถานะตู้ เหตุการณ์ล่าสุด และปุ่ม SOS -->
        <section class="card simple">
          @if (home.offline()) {
            <p class="status big off"><app-icon name="alert" [size]="26" />{{ i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' }) }}</p>
            <a class="btn dark" [routerLink]="url('H13-c')">{{ i18n.t({ th: 'แจ้งช่าง', en: 'Get a technician' }) }}</a>
          } @else {
            <p class="status big"><span class="dot"></span>{{ i18n.t({ th: 'ตู้ปกติดี', en: 'Mailbox is fine' }) }}</p>
            <p class="muted">
              {{ i18n.t({ th: 'แบต', en: 'Battery' }) }} {{ data.box.battery_pct }}% ·
              {{ i18n.t({ th: 'ติดต่อ', en: 'contact' }) }} {{ data.box.last_seen_min }} {{ i18n.t({ th: 'นาทีที่แล้ว', en: 'min ago' }) }}
            </p>
          }
        </section>
        @if (!home.noEvents()) {
          <a class="card simple last" [routerLink]="url('H12-b')">
            <p class="muted">{{ i18n.t({ th: 'ล่าสุด', en: 'Latest' }) }}</p>
            <p class="big-text">{{ i18n.t({ th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' }) }}</p>
            <p class="muted">{{ i18n.t({ th: 'วันนี้', en: 'Today' }) }} {{ data.events[0].time }} · {{ data.events[0].agency }}</p>
          </a>
        }
      } @else if (home.state() !== 'normal') {
        <app-owner-home-alerts />

        @if (home.offline()) {
          <a class="card mini-row" [routerLink]="url('H12-b')">
            <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t({ th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' }) }}</strong>
              <span class="muted small block">{{ i18n.t({ th: 'ล่าสุด เมื่อวาน 20:10', en: 'Last: yesterday 20:10' }) }}</span>
            </span>
          </a>
        } @else if (home.state() === 'todo') {
          <p class="card mini-row">
            <span class="dot"></span>
            <strong class="grow ok-text">{{ i18n.t({ th: 'ตู้ออนไลน์', en: 'Mailbox online' }) }}</strong>
            <span class="muted small">{{ data.box.last_seen_min }} {{ i18n.t({ th: 'นาทีที่แล้ว', en: 'min ago' }) }}</span>
          </p>
        } @else {
          <!-- H03-b ผู้ใช้ใหม่ -->
          <section class="card">
            <p class="status"><span class="dot"></span>{{ i18n.t({ th: 'ตู้ออนไลน์ ปกติดี', en: 'Online · all good' }) }}</p>
            <p class="muted small">{{ i18n.t({ th: 'แบต 100% · ติดต่อล่าสุด 1 นาทีที่แล้ว', en: 'Battery 100% · last contact 1 min ago' }) }}</p>
          </section>
          <section class="empty">
            <strong>{{ i18n.t({ th: 'ยังไม่มีเหตุการณ์', en: 'No activity yet' }) }}</strong>
            <span class="muted small">{{ i18n.t({ th: 'การตรวจและการส่งของจะขึ้นที่นี่', en: 'Inspections and deliveries will show here' }) }}</span>
          </section>
        }
      } @else {
        <section class="card stack">
          <p class="status"><span class="dot"></span>{{ i18n.t({ th: 'ตู้ออนไลน์ ปกติดี', en: 'Online · all good' }) }}</p>
          <div class="stats">
            <div class="mini">
              <span class="label">{{ i18n.t({ th: 'แบตเตอรี่', en: 'Battery' }) }}</span>
              <strong class="value">{{ data.box.battery_pct }}%</strong>
              <span class="bar"><span [style.width.%]="data.box.battery_pct"></span></span>
            </div>
            <div class="mini">
              <span class="label">{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last contact' }) }}</span>
              <strong class="value">{{ data.box.last_seen_min }} {{ i18n.t({ th: 'นาที', en: 'min' }) }}</strong>
              <span class="label">{{ i18n.t({ th: 'ที่แล้ว', en: 'ago' }) }}</span>
            </div>
          </div>
        </section>

        <div class="title-row">
          <h2 class="section-title">{{ i18n.t({ th: 'เหตุการณ์ล่าสุด', en: 'Recent activity' }) }}</h2>
          <a class="see-all" [routerLink]="url('H12')">{{ i18n.t({ th: 'ดูทั้งหมด', en: 'See all' }) }}</a>
        </div>
        <nav class="list">
          @for (e of data.events; track e.id) {
            <a class="row" [routerLink]="url(e.kind === 'inspected' ? 'H12-b' : 'H12-c')">
              @if (e.kind === 'inspected') {
                <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
                <span class="grow">
                  <strong>{{ i18n.t({ th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' }) }}</strong>
                  <span class="muted small block">{{ e.agency }} · {{ e.officer }}</span>
                </span>
              } @else {
                <span class="icon-bubble warn"><app-icon name="box" [size]="20" /></span>
                <span class="grow">
                  <strong>{{ i18n.t({ th: 'มีของมาส่ง', en: 'Parcel delivered' }) }}</strong>
                  <span class="muted small block">{{ i18n.t({ th: 'ใส่ไว้ในตู้แล้ว', en: 'Placed in the box' }) }}</span>
                </span>
              }
              <span class="muted small">{{ e.time }}</span>
            </a>
          }
        </nav>
      }
    </div>

    <div class="sos-bar">
      <button
        type="button"
        class="btn big sos"
        [class.simple-sos]="display.simpleHome()"
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
          {{ i18n.t({ th: 'SOS ขอความช่วยเหลือ', en: 'SOS — Get help' }) }}
          <small>
            @if (home.offline()) {
              {{ i18n.t({ th: 'ยังใช้ได้ แม้ตู้ไม่ออนไลน์', en: 'Still works while the mailbox is offline' }) }}
            } @else {
              {{ i18n.t({ th: 'กดค้างไว้ 3 วินาที', en: 'Press and hold 3 seconds' }) }}
            }
          </small>
        </span>
      </button>
    </div>

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
  `,
  styleUrl: './owner-home.scss',
})
export class OwnerHome implements OnDestroy {
  protected readonly i18n = inject(I18n);
  protected readonly lang = this.i18n.lang;
  protected readonly display = inject(DisplaySettings);
  protected readonly home = inject(OwnerHomeState);
  protected readonly states = HOME_STATES;

  /** `/home?state=new|offline|todo` เปิดสถานะนั้นตรง ๆ (ใช้ส่งลิงก์ให้ลูกค้าดู) */
  readonly state = input<string>();
  private readonly applyState = effect(() => {
    const s = this.state();
    if (s && HOME_STATES.some((o) => o.v === s)) untracked(() => this.home.set(s as HomeState));
  });
  private readonly sos = inject(SosDemo);
  private readonly router = inject(Router);
  protected readonly data = MOCK_OWNER;
  protected readonly url = screenUrl;

  protected readonly holding = signal(false);
  private readonly heldMs = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly progress = computed(() => Math.min(1, this.heldMs() / (HOLD_SEC * 1000)));
  protected readonly remaining = computed(() => Math.max(1, HOLD_SEC - Math.floor(this.heldMs() / 1000)));

  protected startHold(event: Event): void {
    event.preventDefault();
    if (this.timer) return; // ปุ่มคีย์บอร์ดค้างส่ง keydown ซ้ำ
    const started = Date.now();
    this.heldMs.set(0);
    this.holding.set(true);
    this.timer = setInterval(() => {
      this.heldMs.set(Date.now() - started);
      if (this.heldMs() >= HOLD_SEC * 1000) {
        this.stopHold();
        this.sos.start();
        void this.router.navigateByUrl(screenUrl('H09'));
      }
    }, 50);
  }

  protected stopHold(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.holding.set(false);
  }

  ngOnDestroy(): void {
    this.stopHold();
  }
}
