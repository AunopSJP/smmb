import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import type { Env } from '../config/env.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx, type Db } from '../db/tx.js';
import { pickOverride, type BoxConfig, type BoxConfigDefaults, type BoxStatus } from './box-config.js';
import { BoxConfigService } from './box-config.service.js';
import { deviceSecret, frontQrToken, newActivateToken, newPrintCode, showPrintCode } from './box-crypto.js';
import { BoxJobService, type JobDto } from './box-job.service.js';
import { NotificationService } from '../push/notification.service.js';

export type QrSlot = 1 | 2 | 'activate';
const UNUSED_ACTIVATION_STATUS = 'active';
const CONSUMED_ACTIVATION_STATUS = 'used';

/** api.md §9.4 `PrintableQr` (ยังไม่มี svg — หน้าเว็บสร้างรูป QR จาก url เอง) */
export interface PrintableQr {
  slot: QrSlot;
  url: string;
  print_code: string;
}

export interface ReissuedQr extends PrintableQr {
  id: string;
  version: number;
}

export interface RegisteredBox {
  box_id: string;
  /** รหัสลับประจำตู้ — เขียนลงบอร์ด · ห้ามเก็บไว้ที่อื่น */
  device_secret: string;
  qr: PrintableQr[];
}

export interface AdminBoxRow {
  id: string;
  house_no: string | null;
  name: string | null;
  bound: boolean;
  status: BoxStatus;
  battery: { pct: number; charging: boolean | null; reported_at: string | null } | null;
  last_seen_at: string | null;
  last_poll_at: string | null;
  fw: string | null;
  /** เวอร์ชันเฟิร์มแวร์ที่สั่งให้ตู้อัปเดต (ตู้ยังไม่ได้รัน) */
  fw_target: string | null;
}

export type CameraDiagnosticState = 'started' | 'ready' | 'scan_result' | 'error';

export interface CameraDiagnostics {
  state: CameraDiagnosticState;
  at: string;
  job_id: string | null;
  width: number | null;
  height: number | null;
  attempt: number | null;
  frames: number | null;
  qr_shapes: number | null;
  read_ok: boolean | null;
  read_ms: number | null;
}

export interface AdminBoxDetail extends AdminBoxRow {
  can_delete: boolean;
  service_active: boolean;
  /** เหตุผลที่ปิดบริการ (ตอนเปิดอยู่ = null) */
  service_reason: string | null;
  service_changed_at: string | null;
  registered_at: string;
  /** override = ค่าที่ทับเฉพาะตู้นี้ (ว่าง = ใช้ค่ากลางทั้งหมด) */
  config: { config_ver: number; config: BoxConfig; box_config_ver: number | null; in_sync: boolean; override: Partial<BoxConfigDefaults> };
  qr: (PrintableQr & { id: string; version: number; status: string; health: string; issued_at: string })[];
  reports: { kind: 'boot' | 'report' | 'event'; at: string; body: Record<string, unknown> }[];
  camera_diagnostics: CameraDiagnostics | null;
  auth_failures: { reason: string; at: string }[];
}

interface BoxRow {
  box_id: string;
  house_no: string | null;
  name: string | null;
  owner_user_id: string | null;
  service_active: boolean;
  service_reason: string | null;
  service_changed_date: Date | null;
  battery_pct: number | null;
  charging: boolean | null;
  battery_date: Date | null;
  last_seen_date: Date | null;
  last_poll_date: Date | null;
  fw: string | null;
  fw_target: string | null;
  config_override: Record<string, unknown>;
  config_ver_seen: number | null;
  created_date: Date;
}

