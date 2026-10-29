import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, type Tr } from '../core/i18n';
import { PushBlockedError, PushNotifications, type PushBlocker } from '../core/push-notifications';
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
    @if (on()) {
      <div class="card status ok">
        <strong>{{ i18n.t({ th: '🔔 เครื่องนี้รับแจ้งเตือนอยู่', en: '🔔 This device gets notifications' }) }}</strong>
        <small>{{ i18n.t({ th: 'มือถือ/คอมเครื่องอื่นที่ล็อกอินบัญชีนี้ ต้องเปิดแยกเครื่องละครั้ง', en: 'Every other phone or computer you sign in on needs to turn it on separately' }) }}</small>
        <div class="row-btns">
          <button type="button" class="btn secondary" [disabled]="busy()" (click)="test()">{{ i18n.t({ th: 'ส่งทดสอบ', en: 'Send a test' }) }}</button>
          <button type="button" class="btn secondary" [disabled]="busy()" (click)="turnOff()">{{ i18n.t({ th: 'ปิดบนเครื่องนี้', en: 'Turn off here' }) }}</button>
        </div>
      </div>
    } @else {
      <div class="card status warn">
        <strong>{{ i18n.t({ th: '🔕 เครื่องนี้ยังไม่ได้รับแจ้งเตือน', en: '🔕 This device is not getting notifications' }) }}</strong>
        <small>{{ i18n.t({ th: 'จะไม่รู้เมื่อมีเจ้าหน้าที่มาตรวจ ของมาส่ง หรือ SOS จนกว่าจะเปิด', en: 'You will not know about patrol checks, deliveries or SOS until you turn it on' }) }}</small>
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
          }
        }
      </div>
    }
  `,
  styles: `
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
        border-color: var(--brand);
      }
    }
    .row-btns {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
  `,
})
export class PushStatus {
  protected readonly i18n = inject(I18n);
  private readonly push = inject(PushNotifications);
  private readonly session = inject(Session);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly busy = signal(false);
  /** ค่านี้เปลี่ยนเมื่อกดอนุญาต/ปิด (ไม่มี signal ของ Notification.permission) */
  private readonly tick = signal(0);
  protected readonly on = computed(() => this.session.me()?.push.subscribed === true);
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

  protected async turnOn(): Promise<void> {
    await this.run(async () => {
      await this.push.enable();
      this.toast.show({ th: 'เปิดแจ้งเตือนแล้ว', en: 'Notifications are on' });
    });
  }

  protected async turnOff(): Promise<void> {
    await this.run(async () => {
      await this.push.disable();
      this.toast.show({ th: 'ปิดแจ้งเตือนบนเครื่องนี้แล้ว', en: 'Notifications are off on this device' });
    });
  }

  protected async test(): Promise<void> {
    await this.run(async () => {
      const sent = await this.push.sendTest();
      const msg: Tr = sent > 0
        ? { th: 'ส่งแจ้งเตือนทดสอบแล้ว — รอสักครู่', en: 'Test sent — it should arrive in a moment' }
        : { th: 'ส่งไม่ถึงเครื่องนี้ ลองปิดแล้วเปิดใหม่', en: 'It did not reach this device — turn it off and on again' };
      this.toast.show(msg);
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
      await this.session.refresh();
    } catch (error) {
      this.toast.show(
        error instanceof PushBlockedError
          ? { th: 'เบราว์เซอร์นี้ยังเปิดแจ้งเตือนไม่ได้ — ดูคำอธิบายในกรอบ', en: 'Notifications are blocked here — see the box for help' }
          : { th: 'ทำไม่สำเร็จ ลองอีกครั้ง', en: 'That did not work. Try again.' },
      );
    } finally {
      this.tick.update((n) => n + 1);
      this.busy.set(false);
    }
  }
}
