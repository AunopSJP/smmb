import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import { isPgError, PG_UNIQUE_VIOLATION, withTx, type Db } from '../db/tx.js';
import { AgencyService, type MemberDto } from './agency.service.js';

/** api.md §8.3 `Zone` */
export interface ZoneDto {
  id: string;
  name: string;
  windows: [string, string][];
  tz: string;
  houses_count: number;
  officers_count: number;
  /** หัวหน้าคนที่เรียกอยู่ในโซนนี้ (ป้าย "โซนที่ฉันอยู่" — ตรวจตู้ได้เฉพาะโซนนี้) */
  is_mine: boolean;
  updated_at: string;
}

/** api.md §8.3 `ZoneHouse` — หัวหน้าเห็นแค่บ้านเลขที่ + ชื่อตู้ (ไม่เห็นชื่อ/เบอร์เจ้าของบ้าน) */
export interface ZoneHouseDto {
  box_id: string;
  house_no: string | null;
  box_name: string | null;
  box_status: 'online' | 'sleeping' | 'offline' | 'service_closed' | 'unbound';
}

export type ZoneFilter = 'mine' | 'all';

/** เวลาตรวจสูงสุดต่อโซน (✅ เลือก 2026-10-27) */
export const MAX_WINDOWS = 4;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * ตรวจช่วงเวลาตรวจ: "HH:mm" · start < end (ไม่ข้ามเที่ยงคืน — ตรวจข้ามคืนให้แยก 2 ช่วง) · ไม่ทับกัน · ไม่เกิน 4 ช่วง
 * คืนช่วงที่เรียงตามเวลาเริ่มแล้ว · ผิด → 400 WINDOWS_INVALID
 */
export function normalizeWindows(input: unknown): [string, string][] {
  const bad = (why: string) => new AppError(HttpStatus.BAD_REQUEST, 'WINDOWS_INVALID', why);
  if (!Array.isArray(input)) throw bad('windows must be an array of ["HH:mm","HH:mm"]');
  if (input.length > MAX_WINDOWS) throw bad(`at most ${MAX_WINDOWS} windows`);
  const list = input.map((w) => {
    if (!Array.isArray(w) || w.length !== 2 || !HHMM.test(String(w[0])) || !HHMM.test(String(w[1])))
      throw bad('each window must be ["HH:mm","HH:mm"]');
    const [s, e] = [String(w[0]), String(w[1])];
    if (s >= e) throw bad('start must be before end (split overnight windows in two)');
    return [s, e] as [string, string];
  });
  list.sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = 1; i < list.length; i++) if (list[i][0] < list[i - 1][1]) throw bad('windows must not overlap');
  return list;
}

const toTime = (hhmm: string) => `${hhmm}:00`;
const fromTime = (t: string) => t.slice(0, 5);

/**
 * โซนของหน่วยงาน (api.md §8.3) — หัวหน้าทำได้ทุกโซนของหน่วยงานตัวเอง
 * โซนของหน่วยงานอื่น / ที่ลบแล้ว → 404 · กรองหน่วยงานใน SQL ทุกคำสั่ง (CLAUDE.md กฎข้อ 9)
 * ยังไม่มี: ใส่บ้านเข้าโซน (PUT …/houses) และค้นบ้าน — รอผู้ใช้ตอบว่าบ้านหลังเดียวอยู่ในโซนของหลายหน่วยงานได้ไหม
 */
