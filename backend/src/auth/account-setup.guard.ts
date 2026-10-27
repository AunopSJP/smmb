import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import type { AuthedRequest } from './auth.decorators.js';

/**
 * route ที่ใช้ได้ระหว่าง "ตั้งค่าบัญชีให้เรียบร้อย" — ต้องใช้เพื่อไปถึงหน้าเปลี่ยนรหัส / หน้า A13 และกดยืนยัน
 * (verify, GET /me, signout, change-password, POST /me/terms)
 */
const ALLOW_DURING_SETUP = 'allowDuringSetup';
export const AllowDuringSetup = () => SetMetadata(ALLOW_DURING_SETUP, true);

/**
 * บัญชีที่ยังตั้งค่าไม่ครบ ใช้ route อื่นไม่ได้:
 * 1. ถูกรีเซ็ตรหัส → 403 PASSWORD_CHANGE_REQUIRED (รหัสชั่วคราวที่หัวหน้า/แอดมินเห็น ใช้งานจริงไม่ได้)
 * 2. ข้อตกลงเปลี่ยน → 403 TERMS_UPDATE_REQUIRED (api.md §2)
 */
@Injectable()
export class AccountSetupGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) return true; // route สาธารณะ
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_SETUP, [ctx.getHandler(), ctx.getClass()])) return true;

    const { rows } = await this.pool.query<{ must_change_password: boolean; terms_needed: boolean }>(
      `WITH cur AS (
         SELECT terms_version FROM app.terms_tb WHERE published_date <= now()
         ORDER BY published_date DESC LIMIT 1
       )
       SELECT u.must_change_password,
              EXISTS (SELECT 1 FROM cur) AND NOT EXISTS (
                SELECT 1 FROM app.terms_acceptance_tb a JOIN cur USING (terms_version) WHERE a.user_id = u.user_id
              ) AS terms_needed
       FROM app.user_tb u WHERE u.user_id = $1`,
      [req.auth.userId],
    );
    const s = rows[0];
    if (s?.must_change_password) {
      throw new AppError(HttpStatus.FORBIDDEN, 'PASSWORD_CHANGE_REQUIRED', 'change your temporary password first');
    }
    if (s?.terms_needed) {
      throw new AppError(HttpStatus.FORBIDDEN, 'TERMS_UPDATE_REQUIRED', 'accept the updated terms to continue');
    }
    return true;
  }
}
