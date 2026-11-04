import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import { isPgError, PG_CHECK_VIOLATION, PG_UNIQUE_VIOLATION, withTx, type Db } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';
import { COUNTER_STORE, type CounterStore } from '../rate-limit/rate-limit.store.js';
import type {
  AddOwnerRoleDto,
  ChangePasswordDto,
  JoinAgencyDto,
  SigninDto,
  SignupAgencyDto,
  SignupOfficerDto,
  SignupOwnerDto,
} from './auth.dto.js';
import { AccountService, adminExclusive } from './account.service.js';
import { MeService, type Me } from './me.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TermsService } from './terms.service.js';

/** 💡 ผิดติดกัน 5 ครั้งใน 15 นาที → ล็อก 15 นาที (api.md §0 ยังไม่ได้ตกลงตัวเลข) */
export const LOCK_MAX_FAILS = 5;
export const LOCK_WINDOW_SEC = 15 * 60;

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
  /** รหัสเครื่องที่เว็บสุ่มเก็บไว้ (header X-Device-Id) — ใช้เทียบว่าเป็นเครื่องใหม่ไหม · ไม่บังคับ */
  deviceId?: string;
}

export interface SessionResult {
  token: string;
  me: Me;
}

/** ชื่อเครื่องแบบคร่าว ๆ จาก User-Agent (ไว้แสดงในแจ้งเตือน) */
export function deviceLabel(ua: string | null): string {
  if (!ua) return 'unknown device';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'other';
  const br = /EdgA?\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${os} · ${br}`;
}

/** ข้อมูลบ้านที่ละเอียดขึ้นจาก DTO (api.md §2.1) */
export interface HouseProfile {
  address_line?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  lat?: number;
  lng?: number;
  emergency_name?: string;
  emergency_phone?: string;
}

/** ลำดับตรงกับคอลัมน์: address_line, subdistrict, district, province, house_lat, house_lng, emergency_name, emergency_phone */
const profileParams = (p: HouseProfile) => [
  p.address_line ?? null,
  p.subdistrict ?? null,
  p.district ?? null,
  p.province ?? null,
  p.lat ?? null,
  p.lng ?? null,
  p.emergency_name ?? null,
  p.emergency_phone ?? null,
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(COUNTER_STORE) private readonly counters: CounterStore,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly terms: TermsService,
    private readonly me: MeService,
    private readonly account: AccountService,
    private readonly notifications: NotificationService,
  ) {}

  // ── สมัคร ────────────────────────────────────────────────────────────────

  /** เจ้าของบ้าน: บัญชี + บทบาท owner + แพ็ก free + ยอมรับข้อตกลง ใน transaction เดียว */
  async signupOwner(dto: SignupOwnerDto, meta: ClientMeta): Promise<SessionResult> {
    const hash = await this.passwords.hash(dto.password);
    return withTx(this.pool, async (db) => {
      await this.terms.assertCurrent(db, dto.terms_version);
      const userId = await this.insertUser(db, { name: dto.name, phone: dto.phone, houseNo: dto.house_no, area: dto.area, profile: dto, hash });
      await db.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'owner')`, [userId]);
      await this.account.giveDefaultPlan(db, userId);
      await this.terms.accept(db, userId, dto.terms_version, meta);
      return this.startSession(db, userId, meta);
    });
  }

  /** เจ้าหน้าที่: บัญชี + คำขอเข้าหน่วยงาน (pending) · ยังไม่มีบทบาท officer จนหัวหน้าอนุมัติ */
  async signupOfficer(dto: SignupOfficerDto, meta: ClientMeta): Promise<SessionResult> {
    const hash = await this.passwords.hash(dto.password);
    const { result, agencyId } = await withTx(this.pool, async (db) => {
      await this.terms.assertCurrent(db, dto.terms_version);
      const agencyId = await this.findAgencyByGroupCode(db, dto.group_code);
      const userId = await this.insertUser(db, { name: dto.name, phone: dto.phone, hash });
      await db.query(`INSERT INTO app.agency_member_tb (agency_id, user_id, position, staff_no) VALUES ($1, $2, $3, $4)`, [
        agencyId,
        userId,
        dto.position ?? null,
        dto.staff_no ?? null,
      ]);
      await this.terms.accept(db, userId, dto.terms_version, meta);
      return { result: await this.startSession(db, userId, meta), agencyId };
    });
    await this.notifyHeads(agencyId, dto.name);
    return result;
  }

  /** หน่วยงาน: หน่วยงาน (pending) + หัวหน้าคนแรก · บทบาท officer ได้ตอนแอดมินอนุมัติ */
  async signupAgency(dto: SignupAgencyDto, meta: ClientMeta): Promise<SessionResult> {
    const hash = await this.passwords.hash(dto.head.password);
    const result = await withTx(this.pool, async (db) => {
      await this.terms.assertCurrent(db, dto.terms_version);
      const userId = await this.insertUser(db, { name: dto.head.name, phone: dto.head.phone, hash });
      const { rows } = await db.query<{ agency_id: string }>(
        `INSERT INTO app.agency_tb (name, type, contact, address, registration_no) VALUES ($1, $2, $3, $4, $5) RETURNING agency_id`,
        [dto.agency.name, dto.agency.type, dto.agency.contact, dto.agency.address ?? null, dto.agency.registration_no ?? null],
      );
      await db.query(`INSERT INTO app.agency_member_tb (agency_id, user_id, is_head) VALUES ($1, $2, true)`, [
        rows[0].agency_id,
        userId,
      ]);
      await this.terms.accept(db, userId, dto.terms_version, meta);
      return this.startSession(db, userId, meta);
    });
    const { rows: admins } = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM app.user_role_tb WHERE role = 'admin' AND status = 'active'`,
    );
    await this.notifications.notify(
      admins.map((a) => a.user_id),
      { type: 'agency_pending', data: { agency_name: dto.agency.name }, link: '/admin/agencies' },
    );
    return result;
  }

  // ── เพิ่มบทบาทให้บัญชีที่มีอยู่ (1 เบอร์หลายบทบาท) ─────────────────────────

  async addOwnerRole(userId: string, sessionId: string, dto: AddOwnerRoleDto, meta: ClientMeta): Promise<Me> {
    return withTx(this.pool, async (db) => {
      await this.terms.assertCurrent(db, dto.terms_version);
      await this.lockUser(db, userId);
      try {
        await db.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'owner')`, [userId]);
      } catch (err) {
        if (isPgError(err, PG_UNIQUE_VIOLATION)) throw roleExists();
        if (isPgError(err, PG_CHECK_VIOLATION, 'admin_exclusive')) throw adminExclusive();
        throw err;
      }
      await db.query(
        `UPDATE app.user_tb SET house_no = $2, area = coalesce($3, area),
           address_line = $4, subdistrict = $5, district = $6, province = $7, house_lat = $8, house_lng = $9,
           emergency_name = $10, emergency_phone = $11, perm_version = perm_version + 1
         WHERE user_id = $1`,
        [userId, dto.house_no, dto.area ?? null, ...profileParams(dto)],
      );
      await this.account.giveDefaultPlan(db, userId);
      await this.terms.accept(db, userId, dto.terms_version, meta);
      return this.me.build(userId, db, sessionId);
    });
  }

  async joinAgency(userId: string, sessionId: string, dto: JoinAgencyDto, meta: ClientMeta): Promise<Me> {
    const { me, agencyId } = await withTx(this.pool, async (db) => {
      await this.terms.assertCurrent(db, dto.terms_version);
      await this.lockUser(db, userId);
      const { rows: admin } = await db.query(
        `SELECT 1 FROM app.user_role_tb WHERE user_id = $1 AND role = 'admin'`,
        [userId],
      );
      if (admin.length) throw adminExclusive();

      const { rows: member } = await db.query<{ status: string }>(
        `SELECT status FROM app.agency_member_tb WHERE user_id = $1`,
        [userId],
      );
      if (member[0] && member[0].status !== 'rejected') throw roleExists();
      const agencyId = await this.findAgencyByGroupCode(db, dto.group_code);
      // เคยถูกปฏิเสธ → ขอใหม่ได้ (1 คน 1 หน่วยงาน — แทนแถวเดิม)
      if (member[0]) await db.query(`DELETE FROM app.agency_member_tb WHERE user_id = $1`, [userId]);
      await db.query(`INSERT INTO app.agency_member_tb (agency_id, user_id, position, staff_no) VALUES ($1, $2, $3, $4)`, [
        agencyId,
        userId,
        dto.position ?? null,
        dto.staff_no ?? null,
      ]);
      await db.query(`UPDATE app.user_tb SET perm_version = perm_version + 1 WHERE user_id = $1`, [userId]);
      await this.terms.accept(db, userId, dto.terms_version, meta);
      return { me: await this.me.build(userId, db, sessionId), agencyId };
    });
    const { rows } = await this.pool.query<{ name: string }>(`SELECT name FROM app.user_tb WHERE user_id = $1`, [userId]);
    await this.notifyHeads(agencyId, rows[0].name);
    return me;
  }

  /** มีคนขอเข้าหน่วยงาน → แจ้งหัวหน้าทุกคน (หลัง commit) */
  private async notifyHeads(agencyId: string, memberName: string): Promise<void> {
    const { rows } = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM app.agency_member_tb WHERE agency_id = $1 AND is_head AND status = 'active'`,
      [agencyId],
    );
    await this.notifications.notify(
      rows.map((r) => r.user_id),
      { type: 'member_pending', data: { name: memberName }, link: '/agency/members' },
    );
  }

  // ── ล็อกอิน / เปลี่ยนรหัส ──────────────────────────────────────────────

  async signin(dto: SigninDto, meta: ClientMeta): Promise<SessionResult> {
    const { rows } = await this.pool.query<{ user_id: string; password_hash: string; status: string }>(
      `SELECT user_id, password_hash, status FROM app.user_tb WHERE phone = $1 AND deleted_date IS NULL`,
      [dto.phone],
    );
    const user = rows[0];

    // ล็อกอยู่ → ไม่ตรวจรหัสเลย (กันเดารหัสต่อระหว่างล็อก)
    if (user && (await this.failCount(user.user_id)) >= LOCK_MAX_FAILS) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'ACCOUNT_LOCKED', 'too many failed attempts, try again later');
    }
    // ไม่เจอเบอร์ก็ verify กับ hash หลอก → เวลาตอบเท่ากัน เดาไม่ได้ว่าเบอร์ไหนมีบัญชี
    const ok = await this.passwords.verify(user?.password_hash ?? null, dto.password);
    if (!user || !ok) {
      if (user) await this.recordFail(user.user_id);
      throw invalidCredentials();
    }
    // บอกว่าบัญชีถูกปิดเฉพาะคนที่รู้รหัสถูก
    if (user.status === 'disabled') {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'ACCOUNT_DISABLED', 'account disabled');
    }
    await this.resetFails(user.user_id);
    const result = await this.startSession(this.pool, user.user_id, meta);
    await this.checkDevice(user.user_id, meta).catch(() => undefined);
    return result;
  }

  /**
   * ✅ 2026-11-04 กันการสแกนแทนกัน: เจ้าหน้าที่เข้าสู่ระบบจากเครื่องที่ไม่เคยเห็น → แจ้งหัวหน้าทุกคนของหน่วยงาน (และตัวเจ้าหน้าที่)
   * เครื่องแรกของบัญชีไม่แจ้ง · ไม่ส่งรหัสเครื่อง = ข้าม · เก็บแค่ hash
   */
  private async checkDevice(userId: string, meta: ClientMeta): Promise<void> {
    const id = meta.deviceId?.trim();
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) return;
    const hash = createHash('sha256').update(id).digest('hex');
    const ua = meta.userAgent?.slice(0, 300) ?? null;
    const { rows: known } = await this.pool.query<{ n: number; seen: boolean }>(
      `SELECT count(*)::int AS n, bool_or(device_hash = $2) AS seen FROM app.user_device_tb WHERE user_id = $1`,
      [userId, hash],
    );
    await this.pool.query(
      `INSERT INTO app.user_device_tb (user_id, device_hash, user_agent) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, device_hash) DO UPDATE SET last_seen_date = now(), user_agent = EXCLUDED.user_agent`,
      [userId, hash, ua],
    );
    if (known[0].seen || known[0].n === 0) return;
    const { rows: m } = await this.pool.query<{ agency_id: string; name: string }>(
      `SELECT m.agency_id, u.display_name AS name FROM app.agency_member_tb m JOIN app.user_tb u ON u.user_id = m.user_id
       WHERE m.user_id = $1 AND m.status = 'active'`,
      [userId],
    );
    if (!m[0]) return;
    const { rows: heads } = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM app.agency_member_tb WHERE agency_id = $1 AND is_head AND status = 'active'`,
      [m[0].agency_id],
    );
    await this.notifications.notify([...heads.map((h) => h.user_id), userId], {
      type: 'officer_new_device',
      data: { officer_name: m[0].name, device: deviceLabel(ua) },
      link: '/agency/members',
    });
  }

  /** สำเร็จ = เตะทุก session รวมเครื่องนี้ (api.md §2) */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    if ((await this.failCount(userId)) >= LOCK_MAX_FAILS) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'ACCOUNT_LOCKED', 'too many failed attempts, try again later');
    }
    const { rows } = await this.pool.query<{ password_hash: string }>(
      `SELECT password_hash FROM app.user_tb WHERE user_id = $1`,
      [userId],
    );
    if (!(await this.passwords.verify(rows[0]?.password_hash ?? null, dto.current_password))) {
      await this.recordFail(userId);
      throw invalidCredentials();
    }
    await this.resetFails(userId);
    const hash = await this.passwords.hash(dto.new_password);
    await withTx(this.pool, async (db) => {
      await db.query(
        `UPDATE app.user_tb SET password_hash = $2, must_change_password = false WHERE user_id = $1`,
        [userId, hash],
      );
      await this.sessions.revokeAll(db, userId);
    });
  }

  // ── ตัวช่วย ────────────────────────────────────────────────────────────

  private async insertUser(
    db: Db,
    u: { name: string; phone: string; houseNo?: string; area?: string; profile?: HouseProfile; hash: string },
  ): Promise<string> {
    try {
      const { rows } = await db.query<{ user_id: string }>(
        `INSERT INTO app.user_tb (phone, name, display_name, house_no, area, password_hash,
           address_line, subdistrict, district, province, house_lat, house_lng, emergency_name, emergency_phone)
         VALUES ($1, $2, $2, $3, $5, $4, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING user_id`,
        [u.phone, u.name, u.houseNo ?? null, u.hash, u.area ?? null, ...profileParams(u.profile ?? {})],
      );
      return rows[0].user_id;
    } catch (err) {
      if (isPgError(err, PG_UNIQUE_VIOLATION, 'user_tb_phone_key')) {
        throw new AppError(HttpStatus.CONFLICT, 'PHONE_TAKEN', 'phone already registered — sign in and add a role');
      }
      throw err;
    }
  }

  private async findAgencyByGroupCode(db: Db, groupCode: string): Promise<string> {
    const { rows } = await db.query<{ agency_id: string }>(
      `SELECT agency_id FROM app.agency_tb WHERE group_code = $1 AND status = 'approved'`,
      [groupCode],
    );
    if (!rows[0]) throw new AppError(HttpStatus.NOT_FOUND, 'GROUP_CODE_INVALID', 'group code not found');
    return rows[0].agency_id;
  }

  /** กันคำขอเพิ่มบทบาทของคนเดียวกันซ้อนกัน */
  private async lockUser(db: Db, userId: string): Promise<void> {
    await db.query(`SELECT 1 FROM app.user_tb WHERE user_id = $1 FOR UPDATE`, [userId]);
  }

  private async startSession(db: Db, userId: string, meta: ClientMeta): Promise<SessionResult> {
    const { token, sessionId } = await this.sessions.create(db, userId, meta);
    return { token, me: await this.me.build(userId, db, sessionId) };
  }

  private failKey = (userId: string) => `authfail:${userId}`;

  private async failCount(userId: string): Promise<number> {
    try {
      return await this.counters.get(this.failKey(userId));
    } catch (err) {
      this.logger.warn(`lockout store unavailable: ${(err as Error).message}`);
      return 0;
    }
  }

  private async recordFail(userId: string): Promise<void> {
    await this.counters.hit(this.failKey(userId), LOCK_WINDOW_SEC).catch((err: Error) => {
      this.logger.warn(`lockout store unavailable: ${err.message}`);
    });
  }

  private async resetFails(userId: string): Promise<void> {
    await this.counters.reset(this.failKey(userId)).catch(() => undefined);
  }
}

const invalidCredentials = () =>
  new AppError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'phone or password is incorrect');
const roleExists = () => new AppError(HttpStatus.CONFLICT, 'ROLE_EXISTS', 'role already exists');