@Injectable()
export class ZoneService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly agency: AgencyService,
  ) {}

  async list(agencyId: string, userId: string, filter: ZoneFilter = 'all'): Promise<ZoneDto[]> {
    return this.query(this.pool, agencyId, userId, { mine: filter === 'mine' });
  }

  async get(agencyId: string, userId: string, zoneId: string): Promise<ZoneDto & { houses: ZoneHouseDto[]; officers: MemberDto[] }> {
    const [zone] = await this.query(this.pool, agencyId, userId, { zoneId });
    if (!zone) throw new NotFoundException();
    const houses = await this.pool.query<ZoneHouseDto>(
      `SELECT b.box_id, b.house_no, b.name AS box_name,
              CASE WHEN NOT b.service_active THEN 'service_closed'
                   WHEN b.owner_user_id IS NULL THEN 'unbound'
                   WHEN b.online_state = 'unknown' THEN 'offline'
                   ELSE b.online_state END AS box_status
       FROM app.zone_box_tb zb JOIN app.box_tb b ON b.box_id = zb.box_id
       WHERE zb.zone_id = $1
       ORDER BY b.house_no NULLS LAST, b.box_id`,
      [zoneId],
    );
    const officers = await this.officersOf(agencyId, zoneId);
    return { ...zone, houses: houses.rows, officers };
  }

  async create(agencyId: string, userId: string, name: string, windows: unknown): Promise<ZoneDto> {
    const list = normalizeWindows(windows);
    const zoneId = await withTx(this.pool, async (db) => {
      const { rows } = await this.uniqueName(() =>
        db.query<{ zone_id: string }>(`INSERT INTO app.zone_tb (agency_id, name) VALUES ($1, $2) RETURNING zone_id`, [agencyId, name]),
      );
      await this.writeWindows(db, rows[0].zone_id, list);
      return rows[0].zone_id;
    });
    const [zone] = await this.query(this.pool, agencyId, userId, { zoneId });
    return zone;
  }

  async update(agencyId: string, userId: string, zoneId: string, patch: { name?: string; windows?: unknown }): Promise<ZoneDto> {
    const list = patch.windows === undefined ? undefined : normalizeWindows(patch.windows);
    await withTx(this.pool, async (db) => {
      await this.lock(db, agencyId, zoneId);
      if (patch.name !== undefined) {
        await this.uniqueName(() => db.query(`UPDATE app.zone_tb SET name = $2 WHERE zone_id = $1`, [zoneId, patch.name]));
      }
      if (list) {
        await db.query(`DELETE FROM app.zone_window_tb WHERE zone_id = $1`, [zoneId]);
        await this.writeWindows(db, zoneId, list);
        // แตะ updated_date ของโซน (ตู้ในโซนรับเวลาตรวจใหม่ตอนรายงานรายวัน — เฟส 2)
        await db.query(`UPDATE app.zone_tb SET updated_date = now() WHERE zone_id = $1`, [zoneId]);
      }
    });
    const [zone] = await this.query(this.pool, agencyId, userId, { zoneId });
    return zone;
  }

  /** แทนที่เจ้าหน้าที่ทั้งชุด — ทุกคนต้องเป็นสมาชิก active ของหน่วยงานนี้ (ไม่งั้น 400 OFFICER_NOT_MEMBER) */
  async setOfficers(agencyId: string, zoneId: string, userIds: string[]): Promise<MemberDto[]> {
    const ids = [...new Set(userIds)];
    await withTx(this.pool, async (db) => {
      await this.lock(db, agencyId, zoneId);
      if (ids.length) {
        const { rows } = await db.query<{ user_id: string }>(
          `SELECT m.user_id FROM app.agency_member_tb m
           JOIN app.user_role_tb r ON r.user_id = m.user_id AND r.role = 'officer' AND r.status = 'active'
           WHERE m.agency_id = $1 AND m.status = 'active' AND m.user_id = ANY($2::text[])`,
          [agencyId, ids],
        );
        if (rows.length !== ids.length) {
          throw new AppError(HttpStatus.BAD_REQUEST, 'OFFICER_NOT_MEMBER', 'every officer must be an active member of this agency');
        }
      }
      await db.query(`DELETE FROM app.zone_officer_tb WHERE zone_id = $1 AND NOT (user_id = ANY($2::text[]))`, [zoneId, ids]);
      await db.query(
        `INSERT INTO app.zone_officer_tb (zone_id, user_id) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
        [zoneId, ids],
      );
      await db.query(`UPDATE app.zone_tb SET updated_date = now() WHERE zone_id = $1`, [zoneId]);
    });
    return this.officersOf(agencyId, zoneId);
  }

  /** ลบแบบเก็บประวัติ (log การตรวจยังอ้างถึงได้) · บ้านที่ไม่เหลือโซนไหนกลับเป็น "ยังไม่มีเจ้าหน้าที่ดูแล" */
  async remove(agencyId: string, zoneId: string): Promise<void> {
    await withTx(this.pool, async (db) => {
      await this.lock(db, agencyId, zoneId);
      await db.query(`UPDATE app.zone_tb SET deleted_date = now() WHERE zone_id = $1`, [zoneId]);
      await db.query(`DELETE FROM app.zone_officer_tb WHERE zone_id = $1`, [zoneId]);
      await db.query(`DELETE FROM app.zone_box_tb WHERE zone_id = $1`, [zoneId]);
    });
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  /** โซนนี้ต้องเป็นของหน่วยงานนี้และยังไม่ถูกลบ — ไม่ใช่ = 404 · ล็อกแถวกันแก้พร้อมกัน */
  private async lock(db: Db, agencyId: string, zoneId: string): Promise<void> {
    const { rows } = await db.query(
      `SELECT 1 FROM app.zone_tb WHERE zone_id = $1 AND agency_id = $2 AND deleted_date IS NULL FOR UPDATE`,
      [zoneId, agencyId],
    );
    if (!rows[0]) throw new NotFoundException();
  }

  private async uniqueName<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isPgError(err, PG_UNIQUE_VIOLATION, 'zone_name_per_agency')) {
        throw new AppError(HttpStatus.CONFLICT, 'ZONE_NAME_TAKEN', 'another zone of this agency already has this name');
      }
      throw err;
    }
  }

  private async writeWindows(db: Db, zoneId: string, list: [string, string][]): Promise<void> {
    for (const [s, e] of list) {
      await db.query(`INSERT INTO app.zone_window_tb (zone_id, start_time, end_time) VALUES ($1, $2, $3)`, [zoneId, toTime(s), toTime(e)]);
    }
  }

  private async officersOf(agencyId: string, zoneId: string): Promise<MemberDto[]> {
    const members = await this.agency.listMembers(agencyId, 'active');
    return members.filter((m) => m.zones.some((z) => z.id === zoneId));
  }

  private async query(db: Db, agencyId: string, userId: string, opt: { zoneId?: string; mine?: boolean }): Promise<ZoneDto[]> {
    const { rows } = await db.query<{
      zone_id: string;
      name: string;
      tz: string;
      updated_date: Date;
      windows: [string, string][] | null;
      houses_count: number;
      officers_count: number;
      is_mine: boolean;
    }>(
      `SELECT z.zone_id, z.name, z.tz, z.updated_date,
              (SELECT json_agg(json_build_array(to_char(w.start_time, 'HH24:MI'), to_char(w.end_time, 'HH24:MI')) ORDER BY w.start_time)
                 FROM app.zone_window_tb w WHERE w.zone_id = z.zone_id) AS windows,
              (SELECT count(*)::int FROM app.zone_box_tb zb WHERE zb.zone_id = z.zone_id) AS houses_count,
              (SELECT count(*)::int FROM app.zone_officer_tb zo WHERE zo.zone_id = z.zone_id) AS officers_count,
              EXISTS (SELECT 1 FROM app.zone_officer_tb zo WHERE zo.zone_id = z.zone_id AND zo.user_id = $2) AS is_mine
       FROM app.zone_tb z
       WHERE z.agency_id = $1 AND z.deleted_date IS NULL
         AND ($3::uuid IS NULL OR z.zone_id = $3::uuid)
         AND (NOT $4::boolean OR EXISTS (SELECT 1 FROM app.zone_officer_tb zo WHERE zo.zone_id = z.zone_id AND zo.user_id = $2))
       ORDER BY lower(z.name)`,
      [agencyId, userId, opt.zoneId ?? null, opt.mine ?? false],
    );
    return rows.map((r) => ({
      id: r.zone_id,
      name: r.name,
      windows: (r.windows ?? []).map(([s, e]) => [fromTime(s), fromTime(e)] as [string, string]),
      tz: r.tz,
      houses_count: r.houses_count,
      officers_count: r.officers_count,
      is_mine: r.is_mine,
      updated_at: r.updated_date.toISOString(),
    }));
  }
}
