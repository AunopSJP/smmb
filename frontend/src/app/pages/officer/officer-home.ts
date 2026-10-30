import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { I18n } from '../../core/i18n';
import { hhmm, InspectionApi, type OfficerSummary } from '../../core/inspection-api';
import { Session } from '../../core/session';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

/** รีเฟรชหน้าสรุปทุกกี่วินาที (เพื่อนในโซนตรวจบ้านไป / ถึงเวลาตรวจ) */
const REFRESH_MS = 30_000;

/** O01 หน้าสรุปเจ้าหน้าที่ (api.md §6.1) · O01-d นอกเวลาตรวจ · O01-e ตรวจครบแล้ว — ข้อมูลจริง */
@Component({
  selector: 'app-officer-home',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="caption()" [title]="session.me()?.display_name ?? ''" [bell]="url('O14')" />

    <div class="stack">
      @if (error()) {
        <p class="card err" role="alert">
          {{ i18n.t({ th: 'โหลดข้อมูลไม่ได้ ลองใหม่อีกครั้ง', en: 'Couldn’t load — try again' }) }}
          <button type="button" class="btn secondary" (click)="load()">{{ i18n.t({ th: 'ลองใหม่', en: 'Retry' }) }}</button>
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
        @if (!s.in_window) {
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
          <section class="done-card center">
            <span class="big-icon white"><app-icon name="check" [size]="32" /></span>
            <h2>{{ i18n.t({ th: 'ตรวจครบทุกหลังแล้ว', en: 'Every house checked' }) }}</h2>
            <p class="small">{{ s.houses_total }} / {{ s.houses_total }} {{ i18n.t({ th: 'หลัง · รอบ', en: 'houses · round' }) }} {{ windowText() }}</p>
            <span class="full-bar"></span>
          </section>
          <a class="btn secondary" [routerLink]="url('O02')">{{ i18n.t({ th: 'สแกนตรวจซ้ำ', en: 'Scan again' }) }}</a>
        } @else {
          <!-- O01 -->
          <section class="card stack">
            <span class="chip ok window">{{ i18n.t({ th: 'อยู่ในเวลาตรวจ', en: 'Patrol hours' }) }} {{ windowText() }}</span>
            <p class="count">
              <strong>{{ s.houses_checked }}</strong>
              <span class="muted">/ {{ s.houses_total }} {{ i18n.t({ th: 'หลัง ตรวจแล้ว', en: 'houses checked' }) }}</span>
            </p>
            <span class="bar" role="progressbar" [attr.aria-valuenow]="s.houses_checked" [attr.aria-valuemax]="s.houses_total">
              <span [style.width.%]="percent()"></span>
            </span>
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

        <h2 class="section-title">{{ i18n.t({ th: 'บ้านในโซนของฉัน', en: 'Houses in my zone' }) }}</h2>
        @if (!s.houses.length) {
          <p class="card muted small">
            {{ i18n.t({ th: 'ยังไม่มีบ้านในโซนของคุณ — หัวหน้าเป็นคนใส่บ้านและเจ้าหน้าที่เข้าโซน', en: 'No houses in your zone yet — your head assigns houses and officers' }) }}
          </p>
        } @else {
          <ul class="list">
            @for (h of s.houses; track h.box_id) {
              <li class="row">
                <strong class="grow">{{ h.house_no }}<span class="muted small"> {{ h.box_name }}</span></strong>
                @if (h.checked_at) {
                  <span class="done">
                    <app-icon name="check" [size]="18" />
                    {{ i18n.t({ th: 'ตรวจแล้ว', en: 'Checked' }) }} {{ time(h.checked_at) }}
                  </span>
                } @else {
                  <span class="chip warn">{{ i18n.t({ th: 'ยังไม่ตรวจ', en: 'Not yet' }) }}</span>
                }
              </li>
            }
          </ul>
        }
      } @else if (!error()) {
        <p class="muted center">{{ i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
      }
    </div>
  `,
  styleUrl: './officer-home.scss',
})
export class OfficerHome {
  protected readonly i18n = inject(I18n);
  protected readonly session = inject(Session);
  private readonly api = inject(InspectionApi);
  protected readonly url = screenUrl;
  protected readonly time = hhmm;
  protected readonly s = signal<OfficerSummary | null>(null);
  protected readonly error = signal(false);
  protected readonly caption = computed(() => this.session.me()?.agency?.name ?? '');
  protected readonly windowText = computed(() => {
    const w = this.s()?.window;
    return w ? `${w.start}–${w.end}` : '';
  });
  protected readonly percent = computed(() => {
    const s = this.s();
    return s && s.houses_total ? Math.round((s.houses_checked / s.houses_total) * 100) : 0;
  });

  constructor() {
    void this.load();
    const t = setInterval(() => void this.load(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  async load(): Promise<void> {
    try {
      this.s.set(await this.api.summary());
      this.error.set(false);
    } catch (err) {
      if (apiError(err).status !== 401) this.error.set(true);
    }
  }
}
