import { Inject, Injectable } from '@nestjs/common';
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
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private async ready() {
    if (this.redis.status === 'wait') await this.redis.connect();
  }

  async hit(key: string, windowSec: number): Promise<number> {
    await this.ready();
    const res = await this.redis.multi().incr(key).expire(key, windowSec, 'NX').exec();
    const count = res?.[0]?.[1];
    if (typeof count !== 'number') throw new Error('redis INCR failed');
    return count;
  }

  async get(key: string): Promise<number> {
    await this.ready();
    return Number((await this.redis.get(key)) ?? 0);
  }

  async reset(key: string): Promise<void> {
    await this.ready();
    await this.redis.del(key);
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
