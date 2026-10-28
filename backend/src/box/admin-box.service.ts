import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import type { Env } from '../config/env.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx, type Db } from '../db/tx.js';
import type { BoxConfig, BoxStatus } from './box-config.js';
import { BoxConfigService } from './box-config.service.js';
import { deviceSecret, frontQrToken, newActivateToken, newPrintCode, showPrintCode } from './box-crypto.js';
import { BoxJobService, type JobDto } from './box-job.service.js';

export type QrSlot = 1 | 2 | 'activate';

/** api.md §9.4 `PrintableQr` (ยังไม่มี svg — หน้าเว็บสร้างรูป QR จาก url เอง) */
export interface PrintableQr {
  slot: QrSlot;
  url: string;
  print_code: string;
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
}

export interface AdminBoxDetail extends AdminBoxRow {
  service_active: boolean;
  registered_at: string;
  config: { config_ver: number; config: BoxConfig; box_config_ver: number | null; in_sync: boolean };
  qr: (PrintableQr & { id: string; version: number; status: string; health: string; issued_at: string })[];
  reports: { kind: 'boot' | 'report' | 'event'; at: string; body: Record<string, unknown> }[];
  auth_failures: { reason: string; at: string }[];
}

interface BoxRow {
  box_id: string;
  house_no: string | null;
  name: string | null;
  owner_user_id: string | null;
  service_active: boolean;
  battery_pct: number | null;
  charging: boolean | null;
  battery_date: Date | null;
  last_seen_date: Date | null;
  last_poll_date: Date | null;
  fw: string | null;
  config_override: Record<string, unknown>;
  config_ver_seen: number | null;
  created_date: Date;
}

const BOX_COLS = `box_id, house_no, name, owner_user_id, service_active, battery_pct, charging, battery_date,
  last_seen_date, last_poll_date, fw, config_override, config_ver_seen, created_date`;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** แอดมิน: ลงทะเบียนตู้ · ดูตู้ · งานทดสอบ (api.md §9.4) */
@Injectable()
export class AdminBoxService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly config: ConfigService<Env, true>,
    private readonly configs: BoxConfigService,
    private readonly jobs: BoxJobService,
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
      service_active: box.service_active,
      registered_at: box.created_date.toISOString(),
      config: { config_ver: cfg.ver, config: cfg.config, box_config_ver: box.config_ver_seen, in_sync: box.config_ver_seen === cfg.ver },
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
      auth_failures: fails.rows.map((r) => ({ reason: r.reason, at: r.created_date.toISOString() })),
    };
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
    };
  }

  private slot(s: string): QrSlot {
    return s === 'activate' ? 'activate' : (Number(s) as 1 | 2);
  }

  private qrUrl(slot: QrSlot, token: string): string {
    return `${this.config.get('PUBLIC_BASE_URL', { infer: true })}/${slot === 'activate' ? 'a' : 'b'}/${token}`;
  }

  /** ออก QR รุ่นแรก · รหัสพิมพ์/token ชนกัน (แทบไม่เกิด) → สุ่มใหม่ */
  private async issueQr(db: Db, boxId: string, slot: QrSlot): Promise<PrintableQr> {
    const qrKey = this.config.get('QR_SIGNING_KEY', { infer: true });
    for (let i = 0; i < 10; i++) {
      const token = slot === 'activate' ? newActivateToken() : frontQrToken(qrKey, boxId, String(slot) as '1' | '2', 1);
      const code = newPrintCode();
      const { rowCount } = await db.query(
        `INSERT INTO app.box_qr_code_tb (box_id, slot, version, token, print_code) VALUES ($1, $2, 1, $3, $4) ON CONFLICT DO NOTHING`,
        [boxId, String(slot), token, code],
      );
      if (rowCount) return { slot, url: this.qrUrl(slot, token), print_code: showPrintCode(code) };
    }
    throw new Error(`could not issue a unique QR for ${boxId}`);
  }
}
