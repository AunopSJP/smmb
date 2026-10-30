import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';

/** ทำไมเปิดแจ้งเตือนไม่ได้ — หน้าจอเลือกข้อความจากค่านี้ */
export type PushBlocker =
  | 'line-browser' // เปิดในเบราว์เซอร์ของ LINE → หน้า A01
  | 'ios-not-installed' // iPhone ยังไม่ได้เพิ่มลงหน้าจอหลัก → หน้า A02
  | 'unsupported' // เบราว์เซอร์ไม่รองรับ / service worker ปิด (ตอน dev)
  | 'denied'; // ผู้ใช้กดไม่อนุญาตไว้ → ต้องไปเปิดในตั้งค่าเบราว์เซอร์

/**
 * เปิด/ปิด Web Push ของเครื่องนี้ (api.md §3)
 * การแสดงแจ้งเตือนและการกดเปิดลิงก์ ทำโดย service worker ของ Angular (ngsw) — server ส่ง payload รูปแบบที่ ngsw รู้จัก
 */
@Injectable({ providedIn: 'root' })
export class PushNotifications {
  private readonly swPush = inject(SwPush);
  private readonly http = inject(HttpClient);

  /** null = เปิดได้ */
  blocker(): PushBlocker | null {
    const ua = navigator.userAgent;
    if (/\bLine\//i.test(ua)) return 'line-browser';
    const ios = /iPhone|iPad|iPod/.test(ua);
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (ios && !standalone) return 'ios-not-installed';
    if (!this.swPush.isEnabled || typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return null;
  }

  /** ขอสิทธิ์ → สมัครกับ push service → ส่ง subscription ให้ server (ผูกกับ session ของเครื่องนี้) */
  async enable(deviceLabel?: string): Promise<void> {
    const blocker = this.blocker();
    if (blocker) throw new PushBlockedError(blocker);
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new PushBlockedError('denied');
    }
    const sub = await this.subscription();
    await firstValueFrom(
      this.http.post('/api/v1/me/push/subscriptions', { ...sub.toJSON(), device_label: deviceLabel }),
    );
  }

  /** A03 ขอ permission ก่อนล็อกอิน · สร้าง subscription ไว้ แต่ยังไม่ส่งข้อมูลให้ server */
  async requestPermission(): Promise<void> {
    const blocker = this.blocker();
    if (blocker) throw new PushBlockedError(blocker);
    if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') {
      throw new PushBlockedError('denied');
    }
    await this.subscription();
  }

  /** เรียกหลังล็อกอินเพื่อผูก subscription เดิมกับ session ปัจจุบัน · ไม่มี subscription ก็ข้าม */
  async syncExisting(deviceLabel?: string): Promise<void> {
    const sub = await firstValueFrom(this.swPush.subscription);
    if (!sub) return;
    await firstValueFrom(
      this.http.post('/api/v1/me/push/subscriptions', { ...sub.toJSON(), device_label: deviceLabel }),
    );
  }

  async disable(): Promise<void> {
    const sub = await firstValueFrom(this.swPush.subscription);
    if (!sub) return;
    await firstValueFrom(
      this.http.delete('/api/v1/me/push/subscriptions', { body: { endpoint: sub.endpoint } }),
    );
    await sub.unsubscribe();
  }

  /** ส่งแจ้งเตือนทดสอบถึงเครื่องนี้ (A03) — คืนผลละเอียดไว้บอกสาเหตุ */
  async sendTest(): Promise<PushTestResult> {
    const res = await firstValueFrom(this.http.post<Partial<PushTestResult>>('/api/v1/me/push/test', {}));
    return { sent: res.sent ?? 0, removed: res.removed ?? 0, failed: res.failed ?? 0, failure_status: res.failure_status };
  }

  private async subscription(): Promise<PushSubscription> {
    const existing = await firstValueFrom(this.swPush.subscription);
    if (existing) return existing;
    const { public_key } = await firstValueFrom(this.http.get<{ public_key: string }>('/api/v1/me/push/vapid-key'));
    return this.swPush.requestSubscription({ serverPublicKey: public_key });
  }
}

export interface PushTestResult {
  sent: number;
  removed: number;
  failed: number;
  failure_status?: number;
}

export class PushBlockedError extends Error {
  constructor(readonly reason: PushBlocker) {
    super(`push blocked: ${reason}`);
  }
}
