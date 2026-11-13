import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/db/db.module.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';
import { SchedulerService } from '../src/scheduler/scheduler.service.js';

// "ข้อมูลของฉัน" (api.md §3.2): เครื่องที่ล็อกอิน · ส่งออก · ลบบัญชี (ซ่อนตัวตน + พัก 7 วัน)
// ต้องมีฐานข้อมูลที่รัน migration ถึง 0039 + seed แล้ว (เหมือน auth.e2e-spec.ts)
const SECRETS = ['password_hash', 'token_hash', 'token_version'];

describe('My data (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 10;
  const phone = () => `07${run}${seq++}`;
  const http = () => request(app.getHttpServer());
  const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
  const noSecrets = (res: request.Response) => {
    for (const f of SECRETS) expect(res.text).not.toContain(f);
    return res;
  };

  interface Acct { id: string; phone: string; password: string; cookie: string }
  const signupOwner = async (p = phone(), password = 'password123'): Promise<Acct> => {
    const res = await http().post('/api/v1/auth/signup/owner').send({ name: 'สมศรี', phone: p, password, house_no: '12/3', terms_version: terms }).expect(201);
    return { id: res.body.id as string, phone: p, password, cookie: cookieOf(res) };
  };
  const signin = async (a: { phone: string; password: string }) =>
    http().post('/api/v1/auth/signin').send({ phone: a.phone, password: a.password });
  const makeAdmin = async (): Promise<Acct> => {
    const a = await signupOwner();
    await pool.query(`DELETE FROM app.user_role_tb WHERE user_id = $1`, [a.id]);
    await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'admin')`, [a.id]);
    return a;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(COUNTER_STORE).useValue(counters).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    pool = app.get(PG_POOL);
    terms = (await http().get('/api/v1/terms/current').expect(200)).body.version;
  });
  beforeEach(() => counters.clear());
  afterAll(async () => {
    await app.close();
  });

  describe('sessions', () => {
    it('lists my live sessions without secrets, marks the current one', async () => {
      const a = await signupOwner();
      const second = await signin(a).then((r) => ({ cookie: cookieOf(r) }));
      const res = await http().get('/api/v1/me/sessions').set('Cookie', a.cookie).expect(200).then(noSecrets);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      expect(res.body.items[0]).toEqual(
        expect.objectContaining({ id: expect.any(String), device_label: expect.any(String), last_used_at: expect.any(String), created_at: expect.any(String) }),
      );
      expect(Object.keys(res.body.items[0]).sort()).toEqual(['created_at', 'current', 'device_label', 'id', 'ip_hint', 'last_used_at']);
      // เครื่องที่สองเห็นรายการเดียวกันแต่ current ย้ายตำแหน่ง
      const other = await http().get('/api/v1/me/sessions').set('Cookie', second.cookie).expect(200);
      const idOfCurrent = (b: { items: { id: string; current: boolean }[] }) => b.items.find((s) => s.current)!.id;
      expect(idOfCurrent(other.body)).not.toBe(idOfCurrent(res.body));
    });

    it('revokes one other device; the current device → 409 CURRENT_SESSION; unknown / foreign id → 404', async () => {
      const a = await signupOwner();
      const b = await signupOwner();
      const second = await signin(a).then((r) => ({ cookie: cookieOf(r) }));
      const list = (await http().get('/api/v1/me/sessions').set('Cookie', a.cookie).expect(200)).body.items as { id: string; current: boolean }[];
      const cur = list.find((s) => s.current)!;
      const oth = list.find((s) => !s.current)!;

      expect((await http().delete(`/api/v1/me/sessions/${cur.id}`).set('Cookie', a.cookie).expect(409)).body.code).toBe('CURRENT_SESSION');
      await http().delete('/api/v1/me/sessions/00000000-0000-4000-8000-000000000000').set('Cookie', a.cookie).expect(404);
      await http().delete('/api/v1/me/sessions/not-a-uuid').set('Cookie', a.cookie).expect(404);
      // ผู้ใช้ B ลบ session ของ A ไม่ได้ (ตอบ 404 ไม่ใช่ 403)
      await http().delete(`/api/v1/me/sessions/${oth.id}`).set('Cookie', b.cookie).expect(404);
      await http().get('/api/v1/me').set('Cookie', second.cookie).expect(200);

      await http().delete(`/api/v1/me/sessions/${oth.id}`).set('Cookie', a.cookie).expect(200);
      expect((await http().get('/api/v1/me').set('Cookie', second.cookie).expect(401)).body.code).toBe('SESSION_REVOKED');
      // ครั้งที่สองเพิกถอนแล้ว → 404
      await http().delete(`/api/v1/me/sessions/${oth.id}`).set('Cookie', a.cookie).expect(404);
      await http().get('/api/v1/me').set('Cookie', a.cookie).expect(200);
    });

    it('revoke-others signs out every other device but keeps this one', async () => {
      const a = await signupOwner();
      const c2 = cookieOf(await signin(a));
      const c3 = cookieOf(await signin(a));
      const res = await http().post('/api/v1/me/sessions/revoke-others').set('Cookie', a.cookie).expect(200);
      expect(res.body).toEqual({ revoked: 2 });
      await http().get('/api/v1/me').set('Cookie', c2).expect(401);
      await http().get('/api/v1/me').set('Cookie', c3).expect(401);
      await http().get('/api/v1/me').set('Cookie', a.cookie).expect(200);
      expect((await http().post('/api/v1/me/sessions/revoke-others').set('Cookie', a.cookie).expect(200)).body).toEqual({ revoked: 0 });
    });

    it('requires a session', async () => {
      await http().get('/api/v1/me/sessions').expect(401);
      await http().post('/api/v1/me/export').expect(401);
      await http().get('/api/v1/me/delete-preview').expect(401);
      await http().delete('/api/v1/me').send({ password: 'x', confirm: 'DELETE' }).expect(401);
    });
  });

  describe('export', () => {
    it('streams my own data as a JSON attachment — no secrets, nobody else’s phone', async () => {
      const a = await signupOwner();
      const other = await signupOwner();
      const res = await http().post('/api/v1/me/export').set('Cookie', a.cookie).expect(200).then(noSecrets);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="smmb-my-data-\d{8}\.json"$/);
      expect(res.body.account).toMatchObject({ id: a.id, phone: a.phone });
      expect(res.body.roles).toEqual([expect.objectContaining({ role: 'owner' })]);
      expect(res.body.terms_acceptances.length).toBeGreaterThan(0);
      expect(res.text).not.toContain(other.phone);
    });

    it('is limited to 3 exports per day per user (RATE_LIMITED) and each one is logged', async () => {
      const a = await signupOwner();
      for (let i = 0; i < 3; i++) await http().post('/api/v1/me/export').set('Cookie', a.cookie).expect(200);
      expect((await http().post('/api/v1/me/export').set('Cookie', a.cookie).expect(429)).body.code).toBe('RATE_LIMITED');
      const log = await pool.query(`SELECT count(*)::int AS n FROM app.data_access_log_tb WHERE actor_user_id = $1 AND fields = ARRAY['self_export']::text[]`, [a.id]);
      expect(log.rows[0].n).toBe(3);
      // ผู้ใช้อื่นไม่ถูกนับรวม
      const b = await signupOwner();
      await http().post('/api/v1/me/export').set('Cookie', b.cookie).expect(200);
    });
  });

  describe('delete account', () => {
    it('previews counts, retained logs and the recovery period; no blockers for a plain owner', async () => {
      const a = await signupOwner();
      const res = await http().get('/api/v1/me/delete-preview').set('Cookie', a.cookie).expect(200).then(noSecrets);
      expect(res.body.blockers).toEqual([]);
      expect(res.body.recovery_days).toBe(7);
      expect(res.body.counts).toMatchObject({ boxes: 0, sessions: 1 });
      expect(res.body.retained.map((r: { kind: string }) => r.kind).sort()).toEqual(['data_access_log', 'scan_log', 'terms_acceptance']);
    });

    it('validates the body and the password before touching anything', async () => {
      const a = await signupOwner();
      await http().delete('/api/v1/me').set('Cookie', a.cookie).send({ password: a.password }).expect(400);
      await http().delete('/api/v1/me').set('Cookie', a.cookie).send({ password: a.password, confirm: 'delete' }).expect(400);
      const bad = await http().delete('/api/v1/me').set('Cookie', a.cookie).send({ password: 'wrong-password', confirm: 'DELETE' }).expect(401);
      expect(bad.body.code).toBe('INVALID_CREDENTIALS');
      await http().get('/api/v1/me').set('Cookie', a.cookie).expect(200); // ยังใช้งานได้
    });

    it('blocks IS_ADMIN, BOX_BOUND and SOS_OPEN with 409 and the full blockers list', async () => {
      const admin = await makeAdmin();
      const adminPreview = await http().get('/api/v1/me/delete-preview').set('Cookie', admin.cookie).expect(200);
      expect(adminPreview.body.blockers).toEqual([{ code: 'IS_ADMIN' }]);
      const refused = await http().delete('/api/v1/me').set('Cookie', admin.cookie).send({ password: admin.password, confirm: 'DELETE' }).expect(409);
      expect(refused.body).toMatchObject({ code: 'IS_ADMIN', blockers: [{ code: 'IS_ADMIN' }] });

      // เจ้าของที่ผูกตู้ไว้
      const [box] = (await http().post('/api/v1/admin/boxes').set('Cookie', admin.cookie).send({ count: 1 }).expect(201)).body as { box_id: string; qr: { slot: string; url: string }[] }[];
      const owner = await signupOwner();
      await http().post('/api/v1/boxes/activate').set('Cookie', owner.cookie).send({ qr_text: box.qr.find((q) => q.slot === 'activate')!.url }).expect(200);
      const bound = await http().delete('/api/v1/me').set('Cookie', owner.cookie).send({ password: owner.password, confirm: 'DELETE' }).expect(409);
      expect(bound.body).toMatchObject({ code: 'BOX_BOUND', blockers: [{ code: 'BOX_BOUND' }] });
      expect((await http().get('/api/v1/me/delete-preview').set('Cookie', owner.cookie)).body.counts.boxes).toBe(1);

      // SOS ที่ยังเปิดอยู่ (ใส่ตรงในฐานข้อมูล)
      await pool.query(`INSERT INTO app.sos_case_tb (box_id, owner_user_id) VALUES ($1, $2)`, [box.box_id, owner.id]);
      const both = await http().get('/api/v1/me/delete-preview').set('Cookie', owner.cookie).expect(200);
      expect(both.body.blockers.map((b: { code: string }) => b.code).sort()).toEqual(['BOX_BOUND', 'SOS_OPEN']);
      // ถอดตู้ + ปิด SOS แล้วลบได้
      await pool.query(`UPDATE app.sos_case_tb SET status = 'closed', closed_date = now() WHERE owner_user_id = $1`, [owner.id]);
      await http().post(`/api/v1/admin/boxes/${box.box_id}/unbind`).set('Cookie', admin.cookie).send({ reason: 'test' }).expect(200);
      await http().delete('/api/v1/me').set('Cookie', owner.cookie).send({ password: owner.password, confirm: 'DELETE' }).expect(200);
    });

    it('blocks the only head of an agency (LAST_HEAD) until another head exists', async () => {
      const a = await signupOwner();
      const [agency] = (
        await pool.query<{ agency_id: string }>(
          `INSERT INTO app.agency_tb (name, type, status, group_code, approved_date) VALUES ($1, 'police', 'approved', $2, now()) RETURNING agency_id`,
          [`สภ.ลบบัญชี ${run}`, `D${run}${seq}`],
        )
      ).rows;
      await pool.query(`INSERT INTO app.agency_member_tb (agency_id, user_id, is_head, status) VALUES ($1, $2, true, 'active')`, [agency.agency_id, a.id]);
      expect((await http().get('/api/v1/me/delete-preview').set('Cookie', a.cookie).expect(200)).body.blockers).toEqual([{ code: 'LAST_HEAD' }]);
      const second = await signupOwner();
      await pool.query(`INSERT INTO app.agency_member_tb (agency_id, user_id, is_head, status) VALUES ($1, $2, true, 'active')`, [agency.agency_id, second.id]);
      expect((await http().get('/api/v1/me/delete-preview').set('Cookie', a.cookie).expect(200)).body.blockers).toEqual([]);
    });

    it('delete → sessions die, sign-in says ACCOUNT_PENDING_DELETION, phone stays reserved, admin can restore', async () => {
      const admin = await makeAdmin();
      const a = await signupOwner();
      const second = cookieOf(await signin(a));
      const res = await http().delete('/api/v1/me').set('Cookie', a.cookie).send({ password: a.password, confirm: 'DELETE' }).expect(200).then(noSecrets);
      expect(res.body.ok).toBe(true);
      const until = new Date(res.body.recovery_until).getTime();
      expect(until - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
      expect(until - Date.now()).toBeLessThan(7.1 * 86_400_000);
      expect(String(res.headers['set-cookie'])).toMatch(/sid=;/); // ล้าง cookie

      await http().get('/api/v1/me').set('Cookie', a.cookie).expect(401);
      await http().get('/api/v1/me').set('Cookie', second).expect(401);
      // รหัสผิดยังเป็น INVALID_CREDENTIALS (ไม่เผยว่าบัญชีมีอยู่) · รหัสถูกจึงรู้เหตุ
      expect((await signin({ phone: a.phone, password: 'wrong-password' }).then((r) => r)).body.code).toBe('INVALID_CREDENTIALS');
      const pending = await signin(a);
      expect(pending.status).toBe(403);
      expect(pending.body.code).toBe('ACCOUNT_PENDING_DELETION');
      expect(pending.headers['set-cookie']).toBeUndefined();
      // เบอร์ยังถูกจอง
      await http().post('/api/v1/auth/signup/owner').send({ name: 'ซ้ำ', phone: a.phone, password: 'password123', house_no: '1', terms_version: terms }).expect(409);

      // แอดมินเห็นในรายการ ?deleted=pending และกู้ได้
      const list = await http().get('/api/v1/admin/users').query({ deleted: 'pending', q: a.phone }).set('Cookie', admin.cookie).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ id: a.id, deleted_at: expect.any(String) });
      expect((await http().get('/api/v1/admin/users').query({ q: a.phone }).set('Cookie', admin.cookie).expect(200)).body.data).toHaveLength(0);
      await http().post(`/api/v1/admin/users/${a.id}/restore`).set('Cookie', admin.cookie).expect(200);
      await signin(a).then((r) => expect(r.status).toBe(200));
      // กู้ซ้ำ = ไม่มีบัญชีที่รอลบแล้ว → 404
      await http().post(`/api/v1/admin/users/${a.id}/restore`).set('Cookie', admin.cookie).expect(404);
      const audit = await pool.query(`SELECT action FROM app.admin_audit_log_tb WHERE subject_id = $1 ORDER BY created_date`, [a.id]);
      expect(audit.rows.map((r: { action: string }) => r.action)).toEqual(expect.arrayContaining(['user.self_delete', 'user.restore']));
    });

    it('only an admin can restore', async () => {
      const a = await signupOwner();
      const b = await signupOwner();
      await http().post(`/api/v1/admin/users/${a.id}/restore`).set('Cookie', b.cookie).expect(404);
    });

    it('after 7 days the account is anonymized: identity gone, logs kept, phone freed, no restore', async () => {
      const admin = await makeAdmin();
      const a = await signupOwner();
      await http().post('/api/v1/me/export').set('Cookie', a.cookie).expect(200); // มี log ผูกกับ user นี้
      await http().delete('/api/v1/me').set('Cookie', a.cookie).send({ password: a.password, confirm: 'DELETE' }).expect(200);

      const scheduler = app.get(SchedulerService);
      // ยังไม่ครบ 7 วัน → ไม่แตะ
      await scheduler.anonymizeDeleted();
      expect((await pool.query(`SELECT anonymized_date FROM app.user_tb WHERE user_id = $1`, [a.id])).rows[0].anonymized_date).toBeNull();

      await pool.query(`UPDATE app.user_tb SET deleted_date = now() - interval '8 days' WHERE user_id = $1`, [a.id]);
      const logsBefore = (await pool.query(`SELECT count(*)::int AS n FROM app.data_access_log_tb WHERE actor_user_id = $1`, [a.id])).rows[0].n;
      expect(await scheduler.anonymizeDeleted()).toBeGreaterThanOrEqual(1);

      const u = (await pool.query(`SELECT name, display_name, phone, house_no, prefs, profile, status, anonymized_date, password_hash FROM app.user_tb WHERE user_id = $1`, [a.id])).rows[0];
      expect(u).toMatchObject({ name: 'ผู้ใช้ที่ลบแล้ว', display_name: 'ผู้ใช้ที่ลบแล้ว', house_no: null, status: 'disabled' });
      expect(u.phone).toMatch(/^00\d{8}$/);
      expect(u.phone).not.toBe(a.phone);
      expect(u.anonymized_date).not.toBeNull();
      expect(u.prefs).toEqual({});
      expect(u.profile).toEqual({});
      for (const t of ['session_tb', 'notification_tb', 'user_device_tb', 'push_subscription_tb', 'zone_officer_tb']) {
        expect((await pool.query(`SELECT count(*)::int AS n FROM app.${t} WHERE user_id = $1`, [a.id])).rows[0].n).toBe(0);
      }
      // log คงอยู่ (กฎข้อ 6) และ terms ยังอยู่
      expect((await pool.query(`SELECT count(*)::int AS n FROM app.data_access_log_tb WHERE actor_user_id = $1`, [a.id])).rows[0].n).toBe(logsBefore);
      expect((await pool.query(`SELECT count(*)::int AS n FROM app.terms_acceptance_tb WHERE user_id = $1`, [a.id])).rows[0].n).toBeGreaterThan(0);
      // รันซ้ำไม่เปลี่ยนอะไร
      expect(await scheduler.anonymizeDeleted()).toBe(0);

      // กู้ไม่ได้แล้ว · เบอร์เดิมล็อกอินไม่ได้และสมัครใหม่ได้
      expect((await http().post(`/api/v1/admin/users/${a.id}/restore`).set('Cookie', admin.cookie).expect(409)).body.code).toBe('NOT_RESTORABLE');
      expect((await signin(a)).body.code).toBe('INVALID_CREDENTIALS');
      await http().post('/api/v1/auth/signup/owner').send({ name: 'คนใหม่', phone: a.phone, password: 'password123', house_no: '9', terms_version: terms }).expect(201);
      // ไม่โผล่ในรายการแอดมินทั้งแบบปกติและแบบรอลบ
      expect((await http().get('/api/v1/admin/users').query({ deleted: 'pending', q: u.phone }).set('Cookie', admin.cookie).expect(200)).body.data).toHaveLength(0);
    });
  });

  describe('phone format', () => {
    it('rejects 00… numbers (reserved for anonymized accounts)', async () => {
      await http().post('/api/v1/auth/signup/owner').send({ name: 'x', phone: '0012345678', password: 'password123', house_no: '1', terms_version: terms }).expect(400);
    });
  });
});
