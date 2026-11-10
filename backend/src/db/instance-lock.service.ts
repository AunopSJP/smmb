import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import type { Env } from '../config/env.js';
import { PG_POOL } from './tokens.js';

/** กุญแจ advisory lock ประจำโปรเซส — ค่าเดียวทุก instance */
const LOCK_KEY = 1_397_571_906; // "SMMB"

/**
 * กันการรัน backend หลาย process พร้อมกันโดยไม่ตั้งใจ
 *
 * JobHub เก็บ long-poll waiter ไว้ใน memory ของแต่ละ process — ถ้ามี 2 process
 * ตู้ที่ถือ poll อยู่กับตัวหนึ่ง แต่อีกตัวสร้างงานใหม่ งานจะไม่ถูกปลุกและเงียบหาย
 * จึงถือ PostgreSQL advisory lock ไว้ตลอดอายุโปรเซส
 *
 * - ปกติ: process ที่สองจะ log error แล้ว exit(1)
 * - ตั้ง `ALLOW_MULTI_INSTANCE=1` เมื่อจำเป็น (เช่น debug) เพื่อข้ามการกันนี้
 * - ข้ามใน NODE_ENV=test เพื่อไม่รบกวน test runner
 */
@Injectable()
export class InstanceLock implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('InstanceLock');
  private client: pg.PoolClient | null = null;
  private held = false;

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (this.config.get('ALLOW_MULTI_INSTANCE', { infer: true })) {
      this.logger.warn('ALLOW_MULTI_INSTANCE=1 — skipping the single-instance guard');
      return;
    }
    // PGlite (dev:mock) ให้บริการได้ทีละ connection — ถ้าถือ client ไว้จะบล็อก request อื่น
    // จึงบังคับใช้เฉพาะ production; ทดสอบ guard ได้ด้วย NODE_ENV=production + PostgreSQL จริง
    if (this.config.get('NODE_ENV', { infer: true }) !== 'production') {
      this.logger.log('single-instance guard skipped outside production');
      return;
    }

    try {
      this.client = await this.pool.connect();
      const { rows } = await this.client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
      if (!rows[0]?.ok) {
        this.logger.error(
          'another SMMB backend is already running (advisory lock busy). ' +
            'Stop it first, or set ALLOW_MULTI_INSTANCE=1 if you really need two processes.',
        );
        await this.release();
        process.exit(1);
      }
      this.held = true;
      this.logger.log('single-instance advisory lock acquired');
    } catch (err) {
      this.logger.error(`could not acquire the single-instance lock: ${(err as Error).message}`);
      await this.release();
      process.exit(1);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.held) return;
    try {
      await this.client?.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } catch {
      // ปิดโปรเซสอยู่แล้ว — ปล่อย connection ให้ pool จัดการต่อ
    }
    await this.release();
  }

  private async release(): Promise<void> {
    this.held = false;
    const client = this.client;
    this.client = null;
    client?.release();
  }
}
