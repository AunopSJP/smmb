import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { withTx } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';

export type QrIssueFix = 'swap' | 'reissue' | 'fake';
export type QrIssueStatus = 'open' | 'owner_notified' | 'owner_confirmed' | 'qr_reissued' | 'technician_dispatched' | 'resolved';
export type QrIssueDelivery = 'post' | 'technician';
const QR_ISSUE_HEALTHS = ['damaged', 'suspicious', 'maybe_fake', 'expiring'] as const satisfies readonly QrIssueDto['health'][];
const QR_ACTIVE_STATUS = 'active';
const QR_HEALTHY_STATUS = 'ok';
const QR_CASE_RESOLVED_STATUS = 'resolved';

export interface QrIssueDto {
  id: string;
  box_id: string;
  house_no: string;
  slot: 1 | 2;
  health: 'damaged' | 'suspicious' | 'maybe_fake' | 'expiring';
  health_reasons: string[];
  last_scanned_at: string | null;
  backup_used: boolean;
  fix: QrIssueFix | null;
  status: QrIssueStatus;
  step: number;
  resolved: boolean;
  created_at: string;
  updated_at: string;
  delivery_method: QrIssueDelivery | null;
}

export interface QrIssueSummary {
  total: number;
  by_health: Record<QrIssueDto['health'], number>;
}

interface QrIssueRow {
  id: string;
  box_id: string;
  house_no: string;
  slot: string;
  health: QrIssueDto['health'];
  health_reasons: string[];
  last_scanned_date: Date | null;
  backup_used: boolean;
  fix: QrIssueFix | null;
  status: QrIssueStatus | null;
  created_date: Date | null;
  updated_date: Date | null;
  qr_updated_date: Date;
  delivery_method: QrIssueDelivery | null;
}

