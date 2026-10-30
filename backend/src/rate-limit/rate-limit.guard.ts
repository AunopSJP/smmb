import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../common/http-exception.filter.js';
import { COUNTER_STORE, type CounterStore } from './rate-limit.store.js';

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
}

/** ค่าเริ่มต้น api.md §0: 100 ครั้ง/นาที ต่อ route ต่อ IP (💡 ยังไม่ได้ตกลงตัวเลข) */
export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 100, windowSec: 60 };

const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (opts: RateLimitOptions | false) => SetMetadata(RATE_LIMIT_KEY, opts);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger('RateLimit');

  constructor(
    private readonly reflector: Reflector,
    @Inject(COUNTER_STORE) private readonly store: CounterStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts =
      this.reflector.getAllAndOverride<RateLimitOptions | false | undefined>(RATE_LIMIT_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? DEFAULT_RATE_LIMIT;
    if (opts === false) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const route = `${req.method}:${(req.route as { path?: string } | undefined)?.path ?? req.path}`;
    const key = `rl:${route}:${req.ip ?? 'unknown'}`;

    let count: number;
    try {
      count = await this.store.hit(key, opts.windowSec);
    } catch (err) {
      // Redis ล่ม → ปล่อยผ่าน (SOS/ตรวจตู้ต้องใช้ได้) แต่บันทึกไว้
      this.logger.warn(`rate limit store unavailable, allowing request: ${(err as Error).message}`);
      return true;
    }
    if (count > opts.limit) {
      // ไว้เช็กว่า TRUST_PROXY ผิด (ทุกคนมี IP เดียวกัน) หรือคนหลายคนใช้ IP เดียวกัน (NAT) — ดู journalctl -u smmb-backend | grep RateLimit
      if (count === opts.limit + 1) this.logger.warn(`429 ${route} from ${req.ip ?? 'unknown'} (limit ${opts.limit}/${opts.windowSec}s)`);
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'too many requests');
    }
    return true;
  }
}
