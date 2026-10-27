import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { assignGroupCode } from '../agency/agency.service.js';
import { AccountService, adminExclusive } from '../auth/account.service.js';
import { PasswordService } from '../auth/password.service.js';
import { newTempPassword } from '../common/codes.js';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx, type Db } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';

type AgencyStatus = 'pending' | 'approved' | 'rejected';

export interface AdminAgencyRow {
  id: string;
  name: string;
  type: string;
  status: AgencyStatus;
  group_code: string | null;
  created_at: string;
  heads: { id: string; display_name: string }[];
}

export interface AdminAgencyDetail extends AdminAgencyRow {
  reject_reason: string | null;
  approved_at: string | null;
  heads_contact: { id: string; name: string; display_name: string; phone: string }[];
  counts: { members_active: number; members_pending: number; zones: number; houses: number };
}

const notPending = () => new AppError(HttpStatus.CONFLICT, 'AGENCY_NOT_PENDING', 'this agency was already decided');

// docs/api.md §9.2
@Injectable()
export class AdminAgencyService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly account: AccountService,
    private readonly passwords: PasswordService,
    private readonly notifications: NotificationService,
  ) {}

  async list(q: { status?: AgencyStatus; q?: string }): Promise<AdminAgencyRow[]> {
    const { rows } = await this.pool.query<{
      agency_id: string;
      name: string;
      type: string;
      status: AgencyStatus;
      group_code: string | null;
      created_date: Date;
      heads: { id: string; display_name: string }[];
    }>(
      `SELECT a.agency_id, a.name, a.type, a.status, a.group_code, a.created_date,
              COALESCE((SELECT json_agg(json_build_object('id', u.user_id, 'display_name', u.display_name))
                        FROM app.agency_member_tb m JOIN app.user_tb u ON u.user_id = m.user_id
                        WHERE m.agency_id = a.agency_id AND m.is_head), '[]') AS heads
       FROM app.agency_tb a
       WHERE ($1::text IS NULL OR a.status = $1)
         AND ($2::text IS NULL OR a.name ILIKE '%' || $2 || '%')
       ORDER BY (a.status = 'pending') DESC, a.created_date DESC
       LIMIT 500`,
      [q.status ?? null, q.q ?? null],
    );
    return rows.map((r) => ({
      id: r.agency_id,
      name: r.name,
      type: r.type,
      status: r.status,
      group_code: r.group_code,
      created_at: r.created_date.toISOString(),
      heads: r.heads,
    }));
  }

  /** มีเบอร์หัวหน้า → บันทึก data access log (api.md §12) */
  async get(adminId: string, agencyId: string): Promise<AdminAgencyDetail> {
    const { rows } = await this.pool.query<{
      agency_id: string;
      name: string;
      type: string;
      status: AgencyStatus;
      group_code: string | null;
      reject_reason: string | null;
      created_date: Date;
      approved_date: Date | null;
      members_active: number;
      members_pending: number;
      zones: number;
      houses: number;
    }>(
      `SELECT a.agency_id, a.name, a.type, a.status, a.group_code, a.reject_reason, a.created_date, a.approved_date,
              (SELECT count(*)::int FROM app.agency_member_tb m WHERE m.agency_id = a.agency_id AND m.status = 'active') AS members_active,
              (SELECT count(*)::int FROM app.agency_member_tb m WHERE m.agency_id = a.agency_id AND m.status = 'pending') AS members_pending,
              (SELECT count(*)::int FROM app.zone_tb z WHERE z.agency_id = a.agency_id AND z.deleted_date IS NULL) AS zones,
              (SELECT count(DISTINCT zb.box_id)::int FROM app.zone_box_tb zb JOIN app.zone_tb z ON z.zone_id = zb.zone_id
                 WHERE z.agency_id = a.agency_id AND z.deleted_date IS NULL) AS houses
       FROM app.agency_tb a WHERE a.agency_id = $1`,
      [agencyId],
    );
    const a = rows[0];
    if (!a) throw new NotFoundException();
    const heads = await this.pool.query<{ user_id: string; name: string; display_name: string; phone: string }>(
      `SELECT u.user_id, u.name, u.display_name, u.phone
       FROM app.agency_member_tb m JOIN app.user_tb u ON u.user_id = m.user_id
       WHERE m.agency_id = $1 AND m.is_head ORDER BY m.created_date`,
      [agencyId],
    );
    await this.pool.query(
      `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields)
       VALUES ($1, 'agency', $2, '{heads.name,heads.phone}')`,
      [adminId, agencyId],
    );
    return {
      id: a.agency_id,
      name: a.name,
      type: a.type,
      status: a.status,
      group_code: a.group_code,
      created_at: a.created_date.toISOString(),
      approved_at: a.approved_date?.toISOString() ?? null,
      reject_reason: a.reject_reason,
      heads: heads.rows.map((h) => ({ id: h.user_id, display_name: h.display_name })),
      heads_contact: heads.rows.map((h) => ({ id: h.user_id, name: h.name, display_name: h.display_name, phone: h.phone })),
      counts: { members_active: a.members_active, members_pending: a.members_pending, zones: a.zones, houses: a.houses },
    };
  }

  /** อนุมัติ → รหัสกลุ่ม + หัวหน้าได้บทบาทเจ้าหน้าที่ → แจ้งหัวหน้า (L03) */
  async approve(adminId: string, agencyId: string): Promise<{ group_code: string }> {
    const { code, name, heads } = await withTx(this.pool, async (db) => {
      const a = await this.lockAgency(db, agencyId);
      if (a.status !== 'pending') throw notPending();
      await db.query(
        `UPDATE app.agency_tb SET status = 'approved', approved_by = $2, approved_date = now(), reject_reason = NULL
         WHERE agency_id = $1`,
        [agencyId, adminId],
      );
      const code = await assignGroupCode(db, agencyId);
      const { rows: heads } = await db.query<{ user_id: string }>(
        `UPDATE app.agency_member_tb SET status = 'active', decided_by = $2, decided_date = now()
         WHERE agency_id = $1 AND is_head RETURNING user_id`,
        [agencyId, adminId],
      );
      for (const h of heads) await this.account.grantRole(db, h.user_id, 'officer', { grantedBy: adminId, status: 'active' });
      return { code, name: a.name, heads: heads.map((h) => h.user_id) };
    });
    await this.notifications.notify(heads, { type: 'agency_approved', data: { agency_name: name }, link: '/agency' });
    return { group_code: code };
  }

  async reject(adminId: string, agencyId: string, reason?: string): Promise<void> {
    const { name, heads } = await withTx(this.pool, async (db) => {
      const a = await this.lockAgency(db, agencyId);
      if (a.status !== 'pending') throw notPending();
      await db.query(`UPDATE app.agency_tb SET status = 'rejected', reject_reason = $2 WHERE agency_id = $1`, [
        agencyId,
        reason ?? null,
      ]);
      const { rows: heads } = await db.query<{ user_id: string }>(
        `UPDATE app.agency_member_tb SET status = 'rejected', decided_by = $2, decided_date = now()
         WHERE agency_id = $1 RETURNING user_id`,
        [agencyId, adminId],
      );
      for (const h of heads) await this.account.bumpPerm(db, h.user_id);
      return { name: a.name, heads: heads.map((h) => h.user_id) };
    });
    await this.notifications.notify(heads, {
      type: 'agency_rejected',
      data: { agency_name: name, reason: reason ?? null },
      link: '/agency',
    });
  }

  /**
   * แอดมินสร้างหน่วยงานให้เลย (อนุมัติแล้ว) + หัวหน้าคนแรก
   * เบอร์ใหม่ → สร้างบัญชี + รหัสชั่วคราว (ต้องเปลี่ยน + ยอมรับข้อตกลงตอนเข้าครั้งแรก)
   * เบอร์ที่มีบัญชีแล้ว (เช่น เจ้าของบ้าน) → ใช้บัญชีเดิม ไม่แตะรหัส (head_temp_password = null)
   */
  async create(
    adminId: string,
    dto: { name: string; type: string; head: { name: string; phone: string } },
  ) {
    return withTx(this.pool, async (db) => {
      const { rows } = await db.query<{ agency_id: string }>(
        `INSERT INTO app.agency_tb (name, type, status, approved_by, approved_date)
         VALUES ($1, $2, 'approved', $3, now()) RETURNING agency_id`,
        [dto.name, dto.type, adminId],
      );
      const agencyId = rows[0].agency_id;
      const code = await assignGroupCode(db, agencyId);

      let tempPassword: string | null = null;
      const existing = await db.query<{ user_id: string }>(
        `SELECT user_id FROM app.user_tb WHERE phone = $1 AND deleted_date IS NULL FOR UPDATE`,
        [dto.head.phone],
      );
      let headId = existing.rows[0]?.user_id;
      if (headId) {
        if (await this.account.hasRole(db, headId, 'admin')) throw adminExclusive();
        const m = await db.query<{ status: string }>(`SELECT status FROM app.agency_member_tb WHERE user_id = $1`, [headId]);
        if (m.rows[0] && m.rows[0].status !== 'rejected') {
          throw new AppError(HttpStatus.CONFLICT, 'ROLE_EXISTS', 'this person already belongs to an agency');
        }
        if (m.rows[0]) await db.query(`DELETE FROM app.agency_member_tb WHERE user_id = $1`, [headId]);
      } else {
        tempPassword = newTempPassword();
        const u = await db.query<{ user_id: string }>(
          `INSERT INTO app.user_tb (phone, name, display_name, password_hash, must_change_password)
           VALUES ($1, $2, $2, $3, true) RETURNING user_id`,
          [dto.head.phone, dto.head.name, await this.passwords.hash(tempPassword)],
        );
        headId = u.rows[0].user_id;
      }
      await db.query(
        `INSERT INTO app.agency_member_tb (agency_id, user_id, is_head, status, decided_by, decided_date)
         VALUES ($1, $2, true, 'active', $3, now())`,
        [agencyId, headId, adminId],
      );
      await this.account.grantRole(db, headId, 'officer', { grantedBy: adminId, status: 'active' });
      return {
        agency: { id: agencyId, name: dto.name, type: dto.type, status: 'approved' as const, group_code: code },
        head: { id: headId, existing_account: tempPassword === null },
        head_temp_password: tempPassword,
        group_code: code,
      };
    });
  }

  private async lockAgency(db: Db, agencyId: string): Promise<{ name: string; status: AgencyStatus }> {
    const { rows } = await db.query<{ name: string; status: AgencyStatus }>(
      `SELECT name, status FROM app.agency_tb WHERE agency_id = $1 FOR UPDATE`,
      [agencyId],
    );
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }
}
