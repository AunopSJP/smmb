import { randomBytes, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { SHORT_WINDOW, allDayWindows } from './all-day-zone.js';
import { acceptPendingHouses } from './zone-consent.js';
import { BoxConfigService } from '../src/box/box-config.service.js';
import { SosService } from '../src/sos/sos.service.js';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { signRequest } from '../src/box/box-crypto.js';
import { PG_POOL } from '../src/db/db.module.js';
import { PUSH_SENDER, type PushSender } from '../src/push/push.sender.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';

class SilentSender implements PushSender {
  readonly enabled = true;
  readonly publicKey = 'k';
  async send() {}
}

interface Registered {
  box_id: string;
  device_secret: string;
  qr: { slot: 1 | 2 | 'activate'; url: string; print_code: string }[];
}


// แอดมินระงับ/เปิดคืนหน่วยงาน (api.md §9.2 · issue #14)
describe('Agency suspension (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 0;
  const phone = () => `05${run.slice(-5)}${String(seq++).padStart(3, '0')}`;
  const PW = 'password123';
  const nowS = () => Math.floor(Date.now() / 1000);

  const http = () => request(app.getHttpServer());
  const sid = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body: object = {}) => http().post(url).set('Cookie', cookie).send(body),
    put: (url: string, body: object = {}) => http().put(url).set('Cookie', cookie).send(body),
  });
  const box = (b: Registered, method: 'GET' | 'POST', path: string, body?: object) => {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const ts = String(nowS());
    const nonce = randomBytes(6).toString('hex');
    const r = (method === 'GET' ? http().get(path) : http().post(path)).set({
      'X-Box-Id': b.box_id,
      'X-Timestamp': ts,
      'X-Nonce': nonce,
      'X-Signature': signRequest(b.device_secret, method, path, ts, nonce, raw),
    });
    return raw ? r.set('Content-Type', 'application/json').send(raw) : r;
  };
  const enablePush = (cookie: string) =>
    as(cookie)
      .post('/api/v1/me/push/subscriptions', { endpoint: `https://fcm.googleapis.com/fcm/send/in-${run}-${seq++}`, keys: { p256dh: 'p', auth: 'a' } })
      .expect(201);

  let admin: { id: string; cookie: string };

  /** หน่วยงาน (อนุมัติแล้ว) + หัวหน้า + เจ้าหน้าที่ 1 คน (เปิดแจ้งเตือนแล้วทั้งคู่) */
  const agency = async () => {
    const res = await http()
      .post('/api/v1/auth/signup/agency')
      .send({ agency: { name: `สภ.${run}-${seq++}`, type: 'police', contact: 'สถานี 02-111-2222' }, head: { name: 'หัวหน้า', phone: phone(), password: PW }, terms_version: terms })
      .expect(201);
    const code = (await as(admin.cookie).post(`/api/v1/admin/agencies/${res.body.agency.id}/approve`).expect(200)).body.group_code;
    const head = sid(res);
    await enablePush(head);
    const o = await http()
      .post('/api/v1/auth/signup/officer')
      .send({ name: 'ส.ต.ต. สมชาย', phone: phone(), password: PW, group_code: code, terms_version: terms })
      .expect(201);
    await as(head).post(`/api/v1/agency/members/${o.body.id}/approve`).expect(200);
    const officer = { id: o.body.id as string, cookie: sid(o) };
    await enablePush(officer.cookie);
    return { head, officer, name: res.body.agency.name as string };
  };

  /** ตู้มีเจ้าของ + อยู่ในโซนของเจ้าหน้าที่ · windows = เวลาตรวจของโซน */
  const setup = async (windows?: [string, string][]) => {
    const [b] = (await as(admin.cookie).post('/api/v1/admin/boxes', { count: 1 }).expect(201)).body as Registered[];
    const o = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'เจ้าของ', phone: phone(), password: PW, house_no: `7/${seq}`, terms_version: terms })
      .expect(201);
    const owner = { id: o.body.id as string, cookie: sid(o) };
    await as(owner.cookie).post('/api/v1/boxes/activate', { qr_text: b.qr[2].url }).expect(200);
    // ✅ 2026-11-16 บ้านต้องข้อมูลครบ (ที่อยู่ + พื้นที่มาตรฐาน + หมุด) จึงเพิ่มเข้าโซนได้
    await http()
      .patch(`/api/v1/boxes/${b.box_id}`)
      .set('Cookie', owner.cookie)
      .send({ address_line: 'ซอย 3', subdistrict: 'ลาดยาว', district: 'จตุจักร', province: 'กรุงเทพมหานคร', lat: 13.7563, lng: 100.5018 })
      .expect(200);
    const ag = await agency();
    const zone = (await as(ag.head).post('/api/v1/agency/zones', { name: `โซน ${seq++}`, windows: windows ?? SHORT_WINDOW }).expect(201)).body;
    if (!windows) await allDayWindows(pool, zone.id); // ไม่ระบุ = ตรวจได้ทั้งวัน
    await as(ag.head).put(`/api/v1/agency/zones/${zone.id}/houses`, { box_ids: [b.box_id] }).expect(200);
    await acceptPendingHouses(pool);
    await as(ag.head).put(`/api/v1/agency/zones/${zone.id}/officers`, { user_ids: [ag.officer.id] }).expect(200);
    return { b, owner, ...ag };
  };

  /** ตู้ถือ long-poll รอ แล้วสั่ง fn (เช่นเจ้าหน้าที่สแกน) → คืนคำตอบของ poll */
  const pollWhile = async (b: Registered, fn: () => Promise<unknown>) => {
    const poll = box(b, 'GET', '/v1/box/jobs?wait=10').then((r) => r);
    await new Promise((r) => setTimeout(r, 300));
    const out = await fn();
    return { poll: await poll, out };
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

  const suspend = (id: string, reason = 'ใบอนุญาตหมดอายุ') => as(admin.cookie).post(`/api/v1/admin/agencies/${id}/suspend`, { reason });
  const restore = (id: string) => as(admin.cookie).post(`/api/v1/admin/agencies/${id}/restore`);
  const agencyIdOf = async (userId: string) =>
    (await pool.query(`SELECT agency_id FROM app.agency_member_tb WHERE user_id = $1`, [userId])).rows[0].agency_id as string;
  const headIdOf = async (agencyId: string) =>
    (await pool.query(`SELECT user_id FROM app.agency_member_tb WHERE agency_id = $1 AND is_head`, [agencyId])).rows[0].user_id as string;
  const sent = async (userId: string, type: string) =>
    (await pool.query(`SELECT data FROM app.notification_tb WHERE user_id = $1 AND type = $2`, [userId, type])).rows;
  const windowsOf = async (boxId: string) => (await app.get(BoxConfigService).forBox(boxId)).config.windows;

  it('needs a reason, only an approved agency, admin only, and is audited', async () => {
    const s = await setup();
    const id = await agencyIdOf(s.officer.id);
    await as(admin.cookie).post(`/api/v1/admin/agencies/${id}/suspend`).expect(400);
    await suspend(id, '   ').expect(400);
    await as(s.head).post(`/api/v1/admin/agencies/${id}/suspend`, { reason: 'ไม่ใช่แอดมิน' }).expect(404);
    expect((await restore(id).expect(409)).body.code).toBe('AGENCY_NOT_SUSPENDED');
    await suspend(id).expect(200);
    expect((await suspend(id).expect(409)).body.code).toBe('AGENCY_NOT_APPROVED');
    expect((await as(admin.cookie).get(`/api/v1/admin/agencies/${id}`).expect(200)).body).toMatchObject({
      status: 'suspended',
      suspend_reason: 'ใบอนุญาตหมดอายุ',
      suspended_at: expect.any(String),
    });
    const listed = (await as(admin.cookie).get('/api/v1/admin/agencies?status=suspended').expect(200)).body;
    expect(listed.map((a: { id: string }) => a.id)).toContain(id);
    await restore(id).expect(200);
    const audit = await pool.query(
      `SELECT action, detail FROM app.admin_audit_log_tb WHERE subject_id = $1 AND action IN ('agency.suspend','agency.restore') ORDER BY created_date`,
      [id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual(['agency.suspend', 'agency.restore']);
    expect(audit.rows[0].detail).toEqual({ reason: 'ใบอนุญาตหมดอายุ' });
  });

  it('members lose officer/head (session stays, owner role works); windows, coverage, group code and SOS stop; restore brings everything back', async () => {
    const s = await setup();
    const id = await agencyIdOf(s.officer.id);
    const code = (await as(s.head).get('/api/v1/agency').expect(200)).body.group_code as string;
    // เจ้าหน้าที่เป็นเจ้าของบ้านด้วย
    await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'owner')`, [s.officer.id]);
    expect((await windowsOf(s.b.box_id)).length).toBeGreaterThan(0);

    await suspend(id).expect(200);

    const me = (await as(s.officer.cookie).get('/api/v1/me').expect(200)).body;
    expect(me).toMatchObject({ agency_status: 'suspended', roles: ['owner'] });
    await as(s.officer.cookie).get('/api/v1/me/zone-requests').expect(200);
    expect((await as(s.officer.cookie).get('/api/v1/officer/summary').expect(403)).body.code).toBe('AGENCY_SUSPENDED');
    expect((await as(s.officer.cookie).post('/api/v1/inspections', { qr_text: s.b.qr[0].url }).expect(403)).body.code).toBe('AGENCY_SUSPENDED');
    expect((await as(s.head).get('/api/v1/agency/members').expect(403)).body.code).toBe('AGENCY_SUSPENDED');
    expect((await as(s.head).get('/api/v1/agency').expect(200)).body).toMatchObject({ status: 'suspended', group_code: null, suspend_reason: 'ใบอนุญาตหมดอายุ' });

    expect(await windowsOf(s.b.box_id)).toEqual([]);
    expect((await as(s.owner.cookie).get(`/api/v1/boxes/${s.b.box_id}`).expect(200)).body.coverage).toEqual({ has_officer: false, agency_names: [] });
    expect((await as(s.owner.cookie).get(`/api/v1/boxes/${s.b.box_id}/agencies`).expect(200)).body).toEqual([expect.objectContaining({ id, suspended: true })]);
    expect((await as(s.owner.cookie).post('/api/v1/sos', { box_id: s.b.box_id }).expect(200)).body.code).toBe('SOS_NO_COVERAGE');
    expect(await sent(s.owner.id, 'agency_suspended')).toEqual([{ data: expect.objectContaining({ agency_name: s.name, box_id: s.b.box_id }) }]);
    const join = await http()
      .post('/api/v1/auth/signup/officer')
      .send({ name: 'ใหม่', phone: phone(), password: PW, group_code: code, terms_version: terms })
      .expect(404);
    expect(join.body.code).toBe('GROUP_CODE_INVALID');

    await restore(id).expect(200);

    expect((await as(s.officer.cookie).get('/api/v1/me').expect(200)).body.agency_status).toBe('active');
    const summary = (await as(s.officer.cookie).get('/api/v1/officer/summary').expect(200)).body;
    expect(summary.houses.map((h: { box_id: string }) => h.box_id)).toEqual([s.b.box_id]);
    expect((await as(s.head).get('/api/v1/agency').expect(200)).body).toMatchObject({ status: 'approved', group_code: code, suspend_reason: null });
    expect((await windowsOf(s.b.box_id)).length).toBeGreaterThan(0);
    expect((await as(s.owner.cookie).get('/api/v1/me/zone-requests').expect(200)).body).toEqual([]); // ไม่ขอความยินยอมใหม่
  });

  it('a house that ends coverage while suspended stays out after restore', async () => {
    const s = await setup();
    const id = await agencyIdOf(s.officer.id);
    await suspend(id).expect(200);
    await http().delete(`/api/v1/boxes/${s.b.box_id}/agencies/${id}`).set('Cookie', s.owner.cookie).expect(200);
    await restore(id).expect(200);
    expect((await as(s.officer.cookie).get('/api/v1/officer/summary').expect(200)).body.houses).toEqual([]);
    expect(await windowsOf(s.b.box_id)).toEqual([]);
  });

  it('a pending zone request cannot be accepted while suspended, and can after restore', async () => {
    const s = await setup();
    const id = await agencyIdOf(s.officer.id);
    await http().delete(`/api/v1/boxes/${s.b.box_id}/agencies/${id}`).set('Cookie', s.owner.cookie).expect(200);
    const zone = (await as(s.head).post('/api/v1/agency/zones', { name: `โซน ${seq++}`, windows: SHORT_WINDOW }).expect(201)).body;
    await as(s.head).put(`/api/v1/agency/zones/${zone.id}/houses`, { box_ids: [s.b.box_id] }).expect(200);
    const [pending] = (await as(s.owner.cookie).get('/api/v1/me/zone-requests').expect(200)).body;
    await suspend(id).expect(200);
    expect((await as(s.owner.cookie).get('/api/v1/me/zone-requests').expect(200)).body).toEqual([]);
    expect((await as(s.owner.cookie).post(`/api/v1/me/zone-requests/${pending.id}/accept`).expect(409)).body.code).toBe('AGENCY_SUSPENDED');
    await restore(id).expect(200);
    await as(s.owner.cookie).post(`/api/v1/me/zone-requests/${pending.id}/accept`).expect(200);
  });

  it('an open inspection is closed: the box result no longer passes', async () => {
    const s = await setup();
    const { out } = await pollWhile(s.b, () => as(s.officer.cookie).post('/api/v1/inspections', { qr_text: s.b.qr[0].url }).expect(201));
    const ins = (out as request.Response).body;
    await box(s.b, 'POST', `/v1/box/jobs/${ins.job_id}/ready`, {}).expect(200);
    const badge = (await as(s.officer.cookie).get(`/api/v1/inspections/${ins.id}/badge`).expect(200)).body.qr as string;
    await suspend(await agencyIdOf(s.officer.id)).expect(200);
    const r = await box(s.b, 'POST', `/v1/box/jobs/${ins.job_id}/result`, { attempt: 1, read_ok: true, qr_text: badge, read_ms: 900 });
    expect(r.body.status).not.toBe('pass');
    const row = await pool.query(`SELECT status, checked_date FROM app.inspection_tb WHERE inspection_id = $1`, [ins.id]);
    expect(row.rows[0]).toEqual({ status: 'open', checked_date: null });
  });

  it('an accepted SOS is returned at once; the suspended agency sees no more of it, the other agency carries on', async () => {
    const s = await setup();
    const id = await agencyIdOf(s.officer.id);
    const other = await agency();
    const zone = (await as(other.head).post('/api/v1/agency/zones', { name: `โซน ${seq++}`, windows: SHORT_WINDOW }).expect(201)).body;
    await as(other.head).put(`/api/v1/agency/zones/${zone.id}/houses`, { box_ids: [s.b.box_id] }).expect(200);
    await acceptPendingHouses(pool);
    await as(other.head).put(`/api/v1/agency/zones/${zone.id}/officers`, { user_ids: [other.officer.id] }).expect(200);
    // ผู้รับเป็นเจ้าของบ้านด้วย → ยังเข้า GET /sos/:id ได้ตาม route แต่ต้องไม่เห็นเรื่องนี้
    await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'owner')`, [s.officer.id]);

    const sos = (await as(s.owner.cookie).post('/api/v1/sos', { box_id: s.b.box_id }).expect(201)).body;
    await as(s.officer.cookie).post(`/api/v1/sos/${sos.id}/accept`).expect(200);
    await suspend(id).expect(200); // ไม่เรียกตัวจับเวลาเอง — ต้องคืนทันที

    expect((await as(s.owner.cookie).get(`/api/v1/sos/${sos.id}`).expect(200)).body).toMatchObject({
      status: 'open',
      accepted_by: null,
      returned_at: expect.any(String),
    });
    expect(await sent(s.owner.id, 'sos_returned')).toHaveLength(1);
    await as(s.officer.cookie).get(`/api/v1/sos/${sos.id}`).expect(404);
    await app.get(SosService).repeatAll(new Date(Date.now() + 61_000));
    expect(await sent(s.officer.id, 'sos_new')).toHaveLength(1);
    await as(other.officer.cookie).post(`/api/v1/sos/${sos.id}/accept`).expect(200);
    expect(await sent(s.officer.id, 'sos_taken')).toHaveLength(0);
    expect(await sent(await headIdOf(id), 'sos_taken')).toHaveLength(0);
  });
});
