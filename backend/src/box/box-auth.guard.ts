import { BadRequestException, CanActivate, ExecutionContext, HttpStatus, Inject, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import type { Env } from '../config/env.js';
import { PG_POOL } from '../db/db.module.js';
import { deviceSecret, safeEqualHex, signRequest } from './box-crypto.js';

/** คำขอที่ยอมให้นาฬิกาตู้เพี้ยนได้ — `boot` (บูตครั้งแรกนาฬิกายังไม่ตรง · โปรโตคอล §1) */
const ALLOW_CLOCK_SKEW = 'boxAllowClockSkew';
export const AllowClockSkew = () => SetMetadata(ALLOW_CLOCK_SKEW, true);

/** เวลาตู้ห่างจากเซิร์ฟเวอร์ได้ไม่เกินนี้ (โปรโตคอล §1) */
export const MAX_SKEW_S = 60;
/** เก็บ nonce ไว้กันส่งซ้ำนานเท่านี้ (> MAX_SKEW_S มาก) */
export const NONCE_KEEP_MIN = 10;

export type BoxRequest = Request & { box?: { id: string } };

type FailReason = 'missing_headers' | 'unknown_box' | 'clock_skew' | 'bad_signature' | 'replay';

/**
 * ยืนยันตัวตนตู้ทุกคำขอ (โปรโตคอล §1 · api.md §13.0):
 * header X-Box-Id / X-Timestamp / X-Nonce / X-Signature → ลายเซ็นตรง → เวลาไม่เพี้ยน → nonce ไม่ซ้ำ
 * ไม่ผ่าน → 401 BOX_AUTH_FAILED + `reason` + `server_time` (ตู้ตั้งนาฬิกาแล้วลองใหม่ 1 ครั้ง) + บันทึก box_auth_log_tb
 * ผ่าน → แปลง body (raw) เป็น JSON ให้ handler · ทุกคำตอบมี header X-Server-Time (รวม 204 และ error)
 *
 * nonce เก็บใน Postgres (ไม่ใช่ Redis) — กันส่งซ้ำต้องไม่ "ปล่อยผ่านเมื่อ Redis ล่ม" แบบ rate limit
 */
@Injectable()
export class BoxAuthGuard implements CanActivate {
  private readonly logger = new Logger('BoxAuth');
  private lastPurge = 0;

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly config: ConfigService<Env, true>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<BoxRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const nowS = Math.floor(Date.now() / 1000);
    res.setHeader('X-Server-Time', String(nowS));

    const h = (name: string) => {
      const v = req.headers[name];
      return typeof v === 'string' ? v.trim() : '';
    };
    const boxId = h('x-box-id');
    const ts = h('x-timestamp');
    const nonce = h('x-nonce');
    const sig = h('x-signature');

    const fail = async (reason: FailReason): Promise<never> => {
      await this.pool
        .query(`INSERT INTO app.box_auth_log_tb (claimed_box_id, reason, method, path, ip) VALUES ($1, $2, $3, $4, $5)`, [
          boxId.slice(0, 20) || null,
          reason,
          req.method,
          req.originalUrl.slice(0, 300),
          req.ip ?? null,
        ])
        .catch((err: Error) => this.logger.error(`cannot log box auth failure: ${err.message}`));
      throw new AppError(HttpStatus.UNAUTHORIZED, 'BOX_AUTH_FAILED', `box authentication failed: ${reason}`, {
        reason,
        server_time: nowS,
      });
    };

    if (!/^BX-\d{5,10}$/.test(boxId) || !/^\d{1,12}$/.test(ts) || !/^[A-Za-z0-9_-]{8,64}$/.test(nonce) || !/^[0-9a-fA-F]{64}$/.test(sig)) {
      return fail('missing_headers');
    }

    const { rows } = await this.pool.query<{ secret_kid: number }>(`SELECT secret_kid FROM app.box_tb WHERE box_id = $1`, [boxId]);
    if (!rows[0]) return fail('unknown_box');

    // body ดิบ (configureApp ให้ /v1/box อ่านเป็น Buffer) — ต้องเซ็นจากไบต์ที่ตู้ส่งจริง ไม่ใช่ JSON ที่แปลงแล้ว
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const secret = deviceSecret(this.config.get('BOX_MASTER_KEY', { infer: true }), boxId);
    const expected = signRequest(secret, req.method, req.originalUrl, ts, nonce, raw);
    if (!safeEqualHex(expected, sig)) return fail('bad_signature');

    const allowSkew = this.reflector.getAllAndOverride<boolean>(ALLOW_CLOCK_SKEW, [ctx.getHandler(), ctx.getClass()]);
    if (!allowSkew && Math.abs(nowS - Number(ts)) > MAX_SKEW_S) return fail('clock_skew');

    await this.purgeNonces();
    const inserted = await this.pool.query(
      `INSERT INTO app.box_nonce_tb (box_id, nonce) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`,
      [boxId, nonce],
    );
    if (!inserted.rowCount) return fail('replay');

    let body: unknown = {};
    if (raw.length) {
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        throw new BadRequestException('body must be JSON');
      }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('body must be a JSON object');
    req.body = body;
    req.box = { id: boxId };
    return true;
  }

  /** ลบ nonce เก่า อย่างมากนาทีละครั้ง */
  private async purgeNonces(): Promise<void> {
    if (Date.now() - this.lastPurge < 60_000) return;
    this.lastPurge = Date.now();
    await this.pool
      .query(`DELETE FROM app.box_nonce_tb WHERE created_date < now() - make_interval(mins => $1)`, [NONCE_KEEP_MIN])
      .catch((err: Error) => this.logger.warn(`nonce purge failed: ${err.message}`));
  }
}
