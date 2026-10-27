import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
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
      useFactory: (config: ConfigService<Env, true>) =>
        // lazyConnect: เซิร์ฟเวอร์ขึ้นได้แม้ Redis ล่ม — health จะรายงานว่า down
        new Redis(config.get('REDIS_URL', { infer: true }), { lazyConnect: true, maxRetriesPerRequest: 1 }),
    },
    DbShutdown,
  ],
  exports: [PG_POOL, REDIS],
})
export class DbModule {}
