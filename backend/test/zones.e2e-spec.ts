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

// โซน (api.md §8.3) + ช่องทางติดต่อหน่วยงาน/ผู้ดูแล (api.md §3.1)
describe('Zones + contacts (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 0;
  const phone = () => `07${run}${String(seq++).padStart(2, '0')}`;
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
  const enablePush = (cookie: string) =>
    as(cookie)
      .post('/api/v1/me/push/subscriptions', {
        endpoint: `https://fcm.googleapis.com/fcm/send/zn-${run}-${seq++}`,
        keys: { p256dh: 'p', auth: 'a' },
      })
      .expect(201);

  let admin: { id: string; cookie: string };

  const signupAgency = async (contact = 'สถานี 02-111-2222') => {
    const p = phone();
    const res = await http()
      .post('/api/v1/auth/signup/agency')
      .send({ agency: { name: `หน่วย ${run}-${seq++}`, type: 'police', contact }, head: { name: 'หัวหน้า', phone: p, password: PW }, terms_version: terms })
      .expect(201);
    return { headId: res.body.id as string, agencyId: res.body.agency.id as string, cookie: sid(res) };
  };
  /** หน่วยงานอนุมัติแล้ว + หัวหน้าเปิดแจ้งเตือน + ลูกทีม active 1 คน */
  const readyAgency = async () => {
    const ag = await signupAgency();
    const code = (await as(admin.cookie).post(`/api/v1/admin/agencies/${ag.agencyId}/approve`).expect(200)).body.group_code;
    await enablePush(ag.cookie);
    const o = await http()
      .post('/api/v1/auth/signup/officer')
      .send({ name: 'ส.ต.ต. ลูกทีม', phone: phone(), password: PW, group_code: code, terms_version: terms })
      .expect(201);
    const officer = { id: o.body.id as string, cookie: sid(o) };
    await as(ag.cookie).post(`/api/v1/agency/members/${officer.id}/approve`).expect(200);
    return { ...ag, code, officer };
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

    const res = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'แอดมิน', phone: phone(), password: PW, house_no: '1', terms_version: terms })
      .expect(201);
    await pool.query(`DELETE FROM app.user_role_tb WHERE user_id = $1`, [res.body.id]);
    await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'admin')`, [res.body.id]);
    admin = { id: res.body.id, cookie: sid(res) };
  });

  beforeEach(() => counters.clear());
  afterAll(async () => app.close());

  describe('terms', () => {
    it('the real terms ship with the migrations and say SOS does not replace 191', async () => {
      // ไม่เช็ก "ฉบับปัจจุบัน" ตรง ๆ — เทสต์ไฟล์อื่นเพิ่มฉบับทดสอบที่ใหม่กว่าในฐานข้อมูลเดียวกัน
      const { rows } = await pool.query(`SELECT body_md FROM app.terms_tb WHERE terms_version = '2026-10-27'`);
      expect(rows[0]?.body_md).toContain('191');
      expect(rows[0]?.body_md).toContain('<!-- en -->');
    });
  });

  describe('contacts', () => {
    it('agency sign-up requires a contact, and people who ask to join see it', async () => {
      await http()
        .post('/api/v1/auth/signup/agency')
        .send({ agency: { name: 'x', type: 'police' }, head: { name: 'h', phone: phone(), password: PW }, terms_version: terms })
        .expect(400);

      const ag = await readyAgency();
      const pending = await http()
        .post('/api/v1/auth/signup/officer')
        .send({ name: 'รอ', phone: phone(), password: PW, group_code: ag.code, terms_version: terms })
        .expect(201);
      expect(pending.body).toMatchObject({ agency_status: 'pending', agency: { contact: 'สถานี 02-111-2222' } });
    });

    it('the head can change the agency contact; others cannot', async () => {
      const ag = await readyAgency();
      await as(ag.cookie).patch('/api/v1/agency', { contact: 'ป้อมยาม 081-111-2222' }).expect(200);
      expect((await as(ag.cookie).get('/api/v1/agency').expect(200)).body.contact).toBe('ป้อมยาม 081-111-2222');
      await as(ag.officer.cookie).patch('/api/v1/agency', { contact: 'hack' }).expect(404);
      await as(ag.cookie).patch('/api/v1/agency', { contact: 'x' }).expect(400);
    });

    it('support contact: public to read, only admins can set it', async () => {
      const ag = await readyAgency();
      await as(ag.cookie).put('/api/v1/admin/settings/support-contact', { contact: 'x' }).expect(404);
      await as(admin.cookie).put('/api/v1/admin/settings/support-contact', { contact: 'ผู้ดูแล 02-999-9999' }).expect(200);
      expect((await http().get('/api/v1/support').expect(200)).body).toEqual({ contact: 'ผู้ดูแล 02-999-9999' });
    });
  });

  describe('zones', () => {
    it('create, list with "mine" filter, get, rename, change windows, delete', async () => {
      const ag = await readyAgency();
      const z = await as(ag.cookie)
        .post('/api/v1/agency/zones', { name: 'โซน A', windows: [['17:00', '21:00'], ['06:00', '09:00']] })
        .expect(201);
      expect(z.body).toMatchObject({ name: 'โซน A', windows: [['06:00', '09:00'], ['17:00', '21:00']], tz: 'Asia/Bangkok', houses_count: 0, officers_count: 0, is_mine: false });

      await as(ag.cookie).put(`/api/v1/agency/zones/${z.body.id}/officers`, { user_ids: [ag.headId, ag.officer.id] }).expect(200);
      await as(ag.cookie).post('/api/v1/agency/zones', { name: 'โซน B', windows: [] }).expect(201);

      const all = await as(ag.cookie).get('/api/v1/agency/zones').expect(200);
      expect(all.body.map((x: { name: string }) => x.name)).toEqual(['โซน A', 'โซน B']);
      const mine = await as(ag.cookie).get('/api/v1/agency/zones?zone=mine').expect(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0]).toMatchObject({ name: 'โซน A', is_mine: true, officers_count: 2 });

      const detail = await as(ag.cookie).get(`/api/v1/agency/zones/${z.body.id}`).expect(200);
      expect(detail.body.officers.map((m: { id: string }) => m.id).sort()).toEqual([ag.headId, ag.officer.id].sort());
      expect(detail.body.houses).toEqual([]);
      // ไม่มีข้อมูลเกินที่ประกาศ (กฎข้อ 12)
      expect(JSON.stringify(detail.body)).not.toMatch(/password_hash|token_hash|token_version/);

      const renamed = await as(ag.cookie).patch(`/api/v1/agency/zones/${z.body.id}`, { name: 'โซน A1', windows: [['18:00', '20:00']] }).expect(200);
      expect(renamed.body).toMatchObject({ name: 'โซน A1', windows: [['18:00', '20:00']] });

      await as(ag.cookie).delete(`/api/v1/agency/zones/${z.body.id}`).expect(200);
      await as(ag.cookie).get(`/api/v1/agency/zones/${z.body.id}`).expect(404);
      const members = await as(ag.cookie).get('/api/v1/agency/members').expect(200);
      expect(members.body.every((m: { zones: unknown[] }) => m.zones.length === 0)).toBe(true);
    });

    it('rejects bad windows and duplicate names', async () => {
      const ag = await readyAgency();
      const bad = await as(ag.cookie).post('/api/v1/agency/zones', { name: 'ข้ามคืน', windows: [['22:00', '02:00']] }).expect(400);
      expect(bad.body.code).toBe('WINDOWS_INVALID');
      await as(ag.cookie).post('/api/v1/agency/zones', { name: 'Zone X', windows: [] }).expect(201);
      const dup = await as(ag.cookie).post('/api/v1/agency/zones', { name: 'zone x', windows: [] }).expect(409);
      expect(dup.body.code).toBe('ZONE_NAME_TAKEN');
    });

    it('only active members of this agency can be put in a zone', async () => {
      const ag = await readyAgency();
      const other = await readyAgency();
      const z = (await as(ag.cookie).post('/api/v1/agency/zones', { name: 'A', windows: [] }).expect(201)).body;
      const res = await as(ag.cookie).put(`/api/v1/agency/zones/${z.id}/officers`, { user_ids: [other.officer.id] }).expect(400);
      expect(res.body.code).toBe('OFFICER_NOT_MEMBER');
      // ปิดสิทธิ์สมาชิก = ออกจากทุกโซน
      await as(ag.cookie).put(`/api/v1/agency/zones/${z.id}/officers`, { user_ids: [ag.officer.id] }).expect(200);
      await as(ag.cookie).patch(`/api/v1/agency/members/${ag.officer.id}/status`, { is_active: false }).expect(200);
      expect((await as(ag.cookie).get(`/api/v1/agency/zones/${z.id}`).expect(200)).body.officers).toEqual([]);
    });

    it("another agency's zone is 404; officers and outsiders cannot use zone routes", async () => {
      const ag = await readyAgency();
      const other = await readyAgency();
      const z = (await as(ag.cookie).post('/api/v1/agency/zones', { name: 'A', windows: [] }).expect(201)).body;
      await as(other.cookie).get(`/api/v1/agency/zones/${z.id}`).expect(404);
      await as(other.cookie).patch(`/api/v1/agency/zones/${z.id}`, { name: 'x' }).expect(404);
      await as(other.cookie).delete(`/api/v1/agency/zones/${z.id}`).expect(404);
      await as(ag.officer.cookie).get('/api/v1/agency/zones').expect(404);
      await as(ag.cookie).get('/api/v1/agency/zones/not-a-uuid').expect(400);
    });
  });
});
