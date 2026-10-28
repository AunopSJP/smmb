import { CanActivate, ExecutionContext, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Env } from '../config/env.js';
import { AppError } from '../common/http-exception.filter.js';
import { ROLES, type AuthedRequest, type RequiredRole } from './auth.decorators.js';
import { AccessService, type Access } from './access.service.js';

/**
 * ตรวจว่าผู้ใช้มีบทบาทที่ route ต้องใช้ (อย่างใดอย่างหนึ่ง)
 * - ไม่มี → 404 (ไม่บอกว่ามี route/ของอยู่ — CLAUDE.md กฎข้อ 9)
 * - เป็นเจ้าหน้าที่ที่รออนุมัติ/ถูกปฏิเสธ และ route ต้องใช้ officer/head → 403 ACCOUNT_PENDING / ACCOUNT_REJECTED
 */
export function checkRoles(required: RequiredRole[], access: Access): void {
  if (required.some((r) => access.roles.has(r))) return;

  const needsAgency = required.some((r) => r === 'officer' || r === 'head');
  const a = access.agency;
  if (needsAgency && a) {
    if (a.agencyStatus === 'rejected' || a.membershipStatus === 'rejected') {
      throw new AppError(HttpStatus.FORBIDDEN, 'ACCOUNT_REJECTED', 'agency membership rejected');
    }
    if (a.agencyStatus === 'pending' || a.membershipStatus === 'pending') {
      throw new AppError(HttpStatus.FORBIDDEN, 'ACCOUNT_PENDING', 'waiting for approval');
    }
  }
  throw new NotFoundException();
}

/**
 * ผ่านเข้ามาได้เพราะเป็นเจ้าหน้าที่/หัวหน้าเท่านั้นไหม → ต้องเปิดแจ้งเตือนก่อน (ไม่งั้นไม่ได้รับ SOS — api.md §3)
 * ถ้า route รับบทบาทอื่นที่ผู้ใช้มีด้วย (เช่น owner) ไม่บังคับ
 */
export function needsPush(required: RequiredRole[], access: Access): boolean {
  return !required.some((r) => r !== 'officer' && r !== 'head' && access.roles.has(r));
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredRole[] | undefined>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new NotFoundException(); // route public ที่ติด RequireRole = ตั้งค่าผิด → ปิดไว้
    const access = await this.access.load(req.auth.userId);
    checkRoles(required, access);
    const skipPush = this.config.get('SKIP_PUSH_REQUIRED', { infer: true });
    if (!skipPush && needsPush(required, access) && !(await this.access.hasActivePush(req.auth.userId))) {
      throw new AppError(HttpStatus.FORBIDDEN, 'PUSH_REQUIRED', 'turn on notifications to use officer features');
    }
    return true;
  }
}
