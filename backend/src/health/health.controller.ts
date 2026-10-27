import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import pg from 'pg';
import type { Redis } from 'ioredis';
import { Public } from '../auth/auth.decorators.js';
import type { Env } from '../config/env.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { PG_POOL, REDIS } from '../db/db.module.js';

type Status = 'up' | 'down';

const withTimeout = <T>(p: Promise<T>, ms = 2000) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// docs/api.md §1 — public ไม่มี version · ไม่จำกัดความถี่ (monitor เรียกบ่อย)
@Public()
@RateLimit(false)
@Controller('api/health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [postgres, redis] = await Promise.all([this.pingPostgres(), this.pingRedis()]);
    // push: ยังไม่ส่งจริงในเฟสนี้ — up เมื่อตั้ง VAPID key ครบ
    const push: Status =
      this.config.get('VAPID_PUBLIC_KEY', { infer: true }) && this.config.get('VAPID_PRIVATE_KEY', { infer: true })
        ? 'up'
        : 'down';
    const services = { postgres, redis, push };
    const ok = Object.values(services).every((s) => s === 'up');
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'error',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      services,
    };
  }

  @Get('live')
  live() {
    return { ok: true, t: new Date().toISOString() };
  }

  private async pingPostgres(): Promise<Status> {
    try {
      await withTimeout(this.pool.query('SELECT 1'));
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async pingRedis(): Promise<Status> {
    try {
      if (this.redis.status === 'wait') await withTimeout(this.redis.connect());
      return (await withTimeout(this.redis.ping())) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
