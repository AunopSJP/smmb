import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import type { Env } from '../config/env.js';
import { PG_POOL } from '../db/db.module.js';
import { isPgError, PG_UNIQUE_VIOLATION } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';
import { CodeAttempts } from '../rate-limit/code-attempts.js';
import { deliveryTicket, readTicket } from '../box/box-crypto.js';

/** ✅ api.md §0: แจ้งส่งของได้ 5 ครั้ง/ชั่วโมง ต่อตู้ */
export const DELIVERY_LIMIT_PER_HOUR = 5;
/** delivery ticket อายุ 10 นาที (✅) */
export const TICKET_TTL_S = 600;
/** ไรเดอร์พิมพ์รหัสแทนสแกนกี่ครั้งใน 7 วัน = QR น่าสงสัย (✅ api.md §0) */
export const RIDER_TYPED_LIMIT = 3;

/** api.md §5 คำตอบตอนสแกน/พิมพ์รหัส — ไรเดอร์เห็นแค่บ้านเลขที่ (ไม่เห็นชื่อ/เบอร์เจ้าของบ้าน) */
export interface RiderBoxDto {
  house_no: string;
  box_status: 'active' | 'service_closed';
  delivery_ticket: string;
}

const FRONT_TOKEN = /^BX\d{5,10}-[12]-[A-Z2-9]{6}$/;

/**
 * ไรเดอร์ (public · ไม่มีบัญชี · ไม่เก็บข้อมูลตัวตน — IP เก็บใน scan log ไว้กันเดารหัส/สืบ QR ปลอมเท่านั้น)
 * ปุ่มหน้าตู้ถูกตัดออกแล้ว (2026-10-28) — แจ้งส่งของได้ทาง QR / รหัสใต้ QR เท่านั้น
 */
