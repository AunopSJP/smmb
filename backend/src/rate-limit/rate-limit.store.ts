import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../db/db.module.js';

/** ตัวนับแบบหน้าต่างเวลาคงที่ · ใช้ทั้ง rate limit และนับรหัสผิดติดกัน */
export interface CounterStore {
  /** +1 แล้วคืนค่าปัจจุบัน · ครั้งแรกตั้งอายุ windowSec */
  hit(key: string, windowSec: number): Promise<number>;
  get(key: string): Promise<number>;
  reset(key: string): Promise<void>;
}

export const COUNTER_STORE = Symbol('COUNTER_STORE');

@Injectable()
export class RedisCounterStore implements CounterStore {
  private readonly logger = new Logger('CounterStore');
  /** Redis ล่ม → ใช้หน่วยความจำแทน (rate limit + lockout ต้องไม่หยุดทำงาน) */
  private readonly fallback = new MemoryCounterStore();
  private lastWarn = 0;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private async ready() {
    if (this.redis.status === 'wait') await this.redis.connect();
  }

  private warn(err: unknown): void {
    const now = Date.now();
    if (now - this.lastWarn < 60_000) return;
    this.lastWarn = now;
    this.logger.warn(`redis counter unavailable — using in-memory fallback: ${(err as Error).message}`);
  }

  private async run<T>(redisOp: () => Promise<T>, memoryOp: () => Promise<T>): Promise<T> {
    try {
      await this.ready();
      return await redisOp();
    } catch (err) {
      this.warn(err);
      return memoryOp();
    }
  }

  async hit(key: string, windowSec: number): Promise<number> {
    return this.run(
      async () => {
        const res = await this.redis.multi().incr(key).expire(key, windowSec, 'NX').exec();
        const count = res?.[0]?.[1];
        if (typeof count !== 'number') throw new Error('redis INCR failed');
        return count;
      },
      () => this.fallback.hit(key, windowSec),
    );
  }

  async get(key: string): Promise<number> {
    return this.run(async () => Number((await this.redis.get(key)) ?? 0), () => this.fallback.get(key));
  }

  async reset(key: string): Promise<void> {
    return this.run(async () => void (await this.redis.del(key)), () => this.fallback.reset(key));
  }
}

/** ใช้ในเทสต์ (และเครื่องที่ไม่มี Redis) — instance เดียวเท่านั้น */
export class MemoryCounterStore implements CounterStore {
  private readonly data = new Map<string, { count: number; until: number }>();

  async hit(key: string, windowSec: number): Promise<number> {
    const now = Date.now();
    const cur = this.data.get(key);
    if (!cur || cur.until <= now) {
      this.data.set(key, { count: 1, until: now + windowSec * 1000 });
      return 1;
    }
    cur.count += 1;
    return cur.count;
  }

  async get(key: string): Promise<number> {
    const cur = this.data.get(key);
    return cur && cur.until > Date.now() ? cur.count : 0;
  }

  async reset(key: string): Promise<void> {
    this.data.delete(key);
  }

  /** ล้างทุกคีย์ที่ขึ้นต้นด้วย prefix (ใช้ในเทสต์) */
  clear(prefix = ''): void {
    for (const k of this.data.keys()) if (k.startsWith(prefix)) this.data.delete(k);
  }
}
