import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { bkkClock } from '../../core/time';
import { Router, RouterLink } from '@angular/router';
import { DisplaySettings } from '../../core/display-settings';
import { I18n } from '../../core/i18n';
import { mmss, OwnerApi, secondsSince, type Sos } from '../../core/owner-api';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { CallButtons } from './call-buttons';

/** ขั้นที่ 3 (ให้โทรเอง) ที่วินาทีนี้ (✅ design §7) */
const STAGE_CALL_AT = 60;
/** หน้ารอ SOS ถามสถานะทุก 1 วิ (✅) */
const POLL_MS = 1000;

/** ถาม GET /sos/:id ทุก 1 วิ ระหว่างอยู่หน้านี้ — ใช้ร่วมทุกหน้า SOS ของเจ้าของบ้าน */
function pollSos(api: OwnerApi, id: () => string, onData: (s: Sos) => void, onLink?: (ok: boolean) => void): void {
  let fails = 0;
  const tick = () => {
    if (!id()) return Promise.resolve(); // เปิดหน้านี้ตรง ๆ โดยไม่มี ?id → ไม่ยิง /sos/ ว่าง
    return api
      .sos(id())
      .then((s) => {
        fails = 0;
        onLink?.(true);
        onData(s);
      })
      .catch(() => {
        // เน็ตหลุด/เซิร์ฟเวอร์ไม่ตอบ 5 รอบติด (≈5 วิ) → บอกให้โทรเอง — ห้ามปล่อยหน้า "กำลังรอ" ค้างโดยไม่รู้ว่าขาดการติดต่อ
        if (++fails >= 5) onLink?.(false);
      });
  };
  void tick();
  const t = setInterval(tick, POLL_MS);
  inject(DestroyRef).onDestroy(() => clearInterval(t));
}

// ── H09 · กำลังหาเจ้าหน้าที่ (3 ขั้น) ─────────────────────────────

