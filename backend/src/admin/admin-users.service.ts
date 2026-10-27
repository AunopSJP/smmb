import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { cannotChangeSelf } from '../agency/agency.service.js';
import { AccountService, type Role } from '../auth/account.service.js';
import { SessionService } from '../auth/session.service.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx } from '../db/tx.js';
import type { Page } from '../push/notification.service.js';

export interface AdminUserRow {
  id: string;
  name: string;
  display_name: string;
  phone: string;
  status: 'active' | 'disabled';
  roles: { role: Role; level: number; status: 'active' | 'disabled' }[];
  agency: { id: string; name: string; status: string; is_head: boolean } | null;
  created_at: string;
}

export interface AdminUserDetail extends AdminUserRow {
  house_no: string | null;
  must_change_password: boolean;
  plan: { code: string; name_th: string; name_en: string; start_at: string; end_at: string | null } | null;
  active_sessions: number;
}

// คอลัมน์ที่ส่งออกได้ — ระบุทีละตัว (CLAUDE.md กฎข้อ 12)
const USER_SELECT = `
  u.user_id, u.name, u.display_name, u.phone, u.status, u.created_date,
  COALESCE((SELECT json_agg(json_build_object('role', r.role, 'level', r.level, 'status', r.status) ORDER BY r.role)
            FROM app.user_role_tb r WHERE r.user_id = u.user_id), '[]') AS roles,
  (SELECT json_build_object('id', a.agency_id, 'name', a.name, 'status', m.status, 'is_head', m.is_head)
   FROM app.agency_member_tb m JOIN app.agency_tb a ON a.agency_id = m.agency_id WHERE m.user_id = u.user_id) AS agency`;

type UserRowDb = {
  user_id: string;
  name: string;
  display_name: string;
  phone: string;
  status: 'active' | 'disabled';
  created_date: Date;
  roles: AdminUserRow['roles'];
  agency: AdminUserRow['agency'];
};

const toRow = (r: UserRowDb): AdminUserRow => ({
  id: r.user_id,
  name: r.name,
  display_name: r.display_name,
  phone: r.phone,
  status: r.status,
  roles: r.roles,
  agency: r.agency,
  created_at: r.created_date.toISOString(),
});

