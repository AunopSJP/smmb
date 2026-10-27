import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { MOCK_OFFICER, MOCK_OFFICER_SOS } from '../../core/mock/mock-data';
import { OFFICER_HOME_STATES, OfficerDemo, type OfficerHomeState } from '../../core/mock/officer-demo';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

/** O01 หน้าสรุปเจ้าหน้าที่ + สถานะ O01-b/c/d/e (`/officer?state=sos_incoming|handling|off_hours|all_done`) */
@Component({
  selector: 'app-officer-home',
  imports: [NgTemplateOutlet, RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demo.state() === 'handling') {
      <a class="handling-bar" [routerLink]="url('O10')">
        <span class="dot white"></span>
        <span class="grow">
          <strong>{{ i18n.t({ th: 'คุณกำลังดูแล SOS', en: 'You are handling an SOS' }) }}</strong>
          <span class="small block">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ sos.house_no }} · {{ i18n.t({ th: 'รับเมื่อ ', en: 'since ' }) }}{{ demo.sosAcceptedAt() }}</span>
        </span>
        <span class="open">{{ i18n.t({ th: 'เปิด', en: 'Open' }) }}</span>
      </a>
    }
    <app-page-header [caption]="me.agency + ' · ' + me.zone" [title]="me.display_name" />

    <div class="stack">
      <div class="demo-tools" role="group">
        {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
        @for (o of states; track o.v) {
          <button type="button" [attr.aria-pressed]="demo.state() === o.v" (click)="demo.setState(o.v)">
            {{ lang() === 'th' ? o.th : o.en }}
          </button>
        }
      </div>

      @if (demo.state() === 'sos_incoming') {
        <!-- O01-b -->
        <section class="sos-card" role="alert">
          <p class="sos-title"><app-icon name="alert" [size]="20" />{{ i18n.t({ th: 'SOS ขอความช่วยเหลือ', en: 'SOS — help needed' }) }}</p>
          <h2>{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ sos.house_no }}</h2>
          <p class="small">{{ lang() === 'th' ? sos.address : sos.address_en }} · {{ i18n.t({ th: '15 วินาทีที่แล้ว · ยังไม่มีคนรับ', en: '15 s ago · not accepted yet' }) }}</p>
          <a class="btn on-color" [routerLink]="url('O09')">{{ i18n.t({ th: 'รับเรื่อง', en: 'Accept' }) }}</a>
          <a class="btn outline-light" [routerLink]="url('O09')">{{ i18n.t({ th: 'ดูรายละเอียด', en: 'Details' }) }}</a>
        </section>
      }

      @switch (demo.state()) {
        @case ('off_hours') {
          <!-- O01-d -->
          <section class="card center stack">
            <span class="zz" aria-hidden="true">Zz</span>
            <h2>{{ i18n.t({ th: 'ตอนนี้นอกเวลาตรวจ', en: 'Outside patrol hours' }) }}</h2>
            <p class="muted small">{{ i18n.t({ th: 'ตู้พักอยู่ สแกนตรวจไม่ได้', en: 'Mailboxes are asleep and can’t be inspected' }) }}</p>
            <div class="next-round">
              <p class="muted small">{{ i18n.t({ th: 'รอบถัดไป', en: 'Next round' }) }}</p>
              <p class="round">17:00–21:00</p>
              <p class="muted small">{{ i18n.t({ th: 'อีก 2 ชม. 15 นาที', en: 'In 2 h 15 min' }) }}</p>
            </div>
          </section>
          <button type="button" class="btn big" disabled>{{ i18n.t({ th: 'สแกนได้เมื่อถึงเวลาตรวจ', en: 'Scanning opens at patrol time' }) }}</button>
          <section class="card">
            <strong>{{ i18n.t({ th: 'รอบที่แล้ว 06:00–09:00', en: 'Last round 06:00–09:00' }) }}</strong>
            <p class="muted small">{{ i18n.t({ th: 'ตรวจแล้ว 10 / 10 หลัง', en: '10 / 10 houses checked' }) }}</p>
          </section>
          <p class="sos-note"><app-icon name="bell" [size]="18" />{{ i18n.t({ th: 'SOS ยังรับได้ตลอด 24 ชม.', en: 'SOS still comes in 24/7' }) }}</p>
        }
        @case ('all_done') {
          <!-- O01-e -->
          <section class="done-card center">
            <span class="big-icon white"><app-icon name="check" [size]="32" /></span>
            <h2>{{ i18n.t({ th: 'ตรวจครบทุกหลังแล้ว', en: 'Every house checked' }) }}</h2>
            <p class="small">{{ demo.zoneTotal }} / {{ demo.zoneTotal }} {{ i18n.t({ th: 'หลัง · รอบ', en: 'houses · round' }) }} {{ me.window }}</p>
            <span class="full-bar"></span>
          </section>
          <section class="card">
            <strong>{{ i18n.t({ th: 'สรุปรอบนี้', en: 'This round' }) }}</strong>
            <p class="muted small">
              {{ i18n.t({ th: 'คุณตรวจ 6 หลัง · เพื่อนในโซนตรวจ 4 หลัง', en: 'You checked 6 · teammates 4' }) }}<br />
              {{ i18n.t({ th: 'แจ้งปัญหาตู้ 0 · QR ที่แจ้งว่าเสีย 1', en: 'Box problems 0 · damaged QR reported 1' }) }}
            </p>
          </section>
          <button type="button" class="btn secondary" (click)="showAll.set(!showAll())">
            {{ i18n.t({ th: 'ดูบ้านทั้งหมดในโซน', en: 'See every house in the zone' }) }}
          </button>
          @if (showAll()) {
            <ng-container *ngTemplateOutlet="houses" />
          }
        }
        @default {
          <!-- O01 / O01-b / O01-c -->
          <section class="card stack" [class.dim]="demo.state() === 'sos_incoming'">
            <span class="chip ok window">{{ i18n.t({ th: 'อยู่ในเวลาตรวจ', en: 'Patrol hours' }) }} {{ me.window }}</span>
            <p class="count">
              <strong>{{ demo.checked() }}</strong>
              <span class="muted">/ {{ demo.zoneTotal }} {{ i18n.t({ th: 'หลัง ตรวจแล้ว', en: 'houses checked' }) }}</span>
            </p>
            <span class="bar" role="progressbar" [attr.aria-valuenow]="demo.checked()" [attr.aria-valuemax]="demo.zoneTotal">
              <span [style.width.%]="percent()"></span>
            </span>
            @if (demo.state() === 'normal' && demo.nextHouse(); as next) {
              <p class="next">
                <app-icon name="pin" [size]="20" />
                {{ i18n.t({ th: 'หลังถัดไป บ้านเลขที่', en: 'Next: house' }) }} <strong>{{ next }}</strong>
              </p>
            }
          </section>

          @if (demo.state() === 'sos_incoming') {
            <button type="button" class="btn big" disabled>{{ i18n.t({ th: 'สแกน QR หน้าตู้ (พักไว้ก่อน)', en: 'Scan mailbox QR (paused)' }) }}</button>
          } @else {
            <a class="btn big" [routerLink]="url('O02')">
              <app-icon name="scan" [size]="26" />
              {{ i18n.t({ th: 'สแกน QR หน้าตู้', en: 'Scan mailbox QR' }) }}
            </a>
          }
          @if (demo.state() === 'handling') {
            <p class="muted small center">
              {{ i18n.t({ th: 'ตรวจตู้ต่อได้ระหว่างดูแล SOS', en: 'You can keep inspecting while handling the SOS' }) }}<br />
              {{ i18n.t({ th: 'แถบแดงด้านบนจะอยู่จนกว่าจะปิดเรื่อง', en: 'The red bar stays until you close it' }) }}
            </p>
          }
          @if (demo.state() === 'normal') {
            <h2 class="section-title">{{ i18n.t({ th: 'บ้านในโซนของฉัน', en: 'Houses in my zone' }) }}</h2>
            <ng-container *ngTemplateOutlet="houses" />
          }
        }
      }
    </div>

    <ng-template #houses>
      <ul class="list">
        @for (h of demo.houses(); track h.house_no) {
          <li class="row">
            <strong class="grow">{{ h.house_no }}</strong>
            @if (h.checked_at) {
              <span class="done">
                <app-icon name="check" [size]="18" />
                {{ i18n.t({ th: 'ตรวจแล้ว', en: 'Checked' }) }} {{ h.checked_at }}
              </span>
            } @else {
              <span class="chip warn">{{ i18n.t({ th: 'ยังไม่ตรวจ', en: 'Not yet' }) }}</span>
            }
          </li>
        }
      </ul>
    </ng-template>
  `,
  styleUrl: './officer-home.scss',
})
export class OfficerHome {
  protected readonly i18n = inject(I18n);
  protected readonly lang = this.i18n.lang;
  protected readonly demo = inject(OfficerDemo);
  protected readonly url = screenUrl;
  protected readonly me = MOCK_OFFICER;
  protected readonly sos = MOCK_OFFICER_SOS;
  protected readonly states = OFFICER_HOME_STATES;
  protected readonly showAll = signal(false);
  protected readonly percent = computed(() => Math.round((this.demo.checked() / this.demo.zoneTotal) * 100));

  /** `?state=…` เปิดสถานะนั้นตรง ๆ */
  readonly state = input<string>();
  private readonly applyState = effect(() => {
    const s = this.state();
    if (s && OFFICER_HOME_STATES.some((o) => o.v === s)) untracked(() => this.demo.setState(s as OfficerHomeState));
  });
}