@Component({
  selector: 'app-sos-waiting',
  imports: [RouterLink, Icon, CallButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let st = sos()?.stage ?? 'zone';
    <div class="sos-page">
      @if (!linkOk()) {
        <p class="link-lost" role="alert">
          {{ i18n.t({ th: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ — โทรแจ้งเหตุเองทันที: 191 / 1669', en: 'Cannot reach the server — call for help yourself now: 191 / 1669' }) }}
        </p>
      }
      @if (display.easyMode()) {
        <!-- OwnSosWait_E: หน้าจอเดียว ตัวใหญ่ + ปุ่มโทร -->
        <div class="easy-sos">
          <div class="pulse" aria-hidden="true"><i></i></div>
          <h1 aria-live="polite">{{ st === 'call_yourself' ? i18n.t({ th: 'โปรดโทรแจ้งเหตุทันที', en: 'Please call for help now' }) : i18n.t({ th: 'กำลังขอความช่วยเหลือ', en: 'Getting help' }) }}</h1>
          <p>{{ st === 'call_yourself' ? i18n.t({ th: 'SOS ยังเปิดอยู่ ถ้ามีเจ้าหน้าที่รับจะแจ้งให้ทราบทันที', en: 'Your SOS is still open — we will tell you as soon as an officer accepts' }) : i18n.t({ th: 'ส่งถึงเจ้าหน้าที่แล้ว รอคนรับเรื่อง', en: 'Sent to officers — waiting for someone to accept' }) }}</p>
          <app-call-buttons [big]="true" />
          <a class="btn secondary easy-cancel" [routerLink]="url('H10')" [queryParams]="{ id: id() }">{{ i18n.t({ th: 'ยกเลิก SOS', en: 'Cancel SOS' }) }}</a>
        </div>
      } @else {
      @if (st === 'call_yourself') {
        <header class="sos-head">
          <span class="pill">{{ i18n.t({ th: 'ยังไม่มีคนรับ', en: 'No one has accepted yet' }) }} · {{ time() }}</span>
          <h1 aria-live="polite">{{ i18n.t({ th: 'โปรดโทรแจ้งเหตุทันที', en: 'Please call for help now' }) }}</h1>
          <p>{{ i18n.t({ th: 'SOS ยังเปิดอยู่ ถ้ามีเจ้าหน้าที่รับจะแจ้งให้ทราบทันที', en: 'Your SOS is still open — we will tell you as soon as an officer accepts' }) }}</p>
        </header>
        <div class="sos-body">
          <app-call-buttons [big]="true" />
          <p class="note"><span class="dot live"></span>{{ i18n.t({ th: 'ยังรอเจ้าหน้าที่รับเรื่องอยู่เบื้องหลัง', en: 'Still waiting for an officer in the background' }) }}</p>
        </div>
        @if (display.advancedMode()) {
          <div class="adv-grid">
            <div><span>{{ i18n.t({ th: 'รหัส SOS', en: 'SOS ID' }) }}</span><b class="mono">{{ id() }}</b></div>
            <div><span>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</span><b class="mono">{{ sos()?.status ?? '—' }}</b></div>
            <div><span>{{ i18n.t({ th: 'ส่งเมื่อ', en: 'Sent' }) }}</span><b class="mono">{{ sos()?.created_at ? exact(sos()!.created_at) : '—' }}</b></div>
          </div>
        }
      } @else {
        <header class="sos-head">
          <span class="pill">{{ i18n.t({ th: 'SOS ส่งแล้ว · บ้านเลขที่ ', en: 'SOS sent · house ' }) }}{{ sos()?.box?.house_no }}</span>
          <h1 aria-live="polite">
            {{ st === 'zone' ? i18n.t({ th: 'กำลังหาเจ้าหน้าที่…', en: 'Finding an officer…' }) : i18n.t({ th: 'กำลังแจ้งทั้งหน่วยงาน…', en: 'Alerting the whole agency…' }) }}
          </h1>
          <p class="timer">{{ time() }}</p>
          <p>
            {{ st === 'zone'
              ? i18n.t({ th: 'ไม่ต้องปิดหน้านี้ จะแจ้งทันทีเมื่อมีคนรับ', en: 'Keep this page open — we will tell you when someone accepts' })
              : i18n.t({ th: 'เจ้าหน้าที่ในโซนยังไม่รับ ระบบส่งต่อให้ทุกคนในหน่วยงานแล้ว', en: 'No zone officer yet — sent to everyone in the agency' }) }}
          </p>
        </header>

        @if (display.advancedMode()) {
          <div class="adv-grid">
            <div><span>{{ i18n.t({ th: 'รหัส SOS', en: 'SOS ID' }) }}</span><b class="mono">{{ id() }}</b></div>
            <div><span>{{ i18n.t({ th: 'ขั้น', en: 'Stage' }) }}</span><b class="mono">{{ st === 'zone' ? '1' : '2' }}/3</b></div>
            <div><span>{{ i18n.t({ th: 'ผ่านมา', en: 'Elapsed' }) }}</span><b class="mono">{{ time() }}</b></div>
          </div>
          @if (sos()?.created_at) {
            <p class="adv-line mono">{{ i18n.t({ th: 'ส่ง ', en: 'sent ' }) }}{{ exact(sos()!.created_at) }} · {{ i18n.t({ th: 'เปลี่ยนขั้น ', en: 'stage ' }) }}{{ exact(sos()!.stage_changed_at) }}</p>
          }
        }

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
        </div>
      }

      <footer class="sos-foot">
        @if (st !== 'call_yourself') {
          <p class="muted small center">{{ i18n.t({ th: 'ฉุกเฉิน โทรได้ทันทีไม่ต้องรอ', en: 'Emergency? Call now, no need to wait' }) }}</p>
          <app-call-buttons />
        }
        <a class="btn secondary" [routerLink]="url('H10')" [queryParams]="{ id: id() }">{{ i18n.t({ th: 'ยกเลิก SOS', en: 'Cancel SOS' }) }}</a>
      </footer>
      }
    </div>
  `,
  styles: `
    .link-lost {
      margin: 0;
      padding: 12px 16px;
      background: #fff;
      color: var(--sos);
      font-weight: 800;
      text-align: center;
      border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    }
    /* OwnSosWait_E */
    .easy-sos {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      padding: 40px 24px 24px;
      text-align: center;
      flex: 1;
      /* พื้นแดงเต็มพื้นที่ — เดิมข้อความ/ปุ่มขาวไปอยู่บนพื้นสว่างจนมองไม่เห็น */
      background: var(--sos-bg);
      color: var(--sos-fg);
      h1 {
        font-size: 2rem;
        line-height: 1.35;
        margin: 0;
      }
      p {
        font-size: 1.25rem;
        line-height: 1.5;
        margin: 0;
        color: rgb(255 255 255 / 95%);
      }
      app-call-buttons {
        inline-size: 100%;
        margin-block-start: auto;
      }
    }
    .pulse {
      display: grid;
      place-items: center;
      inline-size: 120px;
      block-size: 120px;
      border-radius: 50%;
      background: rgb(255 255 255 / 20%);
      i {
        inline-size: 70px;
        block-size: 70px;
        border-radius: 50%;
        background: #fff;
      }
    }
    .easy-cancel {
      inline-size: 100%;
      min-block-size: 60px;
      border: 2px solid rgb(255 255 255 / 75%);
      background: transparent;
      color: #fff;
      font-size: 1.25rem;
    }
    .adv-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-inline: 16px;
      div {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px 8px;
        border-radius: var(--radius-sm);
        background: rgb(255 255 255 / 14%);
      }
      span { font-size: 0.6875rem; opacity: 0.85; }
      b { font-size: 0.8125rem; }
    }
    .adv-line {
      margin: 0 16px;
      font-size: 0.6875rem;
      text-align: center;
      opacity: 0.85;
      overflow-wrap: break-word;
    }
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
      inline-size: 26px;
      block-size: 26px;
      border-radius: 50%;
      border: 1.5px solid currentColor;
      font-size: 0.8125rem;
      font-weight: 700;
    }
    li.now .num {
      background: var(--sos-bg);
      border-color: var(--sos-bg);
      color: var(--sos-fg);
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
export class SosWaiting {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(OwnerApi);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  /** ?id=<sos id> */
  readonly id = input<string>('');
  protected readonly sos = signal<Sos | null>(null);
  protected readonly linkOk = signal(true);
  private readonly now = signal(Date.now());
  private readonly elapsed = computed(() => (this.now(), this.sos() ? secondsSince(this.sos()!.created_at) : 0));
  protected readonly time = computed(() => mmss(this.elapsed()));
  protected readonly toCall = computed(() => Math.max(0, STAGE_CALL_AT - this.elapsed()));

  protected exact(iso: string): string {
    return bkkClock(iso);
  }

  constructor() {
    // ไม่มี ?id (เช่น เปิดลิงก์เก่า) → ไม่มี SOS ให้ติดตาม กลับหน้าหลัก
    queueMicrotask(() => {
      if (!this.id()) void this.router.navigateByUrl(screenUrl('H03'), { replaceUrl: true });
    });
    pollSos(
      this.api,
      () => this.id(),
      (s) => {
        this.sos.set(s);
        this.now.set(Date.now());
        // มีคนรับ → H11 · ปิด/ยกเลิกแล้ว → หน้าผล / หน้าหลัก
        if (s.status === 'accepted') void this.router.navigate([screenUrl('H11')], { queryParams: { id: s.id }, replaceUrl: true });
        else if (s.status === 'closed') void this.router.navigate([screenUrl('H11-b')], { queryParams: { id: s.id }, replaceUrl: true });
        else if (s.status === 'cancelled') void this.router.navigateByUrl(screenUrl('H03'), { replaceUrl: true });
      },
      (ok) => this.linkOk.set(ok),
    );
  }
}

// ── H08 · บ้านยังไม่มีเจ้าหน้าที่ ─────────────────────────────────

@Component({
  selector: 'app-sos-no-officer',
  imports: [RouterLink, CallButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sos-page">
      <header class="sos-head">
        <h1>{{ i18n.t({ th: 'โทรแจ้งเหตุทันที', en: 'Call for help now' }) }}</h1>
        <p>{{ i18n.t({ th: 'บ้านนี้ยังไม่มีเจ้าหน้าที่ดูแล ระบบส่งต่อให้ใครไม่ได้', en: 'No officer covers this house yet, so the SOS cannot be passed on' }) }}</p>
      </header>
      <div class="sos-body">
        <app-call-buttons [big]="true" />
        @if (display.advancedMode()) {
          <div class="card adv-only adv-note">
            <strong>{{ i18n.t({ th: 'เหตุที่ SOS ส่งไม่ได้', en: 'Why the SOS cannot be sent' }) }}</strong>
            <p>{{ i18n.t({ th: 'บ้านนี้ไม่อยู่ในโซนของหน่วยงานใด ระบบจึงไม่ได้สร้างเคส SOS', en: 'This house is not in any agency zone, so no SOS case was created.' }) }}</p>
            <a class="btn secondary" [routerLink]="url('H16')">{{ i18n.t({ th: 'ดูหน่วยงานใกล้บ้าน', en: 'See agencies near you' }) }}</a>
          </div>
        }
        <p class="muted small center easy-hide">{{ i18n.t({ th: 'ระบบบันทึกเหตุนี้ไว้แล้ว ผู้ดูแลระบบจะเห็น', en: 'This event is recorded and the admin will see it' }) }}</p>
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
    .adv-note {
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: start;
      font-size: 0.8125rem;
      line-height: 1.6;
    }
  `,
})
export class SosNoOfficer {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  protected readonly url = screenUrl;
}

// ── H10 · ยืนยันยกเลิก ─────────────────────────────────────────

@Component({
  selector: 'app-sos-cancel',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sheet-backdrop sos-dim">
      <p class="behind">{{ i18n.t({ th: 'กำลังหาเจ้าหน้าที่…', en: 'Finding an officer…' }) }}</p>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <h2 id="cancel-title">{{ i18n.t({ th: 'ยกเลิก SOS ใช่ไหม?', en: 'Cancel your SOS?' }) }}</h2>
        <p class="muted small easy-hide">{{ i18n.t({ th: 'เลือกเหตุผล ระบบจะแจ้งเจ้าหน้าที่ให้ทราบว่ายกเลิกแล้ว', en: 'Pick a reason — officers will be told it is cancelled' }) }}</p>
        @if (display.advancedMode() && id()) {
          <p class="muted small">{{ i18n.t({ th: 'กรุณาแจ้งเจ้าหน้าที่ว่าเคสนี้ถูกยกเลิกแล้ว', en: 'Please let the officer know this case is cancelled' }) }}</p>
        }
        <button type="button" class="btn secondary option" (click)="cancel('safe')">
          <app-icon name="shield" [size]="20" />{{ i18n.t({ th: 'ปลอดภัยแล้ว', en: 'I am safe now' }) }}
        </button>
        <button type="button" class="btn secondary option" (click)="cancel('mistake')">
          <app-icon name="alert" [size]="20" />{{ i18n.t({ th: 'กดผิด', en: 'Pressed by mistake' }) }}
        </button>
        @if (failed()) {
          <p class="danger-text small" role="alert">{{ i18n.t({ th: 'ยกเลิกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t cancel — try again' }) }}</p>
        }
        <a class="btn" [routerLink]="url('H09')" [queryParams]="{ id: id() }">{{ i18n.t({ th: 'ไม่ยกเลิก รอเจ้าหน้าที่ต่อ', en: 'Keep waiting for an officer' }) }}</a>
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
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(OwnerApi);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  readonly id = input<string>('');
  protected readonly failed = signal(false);

  /** POST /sos/:id/cancel → แจ้งเจ้าหน้าที่ทุกคนที่ได้รับ (ปิดไปแล้วก็กลับหน้าหลักเหมือนกัน) */
  protected async cancel(reason: 'safe' | 'mistake'): Promise<void> {
    this.failed.set(false);
    try {
      await this.api.cancelSos(this.id(), reason);
    } catch (err) {
      if ((err as { status?: number }).status !== 409) {
        this.failed.set(true);
        return;
      }
    }
    void this.router.navigateByUrl(screenUrl('H03'), { replaceUrl: true });
  }
}

// ── H11 · มีเจ้าหน้าที่รับแล้ว ───────────────────────────────────

@Component({
  selector: 'app-sos-accepted',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sos-page">
      <header class="sos-head ok">
        <span class="check"><app-icon name="check" [size]="30" /></span>
        <h1>{{ i18n.t({ th: 'มีเจ้าหน้าที่รับแล้ว', en: 'An officer accepted' }) }}</h1>
        <p>{{ i18n.t({ th: 'เจ้าหน้าที่รับเรื่องของคุณแล้ว โทรหาได้ถ้าต้องการบอกรายละเอียด', en: 'An officer has taken your case — call them if you need to give details' }) }}</p>
      </header>
      @if (!linkOk()) {
        <p class="link-lost" role="alert">{{ i18n.t({ th: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ — โทรแจ้งเหตุเองทันที: 191 / 1669', en: 'Cannot reach the server — call for help yourself now: 191 / 1669' }) }}</p>
      }
      <div class="sos-body">
        <section class="card officer">
          <span class="icon-bubble danger"><app-icon name="user" [size]="20" /></span>
          <span>
            <strong>{{ sos()?.accepted_by?.display_name }}</strong>
            <span class="muted small block">{{ sos()?.accepted_by?.agency_name }}</span>
          </span>
        </section>
        @if (sos()?.accepted_by?.phone; as phone) {
          <a class="btn" [href]="'tel:' + phone">{{ i18n.t({ th: 'โทรหาเจ้าหน้าที่ ', en: 'Call the officer ' }) }}{{ phone }}</a>
        }
        @if (display.easyMode()) {
          <p class="tip easy-only">{{ i18n.t({ th: 'ระหว่างรอ อยู่ในที่ปลอดภัย ล็อกประตู และเปิดไฟหน้าบ้านไว้ให้เจ้าหน้าที่หาบ้านเจอ', en: 'While you wait, stay safe, lock the door and keep the porch light on so they can find you.' }) }}</p>
        }
        @if (display.advancedMode()) {
          <section class="card adv-card adv-only">
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'ส่ง SOS', en: 'SOS sent' }) }}</dt><dd>{{ sos()?.created_at ? exact(sos()!.created_at) : '—' }}</dd>
              <dt>{{ i18n.t({ th: 'รับเรื่อง', en: 'Accepted' }) }}</dt><dd>{{ sos()?.accepted_by?.at ? exact(sos()!.accepted_by!.at) : '—' }}</dd>
              <dt>{{ i18n.t({ th: 'รับภายใน', en: 'Accepted within' }) }}</dt><dd>{{ acceptedWithin() }}</dd>
            </dl>
          </section>
        }
        <p class="muted small center">{{ i18n.t({ th: 'เบอร์โทรเห็นได้เฉพาะตอน SOS เปิดอยู่', en: 'The number is only shown while the SOS is open' }) }}</p>
        <p class="note"><span class="dot"></span>{{ i18n.t({ th: 'เมื่อเจ้าหน้าที่ปิดเรื่อง จะแจ้งให้ทราบ', en: 'You will be notified when the officer closes it' }) }}</p>
      </div>
      <footer class="sos-foot">
        <a class="btn secondary" [routerLink]="url('H10')" [queryParams]="{ id: id() }">{{ i18n.t({ th: 'ยกเลิก SOS', en: 'Cancel SOS' }) }}</a>
      </footer>
    </div>
  `,
  styles: `
    .link-lost {
      margin: 0;
      padding: 12px 16px;
      background: #fff;
      color: var(--sos);
      font-weight: 800;
      text-align: center;
    }
    .check {
      display: grid;
      place-items: center;
      inline-size: 56px;
      block-size: 56px;
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
    .tip {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.6;
      color: var(--text-muted);
      text-align: center;
    }
    .adv-card {
      font-size: 0.875rem;
    }
  `,
})
export class SosAccepted {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(OwnerApi);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  readonly id = input<string>('');
  protected readonly sos = signal<Sos | null>(null);
  protected readonly linkOk = signal(true);

  protected exact(iso: string): string {
    return bkkClock(iso);
  }

  protected acceptedWithin(): string {
    const s = this.sos();
    if (!s?.accepted_by) return '—';
    return mmss(Math.max(0, Math.round((new Date(s.accepted_by.at).getTime() - new Date(s.created_at).getTime()) / 1000)));
  }

  constructor() {
    pollSos(this.api, () => this.id(), (s) => {
      this.sos.set(s);
      if (s.status === 'closed') void this.router.navigate([screenUrl('H11-b')], { queryParams: { id: s.id }, replaceUrl: true });
      else if (s.status === 'cancelled') void this.router.navigateByUrl(screenUrl('H03'), { replaceUrl: true });
    }, (ok) => this.linkOk.set(ok));
  }
}

// ── H11-b · ปิดเรื่องแล้ว ────────────────────────────────────────

@Component({
  selector: 'app-sos-closed',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sos-page closed">
      <div class="sos-body">
        <span class="check"><app-icon name="check" [size]="30" /></span>
        <h1 class="center">{{ i18n.t({ th: 'ปิดเรื่องแล้ว', en: 'SOS closed' }) }}</h1>
        @if (failed()) {
          <section class="card stack" role="alert">
            <strong>{{ i18n.t({ th: 'โหลดสรุปเหตุการณ์ไม่ได้', en: 'Could not load the SOS summary' }) }}</strong>
            <span class="muted small">{{ i18n.t({ th: 'เชื่อมต่อไม่ได้ — ลองอีกครั้ง', en: 'No connection — try again' }) }}</span>
            <button type="button" class="btn secondary" (click)="load()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Try again' }) }}</button>
          </section>
        } @else {
        @if (toAccept(); as m) {
          <p class="muted small center">{{ i18n.t({ th: 'ใช้เวลาจนมีคนรับ ', en: 'Time until accepted: ' }) }}{{ m }}</p>
        }
        <section class="card stack">
          <div>
            <p class="muted small">{{ i18n.t({ th: 'ดูแลโดย', en: 'Handled by' }) }}</p>
            <strong>{{ sos()?.accepted_by?.display_name }} · {{ sos()?.accepted_by?.agency_name }}</strong>
          </div>
          <div class="divider"></div>
          <div>
            <p class="muted small">{{ i18n.t({ th: 'หมายเหตุจากเจ้าหน้าที่', en: 'Note from the officer' }) }}</p>
            <p>{{ sos()?.close_note }}</p>
          </div>
        </section>
        @if (display.advancedMode()) {
          <section class="card adv-only">
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'ส่ง SOS', en: 'SOS sent' }) }}</dt><dd>{{ sos()?.created_at ? exact(sos()!.created_at) : '—' }}</dd>
              <dt>{{ i18n.t({ th: 'รับเรื่อง', en: 'Accepted' }) }}</dt><dd>{{ sos()?.accepted_by?.at ? exact(sos()!.accepted_by!.at) : '—' }}</dd>
            </dl>
          </section>
        }
        }
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
      inline-size: 64px;
      block-size: 64px;
      margin-block-start: 24px;
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
      block-size: 1px;
      background: var(--line);
    }
  `,
})
export class SosClosed implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(OwnerApi);
  private readonly router = inject(Router);
  readonly id = input<string>('');
  protected readonly sos = signal<Sos | null>(null);
  protected readonly failed = signal(false);

  protected exact(iso: string): string {
    return bkkClock(iso);
  }

  protected readonly toAccept = computed(() => {
    const s = this.sos();
    if (!s?.accepted_by) return null;
    return mmss(Math.max(0, Math.round((new Date(s.accepted_by.at).getTime() - new Date(s.created_at).getTime()) / 1000)));
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.failed.set(false);
    try {
      this.sos.set(await this.api.sos(this.id()));
    } catch {
      this.failed.set(true);
    }
  }

  protected home(): void {
    void this.router.navigateByUrl(screenUrl('H03'));
  }
}