@Injectable()
export class RiderService {
  private readonly logger = new Logger('Rider');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly config: ConfigService<Env, true>,
    private readonly codes: CodeAttempts,
    private readonly notifications: NotificationService,
  ) {}

  /** สแกน QR หน้าตู้ด้วยกล้องมือถือ → ลิงก์ /b/<token> → หน้า R02 เรียกอันนี้ */
  async byToken(token: string, ip: string | null): Promise<RiderBoxDto> {
    if (!FRONT_TOKEN.test(token)) {
      await this.log(null, null, 'scan', token, 'invalid', ip);
      throw this.invalid();
    }
    return this.resolve(`q.token = $1`, token, 'scan', ip);
  }

  /** พิมพ์รหัสใต้ QR (R01) — ผิด 3 ครั้งติดกันต้องรอ */
  async byCode(code: string, ip: string | null): Promise<RiderBoxDto> {
    const key = ip ?? 'unknown';
    await this.codes.check(key);
    const c = code.replace(/[\s-]/g, '').toUpperCase();
    try {
      const r = /^[A-Z2-9]{8}$/.test(c) ? await this.resolve(`q.print_code = $1`, c, 'code', ip) : await this.reject(c, ip);
      await this.codes.succeed(key);
      return r;
    } catch (err) {
      if (err instanceof AppError && (err.code === 'QR_INVALID' || err.code === 'QR_REVOKED')) await this.codes.fail(key);
      throw err;
    }
  }

  /** กดแจ้งส่งของ — ต้องมี ticket จากการสแกน · ตู้ปิดบริการ → 403 · เกินเพดานต่อตู้ → 429 · ticket ใช้แล้ว/หมดอายุ → 410 */
  async deliver(ticket: string): Promise<{ ok: true }> {
    const t = readTicket(this.config.get('QR_SIGNING_KEY', { infer: true }), ticket);
    if (!t || t.e * 1000 < Date.now()) throw new AppError(HttpStatus.GONE, 'TICKET_EXPIRED', 'scan the QR again');
    const { rows } = await this.pool.query<{ box_id: string; status: string; service_active: boolean; owner_user_id: string | null; name: string | null }>(
      `SELECT q.box_id, q.status, b.service_active, b.owner_user_id, b.name
       FROM app.box_qr_code_tb q JOIN app.box_tb b ON b.box_id = q.box_id WHERE q.box_qr_code_id = $1`,
      [t.q],
    );
    const box = rows[0];
    if (!box || box.status !== 'active') throw new AppError(HttpStatus.GONE, 'TICKET_EXPIRED', 'scan the QR again');
    if (!box.service_active || !box.owner_user_id) throw new AppError(HttpStatus.FORBIDDEN, 'BOX_SERVICE_CLOSED', 'this mailbox is not in service');

    // เพดานต่อตู้: lock แถวตู้ก่อนนับ (กันส่งพร้อมกันหลายคำขอแล้วเกินเพดาน)
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT 1 FROM app.box_tb WHERE box_id = $1 FOR UPDATE`, [box.box_id]);
      const count = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.delivery_tb WHERE box_id = $1 AND created_date > now() - interval '1 hour'`,
        [box.box_id],
      );
      if (count.rows[0].n >= DELIVERY_LIMIT_PER_HOUR) {
        await client.query('ROLLBACK');
        throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'DELIVERY_LIMIT', 'too many deliveries for this mailbox, try later');
      }
      await client.query(`INSERT INTO app.delivery_tb (box_id, box_qr_code_id, method, ticket_id) VALUES ($1, $2, $3, $4)`, [
        box.box_id,
        t.q,
        t.m,
        t.n,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isPgError(err, PG_UNIQUE_VIOLATION)) throw new AppError(HttpStatus.GONE, 'TICKET_EXPIRED', 'this delivery was already sent');
      throw err;
    } finally {
      client.release();
    }

    try {
      await this.notifications.notify([box.owner_user_id], {
        type: 'delivered',
        data: { box_id: box.box_id, box_name: box.name, method: t.m, at: new Date().toISOString() },
        link: '/home',
      });
    } catch (err) {
      this.logger.error(`delivered notification failed: ${(err as Error).message}`);
    }
    return { ok: true };
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  private invalid() {
    return new AppError(HttpStatus.NOT_FOUND, 'QR_INVALID', 'this QR or code is not valid');
  }

  private async reject(raw: string, ip: string | null): Promise<never> {
    await this.log(null, null, 'code', raw, 'invalid', ip);
    throw this.invalid();
  }

  private async resolve(where: string, value: string, method: 'scan' | 'code', ip: string | null): Promise<RiderBoxDto> {
    const { rows } = await this.pool.query<{
      box_qr_code_id: string;
      box_id: string;
      status: string;
      house_no: string | null;
      service_active: boolean;
      owner_user_id: string | null;
    }>(
      `SELECT q.box_qr_code_id, q.box_id, q.status, b.house_no, b.service_active, b.owner_user_id
       FROM app.box_qr_code_tb q JOIN app.box_tb b ON b.box_id = q.box_id
       WHERE ${where} AND q.slot IN ('1','2')`,
      [value],
    );
    const qr = rows[0];
    if (!qr) {
      await this.log(null, null, method, value, 'invalid', ip);
      throw this.invalid();
    }
    if (qr.status !== 'active') {
      await this.log(qr.box_id, qr.box_qr_code_id, method, value, 'revoked', ip);
      throw new AppError(HttpStatus.GONE, 'QR_REVOKED', 'this QR has been replaced');
    }
    const open = qr.service_active && !!qr.owner_user_id;
    await this.log(qr.box_id, qr.box_qr_code_id, method, value, open ? 'ok' : 'service_closed', ip);
    await this.pool.query(`UPDATE app.box_qr_code_tb SET last_scanned_date = now() WHERE box_qr_code_id = $1`, [qr.box_qr_code_id]);
    if (method === 'code') await this.flagTypedOften(qr.box_qr_code_id);
    return {
      house_no: qr.house_no ?? '',
      box_status: open ? 'active' : 'service_closed',
      delivery_ticket: deliveryTicket(this.config.get('QR_SIGNING_KEY', { infer: true }), {
        q: qr.box_qr_code_id,
        m: method,
        e: Math.floor(Date.now() / 1000) + TICKET_TTL_S,
      }),
    };
  }

  /** ไรเดอร์พิมพ์รหัสแทนสแกนบ่อย = QR อาจเสีย (design §8 ข้อ 2) */
  private async flagTypedOften(qrId: string): Promise<void> {
    await this.pool.query(
      `UPDATE app.box_qr_code_tb
       SET health = CASE WHEN health IN ('ok', 'expiring') THEN 'suspicious' ELSE health END,
           health_reasons = CASE WHEN 'rider_typed_often' = ANY(health_reasons) THEN health_reasons ELSE array_append(health_reasons, 'rider_typed_often') END
       WHERE box_qr_code_id = $1
         AND (SELECT count(*) FROM app.scan_log_tb s
              WHERE s.box_qr_code_id = $1 AND s.actor_kind = 'rider' AND s.method = 'code' AND s.result = 'ok'
                AND s.created_date > now() - interval '7 days') >= $2`,
      [qrId, RIDER_TYPED_LIMIT],
    );
  }

  private log(boxId: string | null, qrId: string | null, method: 'scan' | 'code', raw: string, result: string, ip: string | null) {
    return this.pool.query(
      `INSERT INTO app.scan_log_tb (actor_kind, box_id, box_qr_code_id, qr_kind, method, raw, result, ip)
       VALUES ('rider', $1, $2, 'front', $3, $4, $5, $6)`,
      [boxId, qrId, method, raw.slice(0, 100), result, ip],
    );
  }
}
