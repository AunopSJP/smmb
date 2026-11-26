import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/db/db.module.js';
import { renderMessage } from '../src/push/messages.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';

// เจ้าของบ้านยกเลิกคำขอช่าง (api.md §4.4, §9)
describe('Owner cancels a technician request (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 10;
  const http = () => request(app.getHttpServer());
  const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
  interface Acct { id: string; cookie: string }
  const signup = async (): Promise<Acct> => {
    const res = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'เจ้าของ', phone: `04${run}${seq++}`, password: 'password123', house_no: '9/9', terms_version: terms })
      .expect(201);
    return { id: res.body.id as string, cookie: cookieOf(res) };
  };
  let admin: Acct;

  const boundBox = async () => {
    const [box] = (await http().post('/api/v1/admin/boxes').set('Cookie', admin.cookie).send({ count: 1 }).expect(201)).body as { box_id: string; qr: { slot: string; url: string }[] }[];
    const owner = await signup();
    await http().post('/api/v1/boxes/activate').set('Cookie', owner.cookie).send({ qr_text: box.qr.find((q) => q.slot === 'activate')!.url }).expect(200);
    return { box: box.box_id, owner };
  };
  const create = async (cookie: string, box: string) =>
    (await http().post(`/api/v1/boxes/${box}/technician-requests`).set('Cookie', cookie).send({ reason: 'repair' }).expect(201)).body.id as string;
  const cancel = (cookie: string, box: string, id: string) => http().post(`/api/v1/boxes/${box}/technician-requests/${id}/cancel`).set('Cookie', cookie);
  const patch = (id: string, body: object) => http().patch(`/api/v1/admin/technician-requests/${id}`).set('Cookie', admin.cookie).send(body);
  const notes = async (userId: string, box: string) =>
    (await pool.query(`SELECT data, link FROM app.notification_tb WHERE user_id = $1 AND type = 'technician_request_cancelled' AND data->>'box_id' = $2`, [userId, box])).rows;

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

  it('cancels a waiting request: recorded apart from done, admin told, no confirmation, a new request is allowed', async () => {
    const { box, owner } = await boundBox();
    const id = await create(owner.cookie, box);
    const res = await cancel(owner.cookie, box, id).expect(200);
    expect(res.body).toMatchObject({ id, status: 'cancelled', scheduled_at: null, owner_result: null });
    expect(res.body.cancelled_at).toEqual(expect.any(String));

    expect(await notes(admin.id, box)).toEqual([{ data: { box_id: box, scheduled_at: '' }, link: '/admin/technician-requests' }]);
    expect(await notes(owner.id, box)).toEqual([]);
    await http().post(`/api/v1/boxes/${box}/technician-requests/${id}/confirm`).set('Cookie', owner.cookie).send({ result: 'ok' }).expect(404);

    const next = await create(owner.cookie, box);
    expect(next).not.toBe(id);
    const list = (await http().get('/api/v1/admin/technician-requests?status=cancelled').set('Cookie', admin.cookie).expect(200)).body as { id: string }[];
    expect(list.map((r) => r.id)).toContain(id);
    expect(list.map((r) => r.id)).not.toContain(next);
  });

  it('cancels a scheduled request and tells the admin the appointment date', async () => {
    const { box, owner } = await boundBox();
    const id = await create(owner.cookie, box);
    const at = '2027-01-15T03:30:00.000Z';
    await patch(id, { status: 'scheduled', scheduled_at: at }).expect(200);
    expect((await cancel(owner.cookie, box, id).expect(200)).body).toMatchObject({ status: 'cancelled', scheduled_at: at });
    const [note] = await notes(admin.id, box);
    expect(note.data).toEqual({ box_id: box, scheduled_at: at });
    expect(renderMessage('technician_request_cancelled', note.data, 'th').body).toContain('15 ม.ค. 10:30');
    expect(renderMessage('technician_request_cancelled', note.data, 'en').body).toContain('15 Jan 10:30');
  });

  it('a cancelled or completed request cannot be changed (409 with a code)', async () => {
    const { box, owner } = await boundBox();
    const id = await create(owner.cookie, box);
    await cancel(owner.cookie, box, id).expect(200);
    expect((await cancel(owner.cookie, box, id).expect(409)).body.code).toBe('TECHNICIAN_REQUEST_CLOSED');
    expect((await patch(id, { status: 'scheduled', scheduled_at: '2027-01-15T03:30:00.000Z' }).expect(409)).body.code).toBe('TECHNICIAN_REQUEST_CANCELLED');
    expect((await patch(id, { status: 'done' }).expect(409)).body.code).toBe('TECHNICIAN_REQUEST_CANCELLED');
    expect(await notes(admin.id, box)).toHaveLength(1);

    const done = await create(owner.cookie, box);
    await patch(done, { status: 'done' }).expect(200);
    expect((await cancel(owner.cookie, box, done).expect(409)).body.code).toBe('TECHNICIAN_REQUEST_CLOSED');
    await patch(done, { status: 'cancelled' }).expect(400);
  });

  it('is 404 for another owner, for another box, and after the box is released', async () => {
    const { box, owner } = await boundBox();
    const other = await boundBox();
    const id = await create(owner.cookie, box);
    await cancel(other.owner.cookie, box, id).expect(404);
    await cancel(other.owner.cookie, other.box, id).expect(404);
    expect((await pool.query(`SELECT status FROM app.technician_request_tb WHERE technician_request_id = $1`, [id])).rows[0].status).toBe('open');
    await http().post(`/api/v1/boxes/${box}/unbind`).set('Cookie', owner.cookie).send({}).expect(200);
    await cancel(owner.cookie, box, id).expect(404);
  });
});
