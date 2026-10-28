import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminApi, type AdminBoxDetail, type AdminBoxRow } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { minutesAgo } from '../../core/owner-api';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { BoxTest } from '../../shared/box-test';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { QrScanner } from '../../shared/qr-scanner';
import { Steps, type Step } from '../../shared/steps';
import { seenText } from './admin-boxes';

// ช่างติดตั้งตู้ — ใช้บัญชีแอดมิน (api.md §10) · ขั้นตอนตาม SMMB_ขั้นตอนการใช้งานแต่ละคน.md "ช่าง : ติดตั้งตู้"
// ใช้ข้อมูลจริงของตู้ (GET /admin/boxes/:id ทุก 3 วิ) — ขั้นถัดไปเปิดเองเมื่อตู้ทำสำเร็จจริง
// หน้าตั้ง Wi-Fi อยู่ในตู้เอง (192.168.4.1 — เฟิร์มแวร์ทำ) แอปนี้บอกวิธี + รอดูว่าตู้ต่อเน็ตได้แล้ว

const INSTALL_STEPS: Step[] = [
  { title: { th: 'ติดตู้ + แผงโซลาร์', en: 'Mount the box + solar panel' }, sub: { th: 'รับแดด ไม่มีเงาบัง · ติด QR หน้าตู้ · เก็บ QR สำรอง + QR เปิดใช้ตู้ไว้ในตู้', en: 'Full sun, no shade · front QR outside · backup + activation QR inside' } },
  { title: { th: 'ตั้ง Wi-Fi (2.4 GHz)', en: 'Set up Wi-Fi (2.4 GHz)' }, sub: { th: 'ต่อ Wi-Fi ของตู้ แล้วเปิด 192.168.4.1 · ต่อได้แล้วตู้ปี๊บ + ขึ้นที่นี่เอง', en: 'Join the box Wi-Fi, open 192.168.4.1 · once online the box beeps and shows up here' } },
  { title: { th: 'สแกนทดสอบ QR หน้าตู้ + QR สำรอง', en: 'Test-scan the front + backup QR' }, sub: { th: 'ด้วยกล้องมือถือ — เช็กว่าเป็น QR ของตู้นี้', en: 'With the phone camera — checks they belong to this box' } },
  { title: { th: 'ทดสอบปลุกตู้ + กล้อง', en: 'Test wake + camera' }, sub: { th: 'ตู้ปี๊บ เปิดกล้อง แล้วอ่าน QR บนจอมือถือ', en: 'The box beeps, opens its camera and reads the QR on the phone' } },
  { title: { th: 'ส่งต่อเจ้าของบ้าน', en: 'Hand over to the owner' }, sub: { th: 'สมัคร + ผูกตู้ต่อหน้าช่าง', en: 'They sign up + bind the box with you there' } },
];

/** ตู้ติดต่อเซิร์ฟเวอร์ในช่วงนี้ = ต่อเน็ตได้ (boot / report / long-poll) */
const ONLINE_WITHIN_MIN = 20;

/** ชื่อ Wi-Fi ที่ตู้ปล่อยตอนตั้งค่า — 6 ตัวท้ายของรหัสตู้ (เฟิร์มแวร์ใช้รูปแบบเดียวกัน · โปรโตคอล §8) */
export const apName = (boxId: string) => `MAILBOX-${boxId.replace(/\D/g, '').slice(-6).padStart(6, '0')}`;

// ── T01 · เช็กลิสต์ติดตั้ง ───────────────────────────────────

