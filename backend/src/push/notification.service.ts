import { Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { renderMessage, type Lang, type NotificationType } from './messages.js';
import { PushService } from './push.service.js';

/** api.md §3 `Notification` — ชื่อฟิลด์ของ API */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  created_at: string;
  read_at: string | null;
  title: string;
  body: string;
  link: string;
  data: Record<string, unknown>;
}

export interface Page<T> {
  data: T[];
  page: number;
  per_page: number;
  total: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger('Notification');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly push: PushService,
  ) {}

  /**
   * เก็บลงหน้า "แจ้งเตือน" (ดูย้อนหลังได้แม้ push ไม่ถึง — design §10) แล้วส่ง push
   * เรียกหลัง commit ของงานหลักแล้ว — push ล้มเหลวไม่ทำให้งานหลักล้ม
   */
  async notify(
    userIds: string[],
    msg: { type: NotificationType; data: Record<string, unknown>; link: string; tag?: string },
  ): Promise<void> {
    for (const userId of new Set(userIds)) {
      const { rows } = await this.pool.query<{ notification_id: string }>(
        `INSERT INTO app.notification_tb (user_id, type, data, link) VALUES ($1, $2, $3, $4) RETURNING notification_id`,
        [userId, msg.type, msg.data, msg.link],
      );
      await this.push
        .sendToUser(userId, { ...msg, notificationId: rows[0].notification_id })
        .catch((err: Error) => this.logger.error(`push to ${userId} failed: ${err.message}`));
    }
  }

  async list(userId: string, q: { page: number; perPage: number; unread: boolean }): Promise<Page<NotificationDto>> {
    const { rows } = await this.pool.query<{
      notification_id: string;
      type: NotificationType;
      created_date: Date;
      read_date: Date | null;
      link: string;
      data: Record<string, unknown>;
      lang: string | null;
      total: string;
    }>(
      `SELECT n.notification_id, n.type, n.created_date, n.read_date, n.link, n.data,
              u.prefs->>'lang' AS lang, count(*) OVER () AS total
       FROM app.notification_tb n JOIN app.user_tb u ON u.user_id = n.user_id
       WHERE n.user_id = $1 AND ($2::boolean = false OR n.read_date IS NULL)
       ORDER BY n.created_date DESC, n.notification_id
       LIMIT $3 OFFSET $4`,
      [userId, q.unread, q.perPage, (q.page - 1) * q.perPage],
    );
    let total = Number(rows[0]?.total ?? 0);
    if (!rows.length && q.page > 1) {
      // หน้าเกินจำนวน — ยังต้องบอก total ที่ถูก
      const c = await this.pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM app.notification_tb WHERE user_id = $1 AND ($2::boolean = false OR read_date IS NULL)`,
        [userId, q.unread],
      );
      total = Number(c.rows[0].n);
    }
    return {
      data: rows.map((r) => {
        const lang: Lang = r.lang === 'en' ? 'en' : 'th';
        const { title, body } = renderMessage(r.type, r.data, lang);
        return {
          id: r.notification_id,
          type: r.type,
          created_at: r.created_date.toISOString(),
          read_at: r.read_date?.toISOString() ?? null,
          title,
          body,
          link: r.link,
          data: r.data,
        };
      }),
      page: q.page,
      per_page: q.perPage,
      total,
    };
  }

  /** ids ไม่ส่ง = อ่านทั้งหมด · id ของคนอื่นถูกข้ามเงียบ ๆ (ไม่บอกว่ามีอยู่) */
  async markRead(userId: string, ids?: string[]): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE app.notification_tb SET read_date = now()
       WHERE user_id = $1 AND read_date IS NULL AND ($2::uuid[] IS NULL OR notification_id = ANY($2::uuid[]))`,
      [userId, ids ?? null],
    );
    return rowCount ?? 0;
  }
}
