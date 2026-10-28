import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';

/**
 * ช่องทางติดต่อผู้ดูแลระบบ — แอดมินตั้ง แล้วแสดงในหน้าที่บอกให้ "ติดต่อผู้ดูแล" (A04, A07-c, L02-b)
 * เป็นข้อมูลที่ตั้งใจเปิดเผย (api.md §3.1)
 */
@Injectable()
export class SupportService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async get(): Promise<{ contact: string | null }> {
    const { rows } = await this.pool.query<{ value: string }>(
      `SELECT value FROM app.setting_tb WHERE setting_key = 'support_contact'`,
    );
    return { contact: rows[0]?.value ?? null };
  }

  async set(adminId: string, contact: string): Promise<{ contact: string }> {
    await this.pool.query(
      `INSERT INTO app.setting_tb (setting_key, value, updated_by) VALUES ('support_contact', $1, $2)
       ON CONFLICT (setting_key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by`,
      [contact, adminId],
    );
    return { contact };
  }
}
