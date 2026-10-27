import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { MOCK_OWNER, MOCK_SOS_OFFICER } from '../../core/mock/mock-data';
import { SosDemo, STAGE_CALL_AT } from '../../core/mock/sos-demo';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { CallButtons } from './call-buttons';

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

// ── H09 · กำลังหาเจ้าหน้าที่ (3 ขั้น) ─────────────────────────────

@Component({
  selector: 'app-sos-waiting',
  imports: [NgTemplateOutlet, RouterLink, Icon, CallButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let st = sos.stage();
    <div class="sos-page" role="main" aria-live="polite">
      @if (st === 'call_yourself') {
        <header class="sos-head">
          <span class="pill">{{ i18n.t({ th: 'ยังไม่มีคนรับ', en: 'No one has accepted yet' }) }} · {{ time() }}</span>
          <h1>{{ i18n.t({ th: 'กรุณาโทรแจ้งเหตุทันที', en: 'Please call for help now' }) }}</h1>
          <p>{{ i18n.t({ th: 'SOS ยังเปิดอยู่ ถ้ามีเจ้าหน้าที่รับจะแจ้งให้ทราบทันที', en: 'Your SOS is still open — we will tell you as soon as an officer accepts' }) }}</p>
        </header>
        <div class="sos-body">
          <app-call-buttons [big]="true" />
          <p class="note"><span class="dot live"></span>{{ i18n.t({ th: 'ยังรอเจ้าหน้าที่รับเรื่องอยู่เบื้องหลัง', en: 'Still waiting for an officer in the background' }) }}</p>
          <ng-container *ngTemplateOutlet="tools" />
        </div>
      } @else {
        <header class="sos-head">
          <span class="pill">{{ i18n.t({ th: 'SOS ส่งแล้ว · บ้านเลขที่ ', en: 'SOS sent · house ' }) }}{{ house }}</span>
          <h1>
            {{ st === 'zone' ? i18n.t({ th: 'กำลังหาเจ้าหน้าที่…', en: 'Finding an officer…' }) : i18n.t({ th: 'กำลังแจ้งทั้งหน่วยงาน…', en: 'Alerting the whole agency…' }) }}
          </h1>
          <p class="timer">{{ time() }}</p>
          <p>
            {{ st === 'zone'
              ? i18n.t({ th: 'ไม่ต้องปิดหน้านี้ จะแจ้งทันทีเมื่อมีคนรับ', en: 'Keep this page open — we will tell you when someone accepts' })
              : i18n.t({ th: 'เจ้าหน้าที่ในโซนยังไม่รับ ระบบส่งต่อให้ทุกคนในหน่วยงานแล้ว', en: 'No zone officer yet — sent to everyone in the agency' }) }}
          </p>
        </header>

        <div class="sos-body">
          <ol class="steps">
            <li [class.done]="st !== 'zone'" [class.now]="st === 'zone'">
              <span class="num">@if (st !== 'zone') {<app-icon name="check" [size]="16" />} @else {1}</span>
              <span>
                <strong>{{ i18n.t({ th: 'แจ้งเจ้าหน้าที่ในโซนแล้ว', en: 'Zone officers alerted' }) }}</strong>
                <small>{{ st === 'zone' ? i18n.t({ th: 'ตอนนี้', en: 'Now' }) : i18n.t({ th: 'ยังไม่มีคนรับ', en: 'Not accepted yet' }) }}</small>
              </span>
            </li>
            <li [class.now]="st === 'agency'">
              <span class="num">2</span>
              <span>
                <strong>{{ i18n.t({ th: 'แจ้งทั้งหน่วยงาน + หัวหน้า', en: 'Whole agency + head' }) }}</strong>
                <small>{{ st === 'agency' ? i18n.t({ th: 'ตอนนี้', en: 'Now' }) : i18n.t({ th: 'ถ้ายังไม่มีคนรับใน 30 วินาที', en: 'If no one accepts within 30 s' }) }}</small>
              </span>
            </li>
            <li>
              <span class="num">3</span>
              <span>
                <strong>{{ i18n.t({ th: 'ให้โทรแจ้งเหตุเอง', en: 'Call for help yourself' }) }}</strong>
                <small>
                  @if (st === 'agency') {
                    {{ i18n.t({ th: 'อีก ', en: 'In ' }) }}{{ toCall() }}{{ i18n.t({ th: ' วินาที ถ้ายังไม่มีคนรับ', en: ' s if no one accepts' }) }}
                  } @else {
                    {{ i18n.t({ th: 'ถ้ายังไม่มีคนรับใน 60 วินาที', en: 'If no one accepts within 60 s' }) }}
                  }
                </small>
              </span>
            </li>
          </ol>
          <ng-container *ngTemplateOutlet="tools" />
        </div>
      }

      <footer class="sos-foot">
        @if (st !== 'call_yourself') {
          <p class="muted small center">{{ i18n.t({ th: 'ฉุกเฉิน โทรได้ทันทีไม่ต้องรอ', en: 'Emergency? Call now, no need to wait' }) }}</p>
          <app-call-buttons />
        }
        <a class="btn secondary" [routerLink]="url('H10')">{{ i18n.t({ th: 'ยกเลิก SOS', en: 'Cancel SOS' }) }}</a>
      </footer>
    </div>

    <ng-template #tools>
      <div class="demo-tools">
        {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
        <button type="button" (click)="sos.skip(30)">+30 {{ i18n.t({ th: 'วิ', en: 's' }) }}</button>
        <button type="button" (click)="sos.accept()">{{ i18n.t({ th: 'มีคนรับ', en: 'Officer accepts' }) }}</button>
        <button type="button" (click)="noOfficer()">{{ i18n.t({ th: 'บ้านไม่มีเจ้าหน้าที่', en: 'No officer' }) }}</button>
      </div>
    </ng-template>
  `,
  styles: `
    .steps {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
      li {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        color: var(--text-muted);
      }
      li.now,
      li.done {
        color: var(--text);
      }
      strong,
      small {
        display: block;
      }
      small {
        color: var(--text-muted);
      }
    }
    .num {
      display: grid;
      place-items: center;
      flex: none;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 1.5px solid currentColor;
      font-size: 0.8125rem;
      font-weight: 700;
    }
    li.now .num {
      background: var(--sos);
      border-color: var(--sos);
      color: #fff;
    }
    li.done .num {
      background: var(--ok);
      border-color: var(--ok);
      color: #fff;
    }
    .note {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--surface);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-size: 0.875rem;
    }
    .dot.live {
      background: var(--sos);
    }
    .center {
      text-align: center;
    }
  `,
})
export class SosWaiting implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly sos = inject(SosDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly house = MOCK_OWNER.house_no;
  protected readonly time = computed(() => mmss(this.sos.elapsedSec()));
  protected readonly toCall = computed(() => Math.max(0, STAGE_CALL_AT - this.sos.elapsedSec()));

  constructor() {
    // มีคนรับ → ไปหน้า H11 เอง
    effect(() => {
      if (this.sos.status() === 'accepted') void this.router.navigateByUrl(screenUrl('H11'));
    });
  }

  ngOnInit(): void {
    if (this.sos.status() !== 'open') this.sos.start();
  }

  protected noOfficer(): void {
    this.sos.reset();
    void this.router.navigateByUrl(screenUrl('H08'));
  }
}

// ── H08 · บ้านยังไม่มีเจ้าหน้าที่ ─────────────────────────────────

@Component({
  selector: 'app-sos-no-officer',
  imports: [RouterLink, CallButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sos-page" role="main">
      <header class="sos-head">
        <h1>{{ i18n.t({ th: 'โทรแจ้งเหตุทันที', en: 'Call for help now' }) }}</h1>
        <p>{{ i18n.t({ th: 'บ้านนี้ยังไม่มีเจ้าหน้าที่ดูแล ระบบส่งต่อให้ใครไม่ได้', en: 'No officer covers this house yet, so the SOS cannot be passed on' }) }}</p>
      </header>
      <div class="sos-body">
        <app-call-buttons [big]="true" />
        <p class="muted small center">{{ i18n.t({ th: 'ระบบบันทึกเหตุนี้ไว้แล้ว ผู้ดูแลระบบจะเห็น', en: 'This event is recorded and the admin will see it' }) }}</p>
      </div>
      <footer class="sos-foot">
        <a class="btn secondary" [routerLink]="url('H03')">{{ i18n.t({ th: 'กลับหน้าหลัก', en: 'Back to home' }) }}</a>
      </footer>
    </div>
  `,
  styles: `
    .center {
      text-align: center;
    }
  `,
})
export class SosNoOfficer {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
}

// ── H10 · ยืนยันยกเลิก ─────────────────────────────────────────

@Component({
  selector: 'app-sos-cancel',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sheet-backdrop sos-dim">
      <p class="behind">{{ i18n.t({ th: 'กำลังหาเจ้าหน้าที่…', en: 'Finding an officer…' }) }} {{ time() }}</p>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <h2 id="cancel-title">{{ i18n.t({ th: 'ยกเลิก SOS ใช่ไหม?', en: 'Cancel your SOS?' }) }}</h2>
        <p class="muted small">{{ i18n.t({ th: 'เลือกเหตุผล ระบบจะแจ้งเจ้าหน้าที่ให้ทราบว่ายกเลิกแล้ว', en: 'Pick a reason — officers will be told it is cancelled' }) }}</p>
        <button type="button" class="btn secondary option" (click)="cancel('safe')">
          <app-icon name="shield" [size]="20" />{{ i18n.t({ th: 'ปลอดภัยแล้ว', en: 'I am safe now' }) }}
        </button>
        <button type="button" class="btn secondary option" (click)="cancel('mistake')">
          <app-icon name="alert" [size]="20" />{{ i18n.t({ th: 'กดผิด', en: 'Pressed by mistake' }) }}
        </button>
        <a class="btn" [routerLink]="back()">{{ i18n.t({ th: 'ไม่ยกเลิก รอเจ้าหน้าที่ต่อ', en: 'Keep waiting for an officer' }) }}</a>
      </section>
    </div>
  `,
  styles: `
    .sos-dim {
      background: #4a1013;
    }
    .behind {
      flex: 1;
      display: grid;
      place-items: center;
      color: rgb(255 255 255 / 45%);
      font-weight: 700;
    }
    .option {
      justify-content: flex-start;
      box-shadow: inset 0 0 0 1.5px var(--line);
    }
  `,
})
export class SosCancel {
  protected readonly i18n = inject(I18n);
  private readonly sos = inject(SosDemo);
  private readonly router = inject(Router);
  protected readonly time = computed(() => mmss(this.sos.elapsedSec()));
  protected readonly back = computed(() => screenUrl(this.sos.status() === 'accepted' ? 'H11' : 'H09'));

  protected cancel(reason: 'safe' | 'mistake'): void {
    this.sos.cancel(reason);
    this.sos.reset();
    void this.router.navigateByUrl(screenUrl('H03'));
  }
}

// ── H11 · มีเจ้าหน้าที่รับแล้ว ───────────────────────────────────

@Component({
  selector: 'app-sos-accepted',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sos-page" role="main" aria-live="polite">
      <header class="sos-head ok">
        <span class="check"><app-icon name="check" [size]="30" /></span>
        <h1>{{ i18n.t({ th: 'มีเจ้าหน้าที่รับแล้ว', en: 'An officer accepted' }) }}</h1>
        <p>{{ i18n.t({ th: 'กำลังเดินทางไปที่บ้านคุณ', en: 'They are on the way to your house' }) }}</p>
      </header>
      <div class="sos-body">
        <section class="card officer">
          <span class="icon-bubble danger"><app-icon name="user" [size]="20" /></span>
          <span>
            <strong>{{ lang() === 'th' ? o.name : o.name_en }}</strong>
            <span class="muted small block">{{ lang() === 'th' ? o.agency : o.agency_en }}</span>
          </span>
        </section>
        <a class="btn" [href]="'tel:' + o.phone">{{ i18n.t({ th: 'โทรหาเจ้าหน้าที่', en: 'Call the officer' }) }}</a>
        <p class="muted small center">{{ i18n.t({ th: 'เบอร์โทรเห็นได้เฉพาะตอน SOS เปิดอยู่', en: 'The number is only shown while the SOS is open' }) }}</p>
        <p class="note"><span class="dot"></span>{{ i18n.t({ th: 'เมื่อเจ้าหน้าที่ปิดเรื่อง จะแจ้งให้ทราบ', en: 'You will be notified when the officer closes it' }) }}</p>
        <div class="demo-tools">
          {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
          <button type="button" (click)="close()">{{ i18n.t({ th: 'เจ้าหน้าที่ปิดเรื่อง', en: 'Officer closes' }) }}</button>
        </div>
      </div>
      <footer class="sos-foot">
        <a class="btn secondary" [routerLink]="url('H10')">{{ i18n.t({ th: 'ยกเลิก SOS', en: 'Cancel SOS' }) }}</a>
      </footer>
    </div>
  `,
  styles: `
    .check {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #fff;
      color: #157347;
    }
    .officer {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .block {
      display: block;
    }
    .center {
      text-align: center;
    }
    .note {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--surface);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-size: 0.875rem;
    }
  `,
})
export class SosAccepted implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly lang = this.i18n.lang;
  private readonly sos = inject(SosDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly o = MOCK_SOS_OFFICER;

  ngOnInit(): void {
    // เปิดหน้านี้ตรง ๆ (ต้นแบบ) → ทำให้เป็นสถานะ "มีคนรับ"
    if (this.sos.status() !== 'accepted') {
      this.sos.start();
      this.sos.accept();
    }
  }

  protected close(): void {
    this.sos.close();
    void this.router.navigateByUrl(screenUrl('H11-b'));
  }
}

// ── H11-b · ปิดเรื่องแล้ว ────────────────────────────────────────

@Component({
  selector: 'app-sos-closed',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sos-page closed" role="main">
      <div class="sos-body">
        <span class="check"><app-icon name="check" [size]="30" /></span>
        <h1 class="center">{{ i18n.t({ th: 'ปิดเรื่องแล้ว', en: 'SOS closed' }) }}</h1>
        <p class="muted small center">
          {{ i18n.t({ th: 'ใช้เวลาจนมีคนรับ ', en: 'Time until accepted: ' }) }}{{ sos.minutesToAccept() || 1 }}
          {{ i18n.t({ th: 'นาที', en: 'min' }) }}
        </p>
        <section class="card stack">
          <div>
            <p class="muted small">{{ i18n.t({ th: 'ดูแลโดย', en: 'Handled by' }) }}</p>
            <strong>{{ lang() === 'th' ? o.name + ' · ' + o.agency : o.name_en + ' · ' + o.agency_en }}</strong>
          </div>
          <div class="divider"></div>
          <div>
            <p class="muted small">{{ i18n.t({ th: 'หมายเหตุจากเจ้าหน้าที่', en: 'Note from the officer' }) }}</p>
            <p>{{ lang() === 'th' ? o.close_note : o.close_note_en }}</p>
          </div>
        </section>
      </div>
      <footer class="sos-foot">
        <button type="button" class="btn" (click)="home()">{{ i18n.t({ th: 'กลับหน้าหลัก', en: 'Back to home' }) }}</button>
      </footer>
    </div>
  `,
  styles: `
    .closed {
      background: var(--bg);
    }
    .check {
      align-self: center;
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      margin-top: 24px;
      border-radius: 50%;
      background: var(--ok-bg);
      color: var(--ok);
    }
    h1 {
      font-size: 1.5rem;
    }
    .center {
      text-align: center;
    }
    .divider {
      height: 1px;
      background: var(--line);
    }
  `,
})
export class SosClosed {
  protected readonly i18n = inject(I18n);
  protected readonly lang = this.i18n.lang;
  protected readonly sos = inject(SosDemo);
  private readonly router = inject(Router);
  protected readonly o = MOCK_SOS_OFFICER;

  protected home(): void {
    this.sos.reset();
    void this.router.navigateByUrl(screenUrl('H03'));
  }
}
