import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx } from '../db/tx.js';
import { BoxConfigService } from '../box/box-config.service.js';
import { NotificationService } from '../push/notification.service.js';

/** api.md §4.6 `ZoneRequest` — คำขอของหน่วยงานที่จะดูแลบ้านนี้ (เจ้าของบ้านเห็น) */
export interface ZoneRequestDto {
  id: string;
  box: { id: string; name: string; house_no: string };
  agency: { name: string; type: string };
  zone_name: string;
  requested_at: string;
}

/** api.md §4.7 `BoxAgency` — หน่วยงานที่ดูแลบ้านนี้อยู่ (เจ้าของบ้านเห็น) */
export interface BoxAgencyDto {
  id: string;
  name: string;
  type: string;
  zone_names: string[];
  /** true = หน่วยงานถูกระงับอยู่ ยังไม่ได้ดูแลบ้านจนกว่าจะเปิดคืน */
  suspended: boolean;
  /** true = ถ้าเลิกรับหน่วยงานนี้ จะไม่เหลือหน่วยงานไหนรับ SOS ของบ้านนี้ */
  last: boolean;
}

/**
 * ✅ 2026-11-04 เจ้าของบ้านยืนยันก่อนบ้านเข้าโซน (ผู้ใช้สั่ง) — หัวหน้าเพิ่มบ้าน = ส่งคำขอ (ZoneService.setHouses)
 * ยอมรับ → เข้า zone_box_tb (ตรวจได้ / ได้ SOS) · ปฏิเสธ → ไม่เข้า · แจ้งหัวหน้าทุกคนของหน่วยงานนั้น
 * คำขอของตู้คนอื่น → 404 (กฎข้อ 9)
 * เจ้าของบ้านถอนความยินยอมเองได้ต่อหน่วยงาน (`leave` · AunopSJP/smmb#13) → กลับมาดูแลต้องส่งคำขอใหม่
 */
