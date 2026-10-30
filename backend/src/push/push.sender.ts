import { createECDH } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import type { Env } from '../config/env.js';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendOptions {
  ttlSec: number;
  urgency: 'low' | 'normal' | 'high';
}

/** ส่ง push 1 ครั้ง · ล้มเหลวให้โยน error ที่มี statusCode (404/410 = subscription ตายแล้ว) */
export interface PushSender {
  readonly enabled: boolean;
  readonly publicKey: string;
  send(target: PushTarget, payload: string, opts: PushSendOptions): Promise<void>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** กุญแจสาธารณะต้องเป็นคู่ของกุญแจส่วนตัว (P-256) — ไม่ใช่คู่กัน push service ตอบ 403 ทุกครั้ง */
export function vapidKeysMatch(publicKey: string, privateKey: string): boolean {
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    return ecdh.getPublicKey().equals(Buffer.from(publicKey, 'base64url'));
  } catch {
    return false;
  }
}

@Injectable()
export class WebPushSender implements PushSender {
  private readonly logger = new Logger('WebPush');
  readonly enabled: boolean;
  readonly publicKey: string;
  private readonly vapid: { subject: string; publicKey: string; privateKey: string };

  constructor(config: ConfigService<Env, true>) {
    this.publicKey = config.get('VAPID_PUBLIC_KEY', { infer: true });
    const privateKey = config.get('VAPID_PRIVATE_KEY', { infer: true });
    const subject = config.get('VAPID_SUBJECT', { infer: true }) || 'mailto:admin@example.com';
    this.vapid = { subject, publicKey: this.publicKey, privateKey };
    this.enabled = Boolean(this.publicKey && privateKey);
    if (!this.enabled) this.logger.warn('VAPID keys not set — Web Push is disabled');
    else {
      if (!vapidKeysMatch(this.publicKey, privateKey)) {
        this.logger.error('VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY — push services will answer 403; generate a pair with `npx web-push generate-vapid-keys`');
      }
      // Apple/Google ตรวจ subject: ต้องเป็น mailto: หรือ https: ของจริง (ค่าตัวอย่างอาจถูกปฏิเสธ)
      if (!/^(mailto:|https:\/\/)/.test(subject) || /example\.(com|org)|localhost/.test(subject)) {
        this.logger.warn(`VAPID_SUBJECT "${subject}" looks like a placeholder — set a real mailto:you@your-domain (Safari/iPhone may reject it)`);
      }
    }
  }

  async send(target: PushTarget, payload: string, opts: PushSendOptions): Promise<void> {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      { TTL: opts.ttlSec, urgency: opts.urgency, vapidDetails: this.vapid, timeout: 10_000 },
    );
  }
}

/**
 * server ยิงคำขอไปที่ endpoint ที่ผู้ใช้ส่งมา → ต้องจำกัดเฉพาะ push service ที่รู้จัก
 * ไม่งั้นใครก็สั่งให้ server ยิงไปที่ระบบภายในได้ (SSRF)
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Android), Samsung
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari / iPhone (เว็บแอปที่เพิ่มลงหน้าจอหลัก)
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge บน Windows
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.port === '' && PUSH_HOSTS.some((re) => re.test(url.hostname));
}
