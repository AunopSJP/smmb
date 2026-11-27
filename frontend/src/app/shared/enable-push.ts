import { ChangeDetectionStrategy, Component, inject, input, model, type OnInit, signal } from '@angular/core';
import { I18n, type Tr } from '../core/i18n';
import { type PushBlocker, PushBlockedError, PushNotifications } from '../core/push-notifications';

const WHY: Record<PushBlocker, Tr> = {
  'line-browser': { th: 'เปิดในเบราว์เซอร์ของ LINE รับแจ้งเตือนไม่ได้ — เปิดลิงก์นี้ใน Safari หรือ Chrome', en: 'No notifications inside LINE — open this in Safari or Chrome' },
  'ios-not-installed': { th: 'iPhone ต้องเพิ่มลงหน้าจอหลักก่อน (แชร์ → เพิ่มไปยังหน้าจอหลัก) แล้วเปิดจากไอคอน', en: 'On iPhone, add the app to your Home Screen (Share → Add to Home Screen) and open it from the icon' },
  unsupported: { th: 'เบราว์เซอร์นี้เปิดแจ้งเตือนไม่ได้ ลองใช้ Chrome หรือ Safari', en: 'This browser can’t do notifications — try Chrome or Safari' },
  denied: { th: 'เคยกดไม่อนุญาตไว้ — เปิดสิทธิ์แจ้งเตือนในตั้งค่าเบราว์เซอร์', en: 'Notifications are blocked — allow them in the browser settings' },
};

/**
 * ปุ่มเปิดแจ้งเตือนในจังหวะที่ผู้ใช้กำลังรอผล (หน้ารออนุมัติ A11 · ผูกตู้สำเร็จ A09) — ข้ามได้
 * `active` บอกหน้าแม่ว่าเครื่องนี้รับแจ้งเตือนได้แล้วจริงไหม (ใช้เลือกข้อความ ห้ามสัญญาว่าจะแจ้งถ้ายังไม่เปิด)
 */
@Component({
  selector: 'app-enable-push',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (active()) {
      <p class="on" role="status">{{ i18n.t({ th: 'เปิดแจ้งเตือนบนเครื่องนี้แล้ว', en: 'Notifications are on for this device' }) }}</p>
    } @else {
      <button type="button" [class]="buttonClass()" [disabled]="busy()" (click)="enable()">{{ i18n.t(label()) }}</button>
      @if (error(); as e) {
        <p class="why" role="alert">{{ i18n.t(e) }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-self: stretch;
    }
    p {
      margin: 0;
      font-size: var(--fs-sm);
    }
    .on {
      font-weight: var(--fw-strong);
    }
  `,
})
export class EnablePush implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly push = inject(PushNotifications);
  readonly label = input<Tr>({ th: 'เปิดแจ้งเตือน', en: 'Turn on notifications' });
  readonly buttonClass = input('btn');
  readonly active = model(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<Tr | null>(null);

  async ngOnInit(): Promise<void> {
    this.active.set(await this.push.isActive().catch(() => false));
  }

  protected async enable(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.push.enable();
      this.active.set(true);
    } catch (err) {
      this.error.set(err instanceof PushBlockedError ? WHY[err.reason] : { th: 'เปิดแจ้งเตือนไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t turn on notifications — try again' });
    } finally {
      this.busy.set(false);
    }
  }
}