@Injectable()
export class ZoneRequestService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly notifications: NotificationService,
    private readonly boxConfigs: BoxConfigService,
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

  /** หน่วยงานที่มีบ้านนี้อยู่ในโซน (รวมทุกโซนของหน่วยงาน) · ตู้ของคนอื่น → 404 */
  async listAgencies(userId: string, boxId: string): Promise<BoxAgencyDto[]> {
    const own = await this.pool.query(`SELECT 1 FROM app.box_tb WHERE box_id = $1 AND owner_user_id = $2`, [boxId, userId]);
    if (!own.rowCount) throw new NotFoundException();
    const { rows } = await this.pool.query<{ agency_id: string; name: string; type: string; zone_names: string[]; suspended: boolean; last: boolean }>(
      `SELECT a.agency_id, a.name, a.type, array_agg(z.name ORDER BY z.name) AS zone_names,
              a.status = 'suspended' AS suspended,
              NOT EXISTS (SELECT 1 FROM app.zone_box_tb zb2
                          JOIN app.zone_tb z2 ON z2.zone_id = zb2.zone_id AND z2.deleted_date IS NULL
                          JOIN app.agency_tb a2 ON a2.agency_id = z2.agency_id AND a2.status = 'approved'
                          WHERE zb2.box_id = $1 AND a2.agency_id <> a.agency_id) AS last
       FROM app.zone_box_tb zb
       JOIN app.box_tb b ON b.box_id = zb.box_id AND b.owner_user_id = $2
       JOIN app.zone_tb z ON z.zone_id = zb.zone_id AND z.deleted_date IS NULL
       JOIN app.agency_tb a ON a.agency_id = z.agency_id
       WHERE zb.box_id = $1
       GROUP BY a.agency_id, a.name, a.type, a.status
       ORDER BY a.name`,
      [boxId, userId],
    );
    return rows.map((r) => ({ id: r.agency_id, name: r.name, type: r.type, zone_names: r.zone_names, suspended: r.suspended, last: r.last }));
  }

  /**
   * เลิกรับการดูแล: เอาบ้านออกจากทุกโซนของหน่วยงาน + ยกเลิกคำขอที่ค้าง + ปิดการตรวจที่กำลังทำอยู่ของหน่วยงานนั้น
   * ตู้ของคนอื่น / หน่วยงานไม่ได้ดูแลบ้านนี้ → 404 · มี SOS เปิดอยู่ → 409 SOS_OPEN
   */
  async leave(userId: string, boxId: string, agencyId: string): Promise<{ ok: true }> {
    const done = await withTx(this.pool, async (db) => {
      // ล็อกแถวตู้ กันกด SOS / เริ่มตรวจแทรกกลางทาง (สองงานนั้นล็อก FOR UPDATE) ·
      // NO KEY = ไม่ชนกับ FK ตอนกดยอมรับคำขอพร้อมกัน (กัน deadlock)
      const box = await db.query<{ house_no: string | null }>(
        `SELECT house_no FROM app.box_tb WHERE box_id = $1 AND owner_user_id = $2 FOR NO KEY UPDATE`,
        [boxId, userId],
      );
      if (!box.rows[0]) throw new NotFoundException();
      const { rows: zones } = await db.query<{ zone_id: string; name: string }>(
        `SELECT z.zone_id, z.name FROM app.zone_box_tb zb
         JOIN app.zone_tb z ON z.zone_id = zb.zone_id AND z.deleted_date IS NULL
         WHERE zb.box_id = $1 AND z.agency_id = $2::uuid
         ORDER BY z.name`,
        [boxId, agencyId],
      );
      if (!zones.length) throw new NotFoundException();
      const sos = await db.query(`SELECT 1 FROM app.sos_case_tb WHERE box_id = $1 AND status IN ('open','accepted')`, [boxId]);
      if (sos.rowCount) throw new AppError(HttpStatus.CONFLICT, 'SOS_OPEN', 'an SOS is open for this mailbox — try again after it ends');
      // คำขอก่อนโซน (ลำดับล็อกเดียวกับ decide)
      await db.query(
        `UPDATE app.zone_box_request_tb r SET status = 'cancelled', decided_by = $3, decided_date = now()
         FROM app.zone_tb z
         WHERE z.zone_id = r.zone_id AND z.agency_id = $2::uuid AND r.box_id = $1 AND r.status = 'pending'`,
        [boxId, agencyId, userId],
      );
      await db.query(
        `DELETE FROM app.zone_box_tb zb USING app.zone_tb z
         WHERE z.zone_id = zb.zone_id AND z.agency_id = $2::uuid AND zb.box_id = $1`,
        [boxId, agencyId],
      );
      await db.query(
        `UPDATE app.box_job_tb j SET expire_date = now()
         FROM app.inspection_tb i
         WHERE i.box_job_id = j.box_job_id AND i.box_id = $1 AND i.agency_id = $2::uuid AND i.status = 'open'
           AND j.result IS NULL AND j.expire_date > now()`,
        [boxId, agencyId],
      );
      await db.query(`UPDATE app.zone_tb SET updated_date = now() WHERE zone_id = ANY($1::uuid[])`, [zones.map((z) => z.zone_id)]);
      const heads = await db.query<{ user_id: string }>(
        `SELECT user_id FROM app.agency_member_tb WHERE agency_id = $1::uuid AND is_head AND status = 'active'`,
        [agencyId],
      );
      return { houseNo: box.rows[0].house_no ?? '', zoneNames: zones.map((z) => z.name).join(', '), heads: heads.rows.map((h) => h.user_id) };
    });
    this.boxConfigs.wakeBoxes([boxId]); // ตู้รับเวลาตรวจใหม่ทันที
    await this.notifications
      .notify(done.heads, {
        type: 'zone_left',
        data: { house_no: done.houseNo, zone_name: done.zoneNames, box_id: boxId },
        link: '/agency/zones',
      })
      .catch(() => undefined);
    return { ok: true };
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
        // หน่วยงานถูกระงับระหว่างคำขอค้าง → ยังยอมรับไม่ได้ (คำขอคงอยู่ เปิดคืนแล้วยอมรับได้) · FOR SHARE กันการระงับแทรกกลางทาง
        const a = await db.query(`SELECT 1 FROM app.agency_tb WHERE agency_id = $1 AND status = 'approved' FOR SHARE`, [r.agency_id]);
        if (!a.rowCount) throw new AppError(HttpStatus.CONFLICT, 'AGENCY_SUSPENDED', 'this agency is suspended');
        await db.query(`INSERT INTO app.zone_box_tb (zone_id, box_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [r.zone_id, r.box_id]);
        await db.query(`UPDATE app.zone_tb SET updated_date = now() WHERE zone_id = $1`, [r.zone_id]);
      }
      const heads = await db.query<{ user_id: string }>(
        `SELECT user_id FROM app.agency_member_tb WHERE agency_id = $1 AND is_head AND status = 'active'`,
        [r.agency_id],
      );
      return { r, heads: heads.rows.map((h) => h.user_id) };
    });
    if (accept) this.boxConfigs.wakeBoxes([done.r.box_id]); // บ้านเข้าโซนแล้ว → ตู้รับเวลาตรวจทันที
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
