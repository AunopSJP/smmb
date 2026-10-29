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

// ตู้ (โปรโตคอลตู้ §1–2 · api.md §4.1, §8.3 บ้าน, §9.4–9.5, §13)
describe('Boxes (e2e)', () => {
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
  });
  const nowS = () => Math.floor(Date.now() / 1000);

  /** คำขอจากตู้ — เซ็นแบบเดียวกับเฟิร์มแวร์ · override ไว้ทดสอบลายเซ็นผิด/เวลาเพี้ยน/ส่งซ้ำ */
  const box = (
    b: Registered,
    method: 'GET' | 'POST',
    path: string,
    body?: object,
    o: { ts?: number; nonce?: string; sig?: string; rawBody?: string } = {},
  ) => {
    const raw = o.rawBody ?? (body === undefined ? '' : JSON.stringify(body));
    const ts = String(o.ts ?? nowS());
    const nonce = o.nonce ?? randomBytes(6).toString('hex');
    const sig = o.sig ?? signRequest(b.device_secret, method, path, ts, nonce, body === undefined ? '' : JSON.stringify(body));
    const r = (method === 'GET' ? http().get(path) : http().post(path)).set({
      'X-Box-Id': b.box_id,
      'X-Timestamp': ts,
      'X-Nonce': nonce,
      'X-Signature': sig,
    });
    return raw ? r.set('Content-Type', 'application/json').send(raw) : r;
  };

  let admin: { id: string; cookie: string };
  const register = async (count = 1): Promise<Registered[]> => (await as(admin.cookie).post('/api/v1/admin/boxes', { count }).expect(201)).body;

  const signupOwner = async (house = '99/9') => {
    const res = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'เจ้าของ', phone: phone(), password: PW, house_no: house, terms_version: terms })
      .expect(201);
    return { id: res.body.id as string, cookie: sid(res) };
  };
  /** ตู้ที่มีเจ้าของแล้ว */
  const boundBox = async (house = '99/9') => {
    const [b] = await register();
    const owner = await signupOwner(house);
    const url = b.qr.find((q) => q.slot === 'activate')!.url;
    await as(owner.cookie).post('/api/v1/boxes/activate', { qr_text: url }).expect(200);
    return { b, owner };
  };
  const readyHead = async () => {
    const res = await http()
      .post('/api/v1/auth/signup/agency')
      .send({
        agency: { name: `หน่วย ${run}-${seq++}`, type: 'guard', contact: 'ป้อมยาม 02-000-0000' },
        head: { name: 'หัวหน้า', phone: phone(), password: PW },
        terms_version: terms,
      })
      .expect(201);
    await as(admin.cookie).post(`/api/v1/admin/agencies/${res.body.agency.id}/approve`).expect(200);
    const cookie = sid(res);
    await as(cookie)
      .post('/api/v1/me/push/subscriptions', { endpoint: `https://fcm.googleapis.com/fcm/send/bx-${run}-${seq++}`, keys: { p256dh: 'p', auth: 'a' } })
      .expect(201);
    return { cookie, agencyName: res.body.agency.name as string };
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

  describe('registering boxes (admin)', () => {
    it('gives each box a device secret and its first QR set; only admins can', async () => {
      const boxes = await register(2);
      expect(boxes).toHaveLength(2);
      for (const b of boxes) {
        expect(b.box_id).toMatch(/^BX-\d{5}$/);
        expect(b.device_secret).toMatch(/^[0-9a-f]{64}$/);
        expect(b.qr.map((q) => q.slot)).toEqual([1, 2, 'activate']);
        expect(b.qr[0].url).toMatch(new RegExp(`/b/${b.box_id.replace('-', '')}-1-[A-Z2-9]{6}$`));
        expect(b.qr[2].url).toMatch(/\/a\/[A-Z2-9]{16}$/);
        for (const q of b.qr) expect(q.print_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      }
      const owner = await signupOwner();
      await as(owner.cookie).post('/api/v1/admin/boxes', { count: 1 }).expect(404);
      await as(admin.cookie).post('/api/v1/admin/boxes', { count: 51 }).expect(400);
    });

    it('the box detail never shows the device secret', async () => {
      const [b] = await register();
      const res = await as(admin.cookie).get(`/api/v1/admin/boxes/${b.box_id}`).expect(200);
      expect(JSON.stringify(res.body)).not.toContain(b.device_secret);
      expect(res.body).toMatchObject({ id: b.box_id, bound: false, status: 'unbound' });
      expect(res.body.qr).toHaveLength(3);
    });

    it('deletes only unused boxes; connected and owned boxes are retained', async () => {
      const [unused] = await register();
      const eligible = await as(admin.cookie).get(`/api/v1/admin/boxes/${unused.box_id}`).expect(200);
      expect(eligible.body.can_delete).toBe(true);
      expect((await http().delete(`/api/v1/admin/boxes/${unused.box_id}`).set('Cookie', admin.cookie).expect(200)).body).toEqual({
        box_id: unused.box_id,
        deleted: true,
      });
      const deletionAudit = await pool.query<{ fields: string[] }>(
        `SELECT fields FROM app.data_access_log_tb WHERE actor_user_id = $1 AND subject_kind = 'box' AND subject_id = $2 AND fields @> ARRAY['box_deleted']`,
        [admin.id, unused.box_id],
      );
      expect(deletionAudit.rowCount).toBe(1);
      await as(admin.cookie).get(`/api/v1/admin/boxes/${unused.box_id}`).expect(404);

      const [connected] = await register();
      await box(connected, 'POST', '/v1/box/boot', { config_ver: 0 }).expect(200);
      const connectedDetail = await as(admin.cookie).get(`/api/v1/admin/boxes/${connected.box_id}`).expect(200);
      expect(connectedDetail.body.can_delete).toBe(false);
      expect((await http().delete(`/api/v1/admin/boxes/${connected.box_id}`).set('Cookie', admin.cookie).expect(409)).body.code).toBe('BOX_NOT_DELETABLE');
      await as(admin.cookie).get(`/api/v1/admin/boxes/${connected.box_id}`).expect(200);

      const { b, owner } = await boundBox('77/4');
      const ownedDetail = await as(admin.cookie).get(`/api/v1/admin/boxes/${b.box_id}`).expect(200);
      expect(ownedDetail.body.can_delete).toBe(false);
      await http().delete(`/api/v1/admin/boxes/${b.box_id}`).set('Cookie', owner.cookie).expect(404);
      await http().delete(`/api/v1/admin/boxes/${b.box_id}`).set('Cookie', admin.cookie).expect(409);
      expect((await as(owner.cookie).get('/api/v1/boxes').expect(200)).body.map((item: { id: string }) => item.id)).toContain(b.box_id);
    });
  });

  describe('box authentication (HMAC)', () => {
    it('boot: a signed request gets the server time and the config (box sent config_ver 0)', async () => {
      const [b] = await register();
      const res = await box(b, 'POST', '/v1/box/boot', { fw: '1.0.3', config_ver: 0, battery_pct: 87, charging: true }).expect(200);
      expect(Number(res.headers['x-server-time'])).toBeGreaterThan(0);
      expect(res.body).toMatchObject({ config_ver: expect.any(Number), config: { windows: [], tz: 'Asia/Bangkok', max_attempts: 3 } });
      expect(Math.abs(res.body.server_time - nowS())).toBeLessThan(5);

      // ค่าตรงแล้ว → ไม่ส่ง config ซ้ำ
      const again = await box(b, 'POST', '/v1/box/report', { config_ver: res.body.config_ver, battery_pct: 80 }).expect(200);
      expect(again.body.config).toBeUndefined();

      const detail = await as(admin.cookie).get(`/api/v1/admin/boxes/${b.box_id}`).expect(200);
      expect(detail.body).toMatchObject({ fw: '1.0.3', battery: { pct: 80 }, config: { in_sync: true } });
      expect(detail.body.reports.map((r: { kind: string }) => r.kind)).toEqual(['report', 'boot']);
    });

    it('rejects forged, tampered, replayed, stale and unknown requests — and logs them', async () => {
      const [b] = await register();
      const reason = async (r: request.Test) => {
        const res = await r.expect(401);
        expect(res.body).toMatchObject({ code: 'BOX_AUTH_FAILED', server_time: expect.any(Number) });
        return res.body.reason as string;
      };

      expect(await reason(box(b, 'POST', '/v1/box/report', { a: 1 }, { sig: 'f'.repeat(64) }))).toBe('bad_signature');
      // แก้ body หลังเซ็น
      expect(await reason(box(b, 'POST', '/v1/box/report', { battery_pct: 50 }, { rawBody: '{"battery_pct":5}' }))).toBe('bad_signature');
      // เวลาเพี้ยนเกิน 60 วิ (ยกเว้น boot)
      expect(await reason(box(b, 'POST', '/v1/box/report', { a: 1 }, { ts: nowS() - 120 }))).toBe('clock_skew');
      await box(b, 'POST', '/v1/box/boot', { config_ver: 0 }, { ts: nowS() - 86400 }).expect(200);
      // ส่งซ้ำ nonce เดิม
      await box(b, 'POST', '/v1/box/events', { type: 'camera_error' }, { nonce: 'replay-nonce-1' }).expect(200);
      expect(await reason(box(b, 'POST', '/v1/box/events', { type: 'camera_error' }, { nonce: 'replay-nonce-1' }))).toBe('replay');
      // ตู้อื่นใช้รหัสลับของตู้นี้ไม่ได้
      const [other] = await register();
      expect(await reason(box({ ...other, device_secret: b.device_secret }, 'POST', '/v1/box/report', {}))).toBe('bad_signature');
      expect(await reason(box({ ...b, box_id: 'BX-99999' }, 'POST', '/v1/box/report', {}))).toBe('unknown_box');
      expect(await reason(http().post('/v1/box/report').send({}))).toBe('missing_headers');

      const { rows } = await pool.query(`SELECT reason FROM app.box_auth_log_tb WHERE claimed_box_id = $1 ORDER BY box_auth_log_id`, [b.box_id]);
      expect(rows.map((r) => r.reason)).toEqual(['bad_signature', 'bad_signature', 'clock_skew', 'replay']);
    });

    it('a body that is too big or not JSON is a client error (413 / 400), not 500', async () => {
      const [b] = await register();
      const big = JSON.stringify({ pad: 'x'.repeat(20_000) });
      await http().post('/v1/box/boot').set('Content-Type', 'application/json').send(big).expect(413);
      // เซ็นถูกแต่ body ไม่ใช่ JSON → 400
      const ts = String(nowS());
      const sig = signRequest(b.device_secret, 'POST', '/v1/box/report', ts, 'notjson-nonce', 'not json');
      await box(b, 'POST', '/v1/box/report', { a: 1 }, { rawBody: 'not json', ts: Number(ts), nonce: 'notjson-nonce', sig }).expect(400);
      await http().post('/api/v1/auth/signin').set('Content-Type', 'application/json').send('{"broken"').expect(400);
    });

    it('a low battery in the daily report notifies the admins', async () => {
      const [b] = await register();
      await box(b, 'POST', '/v1/box/report', { battery_pct: 15 }).expect(200);
      const { rows } = await pool.query(`SELECT data FROM app.notification_tb WHERE user_id = $1 AND type = 'low_battery' AND data->>'box_id' = $2`, [
        admin.id,
        b.box_id,
      ]);
      expect(rows[0]?.data).toMatchObject({ battery_pct: 15 });
    });
  });

  describe('long-poll + test job', () => {
    it('no job: 204 after the wait, with the server time in a header', async () => {
      const [b] = await register();
      const res = await box(b, 'GET', '/v1/box/jobs?wait=0').expect(204);
      expect(Number(res.headers['x-server-time'])).toBeGreaterThan(0);
      await box(b, 'GET', '/v1/box/jobs?wait=99').expect(400);
    });

    it('a long-poll that waited answers with the time when it ENDS (not when it started) — else the box clock drifts back every poll', async () => {
      const [b] = await register();
      const before = Math.floor(Date.now() / 1000);
      const res = await box(b, 'GET', '/v1/box/jobs?wait=2').expect(204);
      expect(Number(res.headers['x-server-time'])).toBeGreaterThanOrEqual(before + 2);
    });

    it('a test job wakes a waiting box at once; ready → retry → pass, and repeats get the same answer', async () => {
      const [b] = await register();
      const started = Date.now();
      const poll = box(b, 'GET', '/v1/box/jobs?wait=10').then((r) => r);
      await new Promise((r) => setTimeout(r, 300));
      const created = await as(admin.cookie).post(`/api/v1/admin/boxes/${b.box_id}/test-jobs`).expect(201);
      const res = await poll;
      expect(res.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(5000);
      const job = res.body.job;
      expect(job).toMatchObject({ job_id: created.body.id, type: 'test', attempt_max: 3, scan_timeout_s: 20 });
      expect(job.expires_at).toBeGreaterThan(nowS());

      // ได้งานซ้ำได้จนกว่าตู้จะ ready (เผื่อคำตอบรอบก่อนหลุด)
      expect((await box(b, 'GET', '/v1/box/jobs?wait=0').expect(200)).body.job.job_id).toBe(job.job_id);

      await box(b, 'POST', `/v1/box/jobs/${job.job_id}/ready`, { light: 'on', flash: true }).expect(200);
      await box(b, 'GET', '/v1/box/jobs?wait=0').expect(204);

      const r1 = { attempt: 1, read_ok: false, qr_text: null, read_ms: 20000, flash: true };
      expect((await box(b, 'POST', `/v1/box/jobs/${job.job_id}/result`, r1).expect(200)).body).toMatchObject({ status: 'retry', attempts_left: 2 });
      expect((await box(b, 'POST', `/v1/box/jobs/${job.job_id}/result`, r1).expect(200)).body).toMatchObject({ status: 'retry', attempts_left: 2 });
      const r2 = { attempt: 2, read_ok: true, qr_text: 'SMMB-O1.test', read_ms: 1800, flash: true };
      expect((await box(b, 'POST', `/v1/box/jobs/${job.job_id}/result`, r2).expect(200)).body).toMatchObject({ status: 'pass' });
      expect((await box(b, 'POST', `/v1/box/jobs/${job.job_id}/result`, { ...r1, attempt: 3 }).expect(200)).body).toMatchObject({ status: 'pass' });

      const view = await as(admin.cookie).get(`/api/v1/admin/boxes/${b.box_id}/test-jobs/${job.job_id}`).expect(200);
      expect(view.body).toMatchObject({ status: 'passed', wake_ms: expect.any(Number) });
      expect(view.body.attempts.map((a: { verdict: string }) => a.verdict)).toEqual(['retry', 'pass']);
      expect(view.body.attempts[1].qr_text).toBe('SMMB-O1.test');

      // ตู้ถือ long-poll อยู่ = online (มีเจ้าของแล้วเท่านั้น — ตู้ยังไม่ผูกแสดง unbound)
      const detail = await as(admin.cookie).get(`/api/v1/admin/boxes/${b.box_id}`).expect(200);
      expect(detail.body.last_poll_at).not.toBeNull();
    });

    it('jobs of another box are not found; an expired job answers 410', async () => {
      const [a, b] = await register(2);
      const created = await as(admin.cookie).post(`/api/v1/admin/boxes/${a.box_id}/test-jobs`).expect(201);
      const res = await box(b, 'POST', `/v1/box/jobs/${created.body.id}/ready`, {}).expect(404);
      expect(res.body.code).toBe('JOB_NOT_FOUND');
      await box(a, 'POST', '/v1/box/jobs/not-a-job/ready', {}).expect(404);

      await pool.query(`UPDATE app.box_job_tb SET expire_date = now() - interval '1 second' WHERE box_job_id = $1`, [created.body.id]);
      const gone = await box(a, 'POST', `/v1/box/jobs/${created.body.id}/ready`, {}).expect(410);
      expect(gone.body).toMatchObject({ code: 'JOB_EXPIRED', server_time: expect.any(Number) });
      await box(a, 'GET', '/v1/box/jobs?wait=0').expect(204);
    });
  });

  describe('box config (admin defaults)', () => {
    it('changing the defaults changes every box config_ver so boxes pick it up', async () => {
      const [b] = await register();
      const first = await box(b, 'POST', '/v1/box/boot', { config_ver: 0 }).expect(200);
      const cur = (await as(admin.cookie).get('/api/v1/admin/box-config').expect(200)).body.config;
      await as(admin.cookie).put('/api/v1/admin/box-config', { ...cur, longpoll_wait_s: 99 }).expect(400);
      try {
        await as(admin.cookie).put('/api/v1/admin/box-config', { ...cur, longpoll_wait_s: 40 }).expect(200);
        const next = await box(b, 'POST', '/v1/box/report', { config_ver: first.body.config_ver }).expect(200);
        expect(next.body.config_ver).not.toBe(first.body.config_ver);
        expect(next.body.config.longpoll_wait_s).toBe(40);
      } finally {
        await as(admin.cookie).put('/api/v1/admin/box-config', cur).expect(200);
      }
    });

    it('resets one box to defaults while keeping its owner, QR codes, and history', async () => {
      const { b, owner } = await boundBox('12/7');
      await pool.query(`UPDATE app.box_tb SET config_override = $2::jsonb WHERE box_id = $1`, [b.box_id, JSON.stringify({ scan_timeout_s: 45 })]);
      const boot = await box(b, 'POST', '/v1/box/boot', { config_ver: 0 }).expect(200);
      expect(boot.body.config.scan_timeout_s).toBe(45);
      await box(b, 'POST', '/v1/box/report', { config_ver: boot.body.config_ver }).expect(200);

      const before = await as(admin.cookie).get(`/api/v1/admin/boxes/${b.box_id}`).expect(200);
      expect(before.body.config.in_sync).toBe(true);
      const oldConfigVersion = before.body.config.config_ver as number;
      const oldQrIds = (before.body.qr as { id: string }[]).map((qr) => qr.id).sort();
      const oldReports = before.body.reports;

      const reset = await http().delete(`/api/v1/admin/boxes/${b.box_id}/config`).set('Cookie', admin.cookie).expect(200);
      expect(reset.body.config.scan_timeout_s).not.toBe(45);
      expect(reset.body.config_ver).not.toBe(oldConfigVersion);

      const after = await as(admin.cookie).get(`/api/v1/admin/boxes/${b.box_id}`).expect(200);
      expect(after.body.bound).toBe(true);
      expect(after.body.house_no).toBe('12/7');
      expect((after.body.qr as { id: string }[]).map((qr) => qr.id).sort()).toEqual(oldQrIds);
      expect(after.body.reports).toEqual(oldReports);
      expect(after.body.config.in_sync).toBe(false);
      expect((await as(owner.cookie).get('/api/v1/boxes').expect(200)).body.map((item: { id: string }) => item.id)).toContain(b.box_id);
      const audit = await pool.query<{ fields: string[] }>(
        `SELECT fields FROM app.data_access_log_tb WHERE actor_user_id = $1 AND subject_kind = 'box' AND subject_id = $2 AND fields @> ARRAY['config_reset']`,
        [admin.id, b.box_id],
      );
      expect(audit.rowCount).toBe(1);
    });
  });

  describe('owner binds a box (Activate QR)', () => {
    it('scanning the activation QR binds the box once; the house number comes from the owner', async () => {
      const [b] = await register();
      const owner = await signupOwner('12/3');
      const url = b.qr.find((q) => q.slot === 'activate')!.url;
      const res = await as(owner.cookie).post('/api/v1/boxes/activate', { qr_text: url }).expect(200);
      expect(res.body).toEqual({ box: { id: b.box_id, name: '', house_no: '12/3', status: 'offline' }, needs_name: true });

      const other = await signupOwner();
      expect((await as(other.cookie).post('/api/v1/boxes/activate', { qr_text: url }).expect(409)).body.code).toBe('BOX_ALREADY_OWNED');

      expect((await as(owner.cookie).patch(`/api/v1/boxes/${b.box_id}`, { name: 'ตู้หน้าบ้าน' }).expect(200)).body.name).toBe('ตู้หน้าบ้าน');
      await as(other.cookie).patch(`/api/v1/boxes/${b.box_id}`, { name: 'ของฉัน' }).expect(404);
      expect((await as(owner.cookie).get('/api/v1/boxes').expect(200)).body.map((x: { id: string }) => x.id)).toEqual([b.box_id]);
      expect((await as(other.cookie).get('/api/v1/boxes').expect(200)).body).toEqual([]);

      const { rows } = await pool.query(`SELECT result, method FROM app.scan_log_tb WHERE box_id = $1 ORDER BY scan_log_id`, [b.box_id]);
      expect(rows).toEqual([
        { result: 'ok', method: 'scan' },
        { result: 'already_owned', method: 'scan' },
      ]);
    });

    it('works when the web app lives under a path (https://host/smmb/a/<token>)', async () => {
      const [b] = await register();
      const owner = await signupOwner();
      const token = b.qr.find((q) => q.slot === 'activate')!.url.split('/a/')[1];
      await as(owner.cookie).post('/api/v1/boxes/activate', { qr_text: `http://localhost/smmb/a/${token}` }).expect(200);
    });

    it('typing the code under the QR works too; 3 wrong codes in a row → wait', async () => {
      const [b] = await register();
      const owner = await signupOwner();
      const fake = 'https://evil.example.com/a/ABCDEFGHJKMNPQRS';
      expect((await as(owner.cookie).post('/api/v1/boxes/activate', { qr_text: fake }).expect(404)).body.code).toBe('QR_INVALID');
      await as(owner.cookie).post('/api/v1/boxes/activate', { code: 'AAAA-AAAA' }).expect(404);
      await as(owner.cookie).post('/api/v1/boxes/activate', { code: 'BBBB-BBBB' }).expect(404);
      expect((await as(owner.cookie).post('/api/v1/boxes/activate', { code: 'CCCC-CCCC' }).expect(429)).body.code).toBe('CODE_ATTEMPTS_EXCEEDED');
      const code = b.qr.find((q) => q.slot === 'activate')!.print_code;
      await as(owner.cookie).post('/api/v1/boxes/activate', { code }).expect(429); // ยังอยู่ในช่วงรอ

      counters.clear();
      await as(owner.cookie).post('/api/v1/boxes/activate', { code: code.toLowerCase() }).expect(200);
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM app.scan_log_tb WHERE user_id = $1`, [owner.id]);
      expect(rows[0].n).toBe(5); // ปลอม 1 + ผิด 3 + ถูก 1 (ช่วงรอไม่ได้ตรวจรหัส)
    });
  });

  describe('houses in zones (one house can be in zones of several agencies)', () => {
    it('two agencies can cover the same house; the box gets the merged patrol windows', async () => {
      const { b } = await boundBox('55/1');
      const police = await readyHead();
      const guard = await readyHead();
      const z1 = (await as(police.cookie).post('/api/v1/agency/zones', { name: 'สาย 1', windows: [['06:00', '09:00']] }).expect(201)).body;
      const z2 = (await as(guard.cookie).post('/api/v1/agency/zones', { name: 'ประตู 1', windows: [['08:00', '10:00'], ['20:00', '22:00']] }).expect(201)).body;

      const houses = await as(police.cookie).put(`/api/v1/agency/zones/${z1.id}/houses`, { box_ids: [b.box_id] }).expect(200);
      expect(houses.body).toEqual([{ box_id: b.box_id, house_no: '55/1', box_name: null, box_status: expect.any(String) }]);
      await as(guard.cookie).put(`/api/v1/agency/zones/${z2.id}/houses`, { box_ids: [b.box_id] }).expect(200);

      const found = await as(guard.cookie).get('/api/v1/agency/houses/search?q=55/').expect(200);
      const hit = found.body.find((h: { box_id: string }) => h.box_id === b.box_id);
      expect(hit.zones).toHaveLength(2);
      expect(hit.zones.map((z: { zone_name: string }) => z.zone_name).sort()).toEqual(['ประตู 1', 'สาย 1']);
      expect(JSON.stringify(found.body)).not.toMatch(/phone|owner/);

      const boot = await box(b, 'POST', '/v1/box/boot', { config_ver: 0 }).expect(200);
      expect(boot.body.config.windows).toEqual([
        ['06:00', '10:00'],
        ['20:00', '22:00'],
      ]);

      // ย้ายบ้านออกจากโซนหนึ่ง → เวลาตรวจของตู้เปลี่ยน
      await as(guard.cookie).put(`/api/v1/agency/zones/${z2.id}/houses`, { box_ids: [] }).expect(200);
      const next = await box(b, 'POST', '/v1/box/report', { config_ver: boot.body.config_ver }).expect(200);
      expect(next.body.config.windows).toEqual([['06:00', '09:00']]);

      // โซนของหน่วยงานอื่น → 404
      await as(guard.cookie).put(`/api/v1/agency/zones/${z1.id}/houses`, { box_ids: [b.box_id] }).expect(404);
      expect((await as(police.cookie).get(`/api/v1/agency/zones/${z1.id}`).expect(200)).body.houses_count).toBe(1);
    });

    it('only bound boxes can be added', async () => {
      const [unbound] = await register();
      const head = await readyHead();
      const z = (await as(head.cookie).post('/api/v1/agency/zones', { name: 'A', windows: [] }).expect(201)).body;
      const res = await as(head.cookie).put(`/api/v1/agency/zones/${z.id}/houses`, { box_ids: [unbound.box_id] }).expect(400);
      expect(res.body.code).toBe('HOUSE_NOT_FOUND');
      await as(head.cookie).put(`/api/v1/agency/zones/${z.id}/houses`, { box_ids: ['nope'] }).expect(400);
    });
  });

  // เจ้าของกด "เปลี่ยน Wi-Fi" ในเว็บ → ตู้รับคำสั่ง → ตอบรับ → ตัด Wi-Fi เก่า (โปรโตคอล §2.8 · api.md §4.4)
  describe('owner wifi reset', () => {
    const wifi = (cookie: string, id: string) => as(cookie).get(`/api/v1/boxes/${id}`).then((r) => r.body.wifi_reset);

    it('wakes a waiting box at once with a command; the ack clears it and tells the owner (once)', async () => {
      const { b, owner } = await boundBox();
      expect(await wifi(owner.cookie, b.box_id)).toMatchObject({ status: 'idle', ap_name: `MAILBOX-${b.box_id.replace(/\D/g, '').padStart(6, '0').slice(-6)}` });

      const poll = box(b, 'GET', '/v1/box/jobs?wait=10').then((r) => r);
      await new Promise((r) => setTimeout(r, 300));
      const req = await as(owner.cookie).post(`/api/v1/boxes/${b.box_id}/wifi-reset`).expect(200);
      expect(req.body.status).toBe('pending');
      const res = await poll;
      expect(res.status).toBe(200);
      expect(res.body.command).toMatchObject({ type: 'wifi_reset', id: expect.stringMatching(/^W-\d+$/) });
      expect(res.body.job).toBeUndefined();

      // กดซ้ำระหว่างรอ = คำสั่งเดิม (id เดิม)
      await as(owner.cookie).post(`/api/v1/boxes/${b.box_id}/wifi-reset`).expect(200);
      expect((await box(b, 'GET', '/v1/box/jobs?wait=0').expect(200)).body.command.id).toBe(res.body.command.id);

      // ตอบรับด้วย id ผิด = ไม่ทำอะไร
      await box(b, 'POST', '/v1/box/events', { type: 'wifi_reset', command_id: 'W-1' }).expect(200);
      expect((await wifi(owner.cookie, b.box_id)).status).toBe('pending');

      await box(b, 'POST', '/v1/box/events', { type: 'wifi_reset', command_id: res.body.command.id }).expect(200);
      expect((await wifi(owner.cookie, b.box_id)).status).toBe('done');
      await box(b, 'GET', '/v1/box/jobs?wait=0').expect(204); // รับแล้วไม่ส่งซ้ำ
      // ตอบรับซ้ำ = ไม่แจ้งเตือนซ้ำ
      await box(b, 'POST', '/v1/box/events', { type: 'wifi_reset', command_id: res.body.command.id }).expect(200);
      const n = await pool.query(`SELECT 1 FROM app.notification_tb WHERE user_id = $1 AND type = 'box_wifi_reset'`, [owner.id]);
      expect(n.rowCount).toBe(1);
    });

    it('a sleeping box gets the command in the boot / report reply', async () => {
      const { b, owner } = await boundBox();
      await as(owner.cookie).post(`/api/v1/boxes/${b.box_id}/wifi-reset`).expect(200);
      const boot = await box(b, 'POST', '/v1/box/boot', { fw: 't', config_ver: 0 }).expect(200);
      expect(boot.body.command).toMatchObject({ type: 'wifi_reset' });
      const rep = await box(b, 'POST', '/v1/box/report', { fw: 't', config_ver: boot.body.config_ver }).expect(200);
      expect(rep.body.command.id).toBe(boot.body.command.id);
    });

    it('the owner can cancel before the box takes it; the box then hears nothing', async () => {
      const { b, owner } = await boundBox();
      await as(owner.cookie).post(`/api/v1/boxes/${b.box_id}/wifi-reset`).expect(200);
      const cancelled = await http().delete(`/api/v1/boxes/${b.box_id}/wifi-reset`).set('Cookie', owner.cookie).expect(200);
      expect(cancelled.body.status).toBe('idle');
      await box(b, 'GET', '/v1/box/jobs?wait=0').expect(204);
      const boot = await box(b, 'POST', '/v1/box/boot', { fw: 't', config_ver: 0 }).expect(200);
      expect(boot.body.command).toBeUndefined();
    });

    it('scope: only the owner of that box · others get 404 · an unbound box has no owner · box api needs the signature', async () => {
      const { b, owner } = await boundBox();
      const stranger = await signupOwner('5/5');
      await as(stranger.cookie).post(`/api/v1/boxes/${b.box_id}/wifi-reset`).expect(404);
      await http().delete(`/api/v1/boxes/${b.box_id}/wifi-reset`).set('Cookie', stranger.cookie).expect(404);
      const [unbound] = await register();
      await as(owner.cookie).post(`/api/v1/boxes/${unbound.box_id}/wifi-reset`).expect(404);
      await http().post(`/api/v1/boxes/${b.box_id}/wifi-reset`).expect(401);
      expect((await wifi(owner.cookie, b.box_id)).status).toBe('idle'); // ของคนอื่นไม่ทำให้ตู้เราเปลี่ยน
      // เจ้าหน้าที่/แอดมินไม่ใช่เจ้าของ → ใช้ไม่ได้
      await as(admin.cookie).post(`/api/v1/boxes/${b.box_id}/wifi-reset`).expect(404);
    });

    it('a request nobody picked up for 24 h expires — the box no longer hears it', async () => {
      const { b, owner } = await boundBox();
      await as(owner.cookie).post(`/api/v1/boxes/${b.box_id}/wifi-reset`).expect(200);
      await pool.query(`UPDATE app.box_tb SET wifi_reset_requested_date = now() - interval '25 hours' WHERE box_id = $1`, [b.box_id]);
      expect((await wifi(owner.cookie, b.box_id)).status).toBe('expired');
      await box(b, 'GET', '/v1/box/jobs?wait=0').expect(204);
      // กดใหม่ = ออกคำสั่งใหม่ (id ใหม่)
      expect((await as(owner.cookie).post(`/api/v1/boxes/${b.box_id}/wifi-reset`).expect(200)).body.status).toBe('pending');
      expect((await box(b, 'GET', '/v1/box/jobs?wait=0').expect(200)).body.command.type).toBe('wifi_reset');
    });
  });
});
