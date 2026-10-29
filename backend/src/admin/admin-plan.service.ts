import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { withTx } from '../db/tx.js';

const PLAN_CODE = /^[a-z][a-z0-9_]{1,30}$/;
const DEFAULT_PLAN_LOCK = 'smmb_default_plan';
const PLAN_TIME_ZONE = 'Asia/Bangkok';

export interface AdminPlanDto {
  code: string;
  name_th: string;
  name_en: string;
  price_note: string | null;
  features: Record<string, number | boolean>;
  is_default: boolean;
  is_active: boolean;
  owners_count: number;
}

export interface UserPlanDto {
  id: string;
  user_id: string;
  plan_code: string;
  starts_at: string;
  ends_at: string | null;
  note: string | null;
  set_by: string | null;
}

interface PlanRow extends Omit<AdminPlanDto, 'owners_count'> {
  owners_count: number;
}

@Injectable()
export class AdminPlanService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async list(): Promise<AdminPlanDto[]> {
    const { rows } = await this.pool.query<PlanRow>(
      `SELECT p.plan_code AS code, p.name_th, p.name_en, p.price_note, p.features, p.is_default, p.is_active,
              count(DISTINCT up.user_id) FILTER (WHERE tstzrange(up.start_date, up.end_date) @> now())::int AS owners_count
       FROM app.plan_tb p
       LEFT JOIN app.user_plan_tb up ON up.plan_code = p.plan_code
       GROUP BY p.plan_code
       ORDER BY p.sort_order, p.plan_code`,
    );
    return rows;
  }

  async create(input: { code: string; name_th: string; name_en: string; price_note?: string }): Promise<AdminPlanDto> {
    const code = input.code.trim().toLowerCase();
    const nameTh = input.name_th.trim();
    const nameEn = input.name_en.trim();
    if (!PLAN_CODE.test(code)) throw new ConflictException({ code: 'PLAN_CODE_INVALID' });
    if (!nameTh || !nameEn) throw new ConflictException({ code: 'PLAN_NAME_REQUIRED' });
    try {
      await this.pool.query(
        `INSERT INTO app.plan_tb (plan_code, name_th, name_en, price_note, sort_order)
         VALUES ($1, $2, $3, $4, (SELECT coalesce(max(sort_order), -1) + 1 FROM app.plan_tb))`,
        [code, nameTh, nameEn, input.price_note?.trim() || null],
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'PLAN_CODE_TAKEN' });
      throw error;
    }
    const plan = (await this.list()).find((item) => item.code === code);
    if (!plan) throw new NotFoundException();
    return plan;
  }

  async update(code: string, input: { is_default?: boolean; is_active?: boolean }): Promise<AdminPlanDto> {
    await withTx(this.pool, async (db) => {
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [DEFAULT_PLAN_LOCK]);
      const { rows } = await db.query<{ is_active: boolean; is_default: boolean }>(
        `SELECT is_active, is_default FROM app.plan_tb WHERE plan_code = $1 FOR UPDATE`,
        [code],
      );
      const current = rows[0];
      if (!current) throw new NotFoundException();
      if (input.is_default === true && input.is_active === false) {
        throw new ConflictException({ code: 'PLAN_DEFAULT_MUST_BE_ACTIVE' });
      }
      if (input.is_default === true) {
        await db.query(`UPDATE app.plan_tb SET is_default = false WHERE is_default = true AND plan_code <> $1`, [code]);
        await db.query(`UPDATE app.plan_tb SET is_default = true, is_active = true WHERE plan_code = $1`, [code]);
      } else if (input.is_active === false) {
        if (current.is_default) throw new ConflictException({ code: 'PLAN_DEFAULT_MUST_BE_ACTIVE' });
        await db.query(`UPDATE app.plan_tb SET is_active = false WHERE plan_code = $1`, [code]);
      } else if (input.is_active === true) {
        await db.query(`UPDATE app.plan_tb SET is_active = true WHERE plan_code = $1`, [code]);
      } else if (input.is_default === false && current.is_default) {
        throw new ConflictException({ code: 'PLAN_DEFAULT_REQUIRED' });
      }
    });
    const plan = (await this.list()).find((item) => item.code === code);
    if (!plan) throw new NotFoundException();
    return plan;
  }

  async userHistory(userId: string): Promise<UserPlanDto[]> {
    await this.assertOwner(userId, this.pool);
    const { rows } = await this.pool.query<UserPlanDto>(
      `SELECT up.user_plan_id::text AS id, up.user_id, up.plan_code,
              to_char((up.start_date AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS starts_at,
              CASE WHEN up.end_date IS NULL THEN NULL
                   ELSE to_char(((up.end_date AT TIME ZONE $2)::date - 1), 'YYYY-MM-DD') END AS ends_at,
              up.note, setter.display_name AS set_by
       FROM app.user_plan_tb up
       LEFT JOIN app.user_tb setter ON setter.user_id = up.set_by
       WHERE up.user_id = $1
       ORDER BY up.start_date DESC, up.user_plan_id DESC`,
      [userId, PLAN_TIME_ZONE],
    );
    return rows;
  }

  async setUserPlan(
    adminId: string,
    userId: string,
    input: { plan_code: string; ends_at?: string; note?: string },
  ): Promise<UserPlanDto[]> {
    try {
      await withTx(this.pool, async (db) => {
        await this.assertOwner(userId, db, true);
        const { rows: planRows } = await db.query<{ is_active: boolean }>(
          `SELECT is_active FROM app.plan_tb WHERE plan_code = $1 FOR SHARE`,
          [input.plan_code],
        );
        if (!planRows[0]) throw new NotFoundException();
        if (!planRows[0].is_active) throw new BadRequestException({ code: 'PLAN_INACTIVE' });
        if (input.ends_at) {
          const { rows: dates } = await db.query<{ is_future: boolean }>(
            `SELECT $1::date > (now() AT TIME ZONE $2)::date AS is_future`,
            [input.ends_at, PLAN_TIME_ZONE],
          );
          if (!dates[0]?.is_future) throw new BadRequestException({ code: 'PLAN_END_MUST_BE_FUTURE' });
        }

        const { rows: current } = await db.query<{ user_plan_id: string }>(
          `SELECT user_plan_id FROM app.user_plan_tb
           WHERE user_id = $1 AND tstzrange(start_date, end_date) @> now() FOR UPDATE`,
          [userId],
        );
        if (current[0]) {
          await db.query(`UPDATE app.user_plan_tb SET end_date = now() WHERE user_plan_id = $1`, [current[0].user_plan_id]);
        }
        await db.query(
          `INSERT INTO app.user_plan_tb (user_id, plan_code, start_date, end_date, set_by, note)
           VALUES ($1, $2, now(), CASE WHEN $3::date IS NULL THEN NULL ELSE (($3::date + 1)::timestamp AT TIME ZONE $4) END, $5, $6)`,
          [userId, input.plan_code, input.ends_at ?? null, PLAN_TIME_ZONE, adminId, input.note?.trim() || null],
        );
        await db.query(
          `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields)
           VALUES ($1, 'user', $2, '{plan}')`,
          [adminId, userId],
        );
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw new ConflictException({ code: 'PLAN_OVERLAP' });
      throw error;
    }
    return this.userHistory(userId);
  }

  private async assertOwner(userId: string, db: pg.Pool | pg.PoolClient, lock = false): Promise<void> {
    const lockClause = lock ? ' FOR UPDATE OF u' : '';
    const { rows } = await db.query<{ user_id: string }>(
      `SELECT u.user_id FROM app.user_tb u
       WHERE u.user_id = $1 AND u.deleted_date IS NULL
         AND EXISTS (SELECT 1 FROM app.user_role_tb r WHERE r.user_id = u.user_id AND r.role = 'owner')${lockClause}`,
      [userId],
    );
    if (!rows[0]) throw new BadRequestException({ code: 'NOT_OWNER' });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function isExclusionViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23P01';
}
