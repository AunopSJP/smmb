import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
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

// ตรวจตู้ตั้งแต่สแกน QR หน้าตู้จนตู้อ่าน QR ประจำตัว (api.md §6 · design §6 · โปรโตคอล §4)
describe('Inspections (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 0;
  const phone = () => `05${run}${String(seq++).padStart(2, '0')}`;
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
  const setup = async (windows: [string, string][] = [['00:00', '23:59']]) => {
    const [b] = (await as(admin.cookie).post('/api/v1/admin/boxes', { count: 1 }).expect(201)).body as Registered[];
    const o = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'เจ้าของ', phone: phone(), password: PW, house_no: `7/${seq}`, terms_version: terms })
      .expect(201);
    const owner = { id: o.body.id as string, cookie: sid(o) };
    await as(owner.cookie).post('/api/v1/boxes/activate', { qr_text: b.qr[2].url }).expect(200);
    const ag = await agency();
    const zone = (await as(ag.head).post('/api/v1/agency/zones', { name: `โซน ${seq++}`, windows }).expect(201)).body;
    await as(ag.head).put(`/api/v1/agency/zones/${zone.id}/houses`, { box_ids: [b.box_id] }).expect(200);
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

  it('the whole inspection: scan → box wakes → badge QR → box reads it → passed + owner notified', async () => {
    const { b, owner, officer, name } = await setup();
    const { poll, out } = await pollWhile(b, () =>
      as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url, scan_ms: 1800 }).expect(201),
    );
    const ins = (out as request.Response).body;
    expect(ins).toMatchObject({ status: 'waking', qr_slot: 1, method: 'scan', attempt: 1, attempts_max: 3, ask_qr_condition: false });
    expect(poll.status).toBe(200);
    expect(poll.body.job).toMatchObject({ job_id: ins.job_id, type: 'inspect' });

    // ยังไม่ ready → ขอ QR ประจำตัวไม่ได้
    expect((await as(officer.cookie).get(`/api/v1/inspections/${ins.id}/badge`).expect(409)).body.code).toBe('NOT_READY');
    await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/ready`, { flash: false }).expect(200);
    expect((await as(officer.cookie).get(`/api/v1/inspections/${ins.id}`).expect(200)).body.status).toBe('ready');

    const badge = (await as(officer.cookie).get(`/api/v1/inspections/${ins.id}/badge`).expect(200)).body;
    expect(badge.qr).toMatch(/^SMMB-O1\.[\w-]+\.[\w-]+$/);

    // ครั้งแรกกล้องอ่านอย่างอื่นมา → ลองใหม่ · ครั้งที่ 2 อ่าน QR ประจำตัวได้ → ผ่าน
    const r1 = await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/result`, { attempt: 1, read_ok: true, qr_text: 'hello', read_ms: 900 }).expect(200);
    expect(r1.body).toMatchObject({ status: 'retry', attempts_left: 2 });
    expect((await as(officer.cookie).get(`/api/v1/inspections/${ins.id}`).expect(200)).body).toMatchObject({ status: 'ready', attempt: 2, attempts_left: 2 });
    const r2 = await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/result`, { attempt: 2, read_ok: true, qr_text: badge.qr, read_ms: 1100 }).expect(200);
    expect(r2.body).toMatchObject({ status: 'pass' });

    const done = (await as(officer.cookie).get(`/api/v1/inspections/${ins.id}`).expect(200)).body;
    expect(done).toMatchObject({ status: 'passed', checked_at: expect.any(String) });
    await as(officer.cookie).get(`/api/v1/inspections/${ins.id}/badge`).expect(410);

    const n = await pool.query(`SELECT data FROM app.notification_tb WHERE user_id = $1 AND type = 'inspected'`, [owner.id]);
    expect(n.rows[0].data).toMatchObject({ agency_name: name, officer_name: 'ส.ต.ต. สมชาย' });

    const summary = (await as(officer.cookie).get('/api/v1/officer/summary').expect(200)).body;
    expect(summary).toMatchObject({ in_window: true, houses_total: 1, houses_checked: 1, next_house: null });

    const logs = await pool.query(`SELECT actor_kind, result FROM app.scan_log_tb WHERE box_id = $1 AND qr_kind <> 'activate' ORDER BY scan_log_id`, [b.box_id]);
    expect(logs.rows).toEqual([
      { actor_kind: 'officer', result: 'ok' },
      { actor_kind: 'box', result: 'bad_sig' },
      { actor_kind: 'box', result: 'ok' },
    ]);
  });

  it('a badge for another job, a forged badge or 3 unreadable tries do not pass', async () => {
    const { b, officer } = await setup();
    const start = async () => {
      const { out } = await pollWhile(b, () => as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url }).expect(201));
      const ins = (out as request.Response).body;
      await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/ready`, {}).expect(200);
      return ins;
    };
    const first = await start();
    const oldBadge = (await as(officer.cookie).get(`/api/v1/inspections/${first.id}/badge`).expect(200)).body.qr as string;
    await as(officer.cookie).post(`/api/v1/inspections/${first.id}/box-problem`, { reason: 'no_scan' }).expect(201);

    const second = await start();
    const res = (attempt: number, qr_text: string | null) =>
      box(b, 'POST', `/v1/box/jobs/${second.job_id}/result`, { attempt, read_ok: qr_text !== null, qr_text, read_ms: 20000 });
    expect((await res(1, oldBadge).expect(200)).body.status).toBe('retry'); // QR ของงานก่อน
    expect((await res(2, oldBadge.slice(0, -2) + 'AA').expect(200)).body.status).toBe('retry'); // ลายเซ็นถูกแก้
    expect((await res(3, null).expect(200)).body.status).toBe('fail');
    expect((await as(officer.cookie).get(`/api/v1/inspections/${second.id}`).expect(200)).body.status).toBe('failed');

    const reasons = await pool.query(`SELECT result FROM app.scan_log_tb WHERE box_job_id = $1 ORDER BY attempt`, [second.job_id]);
    expect(reasons.rows.map((r) => r.result)).toEqual(['wrong_job', 'bad_sig', 'unreadable']);
  });

  it('checks in order: not our QR → wrong code → not my zone → box offline', async () => {
    const { b, officer } = await setup();
    const other = await agency();
    // เจ้าหน้าที่หน่วยงานอื่นมีโซนของตัวเอง (ตรวจได้ทั้งวัน) แต่บ้านนี้ไม่อยู่ในโซนนั้น
    const otherZone = (await as(other.head).post('/api/v1/agency/zones', { name: 'อื่น', windows: [['00:00', '23:59']] }).expect(201)).body;
    await as(other.head).put(`/api/v1/agency/zones/${otherZone.id}/officers`, { user_ids: [other.officer.id] }).expect(200);

    const fake = b.qr[0].url.replace(/-[A-Z2-9]{6}$/, '-AAAAAA');
    expect((await as(officer.cookie).post('/api/v1/inspections', { qr_text: fake }).expect(422)).body.code).toBe('QR_NOT_SYSTEM');
    expect((await as(officer.cookie).post('/api/v1/inspections', { qr_text: 'https://menu.example.com/x' }).expect(422)).body.code).toBe('QR_NOT_SYSTEM');
    const alert = await pool.query(`SELECT data FROM app.notification_tb WHERE user_id = $1 AND type = 'qr_fake' AND data->>'box_id' = $2`, [admin.id, b.box_id]);
    expect(alert.rowCount).toBe(1);
    const health = await pool.query(`SELECT health FROM app.box_qr_code_tb WHERE box_id = $1 AND slot = '1'`, [b.box_id]);
    expect(health.rows[0].health).toBe('maybe_fake');

    expect((await as(officer.cookie).post('/api/v1/inspections', { code: 'AAAA-AAAA' }).expect(404)).body.code).toBe('QR_INVALID');
    expect((await as(other.officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url }).expect(403)).body.code).toBe('NOT_IN_ZONE');
    // ตู้ไม่ได้ถือ long-poll
    expect((await as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url }).expect(503)).body.code).toBe('BOX_OFFLINE');
    // เจ้าของบ้านที่ไม่ใช่เจ้าหน้าที่เรียกไม่ได้เลย
    const owner = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'x', phone: phone(), password: PW, house_no: '1', terms_version: terms })
      .expect(201);
    await as(sid(owner)).post('/api/v1/inspections', { qr_text: b.qr[0].url }).expect(404);
  });

  it('outside patrol hours is refused and not recorded as an inspection', async () => {
    const bkk = new Date(Date.now() + 7 * 3600_000);
    const m = bkk.getUTCHours() * 60 + bkk.getUTCMinutes();
    const win: [string, string] = m < 60 ? ['22:00', '23:00'] : ['00:00', '00:30'];
    const { b, officer } = await setup([win]);
    const res = await as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url }).expect(409);
    expect(res.body.code).toBe('OUTSIDE_PATROL_WINDOW');
    const n = await pool.query(`SELECT count(*)::int AS n FROM app.inspection_tb WHERE box_id = $1`, [b.box_id]);
    expect(n.rows[0].n).toBe(0);
  });

  it('typing the code asks about the QR; a reported problem tells the owner; others cannot see my inspection', async () => {
    const { b, owner, officer } = await setup();
    const other = await agency();
    const { out } = await pollWhile(b, () =>
      as(officer.cookie).post('/api/v1/inspections', { code: b.qr[0].print_code.toLowerCase() }).expect(201),
    );
    const ins = (out as request.Response).body;
    expect(ins).toMatchObject({ method: 'code', ask_qr_condition: true });
    await as(other.officer.cookie).get(`/api/v1/inspections/${ins.id}`).expect(404);

    const after = await as(officer.cookie).post(`/api/v1/inspections/${ins.id}/qr-condition`, { condition: 'faded' }).expect(200);
    expect(after.body.ask_qr_condition).toBe(false);
    const q = await pool.query(`SELECT health, health_reasons FROM app.box_qr_code_tb WHERE box_id = $1 AND slot = '1'`, [b.box_id]);
    expect(q.rows[0]).toMatchObject({ health: 'damaged', health_reasons: ['typed_by_officer', 'reported_damaged'] });

    const p = await as(officer.cookie).post(`/api/v1/inspections/${ins.id}/box-problem`, { reason: 'no_response' }).expect(201);
    expect(p.body.status).toBe('box_problem');
    const n = await pool.query(`SELECT 1 FROM app.notification_tb WHERE user_id = $1 AND type = 'box_problem'`, [owner.id]);
    expect(n.rowCount).toBe(1);
  });
});
