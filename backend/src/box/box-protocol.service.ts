import { Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { withTx } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';
import type { BoxConfig } from './box-config.js';
import { BoxConfigService } from './box-config.service.js';
import { BoxJobService, type BoxJobForBox } from './box-job.service.js';
import { FirmwareService } from './firmware.service.js';
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

/** คำสั่งจากเจ้าของบ้านที่รอตู้รับ — ตอนนี้มีอย่างเดียว: ตัด Wi-Fi เก่า แล้วกลับโหมดปล่อย Wi-Fi (โปรโตคอล §2.8) */
export interface BoxCommand {
  type: 'wifi_reset' | 'ota';
  /** ใช้ตอบรับ (event wifi_reset + command_id) — เปลี่ยนทุกครั้งที่เจ้าของกดใหม่ · ota: `U-<version>` */
  id: string;
  /** เฉพาะ ota: เวอร์ชัน/ขนาด/sha256 ของเฟิร์มแวร์ที่ตู้ต้องโหลดจาก `GET /v1/box/firmware/<version>` (โปรโตคอล §2.9) */
  version?: string;
  size?: number;
  sha256?: string;
}

/** ค้างเกินนี้ = หมดอายุ (ตู้ออฟไลน์/ปิดอยู่) ไม่ส่งให้ตู้อีก · เจ้าของต้องกดใหม่ */
export const WIFI_RESET_TTL_H = 24;

/** ชื่อ Wi-Fi ที่ตู้ปล่อยตอนตั้งค่า = MAILBOX-<เลข 6 หลักท้ายของ box_id> (ตรงกับ apName() ในเฟิร์มแวร์) */
export const setupApName = (boxId: string): string => 'MAILBOX-' + boxId.replace(/\D/g, '').padStart(6, '0').slice(-6);

export interface CheckInReply {
  server_time: number;
  /** มีคำสั่งรอตู้ — ตู้ต้องทำตามและตอบรับ */
  command?: BoxCommand;
  config_ver: number;
  config?: BoxConfig;
  /** เฉพาะ boot: ถือ long-poll ต่อกี่วินาทีแม้นอกเวลาตรวจ (ให้ช่าง/แอดมินทดสอบปลุกตู้หลังเปิดเครื่อง · โปรโตคอล §2.1) */
  awake_s?: number;
}

/** หลังเปิดเครื่อง ตู้ถือ long-poll 15 นาที — ตู้ใหม่ยังไม่อยู่โซนไหน (ไม่มีเวลาตรวจ) ก็ยังทดสอบปลุกได้ตอนติดตั้ง */
export const SETUP_AWAKE_S = 900;

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
    private readonly firmware: FirmwareService,
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

    await this.firmware.clearIfDone(boxId);
    const { config, ver } = await this.configs.forBox(boxId);
    const command = await this.pendingCommand(boxId);
    return {
      server_time: nowS(),
      config_ver: ver,
      ...(body.config_ver === ver ? {} : { config }),
      ...(kind === 'boot' ? { awake_s: SETUP_AWAKE_S } : {}),
      ...(command ? { command } : {}),
    };
  }

  /** คำสั่งที่รอตู้อยู่ (ยังไม่หมดอายุ) — id คิดจากเวลาที่เจ้าของกด จึงคงที่จนกว่าจะกดใหม่ */
  async pendingCommand(boxId: string): Promise<BoxCommand | null> {
    const { rows } = await this.pool.query<{ at: string }>(
      `SELECT floor(extract(epoch FROM wifi_reset_requested_date))::bigint::text AS at
       FROM app.box_tb
       WHERE box_id = $1 AND wifi_reset_requested_date IS NOT NULL AND wifi_reset_requested_date > now() - make_interval(hours => $2)`,
      [boxId, WIFI_RESET_TTL_H],
    );
    if (rows[0]) return { type: 'wifi_reset', id: `W-${rows[0].at}` };
    const offer = await this.firmware.offerFor(boxId);
    return offer ? { type: 'ota', id: `U-${offer.version}`, ...offer } : null;
  }

  /** ตู้ตอบรับว่ากำลังตัด Wi-Fi เก่า (ส่งก่อนตัด — ตัดแล้วส่งอะไรไม่ได้) · ตอบรับซ้ำ/คำสั่งเก่า/ถูกยกเลิกแล้ว = ไม่ทำอะไร */
  private async completeWifiReset(boxId: string, commandId: unknown): Promise<void> {
    const pending = await this.pendingCommand(boxId);
    if (!pending || commandId !== pending.id) return;
    const { rows } = await this.pool.query<{ owner_user_id: string | null; name: string | null }>(
      `UPDATE app.box_tb SET wifi_reset_requested_date = NULL, wifi_reset_done_date = now()
       WHERE box_id = $1 AND wifi_reset_requested_date IS NOT NULL
       RETURNING owner_user_id, name`,
      [boxId],
    );
    const box = rows[0];
    if (!box?.owner_user_id) return;
    try {
      await this.notifications.notify([box.owner_user_id], {
        type: 'box_wifi_reset',
        data: { box_id: boxId, box_name: box.name, ap_name: setupApName(boxId) },
        link: '/home/settings/wifi',
        tag: `wifi-reset-${boxId}`,
      });
    } catch (err) {
      this.logger.error(`wifi reset notification failed for ${boxId}: ${(err as Error).message}`);
    }
  }

  /** เหตุการณ์อื่น (ปุ่ม Boot ล้าง Wi-Fi / แบตวิกฤต / กล้องเสีย / ตอบรับคำสั่งเปลี่ยน Wi-Fi) — ส่งครั้งเดียว */
  async event(boxId: string, body: Body): Promise<{ server_time: number; config_ver: number }> {
    await this.pool.query(`INSERT INTO app.box_report_tb (box_id, kind, body) VALUES ($1, 'event', $2)`, [boxId, body]);
    await this.pool.query(`UPDATE app.box_tb SET last_seen_date = now() WHERE box_id = $1`, [boxId]);
    if (body.type === 'wifi_reset') await this.completeWifiReset(boxId, body.command_id);
    return { server_time: nowS(), config_ver: (await this.configs.forBox(boxId)).ver };
  }

  async configVer(boxId: string): Promise<number> {
    return (await this.configs.forBox(boxId)).ver;
  }

  /** Long-poll config handshake: send current config on mismatch and mark matching boards in sync. */
  async pollConfig(boxId: string, reportedVersion: number): Promise<{ server_time: number; config_ver: number; config?: BoxConfig }> {
    const { config, ver } = await this.configs.forBox(boxId);
    if (reportedVersion === ver) {
      await this.pool.query(`UPDATE app.box_tb SET config_ver_seen = $2 WHERE box_id = $1`, [boxId, ver]);
      return { server_time: nowS(), config_ver: ver };
    }
    return { server_time: nowS(), config_ver: ver, config };
  }

  /**
   * long-poll (โปรโตคอล §2.3): มีงานอยู่แล้ว → ตอบทันที · ไม่มี → รอสูงสุด waitS วิ ระหว่างนั้นมีงาน → ตอบทันที
   * คืน null = ครบเวลาไม่มีงาน (204) หรือตู้ตัดการเชื่อมต่อไปก่อน
   */
  async poll(boxId: string, waitS: number, closed: Promise<void>): Promise<{ job: BoxJobForBox | null; command: BoxCommand | null }> {
    await this.pool.query(`UPDATE app.box_tb SET last_poll_date = now(), last_seen_date = now() WHERE box_id = $1`, [boxId]);
    const deadline = Date.now() + Math.max(0, Math.min(waitS, MAX_WAIT_S)) * 1000;
    let gone = false;
    void closed.then(() => (gone = true));
    const none = { job: null, command: null };
    /** งานก่อน (ตรวจตู้ไม่ควรรอ) แล้วค่อยคำสั่ง */
    const look = async () => {
      const job = await this.jobs.takePending(boxId);
      return { job, command: job ? null : await this.pendingCommand(boxId) };
    };

    for (;;) {
      const waiter = this.hub.listen(boxId); // ลงชื่อก่อนค้น — งาน/คำสั่งที่เกิดระหว่างค้นจะปลุกได้
      const found = await look();
      const left = deadline - Date.now();
      if (found.job || found.command || gone || left <= 0) {
        waiter.cancel();
        return gone ? none : found;
      }
      let timer: NodeJS.Timeout | undefined;
      const outcome = await Promise.race([
        waiter.woken.then(() => 'woken' as const),
        closed.then(() => 'closed' as const),
        new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), left))),
      ]);
      clearTimeout(timer);
      waiter.cancel();
      if (outcome === 'closed') return none;
      if (outcome === 'woken') {
        const woke = await look();
        if (woke.job || woke.command) return woke;
        continue; // ปลุกเพราะเรื่องอื่น (เช่นยกเลิกคำสั่ง) — รอต่อจนครบเวลา
      }
      return look(); // timeout: เผื่อมีเข้ามาพอดีตอนหมดเวลา
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