const BOX_COLS = `box_id, house_no, name, owner_user_id, service_active, service_reason, service_changed_date, battery_pct, charging, battery_date,
  last_seen_date, last_poll_date, fw, fw_target, config_override, config_ver_seen, created_date`;

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const intField = (value: unknown, max: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null;
const CAMERA_STATE_BY_TYPE: Record<string, CameraDiagnosticState> = {
  camera_test_started: 'started',
  camera_ready: 'ready',
  camera_scan_result: 'scan_result',
  camera_error: 'error',
};

function mapCameraDiagnostics(
  reports: { kind: 'boot' | 'report' | 'event'; created_date: Date; body: Record<string, unknown> }[],
): CameraDiagnostics | null {
  for (const report of reports) {
    if (report.kind !== 'event') continue;
    const type = report.body['type'];
    if (typeof type !== 'string' || !Object.hasOwn(CAMERA_STATE_BY_TYPE, type)) continue;

    const jobId = report.body['job_id'];
    const readOk = report.body['read_ok'];
    return {
      state: CAMERA_STATE_BY_TYPE[type],
      at: report.created_date.toISOString(),
      job_id: typeof jobId === 'string' && /^J-[0-9a-f]{6}$/.test(jobId) ? jobId : null,
      width: intField(report.body['width'], 1920),
      height: intField(report.body['height'], 1920),
      attempt: intField(report.body['attempt'], 5),
      frames: intField(report.body['frames'], 1000),
      qr_shapes: intField(report.body['qr_shapes'], 1000),
      read_ok: typeof readOk === 'boolean' ? readOk : null,
      read_ms: intField(report.body['read_ms'], 60_000),
    };
  }
  return null;
}

/** แอดมิน: ลงทะเบียนตู้ · ดูตู้ · งานทดสอบ (api.md §9.4) */
@Injectable()
export class AdminBoxService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly config: ConfigService<Env, true>,
    private readonly configs: BoxConfigService,
    private readonly jobs: BoxJobService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * ลงทะเบียนตู้ตอนผลิต: สร้างตู้ + QR หน้าตู้ 2 ใบ + QR เปิดใช้ตู้ 1 ใบ
   * คืนรหัสลับประจำตู้ (เขียนลงบอร์ด) — คำนวณจาก master key จึงไม่เก็บในฐานข้อมูล
   */
  async register(count: number, adminId: string): Promise<RegisteredBox[]> {
    const masterKey = this.config.get('BOX_MASTER_KEY', { infer: true });
    return withTx(this.pool, async (db) => {
      const out: RegisteredBox[] = [];
      for (let i = 0; i < count; i++) {
        const { rows } = await db.query<{ box_id: string }>(`INSERT INTO app.box_tb (registered_by) VALUES ($1) RETURNING box_id`, [adminId]);
        const boxId = rows[0].box_id;
        const qr: PrintableQr[] = [];
        for (const slot of [1, 2, 'activate'] as const) qr.push(await this.issueQr(db, boxId, slot));
        out.push({ box_id: boxId, device_secret: deviceSecret(masterKey, boxId), qr });
      }
      return out;
    });
  }

  async list(q: { q?: string; page: number; perPage: number }): Promise<{ data: AdminBoxRow[]; page: number; per_page: number; total: number }> {
    const like = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const where = `($1::text IS NULL OR box_id ILIKE $1 OR replace(box_id, '-', '') ILIKE $1 OR house_no ILIKE $1 OR name ILIKE $1)`;
    const [{ rows }, count] = await Promise.all([
      this.pool.query<BoxRow>(`SELECT ${BOX_COLS} FROM app.box_tb WHERE ${where} ORDER BY box_id DESC LIMIT $2 OFFSET $3`, [
        like,
        q.perPage,
        (q.page - 1) * q.perPage,
      ]),
      this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM app.box_tb WHERE ${where}`, [like]),
    ]);
    const status = await this.configs.statusOf(rows);
    return { data: rows.map((r) => this.row(r, status.get(r.box_id)!)), page: q.page, per_page: q.perPage, total: count.rows[0].n };
  }

  async detail(boxId: string): Promise<AdminBoxDetail> {
    const box = await this.load(this.pool, boxId);
    const [status, cfg, qr, reports, fails] = await Promise.all([
      this.configs.statusOf([box]),
      this.configs.forBox(boxId),
      this.pool.query<{ box_qr_code_id: string; slot: string; version: number; token: string; print_code: string; status: string; health: string; created_date: Date }>(
        `SELECT box_qr_code_id, slot, version, token, print_code, status, health, created_date
         FROM app.box_qr_code_tb WHERE box_id = $1 ORDER BY slot, version DESC`,
        [boxId],
      ),
      this.pool.query<{ kind: 'boot' | 'report' | 'event'; created_date: Date; body: Record<string, unknown> }>(
        `SELECT kind, created_date, body FROM app.box_report_tb WHERE box_id = $1 ORDER BY created_date DESC LIMIT 20`,
        [boxId],
      ),
      this.pool.query<{ reason: string; created_date: Date }>(
        `SELECT reason, created_date FROM app.box_auth_log_tb WHERE claimed_box_id = $1 ORDER BY created_date DESC LIMIT 10`,
        [boxId],
      ),
    ]);
    return {
      ...this.row(box, status.get(boxId)!),
      can_delete: await this.canDelete(this.pool, boxId),
      service_active: box.service_active,
      service_reason: box.service_reason,
      service_changed_at: box.service_changed_date?.toISOString() ?? null,
      registered_at: box.created_date.toISOString(),
      config: { config_ver: cfg.ver, config: cfg.config, box_config_ver: box.config_ver_seen, in_sync: box.config_ver_seen === cfg.ver, override: pickOverride(box.config_override) },
      qr: qr.rows.map((r) => ({
        id: r.box_qr_code_id,
        slot: this.slot(r.slot),
        version: r.version,
        status: r.status,
        health: r.health,
        url: this.qrUrl(this.slot(r.slot), r.token),
        print_code: showPrintCode(r.print_code),
        issued_at: r.created_date.toISOString(),
      })),
      reports: reports.rows.map((r) => ({ kind: r.kind, at: r.created_date.toISOString(), body: r.body })),
      camera_diagnostics: mapCameraDiagnostics(reports.rows),
      auth_failures: fails.rows.map((r) => ({ reason: r.reason, at: r.created_date.toISOString() })),
    };
  }

  /**
   * เปิด/ปิดบริการตู้ — ปิดแล้วตรวจตู้ไม่ได้ (BOX_SERVICE_CLOSED) และไรเดอร์เห็นหน้าตู้ปิดบริการ · บันทึกใน data_access_log_tb
   * แจ้งเจ้าของบ้านเมื่อสถานะเปลี่ยนจริง (ตั้งซ้ำค่าเดิม = ไม่แจ้ง ไม่บันทึกซ้ำ)
   */
  async setService(boxId: string, active: boolean, reason: string | null, adminId: string): Promise<{ box_id: string; service_active: boolean }> {
    const changed = await withTx(this.pool, async (db) => {
      const box = await this.load(db, boxId);
      const note = active ? null : reason?.trim() || null;
      if (box.service_active === active && box.service_reason === note) return null;
      await db.query(`UPDATE app.box_tb SET service_active = $2, service_reason = $3, service_changed_date = now() WHERE box_id = $1`, [boxId, active, note]);
      await db.query(
        `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields) VALUES ($1, 'box', $2, $3)`,
        [adminId, boxId, [active ? 'service_opened' : 'service_closed']],
      );
      return { becameDifferent: box.service_active !== active, owner: box.owner_user_id, name: box.name, note };
    });
    if (changed?.becameDifferent && changed.owner) {
      await this.notifications
        .notify([changed.owner], {
          type: active ? 'box_service_opened' : 'box_service_closed',
          data: { box_id: boxId, box_name: changed.name, reason: changed.note ?? '' },
          link: '/home',
          tag: `service-${boxId}`,
        })
        .catch(() => undefined);
    }
    return { box_id: boxId, service_active: active };
  }

  /**
   * ยกเลิกการผูกตู้ (ขายบ้าน / ย้ายออก) — ตู้ไม่ถูกลบ ประวัติเก่ายังอยู่ · ตู้กลับเป็น "ยังไม่ผูก":
   * ล้างเจ้าของ/บ้านเลขที่/ย่าน/ชื่อ · ถอดออกจากทุกโซน · ออก QR เปิดใช้ตู้ใบใหม่ให้เจ้าของคนใหม่ (QR หน้าตู้ที่ติดอยู่ใช้ต่อได้)
   * มี SOS ค้างอยู่ → 409 ต้องปิดเคสก่อน · บันทึกใน data_access_log_tb · แจ้งเจ้าของเดิม
   */
  async unbind(boxId: string, reason: string, adminId: string): Promise<{ box_id: string; qr: ReissuedQr }> {
    const out = await withTx(this.pool, async (db) => {
      const box = await this.load(db, boxId);
      if (!box.owner_user_id) throw new ConflictException({ code: 'BOX_NOT_BOUND', message: 'this box has no owner' });
      const sos = await db.query(`SELECT 1 FROM app.sos_case_tb WHERE box_id = $1 AND status IN ('open','accepted')`, [boxId]);
      if (sos.rowCount) throw new ConflictException({ code: 'SOS_OPEN', message: 'close the open SOS of this box first' });
      await db.query(
        `UPDATE app.box_tb SET owner_user_id = NULL, name = NULL, house_no = NULL, area = NULL, bound_date = NULL,
           wifi_reset_requested_date = NULL, wifi_reset_requested_by = NULL, offline_notified_date = NULL
         WHERE box_id = $1`,
        [boxId],
      );
      await db.query(`DELETE FROM app.zone_box_tb WHERE box_id = $1`, [boxId]);
      // QR เปิดใช้ตู้ใบเก่าถูกใช้ไปแล้ว — ใบที่ยังไม่ใช้ (ถ้ามี) ยกเลิกก่อนออกใบใหม่
      await db.query(`UPDATE app.box_qr_code_tb SET status = 'revoked', revoked_date = now() WHERE box_id = $1 AND slot = 'activate' AND status = 'active'`, [boxId]);
      const qr = await this.issueQr(db, boxId, 'activate');
      await db.query(
        `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields) VALUES ($1, 'box', $2, $3)`,
        [adminId, boxId, ['box_unbound', `reason:${reason.slice(0, 200)}`]],
      );
      return { qr, owner: box.owner_user_id, name: box.name };
    });
    await this.notifications
      .notify([out.owner], { type: 'box_unbound', data: { box_id: boxId, box_name: out.name }, link: '/home', tag: `unbound-${boxId}` })
      .catch(() => undefined);
    return { box_id: boxId, qr: out.qr };
  }

  async remove(boxId: string, adminId: string): Promise<{ box_id: string; deleted: true }> {
    return withTx(this.pool, async (db) => {
      await this.load(db, boxId);
      if (!(await this.canDelete(db, boxId, true))) {
        throw new ConflictException({
          code: 'BOX_NOT_DELETABLE',
          message: 'Only an unused, never-connected box with no activity can be deleted',
        });
      }
      await db.query(
        `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields)
         VALUES ($1, 'box', $2, '{box_deleted}')`,
        [adminId, boxId],
      );
      await db.query(`DELETE FROM app.box_qr_reissue_request_tb WHERE box_id = $1`, [boxId]);
      await db.query(`DELETE FROM app.box_nonce_tb WHERE box_id = $1`, [boxId]);
      await db.query(`DELETE FROM app.box_qr_code_tb WHERE box_id = $1`, [boxId]);
      await db.query(`DELETE FROM app.box_tb WHERE box_id = $1`, [boxId]);
      return { box_id: boxId, deleted: true };
    });
  }

  async reissueQr(boxId: string, slots: (1 | 2)[], requestId: string, adminId: string): Promise<{ box_id: string; qr: ReissuedQr[] }> {
    return withTx(this.pool, async (db) => {
      await this.load(db, boxId);
      await db.query(`SELECT box_id FROM app.box_tb WHERE box_id = $1 FOR UPDATE`, [boxId]);
      const normalizedSlots = [...new Set(slots)].sort((a, b) => a - b);
      const { rows: previous } = await db.query<{
        slots: string[];
        response: { box_id: string; qr: ReissuedQr[] };
      }>(
        `SELECT slots, response FROM app.box_qr_reissue_request_tb WHERE box_id = $1 AND request_id = $2`,
        [boxId, requestId],
      );
      if (previous[0]) {
        if (previous[0].slots.join(',') !== normalizedSlots.join(',')) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'request_id was already used for different QR slots' });
        }
        return previous[0].response;
      }
      const qr: ReissuedQr[] = [];
      for (const slot of normalizedSlots) {
        await db.query(
          `UPDATE app.box_qr_code_tb SET status = 'revoked', revoked_date = now()
           WHERE box_id = $1 AND slot = $2 AND status = 'active'`,
          [boxId, String(slot)],
        );
        qr.push(await this.issueQr(db, boxId, slot));
      }
      const result = { box_id: boxId, qr };
      await db.query(
        `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields)
         VALUES ($1, 'box', $2, $3::text[])`,
        [adminId, boxId, normalizedSlots.map((slot) => `qr_reissue_${slot}`)],
      );
      await db.query(
        `INSERT INTO app.box_qr_reissue_request_tb (box_id, request_id, slots, response)
         VALUES ($1, $2, $3::text[], $4::jsonb)`,
        [boxId, requestId, normalizedSlots.map(String), JSON.stringify(result)],
      );
      return result;
    });
  }

  private async canDelete(db: Db, boxId: string, lock = false): Promise<boolean> {
    const lockClause = lock ? ' FOR UPDATE' : '';
    const { rows } = await db.query<{ can_delete: boolean }>(
      `SELECT (
         b.owner_user_id IS NULL
         AND b.last_seen_date IS NULL
         AND b.last_poll_date IS NULL
         AND EXISTS (SELECT 1 FROM app.box_qr_code_tb q WHERE q.box_id = b.box_id AND q.slot = 'activate' AND q.status = $2)
         AND NOT EXISTS (SELECT 1 FROM app.box_qr_code_tb q WHERE q.box_id = b.box_id AND q.slot = 'activate' AND q.status = $3)
         AND NOT EXISTS (SELECT 1 FROM app.zone_box_tb z WHERE z.box_id = b.box_id)
         AND NOT EXISTS (SELECT 1 FROM app.box_report_tb r WHERE r.box_id = b.box_id)
         AND NOT EXISTS (SELECT 1 FROM app.box_job_tb j WHERE j.box_id = b.box_id)
         AND NOT EXISTS (SELECT 1 FROM app.scan_log_tb s WHERE s.box_id = b.box_id)
         AND NOT EXISTS (SELECT 1 FROM app.inspection_tb i WHERE i.box_id = b.box_id)
         AND NOT EXISTS (SELECT 1 FROM app.delivery_tb d WHERE d.box_id = b.box_id)
         AND NOT EXISTS (SELECT 1 FROM app.sos_case_tb c WHERE c.box_id = b.box_id)
         AND NOT EXISTS (SELECT 1 FROM app.technician_request_tb t WHERE t.box_id = b.box_id)
         AND NOT EXISTS (
           SELECT 1 FROM app.qr_issue_case_tb c
           JOIN app.box_qr_code_tb q ON q.box_qr_code_id = c.box_qr_code_id
           WHERE q.box_id = b.box_id
         )
       ) AS can_delete
       FROM app.box_tb b WHERE b.box_id = $1${lockClause}`,
      [boxId, UNUSED_ACTIVATION_STATUS, CONSUMED_ACTIVATION_STATUS],
    );
    return rows[0]?.can_delete ?? false;
  }

  /** งานทดสอบ: ปลุกตู้ → ไฟ + กล้อง → อ่าน QR อะไรก็ได้ (ช่างทดสอบหลังติดตั้ง · วัดเวลา "ได้งาน → ready") */
  /**
   * รหัสลับประจำตู้อีกครั้ง (ไว้เขียนลงบอร์ดใหม่ / เปลี่ยนบอร์ด) — คิดจาก BOX_MASTER_KEY เสมอ ไม่ได้เก็บไว้
   * ทุกครั้งที่เปิดดูบันทึกลง data_access_log_tb (ใคร · ตู้ไหน · เมื่อไหร่)
   */
  async revealSecret(boxId: string, adminId: string): Promise<{ box_id: string; device_secret: string }> {
    return withTx(this.pool, async (db) => {
      await this.load(db, boxId);
      await db.query(
        `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields) VALUES ($1, 'box', $2, '{device_secret}')`,
        [adminId, boxId],
      );
      return { box_id: boxId, device_secret: deviceSecret(this.config.get('BOX_MASTER_KEY', { infer: true }), boxId) };
    });
  }

  async createTestJob(boxId: string, adminId: string): Promise<JobDto> {
    await this.load(this.pool, boxId);
    const id = await this.jobs.create(boxId, 'test', adminId);
    return this.jobs.view(boxId, id);
  }

  async testJob(boxId: string, jobId: string): Promise<JobDto> {
    return this.jobs.view(boxId, jobId);
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  private async load(db: Db, boxId: string): Promise<BoxRow> {
    const { rows } = await db.query<BoxRow>(`SELECT ${BOX_COLS} FROM app.box_tb WHERE box_id = $1`, [boxId]);
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }

  private row(r: BoxRow, status: BoxStatus): AdminBoxRow {
    return {
      id: r.box_id,
      house_no: r.house_no,
      name: r.name,
      bound: r.owner_user_id !== null,
      status,
      battery: r.battery_pct === null ? null : { pct: r.battery_pct, charging: r.charging, reported_at: iso(r.battery_date) },
      last_seen_at: iso(r.last_seen_date),
      last_poll_at: iso(r.last_poll_date),
      fw: r.fw,
      fw_target: r.fw_target,
    };
  }

  private slot(s: string): QrSlot {
    return s === 'activate' ? 'activate' : (Number(s) as 1 | 2);
  }

  private qrUrl(slot: QrSlot, token: string): string {
    return `${this.config.get('PUBLIC_BASE_URL', { infer: true })}/${slot === 'activate' ? 'a' : 'b'}/${token}`;
  }

  /** ออก QR รุ่นแรก · รหัสพิมพ์/token ชนกัน (แทบไม่เกิด) → สุ่มใหม่ */
  private async issueQr(db: Db, boxId: string, slot: QrSlot): Promise<ReissuedQr> {
    const qrKey = this.config.get('QR_SIGNING_KEY', { infer: true });
    for (let i = 0; i < 10; i++) {
      const { rows: versions } = await db.query<{ version: number }>(
        `SELECT coalesce(max(version), 0) + 1 AS version
         FROM app.box_qr_code_tb
         WHERE box_id = $1
           AND (($2 = 'activate' AND slot = 'activate') OR ($2 <> 'activate' AND slot IN ('1','2')))` ,
        [boxId, String(slot)],
      );
      const version = versions[0].version;
      const token = slot === 'activate' ? newActivateToken() : frontQrToken(qrKey, boxId, String(slot) as '1' | '2', version);
      const code = newPrintCode();
      const { rows } = await db.query<{ box_qr_code_id: string }>(
        `INSERT INTO app.box_qr_code_tb (box_id, slot, version, token, print_code)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING box_qr_code_id`,
        [boxId, String(slot), version, token, code],
      );
      if (rows[0]) return { id: rows[0].box_qr_code_id, slot, version, url: this.qrUrl(slot, token), print_code: showPrintCode(code) };
    }
    throw new Error(`could not issue a unique QR for ${boxId}`);
  }
}
