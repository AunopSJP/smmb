import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './session.service.js';

/** route ที่ไม่ต้องล็อกอิน — ค่าเริ่มต้นทุก route ต้องล็อกอิน */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** บทบาทที่ route ต้องใช้ (มีอย่างใดอย่างหนึ่งก็พอ) */
export type RequiredRole = 'owner' | 'officer' | 'head' | 'admin';
export const ROLES = 'roles';
export const RequireRole = (...roles: RequiredRole[]) => SetMetadata(ROLES, roles);

export type AuthedRequest = Request & { auth?: AuthContext };

/** ผู้ใช้ที่ล็อกอินอยู่ (ใช้ได้เฉพาะ route ที่ไม่ใช่ @Public) */
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new Error('@Auth() used on a route without a session');
  return auth;
});
