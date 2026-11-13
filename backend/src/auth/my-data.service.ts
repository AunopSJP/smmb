import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { AuditService } from '../common/audit.service.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx, type Db } from '../db/tx.js';
import { AuthService, deviceLabel } from './auth.service.js';
import { ipHint } from './ip-hint.js';
import { SessionService } from './session.service.js';

// ข้อมูลของฉัน (api.md §3.2) — เครื่องที่ล็อกอิน · ส่งออกข้อมูล · ลบบัญชี (ซ่อนตัวตน + พัก 7 วัน)

/** ช่วงพักก่อน anonymize (วัน) — แอดมินกู้ได้ภายในช่วงนี้ */
export const DELETE_RECOVERY_DAYS = 7;
/** ส่งออกข้อมูลได้กี่ครั้งต่อวันต่อผู้ใช้ */
export const EXPORT_PER_DAY = 3;
const SESSIONS_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeleteBlocker = 'BOX_BOUND' | 'LAST_HEAD' | 'SOS_OPEN' | 'IS_ADMIN';

export interface MySession {
  id: string;
  device_label: string;
  last_used_at: string;
  created_at: string;
  current: boolean;
  ip_hint: string | null;
}

export interface DeletePreview {
  counts: { boxes: number; sessions: number; notifications: number; push_subscriptions: number };
  blockers: { code: DeleteBlocker }[];
  retained: { kind: 'scan_log' | 'data_access_log' | 'terms_acceptance'; reason: 'append_only' }[];
  recovery_days: number;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

@Injectable()
export class MyDataService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  // ── เครื่องที่ล็อกอิน ───────────────────────────────────────────────────

  async listSessions(userId: string, currentSessionId: string): Promise<{ items: MySession[] }> {
    const { rows } = await this.pool.query<{
      session_id: string;
      user_agent: string | null;
      ip: string | null;
      last_seen_date: Date | null;
      created_date: Date;
    }>(
      `SELECT s.session_id, s.user_agent, host(s.ip) AS ip, s.last_seen_date, s.created_date
       FROM app.session_tb s JOIN app.user_tb u ON u.user_id = s.user_id
       WHERE s.user_id = $1 AND s.revoked_date IS NULL AND s.expire_date > now() AND s.token_version = u.token_version
       ORDER BY coalesce(s.last_seen_date, s.created_date) DESC
       LIMIT ${SESSIONS_LIMIT}`,
      [userId],
    );
    return {
      items: rows.map((r) => ({
        id: r.session_id,
        device_label: deviceLabel(r.user_agent),
        last_used_at: (r.last_seen_date ?? r.created_date).toISOString(),
        created_at: r.created_date.toISOString(),
        current: r.session_id === currentSessionId,
        ip_hint: ipHint(r.ip),
      })),
    };
  }

  async revokeSession(userId: string, currentSessionId: string, id: string): Promise<{ ok: true }> {
    if (!UUID.test(id)) throw new NotFoundException();
    if (id === currentSessionId) {
      throw new AppError(HttpStatus.CONFLICT, 'CURRENT_SESSION', 'use sign-out to leave this device');
    }
    const { rowCount } = await this.pool.query(
      `UPDATE app.session_tb SET revoked_date = now()
       WHERE session_id = $1 AND user_id = $2 AND revoked_date IS NULL AND expire_date > now()`,
      [id, userId],
    );
    if (!rowCount) throw new NotFoundException();
    return { ok: true };
  }

  /** ไม่เพิ่ม token_version — เพราะจะเตะเครื่องปัจจุบันด้วย */
  async revokeOthers(userId: string, currentSessionId: string): Promise<{ revoked: number }> {
    const { rows } = await this.pool.query<{ live: boolean }>(
      `UPDATE app.session_tb SET revoked_date = now()
       WHERE user_id = $1 AND session_id <> $2 AND revoked_date IS NULL
       RETURNING expire_date > now() AS live`,
      [userId, currentSessionId],
    );
    return { revoked: rows.filter((r) => r.live).length };
  }

