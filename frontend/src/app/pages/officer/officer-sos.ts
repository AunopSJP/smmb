import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../../core/i18n';
import { MOCK_OFFICER, MOCK_OFFICER_SOS, MOCK_OFFICER_SOS_HISTORY } from '../../core/mock/mock-data';
import { nowHHmm, OfficerDemo } from '../../core/mock/officer-demo';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

// ── O12 · รายการ SOS (แท็บ) ───────────────────────────────────

@Component({
  selector: 'app-officer-sos-list',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="me.agency + ' · ' + me.zone" [title]="me.display_name" />
    <div class="stack">
      @if (demo.sos() === 'incoming') {
        <h2 class="section-title danger-text">{{ i18n.t({ th: 'SOS ใหม่ รอรับเรื่อง', en: 'New SOS — waiting' }) }}</h2>
        <a class="card current" [routerLink]="url('O09')">
          <span class="grow">
            <strong class="big">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ sos.house_no }}</strong>
            <span class="muted small block">{{ th() ? sos.address : sos.address_en }}</span>
          </span>
          <span class="chip danger">{{ i18n.t({ th: 'ยังไม่มีคนรับ', en: 'Not accepted' }) }}</span>
        </a>
      } @else if (demo.sos() === 'handling') {
        <h2 class="section-title danger-text">{{ i18n.t({ th: 'กำลังดูแล', en: 'Handling' }) }}</h2>
        <a class="card current" [routerLink]="url('O10')">
          <span class="grow">
            <strong class="big">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ sos.house_no }}</strong>
            <span class="muted small block">{{ th() ? sos.address : sos.address_en }} · {{ i18n.t({ th: 'รับเมื่อ ', en: 'accepted ' }) }}{{ demo.sosAcceptedAt() }}</span>
          </span>
          <span class="chip danger">{{ i18n.t({ th: 'รับแล้วโดยคุณ', en: 'Yours' }) }}</span>
        </a>
      }

      <h2 class="section-title">{{ i18n.t({ th: 'ย้อนหลัง 7 วัน', en: 'Last 7 days' }) }}</h2>
      <ul class="list">
        @if (demo.sos() === 'closed') {
          <li class="row">
            <span class="icon-bubble"><app-icon name="alert" [size]="20" /></span>
            <span class="grow">
              <strong>{{ sos.house_no }} · {{ i18n.t({ th: 'วันนี้', en: 'today' }) }}</strong>
              <span class="muted small block">{{ i18n.t({ th: 'รับโดยคุณ · ปิดเรื่องแล้ว', en: 'You handled it · closed' }) }}</span>
            </span>
            <span class="chip ok">{{ i18n.t({ th: 'ปิดแล้ว', en: 'Closed' }) }}</span>
          </li>
        }
        @for (h of history; track h.id) {
          <li class="row">
            <span class="icon-bubble"><app-icon name="alert" [size]="20" /></span>
            <span class="grow">
              <strong>{{ h.house_no }} · {{ th() ? h.when : h.when_en }}</strong>
              <span class="muted small block">
                @if (h.status === 'closed') {
                  {{ i18n.t({ th: 'รับโดย ', en: 'By ' }) }}{{ th() ? h.by : h.by_en }} · {{ i18n.t({ th: 'ปิดเรื่องแล้ว', en: 'closed' }) }}
                } @else {
                  {{ i18n.t({ th: 'เจ้าของบ้านยกเลิก (กดผิด)', en: 'Owner cancelled (mistake)' }) }}
                }
              </span>
            </span>
            <span class="chip" [class.ok]="h.status === 'closed'">
              {{ h.status === 'closed' ? i18n.t({ th: 'ปิดแล้ว', en: 'Closed' }) : i18n.t({ th: 'ยกเลิก', en: 'Cancelled' }) }}
            </span>
          </li>
        }
      </ul>
      <p class="muted small">{{ i18n.t({ th: 'SOS ใหม่จะเด้งเป็นแจ้งเตือนสีแดงทันที', en: 'A new SOS pops up as a red notification right away' }) }}</p>
      <div class="demo-tools">
        {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
        <button type="button" (click)="demo.setState('sos_incoming')">{{ i18n.t({ th: 'มี SOS เข้า', en: 'SOS comes in' }) }}</button>
      </div>
    </div>
  `,
  styles: `
    .current {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 2px solid var(--sos);
      text-decoration: none;
      color: inherit;
    }
    .big {
      font-size: 1.125rem;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .danger-text {
      color: var(--sos);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
  `,
})
export class OfficerSosList {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(OfficerDemo);
  protected readonly url = screenUrl;
  protected readonly me = MOCK_OFFICER;
  protected readonly sos = MOCK_OFFICER_SOS;
  protected readonly history = MOCK_OFFICER_SOS_HISTORY;
  protected readonly th = computed(() => this.i18n.lang() === 'th');
}

// ── O09 · SOS เข้า / O09-b มีคนรับแล้ว / O09-c เจ้าของยกเลิก ────────

@Component({
  selector: 'app-officer-sos-case',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (demo.sos()) {
      @case ('taken') {
        <div class="pad">
          <div class="result">
            <span class="big-icon danger"><app-icon name="check" [size]="30" /></span>
            <h1>{{ i18n.t({ th: 'มีเจ้าหน้าที่รับเรื่องแล้ว', en: 'Another officer accepted' }) }}</h1>
            <p class="muted small">{{ i18n.t({ th: 'คุณไม่ต้องไป ทำงานต่อได้เลย', en: 'You don’t need to go — carry on' }) }}</p>
          </div>
          <section class="card">
            <dl class="kv">
              <dt>SOS</dt><dd>{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ sos.house_no }}</dd>
              <dt>{{ i18n.t({ th: 'รับโดย', en: 'Accepted by' }) }}</dt><dd>{{ th() ? sos.other_officer : sos.other_officer_en }}</dd>
              <dt>{{ i18n.t({ th: 'เมื่อ', en: 'At' }) }}</dt><dd>{{ time }}</dd>
            </dl>
          </section>
          <a class="btn push-end" [routerLink]="url('O01')" (click)="demo.setState('normal')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
        </div>
      }
      @case ('cancelled') {
        <div class="pad">
          <div class="result">
            <span class="big-icon">×</span>
            <h1>{{ i18n.t({ th: 'เจ้าของบ้านยกเลิก SOS แล้ว', en: 'The owner cancelled the SOS' }) }}</h1>
            <p class="muted small">{{ i18n.t({ th: 'ไม่ต้องไปที่บ้านนี้แล้ว', en: 'You no longer need to go' }) }}</p>
          </div>
          <section class="card">
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'บ้าน', en: 'House' }) }}</dt><dd>{{ i18n.t({ th: 'เลขที่ ', en: 'No. ' }) }}{{ sos.house_no }}</dd>
              <dt>{{ i18n.t({ th: 'เหตุผล', en: 'Reason' }) }}</dt><dd>{{ i18n.t({ th: 'ปลอดภัยแล้ว', en: 'Safe now' }) }}</dd>
              <dt>{{ i18n.t({ th: 'ยกเลิกเมื่อ', en: 'Cancelled at' }) }}</dt><dd>{{ time }}</dd>
            </dl>
          </section>
          <a class="btn push-end" [routerLink]="url('O01')" (click)="demo.setState('normal')">{{ i18n.t({ th: 'กลับหน้าสรุป', en: 'Back to summary' }) }}</a>
        </div>
      }
      @default {
        <div class="pad incoming" role="alert">
          <div class="toprow">
            <span class="pill">{{ i18n.t({ th: 'SOS ใหม่', en: 'New SOS' }) }}</span>
            <span class="small">{{ i18n.t({ th: 'เมื่อ 15 วินาทีที่แล้ว', en: '15 seconds ago' }) }}</span>
          </div>
          <p>{{ i18n.t({ th: 'ขอความช่วยเหลือที่', en: 'Help needed at' }) }}</p>
          <h1>{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ sos.house_no }}</h1>
          <p class="small">{{ th() ? sos.address : sos.address_en }}</p>
          <section class="card on-red">
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'เจ้าของบ้าน', en: 'Owner' }) }}</dt><dd>{{ th() ? sos.owner_name : sos.owner_name_en }}</dd>
              <dt>{{ i18n.t({ th: 'เบอร์', en: 'Phone' }) }}</dt><dd>{{ sos.owner_phone }}</dd>
              <dt>{{ i18n.t({ th: 'ส่งถึง', en: 'Sent to' }) }}</dt><dd>{{ th() ? sos.sent_to : sos.sent_to_en }}</dd>
              <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt><dd class="danger-text">{{ i18n.t({ th: 'ยังไม่มีคนรับ', en: 'Not accepted yet' }) }}</dd>
            </dl>
          </section>
          <div class="demo-tools light">
            {{ i18n.t({ th: 'จำลอง:', en: 'Demo:' }) }}
            <button type="button" (click)="demo.sos.set('taken')">{{ i18n.t({ th: 'คนอื่นรับไปแล้ว', en: 'Taken by another' }) }}</button>
            <button type="button" (click)="demo.sos.set('cancelled')">{{ i18n.t({ th: 'เจ้าของยกเลิก', en: 'Owner cancels' }) }}</button>
          </div>
          <div class="stack push-end">
            <button type="button" class="btn on-color big" (click)="accept()">{{ i18n.t({ th: 'รับเรื่อง', en: 'Accept' }) }}</button>
            <a class="btn outline-light" [routerLink]="url('O01')">{{ i18n.t({ th: 'ไว้ก่อน กลับหน้าสรุป', en: 'Not now — back to summary' }) }}</a>
          </div>
        </div>
      }
    }
  `,
  styles: `
    .incoming {
      background: var(--sos);
      color: #fff;
      h1 {
        font-size: 2rem;
        line-height: 1.2;
      }
    }
    .toprow {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pill {
      font-weight: 700;
      font-size: 0.875rem;
      padding: 2px 10px;
      border-radius: 999px;
      background: rgb(255 255 255 / 20%);
    }
    .on-red {
      color: var(--text);
    }
    .danger-text {
      color: var(--sos);
    }
    .demo-tools.light {
      border-color: rgb(255 255 255 / 60%);
      color: #fff;
    }
  `,
})
export class OfficerSosCase implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(OfficerDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly sos = MOCK_OFFICER_SOS;
  protected readonly time = nowHHmm();
  protected readonly th = computed(() => this.i18n.lang() === 'th');

  ngOnInit(): void {
    // เปิดหน้านี้ตรง ๆ (ต้นแบบ) → ทำให้มี SOS เข้า
    if (this.demo.sos() === 'none' || this.demo.sos() === 'closed') this.demo.setState('sos_incoming');
  }

  /** คนแรกที่กดได้เรื่อง (server ล็อก) — ของจริง: POST /sos/:id/accept */
  protected accept(): void {
    this.demo.acceptSos();
    void this.router.navigateByUrl(screenUrl('O10'));
  }
}

// ── O10 · กำลังดูแล ──────────────────────────────────────────

@Component({
  selector: 'app-officer-sos-handling',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <a [routerLink]="url('O01')" class="back"><app-icon name="chevronLeft" [size]="16" />{{ i18n.t({ th: 'หน้าสรุป', en: 'Summary' }) }}</a>
      <p class="small">{{ i18n.t({ th: 'คุณรับเรื่องแล้ว · ', en: 'You accepted · ' }) }}{{ demo.sosAcceptedAt() }}</p>
      <h1>{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ sos.house_no }}</h1>
      <p class="small">{{ th() ? sos.address : sos.address_en }}</p>
    </header>
    <div class="pad">
      <section class="card">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'เจ้าของบ้าน', en: 'Owner' }) }}</dt><dd>{{ th() ? sos.owner_name : sos.owner_name_en }}</dd>
          <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt><dd class="ok">{{ i18n.t({ th: 'เจ้าของบ้านเห็นว่าคุณรับแล้ว', en: 'The owner sees you accepted' }) }}</dd>
        </dl>
      </section>
      <a class="btn big" [href]="'tel:' + sos.owner_phone">{{ i18n.t({ th: 'โทรหาเจ้าของบ้าน', en: 'Call the owner' }) }}</a>
      <a class="btn green big push-end" [routerLink]="url('O11')">{{ i18n.t({ th: 'ถึงแล้ว ปิดเรื่อง', en: 'Arrived — close the case' }) }}</a>
    </div>
  `,
  styles: `
    .head {
      background: var(--sos);
      color: #fff;
      padding: 14px 16px 20px;
      border-radius: 0 0 20px 20px;
      h1 {
        font-size: 1.75rem;
      }
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #fff;
      font-weight: 700;
      font-size: 0.875rem;
      text-decoration: none;
    }
  `,
})
export class OfficerSosHandling implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(OfficerDemo);
  protected readonly url = screenUrl;
  protected readonly sos = MOCK_OFFICER_SOS;
  protected readonly th = computed(() => this.i18n.lang() === 'th');

  ngOnInit(): void {
    if (this.demo.sos() !== 'handling') this.demo.setState('handling');
  }
}

// ── O11 · ปิดเรื่อง + หมายเหตุ ─────────────────────────────────

const OUTCOMES: { v: string; label: Tr }[] = [
  { v: 'safe', label: { th: 'ไม่มีเหตุร้าย ปลอดภัย', en: 'No incident, all safe' } },
  { v: 'helped', label: { th: 'ช่วยเหลือเรียบร้อย', en: 'Helped, resolved' } },
  { v: 'handed_over', label: { th: 'ส่งต่อหน่วยอื่น', en: 'Handed to another unit' } },
];

@Component({
  selector: 'app-officer-sos-close',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="pad" (submit)="close($event)">
      <a class="back" [routerLink]="url('O10')"><app-icon name="chevronLeft" [size]="16" />{{ i18n.t({ th: 'กลับ', en: 'Back' }) }}</a>
      <h1>{{ i18n.t({ th: 'ปิดเรื่อง SOS', en: 'Close the SOS' }) }}</h1>
      <p class="muted small">{{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ house }}</p>
      <fieldset class="options">
        <legend>{{ i18n.t({ th: 'เกิดอะไรขึ้น', en: 'What happened' }) }}</legend>
        @for (o of outcomes; track o.v) {
          <label><input type="radio" name="outcome" [value]="o.v" [checked]="outcome() === o.v" (change)="outcome.set(o.v)" />{{ i18n.t(o.label) }}</label>
        }
      </fieldset>
      <label class="note">
        <strong>{{ i18n.t({ th: 'หมายเหตุ (เจ้าของบ้านจะเห็น)', en: 'Note (the owner will see it)' }) }}</strong>
        <textarea rows="4" maxlength="500" [placeholder]="i18n.t({ th: 'เช่น ตรวจรอบบ้านแล้ว ไม่พบสิ่งผิดปกติ', en: 'e.g. Checked around the house, nothing unusual' })"></textarea>
      </label>
      <button type="submit" class="btn green big push-end">{{ i18n.t({ th: 'ยืนยันปิดเรื่อง', en: 'Confirm and close' }) }}</button>
    </form>
  `,
  styles: `
    h1 {
      font-size: 1.375rem;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--brand);
      font-weight: 700;
      font-size: 0.875rem;
      text-decoration: none;
    }
    .note {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    textarea {
      font: inherit;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      resize: vertical;
    }
    textarea:focus {
      outline: none;
      border-color: var(--brand);
    }
  `,
})
export class OfficerSosClose {
  protected readonly i18n = inject(I18n);
  private readonly demo = inject(OfficerDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly house = MOCK_OFFICER_SOS.house_no;
  protected readonly outcomes = OUTCOMES;
  protected readonly outcome = signal('safe');

  protected close(e: Event): void {
    e.preventDefault();
    this.demo.closeSos();
    void this.router.navigateByUrl(screenUrl('O12'));
  }
}
