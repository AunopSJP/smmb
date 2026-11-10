import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { AccountService } from '../auth/account.service.js';
import { newGroupCode } from '../common/codes.js';
import { AuditService } from '../common/audit.service.js';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import { isPgError, PG_UNIQUE_VIOLATION, withTx, type Db } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';

export type MemberStatus = 'pending' | 'active' | 'disabled' | 'rejected';

/** api.md §8.2 `Member` */
export interface MemberDto {
  id: string;
  name: string;
  display_name: string;
  phone: string;
  status: MemberStatus;
  is_head: boolean;
  /** ตำแหน่ง/ยศ · เลขประจำตัว (✅ 2026-11-04 · '' = ไม่ได้กรอก) */
  position: string;
  staff_no: string;
  zones: { id: string; name: string }[];
  joined_at: string;
  last_inspection_at: string | null;
}

/** ข้อมูลละเอียดของหน่วยงาน (✅ 2026-11-06) — จังหวัด/เขตใช้เทียบกับโซน · lat/lng แสดงบนแผนที่ให้เจ้าของบ้าน */
export interface AgencyProfile {
  address: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  coverage_note: string | null;
  registration_no: string | null;
  lat: number | null;
  lng: number | null;
}

export type AgencyProfilePatch = Partial<Omit<AgencyProfile, 'registration_no'>> & { contact?: string };

/** api.md §8.1b — แผนที่หน่วยงานให้เจ้าของบ้าน */
export interface AgencyMapItem {
  id: string;
  name: string;
  type: string;
  address: string | null;
  locality: string | null;
  phone: string | null;
  contact: string | null;
  coverage_note: string | null;
  lat: number;
  lng: number;
}

/** api.md §8.1 */
export interface AgencyDto {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  group_code: string | null;
  reject_reason: string | null;
  contact: string | null;
  profile: AgencyProfile;
  heads: { id: string; display_name: string }[];
}

interface Target {
  user_id: string;
  status: MemberStatus;
  is_head: boolean;
}

export const cannotChangeSelf = () =>
  new AppError(HttpStatus.FORBIDDEN, 'CANNOT_CHANGE_SELF', 'you cannot do this to your own account');

/** สร้างรหัสกลุ่มที่ไม่ซ้ำ (ชนกันแทบไม่เกิด แต่ลองใหม่ให้) */
export async function assignGroupCode(db: Db, agencyId: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newGroupCode();
    try {
      await db.query(`SAVEPOINT group_code`);
      await db.query(`UPDATE app.agency_tb SET group_code = $2 WHERE agency_id = $1`, [agencyId, code]);
      await db.query(`RELEASE SAVEPOINT group_code`);
      return code;
    } catch (err) {
      await db.query(`ROLLBACK TO SAVEPOINT group_code`);
      if (!isPgError(err, PG_UNIQUE_VIOLATION)) throw err;
    }
  }
  throw new Error('could not generate a unique group code');
}

/**
 * งานของหัวหน้า — ทำกับหน่วยงานของตัวเองเท่านั้น (api.md §8)
 * คนนอกหน่วยงาน → 404 (CLAUDE.md กฎข้อ 9) · กรองหน่วยงานใน SQL ทุกคำสั่ง
 */
