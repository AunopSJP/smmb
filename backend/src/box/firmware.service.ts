import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { JobHub } from './job-hub.js';

/** ช่องแอปของตู้ (พาร์ทิชัน min_spiffs) ใหญ่ ~1.9 MB */
export const MAX_FIRMWARE_BYTES = 1_900_000;
const VERSION_RE = /^[0-9A-Za-z._+-]{1,32}$/;

export interface FirmwareDto {
  version: string;
  sha256: string;
  size: number;
  uploaded_at: string;
}

export interface FirmwareOffer {
  version: string;
  size: number;
  sha256: string;
}

/** เฟิร์มแวร์ตู้ที่แอดมินอัปโหลดไว้ + ตั้งตู้ที่ต้องอัปเดต (`box_tb.fw_target`) */
@Injectable()
export class FirmwareService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly hub: JobHub,
  ) {}

  async list(): Promise<FirmwareDto[]> {
    const { rows } = await this.pool.query<{ version: string; sha256: string; size_bytes: number; created_date: Date }>(
      `SELECT version, sha256, size_bytes, created_date FROM app.firmware_tb ORDER BY created_date DESC LIMIT 50`,
    );
    return rows.map((r) => ({ version: r.version, sha256: r.sha256, size: r.size_bytes, uploaded_at: r.created_date.toISOString() }));
  }

  /** อัปโหลดไฟล์ .bin ของ ESP32 (ขึ้นต้นด้วยไบต์ E9) · เวอร์ชันซ้ำ = 409 (ห้ามเขียนทับ ไม่งั้น sha ที่ตู้เห็นไม่ตรง) */
  async upload(version: string, data: Buffer, userId: string): Promise<FirmwareDto> {
    if (!VERSION_RE.test(version)) throw new BadRequestException('version must be 1–32 chars of A-Z a-z 0-9 . _ + -');
    if (data.length < 64 * 1024 || data.length > MAX_FIRMWARE_BYTES) throw new BadRequestException('firmware size out of range');
    if (data[0] !== 0xe9) throw new BadRequestException('not an ESP32 firmware image');
    const sha256 = createHash('sha256').update(data).digest('hex');
    try {
      const { rows } = await this.pool.query<{ created_date: Date }>(
        `INSERT INTO app.firmware_tb (version, sha256, size_bytes, data, uploaded_by) VALUES ($1, $2, $3, $4, $5) RETURNING created_date`,
        [version, sha256, data.length, data, userId],
      );
      return { version, sha256, size: data.length, uploaded_at: rows[0]!.created_date.toISOString() };
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException({ code: 'FIRMWARE_EXISTS', message: 'version already uploaded' });
      throw e;
    }
  }

  /** เวอร์ชันที่ตั้งให้ตู้ทุกใบอัปเดตอัตโนมัติ (null = ปิด) */
  async getAuto(): Promise<{ version: string | null }> {
    const { rows } = await this.pool.query<{ value: string }>(`SELECT value FROM app.setting_tb WHERE setting_key = 'firmware_auto'`);
    return { version: rows[0]?.value ?? null };
  }

  /**
   * เปิด/เปลี่ยน/ปิด (null) การอัปเดตอัตโนมัติ — ตู้ที่ออนไลน์จะรับตอน long-poll/boot/report ครั้งถัดไป
   * ตู้ที่ยังไม่เคยรายงานเวอร์ชัน (fw ว่าง) ไม่ถูกแตะ · ตู้ที่มีงานตรวจค้างอยู่รอไว้ก่อน (ไม่รีบูตกลางการตรวจ)
   */
  async setAuto(version: string | null, userId: string): Promise<{ version: string | null }> {
    if (version === null) {
      await this.pool.query(`DELETE FROM app.setting_tb WHERE setting_key = 'firmware_auto'`);
      return { version: null };
    }
    if (!VERSION_RE.test(version)) throw new BadRequestException('bad version');
    const { rowCount } = await this.pool.query(`SELECT 1 FROM app.firmware_tb WHERE version = $1`, [version]);
    if (!rowCount) throw new NotFoundException();
    await this.pool.query(
      `INSERT INTO app.setting_tb (setting_key, value, updated_by) VALUES ('firmware_auto', $1, $2)
       ON CONFLICT (setting_key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by`,
      [version, userId],
    );
    return { version };
  }

  /** ลบไฟล์เวอร์ชันเก่า · ถ้ามีตู้ที่รอโหลดเวอร์ชันนี้อยู่ = 409 (ยกเลิกงานอัปเดตของตู้ก่อน) */
  async remove(version: string): Promise<void> {
    if (!VERSION_RE.test(version)) throw new NotFoundException();
    const auto = await this.pool.query(`SELECT 1 FROM app.setting_tb WHERE setting_key = 'firmware_auto' AND value = $1`, [version]);
    if (auto.rowCount) throw new ConflictException({ code: 'FIRMWARE_IN_USE', message: 'this version is the automatic update target — turn it off or choose another version first' });
    try {
      const { rowCount } = await this.pool.query(`DELETE FROM app.firmware_tb WHERE version = $1`, [version]);
      if (!rowCount) throw new NotFoundException();
    } catch (e) {
      if ((e as { code?: string }).code === '23503') throw new ConflictException({ code: 'FIRMWARE_IN_USE', message: 'a box is waiting to install this version' });
      throw e;
    }
  }

  /** ตั้งให้ตู้อัปเดตเป็นเวอร์ชันนี้ (null = ยกเลิก) → ปลุก long-poll ให้ตู้รับคำสั่งทันที */
  async setTarget(boxId: string, version: string | null, userId: string): Promise<void> {
    if (version !== null) {
      const { rowCount } = await this.pool.query(`SELECT 1 FROM app.firmware_tb WHERE version = $1`, [version]);
      if (!rowCount) throw new NotFoundException();
    }
    const { rowCount } = await this.pool.query(
      `UPDATE app.box_tb SET fw_target = $2, fw_target_requested_by = CASE WHEN $2::text IS NULL THEN NULL ELSE $3 END, fw_target_fetched_date = NULL
       WHERE box_id = $1`,
      [boxId, version, userId],
    );
    if (!rowCount) throw new NotFoundException();
    this.hub.wake(boxId);
  }

  /**
   * งานอัปเดตที่รอตู้: มี target + ตู้ยังไม่ได้รันเวอร์ชันนั้น (ตู้บูตแล้วรายงาน fw ตรงกัน → ล้าง target ทิ้ง)
   * ส่งให้ตู้ตอน boot/report/poll เหมือนคำสั่งอื่น
   * ตู้โหลดไฟล์ไปแล้วแต่ยังรายงานเวอร์ชันเดิม → เลิกเสนอ (กันวนโหลดซ้ำ) จนกว่าแอดมินจะกดอัปเดตใหม่
   */
  async offerFor(boxId: string): Promise<FirmwareOffer | null> {
    // อัปเดตอัตโนมัติ: ตู้นี้ไม่มีเป้าหมายค้าง + รายงานเวอร์ชันอื่น + ไม่มีงานตรวจที่ยังเปิดอยู่ → ตั้งเป้าให้เอง
    // (ถ้าโหลดแล้วยังติด fw_target ค้างอยู่ → ไม่ตั้งซ้ำ จึงไม่วนโหลดไม่รู้จบ · แอดมินเห็นป้าย "อัปเดตค้าง")
    await this.pool.query(
      `UPDATE app.box_tb b SET fw_target = s.value, fw_target_requested_by = NULL, fw_target_fetched_date = NULL
       FROM app.setting_tb s
       WHERE b.box_id = $1 AND s.setting_key = 'firmware_auto'
         AND b.fw_target IS NULL AND b.fw IS NOT NULL AND b.fw IS DISTINCT FROM s.value
         AND EXISTS (SELECT 1 FROM app.firmware_tb f WHERE f.version = s.value)
         AND NOT EXISTS (SELECT 1 FROM app.box_job_tb j WHERE j.box_id = b.box_id AND j.result IS NULL AND j.expire_date > now())`,
      [boxId],
    );
    const { rows } = await this.pool.query<{ version: string; sha256: string; size_bytes: number }>(
      `SELECT f.version, f.sha256, f.size_bytes
       FROM app.box_tb b JOIN app.firmware_tb f ON f.version = b.fw_target
       WHERE b.box_id = $1 AND b.fw IS DISTINCT FROM b.fw_target AND b.fw_target_fetched_date IS NULL`,
      [boxId],
    );
    return rows[0] ? { version: rows[0].version, size: rows[0].size_bytes, sha256: rows[0].sha256 } : null;
  }

  /** ตู้ที่รายงานเวอร์ชันตรงกับ target แล้ว = อัปเดตสำเร็จ */
  async clearIfDone(boxId: string): Promise<void> {
    await this.pool.query(`UPDATE app.box_tb SET fw_target = NULL, fw_target_requested_by = NULL WHERE box_id = $1 AND fw = fw_target`, [boxId]);
  }

  /** ไฟล์ให้ตู้โหลด — เฉพาะเวอร์ชันที่ตั้งเป็น target ของตู้นี้ */
  async fileFor(boxId: string, version: string): Promise<{ data: Buffer; sha256: string }> {
    if (!VERSION_RE.test(version)) throw new NotFoundException();
    const { rows } = await this.pool.query<{ data: Buffer; sha256: string }>(
      `SELECT f.data, f.sha256 FROM app.box_tb b JOIN app.firmware_tb f ON f.version = b.fw_target
       WHERE b.box_id = $1 AND f.version = $2`,
      [boxId, version],
    );
    if (!rows[0]) throw new NotFoundException();
    await this.pool.query(`UPDATE app.box_tb SET fw_target_fetched_date = now() WHERE box_id = $1 AND fw_target = $2`, [boxId, version]);
    return rows[0];
  }
}
