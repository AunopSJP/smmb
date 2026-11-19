import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';

/** ภาพสดจากกล้องตู้ตอนแอดมิน/ช่างกดทดสอบ (หน้า D04) — เก็บเฉพาะภาพล่าสุดในหน่วยความจำ ไม่ลงฐานข้อมูล ไม่เก็บถาวร */
const FRAME_TTL_MS = 30_000;
const MAX_JPEG_BYTES = 64 * 1024;

/**
 * โหมดดูภาพสดตอนเจ้าหน้าที่ตรวจจริง (✅ ผู้ใช้สั่ง 2026-11-19 ไว้หาสาเหตุสแกน QR ไม่ติด)
 * แอดมินเปิดเองเป็นรายตู้ · หมดเองใน 15 นาที · เก็บในหน่วยความจำ (เซิร์ฟเวอร์รีสตาร์ต = ปิด) · ทุกครั้งที่เปิด/ปิดบันทึกใน data_access_log_tb
 */
export const LIVE_VIEW_MS = 15 * 60_000;

@Injectable()
export class BoxPreviewService {
  private readonly frames = new Map<string, { jpeg: Buffer; at: number; jobId: string }>();
  private readonly liveUntil = new Map<string, number>();

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** โหมดดูภาพสดตอนตรวจจริงของตู้นี้เปิดอยู่ไหม (หมดเวลาแล้ว = ปิด และล้างภาพที่ค้างทิ้ง) */
  liveActive(boxId: string, now = Date.now()): boolean {
    const until = this.liveUntil.get(boxId);
    if (until === undefined) return false;
    if (until <= now) {
      this.liveUntil.delete(boxId);
      this.frames.delete(boxId);
      return false;
    }
    return true;
  }

  /** เวลาที่โหมดดูภาพสดหมด · ไม่ได้เปิด = null */
  liveExpiresAt(boxId: string, now = Date.now()): Date | null {
    return this.liveActive(boxId, now) ? new Date(this.liveUntil.get(boxId) as number) : null;
  }

  enableLive(boxId: string, now = Date.now()): Date {
    const until = now + LIVE_VIEW_MS;
    this.liveUntil.set(boxId, until);
    return new Date(until);
  }

  /** ปิดโหมดดูภาพสด + ล้างภาพที่ค้างในหน่วยความจำทันที */
  disableLive(boxId: string): void {
    this.liveUntil.delete(boxId);
    this.frames.delete(boxId);
  }

  /**
   * ตู้ส่งภาพมาได้เฉพาะ: งานทดสอบ (`type = test`) หรือ งานตรวจจริงเมื่อแอดมินเปิดโหมดดูภาพสดของตู้นั้นไว้
   * ต้องเป็นงานของตู้ตัวเองที่ยังไม่จบและยังไม่หมดอายุ · นอกจากนี้ตู้ไม่เคยส่งภาพระหว่างตรวจ (CLAUDE.md: ตู้แค่อ่าน QR แล้วส่งข้อความ)
   */
  async store(boxId: string, jobId: string, jpeg: Buffer): Promise<boolean> {
    if (jpeg.length === 0 || jpeg.length > MAX_JPEG_BYTES) return false;
    // JPEG ขึ้นต้นด้วย FF D8
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return false;
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM app.box_job_tb
       WHERE box_job_id = $1 AND box_id = $2 AND result IS NULL AND expire_date > now()
         AND (type = 'test' OR (type = 'inspect' AND $3::boolean))`,
      [jobId, boxId, this.liveActive(boxId)],
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
