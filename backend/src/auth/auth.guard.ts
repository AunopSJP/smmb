import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC, type AuthedRequest } from './auth.decorators.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

/** ทุก route ต้องล็อกอิน ยกเว้นติด @Public() — ลืมใส่ = ปิดไว้ก่อน (ปลอดภัยกว่าลืมแล้วเปิด) */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string | undefined> | undefined)?.[SESSION_COOKIE];
    req.auth = await this.sessions.resolve(token);
    return true;
  }
}
