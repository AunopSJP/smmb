import { NotificationService } from '../push/notification.service.js';
import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import { isPgError, PG_UNIQUE_VIOLATION, withTx, type Db } from '../db/tx.js';
import { BoxConfigService } from '../box/box-config.service.js';
import type { BoxStatus } from '../box/box-config.js';
import { AgencyService, type MemberDto } from './agency.service.js';

/** api.md §8.3 `Zone` */
/** จังหวัด + เขต/อำเภอ (+ แขวง/ตำบล) ที่โซนดูแล */
export interface ZoneArea {
  province: string;
  district: string;
  subdistrict: string | null;
}

export interface ZoneDto {
  id: string;
  name: string;
  windows: [string, string][];
  tz: string;
  houses_count: number;
  officers_count: number;
  /** พื้นที่ครอบคลุม (null = ยังไม่ตั้ง → เพิ่มบ้านไม่ได้) · ✅ 2026-11-06 */
  area: ZoneArea | null;
  /** หัวหน้าคนที่เรียกอยู่ในโซนนี้ (ป้าย "โซนที่ฉันอยู่" — ตรวจตู้ได้เฉพาะโซนนี้) */
  is_mine: boolean;
  updated_at: string;
}

/** api.md §8.3 `ZoneHouse` — หัวหน้าเห็นแค่บ้านเลขที่ + ชื่อตู้ (ไม่เห็นชื่อ/เบอร์เจ้าของบ้าน) */
export interface ZoneHouseDto {
  box_id: string;
  house_no: string | null;
  box_name: string | null;
  /** ย่าน/หมู่บ้านที่เจ้าของระบุ (ไม่ระบุ = null) */
  area: string | null;
  box_status: BoxStatus;
  /** ✅ 2026-11-04 true = รอเจ้าของบ้านกดยอมรับ (ยังไม่อยู่ในโซน ยังตรวจไม่ได้) */
  pending: boolean;
}

/** api.md §8.3 ผลค้นบ้าน — ใช้ตอนเพิ่มบ้านเข้าโซน · zones = โซนที่บ้านนี้อยู่แล้ว (ทุกหน่วยงาน) */
export interface HouseSearchDto {
  box_id: string;
  house_no: string | null;
  box_name: string | null;
  area: string | null;
  /** แขวง/ตำบล + เขต/อำเภอ (✅ 2026-11-04 ไม่มีบ้านเลขที่/ซอย) — ให้หัวหน้าแยกบ้านได้ */
  locality: string;
  /** มีคำขอเข้าโซนของหน่วยงานเรารออยู่ */
  pending_mine: boolean;
  /** ตู้ออนไลน์ไหม / ปิดบริการไหม — ให้หัวหน้าเห็นว่าเพิ่มบ้านที่ตรวจได้จริงหรือเปล่า */
  box_status: BoxStatus;
  /** โซนที่บ้านนี้อยู่แล้ว (ทุกหน่วยงาน) · mine = ของหน่วยงานเรา */
  zones: { agency_name: string; zone_name: string; mine: boolean }[];
}

/** ผลค้นบ้านสูงสุดต่อครั้ง */
export const HOUSE_SEARCH_LIMIT = 20;

/** ใส่ใน LIKE ได้ปลอดภัย (\ % _ เป็นตัวอักษรธรรมดา) */
export const likeContains = (q: string) => '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';

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

export interface ZoneAreaInput {
  province?: string | null;
  district?: string | null;
  subdistrict?: string | null;
}

/** ว่างทั้งหมด = ไม่ตั้ง (null) · ต้องมีจังหวัด + เขต/อำเภอคู่กัน ไม่งั้น 400 ZONE_AREA_INVALID */
export function normalizeArea(input?: ZoneAreaInput | null): ZoneArea | null {
  const t = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null);
  const province = t(input?.province);
  const district = t(input?.district);
  const subdistrict = t(input?.subdistrict);
  if (!province && !district && !subdistrict) return null;
  if (!province || !district) throw new AppError(HttpStatus.BAD_REQUEST, 'ZONE_AREA_INVALID', 'province and district are required together');
  return { province, district, subdistrict };
}

const toTime = (hhmm: string) => `${hhmm}:00`;
const fromTime = (t: string) => t.slice(0, 5);

/**
 * โซนของหน่วยงาน (api.md §8.3) — หัวหน้าทำได้ทุกโซนของหน่วยงานตัวเอง
 * โซนของหน่วยงานอื่น / ที่ลบแล้ว → 404 · กรองหน่วยงานใน SQL ทุกคำสั่ง (CLAUDE.md กฎข้อ 9)
 * บ้านหลังเดียวอยู่ในโซนของหลายหน่วยงานได้ (✅ ผู้ใช้ตอบ 2026-10-28 เช่น ตำรวจ + รปภ.หมู่บ้าน)
 */
