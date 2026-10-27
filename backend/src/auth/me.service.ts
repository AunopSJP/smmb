import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import type { Db } from '../db/tx.js';
import type { RequiredRole } from './auth.decorators.js';
import { AccessService } from './access.service.js';
import { TermsService } from './terms.service.js';

export interface Prefs {
  theme: 'light' | 'dark' | 'system';
  lang: 'th' | 'en';
  text_size: 'normal' | 'large' | 'xlarge';
  simple_home: boolean;
  night_auto_dark: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  lang: 'th',
  text_size: 'normal',
  simple_home: false,
  night_auto_dark: true,
};

/** api.md §2 `Me` — ชื่อฟิลด์ของ API ไม่ใช่ชื่อคอลัมน์ */
export interface Me {
  id: string;
  roles: RequiredRole[];
  levels: Partial<Record<'owner' | 'officer' | 'admin', number>>;
  status: 'active' | 'disabled';
  agency_status: 'pending' | 'active' | 'rejected' | 'disabled' | null;
  name: string;
  display_name: string;
  phone: string;
  agency: { id: string; name: string; type: string; is_head: boolean } | null;
  prefs: Prefs;
  push: { subscribed: boolean };
  must_change_password: boolean;
  /** ข้อตกลงเปลี่ยนแล้วยังไม่กดยอมรับ → client ไปหน้า A13 (route อื่นตอบ 403 TERMS_UPDATE_REQUIRED) */
  terms_update_required: boolean;
  perm_version: number;
}

const ROLE_ORDER: RequiredRole[] = ['owner', 'officer', 'head', 'admin'];

@Injectable()
export class MeService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly access: AccessService,
    private readonly terms: TermsService,
  ) {}

  /** sessionId = เครื่องที่ถาม (ใช้ตอบ push.subscribed ของเครื่องนี้) */
  async build(userId: string, db: Db = this.pool, sessionId?: string): Promise<Me> {
    // ระบุคอลัมน์ทีละตัว — ห้าม SELECT * (CLAUDE.md กฎข้อ 12)
    const { rows } = await db.query<{
      user_id: string;
      status: 'active' | 'disabled';
      name: string;
      display_name: string;
      phone: string;
      prefs: Partial<Prefs>;
      must_change_password: boolean;
      perm_version: number;
    }>(
      `SELECT user_id, status, name, display_name, phone, prefs, must_change_password, perm_version
       FROM app.user_tb WHERE user_id = $1 AND deleted_date IS NULL`,
      [userId],
    );
    const u = rows[0];
    if (!u) throw new Error(`user ${userId} not found`);
    const access = await this.access.load(userId, db);
    const termsUpdateRequired = await this.terms.needsAcceptance(db, userId);
    const subscribed = sessionId
      ? (
          await db.query(`SELECT 1 FROM app.push_subscription_tb WHERE session_id = $1 LIMIT 1`, [sessionId])
        ).rows.length > 0
      : false;

    // เจ้าหน้าที่ที่หน่วยงานยังไม่อนุมัติ/ถูกปฏิเสธ → แสดงตามสถานะหน่วยงาน (L02 / L02-b)
    let agencyStatus: Me['agency_status'] = null;
    if (access.agency) {
      const { agencyStatus: as, membershipStatus: ms } = access.agency;
      agencyStatus = as === 'rejected' ? 'rejected' : as === 'pending' ? 'pending' : ms;
    }

    return {
      id: u.user_id,
      roles: ROLE_ORDER.filter((r) => access.roles.has(r)),
      levels: access.levels,
      status: u.status,
      agency_status: agencyStatus,
      name: u.name,
      display_name: u.display_name,
      phone: u.phone,
      agency: access.agency
        ? { id: access.agency.id, name: access.agency.name, type: access.agency.type, is_head: access.agency.isHead }
        : null,
      prefs: { ...DEFAULT_PREFS, ...u.prefs },
      push: { subscribed },
      must_change_password: u.must_change_password,
      terms_update_required: termsUpdateRequired,
      perm_version: u.perm_version,
    };
  }
}
