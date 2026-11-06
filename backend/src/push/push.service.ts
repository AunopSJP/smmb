import { Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { isUrgent, renderMessage, type Lang, type NotificationType } from './messages.js';
import { PUSH_SENDER, type PushSender } from './push.sender.js';

/** subscription ที่ยังส่งได้ = session ของเครื่องนั้นยังใช้ได้ (ไม่ถูกเตะ/ไม่หมดอายุ/บัญชีไม่ถูกปิด) */
const ACTIVE_SUBSCRIPTION_SQL = `
  FROM app.push_subscription_tb p
  JOIN app.session_tb s ON s.session_id = p.session_id
  JOIN app.user_tb u ON u.user_id = s.user_id
  WHERE s.revoked_date IS NULL AND s.expire_date > now()
    AND s.token_version = u.token_version AND u.status = 'active' AND u.deleted_date IS NULL`;

export interface PushMessage {
  type: NotificationType;
  data: Record<string, unknown>;
  link: string;
  /** แจ้งเตือนที่ tag เดียวกันแทนที่กัน (เช่น SOS เดียวกันหลายขั้น) */
  tag?: string;
  notificationId?: string;
}

export interface PushStatusDto {
  /** server ตั้ง VAPID ครบไหม */
  configured: boolean;
  /** กุญแจสาธารณะ/ส่วนตัวเป็นคู่กันไหม (false = push service ตอบ 403 ทุกครั้ง) */
  keys_match: boolean | null;
  subscriptions: { host: string; device_label: string | null; this_device: boolean; usable: boolean; last_ok_at: string | null; failed_count: number }[];
}

export interface SendResult {
  sent: number;
  removed: number;
  failed: number;
  /** HTTP status ล่าสุดที่ push service ปฏิเสธ (401/403 = กุญแจ VAPID ไม่ตรง · 400 = payload ผิด) — ไว้ให้หน้าทดสอบบอกสาเหตุ */
  failure_status?: number;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  get enabled(): boolean {
    return this.sender.enabled;
  }

  get publicKey(): string {
    return this.sender.publicKey;
  }

  /** endpoint เดิม (เครื่องเดิม ล็อกอินใหม่/คนอื่นล็อกอิน) → ย้ายมาเป็นของ session นี้ ไม่สร้างซ้ำ */
  async subscribe(
    userId: string,
    sessionId: string,
    sub: { endpoint: string; p256dh: string; auth: string; deviceLabel?: string },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO app.push_subscription_tb (endpoint, user_id, session_id, p256dh, auth, device_label)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id, session_id = EXCLUDED.session_id,
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, device_label = EXCLUDED.device_label,
         failed_count = 0`,
      [sub.endpoint, userId, sessionId, sub.p256dh, sub.auth, sub.deviceLabel ?? null],
    );
  }

  /**
   * สถานะแจ้งเตือนของบัญชีนี้ (ไว้ตรวจว่าทำไมไม่เด้ง) — เฉพาะของตัวเอง · ไม่ส่ง endpoint เต็ม (บอกแค่ชื่อโฮสต์ของ push service)
   * usable = session ของเครื่องนั้นยังใช้ได้ (ถ้าไม่ → เซิร์ฟเวอร์จะไม่ส่งให้เครื่องนั้น)
   */
  async status(userId: string, sessionId: string): Promise<PushStatusDto> {
    const { rows } = await this.pool.query<{
      endpoint: string;
      device_label: string | null;
      session_id: string | null;
      last_ok_date: Date | null;
      failed_count: number;
      usable: boolean;
    }>(
      `SELECT p.endpoint, p.device_label, p.session_id, p.last_ok_date, p.failed_count,
              (s.session_id IS NOT NULL AND s.revoked_date IS NULL AND s.expire_date > now() AND s.token_version = u.token_version AND u.status = 'active') AS usable
       FROM app.push_subscription_tb p
       JOIN app.user_tb u ON u.user_id = p.user_id
       LEFT JOIN app.session_tb s ON s.session_id = p.session_id
       WHERE p.user_id = $1 ORDER BY p.created_date DESC LIMIT 20`,
      [userId],
    );
    return {
      configured: this.sender.enabled,
      keys_match: this.sender.keysMatch ?? null,
      subscriptions: rows.map((r) => ({
        host: (() => {
          try {
            return new URL(r.endpoint).host;
          } catch {
            return '?';
          }
        })(),
        device_label: r.device_label,
        this_device: r.session_id === sessionId,
        usable: r.usable,
        last_ok_at: r.last_ok_date?.toISOString() ?? null,
        failed_count: r.failed_count,
      })),
    };
  }

  /** ลบได้เฉพาะของตัวเอง — endpoint ของคนอื่นตอบเหมือนไม่มี */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.pool.query(`DELETE FROM app.push_subscription_tb WHERE endpoint = $1 AND user_id = $2`, [
      endpoint,
      userId,
    ]);
  }

  /** ส่งถึงทุกเครื่องที่ยังใช้ได้ของผู้ใช้ · ระบุ sessionId = เฉพาะเครื่องนั้น */
  async sendToUser(userId: string, msg: PushMessage, sessionId?: string): Promise<SendResult> {
    const result: SendResult = { sent: 0, removed: 0, failed: 0 };
    if (!this.sender.enabled) return result;

    const { rows } = await this.pool.query<{
      push_subscription_id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      lang: Lang | null;
    }>(
      `SELECT p.push_subscription_id, p.endpoint, p.p256dh, p.auth, u.prefs->>'lang' AS lang
       ${ACTIVE_SUBSCRIPTION_SQL} AND p.user_id = $1 AND ($2::uuid IS NULL OR p.session_id = $2)`,
      [userId, sessionId ?? null],
    );
    if (!rows.length) return result;

    const lang: Lang = rows[0].lang === 'en' ? 'en' : 'th';
    const payload = JSON.stringify(buildPayload(msg, lang));
    const urgent = isUrgent(msg.type);

    await Promise.all(
      rows.map(async (sub) => {
        try {
          await this.sender.send(sub, payload, { ttlSec: urgent ? 300 : 24 * 3600, urgency: urgent ? 'high' : 'normal' });
          result.sent++;
          await this.pool.query(
            `UPDATE app.push_subscription_tb SET last_ok_date = now(), failed_count = 0 WHERE push_subscription_id = $1`,
            [sub.push_subscription_id],
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // push service บอกว่า subscription นี้ตายแล้ว → ลบทิ้ง (api.md §3)
            result.removed++;
            await this.pool.query(`DELETE FROM app.push_subscription_tb WHERE push_subscription_id = $1`, [
              sub.push_subscription_id,
            ]);
          } else {
            result.failed++;
            if (status) result.failure_status = status;
            const body = String((err as { body?: unknown }).body ?? (err as Error).message ?? '').slice(0, 200);
            this.logger.warn(`push to ${new URL(sub.endpoint).host} failed (${status ?? 'network'}): ${body}`);
            await this.pool.query(
              `UPDATE app.push_subscription_tb SET failed_count = failed_count + 1 WHERE push_subscription_id = $1`,
              [sub.push_subscription_id],
            );
          }
        }
      }),
    );
    return result;
  }
}

/** '/officer/sos/1' → 'officer/sos/1' · '/' → '' (หน้าแรกของ scope) */
export const scopeRelative = (link: string): string => link.replace(/^\/+/, '');

/**
 * รูปแบบที่ service worker ของ Angular (ngsw) แสดงได้เลย — ข้อมูลของเราอยู่ใน notification.data
 * กดแจ้งเตือน → เปิด/โฟกัสเว็บแอปที่ `link`
 */
export function buildPayload(msg: PushMessage, lang: Lang) {
  const { title, body } = renderMessage(msg.type, msg.data, lang);
  const urgent = isUrgent(msg.type);
  return {
    notification: {
      title,
      body,
      lang,
      icon: 'icons/icon-192x192.png',
      badge: 'icons/icon-72x72.png',
      ...(msg.tag ? { tag: msg.tag, renotify: true } : {}),
      ...(urgent ? { requireInteraction: true } : {}),
      data: {
        id: msg.notificationId ?? null,
        type: msg.type,
        link: msg.link,
        data: msg.data,
        // ต้องเป็นลิงก์สัมพันธ์กับ scope ของ service worker (ไม่ขึ้นต้นด้วย /) — ngsw ใช้ new URL(url, scope)
        // เว็บบน hub อยู่ใต้ /smmb/ : '/officer/x' จะหลุดไป https://host/officer/x (ไม่ใช่หน้าของแอป) แต่ 'officer/x' ได้ /smmb/officer/x
        onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: scopeRelative(msg.link) } },
      },
    },
  };
}
