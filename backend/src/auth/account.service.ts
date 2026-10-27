import { HttpStatus, Injectable } from '@nestjs/common';
import { newTempPassword } from '../common/codes.js';
import { AppError } from '../common/http-exception.filter.js';
import { isPgError, PG_CHECK_VIOLATION, type Db } from '../db/tx.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

export type Role = 'admin' | 'owner' | 'officer';

export const adminExclusive = () =>
  new AppError(HttpStatus.FORBIDDEN, 'ADMIN_ROLE_EXCLUSIVE', 'admin accounts cannot have other roles');

/** งานกับบัญชีที่หลายส่วนใช้ร่วมกัน (สมัคร / หัวหน้า / แอดมิน) */
@Injectable()
export class AccountService {
  constructor(
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  /** รหัสชั่วคราว (คืนครั้งเดียว ไม่เก็บ) + ต้องเปลี่ยนก่อนใช้งานอื่น + เตะทุกเครื่อง */
  async resetPassword(db: Db, userId: string): Promise<string> {
    const temp = newTempPassword();
    await db.query(`UPDATE app.user_tb SET password_hash = $2, must_change_password = true WHERE user_id = $1`, [
      userId,
      await this.passwords.hash(temp),
    ]);
    await this.sessions.revokeAll(db, userId);
    return temp;
  }

  /** ให้/เปิดบทบาท · บัญชีแอดมินมีบทบาทอื่นไม่ได้ (trigger ในฐานข้อมูล) → 403 */
  async grantRole(
    db: Db,
    userId: string,
    role: Role,
    opts: { grantedBy?: string; level?: number; status?: 'active' | 'disabled' } = {},
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO app.user_role_tb (user_id, role, level, status, granted_by)
         VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 'active'), $5)
         ON CONFLICT (user_id, role) DO UPDATE SET
           level = COALESCE($3, app.user_role_tb.level),
           status = COALESCE($4, app.user_role_tb.status),
           granted_by = COALESCE($5, app.user_role_tb.granted_by)`,
        [userId, role, opts.level ?? null, opts.status ?? null, opts.grantedBy ?? null],
      );
    } catch (err) {
      if (isPgError(err, PG_CHECK_VIOLATION, 'admin_exclusive')) throw adminExclusive();
      throw err;
    }
    if (role === 'owner') await this.giveDefaultPlan(db, userId);
    await this.bumpPerm(db, userId);
  }

  /** ให้แพ็กเริ่มต้นถ้ายังไม่มีแพ็กที่ใช้อยู่ */
  async giveDefaultPlan(db: Db, userId: string): Promise<void> {
    await db.query(
      `INSERT INTO app.user_plan_tb (user_id, plan_code)
       SELECT $1, plan_code FROM app.plan_tb WHERE is_default
       AND NOT EXISTS (
         SELECT 1 FROM app.user_plan_tb WHERE user_id = $1 AND tstzrange(start_date, end_date) @> now()
       )`,
      [userId],
    );
  }

  /** บอก client ว่าสิทธิ์เปลี่ยน ต้องโหลด Me ใหม่ */
  async bumpPerm(db: Db, userId: string): Promise<void> {
    await db.query(`UPDATE app.user_tb SET perm_version = perm_version + 1 WHERE user_id = $1`, [userId]);
  }

  async hasRole(db: Db, userId: string, role: Role): Promise<boolean> {
    const { rows } = await db.query(`SELECT 1 FROM app.user_role_tb WHERE user_id = $1 AND role = $2`, [userId, role]);
    return rows.length > 0;
  }
}
