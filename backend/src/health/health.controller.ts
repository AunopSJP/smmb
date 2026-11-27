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

const PROBE_TTL_MS = 2000;

const withTimeout = <T>(p: Promise<T>, ms = 2000) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// docs/api.md §1 — public ไม่มี version · ไม่จำกัดความถี่ (monitor เรียกบ่อย)
@Public()
@RateLimit(false)
@Controller('api/health')
export class HealthController {
  /** ผลตรวจ Postgres/Redis ล่าสุด — ใช้ร่วมกันช่วงสั้น ๆ กันยิง endpoint สาธารณะนี้ถี่ ๆ แล้วไปถึงฐานข้อมูลทุกคำขอ */
  private probe: { at: number; result: Promise<[Status, Status]> } | null = null;

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [postgres, redis] = await this.checkDependencies();
    // push: ยังไม่ส่งจริงในเฟสนี้ — up เมื่อตั้ง VAPID key ครบ
    const push: Status =
      this.config.get('VAPID_PUBLIC_KEY', { infer: true }) && this.config.get('VAPID_PRIVATE_KEY', { infer: true })
        ? 'up'
        : 'down';
    const services = { postgres, redis, push };
    // push เป็นส่วนเสริม: ถ้าไม่ตั้ง VAPID ยังถือว่าใช้งานหลักได้ (degraded) แต่ postgres/redis ต้อง up
    const requiredUp = postgres === 'up' && redis === 'up';
    const status: 'ok' | 'degraded' | 'error' = !requiredUp ? 'error' : push === 'up' ? 'ok' : 'degraded';
    res.status(requiredUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      services,
    };
  }

  @Get('live')
  live() {
    return { ok: true, t: new Date().toISOString() };
  }

  /** คำขอที่มาพร้อมกันรอผลชุดเดียวกัน (เก็บ promise ไม่ใช่ค่าที่ได้) · ping ทั้งสองไม่ reject */
  private checkDependencies(): Promise<[Status, Status]> {
    const now = Date.now();
    if (!this.probe || now - this.probe.at >= PROBE_TTL_MS) {
      this.probe = { at: now, result: Promise.all([this.pingPostgres(), this.pingRedis()]) };
    }
    return this.probe.result;
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
