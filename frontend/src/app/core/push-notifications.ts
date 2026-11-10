import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, timeout } from 'rxjs';
import type { Tr } from './i18n';

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

  /** เครื่องนี้รับแจ้งเตือนได้จริงไหม (ฝั่งเบราว์เซอร์): อนุญาตแล้ว + มี subscription อยู่ */
  async isActive(): Promise<boolean> {
    if (this.blocker() || Notification.permission !== 'granted') return false;
    return (await this.current()) !== null;
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

  /**
   * subscription ปัจจุบันของเครื่องนี้ (ไม่มี = null)
   * SwPush.subscription จะไม่ emit เลยถ้า service worker ไม่พร้อม/ไม่ทำงาน → firstValueFrom ค้างตลอดกาล
   * (เคยทำให้ล็อกอินสำเร็จแต่ไม่ไปหน้าถัดไป) จึงต้องมีเพดานเวลา
   */
  private async current(): Promise<PushSubscription | null> {
    if (!this.swPush.isEnabled) return null;
    // ถามเบราว์เซอร์ตรง ๆ (service worker ที่พร้อมแล้ว) — ไม่รอ stream ของ SwPush ที่อาจช้า/ไม่ emit
    // เดิมรอ stream แค่ 4 วิ แล้วนับว่า "ไม่มี subscription" → หน้าจอเด้งให้กดเปิดแจ้งเตือนซ้ำทั้งที่เปิดไว้แล้ว
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.ready) {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000))]);
      return reg ? await reg.pushManager.getSubscription() : null;
    }
    return Promise.race([firstValueFrom(this.swPush.subscription), new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000))]);
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
    const sub = await this.current();
    if (!sub) return;
    await firstValueFrom(
      this.http.post('/api/v1/me/push/subscriptions', { ...sub.toJSON(), device_label: deviceLabel }),
    );
  }

  async disable(): Promise<void> {
    const sub = await this.current();
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

  /**
   * ตรวจทีละขั้นว่าแจ้งเตือนขาดที่ไหน (ไว้ให้ผู้ใช้/ผู้ดูแลกดดู ไม่ต้องเปิด DevTools)
   * สิทธิ์ → service worker → subscription ในเบราว์เซอร์ → เซิร์ฟเวอร์รู้จักเครื่องนี้ → เซิร์ฟเวอร์ส่งได้ → service worker รับได้
   */
  async diagnose(onStep: (steps: DiagStep[]) => void): Promise<DiagStep[]> {
    const steps: DiagStep[] = [];
    const add = (s: DiagStep) => {
      steps.push(s);
      onStep([...steps]);
    };
    const blocker = this.blocker();

    // 1) เบราว์เซอร์ + สิทธิ์
    const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    add(
      !blocker && perm === 'granted'
        ? { ok: true, label: { th: 'เบราว์เซอร์อนุญาตแจ้งเตือน', en: 'The browser allows notifications' } }
        : {
            ok: false,
            label: { th: 'เบราว์เซอร์ยังไม่พร้อมรับแจ้งเตือน', en: 'The browser is not ready for notifications' },
            detail: `${blocker ?? 'permission'}=${perm}`,
            fix: blocker === 'denied' || perm === 'denied'
              ? { th: 'เคยกดไม่อนุญาตไว้ → เปิดสิทธิ์แจ้งเตือนของไซต์นี้ในตั้งค่าเบราว์เซอร์', en: 'You blocked it earlier — allow notifications for this site in the browser settings' }
              : blocker === 'ios-not-installed'
                ? { th: 'iPhone ต้องเพิ่มเว็บลงหน้าจอหลักแล้วเปิดจากไอคอน', en: 'On iPhone, add the site to your Home Screen and open it from the icon' }
                : blocker === 'line-browser'
                  ? { th: 'เปิดในเบราว์เซอร์ของ LINE ไม่ได้ ใช้ Safari หรือ Chrome', en: 'Not possible inside LINE — use Safari or Chrome' }
                  : { th: 'กดปุ่ม "เปิดแจ้งเตือน" แล้วกด อนุญาต', en: 'Tap “Turn on notifications” and choose Allow' },
          },
    );
    if (blocker) return steps;

    // 2) service worker
    let reg: ServiceWorkerRegistration | undefined;
    try {
      reg = await navigator.serviceWorker.getRegistration();
    } catch {
      reg = undefined;
    }
    const state = reg?.active?.state ?? (reg?.installing ? 'installing' : reg?.waiting ? 'waiting' : 'none');
    add(
      state === 'activated'
        ? { ok: true, label: { th: 'Service worker ทำงานอยู่', en: 'The service worker is running' }, detail: reg!.scope }
        : {
            ok: false,
            label: { th: 'Service worker ยังไม่ทำงาน', en: 'The service worker is not running' },
            detail: state,
            fix: { th: 'โหลดหน้าใหม่ แล้วรอประมาณ 30 วินาที จากนั้นกดตรวจอีกครั้ง · ถ้ายังไม่ได้ ให้ล้างข้อมูลเว็บของไซต์นี้ (Clear site data) แล้วเปิดใหม่', en: 'Reload and wait about 30 seconds, then check again · if it still fails, clear this site’s data and reopen' },
          },
    );

    // 3) subscription ในเบราว์เซอร์
    const sub = await this.current();
    add(
      sub
        ? { ok: true, label: { th: 'เครื่องนี้ลงทะเบียนกับ push service แล้ว', en: 'This device is registered with the push service' }, detail: new URL(sub.endpoint).host }
        : {
            ok: false,
            label: { th: 'เครื่องนี้ยังไม่ได้ลงทะเบียนกับ push service', en: 'This device is not registered with the push service' },
            fix: isBrave()
              ? { th: 'Brave: เปิดที่ brave://settings/privacy → เปิด "Use Google Services for push messaging" แล้วเปิดเบราว์เซอร์ใหม่ จากนั้นกด "เปิดแจ้งเตือน"', en: 'Brave: open brave://settings/privacy → turn on “Use Google Services for push messaging”, restart Brave, then tap “Turn on notifications”' }
              : { th: 'กด "เปิดแจ้งเตือน"', en: 'Tap “Turn on notifications”' },
          },
    );

    // 4) เซิร์ฟเวอร์
    let st: PushServerStatus | null = null;
    try {
      st = await firstValueFrom(this.http.get<PushServerStatus>('/api/v1/me/push/status'));
    } catch {
      st = null;
    }
    if (!st) {
      add({ ok: false, label: { th: 'ติดต่อเซิร์ฟเวอร์ไม่ได้', en: 'Cannot reach the server' }, fix: { th: 'ตรวจอินเทอร์เน็ตแล้วลองใหม่', en: 'Check your connection and try again' } });
      return steps;
    }
    const mine = st.subscriptions.find((x) => x.this_device);
    const serverOk = st.configured && st.keys_match !== false;
    add(
      !st.configured
        ? { ok: false, label: { th: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งกุญแจแจ้งเตือน (VAPID)', en: 'The server has no push keys (VAPID)' }, fix: { th: 'แจ้งผู้ดูแลระบบ', en: 'Tell the admin' } }
        : st.keys_match === false
          ? { ok: false, label: { th: 'กุญแจแจ้งเตือนของเซิร์ฟเวอร์ไม่เป็นคู่กัน', en: 'The server’s push keys do not match' }, fix: { th: 'แจ้งผู้ดูแลระบบ (ต้องสร้างกุญแจคู่ใหม่ แล้วทุกเครื่องเปิดแจ้งเตือนใหม่)', en: 'Tell the admin (a new key pair is needed; every device must turn it on again)' } }
          : mine?.usable
            ? { ok: true, label: { th: 'เซิร์ฟเวอร์รู้จักเครื่องนี้', en: 'The server knows this device' }, detail: mine.last_ok_at ? `ส่งสำเร็จล่าสุด ${new Date(mine.last_ok_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok' })}` : 'ยังไม่เคยส่งสำเร็จ' }
            : {
                ok: false,
                label: mine ? { th: 'การลงทะเบียนของเครื่องนี้หมดอายุ (เซสชันถูกเตะ/หมดอายุ)', en: 'This device’s registration expired (the session ended)' } : { th: 'เซิร์ฟเวอร์ยังไม่รู้จักเครื่องนี้', en: 'The server does not know this device yet' },
                fix: { th: 'กด "ปิดบนเครื่องนี้" แล้ว "เปิดแจ้งเตือน" ใหม่', en: 'Tap “Turn off here”, then “Turn on notifications”' },
              },
    );
    if (!serverOk || !mine?.usable) return steps;

    // 5–6) ส่งทดสอบ + รอให้ service worker รับ
    let received = false;
    const wait = this.swPush.isEnabled
      ? firstValueFrom(this.swPush.messages.pipe(timeout({ first: 9000 })))
          .then(() => (received = true))
          .catch(() => false)
      : Promise.resolve(false);
    const r = await this.sendTest().catch(() => null);
    add(
      r && r.sent > 0
        ? { ok: true, label: { th: 'เซิร์ฟเวอร์ส่งถึง push service แล้ว', en: 'The server handed it to the push service' } }
        : {
            ok: false,
            label: { th: 'เซิร์ฟเวอร์ส่งแจ้งเตือนไม่สำเร็จ', en: 'The server could not send the notification' },
            detail: r ? `sent=${r.sent} removed=${r.removed} failed=${r.failed} status=${r.failure_status ?? '-'}` : 'request failed',
            fix: r?.failure_status === 401 || r?.failure_status === 403
              ? { th: 'push service ปฏิเสธกุญแจ → แจ้งผู้ดูแลระบบ (กุญแจ VAPID ไม่ตรงกับที่เครื่องสมัครไว้) ลอง "ปิดแล้วเปิดใหม่"', en: 'The push service refused the key — tell the admin; try turning it off and on' }
              : { th: 'ลอง "ปิดแล้วเปิดใหม่" ถ้ายังไม่ได้แจ้งผู้ดูแลระบบ', en: 'Try turning it off and on; tell the admin if it persists' },
          },
    );
    if (!r || r.sent === 0) return steps;
    await wait;
    add(
      received
        ? { ok: true, label: { th: 'Service worker รับแจ้งเตือนแล้ว', en: 'The service worker received it' }, detail: 'ถ้าไม่เห็นเด้ง ดูว่าปิดโหมดห้ามรบกวน/ประหยัดแบตอยู่ไหม และเปิดสิทธิ์แจ้งเตือนของเบราว์เซอร์/แอปในตั้งค่าเครื่อง' }
        : {
            ok: false,
            label: { th: 'Service worker ไม่ได้รับแจ้งเตือนภายใน 9 วินาที', en: 'The service worker did not receive it within 9 seconds' },
            fix: { th: 'อินเทอร์เน็ตของเครื่องอาจบล็อก push (เช่น เครือข่ายองค์กร/VPN) หรือเบราว์เซอร์ถูกจำกัดพื้นหลัง · ลองสลับเป็นข้อมูลมือถือ และปิดโหมดประหยัดแบต', en: 'The network may block push (corporate network / VPN) or the browser is restricted in the background — try mobile data and turn off battery saver' },
          },
    );
    return steps;
  }

  private async subscription(): Promise<PushSubscription> {
    const { public_key } = await firstValueFrom(this.http.get<{ public_key: string }>('/api/v1/me/push/vapid-key'));
    const existing = await this.current();
    if (existing) {
      // subscription เก่าที่สร้างด้วยกุญแจ VAPID ชุดอื่น (เซิร์ฟเวอร์เปลี่ยนกุญแจ / เคยใช้กับ dev) → push service ตอบ 403 → สมัครใหม่ด้วยกุญแจปัจจุบัน
      if (sameKey(existing.options?.applicationServerKey, public_key)) return existing;
      await existing.unsubscribe().catch(() => undefined);
    }
    return this.swPush.requestSubscription({ serverPublicKey: public_key });
  }
}

/** กุญแจ VAPID (base64url ของเซิร์ฟเวอร์) ตรงกับ applicationServerKey ของ subscription ไหม · ไม่รู้ค่า = ถือว่าตรง (ไม่ทำลาย subscription ที่ใช้ได้) */
export function sameKey(actual: ArrayBuffer | null | undefined, expectedB64Url: string): boolean {
  if (!actual) return true;
  const pad = '='.repeat((4 - (expectedB64Url.length % 4)) % 4);
  const raw = atob((expectedB64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const a = new Uint8Array(actual);
  return a.length === raw.length && a.every((v, i) => v === raw.charCodeAt(i));
}

export interface PushServerStatus {
  configured: boolean;
  keys_match: boolean | null;
  subscriptions: { host: string; device_label: string | null; this_device: boolean; usable: boolean; last_ok_at: string | null; failed_count: number }[];
}

export interface DiagStep {
  ok: boolean;
  label: Tr;
  detail?: string;
  fix?: Tr;
}

export interface PushTestResult {
  sent: number;
  removed: number;
  failed: number;
  failure_status?: number;
}

/** Brave ปิดบริการ push ของ Google ไว้เป็นค่าเริ่มต้น → สมัครแจ้งเตือนไม่ได้จนกว่าจะเปิดในตั้งค่า */
export const isBrave = (): boolean => typeof navigator !== 'undefined' && !!(navigator as Navigator & { brave?: unknown }).brave;

export class PushBlockedError extends Error {
  constructor(readonly reason: PushBlocker) {
    super(`push blocked: ${reason}`);
  }
}
