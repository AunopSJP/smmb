import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';

/** ภาพสดจากกล้องตู้ตอนแอดมิน/ช่างกดทดสอบ (หน้า D04) — เก็บเฉพาะภาพล่าสุดในหน่วยความจำ ไม่ลงฐานข้อมูล ไม่เก็บถาวร */
const FRAME_TTL_MS = 30_000;
const MAX_JPEG_BYTES = 64 * 1024;

@Injectable()
export class BoxPreviewService {
  private readonly frames = new Map<string, { jpeg: Buffer; at: number; jobId: string }>();

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /**
   * ตู้ส่งภาพมาได้เฉพาะงานทดสอบ (`type = test`) ของตู้ตัวเองที่ยังไม่จบและยังไม่หมดอายุ
   * งานตรวจจริงของเจ้าหน้าที่ไม่เคยส่งภาพออกจากตู้ (CLAUDE.md: ตู้แค่อ่าน QR แล้วส่งข้อความ)
   */
  async store(boxId: string, jobId: string, jpeg: Buffer): Promise<boolean> {
    if (jpeg.length === 0 || jpeg.length > MAX_JPEG_BYTES) return false;
    // JPEG ขึ้นต้นด้วย FF D8
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return false;
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM app.box_job_tb
       WHERE box_job_id = $1 AND box_id = $2 AND type = 'test' AND result IS NULL AND expire_date > now()`,
      [jobId, boxId],
    );
    if (!rowCount) return false;
    this.frames.set(boxId, { jpeg, at: Date.now(), jobId });
    return true;
  }

  /** ภาพล่าสุดที่ยังไม่เก่าเกินไป · ไม่มี = null */
  latest(boxId: string): { jpeg: Buffer; at: Date; jobId: string } | null {
    const f = this.frames.get(boxId);
    if (!f) return null;
    if (Date.now() - f.at > FRAME_TTL_MS) {
      this.frames.delete(boxId);
      return null;
    }
    return { jpeg: f.jpeg, at: new Date(f.at), jobId: f.jobId };
  }
}
