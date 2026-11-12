import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { AdminApi } from '../core/admin-api';
import { I18n, type Tr } from '../core/i18n';
import { Icon } from './icon';
import { QrImage } from './qr-image';

/** เวลาที่ QR อยู่บนจอ — พอสำหรับติดตั้ง แล้วล้างรหัสลับออกจากหน่วยความจำ */
export const SETUP_QR_TTL_MS = 120_000;

/**
 * ลิงก์สำหรับ QR ตั้งค่าตู้ — มือถือต่อ Wi-Fi MAILBOX-xxxxxx แล้วสแกน:
 * หน้า portal ของบอร์ดอ่าน fragment (#) แล้วกรอก url / box / secret ให้
 * - ใช้ fragment เท่านั้น (ไม่ใช่ query string) → รหัสลับไม่ถูกส่งไปที่บอร์ดและไม่เข้า log
 * - ทุกค่า encodeURIComponent
 * - URL บอร์ดคงที่ตามคู่มือ §5 (SoftAP ของตู้อยู่ที่ 192.168.4.1 เสมอ)
 */
export function setupQrLink(boxId: string, secret: string, serverUrl: string): string {
  const query = `box=${encodeURIComponent(boxId)}&secret=${encodeURIComponent(secret)}&url=${encodeURIComponent(serverUrl.trim().replace(/\/+$/, ''))}`;
  return `http://192.168.4.1/#${query}`;
}

/**
 * ปุ่ม "QR ตั้งค่าตู้" สำหรับช่าง (D04 · T01):
 * ดึงรหัสลับด้วย revealSecret() เดิม (บันทึกการเปิดดูที่หลังบ้านแล้ว) แล้วสร้าง QR ชั่วคราว
 * - ไม่เก็บถาวร: แสดงเฉพาะตอนกด · ปิดได้ · หายเองใน 2 นาที · ซ่อนตอนพิมพ์
 * - ไม่ได้เพิ่ม endpoint ใหม่และไม่เขียนรหัสลับลงที่อื่น
 */
@Component({
  selector: 'app-box-setup-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, QrImage],
  template: `
    @if (link(); as l) {
      <div class="stack setup" role="group" [attr.aria-label]="i18n.t({ th: 'QR ตั้งค่าตู้', en: 'Box setup QR' })">
        <p class="setup-warn">⚠️ {{ i18n.t({ th: 'QR นี้เท่ากับรหัสลับ ห้ามถ่ายภาพหรือส่งต่อ', en: 'This QR equals the device secret — do not photograph or share it' }) }}</p>
        <div class="qr-box">
          <app-qr-image [text]="l" [label]="i18n.t({ th: 'QR ตั้งค่าตู้ ', en: 'Setup QR ' }) + boxId()" />
        </div>
        <p class="muted small">{{ i18n.t({ th: 'สแกนด้วยมือถือที่ต่อ Wi-Fi ของตู้อยู่แล้ว — หน้า portal จะกรอก URL เซิร์ฟเวอร์ รหัสตู้ และรหัสลับให้เอง', en: 'Scan with the phone already on the box Wi-Fi — the portal fills in the server URL, box ID and secret.' }) }}</p>
        <p class="muted small">{{ i18n.t({ th: 'จะซ่อนเองใน 2 นาที', en: 'Hides by itself in 2 minutes' }) }}</p>
        <button type="button" class="btn secondary" (click)="hide()">{{ i18n.t({ th: 'ปิด QR', en: 'Close QR' }) }}</button>
      </div>
    } @else {
      <div class="stack">
        <button type="button" class="btn secondary" [disabled]="busy()" (click)="show()">
          <app-icon name="scan" [size]="18" />
          {{ busy() ? i18n.t({ th: 'กำลังสร้าง QR…', en: 'Creating the QR…' }) : i18n.t({ th: 'QR ตั้งค่าตู้', en: 'Box setup QR' }) }}
        </button>
        <p class="muted small">{{ i18n.t({ th: 'สำหรับช่างติดตั้ง: ให้มือถือที่ต่อ Wi-Fi ของตู้แล้วสแกน QR นี้ ระบบจะกรอก URL รหัสตู้ และรหัสลับให้เอง (ไม่ต้องพิมพ์)', en: 'For the installer: scan this QR with the phone already on the box Wi-Fi — the server URL, box ID and secret are filled in (no typing).' }) }}</p>
        @if (error(); as e) {
          <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .setup {
      align-items: center;
      text-align: center;
    }
    .setup-warn {
      inline-size: 100%;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: var(--sos-bg);
      color: var(--sos-fg);
      font-size: 0.875rem;
      font-weight: 700;
    }
    .qr-box {
      inline-size: min(100%, 240px);
      padding: 10px;
      border-radius: var(--radius-sm);
      background: var(--qr-bg);
    }
    /* ห้ามติดไปกับใบพิมพ์โดยไม่ตั้งใจ — QR นี้เท่ากับรหัสลับ */
    @media print {
      :host {
        display: none;
      }
    }
  `,
})
export class BoxSetupQr {
  readonly boxId = input.required<string>();
  /** URL เซิร์ฟเวอร์ที่ตู้ใช้ = origin + apiBase ของหลังบ้าน (ไม่ฮาร์ดโค้ดโดเมน) */
  readonly serverUrl = input.required<string>();

  private readonly api = inject(AdminApi);
  protected readonly i18n = inject(I18n);
  protected readonly link = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<Tr | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** นับคำขอ — ปิด/เปลี่ยนตู้ระหว่างรอผลแล้วต้องไม่เอารหัสลับของคำขอเก่ามาแสดง */
  private request = 0;

  constructor() {
    // เปลี่ยนตู้ระหว่างอยู่หน้าเดิม → ล้าง QR ของตู้ก่อนทันที (ห้ามเอารหัสลับข้ามตู้)
    effect(() => {
      this.boxId();
      untracked(() => this.hide());
    });
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  protected async show(): Promise<void> {
    const id = this.boxId();
    if (!id || this.busy()) return;
    const token = ++this.request;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { device_secret } = await this.api.revealSecret(id);
      if (token !== this.request || this.boxId() !== id) return;
      this.clearTimer();
      this.link.set(setupQrLink(id, device_secret, this.serverUrl()));
      this.timer = setTimeout(() => this.hide(), SETUP_QR_TTL_MS);
    } catch {
      if (token === this.request) this.error.set({ th: 'เปิดดูรหัสลับไม่สำเร็จ — ลองอีกครั้ง', en: 'Could not load the device secret — try again' });
    } finally {
      this.busy.set(false);
    }
  }

  protected hide(): void {
    this.request++;
    this.clearTimer();
    this.link.set(null);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
