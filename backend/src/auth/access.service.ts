import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import type { Db } from '../db/tx.js';
import type { RequiredRole } from './auth.decorators.js';

export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'disabled';

export interface Access {
  /** บทบาทที่ใช้งานได้ตอนนี้ — head/officer ต้องผ่านการอนุมัติครบแล้ว */
  roles: Set<RequiredRole>;
  levels: Partial<Record<'owner' | 'officer' | 'admin', number>>;
  agency: {
    id: string;
    name: string;
    type: string;
    agencyStatus: 'pending' | 'approved' | 'rejected';
    membershipStatus: MembershipStatus;
    isHead: boolean;
  } | null;
}

/** อ่านบทบาท + หน่วยงานของผู้ใช้ — ที่เดียวที่ตัดสินว่าใครมีบทบาทอะไร */
@Injectable()
export class AccessService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** มีเครื่องที่รับแจ้งเตือนได้อย่างน้อย 1 เครื่อง (session ยังใช้ได้) — ใช้กับ PUSH_REQUIRED */
  async hasActivePush(userId: string, db: Db = this.pool): Promise<boolean> {
    const { rows } = await db.query(
      `SELECT 1 FROM app.push_subscription_tb p
       JOIN app.session_tb s ON s.session_id = p.session_id
       JOIN app.user_tb u ON u.user_id = s.user_id
       WHERE p.user_id = $1 AND s.revoked_date IS NULL AND s.expire_date > now()
         AND s.token_version = u.token_version
       LIMIT 1`,
      [userId],
    );
    return rows.length > 0;
  }

  async load(userId: string, db: Db = this.pool): Promise<Access> {
    const [roleRes, agencyRes] = await Promise.all([
      db.query<{ role: 'owner' | 'officer' | 'admin'; level: number }>(
        `SELECT role, level FROM app.user_role_tb WHERE user_id = $1 AND status = 'active'`,
        [userId],
      ),
      db.query<{
        agency_id: string;
        name: string;
        type: string;
        agency_status: 'pending' | 'approved' | 'rejected';
        member_status: MembershipStatus;
        is_head: boolean;
      }>(
        `SELECT a.agency_id, a.name, a.type, a.status AS agency_status, m.status AS member_status, m.is_head
         FROM app.agency_member_tb m JOIN app.agency_tb a ON a.agency_id = m.agency_id
         WHERE m.user_id = $1`,
        [userId],
      ),
    ]);

    const roles = new Set<RequiredRole>();
    const levels: Access['levels'] = {};
    const a = agencyRes.rows[0];
    const officerUsable = a?.agency_status === 'approved' && a.member_status === 'active';

    for (const r of roleRes.rows) {
      levels[r.role] = r.level;
      if (r.role === 'officer') {
        if (!officerUsable) continue;
        roles.add('officer');
        if (a.is_head) roles.add('head');
      } else {
        roles.add(r.role);
      }
    }

    return {
      roles,
      levels,
      agency: a
        ? {
            id: a.agency_id,
            name: a.name,
            type: a.type,
            agencyStatus: a.agency_status,
            membershipStatus: a.member_status,
            isHead: a.is_head,
          }
        : null,
    };
  }
}
