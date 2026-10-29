import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { NotificationService } from '../push/notification.service.js';

export type TechnicianRequestReason = 'wifi_change' | 'repair' | 'other';
export type TechnicianRequestStatus = 'open' | 'scheduled' | 'done';

export interface TechnicianRequestDto {
  id: string;
  box_id: string;
  house_no: string | null;
  owner_name: string;
  owner_phone: string;
  reason: TechnicianRequestReason;
  note: string | null;
  status: TechnicianRequestStatus;
  created_at: string;
  scheduled_at: string | null;
  admin_note: string | null;
}

type RequestRow = {
  id: string;
  box_id: string;
  house_no: string | null;
  owner_name: string;
  owner_phone: string;
  reason: TechnicianRequestReason;
  note: string | null;
  status: TechnicianRequestStatus;
  created_date: Date;
  scheduled_date: Date | null;
  admin_note: string | null;
};

@Injectable()
export class TechnicianRequestService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly notifications: NotificationService,
  ) {}

  async create(ownerId: string, boxId: string, input: { reason: TechnicianRequestReason; note?: string }): Promise<TechnicianRequestDto> {
    try {
      const { rows } = await this.pool.query<{ id: string }>(
        `INSERT INTO app.technician_request_tb (box_id, owner_user_id, reason, note)
         SELECT b.box_id, b.owner_user_id, $3, $4
         FROM app.box_tb b WHERE b.box_id = $1 AND b.owner_user_id = $2
         RETURNING technician_request_id::text AS id`,
        [boxId, ownerId, input.reason, input.note ?? null],
      );
      if (!rows[0]) throw new NotFoundException();
      const { rows: admins } = await this.pool.query<{ user_id: string }>(
        `SELECT r.user_id FROM app.user_role_tb r JOIN app.user_tb u ON u.user_id = r.user_id
         WHERE r.role = 'admin' AND r.status = 'active' AND u.status = 'active' AND u.deleted_date IS NULL`,
      );
      await this.notifications.notify(admins.map((admin) => admin.user_id), {
        type: 'technician_request',
        data: { box_id: boxId, reason: input.reason },
        link: '/admin/technician-requests',
      }).catch(() => undefined);
      const { rows: detail } = await this.pool.query<RequestRow>(
        `${this.selectSql()} WHERE tr.technician_request_id = $1 AND tr.owner_user_id = $2`,
        [rows[0].id, ownerId],
      );
      return this.toDto(detail[0]);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (isUniqueViolation(error)) {
        throw new ConflictException({ code: 'TECHNICIAN_REQUEST_ALREADY_OPEN' });
      }
      throw error;
    }
  }

  async ownerList(ownerId: string, boxId: string): Promise<TechnicianRequestDto[]> {
    const { rows: boxRows } = await this.pool.query<{ box_id: string }>(
      `SELECT box_id FROM app.box_tb WHERE box_id = $1 AND owner_user_id = $2`, [boxId, ownerId],
    );
    if (!boxRows[0]) throw new NotFoundException();
    const { rows } = await this.pool.query<RequestRow>(
      `${this.selectSql()} WHERE tr.box_id = $1 AND tr.owner_user_id = $2 ORDER BY tr.created_date DESC`,
      [boxId, ownerId],
    );
    return rows.map((row) => this.toDto(row));
  }

  async adminList(status?: TechnicianRequestStatus): Promise<TechnicianRequestDto[]> {
    const { rows } = await this.pool.query<RequestRow>(
      `${this.selectSql()} WHERE ($1::text IS NULL OR tr.status = $1) ORDER BY tr.created_date DESC LIMIT 200`,
      [status ?? null],
    );
    return rows.map((row) => this.toDto(row));
  }

  async update(id: string, input: { status: 'scheduled' | 'done'; scheduled_at?: string; note?: string }): Promise<TechnicianRequestDto> {
    const { rows } = await this.pool.query<RequestRow>(
      `UPDATE app.technician_request_tb tr SET status = $2,
         scheduled_date = CASE WHEN $2 = 'scheduled' THEN $3::timestamptz ELSE tr.scheduled_date END,
         admin_note = $4
       WHERE tr.technician_request_id = $1 AND tr.status <> 'done'
       RETURNING tr.technician_request_id::text AS id`,
      [id, input.status, input.scheduled_at ?? null, input.note ?? null],
    );
    if (!rows[0]) throw new NotFoundException();
    const { rows: detail } = await this.pool.query<RequestRow>(`${this.selectSql()} WHERE tr.technician_request_id = $1`, [id]);
    const result = this.toDto(detail[0]);
    await this.notifications.notify([await this.ownerId(id)], {
      type: result.status === 'scheduled' ? 'technician_scheduled' : 'technician_done',
      data: { box_id: result.box_id, scheduled_at: result.scheduled_at ?? '', note: result.admin_note ?? '' },
      link: '/home/settings/technician',
    }).catch(() => undefined);
    return result;
  }

  private async ownerId(id: string): Promise<string> {
    const { rows } = await this.pool.query<{ owner_user_id: string }>(
      `SELECT owner_user_id FROM app.technician_request_tb WHERE technician_request_id = $1`, [id],
    );
    if (!rows[0]) throw new NotFoundException();
    return rows[0].owner_user_id;
  }

  private selectSql(): string {
    return `SELECT tr.technician_request_id::text AS id, tr.box_id, b.house_no,
                   u.display_name AS owner_name, u.phone AS owner_phone, tr.reason, tr.note, tr.status,
                   tr.created_date, tr.scheduled_date, tr.admin_note
            FROM app.technician_request_tb tr
            JOIN app.box_tb b ON b.box_id = tr.box_id
            JOIN app.user_tb u ON u.user_id = tr.owner_user_id`;
  }

  private toDto(row: RequestRow): TechnicianRequestDto {
    return {
      id: row.id,
      box_id: row.box_id,
      house_no: row.house_no,
      owner_name: row.owner_name,
      owner_phone: row.owner_phone,
      reason: row.reason,
      note: row.note,
      status: row.status,
      created_at: row.created_date.toISOString(),
      scheduled_at: row.scheduled_date?.toISOString() ?? null,
      admin_note: row.admin_note,
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === '23505';
}
