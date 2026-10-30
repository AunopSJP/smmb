import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { minutesIntoWindow, SILENT_AFTER_MS, WINDOW_GRACE_MIN } from '../box/box-config.js';
import { BoxConfigService } from '../box/box-config.service.js';
import { NotificationService } from '../push/notification.service.js';

const TICK_MS = 60_000;
/** ไม่มี long-poll เกินนี้ระหว่างเวลาตรวจ = ตู้หลุด (design §8) */
export const OFFLINE_AFTER_MS = 10 * 60_000;
/** QR หมดอายุ 12 เดือน — เตือนเมื่ออายุ ≥ 11 เดือน (design §8 ข้อ 6) */
const QR_EXPIRING_AFTER = '11 months';
/** ไม่มีใครสแกนใบหน้าตู้เกินนี้ ทั้งที่บ้านอยู่ในโซน → น่าสงสัย (design §8 ข้อ 4) */
const QR_UNSCANNED_AFTER = '2 days';
/** ตรวจสุขภาพ QR หลังจบเวลาตรวจ — 23:00 เวลาไทย */
const HEALTH_HOUR = 23;
const SESSION_KEEP = '30 days';

const bangkokDay = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
const bangkokHour = (d: Date): number => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', hour12: false }).format(d));

/**
 * งานเบื้องหลัง (design §8) — รันตัวเดียวในโปรเซส (เหมือน JobHub · backend รันได้ตัวเดียว)
 * ทุกงานทำซ้ำได้ไม่เสียหาย (จำว่าแจ้งไปแล้วในคอลัมน์ `*_notified_date`) จึงปลอดภัยถ้ารีสตาร์ตกลางวัน
 * แจ้งเตือนล้มเหลวไม่ทำให้งานล้ม · งานหนึ่งล้มไม่ทำให้งานอื่นหยุด
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Scheduler');
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastHourly = 0;
  private lastHealthDay = '';

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly configs: BoxConfigService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    if (process.env.SCHEDULER === 'off') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** ทุกนาที: ตู้หลุดระหว่างเวลาตรวจ · ทุกชั่วโมง: ตู้เงียบ + ล้างของหมดอายุ · วันละครั้งหลัง 23:00: สุขภาพ QR */
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.safely('offline', () => this.watchOffline(now));
      if (now.getTime() - this.lastHourly >= 3600_000) {
        this.lastHourly = now.getTime();
        await this.safely('silent', () => this.watchSilent(now));
        await this.safely('cleanup', () => this.cleanup());
      }
      if (bangkokHour(now) >= HEALTH_HOUR && this.lastHealthDay !== bangkokDay(now)) {
        this.lastHealthDay = bangkokDay(now);
        await this.safely('qr-health', () => this.checkQrHealth());
      }
    } finally {
      this.running = false;
    }
  }

  private async safely(name: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`${name} failed: ${(err as Error).message}`);
    }
  }

  // ── ตู้หลุดระหว่างเวลาตรวจ ─────────────────────────────────────────────

  /**
   * ตู้ที่มีเจ้าของ เปิดบริการ อยู่ในเวลาตรวจเกิน 5 นาที แต่ไม่มี long-poll เกิน 10 นาที (หรือไม่เคย) → แจ้งเจ้าของบ้าน + แอดมิน ครั้งเดียวต่อช่วง
   * ออกนอกเวลาตรวจหรือตู้กลับมาถือ long-poll → ล้างเครื่องหมาย (รอบตรวจถัดไปแจ้งได้อีก)
   */
  async watchOffline(now = new Date()): Promise<number> {
    const { rows } = await this.pool.query<{
      box_id: string;
      name: string | null;
      owner_user_id: string;
      last_poll_date: Date | null;
      offline_notified_date: Date | null;
    }>(
      `SELECT box_id, name, owner_user_id, last_poll_date, offline_notified_date
       FROM app.box_tb WHERE owner_user_id IS NOT NULL AND service_active`,
    );
    if (!rows.length) return 0;
    const windows = await this.configs.windowsOf(rows.map((r) => r.box_id));
    const admins = await this.adminIds();
    let alerted = 0;
    for (const b of rows) {
      const into = minutesIntoWindow(windows.get(b.box_id) ?? [], now);
      const polling = b.last_poll_date !== null && now.getTime() - b.last_poll_date.getTime() <= OFFLINE_AFTER_MS;
      const down = into !== null && into >= WINDOW_GRACE_MIN && !polling;
      if (!down) {
        if (b.offline_notified_date && (into === null || polling)) {
          await this.pool.query(`UPDATE app.box_tb SET offline_notified_date = NULL WHERE box_id = $1`, [b.box_id]);
        }
        continue;
      }
      if (b.offline_notified_date) continue;
      await this.pool.query(`UPDATE app.box_tb SET offline_notified_date = now() WHERE box_id = $1`, [b.box_id]);
      const data = { box_id: b.box_id, box_name: b.name };
      await this.notifications.notify([b.owner_user_id], { type: 'box_offline', data, link: '/home', tag: `offline-${b.box_id}` }).catch(this.warn);
      await this.notifications.notify(admins, { type: 'box_offline', data, link: `/admin/boxes/detail?id=${b.box_id}`, tag: `offline-${b.box_id}` }).catch(this.warn);
      alerted++;
    }
    return alerted;
  }

  // ── ตู้เงียบ ──────────────────────────────────────────────────────────

  /** ตู้ที่เคยติดต่อแล้วเงียบเกิน 26 ชม. → แจ้งแอดมินครั้งเดียว · กลับมาติดต่อ → ล้างเครื่องหมาย */
  async watchSilent(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - SILENT_AFTER_MS);
    await this.pool.query(`UPDATE app.box_tb SET silent_notified_date = NULL WHERE silent_notified_date IS NOT NULL AND last_seen_date > $1`, [cutoff]);
    const { rows } = await this.pool.query<{ box_id: string }>(
      `UPDATE app.box_tb SET silent_notified_date = now()
       WHERE service_active AND owner_user_id IS NOT NULL AND last_seen_date IS NOT NULL AND last_seen_date <= $1 AND silent_notified_date IS NULL
       RETURNING box_id`,
      [cutoff],
    );
    if (!rows.length) return 0;
    const admins = await this.adminIds();
    for (const r of rows) {
      await this.notifications.notify(admins, { type: 'box_silent_26h', data: { box_id: r.box_id }, link: `/admin/boxes/detail?id=${r.box_id}`, tag: `silent-${r.box_id}` }).catch(this.warn);
    }
    return rows.length;
  }

  // ── สุขภาพ QR ─────────────────────────────────────────────────────────

  /**
   * ข้อที่ต้องคิดจากเวลา: อายุ ≥ 11 เดือน → expiring · บ้านอยู่ในโซนแต่ไม่มีใครสแกนใบหน้าตู้เกิน 2 วัน → suspicious
   * (ข้ออื่นติดธงทันทีตอนเกิดเหตุใน InspectionService / RiderService) แล้วแจ้งแอดมินรวมครั้งเดียวว่ามี QR ไม่ปกติกี่ใบ
   */
  async checkQrHealth(): Promise<number> {
    await this.pool.query(
      `UPDATE app.box_qr_code_tb
       SET health = 'expiring', health_reasons = array_append(health_reasons, 'age_11m')
       WHERE status = 'active' AND slot IN ('1','2') AND health = 'ok' AND created_date <= now() - $1::interval`,
      [QR_EXPIRING_AFTER],
    );
    await this.pool.query(
      `UPDATE app.box_qr_code_tb q
       SET health = 'suspicious', health_reasons = array_append(health_reasons, 'not_scanned_2d')
       WHERE q.status = 'active' AND q.slot = '1' AND q.health = 'ok'
         AND coalesce(q.last_scanned_date, q.created_date) <= now() - $1::interval
         AND EXISTS (SELECT 1 FROM app.zone_box_tb zb WHERE zb.box_id = q.box_id)`,
      [QR_UNSCANNED_AFTER],
    );
    await this.pool.query(`UPDATE app.box_qr_code_tb SET health_notified_date = NULL WHERE health = 'ok' AND health_notified_date IS NOT NULL`);
    const { rows } = await this.pool.query<{ box_qr_code_id: string }>(
      `UPDATE app.box_qr_code_tb SET health_notified_date = now()
       WHERE status = 'active' AND slot IN ('1','2') AND health <> 'ok' AND health_notified_date IS NULL
       RETURNING box_qr_code_id`,
    );
    if (rows.length) {
      await this.notifications.notify(await this.adminIds(), { type: 'qr_health', data: { count: rows.length }, link: '/admin/qr', tag: 'qr-health' }).catch(this.warn);
    }
    return rows.length;
  }

  // ── ล้างของหมดอายุ ─────────────────────────────────────────────────────

  /** session ที่หมดอายุ/ถูกเพิกถอนเกิน 30 วัน (nonce ของตู้ล้างเองใน BoxAuthGuard · ใบส่งของไรเดอร์เป็นลายเซ็น ไม่มีแถว) */
  async cleanup(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM app.session_tb WHERE expire_date < now() - $1::interval OR revoked_date < now() - $1::interval`,
      [SESSION_KEEP],
    );
    return rowCount ?? 0;
  }

  private async adminIds(): Promise<string[]> {
    const { rows } = await this.pool.query<{ user_id: string }>(
      `SELECT r.user_id FROM app.user_role_tb r JOIN app.user_tb u ON u.user_id = r.user_id
       WHERE r.role = 'admin' AND r.status = 'active' AND u.status = 'active' AND u.deleted_date IS NULL`,
    );
    return rows.map((r) => r.user_id);
  }

  private readonly warn = (err: Error): void => this.logger.error(`notification failed: ${err.message}`);
}
