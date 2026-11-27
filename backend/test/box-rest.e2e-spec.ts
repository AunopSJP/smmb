import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { SHORT_WINDOW, allDayWindows } from './all-day-zone.js';
import { acceptPendingHouses } from './zone-consent.js';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { localMinutes } from '../src/box/box-config.js';
import { signRequest } from '../src/box/box-crypto.js';
import { PG_POOL } from '../src/db/db.module.js';
import { PUSH_SENDER, type PushSender } from '../src/push/push.sender.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';
import { SchedulerService } from '../src/scheduler/scheduler.service.js';

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

// ตู้พักเมื่อตรวจครบ: ฟิลด์ `rest` · สถานะ sleeping ในช่วงตรวจ · ไม่แจ้งตู้หลุด (GLOSSARY.md · issue #15)
describe('Box rest after a complete patrol (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 0;
  const phone = () => `04${run.slice(-5)}${String(seq++).padStart(3, '0')}`;
  const PW = 'password123';

  const http = () => request(app.getHttpServer());
  const sid = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body: object = {}) => http().post(url).set('Cookie', cookie).send(body),
    put: (url: string, body: object = {}) => http().put(url).set('Cookie', cookie).send(body),
  });
  const box = (b: Registered, path: string, body: object) => {
    const raw = JSON.stringify(body);
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(6).toString('hex');
    return http()
      .post(path)
      .set({ 'X-Box-Id': b.box_id, 'X-Timestamp': ts, 'X-Nonce': nonce, 'X-Signature': signRequest(b.device_secret, 'POST', path, ts, nonce, raw) })
      .set('Content-Type', 'application/json')
      .send(raw);
  };
  const enablePush = (cookie: string) =>
    as(cookie)
      .post('/api/v1/me/push/subscriptions', { endpoint: `https://fcm.googleapis.com/fcm/send/rest-${run}-${seq++}`, keys: { p256dh: 'p', auth: 'a' } })
      .expect(201);

  let admin: { id: string; cookie: string };

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

  const boundBox = async () => {
    const [b] = (await as(admin.cookie).post('/api/v1/admin/boxes', { count: 1 }).expect(201)).body as Registered[];
    const o = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'เจ้าของ', phone: phone(), password: PW, house_no: `9/${seq}`, terms_version: terms })
      .expect(201);
    const owner = { id: o.body.id as string, cookie: sid(o) };
    await as(owner.cookie).post('/api/v1/boxes/activate', { qr_text: b.qr[2].url }).expect(200);
    await http()
      .patch(`/api/v1/boxes/${b.box_id}`)
      .set('Cookie', owner.cookie)
      .send({ address_line: 'ซอย 3', subdistrict: 'ลาดยาว', district: 'จตุจักร', province: 'กรุงเทพมหานคร', lat: 13.7563, lng: 100.5018 })
      .expect(200);
    return { b, owner };
  };

  /** หน่วยงานใหม่ + เจ้าหน้าที่ + โซนตรวจทั้งวันที่มีตู้นี้ */
  const agencyFor = async (b: Registered) => {
    const res = await http()
      .post('/api/v1/auth/signup/agency')
      .send({ agency: { name: `พัก ${run}-${seq++}`, type: 'police', contact: 'สถานี 02-111-2222' }, head: { name: 'หัวหน้า', phone: phone(), password: PW }, terms_version: terms })
      .expect(201);
    const id = res.body.agency.id as string;
    const code = (await as(admin.cookie).post(`/api/v1/admin/agencies/${id}/approve`).expect(200)).body.group_code;
    const head = sid(res);
    await enablePush(head);
    const o = await http()
      .post('/api/v1/auth/signup/officer')
      .send({ name: 'ส.ต.ต. สมชาย', phone: phone(), password: PW, group_code: code, terms_version: terms })
      .expect(201);
    await as(head).post(`/api/v1/agency/members/${o.body.id}/approve`).expect(200);
    const officer = sid(o);
    await enablePush(officer);
    const zone = (await as(head).post('/api/v1/agency/zones', { name: `โซน ${seq++}`, windows: SHORT_WINDOW }).expect(201)).body;
    await allDayWindows(pool, zone.id);
    await as(head).put(`/api/v1/agency/zones/${zone.id}/houses`, { box_ids: [b.box_id] }).expect(200);
    await acceptPendingHouses(pool);
    await as(head).put(`/api/v1/agency/zones/${zone.id}/officers`, { user_ids: [o.body.id] }).expect(200);
    return { id, officer, zoneId: zone.id as string };
  };

  /** เปลี่ยนเวลาตรวจของโซนเป็นช่วงที่เริ่มอีก `inMin` นาที ยาว 20 นาที (เวลาไทย) */
  const startsIn = async (zoneId: string, inMin: number) => {
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    // ไม่ให้เริ่ม 23:59 (เวลาจบจะเท่าเวลาเริ่ม ฐานข้อมูลไม่รับ)
    const start = Math.min((localMinutes(new Date()) + inMin) % 1440, 1438);
    await pool.query(`DELETE FROM app.zone_window_tb WHERE zone_id = $1::uuid`, [zoneId]);
    await pool.query(`INSERT INTO app.zone_window_tb (zone_id, start_time, end_time) VALUES ($1::uuid, $2, $3)`, [
      zoneId,
      hhmm(start),
      hhmm(Math.min(start + 20, 1439)),
    ]);
  };

  /** ตรวจจนตู้อ่าน QR ประจำตัวผ่าน → คืนคำตอบที่ตู้ได้ + ตัวส่งผลซ้ำ */
  const pass = async (b: Registered, officer: string) => {
    await pool.query(`UPDATE app.box_tb SET last_poll_date = now(), sleep_date = NULL WHERE box_id = $1`, [b.box_id]);
    const ins = (await as(officer).post('/api/v1/inspections', { qr_text: b.qr[0].url, scan_ms: 900 }).expect(201)).body;
    await box(b, `/v1/box/jobs/${ins.job_id}/ready`, { flash: false }).expect(200);
    const badge = (await as(officer).get(`/api/v1/inspections/${ins.id}/badge`).expect(200)).body;
    const send = () => box(b, `/v1/box/jobs/${ins.job_id}/result`, { attempt: 1, read_ok: true, qr_text: badge.qr, read_ms: 800 }).expect(200);
    return { body: (await send()).body, send };
  };

  const status = async (owner: string, boxId: string) => (await as(owner).get(`/api/v1/boxes/${boxId}`).expect(200)).body.status as string;
  /** ตู้ไม่ถาม long-poll มา 20 นาที */
  const quiet = (boxId: string) =>
    pool.query(`UPDATE app.box_tb SET last_poll_date = now() - interval '20 minutes', offline_notified_date = NULL WHERE box_id = $1`, [boxId]);
  const offlineAlerts = async (userId: string, boxId: string) => {
    // ตรวจ ณ เวลาจริง (ตรงกับที่ quiet() ตั้ง last_poll) · บีบให้อยู่ในช่วงตรวจทั้งวัน 00:30–23:50 เวลาไทย
    // (เดิมใช้เที่ยงของวันนี้ → รันช่วงบ่ายแล้ว last_poll อยู่หลังเวลาที่ตรวจ ตู้เลยดูเหมือนยังติดต่ออยู่)
    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
    const at = (hhmm: string) => new Date(`${today}T${hhmm}:00+07:00`).getTime();
    await app.get(SchedulerService).watchOffline(new Date(Math.min(Math.max(now.getTime(), at('00:30')), at('23:50'))));
    return (await pool.query(`SELECT 1 FROM app.notification_tb WHERE user_id = $1 AND type = 'box_offline' AND data->>'box_id' = $2`, [userId, boxId])).rowCount;
  };

  it('one agency: rest is true (also on a resent result) and a silent box counts as resting, not offline', async () => {
    const { b, owner } = await boundBox();
    const a = await agencyFor(b);
    await quiet(b.box_id);
    expect(await status(owner.cookie, b.box_id)).toBe('offline');

    const done = await pass(b, a.officer);
    expect(Object.keys(done.body).sort()).toEqual(['rest', 'server_time', 'status']);
    expect(done.body).toMatchObject({ status: 'pass', rest: true });
    expect((await done.send()).body).toMatchObject({ status: 'pass', rest: true });

    await box(b, '/v1/box/events', { type: 'sleeping' }).expect(200);
    // เพิ่งถามงานเมื่อครู่แต่แจ้งว่าหลับแล้ว → ตู้พักทันที
    expect(await status(owner.cookie, b.box_id)).toBe('sleeping');
    await quiet(b.box_id);
    expect(await status(owner.cookie, b.box_id)).toBe('sleeping');
    expect(await offlineAlerts(owner.id, b.box_id)).toBe(0);
  });

  it('two agencies with overlapping windows: the box stays up until both passed', async () => {
    const { b, owner } = await boundBox();
    const a = await agencyFor(b);
    const c = await agencyFor(b);

    expect((await pass(b, a.officer)).body).toMatchObject({ status: 'pass', rest: false });
    await quiet(b.box_id); // ไม่ได้แจ้งว่าหลับ + ยังตรวจไม่ครบ = ตู้หลุด
    expect(await status(owner.cookie, b.box_id)).toBe('offline');
    expect(await offlineAlerts(owner.id, b.box_id)).toBe(1);

    expect((await pass(b, c.officer)).body).toMatchObject({ status: 'pass', rest: true });
    await quiet(b.box_id);
    expect(await status(owner.cookie, b.box_id)).toBe('sleeping');
    expect(await offlineAlerts(owner.id, b.box_id)).toBe(1);
  });

  it('old firmware that sleeps after the first pass is resting until it comes back and drops again', async () => {
    const { b, owner } = await boundBox();
    const a = await agencyFor(b);
    await agencyFor(b);
    expect((await pass(b, a.officer)).body.rest).toBe(false);

    await quiet(b.box_id);
    await box(b, '/v1/box/events', { type: 'sleeping' }).expect(200);
    expect(await status(owner.cookie, b.box_id)).toBe('sleeping');
    expect(await offlineAlerts(owner.id, b.box_id)).toBe(0);

    // ตื่นมาถามงานอีกครั้งแล้วหายไปโดยไม่แจ้งว่าหลับ
    await pool.query(
      `UPDATE app.box_tb SET sleep_date = now() - interval '30 minutes', last_poll_date = now() - interval '20 minutes' WHERE box_id = $1`,
      [b.box_id],
    );
    expect(await status(owner.cookie, b.box_id)).toBe('offline');
    expect(await offlineAlerts(owner.id, b.box_id)).toBe(1);
  });

  it('windows that do not overlap: an agency later in the day does not keep the box up, one about to start does', async () => {
    const { b } = await boundBox();
    const a = await agencyFor(b);
    const c = await agencyFor(b);

    await startsIn(c.zoneId, 600);
    expect((await pass(b, a.officer)).body.rest).toBe(true);

    await startsIn(c.zoneId, 2); // ช่วงที่ตู้ต้องตื่นรอแล้ว
    expect((await pass(b, a.officer)).body.rest).toBe(false);
  });

  it('a suspended agency does not count', async () => {
    const { b, owner } = await boundBox();
    const a = await agencyFor(b);
    const c = await agencyFor(b);
    await as(admin.cookie).post(`/api/v1/admin/agencies/${c.id}/suspend`, { reason: 'ทดสอบ' }).expect(200);
    expect((await pass(b, a.officer)).body.rest).toBe(true);
    await quiet(b.box_id);
    expect(await status(owner.cookie, b.box_id)).toBe('sleeping');
  });

  it('only inspection results carry rest: a test job reply is unchanged', async () => {
    const { b } = await boundBox();
    await pool.query(`UPDATE app.box_tb SET last_poll_date = now() WHERE box_id = $1`, [b.box_id]);
    const job = (await as(admin.cookie).post(`/api/v1/admin/boxes/${b.box_id}/test-jobs`).expect(201)).body;
    const res = await box(b, `/v1/box/jobs/${job.id}/result`, { attempt: 1, read_ok: true, qr_text: 'x', read_ms: 500 }).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['server_time', 'status']);
  });
});
