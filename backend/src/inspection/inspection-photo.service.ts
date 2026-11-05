import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';

/** เก็บรูปกี่วัน (ผู้ใช้กำหนด 2026-11-04 "เก็บประมาณ 1 เดือน") */
export const PHOTO_KEEP_DAYS = 30;
export const PHOTO_MAX_BYTES = 400_000;
/** ตู้ต้องส่งรูปภายในกี่วินาทีหลังตรวจผ่าน (ตู้ถ่ายทันทีหลังผ่าน 1.5–4 วิ) */
export const BOX_PHOTO_WINDOW_S = 120;
/** JSON ของตู้จำกัด 120 KB (app-setup) → JPEG ใน base64 ได้ราว 85 KB */
export const BOX_PHOTO_MAX_BYTES = 85_000;

export type PhotoMime = 'image/jpeg' | 'image/webp';

/** ตรวจหัวไฟล์จริง (ไม่เชื่อ Content-Type อย่างเดียว) */
export function sniffMime(buf: Buffer): PhotoMime | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Snapface (✅ ผู้ใช้สั่ง 2026-11-04 · เปลี่ยน 2026-11-05 "ทำงานหลังตู้สแกน QR ประจำตัวเสร็จ เจ้าหน้าที่ต้องไม่รู้ว่าถ่ายตอนไหน")
 * - **กล้องของตู้ถ่าย** หลังตรวจผ่าน (หน่วงเวลาสุ่ม) แล้วส่ง `POST /v1/box/jobs/:job_id/photo` — แอปเจ้าหน้าที่ไม่มีปุ่ม/ไม่บอกว่ามีรูป
 * - 1 รูปต่อการตรวจ · รับภายใน 2 นาทีหลังผ่าน · เฉพาะตู้ของงานนั้น
 * - ดูได้: เจ้าของตู้ (การตรวจบ้านตัวเอง หลังผูกตู้) และแอดมิน — ทุกครั้งที่เปิดดูบันทึก data_access_log_tb
 * - เก็บ 30 วัน แล้วงานเบื้องหลังลบ (SchedulerService.cleanup)
 * - ไม่เทียบใบหน้า (เป็นหลักฐานป้องปรามการสแกนแทนกัน)
 */
@Injectable()
export class InspectionPhotoService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** ตู้ส่งรูปของงานตรวจที่เพิ่งผ่าน · ไม่ใช่งานของตู้นี้/ยังไม่ผ่าน/ช้าเกิน/ส่งซ้ำ → false (ตู้ไม่ต้องลองใหม่) */
  async saveFromBox(boxId: string, jobId: string, buf: Buffer): Promise<boolean> {
    if (!buf.length || buf.length > BOX_PHOTO_MAX_BYTES || sniffMime(buf) !== 'image/jpeg') return false;
    const { rowCount } = await this.pool.query(
      `INSERT INTO app.inspection_photo_tb (inspection_id, user_id, mime, photo)
       SELECT i.inspection_id, i.officer_user_id, 'image/jpeg', $3
       FROM app.inspection_tb i
       WHERE i.box_job_id = $1 AND i.box_id = $2 AND i.status = 'passed'
         AND i.checked_date > now() - make_interval(secs => $4)
       ON CONFLICT DO NOTHING`,
      [jobId, boxId, buf, BOX_PHOTO_WINDOW_S],
    );
    return !!rowCount;
  }

  /** เจ้าของตู้: เฉพาะการตรวจตู้ของตัวเองหลังวันที่ผูก · อื่น ๆ → 404 */
  async forOwner(userId: string, inspectionId: string): Promise<{ mime: string; photo: Buffer }> {
    return this.read(
      userId,
      inspectionId,
      `JOIN app.inspection_tb i ON i.inspection_id = p.inspection_id
       JOIN app.box_tb b ON b.box_id = i.box_id AND b.owner_user_id = $2 AND i.checked_date >= coalesce(b.bound_date, '-infinity')`,
    );
  }

  async forAdmin(adminId: string, inspectionId: string): Promise<{ mime: string; photo: Buffer }> {
    return this.read(adminId, inspectionId, `JOIN app.inspection_tb i ON i.inspection_id = p.inspection_id AND $2::text IS NOT NULL`);
  }

  private async read(viewerId: string, inspectionId: string, scope: string): Promise<{ mime: string; photo: Buffer }> {
    const { rows } = await this.pool.query<{ mime: string; photo: Buffer; user_id: string }>(
      `SELECT p.mime, p.photo, p.user_id FROM app.inspection_photo_tb p ${scope}
       WHERE p.inspection_id = $1::uuid AND p.created_date > now() - make_interval(days => $3)`,
      [inspectionId, viewerId, PHOTO_KEEP_DAYS],
    );
    const r = rows[0];
    if (!r) throw new NotFoundException();
    await this.pool.query(
      `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields) VALUES ($1, 'user', $2, $3)`,
      [viewerId, r.user_id, ['face_photo', 'inspection:' + inspectionId]],
    );
    return { mime: r.mime, photo: r.photo };
  }

  /** ลบรูปที่เก่ากว่า 30 วัน */
  async purge(): Promise<number> {
    const { rowCount } = await this.pool.query(`DELETE FROM app.inspection_photo_tb WHERE created_date < now() - make_interval(days => $1)`, [PHOTO_KEEP_DAYS]);
    return rowCount ?? 0;
  }
}
