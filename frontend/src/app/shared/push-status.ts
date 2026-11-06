import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiError } from '../core/api';
import { I18n, type Tr } from '../core/i18n';
import { isBrave, PushBlockedError, PushNotifications, type DiagStep, type PushBlocker } from '../core/push-notifications';
import { Session } from '../core/session';
import { Toast } from '../core/toast';
import { screenUrl } from '../screens/registry';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * สถานะแจ้งเตือนของ "เครื่องนี้" + ปุ่มเปิด/ปิด/ทดสอบ — ใช้หน้าแจ้งเตือนและตั้งค่าของเจ้าของบ้าน
 * (subscription ผูกกับ session ของเครื่องนี้ เปลี่ยนเครื่อง/ล็อกอินใหม่ต้องเปิดอีกครั้ง)
 */
@Component({
  selector: 'app-push-status',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (on() && compact()) {
      <!-- เปิดแล้ว: ไม่ต้องมีแถบให้กดเปิดอีก -->
    } @else if (on()) {
      <div class="card status ok">
        <strong>{{ i18n.t({ th: '🔔 เครื่องนี้รับแจ้งเตือนอยู่', en: '🔔 This device gets notifications' }) }}</strong>
        <small>{{ i18n.t({ th: 'มือถือ/คอมพิวเตอร์เครื่องอื่นที่เข้าสู่ระบบบัญชีนี้ ต้องเปิดแยกเครื่องละครั้ง', en: 'Every other phone or computer you sign in on needs to turn it on separately' }) }}</small>
        <div class="row-btns">
          <button type="button" class="btn secondary" [disabled]="busy()" (click)="test()">{{ i18n.t({ th: 'ส่งทดสอบ', en: 'Send a test' }) }}</button>
          <button type="button" class="btn secondary" [disabled]="busy() || diagBusy()" (click)="diagnose()">{{ i18n.t({ th: 'ตรวจแจ้งเตือน (ละเอียด)', en: 'Check notifications (detailed)' }) }}</button>
          @if (!required()) {
            <button type="button" class="btn secondary" [disabled]="busy()" (click)="turnOff()">{{ i18n.t({ th: 'ปิดบนเครื่องนี้', en: 'Turn off here' }) }}</button>
          }
        </div>
      </div>
    } @else {
      <div class="card status warn">
        <strong>{{ i18n.t({ th: '🔕 เครื่องนี้ยังไม่ได้รับแจ้งเตือน', en: '🔕 This device is not getting notifications' }) }}</strong>
        @if (required()) {
          <small>{{ i18n.t({ th: 'เจ้าหน้าที่ต้องเปิดไว้ จึงจะใช้งานและรับ SOS ได้', en: 'Officers must keep this on — otherwise the app is locked and you will miss SOS alerts' }) }}</small>
        } @else {
          <small>{{ i18n.t({ th: 'จะไม่รู้เมื่อมีเจ้าหน้าที่มาตรวจ ของมาส่ง หรือ SOS จนกว่าจะเปิด', en: 'You will not know about patrol checks, deliveries or SOS until you turn it on' }) }}</small>
        }
        @switch (blocker()) {
          @case ('line-browser') {
            <small>{{ i18n.t({ th: 'เปิดผ่าน LINE ไม่ได้ — คัดลอกลิงก์ไปเปิดใน Safari หรือ Chrome', en: 'Not possible inside LINE — copy the link and open it in Safari or Chrome' }) }}</small>
            <a class="btn secondary" [routerLink]="url('A01')">{{ i18n.t({ th: 'ดูวิธีเปิดในเบราว์เซอร์', en: 'How to open in a browser' }) }}</a>
          }
          @case ('ios-not-installed') {
            <small>{{ i18n.t({ th: 'iPhone ต้องเพิ่มเว็บลงหน้าจอหลักก่อน แล้วเปิดจากไอคอน', en: 'On iPhone, add the site to your Home Screen first, then open it from the icon' }) }}</small>
            <a class="btn" [routerLink]="url('A02')">{{ i18n.t({ th: 'ดูวิธีติดตั้ง', en: 'How to install' }) }}</a>
          }
          @case ('denied') {
            <small>{{ deniedHelp() }}</small>
          }
          @case ('unsupported') {
            <small>{{ i18n.t({ th: 'เบราว์เซอร์นี้ไม่รองรับแจ้งเตือน (หรือเปิดผ่านหน้าทดสอบ) — ใช้ Chrome บน Android หรือ Safari บน iPhone ที่ติดตั้งแล้ว', en: 'This browser does not support notifications — use Chrome on Android, or Safari on an installed iPhone app' }) }}</small>
          }
          @default {
            <button type="button" class="btn" [disabled]="busy()" (click)="turnOn()">{{ i18n.t({ th: 'เปิดแจ้งเตือน', en: 'Turn on notifications' }) }}</button>
            <small>{{ i18n.t({ th: 'เบราว์เซอร์จะถามสิทธิ์ ให้กด "อนุญาต"', en: 'Your browser will ask — tap “Allow”' }) }}</small>
            <button type="button" class="btn secondary" [disabled]="busy() || diagBusy()" (click)="diagnose()">{{ i18n.t({ th: 'ตรวจแจ้งเตือน (ละเอียด)', en: 'Check notifications (detailed)' }) }}</button>
          }
        }
      </div>
    }
    @if (diag().length) {
      <div class="card diag" role="status">
        <strong>{{ i18n.t({ th: 'ผลการตรวจ', en: 'Check results' }) }}</strong>
        @for (s of diag(); track $index) {
          <div class="diag-step" [class.bad]="!s.ok">
            <span>{{ s.ok ? '✅' : '❌' }} {{ i18n.t(s.label) }}</span>
            @if (s.detail) { <small>{{ s.detail }}</small> }
            @if (!s.ok && s.fix) { <small class="fix">{{ i18n.t(s.fix) }}</small> }
          </div>
        }
        @if (diagBusy()) { <small>{{ i18n.t({ th: 'กำลังตรวจ…', en: 'Checking…' }) }}</small> }
      </div>
    }
  `,
  styles: `
    .diag {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-block-start: 8px;
    }
    .diag-step {
      display: flex;
      flex-direction: column;
      gap: 2px;
      small {
        color: var(--text-muted);
        overflow-wrap: anywhere;
      }
      .fix {
        color: var(--brand);
      }
    }
    .status {
      display: flex;
      flex-direction: column;
      gap: 6px;
      small {
        color: var(--text-muted);
      }
      &.ok {
        border-color: var(--ok);
      }
      &.warn {
        border-color: var(--warn);
      }
    }
    .row-btns {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-block-start: 4px;
    }
  `,
})
export class PushStatus implements OnInit {
  protected readonly i18n = inject(I18n);
  /** เจ้าหน้าที่/หัวหน้า: ต้องเปิดไว้เสมอ (ไม่มีปุ่มปิด) */
  readonly required = input(false);
  /** ชื่อเครื่องที่ส่งให้ server (device_label) */
  readonly deviceLabel = input<string>();
  /** เปิดอยู่แล้ว → ไม่แสดงอะไร (ใช้หน้าตั้งค่า ที่มีเมนู "การแจ้งเตือน" แยกอยู่แล้ว) */
  readonly compact = input(false);
  private readonly push = inject(PushNotifications);
  private readonly session = inject(Session);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly busy = signal(false);
  protected readonly diag = signal<DiagStep[]>([]);
  protected readonly diagBusy = signal(false);
  /** ค่านี้เปลี่ยนเมื่อกดอนุญาต/ปิด (ไม่มี signal ของ Notification.permission) */
  private readonly tick = signal(0);
  /** ผลตรวจฝั่งเบราว์เซอร์ (null = ยังไม่รู้) — server บอกว่าเปิด แต่เบราว์เซอร์ถูกปิดสิทธิ์/ลบ subscription ไปแล้ว ต้องถือว่ายังไม่เปิด */
  private readonly deviceOk = signal<boolean | null>(null);
  protected readonly on = computed(() => this.session.me()?.push.subscribed === true && this.deviceOk() !== false);

  async ngOnInit(): Promise<void> {
    this.deviceOk.set(await this.push.isActive().catch(() => false));
  }
  protected readonly blocker = computed<PushBlocker | null>(() => {
    this.tick();
    return this.push.blocker();
  });

  protected deniedHelp(): string {
    const ios = isIos();
    return this.i18n.t(
      ios
        ? { th: 'เคยกดไม่อนุญาตไว้ → ตั้งค่า (Settings) → การแจ้งเตือน → Smart Mailbox → เปิด "อนุญาตการแจ้งเตือน"', en: 'You blocked it earlier → Settings → Notifications → Smart Mailbox → turn on Allow Notifications' }
        : { th: 'เคยกดไม่อนุญาตไว้ → แตะไอคอนกุญแจข้างช่องที่อยู่เว็บ → การแจ้งเตือน → อนุญาต แล้วโหลดหน้าใหม่', en: 'You blocked it earlier → tap the lock icon by the address bar → Notifications → Allow, then reload' },
    );
  }

  /** เปิด → ตรวจว่าเปิดได้จริง (เบราว์เซอร์ + เซิร์ฟเวอร์) → ส่งทดสอบ 1 ครั้งให้เห็นว่าเด้งจริง · ไม่ผ่าน = แถบยังอยู่ให้กดใหม่ */
  protected async turnOn(): Promise<void> {
    await this.run(async () => {
      await this.push.enable(this.deviceLabel());
      await this.session.refresh();
      const ok = (await this.push.isActive().catch(() => false)) && this.session.me()?.push.subscribed === true;
      this.deviceOk.set(ok);
      if (!ok) {
        this.toast.show({ th: 'ยังเปิดแจ้งเตือนไม่สำเร็จ ลองอีกครั้ง', en: 'Notifications are not on yet — try again' });
        return;
      }
      const r = await this.push.sendTest().catch(() => null);
      this.toast.show(
        r && r.sent > 0
          ? { th: 'เปิดแจ้งเตือนแล้ว · ส่งแจ้งเตือนทดสอบมาที่เครื่องนี้แล้ว', en: 'Notifications are on · a test was sent to this device' }
          : { th: 'เปิดแจ้งเตือนแล้ว แต่ส่งทดสอบไม่สำเร็จ — กด "ส่งทดสอบ" ในหน้าการแจ้งเตือน', en: 'Notifications are on, but the test failed — tap “Send a test” on the notifications page' },
      );
    });
  }

  protected async diagnose(): Promise<void> {
    if (this.diagBusy()) return;
    this.diagBusy.set(true);
    this.diag.set([]);
    try {
      this.diag.set(await this.push.diagnose((s) => this.diag.set(s)));
    } finally {
      this.diagBusy.set(false);
    }
  }

  protected async turnOff(): Promise<void> {
    await this.run(async () => {
      await this.push.disable();
      this.deviceOk.set(false);
      this.toast.show({ th: 'ปิดแจ้งเตือนบนเครื่องนี้แล้ว', en: 'Notifications are off on this device' });
    });
  }

  protected async test(): Promise<void> {
    await this.run(async () => {
      const r = await this.push.sendTest();
      const msg: Tr =
        r.sent > 0
          ? { th: 'ส่งแจ้งเตือนทดสอบแล้ว — รอสักครู่ (ถ้าไม่เห็น ดูว่าเปิดสิทธิ์แจ้งเตือนของเบราว์เซอร์/แอปไว้)', en: 'Test sent — it should arrive in a moment (if not, check the browser/app notification permission)' }
          : r.removed > 0
            ? { th: 'การลงทะเบียนแจ้งเตือนของเครื่องนี้หมดอายุแล้ว — ปิดแล้วเปิดใหม่', en: 'This device’s subscription expired — turn notifications off and on again' }
            : r.failed > 0
              ? { th: `เซิร์ฟเวอร์ส่งไม่สำเร็จ (${r.failure_status ?? 'เครือข่าย'}) — ปิดแล้วเปิดใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบ`, en: `The server could not deliver it (${r.failure_status ?? 'network'}) — turn it off and on; if it persists, tell the admin` }
              : { th: 'เครื่องนี้ยังไม่ได้ผูกกับบัญชี — ปิดแจ้งเตือนแล้วเปิดใหม่', en: 'This device is not linked to your account yet — turn notifications off and on again' };
      this.toast.show(msg);
    });
  }

  /** บอกสาเหตุจริง (ตัดสินจาก code/สถานะ ไม่ดูข้อความ) — ไม่ใช่แค่ "ลองอีกครั้ง" */
  private failureText(error: unknown): Tr {
    const e = apiError(error);
    const tail = (e.code ?? (e.status ? `HTTP ${e.status}` : ''));
    if (e.code === 'PUSH_UNAVAILABLE') return { th: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าแจ้งเตือน (VAPID) — แจ้งผู้ดูแลระบบ', en: 'The server has no push keys configured (VAPID) — tell the admin' };
    if (e.status === 0 && error instanceof HttpErrorResponse) return { th: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Can’t reach the server — check your connection' };
    if (e.status === 401) return { th: 'หมดเวลาเข้าสู่ระบบ — เข้าสู่ระบบใหม่แล้วลองอีกครั้ง', en: 'Your session expired — sign in again' };
    if (e.status >= 400) return { th: `เซิร์ฟเวอร์ไม่รับ (${tail}) — ปิดแล้วเปิดใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบ`, en: `The server refused it (${tail}) — turn it off and on; if it persists, tell the admin` };
    // ไม่ใช่ error จากเซิร์ฟเวอร์ → มักเป็นฝั่งเบราว์เซอร์ (service worker ยังไม่พร้อม / push service ของเบราว์เซอร์ปฏิเสธ)
    const name = error instanceof Error ? error.name : 'unknown';
    if (isBrave()) return { th: 'Brave ยังไม่เปิดบริการแจ้งเตือน → พิมพ์ brave://settings/privacy ในช่องที่อยู่ → เปิด "Use Google Services for push messaging" → ปิดแล้วเปิด Brave ใหม่ → กดเปิดแจ้งเตือนอีกครั้ง', en: 'Brave has push turned off → open brave://settings/privacy → turn on “Use Google Services for push messaging” → restart Brave → try again' };
    return { th: `เบราว์เซอร์สมัครแจ้งเตือนไม่สำเร็จ (${name}) — โหลดหน้าใหม่ หรือล้างข้อมูลเว็บของไซต์นี้แล้วลองอีกครั้ง`, en: `The browser could not subscribe (${name}) — reload, or clear this site’s data, then try again` };
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
      await this.session.refresh();
    } catch (error) {
      this.toast.show(error instanceof PushBlockedError ? { th: 'เบราว์เซอร์นี้ยังเปิดแจ้งเตือนไม่ได้ — ดูคำอธิบายในกรอบ', en: 'Notifications are blocked here — see the box for help' } : this.failureText(error));
    } finally {
      this.tick.update((n) => n + 1);
      this.busy.set(false);
    }
  }
}