// docs/api.md §9.3
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly account: AccountService,
    private readonly sessions: SessionService,
  ) {}

  async list(q: { role?: Role | 'head'; status?: string; q?: string; page: number; perPage: number }): Promise<Page<AdminUserRow>> {
    // ค้นด้วยเบอร์: ตัดขีด/ช่องว่างออกก่อน (เก็บแบบไม่มีขีด)
    const phoneQ = q.q?.replace(/[\s\-.()]/g, '') || null;
    const { rows } = await this.pool.query<UserRowDb & { total: string }>(
      `SELECT ${USER_SELECT}, count(*) OVER () AS total
       FROM app.user_tb u
       WHERE u.deleted_date IS NULL
         AND ($1::text IS NULL OR u.status = $1)
         AND ($2::text IS NULL
              OR ($2 = 'head' AND EXISTS (SELECT 1 FROM app.agency_member_tb m WHERE m.user_id = u.user_id AND m.is_head))
              OR EXISTS (SELECT 1 FROM app.user_role_tb r WHERE r.user_id = u.user_id AND r.role = $2))
         AND ($3::text IS NULL OR u.name ILIKE '%' || $3 || '%' OR u.display_name ILIKE '%' || $3 || '%'
              OR ($4::text <> '' AND u.phone LIKE '%' || $4 || '%'))
       ORDER BY u.created_date DESC, u.user_id
       LIMIT $5 OFFSET $6`,
      [q.status ?? null, q.role ?? null, q.q ?? null, phoneQ ?? '', q.perPage, (q.page - 1) * q.perPage],
    );
    return { data: rows.map(toRow), page: q.page, per_page: q.perPage, total: Number(rows[0]?.total ?? 0) };
  }

  /** ข้อมูลเต็ม — ทุกการเปิดดูบันทึก data access log (api.md §11–12) */
  async get(adminId: string, userId: string): Promise<AdminUserDetail> {
    const { rows } = await this.pool.query<
      UserRowDb & {
        house_no: string | null;
        must_change_password: boolean;
        active_sessions: number;
        plan: AdminUserDetail['plan'];
      }
    >(
      `SELECT ${USER_SELECT}, u.house_no, u.must_change_password,
              (SELECT count(*)::int FROM app.session_tb s
               WHERE s.user_id = u.user_id AND s.revoked_date IS NULL AND s.expire_date > now()
                 AND s.token_version = u.token_version) AS active_sessions,
              (SELECT json_build_object('code', p.plan_code, 'name_th', p.name_th, 'name_en', p.name_en,
                                        'start_at', up.start_date, 'end_at', up.end_date)
               FROM app.user_plan_tb up JOIN app.plan_tb p ON p.plan_code = up.plan_code
               WHERE up.user_id = u.user_id AND tstzrange(up.start_date, up.end_date) @> now()) AS plan
       FROM app.user_tb u WHERE u.user_id = $1 AND u.deleted_date IS NULL`,
      [userId],
    );
    const r = rows[0];
    if (!r) throw new NotFoundException();
    await this.pool.query(
      `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields)
       VALUES ($1, 'user', $2, '{name,phone,house_no}')`,
      [adminId, userId],
    );
    return {
      ...toRow(r),
      house_no: r.house_no,
      must_change_password: r.must_change_password,
      plan: r.plan,
      active_sessions: r.active_sessions,
    };
  }

  /** ปิดทั้งบัญชี = เตะทุกเครื่อง */
  async setStatus(adminId: string, userId: string, status: 'active' | 'disabled'): Promise<void> {
    if (userId === adminId) throw cannotChangeSelf();
    await withTx(this.pool, async (db) => {
      const { rowCount } = await db.query(
        `UPDATE app.user_tb SET status = $2 WHERE user_id = $1 AND deleted_date IS NULL`,
        [userId, status],
      );
      if (!rowCount) throw new NotFoundException();
      if (status === 'disabled') await this.sessions.revokeAll(db, userId);
      await this.account.bumpPerm(db, userId);
    });
  }

  async putRole(
    adminId: string,
    userId: string,
    role: Role,
    opts: { level?: number; status?: 'active' | 'disabled' },
  ): Promise<void> {
    if (userId === adminId) throw cannotChangeSelf(); // กันแอดมินลด/ปิดสิทธิ์ตัวเอง
    await withTx(this.pool, async (db) => {
      await this.lockUser(db, userId);
      await this.account.grantRole(db, userId, role, { grantedBy: adminId, ...opts });
    });
  }

  async deleteRole(adminId: string, userId: string, role: Role): Promise<void> {
    if (userId === adminId) throw cannotChangeSelf();
    await withTx(this.pool, async (db) => {
      await this.lockUser(db, userId);
      const { rowCount } = await db.query(`DELETE FROM app.user_role_tb WHERE user_id = $1 AND role = $2`, [userId, role]);
      if (!rowCount) throw new NotFoundException();
      if (role === 'officer') {
        // ไม่ใช่เจ้าหน้าที่แล้ว → ออกจากหน่วยงานและโซนด้วย (กันค้างเป็นหัวหน้า)
        await db.query(
          `UPDATE app.agency_member_tb SET status = 'disabled', is_head = false WHERE user_id = $1`,
          [userId],
        );
        await db.query(`DELETE FROM app.zone_officer_tb WHERE user_id = $1`, [userId]);
      }
      await this.account.bumpPerm(db, userId);
    });
  }

  /** รีเซ็ตรหัสใครก็ได้ ยกเว้นตัวเอง (ใช้เปลี่ยนรหัสแทน) */
  async resetPassword(adminId: string, userId: string): Promise<{ temp_password: string }> {
    if (userId === adminId) throw cannotChangeSelf();
    return withTx(this.pool, async (db) => {
      await this.lockUser(db, userId);
      return { temp_password: await this.account.resetPassword(db, userId) };
    });
  }

  private async lockUser(db: pg.PoolClient, userId: string): Promise<void> {
    const { rows } = await db.query(
      `SELECT 1 FROM app.user_tb WHERE user_id = $1 AND deleted_date IS NULL FOR UPDATE`,
      [userId],
    );
    if (!rows[0]) throw new NotFoundException();
  }
}
