import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { DisplaySettings } from '../../core/display-settings';
import { HouseNav } from '../../core/house-nav';
import { I18n, type Tr } from '../../core/i18n';
import { hhmm, InspectionApi, type MyLog, type OfficerSummary } from '../../core/inspection-api';
import { Session } from '../../core/session';
import { fmtWhen } from '../../core/time';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { PushStatus } from '../../shared/push-status';
import { EmptyState, LoadingRows } from '../../shared/state-view';
import { liveRefresh } from '../../core/live-refresh';

/** SOS ต้องขึ้นเร็ว — ดึงหน้าสรุปใหม่ทุก 5 วิ (และทันทีเมื่อมีแจ้งเตือนเข้า/กลับมาที่แอป) */
const REFRESH_MS = 5_000;

/** นาทีของวันเวลาไทย (0–1439) — ใช้วาดแถบเวลาตรวจในโหมดละเอียด */
const bkkMinutes = (): number => {
  const [h, m] = new Date()
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
    .split(':')
    .map(Number);
  return h * 60 + m;
};

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** O01 หน้าสรุปเจ้าหน้าที่ (api.md §6.1) · O01-d นอกเวลาตรวจ · O01-e ตรวจครบแล้ว — ข้อมูลจริง */
@Component({
  selector: 'app-officer-home',
  imports: [RouterLink, PageHeader, Icon, LoadingRows, EmptyState, PushStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="caption()" [title]="i18n.t({ th: 'หน้าสรุป', en: 'Summary' })" [bell]="url('O14')" />


    <div class="stack">
      <app-push-status [compact]="true" [required]="true" deviceLabel="officer" />
      @if (error()) {
        <p class="card err" role="alert">
          {{ i18n.t({ th: 'โหลดข้อมูลไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t load — try again' }) }}
          <button type="button" class="btn secondary" (click)="load()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button>
        </p>
      }
      @if (s(); as s) {
        @for (c of s.open_sos; track c.id) {
          @if (c.mine) {
            <!-- O01-c -->
            <a class="handling-bar" [routerLink]="url('O10')" [queryParams]="{ id: c.id }">
              <span class="dot white"></span>
              <span class="grow">
                <strong>{{ i18n.t({ th: 'คุณกำลังดูแล SOS', en: 'You are handling an SOS' }) }}</strong>
                <span class="small block">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ c.house_no }}</span>
              </span>
              <span class="open">{{ i18n.t({ th: 'เปิด', en: 'Open' }) }}</span>
            </a>
          } @else {
            <!-- O01-b -->
            <section class="sos-card" role="alert">
              <p class="sos-title"><app-icon name="alert" [size]="20" />{{ i18n.t({ th: 'SOS ขอความช่วยเหลือ', en: 'SOS — help needed' }) }}</p>
              <h2>{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ c.house_no }}</h2>
              <p class="small">{{ time(c.created_at) }} · {{ i18n.t({ th: 'ยังไม่มีคนรับ', en: 'not accepted yet' }) }}</p>
              <a class="btn on-color" [routerLink]="url('O09')" [queryParams]="{ id: c.id }">{{ i18n.t({ th: 'ดูและรับเรื่อง', en: 'View and accept' }) }}</a>
            </section>
          }
        }
        @if (!s.window) {
          <!-- ยังไม่ถูกใส่เข้าโซน — ต้องบอกให้ชัด ไม่ใช่ "นอกเวลาตรวจ" (looks like the box is asleep) -->
          <section class="card center stack">
            <span class="zz" aria-hidden="true">Zz</span>
            <h2>{{ i18n.t({ th: 'ยังไม่ได้อยู่ในโซน', en: 'You’re not in a zone yet' }) }}</h2>
            <p class="muted small">{{ i18n.t({ th: 'หัวหน้าต้องใส่คุณเข้าโซนก่อน จึงจะเริ่มตรวจตู้ได้', en: 'Your head must add you to a zone before you can inspect mailboxes' }) }}</p>
            <p class="sos-note"><app-icon name="bell" [size]="18" />{{ i18n.t({ th: 'SOS ยังรับได้ตลอด 24 ชม.', en: 'SOS still comes in 24/7' }) }}</p>
          </section>
        } @else if (!s.in_window) {
          <!-- O01-d -->
          <section class="card center stack">
            <span class="zz" aria-hidden="true">Zz</span>
            <h2>{{ i18n.t({ th: 'ตอนนี้นอกเวลาตรวจ', en: 'Outside patrol hours' }) }}</h2>
            <p class="muted small">{{ i18n.t({ th: 'ตู้พักอยู่ สแกนตรวจไม่ได้', en: 'Mailboxes are asleep and can’t be inspected' }) }}</p>
            @if (s.window; as w) {
              <div class="next-round">
                <p class="muted small">{{ i18n.t({ th: 'รอบถัดไป', en: 'Next round' }) }} · {{ w.zone_name }}</p>
                <p class="round">{{ w.start }}–{{ w.end }}</p>
              </div>
            } @else {
              <p class="muted small">{{ i18n.t({ th: 'วันนี้ไม่มีรอบตรวจแล้ว', en: 'No more rounds today' }) }}</p>
            }
          </section>
          <button type="button" class="btn big" disabled>{{ i18n.t({ th: 'สแกนได้เมื่อถึงเวลาตรวจ', en: 'Scanning opens at patrol time' }) }}</button>
          <p class="sos-note"><app-icon name="bell" [size]="18" />{{ i18n.t({ th: 'SOS ยังรับได้ตลอด 24 ชม.', en: 'SOS still comes in 24/7' }) }}</p>
        } @else if (s.houses_total > 0 && s.houses_checked === s.houses_total) {
          <!-- O01-e -->
          <section class="done-card">
            <span class="done-ic"><app-icon name="check" [size]="26" /></span>
            <div>
              <h2>{{ i18n.t({ th: 'ตรวจครบทุกหลังแล้ว', en: 'Every house checked' }) }}</h2>
              <p class="small">{{ s.houses_total }} / {{ s.houses_total }} {{ i18n.t({ th: 'หลัง · รอบ', en: 'houses · round' }) }} {{ windowText() }}</p>
            </div>
          </section>
          <a class="btn secondary" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนตรวจซ้ำ', en: 'Scan again' }) }}</a>
        } @else {
          <!-- O01 -->
          <section class="card stack">
            @if (s.next_house; as next) {
              <div class="next">
                <app-icon name="pin" [size]="20" />
                <span class="grow"><span class="muted small block">{{ i18n.t({ th: 'หลังถัดไป บ้านเลขที่', en: 'Next house' }) }}</span><strong class="next-no">{{ next.house_no }}</strong></span>
                <!-- นำทาง: มีเฉพาะบ้านที่เจ้าของปักหมุดไว้ · พิกัดขอจาก server ตอนกด (เฉพาะในเวลาตรวจ) -->
                @if (hasPin(next.box_id)) {
                  <button type="button" class="nav-btn" [disabled]="nav.busy() === next.box_id" (click)="nav.open(next.box_id)">
                    {{ i18n.t({ th: 'นำทาง', en: 'Directions' }) }}
                  </button>
                }
              </div>
            }
            <span class="chip ok window">{{ i18n.t({ th: 'อยู่ในเวลาตรวจ', en: 'Patrol hours' }) }} {{ windowText() }}</span>
            <p class="count">
              <strong>{{ s.houses_checked }}</strong>
              <span class="muted">/ {{ s.houses_total }} {{ i18n.t({ th: 'หลัง ตรวจแล้ว', en: 'houses checked' }) }} · {{ percent() }}%</span>
            </p>
            <span class="bar" role="progressbar" aria-valuemin="0" [attr.aria-label]="i18n.t({ th: 'บ้านที่ตรวจแล้ว', en: 'Houses checked' })" [attr.aria-valuenow]="s.houses_checked" [attr.aria-valuemax]="s.houses_total">
              <span [style.width.%]="percent()"></span>
            </span>
          </section>
          <a class="btn big" [routerLink]="url('O02')">
            <app-icon name="scan" [size]="26" />
            {{ i18n.t({ th: 'สแกน QR หน้าตู้', en: 'Scan mailbox QR' }) }}
          </a>
        }

        <h2 class="section-title easy-hide">
          {{ pending() ? i18n.t({ th: 'ตู้ที่ยังไม่ได้ตรวจ', en: 'Boxes not checked yet' }) : i18n.t({ th: 'บ้านในโซนของฉัน', en: 'Houses in my zone' }) }}
          <span class="muted small"> · {{ pending() ? pending() : s.houses_total }}</span>
        </h2>
        @if (!s.houses.length) {
          <app-empty-state class="easy-hide" [title]="i18n.t({ th: 'ยังไม่มีบ้านในโซนของคุณ', en: 'No houses in your zone yet' })" [hint]="i18n.t({ th: 'หัวหน้าเป็นคนใส่บ้านและเจ้าหน้าที่เข้าโซน — ติดต่อหัวหน้าของคุณ', en: 'Your head assigns houses and officers — contact your head' })" />
        } @else {
          <ul class="list easy-hide">
            @for (h of orderedHouses(); track h.box_id) {
              <li>
                <a class="row" [routerLink]="['/officer/box', h.box_id]">
                <span class="hn" [attr.title]="h.house_no">{{ houseHead(h.house_no) }}</span>
                <span class="grow">
                  <strong class="block name">{{ h.box_name }}</strong>
                  <span class="muted small block">
                    @if (houseRest(h.house_no); as area) {
                      {{ area }}
                    } @else {
                      {{ i18n.t({ th: 'ในโซนของคุณ', en: 'In your zone' }) }}
                    }
                  </span>
                </span>
                @if (h.checked_at) {
                  <span class="stamp"><span>{{ i18n.t({ th: 'ตรวจแล้ว', en: 'Checked' }) }}</span><span class="stamp-t">{{ time(h.checked_at) }}</span></span>
                } @else if (notReady(h.status); as why) {
                  <!-- ตู้ตรวจไม่ได้ตอนนี้ — บอกก่อนเดินไป (สถานะจาก server) -->
                  <span class="chip danger">{{ i18n.t(why) }}</span>
                } @else {
                  <span class="chip warn">{{ i18n.t({ th: 'ยังไม่ตรวจ', en: 'Not yet' }) }}</span>
                }
                </a>
              </li>
            }
          </ul>
        }
      } @else if (!error()) {
        <app-loading-rows [rows]="4" [label]="i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' })" />
      }
    </div>
  `,
  styleUrl: './officer-home.scss',
})
export class OfficerHome {
  protected readonly i18n = inject(I18n);
  protected readonly session = inject(Session);
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(InspectionApi);
  protected readonly nav = inject(HouseNav);
  protected readonly url = screenUrl;
  protected readonly time = hhmm;
  protected readonly s = signal<OfficerSummary | null>(null);
  protected readonly logs = signal<MyLog[]>([]);
  protected readonly error = signal(false);
  private readonly nowMin = signal(bkkMinutes());
  private logsAt = 0;
  protected readonly caption = computed(() => this.session.me()?.agency?.name ?? '');
  protected readonly windowText = computed(() => {
    const w = this.s()?.window;
    return w ? `${w.start}–${w.end}` : '';
  });
  protected readonly zoneLabel = computed(() => this.s()?.window?.zone_name ?? '—');
  protected readonly pushOn = computed(() => this.session.me()?.push.subscribed === true);
  protected readonly percent = computed(() => {
    const s = this.s();
    return s && s.houses_total ? Math.round((s.houses_checked / s.houses_total) * 100) : 0;
  });
  protected readonly pending = computed(() => {
    const s = this.s();
    return s ? Math.max(0, s.houses_total - s.houses_checked) : 0;
  });
  /** ยังไม่ตรวจขึ้นก่อน แล้วค่อยของที่ตรวจแล้ว (ใหม่ → เก่า) — ตามแคนวาส "เรียงตามที่ควรไปก่อน" */
  protected readonly orderedHouses = computed(() => {
    const list = this.s()?.houses ?? [];
    return [...list].sort((a, b) => {
      if (!a.checked_at && b.checked_at) return -1;
      if (a.checked_at && !b.checked_at) return 1;
      // ยังไม่ตรวจทั้งคู่: ตู้ที่ตรวจได้ขึ้นก่อน ตู้ออฟไลน์/ปิดบริการไปท้ายกลุ่ม
      if (!a.checked_at && !b.checked_at) return Number(!!this.notReady(a.status)) - Number(!!this.notReady(b.status));
      return (b.checked_at ?? '').localeCompare(a.checked_at ?? '');
    });
  });
  /** ช่วงเวลาตรวจบนแถบ 24 ชม. (รอบข้ามเที่ยงคืน = สองช่วง) */
  protected readonly windowSegments = computed(() => {
    const w = this.s()?.window;
    if (!w) return [];
    const start = toMinutes(w.start);
    const end = toMinutes(w.end);
    if (start === null || end === null) return [];
    const pct = (n: number) => (n / 1440) * 100;
    return end >= start
      ? [{ left: pct(start), width: pct(end - start) }]
      : [
          { left: pct(start), width: pct(1440 - start) },
          { left: 0, width: pct(end) },
        ];
  });
  protected readonly nowPct = computed(() => (this.nowMin() / 1440) * 100);

  constructor() {
    void this.load();
    liveRefresh(() => this.load(), REFRESH_MS);
  }

  async load(): Promise<void> {
    try {
      this.s.set(await this.api.summary());
      this.nowMin.set(bkkMinutes());
      this.error.set(false);
    } catch (err) {
      if (apiError(err).status !== 401) this.error.set(true);
    }
  }

  /** บ้านนี้เจ้าของปักหมุดไว้ไหม (มี = แสดงปุ่ม "นำทาง") */
  protected hasPin(boxId: string): boolean {
    return this.s()?.houses.find((h) => h.box_id === boxId)?.has_pin === true;
  }

  /** ป้ายของตู้ที่ตรวจไม่ได้ตอนนี้ (null = ตรวจได้ · backend รุ่นเก่าที่ยังไม่ส่ง status ก็ถือว่าตรวจได้) */
  protected notReady(status: OfficerSummary['houses'][number]['status'] | undefined): Tr | null {
    if (status === 'offline') return { th: 'ตู้ไม่ออนไลน์', en: 'Offline' };
    if (status === 'service_closed' || status === 'unbound') return { th: 'ปิดบริการ', en: 'Closed' };
    return null;
  }

  /** แยกเลขที่บ้านออกจากชื่อหมู่บ้าน/รายละเอียด (ข้อมูลจริงอาจมาเป็น "110/55 หมู่บ้าน…") */
  protected houseHead(houseNo: string | null | undefined): string {
    const text = (houseNo ?? '').trim();
    if (!text) return '—';
    return text.split(/\s+/)[0];
  }

  protected houseRest(houseNo: string | null | undefined): string {
    const text = (houseNo ?? '').trim();
    const at = text.search(/\s/);
    return at < 0 ? '' : text.slice(at).trim();
  }

  /** เวลาเต็ม (วันที่ + เวลา) สำหรับโหมดละเอียด */
  protected fullStamp(iso: string | null): string {
    return iso ? fmtWhen(iso, this.i18n.lang()) : '';
  }
}