@Injectable()
export class QrIssueService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly notifications: NotificationService,
  ) {}

  async list(health?: QrIssueDto['health'][]): Promise<QrIssueDto[]> {
    const { rows } = await this.pool.query<QrIssueRow>(
      `${this.selectSql()}
       WHERE ((q.status = 'active' AND q.health <> 'ok') OR (c.status IS NOT NULL AND c.status <> 'resolved'))
         AND ($1::text[] IS NULL OR q.health = ANY($1::text[]))
       ORDER BY CASE q.health WHEN 'maybe_fake' THEN 0 WHEN 'damaged' THEN 1 WHEN 'suspicious' THEN 2 ELSE 3 END,
                coalesce(c.created_date, q.updated_date) DESC
       LIMIT 200`,
      [health?.length ? health : null],
    );
    return rows.map((row) => this.toDto(row));
  }

  async summary(): Promise<QrIssueSummary> {
    const { rows } = await this.pool.query<{ health: string; count: number }>(
      `SELECT health, count(*)::int AS count
       FROM (${this.selectSql()}) issues
       WHERE ((issues.qr_status = $1 AND issues.health <> $2) OR (issues.status IS NOT NULL AND issues.status <> $3))
       GROUP BY health`,
      [QR_ACTIVE_STATUS, QR_HEALTHY_STATUS, QR_CASE_RESOLVED_STATUS],
    );
    const byHealth: QrIssueSummary['by_health'] = { damaged: 0, suspicious: 0, maybe_fake: 0, expiring: 0 };
    for (const row of rows) {
      for (const health of QR_ISSUE_HEALTHS) {
        if (row.health === health) byHealth[health] = row.count;
      }
    }
    return { total: Object.values(byHealth).reduce((total, count) => total + count, 0), by_health: byHealth };
  }

  async get(qrId: string): Promise<QrIssueDto> {
    const { rows } = await this.pool.query<QrIssueRow>(`${this.selectSql()} WHERE q.box_qr_code_id = $1 ORDER BY c.created_date DESC LIMIT 1`, [qrId]);
    if (!rows[0]) throw new NotFoundException();
    return this.toDto(rows[0]);
  }

  async chooseFix(qrId: string, fix: QrIssueFix, adminId: string): Promise<QrIssueDto> {
    const { rows } = await this.pool.query<{ box_id: string; owner_user_id: string | null; health: string }>(
      `SELECT q.box_id, b.owner_user_id, q.health FROM app.box_qr_code_tb q JOIN app.box_tb b ON b.box_id = q.box_id
       WHERE q.box_qr_code_id = $1 AND q.slot IN ('1','2') AND q.status = 'active' AND q.health <> 'ok'`,
      [qrId],
    );
    const qr = rows[0];
    if (!qr) throw new NotFoundException();
    if (fix === 'swap' && !qr.owner_user_id) throw new ConflictException({ code: 'BOX_HAS_NO_OWNER' });
    await withTx(this.pool, async (db) => {
      const { rows: current } = await db.query<{ status: QrIssueStatus }>(
        `SELECT status FROM app.qr_issue_case_tb WHERE box_qr_code_id = $1 AND status <> 'resolved' FOR UPDATE`,
        [qrId],
      );
      if (current[0]) {
        if (current[0].status !== 'open') throw new ConflictException({ code: 'QR_CASE_ALREADY_IN_PROGRESS' });
        await db.query(`UPDATE app.qr_issue_case_tb SET fix = $2 WHERE box_qr_code_id = $1 AND status = 'open'`, [qrId, fix]);
      } else {
        await db.query(`INSERT INTO app.qr_issue_case_tb (box_qr_code_id, fix, created_by) VALUES ($1, $2, $3)`, [qrId, fix, adminId]);
      }
    });
    return this.get(qrId);
  }

  async requestBackupSwap(qrId: string, adminId: string): Promise<QrIssueDto> {
    const { rows } = await this.pool.query<{ box_id: string; owner_user_id: string | null; house_no: string | null }>(
      `SELECT q.box_id, b.owner_user_id, b.house_no FROM app.box_qr_code_tb q JOIN app.box_tb b ON b.box_id = q.box_id
       WHERE q.box_qr_code_id = $1 AND q.slot = '1' AND q.status = 'active' AND q.health <> 'ok'`,
      [qrId],
    );
    const qr = rows[0];
    if (!qr?.owner_user_id) throw new NotFoundException();
    let shouldNotifyOwner = false;
    await withTx(this.pool, async (db) => {
      const { rows: current } = await db.query<{ status: QrIssueStatus; fix: QrIssueFix | null }>(
        `SELECT status, fix FROM app.qr_issue_case_tb WHERE box_qr_code_id = $1 AND status <> 'resolved' FOR UPDATE`, [qrId],
      );
      if (current[0]?.status === 'owner_notified') return;
      if (current[0] && current[0].status !== 'open') throw new ConflictException({ code: 'QR_CASE_ALREADY_IN_PROGRESS' });
      if (current[0]) {
        await db.query(`UPDATE app.qr_issue_case_tb SET fix = 'swap', status = 'owner_notified' WHERE box_qr_code_id = $1 AND status = 'open'`, [qrId]);
      } else {
        await db.query(`INSERT INTO app.qr_issue_case_tb (box_qr_code_id, fix, status, created_by) VALUES ($1, 'swap', 'owner_notified', $2)`, [qrId, adminId]);
      }
      shouldNotifyOwner = true;
    });
    if (shouldNotifyOwner) {
      await this.notifications.notify([qr.owner_user_id], {
        type: 'swap_backup_qr',
        data: { box_id: qr.box_id, house_no: qr.house_no ?? '' },
        link: '/home',
        tag: `qr-swap-${qr.box_id}`,
      }).catch(() => undefined);
    }
    return this.get(qrId);
  }

  async ownerPlacedBackup(ownerId: string, boxId: string): Promise<{ box_id: string; status: 'owner_confirmed' | 'qr_reissued' }> {
    let resultStatus: 'owner_confirmed' | 'qr_reissued' = 'owner_confirmed';
    await withTx(this.pool, async (db) => {
      const { rows } = await db.query<{ qr_issue_case_id: string; box_qr_code_id: string; status: QrIssueStatus }>(
        `SELECT c.qr_issue_case_id, c.box_qr_code_id, c.status
         FROM app.qr_issue_case_tb c
         JOIN app.box_qr_code_tb front ON front.box_qr_code_id = c.box_qr_code_id
         JOIN app.box_tb b ON b.box_id = front.box_id
         WHERE front.box_id = $1 AND b.owner_user_id = $2 AND c.fix = 'swap' AND c.status IN ('owner_notified','owner_confirmed','qr_reissued')
         ORDER BY c.created_date DESC LIMIT 1 FOR UPDATE OF c`,
        [boxId, ownerId],
      );
      const issue = rows[0];
      if (!issue) throw new NotFoundException();
      if (issue.status === 'qr_reissued') {
        resultStatus = 'qr_reissued';
        return;
      }
      if (issue.status === 'owner_confirmed') return;
      const { rows: backup } = await db.query<{ box_qr_code_id: string }>(
        `SELECT box_qr_code_id FROM app.box_qr_code_tb WHERE box_id = $1 AND slot = '2' AND status = 'active' FOR UPDATE`, [boxId],
      );
      if (!backup[0]) throw new ConflictException({ code: 'BACKUP_QR_MISSING' });
      await db.query(`UPDATE app.box_qr_code_tb SET status = 'revoked', revoked_date = now() WHERE box_qr_code_id = $1`, [issue.box_qr_code_id]);
      await db.query(
        `UPDATE app.box_qr_code_tb SET slot = '1', health = 'ok', health_reasons = '{}'
         WHERE box_qr_code_id = $1`, [backup[0].box_qr_code_id],
      );
      await db.query(`UPDATE app.qr_issue_case_tb SET status = 'owner_confirmed' WHERE qr_issue_case_id = $1`, [issue.qr_issue_case_id]);
    });
    return { box_id: boxId, status: resultStatus };
  }

  async recordReissue(qrId: string, slots: (1 | 2)[], deliveryMethod: QrIssueDelivery | null): Promise<QrIssueDto> {
    await withTx(this.pool, async (db) => {
      const { rows } = await db.query<{
        qr_issue_case_id: string;
        box_id: string;
        fix: QrIssueFix | null;
        status: QrIssueStatus;
        created_date: Date;
      }>(
        `SELECT c.qr_issue_case_id, q.box_id, c.fix, c.status, c.created_date
         FROM app.qr_issue_case_tb c
         JOIN app.box_qr_code_tb q ON q.box_qr_code_id = c.box_qr_code_id
         WHERE c.box_qr_code_id = $1 AND c.status <> 'resolved' FOR UPDATE OF c`,
        [qrId],
      );
      const issue = rows[0];
      if (!issue) throw new NotFoundException();
      if (!issue.fix) throw new ConflictException({ code: 'QR_FIX_REQUIRED' });
      const expected: (1 | 2)[] = issue.fix === 'swap' ? [2] : [1, 2];
      if (expected.length !== slots.length || expected.some((slot) => !slots.includes(slot))) {
        throw new ConflictException({ code: 'QR_REISSUE_INCOMPLETE' });
      }
      if (issue.status === 'qr_reissued' || issue.status === 'technician_dispatched') return;
      if (issue.fix === 'swap' && issue.status !== 'owner_confirmed') throw new ConflictException({ code: 'OWNER_CONFIRMATION_REQUIRED' });
      if (issue.fix !== 'swap' && issue.status !== 'open') throw new ConflictException({ code: 'QR_CASE_ALREADY_IN_PROGRESS' });

      const activeSlots = await db.query<{ slot: string }>(
        `SELECT slot FROM app.box_qr_code_tb
         WHERE box_id = $1 AND status = 'active' AND slot = ANY($2::text[]) AND created_date >= $3
         FOR UPDATE`,
        [issue.box_id, expected.map(String), issue.created_date],
      );
      if (activeSlots.rows.length !== expected.length) throw new ConflictException({ code: 'QR_REISSUE_NOT_FOUND' });
      await db.query(
        `UPDATE app.qr_issue_case_tb SET status = 'qr_reissued', delivery_method = $2 WHERE qr_issue_case_id = $1`,
        [issue.qr_issue_case_id, deliveryMethod],
      );
    });
    return this.get(qrId);
  }

  async dispatchTechnician(qrId: string): Promise<QrIssueDto> {
    const dispatchedBoxId = await withTx(this.pool, async (db): Promise<string | null> => {
      const { rows } = await db.query<{ qr_issue_case_id: string; box_id: string; fix: QrIssueFix | null; status: QrIssueStatus }>(
        `SELECT c.qr_issue_case_id, q.box_id, c.fix, c.status
         FROM app.qr_issue_case_tb c JOIN app.box_qr_code_tb q ON q.box_qr_code_id = c.box_qr_code_id
         WHERE c.box_qr_code_id = $1 AND c.status <> 'resolved' FOR UPDATE OF c`,
        [qrId],
      );
      const issue = rows[0];
      if (!issue) throw new NotFoundException();
      if (issue.status === 'technician_dispatched') return null;
      if (issue.fix === 'swap' || issue.status !== 'qr_reissued') throw new ConflictException({ code: 'QR_REISSUE_REQUIRED' });
      await db.query(`UPDATE app.qr_issue_case_tb SET status = 'technician_dispatched' WHERE qr_issue_case_id = $1`, [issue.qr_issue_case_id]);
      return issue.box_id;
    });
    if (dispatchedBoxId) {
      const { rows } = await this.pool.query<{ user_id: string }>(
        `SELECT r.user_id FROM app.user_role_tb r JOIN app.user_tb u ON u.user_id = r.user_id
         WHERE r.role = 'admin' AND r.status = 'active' AND u.status = 'active' AND u.deleted_date IS NULL`,
      );
      await this.notifications.notify(rows.map((row) => row.user_id), {
        type: 'qr_technician_dispatch',
        data: { box_id: dispatchedBoxId },
        link: '/admin/qr',
        tag: `qr-tech-${dispatchedBoxId}`,
      }).catch(() => undefined);
    }
    return this.get(qrId);
  }

  async resolve(qrId: string, adminId: string): Promise<QrIssueDto> {
    let foundIssue = false;
    await withTx(this.pool, async (db) => {
      const { rows } = await db.query<{ qr_issue_case_id: string; fix: QrIssueFix | null; status: QrIssueStatus }>(
        `SELECT qr_issue_case_id, fix, status FROM app.qr_issue_case_tb
         WHERE box_qr_code_id = $1 AND status <> 'resolved' FOR UPDATE`,
        [qrId],
      );
      const issue = rows[0];
      if (!issue) return;
      foundIssue = true;
      const ready = issue.fix === 'swap' ? issue.status === 'qr_reissued' : issue.status === 'technician_dispatched';
      if (!ready) throw new ConflictException({ code: 'QR_CASE_NOT_READY_TO_CLOSE' });
      await db.query(
        `UPDATE app.qr_issue_case_tb SET status = 'resolved', resolved_by = $2, resolved_date = now() WHERE qr_issue_case_id = $1`,
        [issue.qr_issue_case_id, adminId],
      );
    });
    if (!foundIssue) {
      const current = await this.get(qrId);
      if (!current.resolved) throw new ConflictException({ code: 'QR_CASE_NOT_FOUND' });
    }
    return this.get(qrId);
  }

  private selectSql(): string {
    return `SELECT q.box_qr_code_id::text AS id, q.box_id, coalesce(b.house_no, q.box_id) AS house_no, q.slot,
                   q.status AS qr_status,
                   CASE WHEN q.health = 'backup_in_use' THEN 'suspicious' ELSE q.health END AS health,
                   q.health_reasons, q.last_scanned_date, q.updated_date AS qr_updated_date,
                   EXISTS (SELECT 1 FROM app.box_qr_code_tb backup WHERE backup.box_id = q.box_id AND backup.slot = '2'
                           AND 'backup_used' = ANY(backup.health_reasons)) AS backup_used,
                   c.fix, c.status, c.created_date, c.updated_date, c.delivery_method
            FROM app.box_qr_code_tb q
            JOIN app.box_tb b ON b.box_id = q.box_id
            LEFT JOIN LATERAL (
              SELECT * FROM app.qr_issue_case_tb candidate
              WHERE candidate.box_qr_code_id = q.box_qr_code_id
              ORDER BY (candidate.status <> 'resolved') DESC, candidate.created_date DESC LIMIT 1
            ) c ON true`;
  }

  private toDto(row: QrIssueRow): QrIssueDto {
    const status = row.status ?? 'open';
    const step = row.fix === 'swap'
      ? status === 'owner_notified' ? 1 : status === 'owner_confirmed' ? 3 : status === 'qr_reissued' ? 4 : status === 'resolved' ? 4 : 0
      : status === 'qr_reissued' ? 2 : status === 'technician_dispatched' ? 3 : status === 'resolved' ? 4 : 0;
    return {
      id: row.id,
      box_id: row.box_id,
      house_no: row.house_no,
      slot: Number(row.slot) === 2 ? 2 : 1,
      health: row.health,
      health_reasons: row.health_reasons,
      last_scanned_at: row.last_scanned_date?.toISOString() ?? null,
      backup_used: row.backup_used,
      fix: row.fix,
      status,
      step,
      resolved: status === 'resolved',
      created_at: row.created_date?.toISOString() ?? row.last_scanned_date?.toISOString() ?? row.qr_updated_date.toISOString(),
      updated_at: row.updated_date?.toISOString() ?? row.last_scanned_date?.toISOString() ?? row.qr_updated_date.toISOString(),
      delivery_method: row.delivery_method,
    };
  }
}
