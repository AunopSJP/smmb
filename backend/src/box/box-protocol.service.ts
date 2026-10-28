import { Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { withTx } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';
import type { BoxConfig } from './box-config.js';
import { BoxConfigService } from './box-config.service.js';
import { BoxJobService, type BoxJobForBox } from './box-job.service.js';
import { JobHub } from './job-hub.js';

/** แบตต่ำกว่านี้ → แจ้งเจ้าของบ้าน + แอดมิน (✅ api.md §0) */
export const LOW_BATTERY_PCT = 20;
/** รอ long-poll ได้นานสุด — ต้องสั้นกว่า timeout ของ reverse proxy (ตั้ง proxy_read_timeout > 60 วิ) */
export const MAX_WAIT_S = 55;

type Body = Record<string, unknown>;

/** ค่าจากตู้อ่านแบบผ่อนปรน: ผิดรูปแบบ = null (เก็บก้อนดิบไว้ใน box_report_tb อยู่แล้ว) — ตู้รุ่นใหม่ส่งฟิลด์เพิ่มได้ไม่พัง */
export const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
export const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
export const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

export const nowS = () => Math.floor(Date.now() / 1000);

export interface CheckInReply {
  server_time: number;
  config_ver: number;
  config?: BoxConfig;
}

/** API ของตู้ `/v1/box/*` (โปรโตคอล §2) ยกเว้นปุ่มส่งของ (⏸ รอยืนยัน) */
@Injectable()
export class BoxProtocolService {
  private readonly logger = new Logger('BoxProtocol');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly configs: BoxConfigService,
    private readonly jobs: BoxJobService,
    private readonly hub: JobHub,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * boot (เปิดเครื่อง) / report (วันละครั้ง) — เก็บก้อนดิบ + อัปเดตสถานะตู้
   * ส่ง `config` กลับเฉพาะเมื่อ config_ver ของตู้ไม่ตรง (โปรโตคอล §2.1)
   */
  async checkIn(boxId: string, kind: 'boot' | 'report', body: Body): Promise<CheckInReply> {
    const battery = int(body.battery_pct, 0, 100);
    const box = await withTx(this.pool, async (db) => {
      await db.query(`INSERT INTO app.box_report_tb (box_id, kind, body) VALUES ($1, $2, $3)`, [boxId, kind, body]);
      const { rows } = await db.query<{ owner_user_id: string | null; name: string | null }>(
        `UPDATE app.box_tb SET
           fw = coalesce($2, fw),
           config_ver_seen = coalesce($3, config_ver_seen),
           battery_pct = coalesce($4, battery_pct),
           charging = coalesce($5, charging),
           battery_date = CASE WHEN $4::int IS NULL THEN battery_date ELSE now() END,
           last_seen_date = now()
         WHERE box_id = $1
         RETURNING owner_user_id, name`,
        [boxId, text(body.fw, 32), int(body.config_ver, 0, 2 ** 31 - 1), battery, bool(body.charging)],
      );
      return rows[0];
    });

    if (kind === 'report' && battery !== null && battery < LOW_BATTERY_PCT) {
      await this.notifyLowBattery(boxId, box?.owner_user_id ?? null, box?.name ?? null, battery);
    }

    const { config, ver } = await this.configs.forBox(boxId);
    return { server_time: nowS(), config_ver: ver, ...(body.config_ver === ver ? {} : { config }) };
  }

  /** เหตุการณ์อื่น (ปุ่ม Boot ล้าง Wi-Fi / แบตวิกฤต / กล้องเสีย) — ส่งครั้งเดียว เก็บไว้ดูอย่างเดียว */
  async event(boxId: string, body: Body): Promise<{ server_time: number; config_ver: number }> {
    await this.pool.query(`INSERT INTO app.box_report_tb (box_id, kind, body) VALUES ($1, 'event', $2)`, [boxId, body]);
    await this.pool.query(`UPDATE app.box_tb SET last_seen_date = now() WHERE box_id = $1`, [boxId]);
    return { server_time: nowS(), config_ver: (await this.configs.forBox(boxId)).ver };
  }

  async configVer(boxId: string): Promise<number> {
    return (await this.configs.forBox(boxId)).ver;
  }

  /**
   * long-poll (โปรโตคอล §2.3): มีงานอยู่แล้ว → ตอบทันที · ไม่มี → รอสูงสุด waitS วิ ระหว่างนั้นมีงาน → ตอบทันที
   * คืน null = ครบเวลาไม่มีงาน (204) หรือตู้ตัดการเชื่อมต่อไปก่อน
   */
  async poll(boxId: string, waitS: number, closed: Promise<void>): Promise<BoxJobForBox | null> {
    await this.pool.query(`UPDATE app.box_tb SET last_poll_date = now(), last_seen_date = now() WHERE box_id = $1`, [boxId]);
    const deadline = Date.now() + Math.max(0, Math.min(waitS, MAX_WAIT_S)) * 1000;
    let gone = false;
    void closed.then(() => (gone = true));

    for (;;) {
      const waiter = this.hub.listen(boxId); // ลงชื่อก่อนค้น — งานที่เกิดระหว่างค้นจะปลุกได้
      const job = await this.jobs.takePending(boxId);
      const left = deadline - Date.now();
      if (job || gone || left <= 0) {
        waiter.cancel();
        return gone ? null : job;
      }
      let timer: NodeJS.Timeout | undefined;
      const outcome = await Promise.race([
        waiter.woken.then(() => 'woken' as const),
        closed.then(() => 'closed' as const),
        new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), left))),
      ]);
      clearTimeout(timer);
      waiter.cancel();
      if (outcome === 'closed') return null;
      if (outcome === 'timeout') return this.jobs.takePending(boxId); // เผื่องานเข้ามาพอดีตอนหมดเวลา
    }
  }

  private async notifyLowBattery(boxId: string, ownerId: string | null, name: string | null, pct: number): Promise<void> {
    const data = { box_id: boxId, box_name: name, battery_pct: pct };
    try {
      if (ownerId) await this.notifications.notify([ownerId], { type: 'low_battery', data, link: '/', tag: `battery-${boxId}` });
      const admins = await this.pool.query<{ user_id: string }>(
        `SELECT r.user_id FROM app.user_role_tb r JOIN app.user_tb u ON u.user_id = r.user_id
         WHERE r.role = 'admin' AND r.status = 'active' AND u.status = 'active' AND u.deleted_date IS NULL`,
      );
      await this.notifications.notify(
        admins.rows.map((r) => r.user_id),
        { type: 'low_battery', data, link: `/admin/boxes/${boxId}`, tag: `battery-${boxId}` },
      );
    } catch (err) {
      // แจ้งเตือนล้มเหลวไม่ทำให้ตู้ได้ error (ตู้จะลองส่งรายงานซ้ำโดยไม่จำเป็น)
      this.logger.error(`low battery notification failed for ${boxId}: ${(err as Error).message}`);
    }
  }
}
