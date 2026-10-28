import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import { isPgError, PG_UNIQUE_VIOLATION, withTx, type Db } from '../db/tx.js';
import { BoxConfigService } from './box-config.service.js';
import { newJobId } from './box-crypto.js';
import { JobHub } from './job-hub.js';

/** ตู้ต้อง ready ภายในเวลานี้หลังสร้างงาน (✅ job 60 วิ) */
export const JOB_TTL_S = 60;
/** หลัง ready ขยายอายุงานให้พอสแกนครบทุกครั้ง + เผื่อเน็ต */
export const AFTER_READY_SLACK_S = 30;

export type JobType = 'inspect' | 'test';
export type Verdict = 'pass' | 'retry' | 'fail';

/** สิ่งที่ตู้ได้จาก long-poll (โปรโตคอล §2.3) — เวลาเป็นวินาที unix ตามโปรโตคอล */
export interface BoxJobForBox {
  job_id: string;
  type: JobType;
  expires_at: number;
  scan_timeout_s: number;
  attempt_max: number;
}

/** ผลที่ตอบตู้ (โปรโตคอล §2.5) */
export interface VerdictDto {
  status: Verdict;
  attempts_left?: number;
}

export interface JobAttemptDto {
  attempt: number;
  read_ok: boolean;
  qr_text: string | null;
  read_ms: number | null;
  flash: boolean | null;
  verdict: Verdict;
  reason: string | null;
  at: string;
}

/** งานทดสอบที่แอดมินเห็น (api.md §9.4 test-jobs) */
export interface JobDto {
  id: string;
  box_id: string;
  type: JobType;
  status: 'waiting' | 'delivered' | 'ready' | 'passed' | 'failed' | 'expired';
  created_at: string;
  expires_at: string;
  delivered_at: string | null;
  ready_at: string | null;
  /** สร้างงาน → ตู้ ready ใช้กี่มิลลิวินาที (เป้า 1–3 วิ · design §13 เฟส 2) */
  wake_ms: number | null;
  attempts: JobAttemptDto[];
}

interface JobRow {
  box_job_id: string;
  box_id: string;
  type: JobType;
  max_attempts: number;
  scan_timeout_s: number;
  expire_date: Date;
  delivered_date: Date | null;
  ready_date: Date | null;
  result: 'pass' | 'fail' | null;
  created_date: Date;
}

const JOB_COLS = `box_job_id, box_id, type, max_attempts, scan_timeout_s, expire_date, delivered_date, ready_date, result, created_date`;

/**
 * งานทดสอบ: อ่าน QR อะไรก็ได้สำเร็จ = ผ่าน (ไว้ทดสอบไฟ + กล้อง + เวลาปลุกตู้ ไม่ตรวจลายเซ็น QR ประจำตัว)
 * ครบจำนวนครั้งแล้วยังอ่านไม่ได้ = ไม่ผ่าน
 */