  // ── ส่งออกข้อมูล ────────────────────────────────────────────────────────

  /** เนื้อไฟล์เป็นของตัวเองเท่านั้น: ไม่มี password_hash/token และไม่มีเบอร์/ชื่อของคนอื่น */
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const used = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.data_access_log_tb
       WHERE actor_user_id = $1 AND subject_kind = 'user' AND fields = ARRAY['self_export']::text[]
         AND created_date > now() - interval '1 day'`,
      [userId],
    );
    if (used.rows[0].n >= EXPORT_PER_DAY) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'export limit reached, try again tomorrow');
    }
    await this.pool.query(
      `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields) VALUES ($1, 'user', $1, ARRAY['self_export'])`,
      [userId],
    );

    const q = <T extends pg.QueryResultRow>(sql: string) => this.pool.query<T>(sql, [userId]).then((r) => r.rows);
    const [account, roles, membership, boxes, myInspections, boxInspections, deliveries, sosOwned, sosHandled, notifications, terms, devices] =
      await Promise.all([
        q<Record<string, unknown>>(
          `SELECT user_id AS id, phone, name, display_name, house_no, area, address_line, subdistrict, district, province,
                  house_lat, house_lng, emergency_name, emergency_phone, prefs, profile, created_date
           FROM app.user_tb WHERE user_id = $1`,
        ),
        q<{ role: string; level: number; status: string }>(`SELECT role, level, status FROM app.user_role_tb WHERE user_id = $1 ORDER BY role`),
        q<{ agency: string; is_head: boolean; status: string; position: string | null; staff_no: string | null }>(
          `SELECT a.name AS agency, m.is_head, m.status, m."position" AS position, m.staff_no
           FROM app.agency_member_tb m JOIN app.agency_tb a ON a.agency_id = m.agency_id WHERE m.user_id = $1`,
        ),
        q<Record<string, unknown>>(
          `SELECT box_id, name, house_no, area, address_line, subdistrict, district, province, lat, lng, bound_date
           FROM app.box_tb WHERE owner_user_id = $1 ORDER BY box_id`,
        ),
        // การตรวจที่ตัวเองเป็นเจ้าหน้าที่ — มีเฉพาะบ้าน/เวลา ไม่มีข้อมูลของเจ้าของบ้าน
        q<{ id: string; box_id: string; house_no: string | null; status: string; checked_date: Date | null; created_date: Date }>(
          `SELECT i.inspection_id::text AS id, i.box_id, b.house_no, i.status, i.checked_date, i.created_date
           FROM app.inspection_tb i JOIN app.box_tb b ON b.box_id = i.box_id
           WHERE i.officer_user_id = $1 ORDER BY i.created_date DESC LIMIT 1000`,
        ),
        // การตรวจตู้ของตัวเอง — ไม่ใส่ชื่อเจ้าหน้าที่ (ข้อมูลคนอื่น)
        q<{ id: string; box_id: string; status: string; checked_date: Date | null; created_date: Date }>(
          `SELECT i.inspection_id::text AS id, i.box_id, i.status, i.checked_date, i.created_date
           FROM app.inspection_tb i JOIN app.box_tb b ON b.box_id = i.box_id
           WHERE b.owner_user_id = $1 ORDER BY i.created_date DESC LIMIT 1000`,
        ),
        q<{ id: string; box_id: string; method: string; created_date: Date }>(
          `SELECT d.delivery_id::text AS id, d.box_id, d.method, d.created_date
           FROM app.delivery_tb d JOIN app.box_tb b ON b.box_id = d.box_id
           WHERE b.owner_user_id = $1 ORDER BY d.created_date DESC LIMIT 1000`,
        ),
        q<{ id: string; box_id: string; status: string; stage: string; created_date: Date; accepted_date: Date | null; closed_date: Date | null; cancel_reason: string | null }>(
          `SELECT sos_case_id::text AS id, box_id, status, stage, created_date, accepted_date, closed_date, cancel_reason
           FROM app.sos_case_tb WHERE owner_user_id = $1 ORDER BY created_date DESC LIMIT 500`,
        ),
        q<{ id: string; box_id: string; status: string; accepted_date: Date | null; closed_date: Date | null; close_note: string | null }>(
          `SELECT sos_case_id::text AS id, box_id, status, accepted_date, closed_date, close_note
           FROM app.sos_case_tb WHERE accepted_by = $1 ORDER BY created_date DESC LIMIT 500`,
        ),
        q<{ type: string; data: unknown; link: string; read_date: Date | null; created_date: Date }>(
          `SELECT type, data, link, read_date, created_date FROM app.notification_tb
           WHERE user_id = $1 ORDER BY created_date DESC LIMIT 500`,
        ),
        q<{ terms_version: string; created_date: Date }>(
          `SELECT terms_version, created_date FROM app.terms_acceptance_tb WHERE user_id = $1 ORDER BY created_date`,
        ),
        q<{ user_agent: string | null; created_date: Date; last_seen_date: Date }>(
          `SELECT user_agent, created_date, last_seen_date FROM app.user_device_tb WHERE user_id = $1 ORDER BY last_seen_date DESC`,
        ),
      ]);

    return {
      exported_at: new Date().toISOString(),
      account: account[0] ?? null,
      roles,
      agency_membership: membership,
      boxes,
      inspections_as_officer: myInspections.map((r) => ({ ...r, checked_date: iso(r.checked_date), created_date: iso(r.created_date) })),
      inspections_of_my_boxes: boxInspections.map((r) => ({ ...r, checked_date: iso(r.checked_date), created_date: iso(r.created_date) })),
      deliveries,
      sos_as_owner: sosOwned,
      sos_as_responder: sosHandled,
      notifications,
      terms_acceptances: terms,
      devices: devices.map((d) => ({ device_label: deviceLabel(d.user_agent), first_seen_at: iso(d.created_date), last_seen_at: iso(d.last_seen_date) })),
    };
  }

  // ── ลบบัญชี ─────────────────────────────────────────────────────────────

  async deletePreview(userId: string, db: Db = this.pool): Promise<DeletePreview> {
    const { rows } = await db.query<{
      boxes: number;
      sessions: number;
      notifications: number;
      push_subscriptions: number;
      is_admin: boolean;
      sos_open: boolean;
      last_head: boolean;
    }>(
      `SELECT
         (SELECT count(*)::int FROM app.box_tb WHERE owner_user_id = $1) AS boxes,
         (SELECT count(*)::int FROM app.session_tb WHERE user_id = $1 AND revoked_date IS NULL AND expire_date > now()) AS sessions,
         (SELECT count(*)::int FROM app.notification_tb WHERE user_id = $1) AS notifications,
         (SELECT count(*)::int FROM app.push_subscription_tb WHERE user_id = $1) AS push_subscriptions,
         EXISTS (SELECT 1 FROM app.user_role_tb WHERE user_id = $1 AND role = 'admin') AS is_admin,
         EXISTS (SELECT 1 FROM app.sos_case_tb WHERE status IN ('open','accepted') AND (owner_user_id = $1 OR accepted_by = $1)) AS sos_open,
         EXISTS (
           SELECT 1 FROM app.agency_member_tb m
           WHERE m.user_id = $1 AND m.is_head AND m.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM app.agency_member_tb h JOIN app.user_tb hu ON hu.user_id = h.user_id
               WHERE h.agency_id = m.agency_id AND h.is_head AND h.status = 'active' AND h.user_id <> $1
                 AND hu.deleted_date IS NULL AND hu.status = 'active'
             )
         ) AS last_head`,
      [userId],
    );
    const r = rows[0];
    const blockers: { code: DeleteBlocker }[] = [];
    if (r.is_admin) blockers.push({ code: 'IS_ADMIN' });
    if (r.last_head) blockers.push({ code: 'LAST_HEAD' });
    if (r.sos_open) blockers.push({ code: 'SOS_OPEN' });
    if (r.boxes > 0) blockers.push({ code: 'BOX_BOUND' });
    return {
      counts: { boxes: r.boxes, sessions: r.sessions, notifications: r.notifications, push_subscriptions: r.push_subscriptions },
      blockers,
      retained: [
        { kind: 'scan_log', reason: 'append_only' },
        { kind: 'data_access_log', reason: 'append_only' },
        { kind: 'terms_acceptance', reason: 'append_only' },
      ],
      recovery_days: DELETE_RECOVERY_DAYS,
    };
  }

  /**
   * ลบบัญชี = ตั้ง deleted_date + เตะทุก session + ลบ push (เบอร์ยังถูกจอง) · ครบ 7 วัน scheduler ค่อย anonymize
   * ยืนยันด้วยรหัสผ่านปัจจุบันก่อน (ตัวนับล็อกเดียวกับล็อกอิน) · มี blocker → 409 พร้อมรายการ
   */
  async deleteAccount(userId: string, password: string): Promise<{ ok: true; recovery_until: string }> {
    await this.auth.assertCurrentPassword(userId, password);
    const recoveryUntil = await withTx(this.pool, async (db) => {
      const { rows } = await db.query(`SELECT 1 FROM app.user_tb WHERE user_id = $1 AND deleted_date IS NULL FOR UPDATE`, [userId]);
      if (!rows[0]) throw new NotFoundException();
      // ตรวจซ้ำใน transaction เดียวกับที่ล็อกแถวผู้ใช้ — กันรับ SOS/ผูกตู้แทรกระหว่างตรวจกับลบ
      const preview = await this.deletePreview(userId, db);
      if (preview.blockers.length) {
        throw new AppError(HttpStatus.CONFLICT, preview.blockers[0].code, 'account cannot be deleted right now', { blockers: preview.blockers });
      }
      const { rows: out } = await db.query<{ until: Date }>(
        `UPDATE app.user_tb SET deleted_date = now() WHERE user_id = $1
         RETURNING deleted_date + make_interval(days => $2::int) AS until`,
        [userId, DELETE_RECOVERY_DAYS],
      );
      await this.sessions.revokeAll(db, userId);
      await db.query(`DELETE FROM app.push_subscription_tb WHERE user_id = $1`, [userId]);
      return out[0].until;
    });
    await this.audit.log(userId, 'user.self_delete', 'user', userId, { recovery_days: DELETE_RECOVERY_DAYS });
    return { ok: true, recovery_until: recoveryUntil.toISOString() };
  }

  /** แอดมินกู้บัญชีที่อยู่ในช่วงพัก (ยังไม่ anonymize) · เลยช่วงแล้ว → 409 NOT_RESTORABLE */
  async restore(adminId: string, userId: string): Promise<{ ok: true }> {
    await withTx(this.pool, async (db) => {
      const { rows } = await db.query<{ anonymized: boolean }>(
        `SELECT anonymized_date IS NOT NULL AS anonymized FROM app.user_tb WHERE user_id = $1 AND deleted_date IS NOT NULL FOR UPDATE`,
        [userId],
      );
      if (!rows[0]) throw new NotFoundException();
      if (rows[0].anonymized) throw new AppError(HttpStatus.CONFLICT, 'NOT_RESTORABLE', 'the recovery period has ended');
      await db.query(`UPDATE app.user_tb SET deleted_date = NULL WHERE user_id = $1`, [userId]);
    });
    await this.audit.log(adminId, 'user.restore', 'user', userId);
    return { ok: true };
  }
}
