import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import type { Db } from '../db/tx.js';

export interface CurrentTerms {
  version: string;
  published_at: string;
  body_md: string;
}

@Injectable()
export class TermsService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** ฉบับล่าสุดที่ประกาศแล้ว (api.md §2 — ชื่อฟิลด์ของ API) */
  async current(db: Db = this.pool): Promise<CurrentTerms> {
    const { rows } = await db.query<{ terms_version: string; published_date: Date; body_md: string }>(
      `SELECT terms_version, published_date, body_md FROM app.terms_tb
       WHERE published_date <= now() ORDER BY published_date DESC LIMIT 1`,
    );
    if (!rows[0]) throw new NotFoundException('no terms published');
    return { version: rows[0].terms_version, published_at: rows[0].published_date.toISOString(), body_md: rows[0].body_md };
  }

  /** ต้องยอมรับฉบับปัจจุบันเท่านั้น — ไม่ตรง/ไม่มี = ไม่สร้างบัญชี */
  async assertCurrent(db: Db, version: string): Promise<void> {
    const cur = await this.current(db).catch(() => null);
    if (!cur || cur.version !== version) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'TERMS_NOT_ACCEPTED', 'accept the current terms to continue');
    }
  }

  /** มีข้อตกลงฉบับที่ประกาศแล้วที่ผู้ใช้ยังไม่ยอมรับไหม (ยังไม่มีข้อตกลงเลย = ไม่ต้อง) */
  async needsAcceptance(db: Db, userId: string): Promise<boolean> {
    const { rows } = await db.query<{ needs: boolean }>(
      `WITH cur AS (
         SELECT terms_version FROM app.terms_tb WHERE published_date <= now()
         ORDER BY published_date DESC LIMIT 1
       )
       SELECT EXISTS (SELECT 1 FROM cur) AND NOT EXISTS (
         SELECT 1 FROM app.terms_acceptance_tb a JOIN cur USING (terms_version) WHERE a.user_id = $1
       ) AS needs`,
      [userId],
    );
    return rows[0].needs;
  }

  async accept(db: Db, userId: string, version: string, meta: { ip?: string; userAgent?: string }): Promise<void> {
    await db.query(
      `INSERT INTO app.terms_acceptance_tb (user_id, terms_version, ip, user_agent)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [userId, version, meta.ip ?? null, meta.userAgent?.slice(0, 500) ?? null],
    );
  }
}
