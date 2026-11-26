import { randomBytes, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { SHORT_WINDOW, allDayWindows } from './all-day-zone.js';
import { acceptPendingHouses } from './zone-consent.js';
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
    expect(badge.qr).toMatch(/^SMMB-O2\.J-[0-9a-f]{6}\.U-\d+\.[0-9a-z]+\.[\w-]{16}$/);

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
    // แต่ละบ้านบอกสถานะตู้ด้วย (เจ้าหน้าที่รู้ก่อนเดินไปว่าตู้ไหนตรวจไม่ได้)
    expect(summary.houses[0]).toMatchObject({ box_id: b.box_id, status: expect.stringMatching(/^(online|offline|sleeping)$/) });

    // ปุ่ม "นำทาง": ในโซน + ในเวลาตรวจ → ได้พิกัด และบันทึกการเปิดดูครั้งเดียวต่อวัน · ไม่มีหมุด → 404
    expect(summary.houses[0].has_pin).toBe(true);
    const loc = (await as(officer.cookie).get(`/api/v1/officer/boxes/${b.box_id}/location`).expect(200)).body;
    expect(loc).toEqual({ lat: 13.7563, lng: 100.5018 });
    await as(officer.cookie).get(`/api/v1/officer/boxes/${b.box_id}/location`).expect(200);
    const seen = await pool.query(
      `SELECT fields FROM app.data_access_log_tb WHERE actor_user_id = $1 AND subject_kind = 'box' AND subject_id = $2 AND 'location' = ANY(fields)`,
      [officer.id, b.box_id],
    );
    expect(seen.rowCount).toBe(1);
    // เจ้าของบ้าน (ไม่ใช่เจ้าหน้าที่) ขอไม่ได้
    await as(owner.cookie).get(`/api/v1/officer/boxes/${b.box_id}/location`).expect(404);
    // เจ้าของล้างหมุด → เจ้าหน้าที่ขอไม่ได้ และหน้าสรุปไม่ชวนนำทาง
    await pool.query(`UPDATE app.box_tb SET lat = NULL, lng = NULL WHERE box_id = $1`, [b.box_id]);
    await as(officer.cookie).get(`/api/v1/officer/boxes/${b.box_id}/location`).expect(404);
    expect((await as(officer.cookie).get('/api/v1/officer/summary').expect(200)).body.houses[0].has_pin).toBe(false);

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
    const otherZone = (await as(other.head).post('/api/v1/agency/zones', { name: 'อื่น', windows: SHORT_WINDOW }).expect(201)).body;
    await allDayWindows(pool, otherZone.id);
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

  it('QR damage moves from officer report through owner backup placement and admin reissue to a resolved case', async () => {
    const { b, owner, officer } = await setup();
    const { out } = await pollWhile(b, () =>
      as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url, scan_ms: 1800 }).expect(201),
    );
    const inspection = (out as request.Response).body;
    const reported = await as(officer.cookie)
      .post(`/api/v1/inspections/${inspection.id}/qr-condition`, { condition: 'torn' })
      .expect(200);
    expect(reported.body.ask_qr_condition).toBe(false);

    const qrRows = await pool.query<{ box_qr_code_id: string; slot: string; version: number }>(
      `SELECT box_qr_code_id, slot, version FROM app.box_qr_code_tb WHERE box_id = $1 AND slot IN ('1','2') AND status = 'active' ORDER BY slot`,
      [b.box_id],
    );
    const frontQrId = qrRows.rows.find((qr) => qr.slot === '1')?.box_qr_code_id;
    const backupQrId = qrRows.rows.find((qr) => qr.slot === '2')?.box_qr_code_id;
    expect(frontQrId).toBeDefined();
    expect(backupQrId).toBeDefined();

    const issue = (await as(admin.cookie).get('/api/v1/admin/qr').expect(200)).body.find(
      (row: { id: string }) => row.id === frontQrId,
    );
    expect(issue).toMatchObject({ health: 'damaged', status: 'open', fix: null });

    const notified = await as(admin.cookie).post(`/api/v1/admin/qr/${frontQrId}/request-backup-swap`).expect(201);
    expect(notified.body).toMatchObject({ status: 'owner_notified', fix: 'swap' });
    expect((await as(owner.cookie).get(`/api/v1/boxes/${b.box_id}`).expect(200)).body.qr_task).toMatchObject({ health: 'damaged' });

    const confirmed = await as(owner.cookie).post(`/api/v1/boxes/${b.box_id}/qr-backup-placed`).expect(201);
    expect(confirmed.body.status).toBe('owner_confirmed');
    expect((await as(admin.cookie).get(`/api/v1/admin/qr/${frontQrId}`).expect(200)).body).toMatchObject({ confirmed_by: 'owner', confirmed_at: expect.any(String) });
    const replacement = (await as(admin.cookie)
      .post(`/api/v1/admin/boxes/${b.box_id}/qr/reissue`, { slots: [2], request_id: randomUUID() })
      .expect(201)).body.qr as { id: string; slot: number; version: number }[];
    expect(replacement).toHaveLength(1);
    expect(replacement[0].slot).toBe(2);
    expect(replacement[0].version).toBeGreaterThan(qrRows.rows.find((qr) => qr.slot === '2')!.version);

    await as(admin.cookie).post(`/api/v1/admin/qr/${frontQrId}/reissue`, { slots: [2], delivery_method: 'post' }).expect(201);
    const resolved = await as(admin.cookie).post(`/api/v1/admin/qr/${frontQrId}/resolve`).expect(201);
    expect(resolved.body).toMatchObject({ status: 'resolved', resolved: true });

    const finalQr = await pool.query<{ box_qr_code_id: string; slot: string; status: string }>(
      `SELECT box_qr_code_id, slot, status FROM app.box_qr_code_tb WHERE box_id = $1 AND status IN ('active','revoked') AND slot IN ('1','2') ORDER BY created_date`,
      [b.box_id],
    );
    expect(finalQr.rows.find((qr) => qr.box_qr_code_id === frontQrId)?.status).toBe('revoked');
    expect(finalQr.rows.find((qr) => qr.box_qr_code_id === backupQrId)).toMatchObject({ slot: '1', status: 'active' });
    expect(finalQr.rows.find((qr) => qr.box_qr_code_id === replacement[0].id)).toMatchObject({ slot: '2', status: 'active' });
    expect((await as(owner.cookie).get(`/api/v1/boxes/${b.box_id}`).expect(200)).body.qr_task).toBeNull();
  });

  it('passing with the backup QR while a swap case waits counts as the owner confirming; a failed scan does not', async () => {
    const { b, owner, officer } = await setup();
    const qr = async () =>
      (
        await pool.query<{ box_qr_code_id: string; slot: string; status: string }>(
          `SELECT box_qr_code_id, slot, status FROM app.box_qr_code_tb WHERE box_id = $1 AND slot IN ('1','2') ORDER BY slot, version`,
          [b.box_id],
        )
      ).rows;
    const [front, backup] = await qr();
    await pool.query(`UPDATE app.box_qr_code_tb SET health = 'damaged' WHERE box_qr_code_id = $1`, [front.box_qr_code_id]);
    await as(admin.cookie).post(`/api/v1/admin/qr/${front.box_qr_code_id}/request-backup-swap`).expect(201);
    const issue = async () => (await as(admin.cookie).get(`/api/v1/admin/qr/${front.box_qr_code_id}`).expect(200)).body;
    const inspect = async (qrUrl: string, pass: boolean) => {
      const { out } = await pollWhile(b, () => as(officer.cookie).post('/api/v1/inspections', { qr_text: qrUrl }).expect(201));
      const ins = (out as request.Response).body;
      await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/ready`, {}).expect(200);
      const text = pass ? ((await as(officer.cookie).get(`/api/v1/inspections/${ins.id}/badge`).expect(200)).body.qr as string) : 'hello';
      for (let attempt = 1; attempt <= (pass ? 1 : 3); attempt++) {
        await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/result`, { attempt, read_ok: true, qr_text: text, read_ms: 900 }).expect(200);
      }
      return ins.id as string;
    };

    // ใบสำรองแต่ตรวจไม่ผ่าน / ผ่านด้วยใบหน้าตู้ → เคสยังรอเจ้าของ
    await inspect(b.qr[1].url, false);
    await inspect(b.qr[0].url, true);
    expect(await issue()).toMatchObject({ status: 'owner_notified', confirmed_by: null, confirmed_at: null });
    expect((await qr()).map((q) => q.status)).toEqual(['active', 'active']);

    const passed = await inspect(b.qr[1].url, true);
    expect(await issue()).toMatchObject({ status: 'owner_confirmed', confirmed_by: 'inspection', confirmed_at: expect.any(String) });
    const after = await qr();
    expect(after.find((q) => q.box_qr_code_id === front.box_qr_code_id)).toMatchObject({ status: 'revoked' });
    expect(after.find((q) => q.box_qr_code_id === backup.box_qr_code_id)).toMatchObject({ slot: '1', status: 'active' });
    expect((await as(owner.cookie).get(`/api/v1/boxes/${b.box_id}`).expect(200)).body.qr_task).toBeNull();
    const source = await pool.query(`SELECT confirmed_inspection_id FROM app.qr_issue_case_tb WHERE box_qr_code_id = $1`, [front.box_qr_code_id]);
    expect(source.rows[0].confirmed_inspection_id).toBe(passed);
    // เจ้าของกดซ้ำภายหลัง = ไม่เปลี่ยนที่มา
    expect((await as(owner.cookie).post(`/api/v1/boxes/${b.box_id}/qr-backup-placed`).expect(201)).body.status).toBe('owner_confirmed');
    expect((await issue()).confirmed_by).toBe('inspection');
    // แอดมินเดินเคสต่อได้เหมือนเจ้าของกดเอง
    await as(admin.cookie).post(`/api/v1/admin/boxes/${b.box_id}/qr/reissue`, { slots: [2], request_id: randomUUID() }).expect(201);
    await as(admin.cookie).post(`/api/v1/admin/qr/${front.box_qr_code_id}/reissue`, { slots: [2] }).expect(201);
    await as(admin.cookie).post(`/api/v1/admin/qr/${front.box_qr_code_id}/resolve`).expect(201);
  });

  it('passing with the backup QR without a pending swap case changes nothing', async () => {
    const { b, officer } = await setup();
    const { out } = await pollWhile(b, () => as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[1].url }).expect(201));
    const ins = (out as request.Response).body;
    await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/ready`, {}).expect(200);
    const badge = (await as(officer.cookie).get(`/api/v1/inspections/${ins.id}/badge`).expect(200)).body.qr;
    const result = await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/result`, { attempt: 1, read_ok: true, qr_text: badge, read_ms: 900 }).expect(200);
    expect(result.body.status).toBe('pass');
    const { rows } = await pool.query(
      `SELECT slot, status, health FROM app.box_qr_code_tb WHERE box_id = $1 AND slot IN ('1','2') ORDER BY slot`,
      [b.box_id],
    );
    expect(rows).toEqual([
      { slot: '1', status: 'active', health: 'ok' },
      { slot: '2', status: 'active', health: 'backup_in_use' },
    ]);
  });

  it('scanning twice while the first job is open reuses the inspection (no second wake job) — both scans are logged', async () => {
    const { b, officer } = await setup();
    const { out } = await pollWhile(b, () =>
      Promise.all([
        as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url }),
        as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url }),
      ]),
    );
    const [a1, a2] = out as request.Response[];
    expect([a1.status, a2.status]).toEqual([201, 201]);
    expect(a1.body.id).toBe(a2.body.id);
    const jobs = await pool.query(`SELECT 1 FROM app.box_job_tb WHERE box_id = $1 AND type = 'inspect'`, [b.box_id]);
    expect(jobs.rowCount).toBe(1);
    const logs = await pool.query(`SELECT 1 FROM app.scan_log_tb WHERE box_id = $1 AND actor_kind = 'officer' AND result = 'ok'`, [b.box_id]);
    expect(logs.rowCount).toBe(2);
  });

  it('head sees today per zone and a scan log that includes the box reading the badge (failures too)', async () => {
    const { b, head, officer } = await setup();
    const { out } = await pollWhile(b, () => as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url }).expect(201));
    const ins = (out as request.Response).body;
    await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/ready`, {}).expect(200);
    await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/result`, { attempt: 1, read_ok: true, qr_text: 'junk' }).expect(200);
    const badge = (await as(officer.cookie).get(`/api/v1/inspections/${ins.id}/badge`).expect(200)).body.qr;
    await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/result`, { attempt: 2, read_ok: true, qr_text: badge }).expect(200);

    const today = (await as(head).get('/api/v1/agency/today').expect(200)).body;
    expect(today.zones).toHaveLength(1);
    expect(today.zones[0]).toMatchObject({ houses_total: 1, houses_checked: 1, is_mine: false });
    expect((await as(head).get('/api/v1/agency/today?zone=mine').expect(200)).body.zones).toHaveLength(0);
    const zid = today.zones[0].id as string;
    expect((await as(head).get(`/api/v1/agency/today?zone=${zid}`).expect(200)).body.zones).toHaveLength(1);
    await as(head).get('/api/v1/agency/today?zone=00000000-0000-4000-8000-000000000000').expect(404);

    const logs = (await as(head).get('/api/v1/agency/logs').expect(200)).body.data as { qr_kind: string; result: string; officer: { id: string } }[];
    expect(logs.map((l) => `${l.qr_kind}:${l.result}`)).toEqual(['badge:ok', 'badge:bad_sig', 'front:ok']);
    expect(logs.every((l) => l.officer.id === officer.id)).toBe(true);
    // เจ้าหน้าที่ (ไม่ใช่หัวหน้า) ดูไม่ได้
    await as(officer.cookie).get('/api/v1/agency/logs').expect(404);
  });

  it('admin can show the device secret again (access is logged) · boot tells the box to stay awake for setup', async () => {
    const [b] = (await as(admin.cookie).post('/api/v1/admin/boxes', { count: 1 }).expect(201)).body as Registered[];
    const r = await as(admin.cookie).post(`/api/v1/admin/boxes/${b.box_id}/device-secret`).expect(200);
    expect(r.body).toEqual({ box_id: b.box_id, device_secret: b.device_secret });
    const log = await pool.query(`SELECT fields FROM app.data_access_log_tb WHERE actor_user_id = $1 AND subject_kind = 'box' AND subject_id = $2`, [
      admin.id,
      b.box_id,
    ]);
    expect(log.rows).toEqual([{ fields: ['device_secret'] }]);
    await as(admin.cookie).post('/api/v1/admin/boxes/BX-99999999/device-secret').expect(404);

    const boot = await box(b, 'POST', '/v1/box/boot', { fw: 't', config_ver: 0 }).expect(200);
    expect(boot.body.awake_s).toBe(300);
    const report = await box(b, 'POST', '/v1/box/report', { fw: 't', config_ver: boot.body.config_ver }).expect(200);
    expect(report.body.awake_s).toBeUndefined();
  });

  // AunopSJP/smmb#13 — เจ้าของบ้านเลิกรับการดูแลจากหน่วยงาน (api.md §4.7)
  describe('owner ends agency coverage', () => {
    type Ag = Awaited<ReturnType<typeof agency>>;
    const newZone = async (ag: Ag, boxId: string) => {
      const z = (await as(ag.head).post('/api/v1/agency/zones', { name: `โซน ${seq++}`, windows: SHORT_WINDOW }).expect(201)).body;
      await allDayWindows(pool, z.id);
      await as(ag.head).put(`/api/v1/agency/zones/${z.id}/houses`, { box_ids: [boxId] }).expect(200);
      await as(ag.head).put(`/api/v1/agency/zones/${z.id}/officers`, { user_ids: [ag.officer.id] }).expect(200);
      return z.id as string;
    };
    const leave = (cookie: string, boxId: string, agencyId: string) =>
      http().delete(`/api/v1/boxes/${boxId}/agencies/${agencyId}`).set('Cookie', cookie);
    const agenciesOf = async (cookie: string, boxId: string) =>
      (await as(cookie).get(`/api/v1/boxes/${boxId}/agencies`).expect(200)).body as {
        id: string; name: string; zone_names: string[]; last: boolean;
      }[];

    it('removes the house from every zone of that agency, cancels pending requests and cuts its officers off', async () => {
      const first = await setup();
      const { b, owner } = first;
      await newZone(first, b.box_id); // โซนที่ 2 ของหน่วยงานเดียวกัน
      await acceptPendingHouses(pool);
      const other = await agency();
      await newZone(other, b.box_id);
      await acceptPendingHouses(pool);
      const waiting = await newZone(first, b.box_id); // โซนที่ 3 ยังรอเจ้าของยืนยัน

      const list = await agenciesOf(owner.cookie, b.box_id);
      expect(list).toHaveLength(2);
      expect(list.every((a) => !a.last)).toBe(true);
      const mine = list.find((a) => a.name === first.name)!;
      expect(mine.zone_names).toHaveLength(2);
      await as(first.officer.cookie).get(`/api/v1/officer/boxes/${b.box_id}`).expect(200);

      await leave(owner.cookie, b.box_id, mine.id).expect(200, { ok: true });

      expect(await agenciesOf(owner.cookie, b.box_id)).toMatchObject([{ name: other.name, last: true }]);
      expect(await as(owner.cookie).get('/api/v1/me/zone-requests').expect(200).then((r) => r.body)).toEqual([]);
      const req = await pool.query(`SELECT status FROM app.zone_box_request_tb WHERE zone_id = $1 AND box_id = $2`, [waiting, b.box_id]);
      expect(req.rows).toEqual([{ status: 'cancelled' }]);

      const n = await pool.query(`SELECT data FROM app.notification_tb WHERE user_id IN (SELECT user_id FROM app.agency_member_tb WHERE agency_id = $1 AND is_head) AND type = 'zone_left'`, [mine.id]);
      expect(n.rowCount).toBe(1);
      expect(n.rows[0].data).toMatchObject({ box_id: b.box_id });

      // เจ้าหน้าที่ของหน่วยงานที่ถูกเลิกเข้าถึงข้อมูลบ้านไม่ได้
      await as(first.officer.cookie).get(`/api/v1/officer/boxes/${b.box_id}`).expect(404);
      await as(first.officer.cookie).get(`/api/v1/officer/boxes/${b.box_id}/location`).expect(404);
      expect((await as(first.officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url }).expect(403)).body.code).toBe('NOT_IN_ZONE');
      expect(JSON.stringify((await as(first.officer.cookie).get('/api/v1/officer/summary').expect(200)).body)).not.toContain(b.box_id);
      // อีกหน่วยงานยังดูแลต่อ
      await as(other.officer.cookie).get(`/api/v1/officer/boxes/${b.box_id}`).expect(200);

      const sos = (await as(owner.cookie).post('/api/v1/sos', { box_id: b.box_id }).expect(201)).body;
      await as(first.officer.cookie).get(`/api/v1/sos/${sos.id}/card`).expect(404);
      await as(other.officer.cookie).get(`/api/v1/sos/${sos.id}/card`).expect(200);
    });

    it('after the last agency leaves there is no coverage, and coming back needs a new request', async () => {
      const ag = await setup();
      const { b, owner, head } = ag;
      const [only] = await agenciesOf(owner.cookie, b.box_id);
      expect(only.last).toBe(true);
      // ตู้ถือ long-poll อยู่ → ได้เวลาตรวจใหม่ (ว่าง) ทันที ไม่รอครบ wait 10 วิ
      const ver = (await box(b, 'POST', '/v1/box/boot', { config_ver: 0 }).expect(200)).body.config_ver as number;
      const poll = box(b, 'GET', `/v1/box/jobs?wait=10&config_ver=${ver}`).then((r) => r);
      await new Promise((r) => setTimeout(r, 300));
      const started = Date.now();
      await leave(owner.cookie, b.box_id, only.id).expect(200, { ok: true });
      const polled = await poll;
      expect(Date.now() - started).toBeLessThan(4000);
      expect(polled.body.config_ver).not.toBe(ver);

      const detail = (await as(owner.cookie).get(`/api/v1/boxes/${b.box_id}`).expect(200)).body;
      expect(detail.coverage).toEqual({ has_officer: false, agency_names: [] });
      expect(detail.patrol.windows).toEqual([]);
      expect((await as(owner.cookie).post('/api/v1/sos', { box_id: b.box_id }).expect(200)).body.code).toBe('SOS_NO_COVERAGE');

      const zone = await pool.query(`SELECT zone_id FROM app.zone_tb WHERE agency_id = $1`, [only.id]);
      const houses = await as(head).put(`/api/v1/agency/zones/${zone.rows[0].zone_id}/houses`, { box_ids: [b.box_id] }).expect(200);
      expect(houses.body).toMatchObject([{ pending: true }]);
      expect(await agenciesOf(owner.cookie, b.box_id)).toEqual([]);
      expect((await as(owner.cookie).get('/api/v1/me/zone-requests').expect(200)).body).toHaveLength(1);
    });

    it('is refused with SOS_OPEN while an SOS of the box is open or accepted', async () => {
      const { b, owner, officer } = await setup();
      const [a] = await agenciesOf(owner.cookie, b.box_id);
      const sos = (await as(owner.cookie).post('/api/v1/sos', { box_id: b.box_id }).expect(201)).body;
      expect((await leave(owner.cookie, b.box_id, a.id).expect(409)).body.code).toBe('SOS_OPEN');
      await as(officer.cookie).post(`/api/v1/sos/${sos.id}/accept`).expect(200);
      expect((await leave(owner.cookie, b.box_id, a.id).expect(409)).body.code).toBe('SOS_OPEN');
      expect(await agenciesOf(owner.cookie, b.box_id)).toHaveLength(1);
      await as(owner.cookie).post(`/api/v1/sos/${sos.id}/cancel`, { reason: 'safe' }).expect(200);
      await leave(owner.cookie, b.box_id, a.id).expect(200);
    });

    it('ends an inspection that agency still has running', async () => {
      const { b, owner, officer } = await setup();
      const [a] = await agenciesOf(owner.cookie, b.box_id);
      const { out } = await pollWhile(b, () => as(officer.cookie).post('/api/v1/inspections', { qr_text: b.qr[0].url }).expect(201).then((r) => r));
      const ins = (out as request.Response).body;
      await leave(owner.cookie, b.box_id, a.id).expect(200);
      expect((await as(officer.cookie).get(`/api/v1/inspections/${ins.id}`).expect(200)).body.status).toBe('expired');
      const res = await box(b, 'POST', `/v1/box/jobs/${ins.job_id}/result`, { attempt: 1, read_ok: false, qr_text: null, read_ms: null, flash: false }).expect(410);
      expect(res.body.code).toBe('JOB_EXPIRED');
    });

    it('someone else’s box, or an agency that does not cover it, is 404', async () => {
      const mine = await setup();
      const theirs = await setup();
      const [a] = await agenciesOf(mine.owner.cookie, mine.b.box_id);
      const [t] = await agenciesOf(theirs.owner.cookie, theirs.b.box_id);
      await as(theirs.owner.cookie).get(`/api/v1/boxes/${mine.b.box_id}/agencies`).expect(404);
      await leave(theirs.owner.cookie, mine.b.box_id, a.id).expect(404);
      await leave(mine.owner.cookie, mine.b.box_id, t.id).expect(404);
      await leave(mine.officer.cookie, mine.b.box_id, a.id).expect(404);
      await leave(mine.owner.cookie, mine.b.box_id, 'not-a-uuid').expect(400);
      expect(await agenciesOf(mine.owner.cookie, mine.b.box_id)).toHaveLength(1);
    });
  });
});