export function judgeTest(attempt: number, readOk: boolean, qrText: string | null, max: number): VerdictDto & { reason: string | null } {
  if (readOk && qrText) return { status: 'pass', reason: null };
  if (attempt >= max) return { status: 'fail', reason: 'unreadable' };
  return { status: 'retry', attempts_left: max - attempt, reason: 'unreadable' };
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** งานปลุกตู้ (box_job_tb) — สร้าง · ส่งให้ตู้ทาง long-poll · ready · ผลอ่าน QR */
@Injectable()
export class BoxJobService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly configs: BoxConfigService,
    private readonly hub: JobHub,
  ) {}

  /** สร้างงาน + ปลุก long-poll ของตู้ทันที · ค่าสแกนใช้ค่าของตู้ ณ ตอนสร้าง */
  async create(boxId: string, type: JobType, createdBy: string | null): Promise<string> {
    const { config } = await this.configs.forBox(boxId);
    for (let i = 0; ; i++) {
      const id = newJobId();
      try {
        await this.pool.query(
          `INSERT INTO app.box_job_tb (box_job_id, box_id, type, created_by, max_attempts, scan_timeout_s, expire_date)
           VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))`,
          [id, boxId, type, createdBy, config.max_attempts, config.scan_timeout_s, JOB_TTL_S],
        );
        this.hub.wake(boxId);
        return id;
      } catch (err) {
        if (i < 5 && isPgError(err, PG_UNIQUE_VIOLATION)) continue;
        throw err;
      }
    }
  }

  /**
   * งานที่ตู้ควรได้ตอน long-poll: ยังไม่หมดอายุ · ยังไม่ ready · ยังไม่จบ
   * ส่งซ้ำได้ (ตู้อาจไม่ได้รับคำตอบรอบก่อนเพราะเน็ตหลุด) — delivered_date เก็บครั้งแรก
   */
  async takePending(boxId: string): Promise<BoxJobForBox | null> {
    const { rows } = await this.pool.query<JobRow>(
      `UPDATE app.box_job_tb SET delivered_date = coalesce(delivered_date, now())
       WHERE box_job_id = (
         SELECT box_job_id FROM app.box_job_tb
         WHERE box_id = $1 AND expire_date > now() AND ready_date IS NULL AND result IS NULL
         ORDER BY created_date DESC LIMIT 1
       )
       RETURNING ${JOB_COLS}`,
      [boxId],
    );
    const j = rows[0];
    return j
      ? {
          job_id: j.box_job_id,
          type: j.type,
          expires_at: Math.floor(j.expire_date.getTime() / 1000),
          scan_timeout_s: j.scan_timeout_s,
          attempt_max: j.max_attempts,
        }
      : null;
  }

  /** ตู้เปิดไฟ + กล้องแล้ว · ขยายอายุงานให้พอสแกนครบ · ส่งซ้ำได้ */
  async ready(boxId: string, jobId: string, flash: boolean | null): Promise<void> {
    await withTx(this.pool, async (db) => {
      const job = await this.lockLive(db, boxId, jobId);
      if (job.ready_date) return;
      await db.query(
        `UPDATE app.box_job_tb
         SET ready_date = now(), ready_flash = $2, delivered_date = coalesce(delivered_date, now()),
             expire_date = greatest(expire_date, now() + make_interval(secs => $3))
         WHERE box_job_id = $1`,
        [jobId, flash, job.max_attempts * job.scan_timeout_s + AFTER_READY_SLACK_S],
      );
    });
  }

  /**
   * ผลอ่าน QR ครั้งที่ n (โปรโตคอล §2.5) — ตัดสินที่ server เท่านั้น
   * ส่งซ้ำ (job + attempt เดิม) → ตอบผลเดิม · งานจบแล้ว → ตอบผลสุดท้าย
   */
  async result(
    boxId: string,
    jobId: string,
    body: { attempt: number; read_ok: boolean; qr_text: string | null; read_ms: number | null; flash: boolean | null },
  ): Promise<VerdictDto> {
    return withTx(this.pool, async (db) => {
      const job = await this.lock(db, boxId, jobId);
      const prev = await db.query<{ verdict: Verdict }>(
        `SELECT verdict FROM app.box_job_attempt_tb WHERE box_job_id = $1 AND attempt = $2`,
        [jobId, body.attempt],
      );
      if (prev.rows[0]) return this.reply(prev.rows[0].verdict, job.max_attempts, body.attempt);
      if (job.result) return { status: job.result };
      if (job.expire_date.getTime() <= Date.now()) throw this.expired();
      if (body.attempt > job.max_attempts) {
        throw new AppError(HttpStatus.BAD_REQUEST, 'ATTEMPT_INVALID', `attempt must be 1–${job.max_attempts}`);
      }

      if (job.type !== 'test') {
        // ตรวจตู้จริง (เทียบ QR ประจำตัวกับ job + เจ้าหน้าที่) มาในเฟส 3
        throw new AppError(HttpStatus.NOT_IMPLEMENTED, 'NOT_IMPLEMENTED', 'inspection jobs are not available yet');
      }
      const v = judgeTest(body.attempt, body.read_ok, body.qr_text, job.max_attempts);

      await db.query(
        `INSERT INTO app.box_job_attempt_tb (box_job_id, attempt, read_ok, qr_text, read_ms, flash, verdict, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [jobId, body.attempt, body.read_ok, body.qr_text, body.read_ms, body.flash, v.status, v.reason],
      );
      await db.query(`UPDATE app.box_job_tb SET ready_date = coalesce(ready_date, now()) WHERE box_job_id = $1`, [jobId]);
      if (v.status !== 'retry') {
        await db.query(`UPDATE app.box_job_tb SET result = $2, result_date = now() WHERE box_job_id = $1`, [jobId, v.status]);
      }
      return v.status === 'retry' ? { status: 'retry', attempts_left: v.attempts_left } : { status: v.status };
    });
  }

  /** งานของตู้นี้ (แอดมินดู) — ตู้อื่น → 404 */
  async view(boxId: string, jobId: string, db: Db = this.pool): Promise<JobDto> {
    const { rows } = await db.query<JobRow>(`SELECT ${JOB_COLS} FROM app.box_job_tb WHERE box_job_id = $1 AND box_id = $2`, [jobId, boxId]);
    const j = rows[0];
    if (!j) throw new NotFoundException();
    const attempts = await db.query<{
      attempt: number;
      read_ok: boolean;
      qr_text: string | null;
      read_ms: number | null;
      flash: boolean | null;
      verdict: Verdict;
      reason: string | null;
      created_date: Date;
    }>(
      `SELECT attempt, read_ok, qr_text, read_ms, flash, verdict, reason, created_date
       FROM app.box_job_attempt_tb WHERE box_job_id = $1 ORDER BY attempt`,
      [jobId],
    );
    const status: JobDto['status'] =
      j.result === 'pass'
        ? 'passed'
        : j.result === 'fail'
          ? 'failed'
          : j.expire_date.getTime() <= Date.now()
            ? 'expired'
            : j.ready_date
              ? 'ready'
              : j.delivered_date
                ? 'delivered'
                : 'waiting';
    return {
      id: j.box_job_id,
      box_id: j.box_id,
      type: j.type,
      status,
      created_at: j.created_date.toISOString(),
      expires_at: j.expire_date.toISOString(),
      delivered_at: iso(j.delivered_date),
      ready_at: iso(j.ready_date),
      wake_ms: j.ready_date ? j.ready_date.getTime() - j.created_date.getTime() : null,
      attempts: attempts.rows.map((a) => ({
        attempt: a.attempt,
        read_ok: a.read_ok,
        qr_text: a.qr_text,
        read_ms: a.read_ms,
        flash: a.flash,
        verdict: a.verdict,
        reason: a.reason,
        at: a.created_date.toISOString(),
      })),
    };
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  private reply(verdict: Verdict, max: number, attempt: number): VerdictDto {
    return verdict === 'retry' ? { status: 'retry', attempts_left: max - attempt } : { status: verdict };
  }

  private expired() {
    return new AppError(HttpStatus.GONE, 'JOB_EXPIRED', 'job expired', { server_time: Math.floor(Date.now() / 1000) });
  }

  /** งานของตู้นี้ (ล็อกแถว) · งานของตู้อื่น / ไม่มี → 404 */
  private async lock(db: Db, boxId: string, jobId: string): Promise<JobRow> {
    const { rows } = await db.query<JobRow>(`SELECT ${JOB_COLS} FROM app.box_job_tb WHERE box_job_id = $1 AND box_id = $2 FOR UPDATE`, [
      jobId,
      boxId,
    ]);
    if (!rows[0]) throw new AppError(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'no such job for this box');
    return rows[0];
  }

  /** เหมือน lock แต่งานต้องยังไม่หมดอายุและยังไม่จบ → ไม่งั้น 410 */
  private async lockLive(db: Db, boxId: string, jobId: string): Promise<JobRow> {
    const job = await this.lock(db, boxId, jobId);
    if (job.result || job.expire_date.getTime() <= Date.now()) throw this.expired();
    return job;
  }
}
