import { HttpStatus, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import type { Env } from '../config/env.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx, type Db } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';
import { CodeAttempts } from '../rate-limit/code-attempts.js';
import { BOX_TZ, localMinutes, mergeWindows, minutesIntoWindow } from '../box/box-config.js';
import { BoxConfigService } from '../box/box-config.service.js';
import { badgeToken, readBadge } from '../box/box-crypto.js';
import { BoxJobService, type AttemptBody, type Verdict } from '../box/box-job.service.js';
import { SosService, type SosCardDto } from '../sos/sos.service.js';

/** QR ประจำตัวอายุ 30 วิ (✅) */
export const BADGE_TTL_S = 30;
/** สแกนนานเกินนี้ = QR น่าจะเสีย → ติดธง + ถาม O03 (✅ api.md §6.2) */
export const SLOW_SCAN_MS = 10_000;
/** ไม่ได้ยิน long-poll นานเกิน (longpoll_wait_s + ค่านี้) = ตู้ไม่ออนไลน์ */
export const POLL_GRACE_S = 15;

export type InspectionStatus = 'waking' | 'ready' | 'passed' | 'failed' | 'expired' | 'box_problem';

/** api.md §6.2 `Inspection` */
export interface InspectionDto {
  id: string;
  job_id: string;
  box: { id: string; house_no: string; name: string };
  qr_slot: 1 | 2;
  method: 'scan' | 'code';
  status: InspectionStatus;
  attempt: number;
  attempts_max: number;
  attempts_left: number;
  expires_at: string;
  ask_qr_condition: boolean;
  checked_at: string | null;
}

/** api.md §6.1 `OfficerSummary` */
export interface OfficerSummaryDto {
  in_window: boolean;
  window: { zone_id: string; zone_name: string; start: string; end: string } | null;
  houses_total: number;
  houses_checked: number;
  next_house: { box_id: string; house_no: string; box_name: string } | null;
  houses: { box_id: string; house_no: string; box_name: string; checked_at: string | null }[];
  /** SOS ที่ยังไม่มีคนรับ + ที่ฉันรับอยู่ (O01-b / O01-c) */
  open_sos: SosCardDto[];
}

interface QrRow {
  box_qr_code_id: string;
  box_id: string;
  slot: '1' | '2';
  status: 'active' | 'revoked' | 'used';
}

interface ZoneRow {
  zone_id: string;
  zone_name: string;
  agency_id: string;
  agency_name: string;
  windows: [string, string][];
}

const CONDITIONS = ['faded', 'torn', 'missing', 'covered', 'ok'] as const;
export type QrCondition = (typeof CONDITIONS)[number];
/** ไม่มีเสียงจากตู้เลย · มีเสียงแต่ไม่สแกน · สแกนไม่ผ่าน 3 ครั้ง · ตู้เสียหาย (ตู้ใช้ Buzzer แทนไฟสถานะ — 2026-10-28) */
export const PROBLEM_REASONS = ['no_response', 'no_scan', 'scan_failed_3', 'damaged', 'other'] as const;
export type ProblemReason = (typeof PROBLEM_REASONS)[number];

/** token ใน QR หน้าตู้ `BX00042-1-K7M2QX` */
const FRONT_TOKEN = /^BX(\d{5,10})-([12])-([A-Z2-9]{6})$/;

/**
 * ตรวจตู้ (api.md §6 · design §6) — ตัดสินที่ server เท่านั้น (CLAUDE.md กฎข้อ 4)
 * ลำดับเช็กตอนสแกน QR หน้าตู้: QR ของระบบ → ยังใช้ได้ → ในโซน → ในเวลาตรวจ → ตู้เปิดบริการ → ตู้ออนไลน์
 * บันทึก scan log ทุกกรณี (กฎข้อ 6)
 */
@Injectable()
export class InspectionService implements OnModuleInit {
  private readonly logger = new Logger('Inspection');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly config: ConfigService<Env, true>,
    private readonly jobs: BoxJobService,
    private readonly boxConfigs: BoxConfigService,
    private readonly codes: CodeAttempts,
    private readonly notifications: NotificationService,
    private readonly sos: SosService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerJudge('inspect', (db, job, body) => this.judge(db, job, body));
  }

  // ── เริ่มตรวจ ─────────────────────────────────────────────────────────

  async start(userId: string, input: { qr_text?: string; code?: string; scan_ms?: number }, ip: string | null): Promise<InspectionDto> {
    const method: 'scan' | 'code' = input.code !== undefined ? 'code' : 'scan';
    const raw = (input.code ?? input.qr_text ?? '').slice(0, 300);
    const scanMs = input.scan_ms ?? null;
    const ipKey = ip ?? 'unknown';
    const log = (result: string, extra: { boxId?: string | null; qrId?: string | null; inspectionId?: string | null } = {}) =>
      this.pool.query(
        `INSERT INTO app.scan_log_tb (actor_kind, user_id, box_id, box_qr_code_id, qr_kind, method, raw, result, scan_ms, ip, inspection_id)
         VALUES ('officer', $1, $2, $3, 'front', $4, $5, $6, $7, $8, $9)`,
        [userId, extra.boxId ?? null, extra.qrId ?? null, method, raw, result, scanMs, ip, extra.inspectionId ?? null],
      );

    if (method === 'code') await this.codes.check(ipKey);

    // 1–2: QR ของระบบ + ยังใช้ได้
    let qr: QrRow | null = null;
    if (method === 'scan') {
      const parsed = this.parseFrontUrl(raw);
      if (parsed) qr = await this.qrBy(`token = $1`, parsed.token);
      if (!qr) {
        const claimed = parsed ? await this.boxExists(parsed.boxId) : null;
        await log('not_system', { boxId: claimed });
        // หน้าตาเหมือน QR หน้าตู้ของเรา แต่ token ไม่ใช่ที่ระบบออก = อาจถูกแปะ QR ปลอมทับ → แจ้งแอดมินทันที
        if (parsed) await this.alertFakeQr(claimed, raw);
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'QR_NOT_SYSTEM', 'this QR is not from the system');
      }
    } else {
      const code = raw.replace(/[\s-]/g, '').toUpperCase();
      qr = /^[A-Z2-9]{8}$/.test(code) ? await this.qrBy(`print_code = $1 AND slot IN ('1','2')`, code) : null;
      if (!qr) {
        await log('invalid');
        await this.codes.fail(ipKey);
        throw this.invalid();
      }
    }
    if (qr.status !== 'active') {
      await log('revoked', { boxId: qr.box_id, qrId: qr.box_qr_code_id });
      if (method === 'code') await this.codes.fail(ipKey);
      throw this.invalid();
    }
    if (method === 'code') await this.codes.succeed(ipKey);
    const at = { boxId: qr.box_id, qrId: qr.box_qr_code_id };

    // 3: ในโซนของฉัน (ตู้ของตัวเองตรวจไม่ได้ — ตอบเหมือนนอกโซน)
    const box = await this.box(qr.box_id);
    const zones = box.owner_user_id === userId ? [] : await this.myZonesFor(userId, qr.box_id);
    if (!box.owner_user_id || !zones.length) {
      await log('not_in_zone', at);
      throw new AppError(HttpStatus.FORBIDDEN, 'NOT_IN_ZONE', 'this house is not in your zones');
    }
    // 4: ในเวลาตรวจของโซนที่ฉันอยู่ (ไม่ใช่เวลารวมของตู้)
    const zone = zones.find((z) => minutesIntoWindow(z.windows, new Date()) !== null);
    if (!zone) {
      await log('outside_window', at);
      throw new AppError(HttpStatus.CONFLICT, 'OUTSIDE_PATROL_WINDOW', 'outside patrol hours — not recorded', {
        next_window: this.nextWindow(zones),
      });
    }
    // 5: เปิดบริการ
    if (!box.service_active) {
      await log('service_closed', at);
      throw new AppError(HttpStatus.FORBIDDEN, 'BOX_SERVICE_CLOSED', 'this mailbox is closed');
    }
    // 6: ตู้ถือ long-poll อยู่
    const { config } = await this.boxConfigs.forBox(qr.box_id);
    const recentPoll = box.last_poll_date && Date.now() - box.last_poll_date.getTime() <= (config.longpoll_wait_s + POLL_GRACE_S) * 1000;
    if (!this.jobs.isWaiting(qr.box_id) && !recentPoll) {
      await log('box_offline', at);
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'BOX_OFFLINE', 'the mailbox is not online');
    }

    // ผ่าน → สร้างงาน + การตรวจ แล้วค่อยปลุกตู้ (ตู้จะไม่ส่งผลมาก่อนมีแถวการตรวจ)
    const inspectionId = await withTx(this.pool, async (db) => {
      // กดซ้ำ / สแกนซ้ำระหว่างงานเดิมยังเปิดอยู่ → ใช้การตรวจเดิม (ไม่สร้างงานปลุกตู้ซ้อน) · lock แถวตู้กันสองคำขอพร้อมกัน
      await db.query(`SELECT 1 FROM app.box_tb WHERE box_id = $1 FOR UPDATE`, [qr.box_id]);
      const open = await db.query<{ inspection_id: string }>(
        `SELECT i.inspection_id FROM app.inspection_tb i JOIN app.box_job_tb j ON j.box_job_id = i.box_job_id
         WHERE i.box_id = $1 AND i.officer_user_id = $2 AND i.status = 'open' AND j.expire_date > now() AND j.result_date IS NULL
         ORDER BY i.created_date DESC LIMIT 1`,
        [qr.box_id, userId],
      );
      if (open.rows[0]) return open.rows[0].inspection_id;
      const jobId = await this.jobs.create(qr.box_id, 'inspect', userId, { wake: false, db });
      const { rows } = await db.query<{ inspection_id: string }>(
        `INSERT INTO app.inspection_tb (box_job_id, box_id, officer_user_id, agency_id, zone_id, box_qr_code_id, method, scan_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING inspection_id`,
        [jobId, qr.box_id, userId, zone.agency_id, zone.zone_id, qr.box_qr_code_id, method, scanMs],
      );
      await this.flagQr(db, qr, method, scanMs);
      return rows[0].inspection_id;
    });
    this.jobs.wake(qr.box_id);
    await log('ok', { ...at, inspectionId });
    return this.get(userId, inspectionId);
  }

  // ── ระหว่างตรวจ ───────────────────────────────────────────────────────

  async get(userId: string, id: string, db: Db = this.pool): Promise<InspectionDto> {
    const { rows } = await db.query<{
      inspection_id: string;
      box_job_id: string;
      box_id: string;
      house_no: string | null;
      box_name: string | null;
      slot: '1' | '2';
      method: 'scan' | 'code';
      scan_ms: number | null;
      status: 'open' | 'passed' | 'failed' | 'box_problem';
      qr_condition: string | null;
      checked_date: Date | null;
      expire_date: Date;
      ready_date: Date | null;
      max_attempts: number;
      attempts: number;
    }>(
      `SELECT i.inspection_id, i.box_job_id, i.box_id, b.house_no, b.name AS box_name, q.slot, i.method, i.scan_ms,
              i.status, i.qr_condition, i.checked_date, j.expire_date, j.ready_date, j.max_attempts,
              (SELECT count(*)::int FROM app.box_job_attempt_tb a WHERE a.box_job_id = i.box_job_id) AS attempts
       FROM app.inspection_tb i
       JOIN app.box_job_tb j ON j.box_job_id = i.box_job_id
       JOIN app.box_tb b ON b.box_id = i.box_id
       JOIN app.box_qr_code_tb q ON q.box_qr_code_id = i.box_qr_code_id
       WHERE i.inspection_id = $1 AND i.officer_user_id = $2`,
      [id, userId],
    );
    const r = rows[0];
    if (!r) throw new NotFoundException();
    const status: InspectionStatus =
      r.status !== 'open'
        ? r.status
        : r.expire_date.getTime() <= Date.now()
          ? 'expired'
          : r.ready_date
            ? 'ready'
            : 'waking';
    return {
      id: r.inspection_id,
      job_id: r.box_job_id,
      box: { id: r.box_id, house_no: r.house_no ?? '', name: r.box_name ?? '' },
      qr_slot: Number(r.slot) as 1 | 2,
      method: r.method,
      status,
      attempt: Math.min(r.attempts + 1, r.max_attempts),
      attempts_max: r.max_attempts,
      attempts_left: Math.max(r.max_attempts - r.attempts, 0),
      expires_at: r.expire_date.toISOString(),
      ask_qr_condition: r.qr_condition === null && (r.method === 'code' || (r.scan_ms ?? 0) > SLOW_SCAN_MS),
      checked_at: r.checked_date?.toISOString() ?? null,
    };
  }

  /** QR ประจำตัว — ออกใหม่ทุก 30 วิ · ตู้ต้อง ready แล้ว (409 NOT_READY) · จบ/หมดอายุ → 410 INSPECTION_CLOSED */
  async badge(userId: string, id: string): Promise<{ qr: string; expires_at: string }> {
    const ins = await this.get(userId, id);
    if (ins.status === 'waking') throw new AppError(HttpStatus.CONFLICT, 'NOT_READY', 'the mailbox is not ready yet');
    if (ins.status !== 'ready') throw new AppError(HttpStatus.GONE, 'INSPECTION_CLOSED', 'this inspection has ended');
    const e = Math.floor(Date.now() / 1000) + BADGE_TTL_S;
    return {
      qr: badgeToken(this.config.get('QR_SIGNING_KEY', { infer: true }), { j: ins.job_id, u: userId, e }),
      expires_at: new Date(e * 1000).toISOString(),
    };
  }

  /** O03 สภาพ QR — ไม่บล็อกการตรวจ · ไม่ใช่ "ดูปกติ" → ติดธง QR ใบนั้น */
  async setQrCondition(userId: string, id: string, condition: QrCondition): Promise<InspectionDto> {
    await this.get(userId, id);
    await withTx(this.pool, async (db) => {
      const { rows } = await db.query<{ box_qr_code_id: string }>(
        `UPDATE app.inspection_tb SET qr_condition = $2 WHERE inspection_id = $1 RETURNING box_qr_code_id`,
        [id, condition],
      );
      if (condition !== 'ok') await this.addHealth(db, rows[0].box_qr_code_id, 'damaged', 'reported_damaged');
    });
    return this.get(userId, id);
  }

  /** แจ้งปัญหาตู้ → แจ้งเจ้าของบ้าน + แอดมิน · ตรวจผ่านไปแล้วแจ้งไม่ได้ */
  async reportProblem(userId: string, id: string, reason: ProblemReason, note: string | null): Promise<InspectionDto> {
    const ins = await this.get(userId, id);
    if (ins.status === 'passed') throw new AppError(HttpStatus.GONE, 'INSPECTION_CLOSED', 'this inspection already passed');
    if (ins.status !== 'box_problem') {
      await this.pool.query(
        `UPDATE app.inspection_tb SET status = 'box_problem', problem_reason = $2, problem_note = $3 WHERE inspection_id = $1`,
        [id, reason, note],
      );
      const owner = await this.pool.query<{ owner_user_id: string | null; name: string | null }>(
        `SELECT owner_user_id, name FROM app.box_tb WHERE box_id = $1`,
        [ins.box.id],
      );
      const data = { box_id: ins.box.id, box_name: owner.rows[0]?.name ?? null, reason };
      await this.safeNotify(async () => {
        if (owner.rows[0]?.owner_user_id) await this.notifications.notify([owner.rows[0].owner_user_id], { type: 'box_problem', data, link: '/home' });
        await this.notifications.notify(await this.adminIds(), { type: 'box_problem', data, link: `/admin/boxes/${ins.box.id}` });
      });
    }
    return this.get(userId, id);
  }

  // ── หน้าสรุปเจ้าหน้าที่ ───────────────────────────────────────────────

  async summary(userId: string): Promise<OfficerSummaryDto> {
    const zones = await this.myZones(userId);
    const now = new Date();
    const current = zones
      .flatMap((z) => z.windows.map(([s, e]) => ({ z, s, e })))
      .find(({ s, e }) => minutesIntoWindow([[s, e]], now) !== null);
    const { rows } = await this.pool.query<{ box_id: string; house_no: string | null; name: string | null; checked: Date | null }>(
      `SELECT b.box_id, b.house_no, b.name,
              (SELECT max(i.checked_date) FROM app.inspection_tb i
                WHERE i.box_id = b.box_id AND i.status = 'passed'
                  AND i.agency_id = (SELECT agency_id FROM app.agency_member_tb WHERE user_id = $1)
                  AND i.checked_date >= (date_trunc('day', now() AT TIME ZONE '${BOX_TZ}') AT TIME ZONE '${BOX_TZ}')) AS checked
       FROM app.box_tb b
       WHERE b.owner_user_id IS NOT NULL AND b.owner_user_id <> $1
         AND b.box_id IN (SELECT zb.box_id FROM app.zone_box_tb zb WHERE zb.zone_id = ANY($2::uuid[]))
       ORDER BY b.house_no NULLS LAST, b.box_id`,
      [userId, zones.map((z) => z.zone_id)],
    );
    const houses = rows.map((r) => ({ box_id: r.box_id, house_no: r.house_no ?? '', box_name: r.name ?? '', checked_at: r.checked?.toISOString() ?? null }));
    const next = houses.find((h) => !h.checked_at) ?? null;
    return {
      in_window: !!current,
      window: current
        ? { zone_id: current.z.zone_id, zone_name: current.z.zone_name, start: current.s, end: current.e }
        : this.nextWindow(zones),
      houses_total: houses.length,
      houses_checked: houses.filter((h) => h.checked_at).length,
      next_house: next ? { box_id: next.box_id, house_no: next.house_no, box_name: next.box_name } : null,
      houses,
      open_sos: await this.sos.activeFor(userId),
    };
  }

  // ── ตัดสินผลจากตู้ (ลงทะเบียนกับ BoxJobService) ─────────────────────────

  /** ลายเซ็น QR ประจำตัว → j = งานนี้ → u = คนที่สแกน QR หน้าตู้ → ยังไม่หมดอายุ (เวลาเซิร์ฟเวอร์) */
  private async judge(db: Db, job: { box_job_id: string; box_id: string; max_attempts: number }, b: AttemptBody) {
    const { rows } = await db.query<{ inspection_id: string; officer_user_id: string; agency_name: string; display_name: string }>(
      `SELECT i.inspection_id, i.officer_user_id, a.name AS agency_name, u.display_name
       FROM app.inspection_tb i
       JOIN app.agency_tb a ON a.agency_id = i.agency_id
       JOIN app.user_tb u ON u.user_id = i.officer_user_id
       WHERE i.box_job_id = $1 FOR UPDATE OF i`,
      [job.box_job_id],
    );
    const ins = rows[0];
    let reason: string | null = null;
    if (!ins) reason = 'no_inspection';
    else if (!b.read_ok || !b.qr_text) reason = 'unreadable';
    else {
      const p = readBadge(this.config.get('QR_SIGNING_KEY', { infer: true }), b.qr_text);
      if (!p) reason = 'bad_sig';
      else if (p.j !== job.box_job_id) reason = 'wrong_job';
      else if (p.u !== ins.officer_user_id) reason = 'wrong_user';
      else if (p.e * 1000 < Date.now()) reason = 'expired';
    }
    const status: Verdict = reason === null ? 'pass' : b.attempt >= job.max_attempts ? 'fail' : 'retry';

    await db.query(
      `INSERT INTO app.scan_log_tb (actor_kind, box_id, qr_kind, method, raw, result, scan_ms, attempt, box_job_id, inspection_id)
       VALUES ('box', $1, 'badge', 'scan', $2, $3, $4, $5, $6, $7)`,
      [job.box_id, b.qr_text?.slice(0, 300) ?? null, reason ?? 'ok', b.read_ms, b.attempt, job.box_job_id, ins?.inspection_id ?? null],
    );

    let after: (() => Promise<void>) | undefined;
    if (ins && status === 'pass') {
      await db.query(`UPDATE app.inspection_tb SET status = 'passed', checked_date = now() WHERE inspection_id = $1`, [ins.inspection_id]);
      after = () => this.notifyInspected(job.box_id, ins.agency_name, ins.display_name);
    } else if (ins && status === 'fail') {
      await db.query(`UPDATE app.inspection_tb SET status = 'failed' WHERE inspection_id = $1`, [ins.inspection_id]);
    }
    return { status, attempts_left: status === 'retry' ? job.max_attempts - b.attempt : undefined, reason, after };
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  private invalid() {
    return new AppError(HttpStatus.NOT_FOUND, 'QR_INVALID', 'this QR or code is not valid');
  }

  /** ลิงก์ QR หน้าตู้: โดเมนใน QR_ALLOWED_HOSTS + path ลงท้าย /b/<token> (เว็บอาจอยู่ใต้ path เช่น /smmb/b/…) */
  private parseFrontUrl(text: string): { token: string; boxId: string } | null {
    let url: URL;
    try {
      url = new URL(text.trim());
    } catch {
      return null;
    }
    if (!this.config.get('QR_ALLOWED_HOSTS', { infer: true }).includes(url.hostname.toLowerCase())) return null;
    const token = /\/b\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    const m = token ? FRONT_TOKEN.exec(token) : null;
    return m && token ? { token, boxId: `BX-${m[1]}` } : null;
  }

  private async qrBy(where: string, value: string): Promise<QrRow | null> {
    const { rows } = await this.pool.query<QrRow>(
      `SELECT box_qr_code_id, box_id, slot, status FROM app.box_qr_code_tb WHERE ${where} AND slot IN ('1','2')`,
      [value],
    );
    return rows[0] ?? null;
  }

  private async boxExists(boxId: string): Promise<string | null> {
    const { rows } = await this.pool.query(`SELECT 1 FROM app.box_tb WHERE box_id = $1`, [boxId]);
    return rows[0] ? boxId : null;
  }

  private async box(boxId: string) {
    const { rows } = await this.pool.query<{ owner_user_id: string | null; service_active: boolean; last_poll_date: Date | null }>(
      `SELECT owner_user_id, service_active, last_poll_date FROM app.box_tb WHERE box_id = $1`,
      [boxId],
    );
    return rows[0];
  }

  /** โซนของฉัน (สมาชิก active ของหน่วยงานที่อนุมัติแล้ว) พร้อมเวลาตรวจ · boxId = เฉพาะโซนที่มีตู้นี้ */
  private async myZones(userId: string, boxId?: string): Promise<ZoneRow[]> {
    const { rows } = await this.pool.query<ZoneRow>(
      `SELECT z.zone_id, z.name AS zone_name, z.agency_id, a.name AS agency_name,
              coalesce(json_agg(json_build_array(to_char(w.start_time, 'HH24:MI'), to_char(w.end_time, 'HH24:MI')) ORDER BY w.start_time)
                       FILTER (WHERE w.zone_id IS NOT NULL), '[]') AS windows
       FROM app.zone_officer_tb zo
       JOIN app.zone_tb z ON z.zone_id = zo.zone_id AND z.deleted_date IS NULL
       JOIN app.agency_tb a ON a.agency_id = z.agency_id AND a.status = 'approved'
       JOIN app.agency_member_tb m ON m.user_id = zo.user_id AND m.agency_id = z.agency_id AND m.status = 'active'
       LEFT JOIN app.zone_window_tb w ON w.zone_id = z.zone_id
       WHERE zo.user_id = $1
         AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM app.zone_box_tb zb WHERE zb.zone_id = z.zone_id AND zb.box_id = $2))
       GROUP BY z.zone_id, z.name, z.agency_id, a.name
       ORDER BY z.name`,
      [userId, boxId ?? null],
    );
    return rows;
  }

  private myZonesFor(userId: string, boxId: string) {
    return this.myZones(userId, boxId);
  }

  /** ช่วงเวลาตรวจถัดไปวันนี้ (ไว้บอก "รอบถัดไป 17:00–21:00") */
  private nextWindow(zones: ZoneRow[]): OfficerSummaryDto['window'] {
    const m = localMinutes(new Date());
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const next = zones
      .flatMap((z) => mergeWindows(z.windows).map(([s, e]) => ({ z, s, e })))
      .filter(({ s }) => toMin(s) > m)
      .sort((a, b) => a.s.localeCompare(b.s))[0];
    return next ? { zone_id: next.z.zone_id, zone_name: next.z.zone_name, start: next.s, end: next.e } : null;
  }

  /** ติดธง QR: พิมพ์รหัสแทนสแกน / สแกนช้า → damaged · สแกนใบ 2 → backup_in_use (design §8) */
  private async flagQr(db: Db, qr: QrRow, method: 'scan' | 'code', scanMs: number | null): Promise<void> {
    await db.query(`UPDATE app.box_qr_code_tb SET last_scanned_date = now() WHERE box_qr_code_id = $1`, [qr.box_qr_code_id]);
    if (method === 'code') await this.addHealth(db, qr.box_qr_code_id, 'damaged', 'typed_by_officer');
    else if (scanMs !== null && scanMs > SLOW_SCAN_MS) await this.addHealth(db, qr.box_qr_code_id, 'damaged', 'slow_scan');
    if (qr.slot === '2') await this.addHealth(db, qr.box_qr_code_id, 'backup_in_use', 'backup_used');
  }

  private async addHealth(db: Db, qrId: string, health: string, reason: string): Promise<void> {
    await db.query(
      `UPDATE app.box_qr_code_tb
       SET health = CASE WHEN health IN ('ok', 'expiring', 'suspicious') THEN $2 ELSE health END,
           health_reasons = CASE WHEN $3 = ANY(health_reasons) THEN health_reasons ELSE array_append(health_reasons, $3) END
       WHERE box_qr_code_id = $1`,
      [qrId, health, reason],
    );
  }

  private async alertFakeQr(boxId: string | null, raw: string): Promise<void> {
    if (boxId) {
      await this.pool.query(
        `UPDATE app.box_qr_code_tb
         SET health = 'maybe_fake',
             health_reasons = CASE WHEN 'fake_scanned' = ANY(health_reasons) THEN health_reasons ELSE array_append(health_reasons, 'fake_scanned') END
         WHERE box_id = $1 AND status = 'active' AND slot IN ('1','2')`,
        [boxId],
      );
    }
    await this.safeNotify(async () =>
      this.notifications.notify(await this.adminIds(), {
        type: 'qr_fake',
        data: { box_id: boxId, raw: raw.slice(0, 120) },
        link: boxId ? `/admin/boxes/${boxId}` : '/admin/qr',
      }),
    );
  }

  private async notifyInspected(boxId: string, agencyName: string, officerName: string): Promise<void> {
    const { rows } = await this.pool.query<{ owner_user_id: string | null; name: string | null }>(
      `SELECT owner_user_id, name FROM app.box_tb WHERE box_id = $1`,
      [boxId],
    );
    const owner = rows[0]?.owner_user_id;
    if (!owner) return;
    await this.safeNotify(() =>
      this.notifications.notify([owner], {
        type: 'inspected',
        data: { box_id: boxId, box_name: rows[0].name, agency_name: agencyName, officer_name: officerName, at: new Date().toISOString() },
        link: '/home',
        tag: `inspected-${boxId}`,
      }),
    );
  }

  private async adminIds(): Promise<string[]> {
    const { rows } = await this.pool.query<{ user_id: string }>(
      `SELECT r.user_id FROM app.user_role_tb r JOIN app.user_tb u ON u.user_id = r.user_id
       WHERE r.role = 'admin' AND r.status = 'active' AND u.status = 'active' AND u.deleted_date IS NULL`,
    );
    return rows.map((r) => r.user_id);
  }

  /** แจ้งเตือนล้มเหลวไม่ทำให้งานหลักล้ม */
  private async safeNotify(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`notification failed: ${(err as Error).message}`);
    }
  }
}
