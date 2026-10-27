import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import type { Env } from '../config/env.js';
import { PG_POOL } from '../db/db.module.js';
import type { Db } from '../db/tx.js';

export const SESSION_COOKIE = 'sid';

/** ต่ออายุ session เมื่อใช้งานห่างจากครั้งก่อนเกินเท่านี้ (ไม่ต้องเขียน DB ทุกคำขอ) */
const TOUCH_AFTER_MS = 60 * 60 * 1000;

export interface AuthContext {
  userId: string;
  sessionId: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class SessionService {
  private readonly ttlMs: number;
  private readonly secureCookie: boolean;

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('SESSION_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000;
    this.secureCookie = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /** สร้าง session ใหม่ · คืน token ดิบ (ใส่ cookie) — ฐานข้อมูลเก็บแค่ hash */
  async create(
    db: Db,
    userId: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ token: string; sessionId: string }> {
    const token = randomBytes(32).toString('base64url');
    const { rows } = await db.query<{ session_id: string }>(
      `INSERT INTO app.session_tb (token_hash, user_id, token_version, user_agent, ip, last_seen_date, expire_date)
       SELECT $1, u.user_id, u.token_version, $3, $4, now(), now() + make_interval(secs => $5::double precision / 1000)
       FROM app.user_tb u WHERE u.user_id = $2
       RETURNING session_id`,
      [sha256(token), userId, meta.userAgent?.slice(0, 500) ?? null, meta.ip ?? null, this.ttlMs],
    );
    return { token, sessionId: rows[0].session_id };
  }

  /** ตรวจ cookie → AuthContext หรือโยน 401 พร้อม code ตาม api.md §0 */
  async resolve(token: string | undefined): Promise<AuthContext> {
    if (!token) throw new AppError(HttpStatus.UNAUTHORIZED, 'NO_SESSION', 'sign in required');

    const { rows } = await this.pool.query<{
      session_id: string;
      user_id: string;
      token_version: number;
      user_token_version: number;
      user_status: string;
      expired: boolean;
      revoked: boolean;
      needs_touch: boolean;
    }>(
      `SELECT s.session_id, s.user_id, s.token_version,
              u.token_version AS user_token_version, u.status AS user_status,
              s.expire_date <= now() AS expired,
              s.revoked_date IS NOT NULL OR u.deleted_date IS NOT NULL AS revoked,
              s.last_seen_date IS NULL OR s.last_seen_date < now() - make_interval(secs => $2::double precision / 1000) AS needs_touch
       FROM app.session_tb s JOIN app.user_tb u ON u.user_id = s.user_id
       WHERE s.token_hash = $1`,
      [sha256(token), TOUCH_AFTER_MS],
    );
    const s = rows[0];
    // token ที่ไม่รู้จัก = หมดอายุไปแล้ว/ถูกล้าง → ให้ล็อกอินใหม่
    if (!s || s.expired) throw new AppError(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'session expired');
    if (s.revoked || s.token_version !== s.user_token_version) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'SESSION_REVOKED', 'session revoked');
    }
    if (s.user_status === 'disabled') {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'ACCOUNT_DISABLED', 'account disabled');
    }
    if (s.needs_touch) {
      await this.pool.query(
        `UPDATE app.session_tb
         SET last_seen_date = now(), expire_date = now() + make_interval(secs => $2::double precision / 1000)
         WHERE session_id = $1`,
        [s.session_id, this.ttlMs],
      );
    }
    return { userId: s.user_id, sessionId: s.session_id };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.pool.query(
      'UPDATE app.session_tb SET revoked_date = now() WHERE session_id = $1 AND revoked_date IS NULL',
      [sessionId],
    );
  }

  /** เตะทุก session ของผู้ใช้ (เปลี่ยนรหัส / ถูกรีเซ็ต / ถูกปิด) */
  async revokeAll(db: Db, userId: string): Promise<void> {
    await db.query('UPDATE app.user_tb SET token_version = token_version + 1 WHERE user_id = $1', [userId]);
    await db.query('UPDATE app.session_tb SET revoked_date = now() WHERE user_id = $1 AND revoked_date IS NULL', [
      userId,
    ]);
  }

  private cookieOptions(): CookieOptions {
    // HttpOnly: JS อ่านไม่ได้ · Lax: เปิดลิงก์จากแจ้งเตือน/LINE แล้วยังล็อกอินอยู่ (api.md §0)
    return { httpOnly: true, secure: this.secureCookie, sameSite: 'lax', path: '/' };
  }

  setCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge: this.ttlMs });
  }

  clearCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }
}
