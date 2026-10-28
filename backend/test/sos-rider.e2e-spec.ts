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

interface Registered {
  box_id: string;
  device_secret: string;
  qr: { slot: 1 | 2 | 'activate'; url: string; print_code: string }[];
}

// ไรเดอร์ (api.md §5) + SOS (api.md §7) + หน้าหลักเจ้าของบ้าน (api.md §4.2–4.3)
describe('Rider + SOS + owner home (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 0;
  const phone = () => `04${run}${String(seq++).padStart(2, '0')}`;
  const PW = 'password123';

  const http = () => request(app.getHttpServer());
  const sid = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body: object = {}) => http().post(url).set('Cookie', cookie).send(body),
    put: (url: string, body: object = {}) => http().put(url).set('Cookie', cookie).send(body),
  });
  const enablePush = (cookie: string) =>
    as(cookie)
      .post('/api/v1/me/push/subscriptions', { endpoint: `https://fcm.googleapis.com/fcm/send/sr-${run}-${seq++}`, keys: { p256dh: 'p', auth: 'a' } })
      .expect(201);
  const token = (b: Registered, slot: 1 | 2 = 1) => b.qr.find((q) => q.slot === slot)!.url.split('/b/')[1];

  let admin: { id: string; cookie: string };

  const owner = async (house = '9/1') => {
    const o = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'สมศรี', phone: phone(), password: PW, house_no: house, terms_version: terms })
      .expect(201);
    return { id: o.body.id as string, cookie: sid(o), phone: o.body.phone as string };
  };
  const boundBox = async (house = '9/1') => {
    const [b] = (await as(admin.cookie).post('/api/v1/admin/boxes', { count: 1 }).expect(201)).body as Registered[];
    const o = await owner(house);
    await as(o.cookie).post('/api/v1/boxes/activate', { qr_text: b.qr[2].url }).expect(200);
    return { b, owner: o };
  };
  /** หน่วยงาน + หัวหน้า (ไม่อยู่ในโซน) + เจ้าหน้าที่ในโซนที่มีบ้านนี้ */
  const agencyCovering = async (boxId: string | null) => {
    const res = await http()
      .post('/api/v1/auth/signup/agency')
      .send({ agency: { name: `หน่วย ${run}-${seq++}`, type: 'guard', contact: 'ป้อม 02-000-0000' }, head: { name: 'หัวหน้า', phone: phone(), password: PW }, terms_version: terms })
      .expect(201);
    const code = (await as(admin.cookie).post(`/api/v1/admin/agencies/${res.body.agency.id}/approve`).expect(200)).body.group_code;
    const head = { id: res.body.id as string, cookie: sid(res) };
    await enablePush(head.cookie);
    const o = await http()
      .post('/api/v1/auth/signup/officer')
      .send({ name: `ส.ต.ต. ${seq}`, phone: phone(), password: PW, group_code: code, terms_version: terms })
      .expect(201);
    const officer = { id: o.body.id as string, cookie: sid(o) };
    await as(head.cookie).post(`/api/v1/agency/members/${officer.id}/approve`).expect(200);
    await enablePush(officer.cookie);
    if (boxId) {
      const z = (await as(head.cookie).post('/api/v1/agency/zones', { name: `z${seq++}`, windows: [['00:00', '23:59']] }).expect(201)).body;
      await as(head.cookie).put(`/api/v1/agency/zones/${z.id}/houses`, { box_ids: [boxId] }).expect(200);
      await as(head.cookie).put(`/api/v1/agency/zones/${z.id}/officers`, { user_ids: [officer.id] }).expect(200);
    }
    return { head, officer, name: res.body.agency.name as string };
  };
  const notified = async (userId: string, type: string) =>
    (await pool.query(`SELECT data FROM app.notification_tb WHERE user_id = $1 AND type = $2 ORDER BY created_date`, [userId, type])).rows;
  const ageStage = (id: string) =>
    pool.query(`UPDATE app.sos_case_tb SET stage_changed_date = now() - interval '31 seconds' WHERE sos_case_id = $1`, [id]);

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

  describe('rider', () => {
    it('scan → deliver → owner notified and sees it in history; a ticket works once', async () => {
      const { b, owner: o } = await boundBox('12/7');
      const scan = await http().get(`/api/v1/public/qr/${token(b)}`).expect(200);
      expect(scan.body).toMatchObject({ house_no: '12/7', box_status: 'active', delivery_ticket: expect.stringMatching(/^SMMB-T1\./) });
      expect(JSON.stringify(scan.body)).not.toMatch(/สมศรี|phone|owner/);

      await http().post('/api/v1/public/deliveries').send({ delivery_ticket: scan.body.delivery_ticket }).expect(201);
      expect((await http().post('/api/v1/public/deliveries').send({ delivery_ticket: scan.body.delivery_ticket }).expect(410)).body.code).toBe('TICKET_EXPIRED');
      expect(await notified(o.id, 'delivered')).toHaveLength(1);

      const home = (await as(o.cookie).get(`/api/v1/boxes/${b.box_id}`).expect(200)).body;
      expect(home.latest_events[0]).toMatchObject({ type: 'delivered', method: 'scan', qr_slot: 1 });
      expect(home.coverage).toEqual({ has_officer: false, agency_names: [] });
      const other = await owner();
      await as(other.cookie).get(`/api/v1/boxes/${b.box_id}`).expect(404);
    });

    it('typing the code works (any case/dashes); wrong codes and forged tickets are refused', async () => {
      const { b } = await boundBox();
      const code = b.qr[1].print_code.toLowerCase();
      const r = await http().get(`/api/v1/public/codes/${code}`).expect(200);
      await http().post('/api/v1/public/deliveries').send({ delivery_ticket: r.body.delivery_ticket }).expect(201);
      expect((await http().get('/api/v1/public/codes/AAAA-AAAA').expect(404)).body.code).toBe('QR_INVALID');
      await http().get('/api/v1/public/qr/BX00001-1-AAAAAA').expect(404);
      const forged = r.body.delivery_ticket.slice(0, -3) + 'AAA';
      await http().post('/api/v1/public/deliveries').send({ delivery_ticket: forged }).expect(410);
    });

    it('5 deliveries an hour per mailbox, then DELIVERY_LIMIT', async () => {
      const { b } = await boundBox();
      for (let i = 0; i < 5; i++) {
        const t = (await http().get(`/api/v1/public/qr/${token(b)}`).expect(200)).body.delivery_ticket;
        await http().post('/api/v1/public/deliveries').send({ delivery_ticket: t }).expect(201);
      }
      const t = (await http().get(`/api/v1/public/qr/${token(b)}`).expect(200)).body.delivery_ticket;
      expect((await http().post('/api/v1/public/deliveries').send({ delivery_ticket: t }).expect(429)).body.code).toBe('DELIVERY_LIMIT');
    });

    it('a mailbox with no owner is shown as not in service', async () => {
      const [b] = (await as(admin.cookie).post('/api/v1/admin/boxes', { count: 1 }).expect(201)).body as Registered[];
      const r = await http().get(`/api/v1/public/qr/${token(b)}`).expect(200);
      expect(r.body.box_status).toBe('service_closed');
      expect((await http().post('/api/v1/public/deliveries').send({ delivery_ticket: r.body.delivery_ticket }).expect(403)).body.code).toBe('BOX_SERVICE_CLOSED');
    });
  });

  describe('SOS', () => {
    it('a house in no zone gets SOS_NO_COVERAGE (call 191/1669) and nothing is created', async () => {
      const { b, owner: o } = await boundBox();
      const r = await as(o.cookie).post('/api/v1/sos', { box_id: b.box_id }).expect(200);
      expect(r.body).toEqual({ code: 'SOS_NO_COVERAGE', call: ['191', '1669'] });
      expect((await pool.query(`SELECT count(*)::int AS n FROM app.sos_case_tb WHERE box_id = $1`, [b.box_id])).rows[0].n).toBe(0);
    });

    it('zone officers of every agency get it first, then whole agencies, then "call yourself"; first to accept wins', async () => {
      const { b, owner: o } = await boundBox('55/5');
      const police = await agencyCovering(b.box_id);
      const guard = await agencyCovering(b.box_id);

      const sos = (await as(o.cookie).post('/api/v1/sos', { box_id: b.box_id }).expect(201)).body;
      expect(sos).toMatchObject({ status: 'open', stage: 'zone', accepted_by: null });
      expect((await as(o.cookie).post('/api/v1/sos', { box_id: b.box_id }).expect(409)).body).toMatchObject({ code: 'SOS_ALREADY_OPEN', sos: { id: sos.id } });

      // ขั้นโซน: เจ้าหน้าที่ในโซนของทั้งสองหน่วยงาน (หัวหน้าที่ไม่อยู่ในโซนยังไม่ได้)
      expect(await notified(police.officer.id, 'sos_new')).toHaveLength(1);
      expect(await notified(guard.officer.id, 'sos_new')).toHaveLength(1);
      expect(await notified(police.head.id, 'sos_new')).toHaveLength(0);
      await as(police.head.cookie).get(`/api/v1/sos/${sos.id}/card`).expect(404);
      const card = (await as(guard.officer.cookie).get(`/api/v1/sos/${sos.id}/card`).expect(200)).body;
      expect(card).toMatchObject({ house_no: '55/5', owner: { name: 'สมศรี', phone: o.phone } });

      // 30 วิ → ขั้นหน่วยงาน (หัวหน้าทุกหน่วยงานได้ด้วย)
      await ageStage(sos.id);
      expect((await as(o.cookie).get(`/api/v1/sos/${sos.id}`).expect(200)).body.stage).toBe('agency');
      expect(await notified(police.head.id, 'sos_new')).toHaveLength(1);
      expect(await notified(guard.head.id, 'sos_new')).toHaveLength(1);
      expect(await notified(police.officer.id, 'sos_new')).toHaveLength(1); // ไม่แจ้งซ้ำ

      // 60 วิ → ให้เจ้าของบ้านโทร 191 เอง (ยังเปิดรอคนรับต่อ)
      await ageStage(sos.id);
      expect((await as(o.cookie).get(`/api/v1/sos/${sos.id}`).expect(200)).body).toMatchObject({ stage: 'call_yourself', status: 'open' });

      // คนแรกได้ · คนที่สองได้ 409 + ชื่อคนที่รับ
      const acc = await as(guard.officer.cookie).post(`/api/v1/sos/${sos.id}/accept`).expect(200);
      expect(acc.body).toMatchObject({ status: 'accepted', mine: true });
      const late = await as(police.head.cookie).post(`/api/v1/sos/${sos.id}/accept`).expect(409);
      expect(late.body).toMatchObject({ code: 'SOS_ALREADY_TAKEN', accepted_by: { agency_name: guard.name } });
      expect(await notified(police.officer.id, 'sos_taken')).toHaveLength(1);

      // เจ้าของบ้านเห็นเบอร์คนรับเฉพาะตอนเปิดอยู่
      const ownerView = (await as(o.cookie).get(`/api/v1/sos/${sos.id}`).expect(200)).body;
      expect(ownerView.accepted_by).toMatchObject({ agency_name: guard.name, phone: expect.stringMatching(/^0\d{9}$/) });
      expect(await notified(o.id, 'sos_accepted')).toHaveLength(1);

      await as(police.officer.cookie).post(`/api/v1/sos/${sos.id}/close`, { note: 'x' }).expect(409);
      await as(guard.officer.cookie).post(`/api/v1/sos/${sos.id}/close`, { note: 'ตรวจแล้ว ปลอดภัย' }).expect(200);
      const closed = (await as(o.cookie).get(`/api/v1/sos/${sos.id}`).expect(200)).body;
      expect(closed).toMatchObject({ status: 'closed', close_note: 'ตรวจแล้ว ปลอดภัย' });
      expect(closed.accepted_by.phone).toBeNull();
      const list = (await as(guard.officer.cookie).get('/api/v1/sos?status=closed').expect(200)).body;
      expect(list.find((c: { id: string }) => c.id === sos.id).owner).toBeNull();

      // เห็นเบอร์ข้ามบทบาท → บันทึก data access log
      const log = await pool.query(`SELECT count(*)::int AS n FROM app.data_access_log_tb WHERE fields @> ARRAY['sos:' || $1]`, [sos.id]);
      expect(log.rows[0].n).toBeGreaterThan(0);
    });

    it('cancel tells everyone; accepting after cancel is 410; strangers get 404', async () => {
      const { b, owner: o } = await boundBox();
      const ag = await agencyCovering(b.box_id);
      const stranger = await agencyCovering(null);
      const sos = (await as(o.cookie).post('/api/v1/sos', { box_id: b.box_id }).expect(201)).body;
      await as(stranger.officer.cookie).get(`/api/v1/sos/${sos.id}`).expect(404);
      await as(stranger.officer.cookie).post(`/api/v1/sos/${sos.id}/accept`).expect(404);

      await as(o.cookie).post(`/api/v1/sos/${sos.id}/cancel`, { reason: 'mistake' }).expect(200);
      expect(await notified(ag.officer.id, 'sos_cancelled')).toHaveLength(1);
      expect((await as(ag.officer.cookie).post(`/api/v1/sos/${sos.id}/accept`).expect(410)).body.code).toBe('SOS_CANCELLED');
      expect((await as(o.cookie).post(`/api/v1/sos/${sos.id}/cancel`, { reason: 'safe' }).expect(409)).body.code).toBe('SOS_CLOSED');
    });

    it('the owner never gets their own SOS, even as an officer in that zone; no zone officers → straight to agency', async () => {
      const { b, owner: o } = await boundBox();
      const ag = await agencyCovering(b.box_id);
      // เจ้าของบ้านเป็นเจ้าหน้าที่หน่วยงานเดียวกันด้วย และอยู่ในโซนนั้น
      const code = (await as(ag.head.cookie).get('/api/v1/agency').expect(200)).body.group_code;
      await as(o.cookie).post('/api/v1/me/agency/join', { group_code: code, terms_version: terms }).expect(201);
      await as(ag.head.cookie).post(`/api/v1/agency/members/${o.id}/approve`).expect(200);
      const zones = (await as(ag.head.cookie).get('/api/v1/agency/zones').expect(200)).body;
      await as(ag.head.cookie).put(`/api/v1/agency/zones/${zones[0].id}/officers`, { user_ids: [o.id] }).expect(200); // เหลือแค่เจ้าของบ้าน

      const sos = (await as(o.cookie).post('/api/v1/sos', { box_id: b.box_id }).expect(201)).body;
      expect(sos.stage).toBe('agency'); // ไม่มีเจ้าหน้าที่อื่นในโซน → ข้ามไปขั้นหน่วยงาน
      expect(await notified(o.id, 'sos_new')).toHaveLength(0);
      expect(await notified(ag.officer.id, 'sos_new')).toHaveLength(1);
      expect(await notified(ag.head.id, 'sos_new')).toHaveLength(1);
    });

    it('the officer summary shows open SOS; the owner home shows it too', async () => {
      const { b, owner: o } = await boundBox();
      const ag = await agencyCovering(b.box_id);
      const sos = (await as(o.cookie).post('/api/v1/sos', { box_id: b.box_id }).expect(201)).body;
      const summary = (await as(ag.officer.cookie).get('/api/v1/officer/summary').expect(200)).body;
      expect(summary.open_sos.map((c: { id: string }) => c.id)).toEqual([sos.id]);
      const home = (await as(o.cookie).get(`/api/v1/boxes/${b.box_id}`).expect(200)).body;
      expect(home).toMatchObject({ open_sos: { id: sos.id, status: 'open' }, coverage: { has_officer: true, agency_names: [ag.name] } });
    });
  });
});
