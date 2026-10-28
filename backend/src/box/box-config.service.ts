import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import type { Db } from '../db/tx.js';
import {
  BOX_TZ,
  boxStatus,
  configVersion,
  mergeWindows,
  resolveDefaults,
  type BoxConfig,
  type BoxConfigDefaults,
  type BoxStatus,
} from './box-config.js';

/** ค่ากลาง (api.md §9.5 GET /admin/box-config) */
export interface BoxConfigDefaultsDto {
  config_ver: number;
  config: BoxConfigDefaults;
  updated_at: string;
  updated_by: string | null;
}

/**
 * ค่าที่ส่งให้ตู้แต่ละตู้ = ค่ากลาง + ค่าทับเฉพาะตู้ + เวลาตรวจรวมทุกโซน (design §5.2)
 * โซนที่นับ: ยังไม่ถูกลบ และหน่วยงานอนุมัติแล้ว — บ้านหลังเดียวอยู่ในโซนของหลายหน่วยงานได้ (✅ 2026-10-28)
 */
@Injectable()
export class BoxConfigService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async defaults(db: Db = this.pool): Promise<BoxConfigDefaults> {
    const { rows } = await db.query<{ config: Record<string, unknown> }>(`SELECT config FROM app.box_config_tb WHERE box_config_id = 1`);
    return resolveDefaults(rows[0]?.config ?? {});
  }

  async defaultsDto(): Promise<BoxConfigDefaultsDto> {
    const { rows } = await this.pool.query<{ config: Record<string, unknown>; updated_date: Date; updated_by: string | null }>(
      `SELECT config, updated_date, updated_by FROM app.box_config_tb WHERE box_config_id = 1`,
    );
    const config = resolveDefaults(rows[0]?.config ?? {});
    return {
      // เลขของค่ากลางอย่างเดียว (ไม่มีเวลาตรวจ) — ไว้ให้แอดมินเห็นว่าเปลี่ยนแล้ว
      config_ver: configVersion({ ...config, windows: [], tz: BOX_TZ }),
      config,
      updated_at: (rows[0]?.updated_date ?? new Date(0)).toISOString(),
      updated_by: rows[0]?.updated_by ?? null,
    };
  }

  async setDefaults(config: BoxConfigDefaults, adminId: string): Promise<BoxConfigDefaultsDto> {
    await this.pool.query(`UPDATE app.box_config_tb SET config = $1, updated_by = $2 WHERE box_config_id = 1`, [config, adminId]);
    return this.defaultsDto();
  }

  /** เวลาตรวจรวมของหลายตู้ในคำสั่งเดียว */
  async windowsOf(boxIds: string[], db: Db = this.pool): Promise<Map<string, [string, string][]>> {
    const out = new Map<string, [string, string][]>(boxIds.map((id) => [id, []]));
    if (!boxIds.length) return out;
    const { rows } = await db.query<{ box_id: string; s: string; e: string }>(
      `SELECT zb.box_id, to_char(w.start_time, 'HH24:MI') AS s, to_char(w.end_time, 'HH24:MI') AS e
       FROM app.zone_box_tb zb
       JOIN app.zone_tb z ON z.zone_id = zb.zone_id AND z.deleted_date IS NULL
       JOIN app.agency_tb a ON a.agency_id = z.agency_id AND a.status = 'approved'
       JOIN app.zone_window_tb w ON w.zone_id = z.zone_id
       WHERE zb.box_id = ANY($1::text[])`,
      [boxIds],
    );
    for (const r of rows) out.get(r.box_id)?.push([r.s, r.e]);
    for (const [id, list] of out) out.set(id, mergeWindows(list));
    return out;
  }

  /** ค่าที่ตู้นี้ควรมี + เลขเวอร์ชัน */
  async forBox(boxId: string, db: Db = this.pool): Promise<{ config: BoxConfig; ver: number }> {
    const [base, override, windows] = await Promise.all([
      this.defaults(db),
      db.query<{ config_override: Record<string, unknown> }>(`SELECT config_override FROM app.box_tb WHERE box_id = $1`, [boxId]),
      this.windowsOf([boxId], db),
    ]);
    const config: BoxConfig = {
      windows: windows.get(boxId) ?? [],
      tz: BOX_TZ,
      ...resolveDefaults(base as unknown as Record<string, unknown>, override.rows[0]?.config_override ?? {}),
    };
    return { config, ver: configVersion(config) };
  }

  /** สถานะที่แสดงของหลายตู้ (api.md §4.2) */
  async statusOf(
    boxes: { box_id: string; service_active: boolean; owner_user_id: string | null; last_poll_date: Date | null; last_seen_date: Date | null; config_override?: Record<string, unknown> }[],
    db: Db = this.pool,
  ): Promise<Map<string, BoxStatus>> {
    const [base, windows] = await Promise.all([this.defaults(db), this.windowsOf(boxes.map((b) => b.box_id), db)]);
    const now = new Date();
    return new Map(
      boxes.map((b) => {
        const wait = resolveDefaults(base as unknown as Record<string, unknown>, b.config_override ?? {}).longpoll_wait_s;
        return [b.box_id, boxStatus(b, windows.get(b.box_id) ?? [], wait, now)];
      }),
    );
  }
}
