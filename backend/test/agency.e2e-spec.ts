import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/db/db.module.js';
import { PUSH_SENDER, type PushSender } from '../src/push/push.sender.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';

class SilentSender implements PushSender {
  readonly enabled = true;
  readonly publicKey = 'k';
  async send() {}
}

describe('Agency + admin (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 0;
  const phone = () => `06${run}${String(seq++).padStart(2, '0')}`;
  const PW = 'password123';

  const http = () => request(app.getHttpServer());
  const sid = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body: object = {}) => http().post(url).set('Cookie', cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', cookie).send(body),
    put: (url: string, body: object = {}) => http().put(url).set('Cookie', cookie).send(body),
    delete: (url: string) => http().delete(url).set('Cookie', cookie),
  });
  const signin = async (p: string, password = PW) =>
    sid(await http().post('/api/v1/auth/signin').send({ phone: p, password }).expect(200));
  /** เปิดแจ้งเตือนให้เครื่องนี้ (route ของเจ้าหน้าที่/หัวหน้าต้องมี) */
  const enablePush = (cookie: string) =>
    as(cookie)
      .post('/api/v1/me/push/subscriptions', {
        endpoint: `https://fcm.googleapis.com/fcm/send/ag-${run}-${seq++}`,
        keys: { p256dh: 'p', auth: 'a' },
      })
      .expect(201);
  /** ข้อมูล (data) ของแจ้งเตือน type นี้ที่ผู้ใช้ได้รับ */
  const notified = async (userId: string, type: string) =>
    (await pool.query(`SELECT data FROM app.notification_tb WHERE user_id = $1 AND type = $2`, [userId, type])).rows.map(
      (r: { data: unknown }) => r.data,
    );

  const owner = async () => {
    const p = phone();
    const res = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'เจ้าของบ้าน', phone: p, password: PW, house_no: '1', terms_version: terms })
      .expect(201);
    return { id: res.body.id as string, phone: p, cookie: sid(res) };
  };
  const signupAgency = async (name = `หน่วย ${run}-${seq++}`) => {
    const p = phone();
    const res = await http()
      .post('/api/v1/auth/signup/agency')
      .send({ agency: { name, type: 'police', contact: 'สถานี 02-111-2222' }, head: { name: 'หัวหน้า', phone: p, password: PW }, terms_version: terms })
      .expect(201);
    return { headId: res.body.id as string, agencyId: res.body.agency.id as string, phone: p, cookie: sid(res), name };
  };
  const signupOfficer = async (groupCode: string, name = 'ส.ต.ต. ทดสอบ') => {
    const p = phone();
    const res = await http()
      .post('/api/v1/auth/signup/officer')
      .send({ name, phone: p, password: PW, group_code: groupCode, terms_version: terms })
      .expect(201);
    return { id: res.body.id as string, phone: p, cookie: sid(res) };
  };

  let admin: { id: string; cookie: string };
  /** หน่วยงานที่อนุมัติแล้ว + หัวหน้าที่เปิดแจ้งเตือนแล้ว */
  const readyAgency = async () => {
    const ag = await signupAgency();
    const code = (await as(admin.cookie).post(`/api/v1/admin/agencies/${ag.agencyId}/approve`).expect(200)).body.group_code;
    await enablePush(ag.cookie);
    return { ...ag, code };
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(COUNTER_STORE)
      .useValue(counters)
      .overrideProvider(PUSH_SENDER)
      .useValue(new SilentSender())
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    pool = app.get(PG_POOL);
    terms = (await http().get('/api/v1/terms/current').expect(200)).body.version;

    // แอดมิน: สมัครแล้วเปลี่ยนบทบาทตรงในฐานข้อมูล (ยังไม่มีทางอื่นสร้างแอดมินคนแรก)
    const o = await owner();
    await pool.query(`DELETE FROM app.user_role_tb WHERE user_id = $1`, [o.id]);
    await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'admin')`, [o.id]);
    admin = { id: o.id, cookie: o.cookie };
  });

  beforeEach(() => counters.clear());

  afterAll(async () => {
    await app.close();
  });

  describe('admin approves agencies', () => {
    it('agency signup notifies admins; only admins see the admin routes', async () => {
      const ag = await signupAgency();
      expect(await notified(admin.id, 'agency_pending')).toContainEqual({ agency_name: ag.name });
      const list = await as(admin.cookie).get('/api/v1/admin/agencies?status=pending').expect(200);
      expect(list.body.map((a: { id: string }) => a.id)).toContain(ag.agencyId);
      await as(ag.cookie).get('/api/v1/admin/agencies').expect(404);
    });

    it('pending head sees L02 status; approve → group code, head becomes officer+head, notified', async () => {
      const ag = await signupAgency();
      const before = await as(ag.cookie).get('/api/v1/agency').expect(200);
      expect(before.body).toMatchObject({ status: 'pending', group_code: null });

      const res = await as(admin.cookie).post(`/api/v1/admin/agencies/${ag.agencyId}/approve`).expect(200);
      expect(res.body.group_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

      const me = await as(ag.cookie).get('/api/v1/me').expect(200);
      expect(me.body).toMatchObject({ roles: ['officer', 'head'], agency_status: 'active' });
      expect(await notified(ag.headId, 'agency_approved')).toHaveLength(1);

      const again = await as(admin.cookie).post(`/api/v1/admin/agencies/${ag.agencyId}/approve`).expect(409);
      expect(again.body.code).toBe('AGENCY_NOT_PENDING');
    });

    it('reject with reason → head sees rejected + reason (L02-b)', async () => {
      const ag = await signupAgency();
      await as(admin.cookie).post(`/api/v1/admin/agencies/${ag.agencyId}/reject`, { reason: 'ข้อมูลไม่ครบ' }).expect(200);
      const a = await as(ag.cookie).get('/api/v1/agency').expect(200);
      expect(a.body).toMatchObject({ status: 'rejected', reject_reason: 'ข้อมูลไม่ครบ', group_code: null });
      expect((await as(ag.cookie).get('/api/v1/me').expect(200)).body.agency_status).toBe('rejected');
    });

    it('agency detail with head phones is recorded in the data access log, which cannot be edited', async () => {
      const ag = await signupAgency();
      const res = await as(admin.cookie).get(`/api/v1/admin/agencies/${ag.agencyId}`).expect(200);
      expect(res.body.heads_contact[0].phone).toBe(ag.phone);
      const log = await pool.query(
        `SELECT data_access_log_id FROM app.data_access_log_tb WHERE actor_user_id = $1 AND subject_id = $2`,
        [admin.id, ag.agencyId],
      );
      expect(log.rows).toHaveLength(1);
      await expect(
        pool.query(`DELETE FROM app.data_access_log_tb WHERE data_access_log_id = $1`, [log.rows[0].data_access_log_id]),
      ).rejects.toThrow(/append-only/);
    });

    it('admin creates an agency for a new phone → temp password that must be changed, then terms, then usable', async () => {
      const p = phone();
      const res = await as(admin.cookie)
        .post('/api/v1/admin/agencies', { name: 'รปภ. หมู่บ้าน', type: 'guard', contact: '089-000-1111', head: { name: 'หัวหน้า รปภ.', phone: p } })
        .expect(201);
      expect(res.body).toMatchObject({ agency: { status: 'approved' }, head: { existing_account: false } });
      expect(res.body.head_temp_password).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);

      const cookie = await signin(p, res.body.head_temp_password);
      expect((await as(cookie).get('/api/v1/me').expect(200)).body.must_change_password).toBe(true);
      const blocked = await as(cookie).get('/api/v1/agency').expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

      await as(cookie)
        .post('/api/v1/auth/change-password', { current_password: res.body.head_temp_password, new_password: 'my-new-pass' })
        .expect(200);
      const c2 = await signin(p, 'my-new-pass');
      expect((await as(c2).get('/api/v1/agency').expect(403)).body.code).toBe('TERMS_UPDATE_REQUIRED');
      await as(c2).post('/api/v1/me/terms', { terms_version: terms }).expect(200);
      const a = await as(c2).get('/api/v1/agency').expect(200);
      expect(a.body).toMatchObject({ status: 'approved', group_code: res.body.group_code });
    });

    it('admin creates an agency for an existing owner → same account, no temp password, roles stack', async () => {
      const o = await owner();
      const res = await as(admin.cookie)
        .post('/api/v1/admin/agencies', { name: 'สภ. ทดสอบ', type: 'police', contact: 'สถานี 02-333-4444', head: { name: 'x', phone: o.phone } })
        .expect(201);
      expect(res.body).toMatchObject({ head: { id: o.id, existing_account: true }, head_temp_password: null });
      expect((await as(o.cookie).get('/api/v1/me').expect(200)).body.roles).toEqual(['owner', 'officer', 'head']);
    });
  });

  describe('head manages members', () => {
    it('head without notifications on → 403 PUSH_REQUIRED', async () => {
      const ag = await signupAgency();
      await as(admin.cookie).post(`/api/v1/admin/agencies/${ag.agencyId}/approve`).expect(200);
      const res = await as(ag.cookie).get('/api/v1/agency/members').expect(403);
      expect(res.body.code).toBe('PUSH_REQUIRED');
    });

    it('officer signs up → head notified, pending listed first; approve → officer; twice → 409', async () => {
      const ag = await readyAgency();
      const off = await signupOfficer(ag.code, 'ส.ต.ต. สมชาย');
      expect(await notified(ag.headId, 'member_pending')).toContainEqual({ name: 'ส.ต.ต. สมชาย' });

      const list = await as(ag.cookie).get('/api/v1/agency/members').expect(200);
      expect(list.body[0]).toMatchObject({ id: off.id, status: 'pending', is_head: false, phone: off.phone, zones: [] });
      expect(list.body[1]).toMatchObject({ id: ag.headId, is_head: true });

      await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/approve`).expect(200);
      expect((await as(off.cookie).get('/api/v1/me').expect(200)).body).toMatchObject({ roles: ['officer'], agency_status: 'active' });
      expect(await notified(off.id, 'member_approved')).toHaveLength(1);
      const again = await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/approve`).expect(409);
      expect(again.body.code).toBe('MEMBER_NOT_PENDING');
    });

    it('reject → hidden from the default list; member sees rejected (A11-b)', async () => {
      const ag = await readyAgency();
      const off = await signupOfficer(ag.code);
      await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/reject`).expect(200);
      const list = await as(ag.cookie).get('/api/v1/agency/members').expect(200);
      expect(list.body.map((m: { id: string }) => m.id)).not.toContain(off.id);
      expect((await as(off.cookie).get('/api/v1/me').expect(200)).body.agency_status).toBe('rejected');
    });

    it('members of another agency are invisible (404)', async () => {
      const a = await readyAgency();
      const b = await readyAgency();
      const off = await signupOfficer(b.code);
      await as(a.cookie).post(`/api/v1/agency/members/${off.id}/approve`).expect(404);
      await as(a.cookie).post(`/api/v1/agency/members/${off.id}/reset-password`).expect(404);
    });

    it('disable stops officer access but keeps the owner role and the session; enable restores', async () => {
      const ag = await readyAgency();
      const o = await owner();
      await as(o.cookie).post('/api/v1/me/agency/join', { group_code: ag.code, terms_version: terms }).expect(201);
      await as(ag.cookie).post(`/api/v1/agency/members/${o.id}/approve`).expect(200);
      expect((await as(o.cookie).get('/api/v1/me').expect(200)).body.roles).toEqual(['owner', 'officer']);

      await as(ag.cookie).patch(`/api/v1/agency/members/${o.id}/status`, { is_active: false }).expect(200);
      const me = await as(o.cookie).get('/api/v1/me').expect(200); // session ยังใช้ได้
      expect(me.body).toMatchObject({ roles: ['owner'], agency_status: 'disabled' });

      await as(ag.cookie).patch(`/api/v1/agency/members/${o.id}/status`, { is_active: true }).expect(200);
      expect((await as(o.cookie).get('/api/v1/me').expect(200)).body.roles).toEqual(['owner', 'officer']);

      const self = await as(ag.cookie).patch(`/api/v1/agency/members/${ag.headId}/status`, { is_active: false }).expect(403);
      expect(self.body.code).toBe('CANNOT_CHANGE_SELF');
    });

    it('make another head, remove them; cannot remove yourself', async () => {
      const ag = await readyAgency();
      const off = await signupOfficer(ag.code);
      await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/make-head`).expect(409); // ยังไม่อนุมัติ
      await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/approve`).expect(200);
      await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/make-head`).expect(200);
      expect((await as(off.cookie).get('/api/v1/me').expect(200)).body.roles).toEqual(['officer', 'head']);

      await as(ag.cookie).delete(`/api/v1/agency/members/${off.id}/head`).expect(200);
      expect((await as(off.cookie).get('/api/v1/me').expect(200)).body.roles).toEqual(['officer']);
      const self = await as(ag.cookie).delete(`/api/v1/agency/members/${ag.headId}/head`).expect(403);
      expect(self.body.code).toBe('CANNOT_CHANGE_SELF');
    });

    it('reset password of an officer-only member: temp password, old sessions dead, must change first', async () => {
      const ag = await readyAgency();
      const off = await signupOfficer(ag.code);
      await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/approve`).expect(200);
      const res = await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/reset-password`).expect(200);
      expect(res.body.temp_password).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);

      expect((await as(off.cookie).get('/api/v1/me').expect(401)).body.code).toBe('SESSION_REVOKED');
      await http().post('/api/v1/auth/signin').send({ phone: off.phone, password: PW }).expect(401);
      const c = await signin(off.phone, res.body.temp_password);
      expect((await as(c).get('/api/v1/me/notifications').expect(403)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('cannot reset a member who is also a homeowner or a head — admin only', async () => {
      const ag = await readyAgency();
      const o = await owner();
      await as(o.cookie).post('/api/v1/me/agency/join', { group_code: ag.code, terms_version: terms }).expect(201);
      await as(ag.cookie).post(`/api/v1/agency/members/${o.id}/approve`).expect(200);
      const r1 = await as(ag.cookie).post(`/api/v1/agency/members/${o.id}/reset-password`).expect(403);
      expect(r1.body.code).toBe('RESET_NEEDS_ADMIN');

      const off = await signupOfficer(ag.code);
      await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/approve`).expect(200);
      await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/make-head`).expect(200);
      const r2 = await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/reset-password`).expect(403);
      expect(r2.body.code).toBe('RESET_NEEDS_ADMIN');
    });

    it('rotating the group code kills the old one', async () => {
      const ag = await readyAgency();
      const res = await as(ag.cookie).post('/api/v1/agency/group-code/rotate').expect(200);
      expect(res.body.group_code).not.toBe(ag.code);
      const old = await http()
        .post('/api/v1/auth/signup/officer')
        .send({ name: 'x', phone: phone(), password: PW, group_code: ag.code, terms_version: terms })
        .expect(404);
      expect(old.body.code).toBe('GROUP_CODE_INVALID');
      await signupOfficer(res.body.group_code);
    });
  });

  describe('admin manages users', () => {
    it('list filters by role and phone; detail is logged', async () => {
      const o = await owner();
      const byPhone = await as(admin.cookie).get(`/api/v1/admin/users?q=${o.phone.slice(0, 3)}-${o.phone.slice(3)}`).expect(200);
      expect(byPhone.body.data.map((u: { id: string }) => u.id)).toContain(o.id);
      const admins = await as(admin.cookie).get('/api/v1/admin/users?role=admin').expect(200);
      expect(admins.body.data.every((u: { roles: { role: string }[] }) => u.roles.some((r) => r.role === 'admin'))).toBe(true);

      const d = await as(admin.cookie).get(`/api/v1/admin/users/${o.id}`).expect(200);
      expect(d.body).toMatchObject({ id: o.id, house_no: '1', plan: { code: 'free' }, active_sessions: 1 });
      expect(d.text).not.toMatch(/password_hash|token_hash|token_version/);
      const log = await pool.query(`SELECT 1 FROM app.data_access_log_tb WHERE subject_kind = 'user' AND subject_id = $1`, [o.id]);
      expect(log.rows).toHaveLength(1);
    });

    it('disable kicks every session; admin cannot change themself', async () => {
      const o = await owner();
      await as(admin.cookie).patch(`/api/v1/admin/users/${o.id}`, { status: 'disabled' }).expect(200);
      expect((await as(o.cookie).get('/api/v1/me').expect(401)).body.code).toMatch(/SESSION_REVOKED|ACCOUNT_DISABLED/);
      const self = await as(admin.cookie).patch(`/api/v1/admin/users/${admin.id}`, { status: 'disabled' }).expect(403);
      expect(self.body.code).toBe('CANNOT_CHANGE_SELF');
      await as(admin.cookie).put(`/api/v1/admin/users/${admin.id}/roles/admin`, { status: 'disabled' }).expect(403);
    });

    it('roles: add, admin exclusivity, removing officer also leaves the agency', async () => {
      const ag = await readyAgency();
      const off = await signupOfficer(ag.code);
      await as(ag.cookie).post(`/api/v1/agency/members/${off.id}/approve`).expect(200);

      await as(admin.cookie).put(`/api/v1/admin/users/${off.id}/roles/owner`).expect(200);
      expect((await as(off.cookie).get('/api/v1/me').expect(200)).body.roles).toEqual(['owner', 'officer']);
      const ex = await as(admin.cookie).put(`/api/v1/admin/users/${off.id}/roles/admin`).expect(403);
      expect(ex.body.code).toBe('ADMIN_ROLE_EXCLUSIVE');

      await as(admin.cookie).delete(`/api/v1/admin/users/${off.id}/roles/officer`).expect(200);
      expect((await as(off.cookie).get('/api/v1/me').expect(200)).body).toMatchObject({ roles: ['owner'], agency_status: 'disabled' });
      await as(admin.cookie).delete(`/api/v1/admin/users/${off.id}/roles/officer`).expect(404);
      await as(admin.cookie).put(`/api/v1/admin/users/${off.id}/roles/head`).expect(400);
    });

    it('admin can reset anyone (including a homeowner-officer)', async () => {
      const o = await owner();
      const res = await as(admin.cookie).post(`/api/v1/admin/users/${o.id}/reset-password`).expect(200);
      await signin(o.phone, res.body.temp_password);
      await as(admin.cookie).post(`/api/v1/admin/users/${admin.id}/reset-password`).expect(403);
    });
  });
});
