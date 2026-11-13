import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/db/db.module.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';

// เจ้าของบ้านยกเลิกการผูกตู้เอง (api.md §4) — ขายบ้าน/ย้ายออก/ก่อนลบบัญชี
describe('Owner releases a box (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 10;
  const http = () => request(app.getHttpServer());
  const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
  interface Acct { id: string; phone: string; password: string; cookie: string }
  const signup = async (): Promise<Acct> => {
    const phone = `05${run}${seq++}`;
    const res = await http().post('/api/v1/auth/signup/owner').send({ name: 'เจ้าของ', phone, password: 'password123', house_no: '9/9', terms_version: terms }).expect(201);
    return { id: res.body.id as string, phone, password: 'password123', cookie: cookieOf(res) };
  };
  let admin: Acct;

  /** ตู้ใหม่ 1 ใบ ผูกกับเจ้าของใหม่ */
  const boundBox = async () => {
    const [box] = (await http().post('/api/v1/admin/boxes').set('Cookie', admin.cookie).send({ count: 1 }).expect(201)).body as { box_id: string; qr: { slot: string; url: string }[] }[];
    const owner = await signup();
    await http().post('/api/v1/boxes/activate').set('Cookie', owner.cookie).send({ qr_text: box.qr.find((q) => q.slot === 'activate')!.url }).expect(200);
    return { box: box.box_id, owner };
  };
  const release = (cookie: string, box: string, body: object = {}) => http().post(`/api/v1/boxes/${box}/unbind`).set('Cookie', cookie).send(body);
  const row = async (box: string) => (await pool.query(`SELECT owner_user_id, name, house_no, wifi_reset_requested_date FROM app.box_tb WHERE box_id = $1`, [box])).rows[0];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(COUNTER_STORE).useValue(counters).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    pool = app.get(PG_POOL);
    terms = (await http().get('/api/v1/terms/current').expect(200)).body.version;
    admin = await signup();
    await pool.query(`DELETE FROM app.user_role_tb WHERE user_id = $1`, [admin.id]);
    await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'admin')`, [admin.id]);
  });
  beforeEach(() => counters.clear());
  afterAll(async () => {
    await app.close();
  });

  it('releases the box: house data cleared, owner loses it, a fresh activation QR is ready, no QR is leaked back', async () => {
    const { box, owner } = await boundBox();
    const res = await release(owner.cookie, box).expect(200);
    expect(res.body).toEqual({ box_id: box, wifi_reset: true }); // ค่าเริ่มต้น = ลืม Wi-Fi · ไม่มี qr/secret ในคำตอบ
    expect(res.text).not.toMatch(/qr|secret|token/i);

    const b = await row(box);
    expect(b).toMatchObject({ owner_user_id: null, name: null, house_no: null });
    expect(b.wifi_reset_requested_date).not.toBeNull();
    const qr = await pool.query(`SELECT count(*)::int AS n FROM app.box_qr_code_tb WHERE box_id = $1 AND slot = 'activate' AND status = 'active'`, [box]);
    expect(qr.rows[0].n).toBe(1);

    expect((await http().get('/api/v1/boxes').set('Cookie', owner.cookie).expect(200)).body).toEqual([]);
    await http().get(`/api/v1/boxes/${box}`).set('Cookie', owner.cookie).expect(404);
    // บันทึกการเข้าถึงข้อมูล: ผู้กระทำคือเจ้าของ
    const log = await pool.query(`SELECT fields FROM app.data_access_log_tb WHERE subject_kind = 'box' AND subject_id = $1 AND actor_user_id = $2`, [box, owner.id]);
    expect(log.rows[0].fields).toEqual(expect.arrayContaining(['box_unbound', 'by_owner', 'wifi_reset_requested']));
  });

  it('tells every admin (not the owner) and keeps the technician queue clean', async () => {
    const { box, owner } = await boundBox();
    await http().post(`/api/v1/boxes/${box}/technician-requests`).set('Cookie', owner.cookie).send({ reason: 'repair' }).expect(201);
    await release(owner.cookie, box).expect(200);
    const adminNote = await pool.query(`SELECT data FROM app.notification_tb WHERE user_id = $1 AND type = 'box_released' ORDER BY created_date DESC LIMIT 1`, [admin.id]);
    expect(adminNote.rows[0].data).toMatchObject({ box_id: box, wifi_reset: true });
    expect((await pool.query(`SELECT count(*)::int AS n FROM app.notification_tb WHERE user_id = $1 AND type IN ('box_released','box_unbound')`, [owner.id])).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT status FROM app.technician_request_tb WHERE box_id = $1`, [box])).rows.map((r: { status: string }) => r.status)).toEqual(['done']);
  });

  it('can keep the Wi-Fi (reset_wifi:false)', async () => {
    const { box, owner } = await boundBox();
    expect((await release(owner.cookie, box, { reset_wifi: false }).expect(200)).body.wifi_reset).toBe(false);
    expect((await row(box)).wifi_reset_requested_date).toBeNull();
  });

  it('another owner gets 404 and the box stays bound', async () => {
    const { box, owner } = await boundBox();
    const other = await signup();
    await release(other.cookie, box).expect(404);
    expect((await row(box)).owner_user_id).toBe(owner.id);
  });

  it('an open SOS blocks it (409 SOS_OPEN) until it is closed', async () => {
    const { box, owner } = await boundBox();
    await pool.query(`INSERT INTO app.sos_case_tb (box_id, owner_user_id) VALUES ($1, $2)`, [box, owner.id]);
    expect((await release(owner.cookie, box).expect(409)).body.code).toBe('SOS_OPEN');
    expect((await row(box)).owner_user_id).toBe(owner.id);
    await pool.query(`UPDATE app.sos_case_tb SET status = 'closed', closed_date = now() WHERE box_id = $1`, [box]);
    await release(owner.cookie, box).expect(200);
  });

  it('a second release is 404 (the box is no longer theirs); the body is validated', async () => {
    const { box, owner } = await boundBox();
    await release(owner.cookie, box, { reset_wifi: 'yes' }).expect(400);
    await release(owner.cookie, box).expect(200);
    await release(owner.cookie, box).expect(404);
  });

  it('releasing the last box clears the BOX_BOUND blocker, so the account can then be deleted', async () => {
    const { box, owner } = await boundBox();
    expect((await http().get('/api/v1/me/delete-preview').set('Cookie', owner.cookie).expect(200)).body.blockers).toEqual([{ code: 'BOX_BOUND' }]);
    await release(owner.cookie, box).expect(200);
    expect((await http().get('/api/v1/me/delete-preview').set('Cookie', owner.cookie).expect(200)).body.blockers).toEqual([]);
    await http().delete('/api/v1/me').set('Cookie', owner.cookie).send({ password: owner.password, confirm: 'DELETE' }).expect(200);
  });
});
