import { Global, Inject, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';

export const PG_POOL = Symbol('PG_POOL');
export const REDIS = Symbol('REDIS');

@Injectable()
class DbShutdown implements OnApplicationShutdown {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown() {
    await Promise.allSettled([this.pool.end(), this.redis.quit()]);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new pg.Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          max: config.get('DB_POOL_MAX', { infer: true }),
        }),
    },
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        // lazyConnect: เซิร์ฟเวอร์ขึ้นได้แม้ Redis ล่ม — health จะรายงานว่า down
        // Redis ล่ม → คำสั่งล้มทันที (ไม่รอคิว) ให้ rate limit ปล่อยผ่านเร็ว ๆ — ไม่งั้นทุกคำขอ (รวมตู้) ช้าหลายวินาที
        const redis = new Redis(config.get('REDIS_URL', { infer: true }), {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 1000,
          enableOfflineQueue: false,
        });
        // ไม่มี handler = ioredis พิมพ์ "Unhandled error event" ทุกครั้งที่ต่อใหม่ (โหมด mock ไม่มี Redis) → เตือนครั้งเดียวพอ
        let warned = false;
        redis.on('error', (err: Error) => {
          if (warned) return;
          warned = true;
          new Logger('Redis').warn(`Redis unavailable (${err.message || err.name}) — rate limits are skipped until it is back`);
        });
        redis.on('ready', () => (warned = false));
        return redis;
      },
    },
    DbShutdown,
  ],
  exports: [PG_POOL, REDIS],
})
export class DbModule {}
