import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import type { Env } from '../config/env.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx, type Db } from '../db/tx.js';
import { CodeAttempts } from '../rate-limit/code-attempts.js';
import type { BoxStatus } from './box-config.js';
import { BoxConfigService } from './box-config.service.js';
import { BOX_TZ, minutesIntoWindow } from './box-config.js';
import { SosService, type SosStage, type SosStatus } from '../sos/sos.service.js';

/** api.md §4.2 `BoxSummary` */
export interface BoxSummary {
  id: string;
  name: string;
  house_no: string;
  status: BoxStatus;
}

/** api.md §4.3 `BoxEvent` — ส่งของไม่มีข้อมูลไรเดอร์ · เจ้าหน้าที่เห็นแค่หน่วยงาน + ชื่อที่แสดง (ไม่มีเบอร์) */
export interface BoxEventDto {
  id: string;
  type: 'inspected' | 'delivered';
  at: string;
  officer?: { agency_type: string; agency_name: string; display_name: string };
  qr_slot?: 1 | 2;
  method?: 'scan' | 'code';
}

/** api.md §4.2 `BoxDetail` (ฉบับย่อ) */
export interface BoxDetailDto extends BoxSummary {
  battery: { pct: number; charging: boolean | null; reported_at: string | null } | null;
  last_seen_at: string | null;
  /** false = "ยังไม่มีเจ้าหน้าที่ดูแล" → SOS ไปทาง 191/1669 ทันที */
  coverage: { has_officer: boolean; agency_names: string[] };
  patrol: { in_window: boolean; windows: [string, string][]; tz: string };
  latest_events: BoxEventDto[];
  open_sos: { id: string; stage: SosStage; status: SosStatus } | null;
}

type ActivateOutcome =
  | { result: 'ok'; boxId: string; qrId: string }
  | { result: 'invalid' | 'not_system'; boxId: null; qrId: null }
  | { result: 'already_owned'; boxId: string; qrId: string };

/** token ของ QR เปิดใช้ตู้ = 16 ตัวจากชุดตัวอักษรที่ไม่สับสน */
const ACTIVATE_TOKEN = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{16}$/;

