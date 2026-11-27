import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { withTx, type Db } from '../db/tx.js';
import { JobHub } from './job-hub.js';
import {
  BOX_TZ,
  boxStatus,
  configVersion,
  mergeWindows,
  patrolComplete,
  pickOverride,
  resolveDefaults,
  type BoxConfig,
  type BoxConfigDefaults,
  type BoxStatus,
  windowStartedAt,
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
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool, private readonly hub: JobHub) {}

  /**
   * ปลุกตู้ที่ออนไลน์ให้เทียบ config_ver ใหม่ทันที (เวลาตรวจ/บ้านในโซน/ค่ากลางเปลี่ยน) — ตู้ที่หลับอยู่รับค่าตอนตื่นซิงก์รอบถัดไป
   * เรียกหลัง commit เท่านั้น (ถ้าปลุกก่อน ตู้จะอ่านค่าเก่า)
   */
  wakeBoxes(boxIds: string[]): void {
    for (const id of new Set(boxIds)) this.hub.wake(id);
  }

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

  async setDefaults(config: Omit<BoxConfigDefaults, 'wifi_power_save' | 'sleep_outside_window'>, adminId: string): Promise<BoxConfigDefaultsDto> {
    await this.pool.query(`UPDATE app.box_config_tb SET config = $1, updated_by = $2 WHERE box_config_id = 1`, [config, adminId]);
    this.hub.wakeAll(); // ตู้ที่ออนไลน์รับค่าใหม่ทันที ไม่ต้องรอรอบ
    return this.defaultsDto();
  }

  async resetBoxConfig(boxId: string, adminId: string): Promise<{ box_id: string; config_ver: number; config: BoxConfig }> {
    const result = await withTx(this.pool, async (db) => {
      const { rowCount } = await db.query(
        `UPDATE app.box_tb SET config_override = '{}'::jsonb, config_generation = config_generation + 1 WHERE box_id = $1`,
        [boxId],
      );
      if (!rowCount) throw new NotFoundException();
      await db.query(
        `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields)
         VALUES ($1, 'box', $2, '{config_reset}')`,
        [adminId, boxId],
      );
      const { config, ver } = await this.forBox(boxId, db);
      return { box_id: boxId, config_ver: ver, config };
    });
    this.hub.wake(boxId);
    return result;
  }

  /**
   * ตั้งค่าทับเฉพาะตู้ (เช่น ตู้สัญญาณแย่ให้ long-poll สั้นลง) — **แทนที่ทั้งชุด**: คีย์ที่ไม่ส่งกลับไปใช้ค่ากลาง
   * เพิ่มรุ่น (generation) ให้ตู้ดึงค่าใหม่ทันที · ปลุก long-poll ที่รออยู่ · บันทึกผู้ตั้งใน data_access_log_tb
   */
  async setBoxConfig(boxId: string, override: Record<string, unknown>, adminId: string): Promise<{ box_id: string; config_ver: number; config: BoxConfig; override: Partial<BoxConfigDefaults> }> {
    const picked = pickOverride(override);
    const result = await withTx(this.pool, async (db) => {
      const { rowCount } = await db.query(
        `UPDATE app.box_tb SET config_override = $2::jsonb, config_generation = config_generation + 1 WHERE box_id = $1`,
        [boxId, JSON.stringify(picked)],
      );
      if (!rowCount) throw new NotFoundException();
      await db.query(
        `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields) VALUES ($1, 'box', $2, $3)`,
        [adminId, boxId, ['config_override', ...Object.keys(picked)]],
      );
      const { config, ver } = await this.forBox(boxId, db);
      return { box_id: boxId, config_ver: ver, config, override: picked };
    });
    this.hub.wake(boxId);
    return result;
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

  /** ตู้ที่ตรวจครบแล้ว ณ เวลา `now` (box-config.ts `patrolComplete`) · นับเฉพาะหน่วยงานที่อนุมัติแล้ว */
  async patrolCompleteOf(boxIds: string[], now = new Date(), db: Db = this.pool): Promise<Set<string>> {
    if (!boxIds.length) return new Set();
    const { rows: windows } = await db.query<{ box_id: string; agency_id: string; s: string; e: string }>(
      `SELECT zb.box_id, z.agency_id, to_char(w.start_time, 'HH24:MI') AS s, to_char(w.end_time, 'HH24:MI') AS e
       FROM app.zone_box_tb zb
       JOIN app.zone_tb z ON z.zone_id = zb.zone_id AND z.deleted_date IS NULL
       JOIN app.agency_tb a ON a.agency_id = z.agency_id AND a.status = 'approved'
       JOIN app.zone_window_tb w ON w.zone_id = z.zone_id
       WHERE zb.box_id = ANY($1::text[])`,
      [boxIds],
    );
    const { rows: passes } = await db.query<{ box_id: string; agency_id: string; passed_date: Date }>(
      `SELECT box_id, agency_id, max(checked_date) AS passed_date FROM app.inspection_tb
       WHERE box_id = ANY($1::text[]) AND status = 'passed' AND checked_date >= $2::timestamptz - interval '1 day'
       GROUP BY box_id, agency_id`,
      [boxIds, now],
    );
    return new Set(
      boxIds.filter((id) => {
        const agencies = new Map<string, [string, string][]>();
        for (const w of windows) {
          if (w.box_id === id) agencies.set(w.agency_id, [...(agencies.get(w.agency_id) ?? []), [w.s, w.e]]);
        }
        const lastPass = new Map(passes.filter((p) => p.box_id === id).map((p) => [p.agency_id, p.passed_date]));
        return patrolComplete(agencies, lastPass, now);
      }),
    );
  }

  /**
   * ตู้ที่พักได้ระหว่างเวลาตรวจ — เงื่อนไขเดียวของทั้งสถานะที่แสดงและการแจ้งตู้หลุด:
   * ตรวจครบแล้ว หรือ ตู้แจ้งว่าหลับหลังมีการตรวจผ่านในช่วงที่กำลังเดินอยู่ (เฟิร์มแวร์เดิมหลับหลังผ่านครั้งแรก)
   * ตู้ที่อยู่นอกเวลาตรวจไม่อยู่ในผลลัพธ์
   * @param windows เวลาตรวจรวมของแต่ละตู้ (windowsOf)
   */
  async restingBoxes(windows: Map<string, [string, string][]>, now = new Date(), db: Db = this.pool): Promise<Map<string, { asleep: boolean }>> {
    const started = new Map<string, Date>();
    for (const [id, list] of windows) {
      const at = windowStartedAt(list, now);
      if (at) started.set(id, at);
    }
    const out = new Map<string, { asleep: boolean }>();
    if (!started.size) return out;
    const ids = [...started.keys()];
    const complete = await this.patrolCompleteOf(ids, now, db);
    const { rows } = await db.query<{ box_id: string; sleep_date: Date | null; last_poll_date: Date | null; passed_date: Date | null }>(
      `SELECT b.box_id, b.sleep_date, b.last_poll_date,
              (SELECT max(i.checked_date) FROM app.inspection_tb i WHERE i.box_id = b.box_id AND i.status = 'passed') AS passed_date
       FROM app.box_tb b WHERE b.box_id = ANY($1::text[])`,
      [ids],
    );
    for (const r of rows) {
      const asleep = !!r.sleep_date && (!r.last_poll_date || r.sleep_date >= r.last_poll_date);
      const sleptAfterPass = asleep && !!r.passed_date && r.passed_date >= started.get(r.box_id)! && r.sleep_date! >= r.passed_date;
      if (complete.has(r.box_id) || sleptAfterPass) out.set(r.box_id, { asleep });
    }
    return out;
  }

  /** ค่าที่ตู้นี้ควรมี + เลขเวอร์ชัน */
  async forBox(boxId: string, db: Db = this.pool): Promise<{ config: BoxConfig; ver: number }> {
    const base = await this.defaults(db);
    const override = await db.query<{ config_override: Record<string, unknown>; config_generation: number }>(
      `SELECT config_override, config_generation FROM app.box_tb WHERE box_id = $1`,
      [boxId],
    );
    const windows = await this.windowsOf([boxId], db);
    const config: BoxConfig = {
      windows: windows.get(boxId) ?? [],
      tz: BOX_TZ,
      ...resolveDefaults(base as unknown as Record<string, unknown>, override.rows[0]?.config_override ?? {}),
    };
    return { config, ver: configVersion(config, override.rows[0]?.config_generation ?? 0) };
  }

  /** สถานะที่แสดงของหลายตู้ (api.md §4.2) */
  async statusOf(
    boxes: { box_id: string; service_active: boolean; owner_user_id: string | null; last_poll_date: Date | null; last_seen_date: Date | null; config_override?: Record<string, unknown> }[],
    db: Db = this.pool,
  ): Promise<Map<string, BoxStatus>> {
    const [base, windows] = await Promise.all([this.defaults(db), this.windowsOf(boxes.map((b) => b.box_id), db)]);
    const now = new Date();
    const resting = await this.restingBoxes(windows, now, db);
    return new Map(
      boxes.map((b) => {
        const wait = resolveDefaults(base as unknown as Record<string, unknown>, b.config_override ?? {}).longpoll_wait_s;
        return [b.box_id, boxStatus(b, windows.get(b.box_id) ?? [], wait, now, resting.get(b.box_id) ?? null)];
      }),
    );
  }
}
