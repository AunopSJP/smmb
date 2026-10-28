import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { BOX_TZ } from '../box/box-config.js';
import { BoxConfigService } from '../box/box-config.service.js';
import { PG_POOL } from '../db/db.module.js';

/** api.md §8.1 `GET /agency/today` (L04) */
export interface TodayZoneDto {
  id: string;
  name: string;
  is_mine: boolean;
  windows: [string, string][];
  houses_total: number;
  houses_checked: number;
  houses_offline: number;
  officers: { id: string; display_name: string }[];
}

export interface TodayDto {
  date: string;
  zones: TodayZoneDto[];
  sos_today: number;
  sos_open: number;
  members_pending: number;
}

/** api.md §8.4 `GET /agency/logs` (L08) — การสแกนของคนในหน่วยงาน (รวมที่ไม่ผ่าน · กฎข้อ 6) */
export interface AgencyLogDto {
  id: string;
  at: string;
  officer: { id: string; display_name: string } | null;
  box_id: string | null;
  house_no: string | null;
  qr_kind: 'front' | 'activate' | 'badge';
  qr_slot: 1 | 2 | null;
  method: 'scan' | 'code';
  result: string;
}

const LOG_PAGE = 30;

/** ภาพรวมทีมวันนี้ + ประวัติการสแกนของหน่วยงาน — กรองหน่วยงานใน SQL ทุกคำสั่ง (กฎข้อ 9) */
@Injectable()
export class AgencyTodayService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly boxConfigs: BoxConfigService,
  ) {}

  async today(agencyId: string, userId: string, filter: 'mine' | 'all'): Promise<TodayDto> {
    // "วันนี้" = วันตามเวลาไทย
    const { rows: zones } = await this.pool.query<{
      zone_id: string;
      name: string;
      is_mine: boolean;
      windows: [string, string][];
      officers: { id: string; display_name: string }[];
    }>(
      `SELECT z.zone_id, z.name,
              EXISTS (SELECT 1 FROM app.zone_officer_tb o WHERE o.zone_id = z.zone_id AND o.user_id = $2) AS is_mine,
              coalesce((SELECT json_agg(json_build_array(to_char(w.start_time, 'HH24:MI'), to_char(w.end_time, 'HH24:MI')) ORDER BY w.start_time)
                        FROM app.zone_window_tb w WHERE w.zone_id = z.zone_id), '[]') AS windows,
              coalesce((SELECT json_agg(json_build_object('id', u.user_id, 'display_name', u.display_name) ORDER BY u.display_name)
                        FROM app.zone_officer_tb o JOIN app.user_tb u ON u.user_id = o.user_id WHERE o.zone_id = z.zone_id), '[]') AS officers
       FROM app.zone_tb z
       WHERE z.agency_id = $1 AND z.deleted_date IS NULL
       ORDER BY z.name`,
      [agencyId, userId],
    );
    const visible = filter === 'mine' ? zones.filter((z) => z.is_mine) : zones;
    const zoneIds = visible.map((z) => z.zone_id);

    const { rows: houses } = await this.pool.query<{
      zone_id: string;
      box_id: string;
      service_active: boolean;
      owner_user_id: string | null;
      last_poll_date: Date | null;
      last_seen_date: Date | null;
      config_override: Record<string, unknown>;
      checked: boolean;
    }>(
      `SELECT zb.zone_id, b.box_id, b.service_active, b.owner_user_id, b.last_poll_date, b.last_seen_date, b.config_override,
              EXISTS (SELECT 1 FROM app.inspection_tb i
                      WHERE i.box_id = b.box_id AND i.agency_id = $2 AND i.status = 'passed'
                        AND (i.checked_date AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date) AS checked
       FROM app.zone_box_tb zb JOIN app.box_tb b ON b.box_id = zb.box_id
       WHERE zb.zone_id = ANY($1::uuid[])`,
      [zoneIds, agencyId, BOX_TZ],
    );
    const status = await this.boxConfigs.statusOf(houses);

    const [{ rows: sos }, { rows: pending }] = await Promise.all([
      this.pool.query<{ today: number; open: number }>(
        `SELECT count(*) FILTER (WHERE (s.created_date AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date)::int AS today,
                count(*) FILTER (WHERE s.status IN ('open','accepted'))::int AS open
         FROM app.sos_case_tb s
         WHERE EXISTS (SELECT 1 FROM app.zone_box_tb zb WHERE zb.box_id = s.box_id AND zb.zone_id = ANY($1::uuid[]))`,
        [zoneIds, BOX_TZ],
      ),
      this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM app.agency_member_tb WHERE agency_id = $1 AND status = 'pending'`, [agencyId]),
    ]);

    return {
      date: new Intl.DateTimeFormat('en-CA', { timeZone: BOX_TZ }).format(new Date()),
      zones: visible.map((z) => {
        const mine = houses.filter((h) => h.zone_id === z.zone_id);
        return {
          id: z.zone_id,
          name: z.name,
          is_mine: z.is_mine,
          windows: z.windows,
          houses_total: mine.length,
          houses_checked: mine.filter((h) => h.checked).length,
          houses_offline: mine.filter((h) => status.get(h.box_id) === 'offline').length,
          officers: z.officers,
        };
      }),
      sos_today: sos[0]?.today ?? 0,
      sos_open: sos[0]?.open ?? 0,
      members_pending: pending[0]?.n ?? 0,
    };
  }

  /** สมาชิกทุกสถานะของหน่วยงาน (คนที่ถูกปิดไปแล้วก็ยังเห็นประวัติเดิม) · ใหม่สุดก่อน */
  async logs(agencyId: string, page: number): Promise<{ data: AgencyLogDto[]; page: number; per_page: number }> {
    const { rows } = await this.pool.query<{
      scan_log_id: string;
      created_date: Date;
      user_id: string | null;
      display_name: string | null;
      box_id: string | null;
      house_no: string | null;
      qr_kind: AgencyLogDto['qr_kind'];
      slot: string | null;
      method: AgencyLogDto['method'];
      result: string;
    }>(
      // เจ้าหน้าที่สแกน QR หน้าตู้ (actor officer) + ตู้อ่าน QR ประจำตัวของการตรวจของหน่วยงานนี้ (actor box)
      `SELECT l.scan_log_id, l.created_date, coalesce(l.user_id, i.officer_user_id) AS user_id, u.display_name, l.box_id, b.house_no,
              l.qr_kind, q.slot, l.method, l.result
       FROM app.scan_log_tb l
       LEFT JOIN app.inspection_tb i ON i.inspection_id = l.inspection_id
       LEFT JOIN app.user_tb u ON u.user_id = coalesce(l.user_id, i.officer_user_id)
       LEFT JOIN app.box_tb b ON b.box_id = l.box_id
       LEFT JOIN app.box_qr_code_tb q ON q.box_qr_code_id = l.box_qr_code_id
       WHERE (l.actor_kind = 'officer' AND EXISTS (SELECT 1 FROM app.agency_member_tb m WHERE m.user_id = l.user_id AND m.agency_id = $1))
          OR (l.actor_kind = 'box' AND i.agency_id = $1)
       ORDER BY l.created_date DESC, l.scan_log_id DESC
       LIMIT $2 OFFSET $3`,
      [agencyId, LOG_PAGE, (page - 1) * LOG_PAGE],
    );
    return {
      data: rows.map((r) => ({
        id: String(r.scan_log_id),
        at: r.created_date.toISOString(),
        officer: r.user_id ? { id: r.user_id, display_name: r.display_name ?? '' } : null,
        box_id: r.box_id,
        house_no: r.house_no,
        qr_kind: r.qr_kind,
        qr_slot: r.slot === '1' ? 1 : r.slot === '2' ? 2 : null,
        method: r.method,
        result: r.result,
      })),
      page,
      per_page: LOG_PAGE,
    };
  }
}
