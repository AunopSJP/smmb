import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';

/** api.md §4.6 `ZoneRequest` — คำขอของหน่วยงานที่จะดูแลบ้านนี้ (เจ้าของบ้านเห็น) */
export interface ZoneRequestDto {
  id: string;
  box: { id: string; name: string; house_no: string };
  agency: { name: string; type: string };
  zone_name: string;
  requested_at: string;
}

/**
 * ✅ 2026-11-04 เจ้าของบ้านยืนยันก่อนบ้านเข้าโซน (ผู้ใช้สั่ง) — หัวหน้าเพิ่มบ้าน = ส่งคำขอ (ZoneService.setHouses)
 * ยอมรับ → เข้า zone_box_tb (ตรวจได้ / ได้ SOS) · ปฏิเสธ → ไม่เข้า · แจ้งหัวหน้าทุกคนของหน่วยงานนั้น
 * คำขอของตู้คนอื่น → 404 (กฎข้อ 9)
 */
@Injectable()
export class ZoneRequestService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly notifications: NotificationService,
  ) {}

  async listForOwner(userId: string): Promise<ZoneRequestDto[]> {
    const { rows } = await this.pool.query<{
      zone_box_request_id: string;
      box_id: string;
      box_name: string | null;
      house_no: string | null;
      agency_name: string;
      agency_type: string;
      zone_name: string;
      created_date: Date;
    }>(
      `SELECT r.zone_box_request_id, r.box_id, b.name AS box_name, b.house_no, a.name AS agency_name, a.type AS agency_type,
              z.name AS zone_name, r.created_date
       FROM app.zone_box_request_tb r
       JOIN app.box_tb b ON b.box_id = r.box_id AND b.owner_user_id = $1
       JOIN app.zone_tb z ON z.zone_id = r.zone_id AND z.deleted_date IS NULL
       JOIN app.agency_tb a ON a.agency_id = z.agency_id AND a.status = 'approved'
       WHERE r.status = 'pending'
       ORDER BY r.created_date`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.zone_box_request_id,
      box: { id: r.box_id, name: r.box_name ?? '', house_no: r.house_no ?? '' },
      agency: { name: r.agency_name, type: r.agency_type },
      zone_name: r.zone_name,
      requested_at: r.created_date.toISOString(),
    }));
  }

  async decide(userId: string, requestId: string, accept: boolean): Promise<{ id: string; status: 'accepted' | 'rejected' }> {
    const done = await withTx(this.pool, async (db) => {
      const { rows } = await db.query<{ status: string; zone_id: string; box_id: string; agency_id: string; zone_name: string; house_no: string | null }>(
        `SELECT r.status, r.zone_id, r.box_id, z.agency_id, z.name AS zone_name, b.house_no
         FROM app.zone_box_request_tb r
         JOIN app.box_tb b ON b.box_id = r.box_id AND b.owner_user_id = $2
         JOIN app.zone_tb z ON z.zone_id = r.zone_id AND z.deleted_date IS NULL
         WHERE r.zone_box_request_id = $1::uuid
         FOR UPDATE OF r`,
        [requestId, userId],
      );
      const r = rows[0];
      if (!r) throw new NotFoundException();
      if (r.status !== 'pending') throw new AppError(HttpStatus.CONFLICT, 'REQUEST_DECIDED', 'this request was already decided or cancelled');
      await db.query(
        `UPDATE app.zone_box_request_tb SET status = $2, decided_by = $3, decided_date = now() WHERE zone_box_request_id = $1::uuid`,
        [requestId, accept ? 'accepted' : 'rejected', userId],
      );
      if (accept) {
        await db.query(`INSERT INTO app.zone_box_tb (zone_id, box_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [r.zone_id, r.box_id]);
        await db.query(`UPDATE app.zone_tb SET updated_date = now() WHERE zone_id = $1`, [r.zone_id]);
      }
      const heads = await db.query<{ user_id: string }>(
        `SELECT user_id FROM app.agency_member_tb WHERE agency_id = $1 AND is_head AND status = 'active'`,
        [r.agency_id],
      );
      return { r, heads: heads.rows.map((h) => h.user_id) };
    });
    await this.notifications
      .notify(done.heads, {
        type: accept ? 'zone_join_accepted' : 'zone_join_rejected',
        data: { house_no: done.r.house_no ?? '', zone_name: done.r.zone_name, box_id: done.r.box_id },
        link: '/agency/zones',
      })
      .catch(() => undefined);
    return { id: requestId, status: accept ? 'accepted' : 'rejected' };
  }
}