@Component({
  selector: 'app-tech-checklist',
  imports: [RouterLink, PageHeader, Steps, BoxTest, QrScanner, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ช่าง · ', en: 'Technician · ' }) + (id() ?? '')" [title]="i18n.t({ th: 'ติดตั้งตู้', en: 'Install a mailbox' })" [back]="url('D01')" />

    @if (!id()) {
      <div class="stack">
        <p class="muted">{{ i18n.t({ th: 'เลือกตู้ที่จะติดตั้ง (ตู้ที่ยังไม่ผูกเจ้าของ)', en: 'Pick the box to install (not yet bound)' }) }}</p>
        <nav class="list">
          @for (b of freeBoxes(); track b.id) {
            <a class="row" [routerLink]="url('T01')" [queryParams]="{ id: b.id }">
              <span class="icon-bubble"><app-icon name="box" [size]="20" /></span>
              <span class="grow">
                <strong>{{ b.id }}</strong>
                <span class="muted small block">{{ i18n.t(seen(b.last_seen_at)) }}</span>
              </span>
              <app-icon name="chevronRight" [size]="18" />
            </a>
          } @empty {
            <p class="row muted">{{ i18n.t({ th: 'ไม่มีตู้ว่าง — ลงทะเบียนตู้ใหม่ที่หน้า "ตู้"', en: 'No free boxes — register one on the Boxes page' }) }}</p>
          }
        </nav>
        <a class="btn secondary" [routerLink]="url('D03')">{{ i18n.t({ th: 'ไปหน้าตู้ทั้งหมด', en: 'All boxes' }) }}</a>
      </div>
    } @else if (box(); as b) {
      <div class="stack grow">
        <app-steps [steps]="steps" [current]="step()" />

        <p class="status" [class.ok]="online()" role="status">
          @if (online()) {
            {{ i18n.t({ th: 'ตู้ต่อเน็ตแล้ว', en: 'Box is online' }) }}
            · {{ i18n.t(seen(b.last_seen_at)) }}
            @if (b.battery) {
              · {{ i18n.t({ th: 'แบต ', en: 'battery ' }) }}{{ b.battery.pct }}%{{ b.battery.charging ? i18n.t({ th: ' ชาร์จอยู่', en: ' charging' }) : '' }}
            }
            @if (rssi() !== null) {
              · Wi-Fi {{ rssi() }} dBm
            }
          } @else {
            {{ i18n.t({ th: 'ตู้ยังไม่ต่อเน็ต', en: 'The box is not online yet' }) }}
          }
        </p>
        @if (online() && rssi() !== null && rssi()! < -80) {
          <p class="warn-text small">{{ i18n.t({ th: 'สัญญาณ Wi-Fi อ่อน — ย้ายจุดติดตั้ง หรือเพิ่มตัวขยายสัญญาณ', en: 'Weak Wi-Fi — move the box or add an extender' }) }}</p>
        }

        <div class="stack push-end">
          @switch (step()) {
            @case (0) {
              <button type="button" class="btn" (click)="mounted.set(true)">{{ i18n.t({ th: 'ติดตั้งเสร็จแล้ว', en: 'Mounted' }) }}</button>
            }
            @case (1) {
              <div class="info-box">
                <ol>
                  <li>{{ i18n.t({ th: 'ต่อไฟตู้ — ตู้ยังไม่รู้จัก Wi-Fi บ้าน จะปล่อยสัญญาณชื่อ', en: 'Power the box — with no home Wi-Fi it broadcasts' }) }} <strong>{{ ap() }}</strong></li>
                  <li>{{ i18n.t({ th: 'มือถือต่อ Wi-Fi นั้น → หน้าตั้งค่าเด้งเอง (ไม่เด้ง: ปิดเน็ตมือถือ แล้วเปิด 192.168.4.1)', en: 'Join it on the phone → the setup page opens (if not: turn off mobile data, open 192.168.4.1)' }) }}</li>
                  <li>{{ i18n.t({ th: 'เลือก Wi-Fi บ้าน (2.4 GHz) → ใส่รหัส → เชื่อมต่อ', en: 'Pick the home Wi-Fi (2.4 GHz) → password → connect' }) }}</li>
                  <li>{{ i18n.t({ th: 'มือถือกลับมาใช้เน็ตปกติ แล้วรอหน้านี้ขึ้น "ตู้ต่อเน็ตแล้ว" (ตู้ปี๊บ 1 ครั้ง)', en: 'Switch the phone back to normal internet and wait for “Box is online” (the box beeps once)' }) }}</li>
                </ol>
              </div>
              <p class="muted small center" role="status">{{ i18n.t({ th: 'กำลังรอตู้ต่อเน็ต… (เช็กทุก 3 วิ)', en: 'Waiting for the box… (checking every 3 s)' }) }}</p>
              <div class="two">
                <a class="btn secondary" [routerLink]="url('T02')" [queryParams]="{ id: b.id }">{{ i18n.t({ th: 'หน้าตั้งค่าในตู้หน้าตาแบบนี้', en: 'What the box page looks like' }) }}</a>
                <a class="btn secondary" [routerLink]="url('T02-c')" [queryParams]="{ id: b.id }">{{ i18n.t({ th: 'ตู้ต่อไม่ได้', en: 'It won’t connect' }) }}</a>
              </div>
            }
            @case (2) {
              @if (scanning(); as which) {
                <app-qr-scanner class="scanner" (scanned)="onScan(which, $event.text)" (failed)="scanning.set(null)" />
                <button type="button" class="btn secondary" (click)="scanning.set(null)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
              } @else {
                <div class="two">
                  <button type="button" class="btn" [class.tested]="scanned().front" (click)="scanning.set('front')">
                    {{ scanned().front ? '✓ ' : '' }}{{ i18n.t({ th: 'สแกน QR หน้าตู้', en: 'Scan front QR' }) }}
                  </button>
                  <button type="button" class="btn secondary" [class.tested]="scanned().backup" (click)="scanning.set('backup')">
                    {{ scanned().backup ? '✓ ' : '' }}{{ i18n.t({ th: 'สแกน QR สำรอง', en: 'Scan backup QR' }) }}
                  </button>
                </div>
                @if (scanError(); as e) {
                  <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
                }
              }
            }
            @case (3) {
              <app-box-test [boxId]="b.id" (finished)="wakeDone($event.status === 'passed')" />
              <p class="muted small center">{{ i18n.t({ th: 'ไม่ผ่าน: เช็กเลนส์ / ระยะ 15–30 ซม. / แสง · ยังไม่ได้แจ้งทีมฮาร์ดแวร์', en: 'Failing: check the lens / 15–30 cm / light · still failing: tell the hardware team' }) }}</p>
            }
            @case (4) {
              <p class="info-box muted">
                {{ i18n.t({ th: 'ให้เจ้าของบ้านสมัครในแอป แล้วสแกน QR เปิดใช้ตู้ (อยู่ในตู้) — รหัสใต้ QR: ', en: 'The owner signs up and scans the activation QR (inside the box) — code under it: ' }) }}<strong>{{ activateCode() }}</strong>
              </p>
              <p class="muted small center" role="status">{{ i18n.t({ th: 'รอเจ้าของบ้านผูกตู้…', en: 'Waiting for the owner to bind the box…' }) }}</p>
            }
            @default {
              <p class="status ok center" role="status">
                {{ i18n.t({ th: 'ติดตั้งเสร็จ · ผูกกับบ้าน ', en: 'Installed · bound to house ' }) }}{{ b.house_no }}
              </p>
              <a class="btn" [routerLink]="url('D04')" [queryParams]="{ id: b.id }">{{ i18n.t({ th: 'ดูรายละเอียดตู้', en: 'Box details' }) }}</a>
              <p class="muted small center">{{ i18n.t({ th: 'ต่อไป: หัวหน้าหน่วยงานเพิ่มบ้านนี้เข้าโซน ตู้จึงจะมีเวลาตรวจ', en: 'Next: an agency head adds this house to a zone so the box gets patrol hours' }) }}</p>
            }
          }
        </div>
      </div>
    } @else {
      <p class="muted">{{ notFound() ? i18n.t({ th: 'ไม่พบตู้นี้', en: 'Box not found' }) : i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
    }
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .status {
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      background: var(--icon-bg);
      color: var(--text-muted);
      font-weight: 700;
    }
    .status.ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .two .btn {
      font-size: 0.9375rem;
    }
    .btn.tested {
      background: var(--ok-bg);
      color: var(--ok);
      box-shadow: none;
    }
    .scanner {
      display: block;
      aspect-ratio: 3 / 4;
      max-height: 60vh;
      border-radius: var(--radius);
      overflow: hidden;
    }
    ol {
      margin: 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .center {
      text-align: center;
    }
  `,
})
export class TechChecklist {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly steps = INSTALL_STEPS;
  protected readonly seen = seenText;
  readonly id = input<string>();

  protected readonly box = signal<AdminBoxDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly freeBoxes = signal<AdminBoxRow[]>([]);
  protected readonly mounted = signal(false);
  protected readonly scanning = signal<'front' | 'backup' | null>(null);
  protected readonly scanned = signal({ front: false, backup: false });
  protected readonly scanError = signal<Tr | null>(null);
  protected readonly wakeOk = signal(false);

  protected readonly ap = computed(() => apName(this.id() ?? ''));
  protected readonly online = computed(() => {
    const m = minutesAgo(this.box()?.last_seen_at ?? null);
    return m !== null && m <= ONLINE_WITHIN_MIN;
  });
  /** สัญญาณ Wi-Fi จากรายงานล่าสุดที่มี rssi */
  protected readonly rssi = computed(() => {
    const r = this.box()?.reports.find((x) => typeof x.body['rssi'] === 'number');
    return r ? (r.body['rssi'] as number) : null;
  });
  protected readonly activateCode = computed(() => this.box()?.qr.find((q) => q.slot === 'activate')?.print_code ?? '-');

  /** ขั้นปัจจุบัน — คิดจากของจริง (ตู้ต่อเน็ต · สแกนแล้ว · ปลุกผ่าน · ผูกแล้ว) */
  protected readonly step = computed(() => {
    const b = this.box();
    if (!b) return 0;
    if (b.bound) return 5;
    if (!this.mounted() && !this.online()) return 0;
    if (!this.online()) return 1;
    const s = this.scanned();
    if (!s.front || !s.backup) return 2;
    if (!this.wakeOk()) return 3;
    return 4;
  });

  constructor() {
    const timer = setInterval(() => void this.load(), 3000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.box.set(null);
        this.notFound.set(false);
        this.mounted.set(false);
        this.scanned.set({ front: false, backup: false });
        this.wakeOk.set(false);
        void this.load();
      });
      if (!id) void this.api.boxes().then((r) => this.freeBoxes.set(r.data.filter((b) => !b.bound)));
    });
  }

  private async load(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      this.box.set(await this.api.box(id));
    } catch {
      if (!this.box()) this.notFound.set(true);
    }
  }

  /** QR ที่สแกนต้องเป็นลิงก์ของช่องนั้นของตู้นี้ (เทียบกับ url ที่เซิร์ฟเวอร์ออกให้) */
  protected onScan(which: 'front' | 'backup', text: string): void {
    this.scanning.set(null);
    const b = this.box();
    const slot = which === 'front' ? 1 : 2;
    const mine = b?.qr.find((q) => q.slot === slot && q.status === 'active');
    if (mine && text.trim() === mine.url) {
      this.scanError.set(null);
      this.scanned.update((s) => ({ ...s, [which]: true }));
      this.toast.show(which === 'front' ? { th: 'QR หน้าตู้ถูกต้อง', en: 'Front QR OK' } : { th: 'QR สำรองถูกต้อง', en: 'Backup QR OK' });
      return;
    }
    const other = b?.qr.find((q) => q.url === text.trim());
    this.scanError.set(
      other
        ? { th: 'เป็น QR ของตู้นี้แต่คนละช่อง — ตรวจว่าติดใบถูกที่', en: 'This box’s QR but the wrong slot — check which sticker went where' }
        : { th: 'ไม่ใช่ QR ของตู้นี้ — ตรวจว่าหยิบชุดสติกเกอร์ถูกตู้', en: 'Not this box’s QR — check you used the right sticker set' },
    );
  }

  protected wakeDone(ok: boolean): void {
    if (ok) {
      this.wakeOk.set(true);
      this.toast.show({ th: 'ตู้ตื่นและอ่าน QR ได้', en: 'The box woke and read the QR' });
    }
  }
}

// ── T02 · หน้าตั้ง Wi-Fi ของตู้ (หน้านี้มาจากตู้ — เฟิร์มแวร์ทำ) ───────

@Component({
  selector: 'app-tech-wifi',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo-tools">
      {{ i18n.t({ th: 'ตัวอย่างหน้าที่ตู้แสดงเอง (192.168.4.1) — ทีมฮาร์ดแวร์ทำในเฟิร์มแวร์ ไม่ใช่หน้าในแอปนี้', en: 'Preview of the page served by the box (192.168.4.1) — built in firmware, not this app' }) }}
    </div>
    <app-page-header [caption]="'192.168.4.1 · ' + ap()" [title]="i18n.t({ th: 'ตั้ง Wi-Fi ให้ตู้', en: 'Set up box Wi-Fi' })" [back]="back()" />
    <form class="stack grow" (submit)="$event.preventDefault(); connect()">
      <p class="card joined">
        <strong>{{ i18n.t({ th: 'มือถือต่อ ', en: 'Phone is on ' }) }}{{ ap() }}{{ i18n.t({ th: ' อยู่', en: '' }) }}</strong>
        <span class="small">{{ i18n.t({ th: 'หน้านี้มาจากตู้ ไม่ต้องใช้เน็ต', en: 'This page comes from the box — no internet needed' }) }}</span>
      </p>
      <fieldset class="nets">
        <legend class="section-title">{{ i18n.t({ th: 'เลือก Wi-Fi บ้าน', en: 'Pick the home Wi-Fi' }) }}</legend>
        <div class="list">
          @for (n of networks; track n.ssid) {
            <label class="row" [class.off]="!n.ok">
              <input type="radio" name="ssid" [value]="n.ssid" [disabled]="!n.ok" [checked]="ssid() === n.ssid" (change)="ssid.set(n.ssid)" />
              <span class="icon-bubble"><app-icon name="wifi" [size]="20" /></span>
              <span class="grow">
                <strong>{{ n.ssid }}</strong>
                <span class="muted small block">{{ n.band }} · {{ i18n.t(n.ok ? { th: 'สัญญาณดี', en: 'good signal' } : { th: 'ตู้ใช้ไม่ได้', en: 'not supported' }) }}</span>
              </span>
              @if (!n.ok) {
                <span class="chip">{{ i18n.t({ th: 'ใช้ไม่ได้', en: 'Not usable' }) }}</span>
              }
            </label>
          }
        </div>
      </fieldset>
      <label class="field">
        <span>{{ i18n.t({ th: 'รหัส Wi-Fi', en: 'Wi-Fi password' }) }}</span>
        <input type="password" autocomplete="off" [value]="password()" (input)="password.set($any($event.target).value)" />
      </label>
      <p class="muted small">{{ i18n.t({ th: 'ตู้ลองต่อ → ได้: ปี๊บ 1 ครั้ง ปิดสัญญาณ ' + ap() + ' แล้วติดต่อเซิร์ฟเวอร์ · ไม่ได้: ปี๊บยาว 1 + สั้น 2 แล้วกลับมาหน้านี้', en: 'The box tries → success: 1 beep, ' + ap() + ' disappears, it calls the server · failure: long + 2 short beeps, back to this page' }) }}</p>
      <button type="submit" class="btn push-end" [disabled]="!ssid() || !password()">{{ i18n.t({ th: 'เชื่อมต่อ', en: 'Connect' }) }}</button>
    </form>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .row .grow {
      min-width: 0;
    }
    .block {
      display: block;
    }
    .demo-tools {
      margin-bottom: 4px;
    }
    .joined {
      display: flex;
      flex-direction: column;
      background: var(--brand-lighter);
      color: var(--brand);
      box-shadow: none;
    }
    .nets {
      border: 0;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      legend {
        float: left;
        width: 100%;
        padding: 0;
        margin: 0 4px 8px;
      }
    }
    .row {
      cursor: pointer;
      input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
    }
    .row:has(input:checked) {
      background: var(--brand-lighter);
    }
    .row.off {
      cursor: default;
      opacity: 0.7;
    }
  `,
})
export class TechWifi {
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  readonly id = input<string>();
  protected readonly ap = computed(() => apName(this.id() ?? 'BX-000000'));
  protected readonly networks = [
    { ssid: 'HOME_2.4G', band: '2.4 GHz', ok: true },
    { ssid: 'HOME_5G', band: '5 GHz', ok: false },
  ];
  protected readonly ssid = signal<string | null>('HOME_2.4G');
  protected readonly password = signal('');
  protected readonly back = computed(() => screenUrl('T01') + (this.id() ? `?id=${this.id()}` : ''));

  protected connect(): void {
    if (!this.ssid() || !this.password()) return;
    void this.router.navigateByUrl(this.back());
  }
}

// ── T02-b · ฟังเสียงตู้ (แทนไฟสถานะ — ตู้ใช้ Buzzer) ─────────────────

@Component({
  selector: 'app-tech-lights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink],
  template: `
    <div class="stack grow">
      <div class="result">
        <span class="big-icon danger"><app-icon name="wifi" [size]="34" /></span>
        <h1>{{ i18n.t({ th: 'ฟังเสียงตู้', en: 'Listen to the box' }) }}</h1>
        <p class="muted">{{ i18n.t({ th: 'ตู้ไม่มีไฟสถานะ ใช้เสียงปี๊บบอก', en: 'The box has no status light — it beeps' }) }}</p>
      </div>
      <div class="info-box">
        <p>🔔 {{ i18n.t({ th: 'ปี๊บสั้น 1 ครั้ง = ต่อเน็ตได้ / พร้อมสแกน', en: '1 short beep = online / ready to scan' }) }}</p>
        <p>🔔🔔 {{ i18n.t({ th: 'ปี๊บสั้น 2 ครั้ง = อ่าน QR ผ่าน', en: '2 short beeps = QR passed' }) }}</p>
        <p>🔔— {{ i18n.t({ th: 'ปี๊บยาว 1 ครั้ง = อ่านไม่ผ่าน ลองใหม่', en: '1 long beep = not read, try again' }) }}</p>
        <p>—🔔🔔 {{ i18n.t({ th: 'ปี๊บยาว 1 + สั้น 2 = ต่อเน็ต/เซิร์ฟเวอร์ไม่ได้', en: 'long + 2 short = no network / server' }) }}</p>
      </div>
      <div class="stack push-end">
        <a class="btn" [routerLink]="url('T01')">{{ i18n.t({ th: 'กลับเช็กลิสต์', en: 'Back to checklist' }) }}</a>
        <a class="btn secondary" [routerLink]="url('T02-c')">{{ i18n.t({ th: 'ตู้ต่อไม่ได้', en: 'It won’t connect' }) }}</a>
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .info-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
  `,
})
export class TechLights {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
}

// ── T02-c · ตู้ต่อ Wi-Fi ไม่ได้ ──────────────────────────────

@Component({
  selector: 'app-tech-wifi-failed',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack grow">
      <div class="result">
        <span class="big-icon danger" aria-hidden="true">!</span>
        <h1>{{ i18n.t({ th: 'ตู้ต่อ Wi-Fi ไม่ได้', en: 'The box could not join Wi-Fi' }) }}</h1>
      </div>
      <div class="info-box">
        <strong>{{ i18n.t({ th: 'เช็กทีละข้อ', en: 'Check one by one' }) }}</strong>
        <ol>
          <li>{{ i18n.t({ th: 'รหัส Wi-Fi ถูกไหม (ตัวพิมพ์เล็ก/ใหญ่)', en: 'Is the password right? (upper/lower case)' }) }}</li>
          <li>{{ i18n.t({ th: 'เป็น Wi-Fi 2.4 GHz ไหม (5 GHz ใช้ไม่ได้)', en: 'Is it 2.4 GHz Wi-Fi? (5 GHz will not work)' }) }}</li>
          <li>{{ i18n.t({ th: 'สัญญาณถึงตู้ไหม: ย้ายจุดติดตั้ง หรือเพิ่มตัวขยายสัญญาณ', en: 'Does the signal reach? Move the box or add an extender' }) }}</li>
          <li>{{ i18n.t({ th: 'ต่อ Wi-Fi ได้แต่หน้านี้ไม่ขึ้น "ออนไลน์": รหัสตู้/รหัสลับในบอร์ดตรงกับหลังบ้านไหม (ดู "คำขอที่ลายเซ็นไม่ผ่าน" ในหน้ารายละเอียดตู้)', en: 'Wi-Fi works but never “online”: does the board’s box id/secret match admin? (see “Rejected box requests” on the box page)' }) }}</li>
          <li>{{ i18n.t({ th: 'ยังไม่ได้: แจ้งทีมฮาร์ดแวร์', en: 'Still failing: tell the hardware team' }) }}</li>
        </ol>
      </div>
      <p class="muted small center">{{ i18n.t({ th: 'ต่อไม่ได้ ตู้จะกลับเข้าโหมดตั้งค่าเอง — ต่อ Wi-Fi ของตู้ใหม่อีกครั้ง', en: 'After a failure the box goes back to setup mode — join its Wi-Fi again' }) }}</p>
      <div class="stack push-end">
        <a class="btn" [routerLink]="url('T01')" [queryParams]="id() ? { id: id() } : {}">{{ i18n.t({ th: 'กลับเช็กลิสต์', en: 'Back to checklist' }) }}</a>
        @if (id()) {
          <a class="btn secondary" [routerLink]="url('D04')" [queryParams]="{ id: id() }">{{ i18n.t({ th: 'ดูรายละเอียดตู้', en: 'Box details' }) }}</a>
        }
      </div>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    ol {
      margin: 6px 0 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `,
})
export class TechWifiFailed {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  readonly id = input<string>();
}