@Injectable()
export class ZoneService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly agency: AgencyService,
    private readonly boxConfigs: BoxConfigService,
    private readonly notifications: NotificationService,
  ) {}

  async list(agencyId: string, userId: string, filter: ZoneFilter = 'all'): Promise<ZoneDto[]> {
    return this.query(this.pool, agencyId, userId, { mine: filter === 'mine' });
  }

  async get(agencyId: string, userId: string, zoneId: string): Promise<ZoneDto & { houses: ZoneHouseDto[]; officers: MemberDto[] }> {
    const [zone] = await this.query(this.pool, agencyId, userId, { zoneId });
    if (!zone) throw new NotFoundException();
    const [houses, officers] = await Promise.all([this.housesOf(zoneId), this.officersOf(agencyId, zoneId)]);
    return { ...zone, houses, officers };
  }

  /**
   * แทนที่บ้านในโซนทั้งชุด (`L07-b`) — ต้องเป็นตู้ที่มีเจ้าของผูกแล้ว ไม่งั้น 400 HOUSE_NOT_FOUND
   * บ้านที่อยู่ในโซนของหน่วยงานอื่นอยู่แล้วใส่ได้ (✅ 2026-10-28) · เวลาตรวจของตู้ = รวมทุกโซน → ตู้รับค่าใหม่ตอนรายงานรายวัน
   * ✅ 2026-11-04 บ้านใหม่ = ส่งคำขอให้เจ้าของบ้านกดยอมรับก่อน (zone_box_request_tb) · เอาออก = ออกทันที + ยกเลิกคำขอที่ค้าง
   */
  async setHouses(agencyId: string, zoneId: string, boxIds: string[], requestedBy: string): Promise<ZoneHouseDto[]> {
    const ids = [...new Set(boxIds)];
    const asked = await withTx(this.pool, async (db) => {
      await this.lock(db, agencyId, zoneId);
      if (ids.length) {
        const { rows } = await db.query<{ box_id: string }>(
          `SELECT box_id FROM app.box_tb WHERE box_id = ANY($1::text[]) AND owner_user_id IS NOT NULL`,
          [ids],
        );
        if (rows.length !== ids.length) {
          throw new AppError(HttpStatus.BAD_REQUEST, 'HOUSE_NOT_FOUND', 'every box must exist and be bound to an owner');
        }
      }
      await db.query(`DELETE FROM app.zone_box_tb WHERE zone_id = $1 AND NOT (box_id = ANY($2::text[]))`, [zoneId, ids]);
      await db.query(
        `UPDATE app.zone_box_request_tb SET status = 'cancelled', decided_by = $3, decided_date = now()
         WHERE zone_id = $1 AND status = 'pending' AND NOT (box_id = ANY($2::text[]))`,
        [zoneId, ids, requestedBy],
      );
      const { rows: created } = await db.query<{ zone_box_request_id: string; box_id: string; owner_user_id: string }>(
        `INSERT INTO app.zone_box_request_tb (zone_id, box_id, requested_by)
         SELECT $1, x, $3 FROM unnest($2::text[]) AS x
         WHERE NOT EXISTS (SELECT 1 FROM app.zone_box_tb zb WHERE zb.zone_id = $1 AND zb.box_id = x)
         ON CONFLICT DO NOTHING
         RETURNING zone_box_request_id, box_id, (SELECT owner_user_id FROM app.box_tb b WHERE b.box_id = zone_box_request_tb.box_id)`,
        [zoneId, ids, requestedBy],
      );
      await db.query(`UPDATE app.zone_tb SET updated_date = now() WHERE zone_id = $1`, [zoneId]);
      return created;
    });
    if (asked.length) {
      const { rows } = await this.pool.query<{ agency_name: string; zone_name: string }>(
        `SELECT a.name AS agency_name, z.name AS zone_name FROM app.zone_tb z JOIN app.agency_tb a ON a.agency_id = z.agency_id WHERE z.zone_id = $1`,
        [zoneId],
      );
      for (const r of asked) {
        await this.notifications
          .notify([r.owner_user_id], {
            type: 'zone_join_request',
            data: { request_id: r.zone_box_request_id, box_id: r.box_id, agency_name: rows[0]?.agency_name ?? '', zone_name: rows[0]?.zone_name ?? '' },
            link: '/home/settings',
          })
          .catch(() => undefined);
      }
    }
    return this.housesOf(zoneId);
  }

  /**
   * ค้นบ้านจากบ้านเลขที่ (หรือรหัสตู้) เพื่อเพิ่มเข้าโซน — เฉพาะตู้ที่มีเจ้าของแล้ว · ไม่เห็นชื่อ/เบอร์เจ้าของบ้าน
   * บอกว่าบ้านนี้อยู่โซนไหนแล้วบ้าง (รวมหน่วยงานอื่น) ให้หัวหน้าเห็นว่ามีใครดูแลอยู่
   * ไม่ใส่คำค้น = บ้านที่ยังไม่มีหน่วยงานไหนดูแล (ไล่ดูแล้วเพิ่มได้เลย โดยไม่ต้องรู้บ้านเลขที่) · ตรงต้นคำขึ้นก่อน
   */
  async searchHouses(agencyId: string, q?: string, opt: { unzoned?: boolean; online?: boolean; zoneId?: string } = {}): Promise<HouseSearchDto[]> {
    const term = q?.trim() ?? '';
    // ระบุโซน = เห็นเฉพาะบ้านที่อยู่ในพื้นที่ของโซนนั้น (โซนของหน่วยงานอื่น/ไม่มี → 404 · ยังไม่ตั้งพื้นที่ → ไม่มีผล)
    let area: ZoneArea | null = null;
    if (opt.zoneId) {
      const z = await this.pool.query<{ province: string | null; district: string | null; subdistrict: string | null }>(
        `SELECT province, district, subdistrict FROM app.zone_tb WHERE zone_id = $1::uuid AND agency_id = $2 AND deleted_date IS NULL`,
        [opt.zoneId, agencyId],
      );
      if (!z.rows[0]) throw new NotFoundException();
      if (!z.rows[0].province || !z.rows[0].district) return [];
      area = { province: z.rows[0].province, district: z.rows[0].district, subdistrict: z.rows[0].subdistrict };
    }
    // ไม่ใส่คำค้นและไม่ระบุตัวกรอง = บ้านที่ยังไม่มีใครดูแล (พฤติกรรมเดิม)
    const unzoned = opt.unzoned ?? term === '';
    const { rows } = await this.pool.query<{
      box_id: string;
      house_no: string | null;
      name: string | null;
      area: string | null;
      owner_user_id: string | null;
      service_active: boolean;
      last_poll_date: Date | null;
      last_seen_date: Date | null;
      config_override: Record<string, unknown>;
      zones: HouseSearchDto['zones'];
      locality: string;
      pending_mine: boolean;
    }>(
      `SELECT b.box_id, b.house_no, b.name, b.area, b.owner_user_id, b.service_active, b.last_poll_date, b.last_seen_date, b.config_override,
              coalesce((SELECT json_agg(json_build_object('agency_name', a.name, 'zone_name', z.name, 'mine', a.agency_id = $3) ORDER BY a.name, z.name)
                FROM app.zone_box_tb zb
                JOIN app.zone_tb z ON z.zone_id = zb.zone_id AND z.deleted_date IS NULL
                JOIN app.agency_tb a ON a.agency_id = z.agency_id AND a.status = 'approved'
                WHERE zb.box_id = b.box_id), '[]') AS zones,
              concat_ws(' ', b.subdistrict, b.district) AS locality,
              EXISTS (SELECT 1 FROM app.zone_box_request_tb r JOIN app.zone_tb z ON z.zone_id = r.zone_id
                      WHERE r.box_id = b.box_id AND r.status = 'pending' AND z.agency_id = $3) AS pending_mine
       FROM app.box_tb b
       WHERE b.owner_user_id IS NOT NULL
         AND (
           $4::boolean
           OR (b.house_no ILIKE $1 OR b.box_id ILIKE $1 OR replace(b.box_id, '-', '') ILIKE $1 OR b.area ILIKE $1
               OR b.subdistrict ILIKE $1 OR b.district ILIKE $1 OR b.province ILIKE $1 OR b.address_line ILIKE $1)
         )
         AND ($7::text IS NULL OR (
           app.norm_place(b.province) = app.norm_place($7) AND app.norm_place(b.district) = app.norm_place($8)
           AND ($9::text IS NULL OR app.norm_place(b.subdistrict) = app.norm_place($9))))
         AND (NOT $6::boolean OR NOT EXISTS (
           SELECT 1 FROM app.zone_box_tb zb
           JOIN app.zone_tb z ON z.zone_id = zb.zone_id AND z.deleted_date IS NULL
           JOIN app.agency_tb a ON a.agency_id = z.agency_id AND a.status = 'approved'
           WHERE zb.box_id = b.box_id))
       ORDER BY (b.house_no ILIKE $5 OR b.box_id ILIKE $5) DESC, b.house_no NULLS LAST, b.box_id
       LIMIT $2`,
      [likeContains(term), HOUSE_SEARCH_LIMIT, agencyId, term === '', likeContains(term).slice(1), unzoned, area?.province ?? null, area?.district ?? null, area?.subdistrict ?? null],
    );
    const status = await this.boxConfigs.statusOf(rows);
    return rows
      .map((r) => ({
        box_id: r.box_id,
        house_no: r.house_no,
        box_name: r.name,
        area: r.area,
        locality: r.locality,
        pending_mine: r.pending_mine,
        box_status: status.get(r.box_id)!,
        zones: r.zones,
      }))
      .filter((r) => !opt.online || r.box_status === 'online');
  }

  async create(agencyId: string, userId: string, name: string, windows: unknown, area?: ZoneAreaInput): Promise<ZoneDto> {
    const list = normalizeWindows(windows);
    const a = normalizeArea(area);
    const zoneId = await withTx(this.pool, async (db) => {
      const { rows } = await this.uniqueName(() =>
        db.query<{ zone_id: string }>(
          `INSERT INTO app.zone_tb (agency_id, name, province, district, subdistrict) VALUES ($1, $2, $3, $4, $5) RETURNING zone_id`,
          [agencyId, name, a?.province ?? null, a?.district ?? null, a?.subdistrict ?? null],
        ),
      );
      await this.writeWindows(db, rows[0].zone_id, list);
      return rows[0].zone_id;
    });
    const [zone] = await this.query(this.pool, agencyId, userId, { zoneId });
    return zone;
  }

  async update(agencyId: string, userId: string, zoneId: string, patch: { name?: string; windows?: unknown; area?: ZoneAreaInput }): Promise<ZoneDto> {
    const list = patch.windows === undefined ? undefined : normalizeWindows(patch.windows);
    const a = patch.area === undefined ? undefined : normalizeArea(patch.area);
    await withTx(this.pool, async (db) => {
      await this.lock(db, agencyId, zoneId);
      if (patch.name !== undefined) {
        await this.uniqueName(() => db.query(`UPDATE app.zone_tb SET name = $2 WHERE zone_id = $1`, [zoneId, patch.name]));
      }
      if (a !== undefined) {
        await db.query(`UPDATE app.zone_tb SET province = $2, district = $3, subdistrict = $4 WHERE zone_id = $1`, [zoneId, a?.province ?? null, a?.district ?? null, a?.subdistrict ?? null]);
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
      await db.query(`UPDATE app.zone_box_request_tb SET status = 'cancelled', decided_date = now() WHERE zone_id = $1 AND status = 'pending'`, [zoneId]);
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

  private async housesOf(zoneId: string): Promise<ZoneHouseDto[]> {
    const { rows } = await this.pool.query<{
      box_id: string;
      house_no: string | null;
      name: string | null;
      area: string | null;
      owner_user_id: string | null;
      service_active: boolean;
      last_poll_date: Date | null;
      last_seen_date: Date | null;
      config_override: Record<string, unknown>;
      pending: boolean;
    }>(
      `SELECT b.box_id, b.house_no, b.name, b.area, b.owner_user_id, b.service_active, b.last_poll_date, b.last_seen_date, b.config_override,
              m.pending
       FROM (SELECT box_id, false AS pending FROM app.zone_box_tb WHERE zone_id = $1
             UNION ALL
             SELECT box_id, true FROM app.zone_box_request_tb WHERE zone_id = $1 AND status = 'pending') m
       JOIN app.box_tb b ON b.box_id = m.box_id
       ORDER BY m.pending, b.house_no NULLS LAST, b.box_id`,
      [zoneId],
    );
    const status = await this.boxConfigs.statusOf(rows);
    return rows.map((r) => ({ box_id: r.box_id, house_no: r.house_no, box_name: r.name, area: r.area, box_status: status.get(r.box_id)!, pending: r.pending }));
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
      province: string | null;
      district: string | null;
      subdistrict: string | null;
    }>(
      `SELECT z.zone_id, z.name, z.tz, z.updated_date, z.province, z.district, z.subdistrict,
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
      area: r.province && r.district ? { province: r.province, district: r.district, subdistrict: r.subdistrict } : null,
      is_mine: r.is_mine,
      updated_at: r.updated_date.toISOString(),
    }));
  }
}