/** ตู้ของเจ้าของบ้าน: ผูกตู้ (Activate) · ตั้งชื่อ · รายการ (api.md §4.1–4.2) */
@Injectable()
export class OwnerBoxService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly config: ConfigService<Env, true>,
    private readonly configs: BoxConfigService,
    private readonly codes: CodeAttempts,
    private readonly sos: SosService,
  ) {}

  /** หน้าหลักเจ้าของบ้าน (H03) — ตู้ของคนอื่น → 404 */
  async detail(userId: string, boxId: string): Promise<BoxDetailDto> {
    const [box] = await this.summaries(userId, boxId);
    if (!box) throw new NotFoundException();
    const [row, cfg, coverage, events, openSos] = await Promise.all([
      this.pool.query<{ battery_pct: number | null; charging: boolean | null; battery_date: Date | null; last_seen_date: Date | null }>(
        `SELECT battery_pct, charging, battery_date, last_seen_date FROM app.box_tb WHERE box_id = $1`,
        [boxId],
      ),
      this.configs.forBox(boxId),
      this.pool.query<{ agency_name: string; officers: number }>(
        `SELECT a.name AS agency_name,
                (SELECT count(*)::int FROM app.zone_officer_tb zo
                  JOIN app.agency_member_tb m ON m.user_id = zo.user_id AND m.agency_id = a.agency_id AND m.status = 'active'
                  WHERE zo.zone_id = z.zone_id AND zo.user_id <> $2) AS officers
         FROM app.zone_box_tb zb
         JOIN app.zone_tb z ON z.zone_id = zb.zone_id AND z.deleted_date IS NULL
         JOIN app.agency_tb a ON a.agency_id = z.agency_id AND a.status = 'approved'
         WHERE zb.box_id = $1`,
        [boxId, userId],
      ),
      this.eventsOf(boxId, 5, 0),
      this.sos.openForBox(boxId),
    ]);
    const r = row.rows[0];
    return {
      ...box,
      battery: r.battery_pct === null ? null : { pct: r.battery_pct, charging: r.charging, reported_at: r.battery_date?.toISOString() ?? null },
      last_seen_at: r.last_seen_date?.toISOString() ?? null,
      coverage: {
        has_officer: coverage.rows.some((c) => c.officers > 0),
        agency_names: [...new Set(coverage.rows.map((c) => c.agency_name))],
      },
      patrol: { in_window: minutesIntoWindow(cfg.config.windows, new Date()) !== null, windows: cfg.config.windows, tz: BOX_TZ },
      latest_events: events,
      open_sos: openSos,
    };
  }

  /** ประวัติ (H12) — การตรวจที่ผ่าน + การส่งของ · เฉพาะตั้งแต่ผูกตู้ (เจ้าของเก่าไม่เห็นของเจ้าของใหม่ และกลับกัน) */
  async events(userId: string, boxId: string, page: number, perPage: number): Promise<{ data: BoxEventDto[]; page: number; per_page: number }> {
    const [box] = await this.summaries(userId, boxId);
    if (!box) throw new NotFoundException();
    return { data: await this.eventsOf(boxId, perPage, (page - 1) * perPage), page, per_page: perPage };
  }

  private async eventsOf(boxId: string, limit: number, offset: number): Promise<BoxEventDto[]> {
    const { rows } = await this.pool.query<{
      id: string;
      type: 'inspected' | 'delivered';
      at: Date;
      agency_type: string | null;
      agency_name: string | null;
      display_name: string | null;
      slot: string;
      method: 'scan' | 'code';
    }>(
      `SELECT * FROM (
         SELECT i.inspection_id::text AS id, 'inspected' AS type, i.checked_date AS at, a.type AS agency_type, a.name AS agency_name,
                u.display_name, q.slot, i.method
         FROM app.inspection_tb i
         JOIN app.agency_tb a ON a.agency_id = i.agency_id
         JOIN app.user_tb u ON u.user_id = i.officer_user_id
         JOIN app.box_qr_code_tb q ON q.box_qr_code_id = i.box_qr_code_id
         WHERE i.box_id = $1 AND i.status = 'passed'
           AND i.checked_date >= coalesce((SELECT bound_date FROM app.box_tb WHERE box_id = $1), '-infinity')
         UNION ALL
         SELECT d.delivery_id::text, 'delivered', d.created_date, NULL, NULL, NULL, q.slot, d.method
         FROM app.delivery_tb d JOIN app.box_qr_code_tb q ON q.box_qr_code_id = d.box_qr_code_id
         WHERE d.box_id = $1
           AND d.created_date >= coalesce((SELECT bound_date FROM app.box_tb WHERE box_id = $1), '-infinity')
       ) e ORDER BY at DESC LIMIT $2 OFFSET $3`,
      [boxId, limit, offset],
    );
    return rows.map((e) => ({
      id: e.id,
      type: e.type,
      at: e.at.toISOString(),
      ...(e.type === 'inspected' ? { officer: { agency_type: e.agency_type ?? '', agency_name: e.agency_name ?? '', display_name: e.display_name ?? '' } } : {}),
      qr_slot: Number(e.slot) as 1 | 2,
      method: e.method,
    }));
  }

  /**
   * ผูกตู้ด้วย QR เปิดใช้ตู้ (สแกนลิงก์ /a/<16 ตัว> หรือพิมพ์รหัสใต้ QR) — ใช้ได้ครั้งเดียว ตายใน transaction เดียวกับการผูก
   * ทุกครั้งบันทึก scan_log_tb แม้ไม่ผ่าน (CLAUDE.md กฎข้อ 6)
   */
  async activate(userId: string, input: { qr_text?: string; code?: string }, ip: string | null): Promise<{ box: BoxSummary; needs_name: true }> {
    const method = input.code !== undefined ? 'code' : 'scan';
    const raw = (input.code ?? input.qr_text ?? '').slice(0, 300);
    if (method === 'code') await this.codes.check(ip ?? 'unknown');

    const lookup = method === 'code' ? { printCode: raw.replace(/[\s-]/g, '').toUpperCase() } : { token: this.tokenFromUrl(raw) };
    const outcome = await withTx(this.pool, (db) => this.bind(db, userId, lookup));

    await this.pool.query(
      `INSERT INTO app.scan_log_tb (actor_kind, user_id, box_id, box_qr_code_id, qr_kind, method, raw, result, ip)
       VALUES ('owner', $1, $2, $3, 'activate', $4, $5, $6, $7)`,
      [userId, outcome.boxId, outcome.qrId, method, raw, outcome.result, ip],
    );

    if (outcome.result === 'already_owned') {
      throw new AppError(HttpStatus.CONFLICT, 'BOX_ALREADY_OWNED', 'box already bound — contact support');
    }
    if (outcome.result !== 'ok') {
      if (method === 'code') await this.codes.fail(ip ?? 'unknown');
      throw new AppError(HttpStatus.NOT_FOUND, 'QR_INVALID', 'this activation QR is not valid');
    }
    if (method === 'code') await this.codes.succeed(ip ?? 'unknown');
    const [box] = await this.summaries(userId, outcome.boxId);
    return { box, needs_name: true };
  }

  async list(userId: string): Promise<BoxSummary[]> {
    return this.summaries(userId);
  }

  /** ตั้งชื่อตู้ — ตู้ของคนอื่น → 404 */
  async rename(userId: string, boxId: string, name: string): Promise<BoxSummary> {
    const { rowCount } = await this.pool.query(`UPDATE app.box_tb SET name = $3 WHERE box_id = $1 AND owner_user_id = $2`, [boxId, userId, name]);
    if (!rowCount) throw new NotFoundException();
    const [box] = await this.summaries(userId, boxId);
    return box;
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  /**
   * ลิงก์ต้องมาจากโดเมนใน QR_ALLOWED_HOSTS และ path ลงท้าย /a/<token> · อย่างอื่น = ไม่ใช่ QR ของระบบ
   * เว็บอาจอยู่ใต้ path (PUBLIC_BASE_URL = https://example.com/smmb → /smmb/a/<token>) จึงไม่บังคับให้ /a อยู่ต้น path
   */
  private tokenFromUrl(text: string): string | null {
    let url: URL;
    try {
      url = new URL(text.trim());
    } catch {
      return null;
    }
    if (!this.config.get('QR_ALLOWED_HOSTS', { infer: true }).includes(url.hostname.toLowerCase())) return null;
    const m = /\/a\/([^/]+)\/?$/.exec(url.pathname);
    return m && ACTIVATE_TOKEN.test(m[1]) ? m[1] : null;
  }

  private async bind(db: Db, userId: string, by: { token?: string | null; printCode?: string }): Promise<ActivateOutcome> {
    if (by.token === null) return { result: 'not_system', boxId: null, qrId: null };
    const { rows } = await db.query<{ box_qr_code_id: string; box_id: string; status: string; owner_user_id: string | null }>(
      `SELECT q.box_qr_code_id, q.box_id, q.status, b.owner_user_id
       FROM app.box_qr_code_tb q JOIN app.box_tb b ON b.box_id = q.box_id
       WHERE q.slot = 'activate' AND ($1::text IS NULL OR q.token = $1) AND ($2::text IS NULL OR q.print_code = $2)
       FOR UPDATE OF q, b`,
      [by.token ?? null, by.printCode ?? null],
    );
    const qr = rows[0];
    if (!qr || qr.status === 'revoked') return { result: 'invalid', boxId: null, qrId: null };
    if (qr.status === 'used' || qr.owner_user_id) return { result: 'already_owned', boxId: qr.box_id, qrId: qr.box_qr_code_id };

    await db.query(
      `UPDATE app.box_tb SET owner_user_id = $2, house_no = (SELECT house_no FROM app.user_tb WHERE user_id = $2), bound_date = now()
       WHERE box_id = $1`,
      [qr.box_id, userId],
    );
    await db.query(`UPDATE app.box_qr_code_tb SET status = 'used', last_scanned_date = now() WHERE box_qr_code_id = $1`, [qr.box_qr_code_id]);
    return { result: 'ok', boxId: qr.box_id, qrId: qr.box_qr_code_id };
  }

  private async summaries(userId: string, boxId?: string): Promise<BoxSummary[]> {
    const { rows } = await this.pool.query<{
      box_id: string;
      name: string | null;
      house_no: string | null;
      owner_user_id: string | null;
      service_active: boolean;
      last_poll_date: Date | null;
      last_seen_date: Date | null;
      config_override: Record<string, unknown>;
    }>(
      `SELECT box_id, name, house_no, owner_user_id, service_active, last_poll_date, last_seen_date, config_override
       FROM app.box_tb WHERE owner_user_id = $1 AND ($2::text IS NULL OR box_id = $2)
       ORDER BY bound_date, box_id`,
      [userId, boxId ?? null],
    );
    const status = await this.configs.statusOf(rows);
    return rows.map((r) => ({ id: r.box_id, name: r.name ?? '', house_no: r.house_no ?? '', status: status.get(r.box_id)! }));
  }
}