@Injectable()
export class AgencyService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly account: AccountService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /** หัวหน้าเห็นได้แม้หน่วยงานยังรออนุมัติ/ถูกปฏิเสธ (L02 / L02-b) · ไม่ใช่หัวหน้า → 404 */
  async get(userId: string): Promise<AgencyDto> {
    const { rows } = await this.pool.query<{
      agency_id: string;
      name: string;
      type: string;
      status: AgencyDto['status'];
      group_code: string | null;
      reject_reason: string | null;
      contact: string | null;
      address: string | null;
      subdistrict: string | null;
      district: string | null;
      province: string | null;
      postal_code: string | null;
      phone: string | null;
      email: string | null;
      contact_person: string | null;
      coverage_note: string | null;
      registration_no: string | null;
      lat: string | null;
      lng: string | null;
    }>(
      `SELECT a.agency_id, a.name, a.type, a.status, a.group_code, a.reject_reason, a.contact,
              a.address, a.subdistrict, a.district, a.province, a.postal_code, a.phone, a.email, a.contact_person, a.coverage_note, a.registration_no, a.lat, a.lng
       FROM app.agency_member_tb m JOIN app.agency_tb a ON a.agency_id = m.agency_id
       WHERE m.user_id = $1 AND m.is_head AND m.status IN ('active', 'pending', 'rejected')`,
      [userId],
    );
    const a = rows[0];
    if (!a) throw new NotFoundException();
    const heads = await this.pool.query<{ user_id: string; display_name: string }>(
      `SELECT u.user_id, u.display_name FROM app.agency_member_tb m JOIN app.user_tb u ON u.user_id = m.user_id
       WHERE m.agency_id = $1 AND m.is_head AND m.status IN ('active', 'pending') ORDER BY m.created_date`,
      [a.agency_id],
    );
    return {
      id: a.agency_id,
      name: a.name,
      type: a.type,
      status: a.status,
      // รหัสกลุ่มใช้ได้เฉพาะหน่วยงานที่อนุมัติแล้ว
      group_code: a.status === 'approved' ? a.group_code : null,
      reject_reason: a.status === 'rejected' ? a.reject_reason : null,
      contact: a.contact,
      profile: {
        address: a.address, subdistrict: a.subdistrict, district: a.district, province: a.province, postal_code: a.postal_code,
        phone: a.phone, email: a.email, contact_person: a.contact_person, coverage_note: a.coverage_note, registration_no: a.registration_no,
        lat: a.lat === null ? null : Number(a.lat), lng: a.lng === null ? null : Number(a.lng),
      },
      heads: heads.rows.map((h) => ({ id: h.user_id, display_name: h.display_name })),
    };
  }

  /**
   * แก้ข้อมูลหน่วยงาน — ส่งมาเฉพาะที่เปลี่ยน · ค่าว่าง ('') = ล้าง (ยกเว้น contact) · พิกัด lat/lng ต้องมาคู่กัน (null ทั้งคู่ = ล้างหมุด)
   */
  async updateProfile(agencyId: string, patch: AgencyProfilePatch): Promise<void> {
    const cols = ['contact', 'address', 'subdistrict', 'district', 'province', 'postal_code', 'phone', 'email', 'contact_person', 'coverage_note'] as const;
    const sets: string[] = [];
    const params: unknown[] = [agencyId];
    for (const col of cols) {
      const raw = patch[col];
      if (raw === undefined) continue;
      const val = raw === '' || raw === null ? null : String(raw);
      if (col === 'contact' && val === null) continue; // ช่องทางติดต่อห้ามว่าง
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    }
    if (patch.lat !== undefined || patch.lng !== undefined) {
      const both = patch.lat != null && patch.lng != null;
      const none = patch.lat == null && patch.lng == null;
      if (!both && !none) throw new AppError(HttpStatus.BAD_REQUEST, 'PIN_INVALID', 'lat and lng must be given together');
      params.push(none ? null : patch.lat, none ? null : patch.lng);
      sets.push(`lat = $${params.length - 1}`, `lng = $${params.length}`);
    }
    if (!sets.length) return;
    await this.pool.query(`UPDATE app.agency_tb SET ${sets.join(', ')} WHERE agency_id = $1`, params);
  }

  /** แสดงบนแผนที่ของเจ้าของบ้าน — เฉพาะหน่วยงานที่อนุมัติแล้วและตั้งหมุดไว้ · เป็นข้อมูลที่หน่วยงานตั้งใจเปิดเผย (ไม่มีข้อมูลสมาชิก/ตู้) */
  async publicMap(): Promise<AgencyMapItem[]> {
    const { rows } = await this.pool.query<{
      agency_id: string;
      name: string;
      type: string;
      address: string | null;
      subdistrict: string | null;
      district: string | null;
      province: string | null;
      phone: string | null;
      contact: string | null;
      coverage_note: string | null;
      lat: string;
      lng: string;
    }>(
      `SELECT a.agency_id, a.name, a.type, a.address, a.subdistrict, a.district, a.province, a.phone, a.contact, a.coverage_note, a.lat, a.lng
       FROM app.agency_tb a
       WHERE a.status = 'approved' AND a.lat IS NOT NULL AND a.lng IS NOT NULL
       ORDER BY a.name LIMIT 500`,
    );
    return rows.map((r) => ({
      id: r.agency_id,
      name: r.name,
      type: r.type,
      address: r.address,
      locality: [r.subdistrict, r.district, r.province].filter(Boolean).join(' ') || null,
      phone: r.phone,
      contact: r.contact,
      coverage_note: r.coverage_note,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }));
  }

  /** แก้ช่องทางติดต่อของหน่วยงาน (แสดงให้คนที่ขอเข้า) */
  async setContact(agencyId: string, contact: string): Promise<{ contact: string }> {
    await this.pool.query(`UPDATE app.agency_tb SET contact = $2 WHERE agency_id = $1`, [agencyId, contact]);
    return { contact };
  }

  /** รหัสใหม่ — รหัสเก่าใช้สมัครไม่ได้ (คนที่สมัครไปแล้วไม่กระทบ) */
  async rotateGroupCode(agencyId: string): Promise<{ group_code: string }> {
    return withTx(this.pool, async (db) => ({ group_code: await assignGroupCode(db, agencyId) }));
  }

  async listMembers(agencyId: string, status?: MemberStatus): Promise<MemberDto[]> {
    const { rows } = await this.pool.query<{
      user_id: string;
      name: string;
      display_name: string;
      phone: string;
      status: MemberStatus;
      is_head: boolean;
      position: string | null;
      staff_no: string | null;
      created_date: Date;
      zones: { id: string; name: string }[];
    }>(
      `SELECT u.user_id, u.name, u.display_name, u.phone, m.status, m.is_head, m.position, m.staff_no, m.created_date,
              COALESCE((
                SELECT json_agg(json_build_object('id', z.zone_id, 'name', z.name) ORDER BY z.name)
                FROM app.zone_officer_tb zo JOIN app.zone_tb z ON z.zone_id = zo.zone_id
                WHERE zo.user_id = m.user_id AND z.agency_id = m.agency_id AND z.deleted_date IS NULL
              ), '[]') AS zones
       FROM app.agency_member_tb m JOIN app.user_tb u ON u.user_id = m.user_id
       WHERE m.agency_id = $1 AND u.deleted_date IS NULL
         AND (CASE WHEN $2::text IS NULL THEN m.status <> 'rejected' ELSE m.status = $2 END)
       ORDER BY (m.status = 'pending') DESC, m.is_head DESC, m.created_date`,
      [agencyId, status ?? null],
    );
    return rows.map((r) => ({
      id: r.user_id,
      name: r.name,
      display_name: r.display_name,
      phone: r.phone,
      status: r.status,
      is_head: r.is_head,
      position: r.position ?? '',
      staff_no: r.staff_no ?? '',
      zones: r.zones,
      joined_at: r.created_date.toISOString(),
      last_inspection_at: null, // มีเมื่อทำการตรวจตู้ (เฟส 3)
    }));
  }

  async approve(agencyId: string, headId: string, memberId: string): Promise<void> {
    const agencyName = await withTx(this.pool, async (db) => {
      const t = await this.target(db, agencyId, memberId);
      if (t.status !== 'pending') throw notPending();
      await db.query(
        `UPDATE app.agency_member_tb SET status = 'active', decided_by = $3, decided_date = now()
         WHERE agency_id = $1 AND user_id = $2`,
        [agencyId, memberId, headId],
      );
      await this.account.grantRole(db, memberId, 'officer', { grantedBy: headId, status: 'active' });
      return this.agencyName(db, agencyId);
    });
    await this.notifications.notify([memberId], { type: 'member_approved', data: { agency_name: agencyName }, link: '/' });
    await this.audit.log(headId, 'agency.member.approve', 'user', memberId, { agency_id: agencyId });
  }

  async reject(agencyId: string, headId: string, memberId: string): Promise<void> {
    const agencyName = await withTx(this.pool, async (db) => {
      const t = await this.target(db, agencyId, memberId);
      if (t.status !== 'pending') throw notPending();
      await db.query(
        `UPDATE app.agency_member_tb SET status = 'rejected', decided_by = $3, decided_date = now()
         WHERE agency_id = $1 AND user_id = $2`,
        [agencyId, memberId, headId],
      );
      await this.account.bumpPerm(db, memberId);
      return this.agencyName(db, agencyId);
    });
    await this.notifications.notify([memberId], { type: 'member_rejected', data: { agency_name: agencyName }, link: '/' });
    await this.audit.log(headId, 'agency.member.reject', 'user', memberId, { agency_id: agencyId });
  }

  /**
   * ปิด/เปิดสิทธิ์เจ้าหน้าที่
   * ปิด = หยุดใช้งานเจ้าหน้าที่ทันที (สิทธิ์เช็กจากฐานข้อมูลทุกคำขอ) + ถอดออกจากทุกโซน + ถอดหัวหน้า
   * ไม่เตะ session — ถ้าคนนั้นเป็นเจ้าของบ้านด้วย บทบาทเจ้าของบ้านต้องใช้ต่อได้
   */
  async setActive(agencyId: string, headId: string, memberId: string, active: boolean): Promise<void> {
    if (memberId === headId) throw cannotChangeSelf();
    await withTx(this.pool, async (db) => {
      const t = await this.target(db, agencyId, memberId);
      if (active) {
        if (t.status !== 'disabled') throw notInState('disabled');
        await db.query(`UPDATE app.agency_member_tb SET status = 'active' WHERE agency_id = $1 AND user_id = $2`, [
          agencyId,
          memberId,
        ]);
        await this.account.grantRole(db, memberId, 'officer', { grantedBy: headId, status: 'active' });
      } else {
        if (t.status !== 'active') throw notInState('active');
        await db.query(
          `UPDATE app.agency_member_tb SET status = 'disabled', is_head = false WHERE agency_id = $1 AND user_id = $2`,
          [agencyId, memberId],
        );
        await db.query(`UPDATE app.user_role_tb SET status = 'disabled' WHERE user_id = $1 AND role = 'officer'`, [
          memberId,
        ]);
        await db.query(
          `DELETE FROM app.zone_officer_tb zo USING app.zone_tb z
           WHERE zo.zone_id = z.zone_id AND z.agency_id = $1 AND zo.user_id = $2`,
          [agencyId, memberId],
        );
        await this.account.bumpPerm(db, memberId);
      }
    });
    await this.audit.log(headId, 'agency.member.status', 'user', memberId, { agency_id: agencyId, active });
  }

  async makeHead(agencyId: string, memberId: string): Promise<void> {
    await withTx(this.pool, async (db) => {
      const t = await this.target(db, agencyId, memberId);
      if (t.status !== 'active') throw notInState('active');
      if (t.is_head) return;
      await db.query(`UPDATE app.agency_member_tb SET is_head = true WHERE agency_id = $1 AND user_id = $2`, [
        agencyId,
        memberId,
      ]);
      await this.account.bumpPerm(db, memberId);
    });
  }

  async removeHead(agencyId: string, headId: string, memberId: string): Promise<void> {
    if (memberId === headId) throw cannotChangeSelf();
    await withTx(this.pool, async (db) => {
      // ล็อกหัวหน้าทุกคนของหน่วยงาน — กันสองคนถอดกันพร้อมกันจนไม่เหลือหัวหน้า
      const { rows: heads } = await db.query<{ user_id: string }>(
        `SELECT user_id FROM app.agency_member_tb WHERE agency_id = $1 AND is_head AND status = 'active' FOR UPDATE`,
        [agencyId],
      );
      const t = await this.target(db, agencyId, memberId);
      if (!t.is_head) return;
      if (heads.length <= 1) throw new AppError(HttpStatus.CONFLICT, 'LAST_HEAD', 'an agency needs at least one head');
      await db.query(`UPDATE app.agency_member_tb SET is_head = false WHERE agency_id = $1 AND user_id = $2`, [
        agencyId,
        memberId,
      ]);
      await this.account.bumpPerm(db, memberId);
    });
    await this.audit.log(headId, 'agency.head.remove', 'user', memberId, { agency_id: agencyId });
  }

  /**
   * หัวหน้ารีเซ็ตรหัสลูกทีมได้ — เฉพาะบัญชีที่เป็นเจ้าหน้าที่อย่างเดียว
   * ถ้าคนนั้นเป็นเจ้าของบ้าน/หัวหน้าด้วย → ให้แอดมินทำ (ไม่งั้นหัวหน้าได้รหัสเข้าไปดูตู้ที่บ้านเขา)
   */
  async resetPassword(agencyId: string, headId: string, memberId: string): Promise<{ temp_password: string }> {
    if (memberId === headId) throw cannotChangeSelf();
    const out = await withTx(this.pool, async (db) => {
      const t = await this.target(db, agencyId, memberId);
      if (t.status === 'pending' || t.status === 'rejected') throw new NotFoundException();
      const { rows } = await db.query(
        `SELECT 1 FROM app.user_role_tb WHERE user_id = $1 AND role <> 'officer'`,
        [memberId],
      );
      if (t.is_head || rows.length) {
        throw new AppError(HttpStatus.FORBIDDEN, 'RESET_NEEDS_ADMIN', 'ask an admin to reset this account');
      }
      return { temp_password: await this.account.resetPassword(db, memberId) };
    });
    await this.audit.log(headId, 'agency.member.reset_password', 'user', memberId, { agency_id: agencyId });
    return out;
  }

  /** สมาชิกในหน่วยงานนี้ (ล็อกแถวไว้) — ไม่ใช่ → 404 */
  private async target(db: Db, agencyId: string, userId: string): Promise<Target> {
    const { rows } = await db.query<Target>(
      `SELECT user_id, status, is_head FROM app.agency_member_tb WHERE agency_id = $1 AND user_id = $2 FOR UPDATE`,
      [agencyId, userId],
    );
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }

  private async agencyName(db: Db, agencyId: string): Promise<string> {
    const { rows } = await db.query<{ name: string }>(`SELECT name FROM app.agency_tb WHERE agency_id = $1`, [agencyId]);
    return rows[0].name;
  }
}

const notPending = () => new AppError(HttpStatus.CONFLICT, 'MEMBER_NOT_PENDING', 'this request was already decided');
const notInState = (expected: string) =>
  new AppError(HttpStatus.CONFLICT, 'MEMBER_STATE_INVALID', `member must be ${expected} for this action`);
