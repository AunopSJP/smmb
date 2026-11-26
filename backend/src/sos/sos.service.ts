import { HttpStatus, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';
import { withTx, type Db } from '../db/tx.js';
import { NotificationService } from '../push/notification.service.js';

/** ขั้นละกี่วินาที (✅ design §7): 0 วิ โซน → 30 วิ ทุกคนในหน่วยงาน → 60 วิ ให้โทร 191/1669 เอง */
export const STAGE_SECONDS = 30;
/** ตรวจเลื่อนขั้นทุกกี่วินาที (คิดจาก stage_changed_date ในฐานข้อมูล — restart แล้วยังเดินต่อถูก) */
export const ESCALATE_EVERY_MS = 5_000;
/** ยังไม่มีคนรับ → ส่งแจ้งเตือนซ้ำทุก 1 นาที ถึงนาทีที่ 10 ของรอบ (รอบเริ่มที่ repeat_start_date) */
export const REPEAT_SECONDS = 60;
export const REPEAT_LIMIT = 10;
/** นาทีสุดท้ายยังส่งได้ถ้าตัวจับเวลามาช้าไม่เกินเท่านี้ — เลยกว่านี้ถือว่าจบรอบ */
const REPEAT_GRACE_SECONDS = 30;

export type SosStage = 'zone' | 'agency' | 'call_yourself';
export type SosStatus = 'open' | 'accepted' | 'closed' | 'cancelled';

/** api.md §7.1 */
export interface SosDto {
  id: string;
  box: { id: string; house_no: string };
  status: SosStatus;
  stage: SosStage;
  created_at: string;
  stage_changed_at: string;
  accepted_by: { display_name: string; agency_name: string; phone: string | null; at: string } | null;
  close_note: string | null;
  /** คืนเรื่องครั้งล่าสุด — มีเฉพาะตอนกลับมารอคนรับ (status = open) */
  returned_at: string | null;
}

/** api.md §7.2 */
export interface SosCardDto {
  id: string;
  status: SosStatus;
  stage: SosStage;
  created_at: string;
  house_no: string;
  /** ✅ เห็นชื่อ + เบอร์เจ้าของบ้านเฉพาะตอน SOS ยังเปิดอยู่ */
  owner: { name: string; phone: string } | null;
  /** ✅ 2026-11-04 ที่อยู่ + หมุดบ้าน — เห็นเฉพาะตอน SOS ยังเปิดอยู่ (กฎเดียวกับเบอร์) · null = ปิดแล้ว/ไม่มีข้อมูล */
  house: {
    address: string;
    area: string;
    location: { lat: number; lng: number } | null;
    /** ✅ 2026-11-06 รายละเอียดบ้านที่เจ้าของกรอก (เฉพาะตอน SOS เปิด · เลือกเฉพาะฟิลด์ที่ช่วยเจ้าหน้าที่ตอนไปถึง) */
    details: { house_type: string | null; village: string | null; residents: number | null; care: string[]; landmark: string | null; emergency_relation: string | null; contact_time: string | null };
  } | null;
  accepted_by: { display_name: string; agency_name: string } | null;
  /** ฉันเป็นคนรับเรื่องนี้ */
  mine: boolean;
  /** เรื่องกลับมารอคนรับหลังมีการคืน (null = ไม่เคยคืน หรือมีคนรับ/จบแล้ว) */
  returned_at: string | null;
  /** ฉันเคยคืนเรื่องนี้ — ยังรับใหม่ได้ แต่ไม่เตือนฉันซ้ำ (ไซเรนในแอปไม่ดัง) */
  returned_by_me: boolean;
}

interface CaseRow {
  sos_case_id: string;
  box_id: string;
  house_no: string | null;
  area: string | null;
  address: string | null;
  lat: string | null;
  lng: string | null;
  owner_user_id: string;
  owner_name: string;
  owner_phone: string;
  owner_profile: Record<string, unknown> | null;
  status: SosStatus;
  stage: SosStage;
  stage_changed_date: Date;
  created_date: Date;
  accepted_by: string | null;
  accepted_name: string | null;
  accepted_phone: string | null;
  accepted_agency: string | null;
  accepted_date: Date | null;
  close_note: string | null;
  returned_date: Date | null;
}

const CASE_SQL = `
  SELECT c.sos_case_id, c.box_id, b.house_no, b.area,
         concat_ws(' ', b.address_line, b.subdistrict, b.district, b.province) AS address, b.lat, b.lng, c.owner_user_id, o.name AS owner_name, o.phone AS owner_phone, o.profile AS owner_profile,
         c.status, c.stage, c.stage_changed_date, c.created_date, c.accepted_by,
         a.display_name AS accepted_name, a.phone AS accepted_phone, ag.name AS accepted_agency, c.accepted_date, c.close_note,
         (SELECT max(r.created_date) FROM app.sos_return_tb r WHERE r.sos_case_id = c.sos_case_id) AS returned_date
  FROM app.sos_case_tb c
  JOIN app.box_tb b ON b.box_id = c.box_id
  JOIN app.user_tb o ON o.user_id = c.owner_user_id
  LEFT JOIN app.user_tb a ON a.user_id = c.accepted_by
  LEFT JOIN app.agency_tb ag ON ag.agency_id = c.accepted_agency_id`;

/** เลือกเฉพาะฟิลด์ที่เจ้าหน้าที่ควรเห็นตอน SOS (ไม่ส่งทั้งก้อน — กฎข้อ 12) */
function houseDetails(p: Record<string, unknown> | null | undefined): NonNullable<SosCardDto['house']>['details'] {
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    house_type: s(p?.house_type),
    village: s(p?.village),
    residents: typeof p?.residents === 'number' ? p.residents : null,
    care: Array.isArray(p?.care) ? (p.care as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    landmark: s(p?.landmark),
    emergency_relation: s(p?.emergency_relation),
    contact_time: s(p?.contact_time),
  };
}

const live = (s: SosStatus) => s === 'open' || s === 'accepted';

/**
 * เงื่อนไข "ยังมีสิทธิ์รับเรื่อง": บัญชี · บทบาทเจ้าหน้าที่ · สมาชิกของหน่วยงานนั้น · หน่วยงาน ยังใช้งานอยู่
 * ย้ายออกจากโซนไม่นับ · ใช้ทั้งตอนเลือกผู้รับแจ้งเตือนและตอนคืนเรื่องอัตโนมัติ — เพิ่มเหตุหมดสิทธิ์ใหม่ที่นี่ที่เดียว
 * (รับได้เฉพาะชื่อคอลัมน์ที่เขียนในโค้ด ห้ามส่งค่าจากผู้ใช้)
 */
const eligibleSql = (userCol: string, agencyCol: string) => `EXISTS (
  SELECT 1 FROM app.user_tb eu
  JOIN app.user_role_tb er ON er.user_id = eu.user_id AND er.role = 'officer' AND er.status = 'active'
  JOIN app.agency_member_tb em ON em.user_id = eu.user_id AND em.status = 'active'
  JOIN app.agency_tb ea ON ea.agency_id = em.agency_id AND ea.status = 'approved'
  WHERE eu.user_id = ${userCol} AND em.agency_id = ${agencyCol} AND eu.status = 'active' AND eu.deleted_date IS NULL)`;

/**
 * SOS (api.md §7 · design §7)
 * - บ้านหลังเดียวอยู่ในโซนของหลายหน่วยงานได้ (✅ 2026-10-28) → ทุกขั้นส่งถึงทุกหน่วยงานที่ดูแลบ้านนี้
 * - ไม่ส่งถึงเจ้าของบ้านเอง (แม้เป็นเจ้าหน้าที่ในโซนนั้น) · คนแรกที่กดรับได้เรื่อง
 * - เบอร์โทรเห็นข้ามบทบาทเฉพาะตอน SOS เปิดอยู่ และบันทึก data_access_log ทุกคนที่เห็น (กฎข้อ 7)
 */
@Injectable()
export class SosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Sos');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick().catch((err: Error) => this.logger.error(`sos tick failed: ${err.message}`)), ESCALATE_EVERY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ── เจ้าของบ้าน ───────────────────────────────────────────────────────

  /** กด SOS (แอปกดค้าง 3 วิ แล้วค่อยเรียก) · บ้านยังไม่อยู่ในโซน → SOS_NO_COVERAGE (ไม่สร้าง SOS · ให้โทร 191/1669) */
  async create(ownerId: string, boxId: string): Promise<SosDto | { code: 'SOS_NO_COVERAGE'; call: string[] }> {
    type Made = { kind: 'none' } | { kind: 'existing'; id: string } | { kind: 'new'; id: string; recipients: string[] };
    const created = await withTx(this.pool, async (db): Promise<Made> => {
      const box = await db.query(`SELECT 1 FROM app.box_tb WHERE box_id = $1 AND owner_user_id = $2 FOR UPDATE`, [boxId, ownerId]);
      if (!box.rows[0]) throw new NotFoundException();
      const open = await db.query<{ sos_case_id: string }>(
        `SELECT sos_case_id FROM app.sos_case_tb WHERE box_id = $1 AND status IN ('open','accepted')`,
        [boxId],
      );
      if (open.rows[0]) return { kind: 'existing', id: open.rows[0].sos_case_id };

      const agencies = await this.agenciesOf(db, boxId);
      if (!agencies.length) return { kind: 'none' };
      let recipients = await this.zoneOfficers(db, boxId, ownerId);
      let stage: SosStage = 'zone';
      if (!recipients.length) {
        // ✅ บ้านมีโซนแต่ไม่มีเจ้าหน้าที่ในโซนเลย → ข้ามไปขั้นหน่วยงานทันที
        recipients = await this.agencyMembers(db, agencies, ownerId);
        stage = recipients.length ? 'agency' : 'call_yourself';
      }
      const { rows } = await db.query<{ sos_case_id: string }>(
        `INSERT INTO app.sos_case_tb (box_id, owner_user_id, stage) VALUES ($1, $2, $3) RETURNING sos_case_id`,
        [boxId, ownerId, stage],
      );
      const id = rows[0].sos_case_id;
      await this.addRecipients(db, id, recipients, stage === 'zone' ? 'zone' : 'agency');
      return { kind: 'new', id, recipients: recipients.map((r) => r.user_id) };
    });

    if (created.kind === 'none') return { code: 'SOS_NO_COVERAGE', call: ['191', '1669'] };
    if (created.kind === 'existing') {
      throw new AppError(HttpStatus.CONFLICT, 'SOS_ALREADY_OPEN', 'an SOS is already open for this mailbox', {
        sos: await this.getForOwner(ownerId, created.id),
      });
    }
    await this.notifyNew(created.id, created.recipients);
    return this.getForOwner(ownerId, created.id);
  }

  async getForOwner(ownerId: string, id: string): Promise<SosDto> {
    return this.get(ownerId, id);
  }

  /** เจ้าของบ้าน หรือเจ้าหน้าที่ที่ถูกส่งถึง — คนอื่น → 404 */
  async get(userId: string, id: string): Promise<SosDto> {
    await this.escalate(id);
    const c = await this.load(this.pool, id);
    if (!c || (c.owner_user_id !== userId && !(await this.isRecipient(id, userId)))) throw new NotFoundException();
    // ผู้ที่คืนเรื่องแล้วไม่เห็นเบอร์ของเจ้าหน้าที่ที่รับต่อ (เจ้าของบ้านเห็นตามกฎเดิม)
    const showPhone =
      live(c.status) && c.accepted_by !== null && c.accepted_by !== userId && (c.owner_user_id === userId || !(await this.hasReturned(id, userId)));
    if (showPhone) await this.logAccess(userId, c.accepted_by!, id);
    return this.dto(c, showPhone);
  }

  /** ยกเลิก (ยืนยันแล้วในแอป) → แจ้งทุกคนที่ได้รับ */
  async cancel(ownerId: string, id: string, reason: 'safe' | 'mistake'): Promise<SosDto> {
    const { rows } = await this.pool.query<{ sos_case_id: string }>(
      `UPDATE app.sos_case_tb SET status = 'cancelled', cancelled_date = now(), cancel_reason = $3
       WHERE sos_case_id = $1 AND owner_user_id = $2 AND status IN ('open','accepted') RETURNING sos_case_id`,
      [id, ownerId, reason],
    );
    if (!rows[0]) {
      const c = await this.load(this.pool, id);
      if (!c || c.owner_user_id !== ownerId) throw new NotFoundException();
      throw new AppError(HttpStatus.CONFLICT, 'SOS_CLOSED', 'this SOS has already ended');
    }
    const c = (await this.load(this.pool, id))!;
    await this.safeNotify(async () =>
      this.notifications.notify(await this.recipients(id), {
        type: 'sos_cancelled',
        data: { sos_id: id, house_no: c.house_no },
        link: `/officer/sos/case?id=${id}`,
        tag: `sos-${id}`,
      }),
    );
    return this.dto(c, false);
  }

  /** SOS ที่ยังไม่จบของตู้นี้ (หน้าหลักเจ้าของบ้าน) */
  async openForBox(boxId: string): Promise<{ id: string; stage: SosStage; status: SosStatus } | null> {
    const { rows } = await this.pool.query<{ sos_case_id: string; stage: SosStage; status: SosStatus }>(
      `SELECT sos_case_id, stage, status FROM app.sos_case_tb WHERE box_id = $1 AND status IN ('open','accepted')`,
      [boxId],
    );
    return rows[0] ? { id: rows[0].sos_case_id, stage: rows[0].stage, status: rows[0].status } : null;
  }

  // ── เจ้าหน้าที่ ─────────────────────────────────────────────────────────

  /** status: open = ยังไม่มีคนรับ + ที่ฉันรับอยู่ · mine = ที่ฉันรับ · closed = จบแล้ว (30 วันล่าสุด) */
  async list(userId: string, status: 'open' | 'mine' | 'closed'): Promise<SosCardDto[]> {
    await this.escalateAll();
    const filter =
      status === 'open'
        ? `(c.status = 'open' OR (c.status = 'accepted' AND c.accepted_by = $1))`
        : status === 'mine'
          ? `c.accepted_by = $1`
          : `c.status IN ('closed','cancelled') AND c.created_date > now() - interval '30 days'`;
    const { rows } = await this.pool.query<CaseRow>(
      `${CASE_SQL}
       WHERE EXISTS (SELECT 1 FROM app.sos_recipient_tb r WHERE r.sos_case_id = c.sos_case_id AND r.user_id = $1)
         AND ${filter}
       ORDER BY c.created_date DESC LIMIT 50`,
      [userId],
    );
    const returned = await this.returnedCases(userId);
    const cards: SosCardDto[] = [];
    for (const c of rows) {
      const showOwner = live(c.status);
      if (showOwner) await this.logAccess(userId, c.owner_user_id, c.sos_case_id);
      cards.push(this.card(c, userId, showOwner, returned.has(c.sos_case_id)));
    }
    return cards;
  }

  /** รายละเอียดสำหรับเจ้าหน้าที่ (O09/O10) */
  async getCard(userId: string, id: string): Promise<SosCardDto> {
    await this.escalate(id);
    if (!(await this.isRecipient(id, userId))) throw new NotFoundException();
    const c = (await this.load(this.pool, id))!;
    const showOwner = live(c.status);
    if (showOwner) await this.logAccess(userId, c.owner_user_id, id);
    return this.card(c, userId, showOwner, await this.hasReturned(id, userId));
  }

  /** รับเรื่อง — กดพร้อมกันหลายคน คนแรกได้ (UPDATE … WHERE status = 'open') */
  async accept(userId: string, id: string): Promise<SosCardDto> {
    const r = await this.pool.query<{ agency_id: string }>(
      `SELECT agency_id FROM app.sos_recipient_tb WHERE sos_case_id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!r.rows[0]) throw new NotFoundException();
    const { rows } = await this.pool.query(
      `UPDATE app.sos_case_tb SET status = 'accepted', accepted_by = $2, accepted_agency_id = $3, accepted_date = now()
       WHERE sos_case_id = $1 AND status = 'open' RETURNING sos_case_id`,
      [id, userId, r.rows[0].agency_id],
    );
    const c = (await this.load(this.pool, id))!;
    if (!rows[0]) {
      if (c.status === 'cancelled') throw new AppError(HttpStatus.GONE, 'SOS_CANCELLED', 'the owner cancelled this SOS');
      if (c.accepted_by === userId) return this.card(c, userId, live(c.status), await this.hasReturned(id, userId));
      throw new AppError(HttpStatus.CONFLICT, 'SOS_ALREADY_TAKEN', 'someone else took this SOS', {
        accepted_by: c.accepted_name ? { display_name: c.accepted_name, agency_name: c.accepted_agency ?? '' } : null,
      });
    }
    await this.safeNotify(async () => {
      const data = { sos_id: id, house_no: c.house_no, officer_name: c.accepted_name, agency_name: c.accepted_agency };
      await this.notifications.notify([c.owner_user_id], { type: 'sos_accepted', data, link: `/home/sos/accepted?id=${id}`, tag: `sos-${id}` });
      const others = (await this.recipients(id)).filter((u) => u !== userId);
      await this.notifications.notify(others, { type: 'sos_taken', data, link: `/officer/sos/case?id=${id}`, tag: `sos-${id}` });
    });
    await this.logAccess(userId, c.owner_user_id, id);
    return this.card(c, userId, true, await this.hasReturned(id, userId));
  }

  /** ปิดเรื่อง + หมายเหตุ (คนที่รับเท่านั้น) → เจ้าของบ้านเห็นหมายเหตุ */
  async close(userId: string, id: string, note: string): Promise<SosCardDto> {
    const { rows } = await this.pool.query(
      `UPDATE app.sos_case_tb SET status = 'closed', closed_date = now(), close_note = $3
       WHERE sos_case_id = $1 AND accepted_by = $2 AND status = 'accepted' RETURNING sos_case_id`,
      [id, userId, note],
    );
    const c = await this.load(this.pool, id);
    if (!c || !(await this.isRecipient(id, userId))) throw new NotFoundException();
    if (!rows[0]) throw new AppError(HttpStatus.CONFLICT, 'SOS_CLOSED', 'only the officer who accepted it can close an open SOS');
    await this.safeNotify(() =>
      this.notifications.notify([c.owner_user_id], { type: 'sos_closed', data: { sos_id: id }, link: `/home/sos/closed?id=${id}`, tag: `sos-${id}` }),
    );
    return this.card(c, userId, false, await this.hasReturned(id, userId));
  }

  /** คืนเรื่อง (ผู้ที่รับเท่านั้น · ยืนยันแล้วในแอป) — กดซ้ำหลังคืนสำเร็จได้คำตอบเดิม */
  async giveBack(userId: string, id: string): Promise<SosCardDto> {
    if (!(await this.isRecipient(id, userId))) throw new NotFoundException();
    const done = await this.release(id, userId, 'self');
    const c = (await this.load(this.pool, id))!;
    const returned = done || (await this.hasReturned(id, userId));
    if (!done && !(c.status === 'open' && returned)) {
      if (c.status === 'cancelled') throw new AppError(HttpStatus.GONE, 'SOS_CANCELLED', 'the owner cancelled this SOS');
      if (c.status === 'closed') throw new AppError(HttpStatus.CONFLICT, 'SOS_CLOSED', 'this SOS has already ended');
      throw new AppError(HttpStatus.CONFLICT, 'SOS_NOT_YOURS', 'only the officer who accepted it can return this SOS');
    }
    const showOwner = live(c.status);
    if (showOwner) await this.logAccess(userId, c.owner_user_id, id);
    return this.card(c, userId, showOwner, returned);
  }

  /**
   * ตรรกะคืนเรื่อง ใช้ร่วมกันระหว่างกดคืนเองกับระบบคืนให้ (releaseIneligible):
   * กลับเป็นรอคนรับ + เริ่มรอบส่งซ้ำและนับขั้นใหม่ + บันทึกประวัติ + แจ้งผู้รับกับเจ้าของบ้าน
   * คืน false เมื่อ officerId ไม่ได้ถือเรื่องนี้อยู่ (ยกเลิก/ปิด/คืนไปแล้ว) — ไม่ทำอะไร
   */
  async release(id: string, officerId: string, source: 'self' | 'system'): Promise<boolean> {
    const done = await withTx(this.pool, async (db) => {
      // ล็อกแถวก่อน → เจ้าของยกเลิกพร้อมกันจะรอจนจบ transaction แล้วค่อยยกเลิก (หรือเราเห็นว่ายกเลิกแล้ว)
      const { rows } = await db.query<{ accepted_agency_id: string; accepted_date: Date }>(
        `SELECT accepted_agency_id, accepted_date FROM app.sos_case_tb
         WHERE sos_case_id = $1 AND accepted_by = $2 AND status = 'accepted' FOR UPDATE`,
        [id, officerId],
      );
      if (!rows[0]) return false;
      await db.query(
        `UPDATE app.sos_case_tb SET status = 'open', accepted_by = NULL, accepted_agency_id = NULL, accepted_date = NULL,
           stage_changed_date = now(), repeat_start_date = now(), repeat_count = 0
         WHERE sos_case_id = $1`,
        [id],
      );
      await db.query(
        `INSERT INTO app.sos_return_tb (sos_case_id, officer_user_id, agency_id, source, accepted_date) VALUES ($1, $2, $3, $4, $5)`,
        [id, officerId, rows[0].accepted_agency_id, source, rows[0].accepted_date],
      );
      return true;
    });
    if (!done) return false;

    await this.safeNotify(async () => {
      const c = await this.load(this.pool, id);
      if (!c || c.status !== 'open') return; // ยกเลิกหรือมีคนรับต่อไปแล้ว
      await this.notifications.notify([c.owner_user_id], {
        type: 'sos_returned',
        data: { sos_id: id, house_no: c.house_no },
        link: `/home/sos?id=${id}`,
        tag: `sos-${id}`,
      });
    });
    await this.notifyNew(id, await this.eligibleRecipients(id), { returned: true });
    return true;
  }

  /**
   * ผู้รับหมดสิทธิ์ระหว่าง SOS ยังเปิด → ระบบคืนเรื่องให้ · คืนจำนวนเรื่องที่คืน
   * ตรวจจากสถานะในฐานข้อมูล จึงครอบคลุมทุกทางที่ทำให้หมดสิทธิ์ (และ restart แล้วยังตามเก็บได้)
   * ตัวจับเวลาเรียกทุกรอบ — งานที่อยากให้คืนทันที (เช่นระงับหน่วยงาน) เรียกซ้ำเองได้หลัง commit
   */
  async releaseIneligible(): Promise<number> {
    const { rows } = await this.pool.query<{ sos_case_id: string; accepted_by: string }>(
      `SELECT c.sos_case_id, c.accepted_by FROM app.sos_case_tb c
       WHERE c.status = 'accepted' AND NOT ${eligibleSql('c.accepted_by', 'c.accepted_agency_id')}`,
    );
    let released = 0;
    for (const r of rows) if (await this.release(r.sos_case_id, r.accepted_by, 'system')) released++;
    return released;
  }

  /** SOS ที่ยังต้องสนใจ (หน้าสรุปเจ้าหน้าที่ O01-b / O01-c) */
  async activeFor(userId: string): Promise<SosCardDto[]> {
    return this.list(userId, 'open');
  }

  // ── ส่งซ้ำ + เลื่อนขั้น ────────────────────────────────────────────────

  /** ส่งซ้ำก่อนเลื่อนขั้น — คนที่เพิ่งถูกเพิ่มตอนเลื่อนขั้นจะไม่ได้สองข้อความในรอบเดียว (เช่นหลัง restart) */
  private async tick(): Promise<void> {
    await this.releaseIneligible();
    await this.repeatAll();
    await this.escalateAll();
  }

  /**
   * SOS ที่ยังไม่มีคนรับและถึงนาทีใหม่ของรอบ → แจ้งผู้รับที่ยังมีสิทธิ์อีกครั้ง · คืนจำนวน SOS ที่ส่งซ้ำ
   * จองนาทีในฐานข้อมูลก่อนส่ง (UPDATE เดียว) → restart/เรียกซ้อนไม่ส่งซ้ำ · นาทีที่พลาดไปตอนระบบหยุดไม่ส่งย้อนหลัง
   * `now` ใช้กำหนดเวลาในเทสต์ — ปกติใช้เวลาของฐานข้อมูล
   */
  async repeatAll(now?: Date): Promise<number> {
    const { rows } = await this.pool.query<{ sos_case_id: string }>(
      `UPDATE app.sos_case_tb c
       SET repeat_count = floor(extract(epoch FROM (coalesce($1::timestamptz, now()) - c.repeat_start_date)) / $2::int)::int
       WHERE c.status = 'open'
         AND coalesce($1::timestamptz, now()) >= c.repeat_start_date + make_interval(secs => (c.repeat_count + 1) * $2::int)
         AND coalesce($1::timestamptz, now()) < c.repeat_start_date + make_interval(secs => $3::int)
       RETURNING c.sos_case_id`,
      [now ?? null, REPEAT_SECONDS, REPEAT_LIMIT * REPEAT_SECONDS + REPEAT_GRACE_SECONDS],
    );
    for (const r of rows) await this.notifyNew(r.sos_case_id, await this.eligibleRecipients(r.sos_case_id), { repeat: true });
    return rows.length;
  }

  async escalateAll(): Promise<void> {
    const { rows } = await this.pool.query<{ sos_case_id: string }>(
      `SELECT sos_case_id FROM app.sos_case_tb
       WHERE status = 'open' AND stage <> 'call_yourself' AND stage_changed_date <= now() - make_interval(secs => $1)`,
      [STAGE_SECONDS],
    );
    for (const r of rows) await this.escalate(r.sos_case_id);
  }

  /** zone → agency (เพิ่มคนในหน่วยงานทุกหน่วยที่ดูแลบ้าน + หัวหน้า) → call_yourself · เฉพาะ status = open */
  private async escalate(id: string): Promise<void> {
    const added = await withTx(this.pool, async (db) => {
      const { rows } = await db.query<{ box_id: string; owner_user_id: string; stage: SosStage }>(
        `SELECT box_id, owner_user_id, stage FROM app.sos_case_tb
         WHERE sos_case_id = $1 AND status = 'open' AND stage <> 'call_yourself'
           AND stage_changed_date <= now() - make_interval(secs => $2)
         FOR UPDATE SKIP LOCKED`,
        [id, STAGE_SECONDS],
      );
      const c = rows[0];
      if (!c) return [];
      if (c.stage === 'zone') {
        const members = await this.agencyMembers(db, await this.agenciesOf(db, c.box_id), c.owner_user_id);
        const before = new Set(await this.recipients(id, db));
        const fresh = members.filter((m) => !before.has(m.user_id));
        await this.addRecipients(db, id, fresh, 'agency');
        await db.query(`UPDATE app.sos_case_tb SET stage = 'agency', stage_changed_date = now() WHERE sos_case_id = $1`, [id]);
        return fresh.map((m) => m.user_id);
      }
      await db.query(`UPDATE app.sos_case_tb SET stage = 'call_yourself', stage_changed_date = now() WHERE sos_case_id = $1`, [id]);
      return [];
    });
    if (added.length) await this.notifyNew(id, added);
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  private async agenciesOf(db: Db, boxId: string): Promise<string[]> {
    const { rows } = await db.query<{ agency_id: string }>(
      `SELECT DISTINCT z.agency_id FROM app.zone_box_tb zb
       JOIN app.zone_tb z ON z.zone_id = zb.zone_id AND z.deleted_date IS NULL
       JOIN app.agency_tb a ON a.agency_id = z.agency_id AND a.status = 'approved'
       WHERE zb.box_id = $1`,
      [boxId],
    );
    return rows.map((r) => r.agency_id);
  }

  /** เจ้าหน้าที่ในทุกโซนที่มีบ้านนี้ (ทุกหน่วยงาน) — สมาชิก active · ไม่รวมเจ้าของบ้านเอง */
  private async zoneOfficers(db: Db, boxId: string, ownerId: string): Promise<{ user_id: string; agency_id: string }[]> {
    const { rows } = await db.query<{ user_id: string; agency_id: string }>(
      `SELECT DISTINCT ON (zo.user_id) zo.user_id, z.agency_id
       FROM app.zone_box_tb zb
       JOIN app.zone_tb z ON z.zone_id = zb.zone_id AND z.deleted_date IS NULL
       JOIN app.agency_tb a ON a.agency_id = z.agency_id AND a.status = 'approved'
       JOIN app.zone_officer_tb zo ON zo.zone_id = z.zone_id
       JOIN app.agency_member_tb m ON m.user_id = zo.user_id AND m.agency_id = z.agency_id AND m.status = 'active'
       JOIN app.user_tb u ON u.user_id = zo.user_id AND u.status = 'active' AND u.deleted_date IS NULL
       WHERE zb.box_id = $1 AND zo.user_id <> $2`,
      [boxId, ownerId],
    );
    return rows;
  }

  /** ทุกคนในหน่วยงานเหล่านี้ (รวมหัวหน้า) — สมาชิก active · ไม่รวมเจ้าของบ้านเอง */
  private async agencyMembers(db: Db, agencyIds: string[], ownerId: string): Promise<{ user_id: string; agency_id: string }[]> {
    if (!agencyIds.length) return [];
    const { rows } = await db.query<{ user_id: string; agency_id: string }>(
      `SELECT m.user_id, m.agency_id FROM app.agency_member_tb m
       JOIN app.user_tb u ON u.user_id = m.user_id AND u.status = 'active' AND u.deleted_date IS NULL
       WHERE m.agency_id = ANY($1::uuid[]) AND m.status = 'active' AND m.user_id <> $2`,
      [agencyIds, ownerId],
    );
    return rows;
  }

  private async addRecipients(db: Db, id: string, list: { user_id: string; agency_id: string }[], stage: 'zone' | 'agency'): Promise<void> {
    for (const r of list) {
      await db.query(
        `INSERT INTO app.sos_recipient_tb (sos_case_id, user_id, agency_id, stage) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [id, r.user_id, r.agency_id, stage],
      );
    }
  }

  private async recipients(id: string, db: Db = this.pool): Promise<string[]> {
    const { rows } = await db.query<{ user_id: string }>(`SELECT user_id FROM app.sos_recipient_tb WHERE sos_case_id = $1`, [id]);
    return rows.map((r) => r.user_id);
  }

  /** ผู้รับที่ยังมีสิทธิ์ (eligibleSql) · ไม่รวมคนที่คืนเรื่องนี้แล้ว */
  private async eligibleRecipients(id: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ user_id: string }>(
      `SELECT r.user_id FROM app.sos_recipient_tb r
       WHERE r.sos_case_id = $1 AND ${eligibleSql('r.user_id', 'r.agency_id')}
         AND NOT EXISTS (SELECT 1 FROM app.sos_return_tb x WHERE x.sos_case_id = r.sos_case_id AND x.officer_user_id = r.user_id)`,
      [id],
    );
    return rows.map((r) => r.user_id);
  }

  private async isRecipient(id: string, userId: string): Promise<boolean> {
    const { rows } = await this.pool.query(`SELECT 1 FROM app.sos_recipient_tb WHERE sos_case_id = $1 AND user_id = $2`, [id, userId]);
    return rows.length > 0;
  }

  private async hasReturned(id: string, userId: string): Promise<boolean> {
    return (await this.returnedCases(userId, id)).size > 0;
  }

  private async returnedCases(userId: string, id: string | null = null): Promise<Set<string>> {
    const { rows } = await this.pool.query<{ sos_case_id: string }>(
      `SELECT DISTINCT sos_case_id FROM app.sos_return_tb WHERE officer_user_id = $1 AND ($2::uuid IS NULL OR sos_case_id = $2::uuid)`,
      [userId, id],
    );
    return new Set(rows.map((r) => r.sos_case_id));
  }

  private async load(db: Db, id: string): Promise<CaseRow | null> {
    const { rows } = await db.query<CaseRow>(`${CASE_SQL} WHERE c.sos_case_id = $1`, [id]);
    return rows[0] ?? null;
  }

  private dto(c: CaseRow, showPhone: boolean): SosDto {
    return {
      id: c.sos_case_id,
      box: { id: c.box_id, house_no: c.house_no ?? '' },
      status: c.status,
      stage: c.stage,
      created_at: c.created_date.toISOString(),
      stage_changed_at: c.stage_changed_date.toISOString(),
      accepted_by:
        c.accepted_by && c.accepted_date
          ? { display_name: c.accepted_name ?? '', agency_name: c.accepted_agency ?? '', phone: showPhone ? c.accepted_phone : null, at: c.accepted_date.toISOString() }
          : null,
      close_note: c.close_note,
      returned_at: c.status === 'open' ? (c.returned_date?.toISOString() ?? null) : null,
    };
  }

  private card(c: CaseRow, userId: string, showOwner: boolean, returnedByMe: boolean): SosCardDto {
    return {
      id: c.sos_case_id,
      status: c.status,
      stage: c.stage,
      created_at: c.created_date.toISOString(),
      house_no: c.house_no ?? '',
      owner: showOwner ? { name: c.owner_name, phone: c.owner_phone } : null,
      house: showOwner
        ? {
            address: c.address ?? '',
            area: c.area ?? '',
            location: c.lat !== null && c.lng !== null ? { lat: Number(c.lat), lng: Number(c.lng) } : null,
            details: houseDetails(c.owner_profile),
          }
        : null,
      accepted_by: c.accepted_by ? { display_name: c.accepted_name ?? '', agency_name: c.accepted_agency ?? '' } : null,
      mine: c.accepted_by === userId,
      returned_at: c.status === 'open' ? (c.returned_date?.toISOString() ?? null) : null,
      returned_by_me: returnedByMe,
    };
  }

  /** เห็นเบอร์ข้ามบทบาท → บันทึกครั้งเดียวต่อ (คนดู, คนถูกดู, SOS) */
  private async logAccess(actorId: string, subjectUserId: string, sosId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO app.data_access_log_tb (actor_user_id, subject_kind, subject_id, fields)
       SELECT $1, 'user', $2, ARRAY['name','phone','sos:' || $3]
       WHERE NOT EXISTS (SELECT 1 FROM app.data_access_log_tb
                         WHERE actor_user_id = $1 AND subject_kind = 'user' AND subject_id = $2 AND ('sos:' || $3) = ANY(fields))`,
      [actorId, subjectUserId, sosId],
    );
  }

  /** อ่านสถานะอีกครั้งก่อนส่ง — มีคนรับ/ยกเลิกไปแล้วไม่ส่ง */
  private async notifyNew(id: string, userIds: string[], extra: { repeat?: true; returned?: true } = {}): Promise<void> {
    if (!userIds.length) return;
    const c = await this.load(this.pool, id);
    if (!c || c.status !== 'open') return;
    await this.safeNotify(() =>
      this.notifications.notify(userIds, {
        type: 'sos_new',
        data: { sos_id: id, house_no: c.house_no, ...extra },
        link: `/officer/sos/case?id=${id}`,
        tag: `sos-${id}`,
      }),
    );
  }

  private async safeNotify(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`notification failed: ${(err as Error).message}`);
    }
  }
}
