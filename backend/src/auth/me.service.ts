import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';
import type { Db } from '../db/tx.js';
import type { RequiredRole } from './auth.decorators.js';
import { AccessService } from './access.service.js';
import { TermsService } from './terms.service.js';

/** api.md §4.5 `PlanInfo` — แพ็กเกจปัจจุบันของบัญชีเจ้าของบ้าน */
export interface PlanInfo {
  code: string;
  /** แปลตามภาษาที่เลือกไว้กับบัญชี */
  name: string;
  price_note: string | null;
  status: 'active' | 'expiring' | 'expired' | 'none';
  starts_at: string | null;
  ends_at: string | null;
  features: Record<string, number | boolean>;
}

/** เหลือกี่วันถึงเรียกว่า "ใกล้หมดอายุ" */
export const PLAN_EXPIRING_DAYS = 7;

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
  /** contact = ช่องทางที่หน่วยงานกรอกตอนสมัคร (ตั้งใจเปิดเผย) */
  agency: { id: string; name: string; type: string; is_head: boolean; contact: string | null } | null;
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

  /**
   * แพ็กเกจปัจจุบัน = แถวที่คลุมเวลาตอนนี้ · ไม่มี → ใช้แถวล่าสุดที่หมดอายุแล้ว (`expired`) · ไม่เคยมีเลย → `none`
   * SOS และการตรวจตู้ไม่ขึ้นกับแพ็กเกจ (design §0 ข้อ 9)
   */
  async plan(userId: string): Promise<PlanInfo> {
    const { rows } = await this.pool.query<{
      plan_code: string;
      name_th: string;
      name_en: string;
      price_note: string | null;
      features: Record<string, number | boolean>;
      start_date: Date;
      end_date: Date | null;
      lang: string | null;
      current: boolean;
    }>(
      `SELECT p.plan_code, p.name_th, p.name_en, p.price_note, p.features, up.start_date, up.end_date, u.prefs->>'lang' AS lang,
              (up.start_date <= now() AND (up.end_date IS NULL OR up.end_date > now())) AS current
       FROM app.user_plan_tb up
       JOIN app.plan_tb p ON p.plan_code = up.plan_code
       JOIN app.user_tb u ON u.user_id = up.user_id
       WHERE up.user_id = $1 AND up.start_date <= now()
       ORDER BY (up.end_date IS NULL OR up.end_date > now()) DESC, up.start_date DESC
       LIMIT 1`,
      [userId],
    );
    const r = rows[0];
    if (!r) return { code: '', name: '', price_note: null, status: 'none', starts_at: null, ends_at: null, features: {} };
    const left = r.end_date ? r.end_date.getTime() - Date.now() : null;
    const status: PlanInfo['status'] = !r.current ? 'expired' : left !== null && left <= PLAN_EXPIRING_DAYS * 86_400_000 ? 'expiring' : 'active';
    return {
      code: r.plan_code,
      name: r.lang === 'en' ? r.name_en : r.name_th,
      price_note: r.price_note,
      status,
      starts_at: r.start_date.toISOString(),
      ends_at: r.end_date?.toISOString() ?? null,
      features: r.features,
    };
  }

  /** แก้ชื่อที่แสดง / การแสดงผล — prefs รวมกับของเดิม (ส่งมาเฉพาะที่เปลี่ยน) · คืน Me ใหม่ */
  async update(userId: string, patch: { display_name?: string; prefs?: Partial<Prefs> }, sessionId?: string): Promise<Me> {
    const prefs = Object.fromEntries(Object.entries(patch.prefs ?? {}).filter(([, v]) => v !== undefined));
    await this.pool.query(
      `UPDATE app.user_tb SET prefs = prefs || $2::jsonb, display_name = coalesce($3, display_name) WHERE user_id = $1`,
      [userId, JSON.stringify(prefs), patch.display_name ?? null],
    );
    return this.build(userId, undefined, sessionId);
  }

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
        ? { id: access.agency.id, name: access.agency.name, type: access.agency.type, is_head: access.agency.isHead, contact: access.agency.contact }
        : null,
      prefs: { ...DEFAULT_PREFS, ...u.prefs },
      push: { subscribed },
      must_change_password: u.must_change_password,
      terms_update_required: termsUpdateRequired,
      perm_version: u.perm_version,
    };
  }
}
