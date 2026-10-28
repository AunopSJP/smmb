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

/** api.md §4.2 `BoxSummary` */
export interface BoxSummary {
  id: string;
  name: string;
  house_no: string;
  status: BoxStatus;
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
  ) {}

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

  /** ลิงก์ต้องมาจากโดเมนใน QR_ALLOWED_HOSTS และ path /a/<token> · อย่างอื่น = ไม่ใช่ QR ของระบบ */
  private tokenFromUrl(text: string): string | null {
    let url: URL;
    try {
      url = new URL(text.trim());
    } catch {
      return null;
    }
    if (!this.config.get('QR_ALLOWED_HOSTS', { infer: true }).includes(url.hostname.toLowerCase())) return null;
    const m = /^\/a\/([^/]+)\/?$/.exec(url.pathname);
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
