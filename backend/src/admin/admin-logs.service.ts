import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';

export const ADMIN_LOG_TYPES = ['inspection', 'delivery', 'sos', 'box_problem', 'scan', 'data_access'] as const;
export type AdminLogType = (typeof ADMIN_LOG_TYPES)[number];

export interface AdminLogRow {
  id: string;
  type: AdminLogType;
  box_id: string | null;
  house_no: string | null;
  actor_name: string | null;
  qr_slot: string | null;
  method: string | null;
  result: string | null;
  details: string | null;
  created_at: string;
  fail: boolean;
}

@Injectable()
export class AdminLogsService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async list(input: { types?: AdminLogType[]; page: number; perPage: number }): Promise<{
    data: AdminLogRow[];
    page: number;
    per_page: number;
    total: number;
  }> {
    const types = input.types?.length ? input.types : null;
    const [rows, count] = await Promise.all([
      this.pool.query<{
        id: string;
        type: AdminLogType;
        box_id: string | null;
        house_no: string | null;
        actor_name: string | null;
        qr_slot: string | null;
        method: string | null;
        result: string | null;
        details: string | null;
        created_date: Date;
        fail: boolean;
      }>(
        `WITH log_event AS (
           SELECT 'scan:' || l.scan_log_id::text AS id, 'scan'::text AS type, l.box_id, b.house_no,
                  coalesce(u.display_name, l.actor_kind) AS actor_name, q.slot AS qr_slot, l.method, l.result,
                  NULL::text AS details, l.created_date, (l.result <> 'ok') AS fail
           FROM app.scan_log_tb l
           LEFT JOIN app.box_tb b ON b.box_id = l.box_id
           LEFT JOIN app.user_tb u ON u.user_id = l.user_id
           LEFT JOIN app.box_qr_code_tb q ON q.box_qr_code_id = l.box_qr_code_id
           UNION ALL
           SELECT 'inspection:' || i.inspection_id::text,
                  CASE WHEN i.status = 'box_problem' THEN 'box_problem' ELSE 'inspection' END,
                  i.box_id, b.house_no, u.display_name, q.slot, i.method, i.status, i.problem_reason, i.created_date,
                  (i.status IN ('failed', 'box_problem'))
           FROM app.inspection_tb i
           JOIN app.box_tb b ON b.box_id = i.box_id
           JOIN app.user_tb u ON u.user_id = i.officer_user_id
           JOIN app.box_qr_code_tb q ON q.box_qr_code_id = i.box_qr_code_id
           UNION ALL
           SELECT 'delivery:' || d.delivery_id::text, 'delivery', d.box_id, b.house_no, 'rider', q.slot,
                  d.method, 'delivered', NULL::text, d.created_date, false
           FROM app.delivery_tb d
           JOIN app.box_tb b ON b.box_id = d.box_id
           JOIN app.box_qr_code_tb q ON q.box_qr_code_id = d.box_qr_code_id
           UNION ALL
           SELECT 'sos:' || s.sos_case_id::text, 'sos', s.box_id, b.house_no, u.display_name, NULL::text,
                  NULL::text, s.status, s.close_note, s.created_date, (s.status IN ('open', 'accepted'))
           FROM app.sos_case_tb s
           JOIN app.box_tb b ON b.box_id = s.box_id
           JOIN app.user_tb u ON u.user_id = s.owner_user_id
           UNION ALL
           SELECT 'access:' || a.data_access_log_id::text, 'data_access', NULL::text, NULL::text,
                  u.display_name, NULL::text, NULL::text, a.subject_kind, a.fields::text, a.created_date, false
           FROM app.data_access_log_tb a
           JOIN app.user_tb u ON u.user_id = a.actor_user_id
         )
         SELECT id, type, box_id, house_no, actor_name, qr_slot, method, result, details, created_date, fail
         FROM log_event
         WHERE ($1::text[] IS NULL OR type = ANY($1::text[]))
         ORDER BY created_date DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [types, input.perPage, (input.page - 1) * input.perPage],
      ),
      this.pool.query<{ total: number }>(
        `WITH log_event AS (
           SELECT 'scan'::text AS type FROM app.scan_log_tb
           UNION ALL SELECT CASE WHEN status = 'box_problem' THEN 'box_problem' ELSE 'inspection' END FROM app.inspection_tb
           UNION ALL SELECT 'delivery'::text FROM app.delivery_tb
           UNION ALL SELECT 'sos'::text FROM app.sos_case_tb
           UNION ALL SELECT 'data_access'::text FROM app.data_access_log_tb
         )
         SELECT count(*)::int AS total FROM log_event WHERE ($1::text[] IS NULL OR type = ANY($1::text[]))`,
        [types],
      ),
    ]);

    return {
      data: rows.rows.map((row) => ({
        id: row.id,
        type: row.type,
        box_id: row.box_id,
        house_no: row.house_no,
        actor_name: row.actor_name,
        qr_slot: row.qr_slot,
        method: row.method,
        result: row.result,
        details: row.details,
        created_at: row.created_date.toISOString(),
        fail: row.fail,
      })),
      page: input.page,
      per_page: input.perPage,
      total: count.rows[0]?.total ?? 0,
    };
  }
}
