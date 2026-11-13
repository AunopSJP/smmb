import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { DisplaySettings } from '../../core/display-settings';
import { I18n } from '../../core/i18n';
import { hhmm, InspectionApi, type MyLog, type OfficerSummary } from '../../core/inspection-api';
import { Session } from '../../core/session';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { EmptyState, LoadingRows } from '../../shared/state-view';
import { liveRefresh } from '../../core/live-refresh';

/** รีเฟรชหน้าสรุปทุกกี่วินาที (เพื่อนในโซนตรวจบ้านไป / ถึงเวลาตรวจ) */
/** SOS ต้องขึ้นเร็ว — ดึงใหม่ทุก 5 วิ (และทันทีเมื่อมีแจ้งเตือนเข้า/กลับมาที่แอป) */
const REFRESH_MS = 5_000;
/** โหมดละเอียด: บันทึกสแกนล่าสุดของฉัน (GET /officer/logs) */
const LOG_REFRESH_MS = 20_000;

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
  imports: [RouterLink, PageHeader, Icon, LoadingRows, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="caption()" [title]="session.me()?.display_name ?? ''" [bell]="url('O14')" />

    <p class="adv-only adv-strip mono">
      <span>{{ i18n.t({ th: 'โซน ', en: 'Zone ' }) }}{{ zoneLabel() }}</span>
      <span>{{ pushOn() ? i18n.t({ th: 'แจ้งเตือนเปิด · เครื่องนี้', en: 'Notifications on · this device' }) : i18n.t({ th: 'แจ้งเตือนยังไม่เปิด', en: 'Notifications off' }) }}</span>
    </p>

    <div class="stack">
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
          <div class="adv-only card off-adv">
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'ตรวจวันนี้', en: 'Checked today' }) }}</dt>
              <dd>{{ s.houses_checked }} / {{ s.houses_total }}</dd>
              <dt>SOS</dt>
              <dd>{{ s.open_sos.length }}</dd>
              <dt>{{ i18n.t({ th: 'โซน', en: 'Zone' }) }}</dt>
              <dd>{{ zoneLabel() }}</dd>
            </dl>
          </div>
          <button type="button" class="btn big" disabled>{{ i18n.t({ th: 'สแกนได้เมื่อถึงเวลาตรวจ', en: 'Scanning opens at patrol time' }) }}</button>
          <p class="sos-note"><app-icon name="bell" [size]="18" />{{ i18n.t({ th: 'SOS ยังรับได้ตลอด 24 ชม.', en: 'SOS still comes in 24/7' }) }}</p>
        } @else if (s.houses_total > 0 && s.houses_checked === s.houses_total) {
          <!-- O01-e -->
          <section class="done-card center">
            <span class="big-icon white"><app-icon name="check" [size]="32" /></span>
            <h2>{{ i18n.t({ th: 'ตรวจครบทุกหลังแล้ว', en: 'Every house checked' }) }}</h2>
            <p class="small">{{ s.houses_total }} / {{ s.houses_total }} {{ i18n.t({ th: 'หลัง · รอบ', en: 'houses · round' }) }} {{ windowText() }}</p>
            <span class="full-bar"></span>
          </section>
          <div class="adv-only card">
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'รอบ', en: 'Round' }) }}</dt>
              <dd>{{ windowText() }}</dd>
              <dt>{{ i18n.t({ th: 'ผ่าน', en: 'Passed' }) }}</dt>
              <dd>{{ s.houses_checked }} / {{ s.houses_total }}</dd>
              <dt>{{ i18n.t({ th: 'โซน', en: 'Zone' }) }}</dt>
              <dd>{{ zoneLabel() }}</dd>
            </dl>
          </div>
          <a class="btn secondary" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนตรวจซ้ำ', en: 'Scan again' }) }}</a>
        } @else {
          <!-- O01 -->
          <section class="card stack">
            <div class="adv-only metrics">
              <div class="m">
                <span class="l">{{ i18n.t({ th: 'ตรวจแล้ว', en: 'Checked' }) }}</span>
                <span class="v">{{ s.houses_checked }} / {{ s.houses_total }}</span>
              </div>
              <div class="m">
                <span class="l">{{ i18n.t({ th: 'ยังไม่ตรวจ', en: 'Remaining' }) }}</span>
                <span class="v">{{ pending() }}</span>
              </div>
              <div class="m">
                <span class="l">SOS</span>
                <span class="v">{{ s.open_sos.length }}</span>
              </div>
              <div class="m">
                <span class="l">{{ i18n.t({ th: 'โซน', en: 'Zone' }) }}</span>
                <span class="v small">{{ zoneLabel() }}</span>
              </div>
            </div>
            <span class="chip ok window">{{ i18n.t({ th: 'อยู่ในเวลาตรวจ', en: 'Patrol hours' }) }} {{ windowText() }}</span>
            <p class="count">
              <strong>{{ s.houses_checked }}</strong>
              <span class="muted">/ {{ s.houses_total }} {{ i18n.t({ th: 'หลัง ตรวจแล้ว', en: 'houses checked' }) }}</span>
            </p>
            <span class="bar" role="progressbar" aria-valuemin="0" [attr.aria-label]="i18n.t({ th: 'บ้านที่ตรวจแล้ว', en: 'Houses checked' })" [attr.aria-valuenow]="s.houses_checked" [attr.aria-valuemax]="s.houses_total">
              <span [style.width.%]="percent()"></span>
            </span>
            <div class="adv-only timeline">
              <span class="strip">
                @for (g of windowSegments(); track $index) {
                  <i [style.left.%]="g.left" [style.width.%]="g.width"></i>
                }
                <s [style.left.%]="nowPct()"></s>
              </span>
              <span class="legend muted">
                <span>00</span><span>06</span><span>12</span><span>18</span><span>24 · {{ windowText() }}</span>
              </span>
            </div>
            @if (s.next_house; as next) {
              <p class="next">
                <app-icon name="pin" [size]="20" />
                {{ i18n.t({ th: 'หลังถัดไป บ้านเลขที่', en: 'Next: house' }) }} <strong>{{ next.house_no }}</strong>
              </p>
            }
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
                      {{ area }}@if (h.checked_at) { · {{ time(h.checked_at) }} }
                    } @else if (h.checked_at) {
                      {{ i18n.t({ th: 'ตรวจแล้ว ', en: 'Checked ' }) }}{{ time(h.checked_at) }}
                    } @else {
                      {{ i18n.t({ th: 'ในโซนของคุณ', en: 'In your zone' }) }}
                    }
                  </span>
                  <span class="muted small block mono adv-only">
                    {{ h.box_id }}
                    @if (h.checked_at) {
                      · {{ fullStamp(h.checked_at) }}
                    }
                  </span>
                </span>
                @if (h.checked_at) {
                  <span class="chip ok">{{ i18n.t({ th: 'ตรวจแล้ว', en: 'Checked' }) }}</span>
                } @else {
                  <span class="chip warn">{{ i18n.t({ th: 'ยังไม่ตรวจ', en: 'Not yet' }) }}</span>
                }
                </a>
              </li>
            }
          </ul>
        }

        <section class="adv-only stack-tight">
          <h2 class="section-title">{{ i18n.t({ th: 'บันทึกสแกนล่าสุดของคุณ', en: 'Your latest scan log' }) }}</h2>
          <div class="card logs">
            @for (l of logs(); track l.id) {
              <div>
                {{ time(l.at) }} · {{ l.box_id ?? '—' }} ·
                {{ l.method === 'code' ? i18n.t({ th: 'พิมพ์รหัส', en: 'typed code' }) : i18n.t({ th: 'สแกน QR', en: 'QR scan' }) }}
              </div>
            } @empty {
              <app-empty-state compact [title]="i18n.t({ th: 'ยังไม่มีบันทึกการสแกน', en: 'No scan log yet' })" [hint]="i18n.t({ th: 'สแกนหรือพิมพ์รหัสที่ตู้แล้วจะแสดงที่นี่', en: 'Scans and typed codes will show here' })" />
            }
          </div>
        </section>
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
    void this.loadLogs();
    liveRefresh(() => this.load(), REFRESH_MS);
    liveRefresh(() => this.loadLogs(), LOG_REFRESH_MS);
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

  /** โหมดละเอียดเท่านั้น — บันทึกการสแกนของตัวเอง (GET /officer/logs) */
  private async loadLogs(): Promise<void> {
    if (!this.display.advancedMode()) return;
    if (Date.now() - this.logsAt < LOG_REFRESH_MS / 2) return;
    this.logsAt = Date.now();
    try {
      const r = await this.api.logs(1);
      this.logs.set(r.data.slice(0, 4));
    } catch {
      // ไม่มีบันทึกก็ปล่อยว่าง
    }
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
    if (!iso) return '';
    const d = new Date(iso).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Bangkok',
    });
    return `${d} ${hhmm(iso)}`;
  }
}
