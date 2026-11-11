import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';

export const ADMIN_LOG_TYPES = ['inspection', 'delivery', 'sos', 'box_problem', 'scan', 'data_access', 'terms'] as const;
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

/**
 * หนึ่งแหล่งของ log — แยกเป็น branch ละ type เพื่อ
 * 1) กรอง `type` ได้โดยไม่ต้อง UNION ตารางที่ไม่ขอ
 * 2) ตัดแถวต่อ branch ก่อน UNION (ORDER BY + LIMIT) แทนการรวมทั้งตารางแล้ว sort
 * 3) นับจำนวนต่อ branch ด้วย count(*) ล้วน (ใช้ index created_date ได้)
 */
interface LogBranch {
  type: AdminLogType;
  select: string;
  count: string;
}

const BRANCHES: LogBranch[] = [
  {
    type: 'scan',
    select: `SELECT 'scan:' || l.scan_log_id::text AS id, 'scan'::text AS type, l.box_id, b.house_no,
                    coalesce(u.display_name, l.actor_kind) AS actor_name, q.slot AS qr_slot, l.method, l.result,
                    NULL::text AS details, l.created_date, (l.result <> 'ok') AS fail
             FROM app.scan_log_tb l
             LEFT JOIN app.box_tb b ON b.box_id = l.box_id
             LEFT JOIN app.user_tb u ON u.user_id = l.user_id
             LEFT JOIN app.box_qr_code_tb q ON q.box_qr_code_id = l.box_qr_code_id`,
    count: `SELECT count(*)::int FROM app.scan_log_tb`,
  },
  {
    type: 'inspection',
    select: `SELECT 'inspection:' || i.inspection_id::text, 'inspection'::text, i.box_id, b.house_no,
                    u.display_name, q.slot, i.method, i.status, i.problem_reason, i.created_date,
                    (i.status = 'failed')
             FROM app.inspection_tb i
             JOIN app.box_tb b ON b.box_id = i.box_id
             JOIN app.user_tb u ON u.user_id = i.officer_user_id
             JOIN app.box_qr_code_tb q ON q.box_qr_code_id = i.box_qr_code_id
             WHERE i.status <> 'box_problem'`,
    count: `SELECT count(*)::int FROM app.inspection_tb WHERE status <> 'box_problem'`,
  },
  {
    type: 'box_problem',
    select: `SELECT 'inspection:' || i.inspection_id::text, 'box_problem'::text, i.box_id, b.house_no,
                    u.display_name, q.slot, i.method, i.status, i.problem_reason, i.created_date, true
             FROM app.inspection_tb i
             JOIN app.box_tb b ON b.box_id = i.box_id
             JOIN app.user_tb u ON u.user_id = i.officer_user_id
             JOIN app.box_qr_code_tb q ON q.box_qr_code_id = i.box_qr_code_id
             WHERE i.status = 'box_problem'`,
    count: `SELECT count(*)::int FROM app.inspection_tb WHERE status = 'box_problem'`,
  },
  {
    type: 'delivery',
    select: `SELECT 'delivery:' || d.delivery_id::text, 'delivery'::text, d.box_id, b.house_no, 'rider'::text, q.slot,
                    d.method, 'delivered'::text, NULL::text, d.created_date, false
             FROM app.delivery_tb d
             JOIN app.box_tb b ON b.box_id = d.box_id
             JOIN app.box_qr_code_tb q ON q.box_qr_code_id = d.box_qr_code_id`,
    count: `SELECT count(*)::int FROM app.delivery_tb`,
  },
  {
    type: 'sos',
    select: `SELECT 'sos:' || s.sos_case_id::text, 'sos'::text, s.box_id, b.house_no, u.display_name, NULL::text,
                    NULL::text, s.status, s.close_note, s.created_date, (s.status IN ('open', 'accepted'))
             FROM app.sos_case_tb s
             JOIN app.box_tb b ON b.box_id = s.box_id
             JOIN app.user_tb u ON u.user_id = s.owner_user_id`,
    count: `SELECT count(*)::int FROM app.sos_case_tb`,
  },
  {
    type: 'data_access',
    select: `SELECT 'access:' || a.data_access_log_id::text, 'data_access'::text, NULL::text, NULL::text,
                    u.display_name, NULL::text, NULL::text, a.subject_kind, a.fields::text, a.created_date, false
             FROM app.data_access_log_tb a
             JOIN app.user_tb u ON u.user_id = a.actor_user_id`,
    count: `SELECT count(*)::int FROM app.data_access_log_tb`,
  },
  {
    type: 'terms',
    select: `SELECT 'terms:' || t.user_id || ':' || t.terms_version, 'terms'::text, NULL::text, NULL::text,
                    u.display_name, NULL::text, NULL::text, t.terms_version, NULL::text, t.created_date, false
             FROM app.terms_acceptance_tb t
             JOIN app.user_tb u ON u.user_id = t.user_id`,
    count: `SELECT count(*)::int FROM app.terms_acceptance_tb`,
  },
];

@Injectable()
export class AdminLogsService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async list(input: { types?: AdminLogType[]; page: number; perPage: number }): Promise<{
    data: AdminLogRow[];
    page: number;
    per_page: number;
    total: number;
  }> {
    const selected = input.types?.length ? BRANCHES.filter((b) => input.types!.includes(b.type)) : BRANCHES;
    const empty = { data: [] as AdminLogRow[], page: input.page, per_page: input.perPage, total: 0 };
    if (!selected.length) return empty;

    const offset = (input.page - 1) * input.perPage;
    // เอาเฉพาะ top (offset + perPage) ของแต่ละ branch — เพียงพอสำหรับหน้าปัจจุบัน
    // (แถวระดับโลก top N ต้องมาจาก top N ของทุก branch) จึงไม่ต้อง sort ทั้งตาราง
    const union = selected.map((b) => `(${b.select} ORDER BY created_date DESC LIMIT $1)`).join('\nUNION ALL\n');
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
        `SELECT id, type, box_id, house_no, actor_name, qr_slot, method, result, details, created_date, fail
         FROM (${union}) log_event
         ORDER BY created_date DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [offset + input.perPage, input.perPage, offset],
      ),
      this.pool.query<{ total: number }>(
        `SELECT (${selected.map((b) => `(${b.count})`).join(' + ')})::int AS total`,
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
