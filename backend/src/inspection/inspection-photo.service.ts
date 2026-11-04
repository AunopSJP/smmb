import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';

/** ถ่ายได้ภายในกี่นาทีหลังตรวจผ่าน */
export const PHOTO_WINDOW_MIN = 15;
/** เก็บรูปกี่วัน (ผู้ใช้กำหนด 2026-11-04 "เก็บประมาณ 1 เดือน") */
export const PHOTO_KEEP_DAYS = 30;
export const PHOTO_MAX_BYTES = 400_000;

export type PhotoMime = 'image/jpeg' | 'image/webp';

/** ตรวจหัวไฟล์จริง (ไม่เชื่อ Content-Type อย่างเดียว) */
export function sniffMime(buf: Buffer): PhotoMime | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Snapface (✅ ผู้ใช้สั่ง 2026-11-04) — เจ้าหน้าที่ถ่ายรูปตัวเองหลังสแกน QR ประจำตัวผ่าน
 * - ถ่ายได้ครั้งเดียวต่อการตรวจ ภายใน 15 นาทีหลังผ่าน · เฉพาะคนที่ตรวจ
 * - ดูได้: เจ้าของตู้ (การตรวจบ้านตัวเอง หลังผูกตู้) และแอดมิน — ทุกครั้งที่เปิดดูบันทึก data_access_log_tb
 * - เก็บ 30 วัน แล้วงานเบื้องหลังลบ (SchedulerService.cleanup)
 * - ไม่เทียบใบหน้า (เป็นหลักฐานป้องปรามการสแกนแทนกัน)
 */
@Injectable()
export class InspectionPhotoService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async save(userId: string, inspectionId: string, buf: unknown): Promise<{ inspection_id: string; saved: true }> {
    if (!Buffer.isBuffer(buf) || !buf.length) throw new AppError(HttpStatus.BAD_REQUEST, 'PHOTO_INVALID', 'send the photo as image/jpeg or image/webp bytes');
    if (buf.length > PHOTO_MAX_BYTES) throw new AppError(HttpStatus.PAYLOAD_TOO_LARGE, 'PHOTO_TOO_LARGE', 'photo is too large');
    const mime = sniffMime(buf);
    if (!mime) throw new AppError(HttpStatus.BAD_REQUEST, 'PHOTO_INVALID', 'only JPEG or WebP');
    const { rows } = await this.pool.query<{ status: string; late: boolean }>(
      `SELECT status, coalesce(checked_date < now() - make_interval(mins => $3), true) AS late
       FROM app.inspection_tb WHERE inspection_id = $1::uuid AND officer_user_id = $2`,
      [inspectionId, userId, PHOTO_WINDOW_MIN],
    );
    const ins = rows[0];
    if (!ins) throw new NotFoundException();
    if (ins.status !== 'passed') throw new AppError(HttpStatus.CONFLICT, 'INSPECTION_NOT_PASSED', 'photo only after the inspection passed');
    if (ins.late) throw new AppError(HttpStatus.GONE, 'PHOTO_WINDOW_CLOSED', `photo must be taken within ${PHOTO_WINDOW_MIN} minutes`);
    const { rowCount } = await this.pool.query(
      `INSERT INTO app.inspection_photo_tb (inspection_id, user_id, mime, photo) VALUES ($1::uuid, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [inspectionId, userId, mime, buf],
    );
    if (!rowCount) throw new AppError(HttpStatus.CONFLICT, 'PHOTO_EXISTS', 'a photo was already saved for this inspection');
    return { inspection_id: inspectionId, saved: true };
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
