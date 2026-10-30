import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { PUSH_SENDER, type PushSender } from '../src/push/push.sender.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';

class SilentSender implements PushSender {
  readonly enabled = true;
  readonly publicKey = 'k';
  async send() {}
}

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** ทุก route ที่ลงทะเบียนจริงในแอป (ไม่ใช่รายการที่เขียนมือ — route ใหม่ที่ลืมใส่สิทธิ์จะถูกจับเอง) */
function allRoutes(app: NestExpressApplication): { method: string; path: string }[] {
  const router = (app.getHttpAdapter().getInstance() as { router?: { stack: Layer[] }; _router?: { stack: Layer[] } });
  const stack = (router.router ?? router._router)?.stack ?? [];
  const out: { method: string; path: string }[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) out.push({ method: method.toUpperCase(), path: layer.route.path });
  }
  return out;
}

/** route ที่ตั้งใจให้เข้าได้โดยไม่ล็อกอิน (เหมือน @Public() ในโค้ด) — ที่เหลือต้องปฏิเสธคนไม่ล็อกอิน */
const PUBLIC = new Set([
  'POST /api/v1/auth/signup/owner',
  'POST /api/v1/auth/signup/officer',
  'POST /api/v1/auth/signup/agency',
  'POST /api/v1/auth/signin',
  'GET /api/v1/terms/current',
  'GET /api/v1/support',
  'GET /api/v1/public/qr/:token',
  'GET /api/v1/public/codes/:code',
  'POST /api/v1/public/deliveries',
  // กุญแจสาธารณะของ VAPID — เบราว์เซอร์ต้องใช้ตอนขอสิทธิ์แจ้งเตือนก่อนล็อกอิน (หน้า A03) · ไม่ใช่ความลับ
  'GET /api/v1/me/push/vapid-key',
]);

const isPublic = (r: { method: string; path: string }) =>
  PUBLIC.has(`${r.method} ${r.path}`) || r.path.startsWith('/api/health') || r.path.startsWith('/v1/box/');

const fill = (path: string) =>
  path
    .replace(/:box_id/g, 'BX-00001')
    .replace(/:job_id/g, 'J-000000')
    .replace(/:(\w*id)\b/g, '00000000-0000-0000-0000-000000000000')
    .replace(/:\w+/g, 'x');

// กฎความปลอดภัยของ route ทั้งระบบ (CLAUDE.md: ทุก route ต้องล็อกอินเป็นค่าเริ่มต้น · ทำนอกขอบเขต → 404)
describe('Route security (e2e)', () => {
  let app: NestExpressApplication;
  const counters = new MemoryCounterStore();
  const http = () => request(app.getHttpServer());
  const run = String(Date.now()).slice(-6);

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
  });

  afterAll(async () => app.close());
  beforeEach(() => counters.clear());

  it('finds the routes (guards the guard test itself)', () => {
    expect(allRoutes(app).length).toBeGreaterThan(100);
  });

  it('every non-public route refuses a request without a session', async () => {
    const leaks: string[] = [];
    for (const r of allRoutes(app).filter((x) => !isPublic(x))) {
      const res = await http()[r.method.toLowerCase() as 'get'](fill(r.path)).send(r.method === 'GET' ? undefined : {});
      if (res.status !== 401) leaks.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('box API refuses unsigned requests', async () => {
    const leaks: string[] = [];
    for (const r of allRoutes(app).filter((x) => x.path.startsWith('/v1/box/'))) {
      const res = await http()[r.method.toLowerCase() as 'get'](fill(r.path)).send(r.method === 'GET' ? undefined : {});
      if (res.status !== 401) leaks.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('a plain homeowner cannot reach admin, agency (head) or officer routes — answered as not found', async () => {
    const terms = (await http().get('/api/v1/terms/current').expect(200)).body.version as string;
    const res = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'เจ้าของ', phone: `05${run}00`, password: 'password123', house_no: '1/1', terms_version: terms })
      .expect(201);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
    const leaks: string[] = [];
    for (const r of allRoutes(app).filter((x) => /^\/api\/v1\/(admin|agency|officer|inspections)(\/|$)/.test(x.path))) {
      const out = await http()[r.method.toLowerCase() as 'get'](fill(r.path)).set('Cookie', cookie).send(r.method === 'GET' ? undefined : {});
      if (out.status !== 404) leaks.push(`${r.method} ${r.path} → ${out.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('another homeowner gets 404 on every route of a box that is not theirs', async () => {
    const terms = (await http().get('/api/v1/terms/current').expect(200)).body.version as string;
    const signup = async (phone: string, house: string) => {
      const res = await http().post('/api/v1/auth/signup/owner').send({ name: 'เจ้าของ', phone, password: 'password123', house_no: house, terms_version: terms }).expect(201);
      return { id: res.body.id as string, cookie: ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0] };
    };
    const admin = await signup(`05${run}01`, '1');
    const pool = app.get<import('pg').Pool>((await import('../src/db/db.module.js')).PG_POOL);
    await pool.query(`DELETE FROM app.user_role_tb WHERE user_id = $1`, [admin.id]);
    await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'admin')`, [admin.id]);
    const [box] = (await http().post('/api/v1/admin/boxes').set('Cookie', admin.cookie).send({ count: 1 }).expect(201)).body as { box_id: string; qr: { slot: string; url: string }[] }[];
    const a = await signup(`05${run}02`, '2/2');
    const b = await signup(`05${run}03`, '3/3');
    await http().post('/api/v1/boxes/activate').set('Cookie', a.cookie).send({ qr_text: box.qr.find((q) => q.slot === 'activate')!.url }).expect(200);

    // body ที่ผ่านการตรวจรูปแบบ (ไม่งั้นได้ 400 ก่อนถึงการตรวจสิทธิ์ ซึ่งไม่ได้แปลว่ารั่ว)
    const bodyFor = (path: string): object =>
      path.endsWith('/technician-requests') ? { reason: 'repair' } : path.endsWith('/qr/reissue') ? { slots: [1], request_id: '00000000-0000-0000-0000-000000000000' } : { name: 'x' };
    const leaks: string[] = [];
    const mine = allRoutes(app).filter((r) => r.path.startsWith('/api/v1/boxes/:box_id'));
    expect(mine.length).toBeGreaterThan(5);
    for (const r of mine) {
      const url = fill(r.path).replace('BX-00001', box.box_id);
      const out = await http()[r.method.toLowerCase() as 'get'](url).set('Cookie', b.cookie).send(r.method === 'GET' ? undefined : bodyFor(r.path));
      if (out.status !== 404) leaks.push(`${r.method} ${r.path} → ${out.status}`);
    }
    expect(leaks).toEqual([]);
    // เจ้าของจริงเข้าได้ (ไม่ใช่ 404 ทุกอย่าง)
    expect((await http().get(`/api/v1/boxes/${box.box_id}`).set('Cookie', a.cookie)).status).toBe(200);
  });
});
