import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { RequireRole } from '../src/auth/auth.decorators.js';
import { PG_POOL } from '../src/db/db.module.js';
import { NotificationService } from '../src/push/notification.service.js';
import { PUSH_SENDER, type PushSender, type PushTarget } from '../src/push/push.sender.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';

/** route สำหรับเทสต์เท่านั้น — ใช้ตรวจ RolesGuard แบบครบวงจร */
@Controller('api/v1/__probe')
class ProbeController {
  @RequireRole('officer')
  @Get('officer')
  officer() {
    return { ok: true };
  }
}

/** ไม่ยิงออกอินเทอร์เน็ต — เก็บสิ่งที่จะส่งไว้ตรวจ · endpoint ใน dead = push service ตอบ 410 */
class FakeSender implements PushSender {
  readonly enabled = true;
  readonly publicKey = 'test-public-key';
  sent: { endpoint: string; payload: Record<string, any> }[] = [];
  dead = new Set<string>();
  async send(target: PushTarget, payload: string) {
    if (this.dead.has(target.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
    this.sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
  }
}

describe('Push, notifications, terms (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  let notifications: NotificationService;
  const sender = new FakeSender();
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 0;
  const phone = () => `08${run}${String(seq++).padStart(2, '0')}`;
  const endpoint = () => `https://fcm.googleapis.com/fcm/send/e2e-${run}-${seq++}`;
  const keys = { p256dh: 'BPk-test-p256dh', auth: 'test-auth' };

  const http = () => request(app.getHttpServer());
  const sid = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];

  const owner = async () => {
    const p = phone();
    const res = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'สมศรี', phone: p, password: 'password123', house_no: '1', terms_version: terms })
      .expect(201);
    return { id: res.body.id as string, phone: p, cookie: sid(res) };
  };
  const signin = async (p: string) =>
    sid(await http().post('/api/v1/auth/signin').send({ phone: p, password: 'password123' }).expect(200));
  const subscribe = (cookie: string, ep: string) =>
    http().post('/api/v1/me/push/subscriptions').set('Cookie', cookie).send({ endpoint: ep, keys, expirationTime: null });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule], controllers: [ProbeController] })
      .overrideProvider(COUNTER_STORE)
      .useValue(counters)
      .overrideProvider(PUSH_SENDER)
      .useValue(sender)
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    pool = app.get(PG_POOL);
    notifications = app.get(NotificationService);
    terms = (await http().get('/api/v1/terms/current').expect(200)).body.version;
  });

  beforeEach(() => {
    counters.clear();
    sender.sent = [];
  });

  afterAll(async () => {
    await app.close();
  });

  describe('subscriptions', () => {
    it('VAPID public key is public', async () => {
      const res = await http().get('/api/v1/me/push/vapid-key').expect(200);
      expect(res.body).toEqual({ public_key: 'test-public-key' });
    });

    it('rejects endpoints that are not a known push service (SSRF)', async () => {
      const u = await owner();
      for (const ep of ['https://169.254.169.254/latest', 'http://fcm.googleapis.com/x', 'https://localhost/x']) {
        const res = await subscribe(u.cookie, ep).expect(400);
        expect(res.body.message.join(' ')).toMatch(/push service/);
      }
    });

    it('subscription belongs to this device: Me.push.subscribed only on this session', async () => {
      const u = await owner();
      const other = await signin(u.phone);
      await subscribe(u.cookie, endpoint()).expect(201);
      expect((await http().get('/api/v1/me').set('Cookie', u.cookie).expect(200)).body.push).toEqual({ subscribed: true });
      expect((await http().get('/api/v1/me').set('Cookie', other).expect(200)).body.push).toEqual({ subscribed: false });
    });

    it('test push goes to this device only, in Angular service worker format', async () => {
      const u = await owner();
      const other = await signin(u.phone);
      const mine = endpoint();
      await subscribe(u.cookie, mine).expect(201);
      await subscribe(other, endpoint()).expect(201);

      const res = await http().post('/api/v1/me/push/test').set('Cookie', u.cookie).expect(202);
      expect(res.body).toEqual({ sent: 1 });
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0].endpoint).toBe(mine);
      expect(sender.sent[0].payload.notification).toMatchObject({
        title: 'Smart Mailbox',
        body: 'เปิดแจ้งเตือนสำเร็จ ✅',
        data: { type: 'test', onActionClick: { default: { url: '/' } } },
      });
    });

    it('signing out stops pushes to that device', async () => {
      const u = await owner();
      await subscribe(u.cookie, endpoint()).expect(201);
      await http().post('/api/v1/auth/signout').set('Cookie', u.cookie).expect(200);
      await notifications.notify([u.id], { type: 'delivered', data: {}, link: '/' });
      expect(sender.sent).toHaveLength(0);
      // แต่ยังเก็บในหน้าแจ้งเตือน (ดูย้อนหลังได้เมื่อล็อกอินใหม่)
      const again = await signin(u.phone);
      const list = await http().get('/api/v1/me/notifications').set('Cookie', again).expect(200);
      expect(list.body.total).toBe(1);
    });

    it('same device signed in by another person → subscription moves to them', async () => {
      const a = await owner();
      const b = await owner();
      const ep = endpoint();
      await subscribe(a.cookie, ep).expect(201);
      await subscribe(b.cookie, ep).expect(201);
      await notifications.notify([a.id], { type: 'delivered', data: {}, link: '/' });
      expect(sender.sent).toHaveLength(0);
      await notifications.notify([b.id], { type: 'delivered', data: {}, link: '/' });
      expect(sender.sent.map((s) => s.endpoint)).toEqual([ep]);
    });

    it('push service says 410 → subscription is deleted', async () => {
      const u = await owner();
      const ep = endpoint();
      await subscribe(u.cookie, ep).expect(201);
      sender.dead.add(ep);
      await notifications.notify([u.id], { type: 'delivered', data: {}, link: '/' });
      const { rows } = await pool.query('SELECT 1 FROM app.push_subscription_tb WHERE endpoint = $1', [ep]);
      expect(rows).toHaveLength(0);
    });

    it('cannot delete someone else’s subscription', async () => {
      const a = await owner();
      const b = await owner();
      const ep = endpoint();
      await subscribe(a.cookie, ep).expect(201);
      await http().delete('/api/v1/me/push/subscriptions').set('Cookie', b.cookie).send({ endpoint: ep }).expect(200);
      const { rows } = await pool.query('SELECT 1 FROM app.push_subscription_tb WHERE endpoint = $1', [ep]);
      expect(rows).toHaveLength(1);
      await http().delete('/api/v1/me/push/subscriptions').set('Cookie', a.cookie).send({ endpoint: ep }).expect(200);
      expect((await pool.query('SELECT 1 FROM app.push_subscription_tb WHERE endpoint = $1', [ep])).rows).toHaveLength(0);
    });
  });

  describe('notification list', () => {
    it('renders in the user’s language, pages, and marks read', async () => {
      const u = await owner();
      await notifications.notify([u.id], { type: 'delivered', data: {}, link: '/history/1' });
      await notifications.notify([u.id], { type: 'low_battery', data: { box_name: 'ตู้หน้าบ้าน', battery_pct: 18 }, link: '/' });

      const th = await http().get('/api/v1/me/notifications?per_page=1').set('Cookie', u.cookie).expect(200);
      expect(th.body).toMatchObject({ page: 1, per_page: 1, total: 2 });
      expect(th.body.data[0]).toMatchObject({ type: 'low_battery', title: '🔋 แบตตู้ใกล้หมด', body: 'ตู้หน้าบ้าน แบตเหลือ 18%', read_at: null });
      expect(Object.keys(th.body.data[0]).sort()).toEqual(['body', 'created_at', 'data', 'id', 'link', 'read_at', 'title', 'type']);

      await pool.query(`UPDATE app.user_tb SET prefs = prefs || '{"lang":"en"}' WHERE user_id = $1`, [u.id]);
      const en = await http().get('/api/v1/me/notifications').set('Cookie', u.cookie).expect(200);
      expect(en.body.data.map((n: { title: string }) => n.title)).toEqual(['🔋 Low battery', '🛵 Delivery']);

      const first = en.body.data[0].id;
      const r1 = await http().post('/api/v1/me/notifications/read').set('Cookie', u.cookie).send({ ids: [first] }).expect(200);
      expect(r1.body.updated).toBe(1);
      const unread = await http().get('/api/v1/me/notifications?unread=true').set('Cookie', u.cookie).expect(200);
      expect(unread.body.total).toBe(1);
      await http().post('/api/v1/me/notifications/read').set('Cookie', u.cookie).send({}).expect(200);
      expect((await http().get('/api/v1/me/notifications?unread=1').set('Cookie', u.cookie).expect(200)).body.total).toBe(0);
    });

    it('cannot read or mark other people’s notifications', async () => {
      const a = await owner();
      const b = await owner();
      await notifications.notify([a.id], { type: 'delivered', data: {}, link: '/' });
      const list = await http().get('/api/v1/me/notifications').set('Cookie', b.cookie).expect(200);
      expect(list.body.total).toBe(0);
      const aId = (await http().get('/api/v1/me/notifications').set('Cookie', a.cookie)).body.data[0].id;
      const r = await http().post('/api/v1/me/notifications/read').set('Cookie', b.cookie).send({ ids: [aId] }).expect(200);
      expect(r.body.updated).toBe(0);
    });

    it('per_page over 100 → 400', async () => {
      const u = await owner();
      await http().get('/api/v1/me/notifications?per_page=101').set('Cookie', u.cookie).expect(400);
    });
  });

  describe('officer routes need notifications on (PUSH_REQUIRED)', () => {
    const officer = async (status: 'active' | 'pending') => {
      const code = `PG${run}${seq++}`;
      await pool.query(`INSERT INTO app.agency_tb (name, type, status, group_code) VALUES ('สภ.', 'police', 'approved', $1)`, [code]);
      const res = await http()
        .post('/api/v1/auth/signup/officer')
        .send({ name: 'ส.ต.ต.', phone: phone(), password: 'password123', group_code: code, terms_version: terms })
        .expect(201);
      if (status === 'active') {
        await pool.query(`UPDATE app.agency_member_tb SET status = 'active' WHERE user_id = $1`, [res.body.id]);
        await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'officer')`, [res.body.id]);
      }
      return sid(res);
    };

    it('approved officer without push → 403 PUSH_REQUIRED, with push → 200', async () => {
      const cookie = await officer('active');
      const before = await http().get('/api/v1/__probe/officer').set('Cookie', cookie).expect(403);
      expect(before.body.code).toBe('PUSH_REQUIRED');
      await subscribe(cookie, endpoint()).expect(201);
      await http().get('/api/v1/__probe/officer').set('Cookie', cookie).expect(200);
    });

    it('officer waiting for approval → ACCOUNT_PENDING; owner → 404', async () => {
      const pending = await officer('pending');
      expect((await http().get('/api/v1/__probe/officer').set('Cookie', pending).expect(403)).body.code).toBe('ACCOUNT_PENDING');
      const u = await owner();
      await http().get('/api/v1/__probe/officer').set('Cookie', u.cookie).expect(404);
    });
  });

  // ท้ายไฟล์ — ประกาศข้อตกลงใหม่กระทบทุกบัญชีในฐานข้อมูล
  describe('updated terms', () => {
    it('blocks everything except verify/me/accept until the new version is accepted', async () => {
      const u = await owner();
      const v = `e2e-${run}`;
      await pool.query(`INSERT INTO app.terms_tb (terms_version, body_md, published_date) VALUES ($1, 'ข้อตกลงใหม่', now())`, [v]);

      const me = await http().get('/api/v1/me').set('Cookie', u.cookie).expect(200);
      expect(me.body.terms_update_required).toBe(true);
      await http().get('/api/v1/auth/verify').set('Cookie', u.cookie).expect(200);
      const blocked = await http().get('/api/v1/me/notifications').set('Cookie', u.cookie).expect(403);
      expect(blocked.body.code).toBe('TERMS_UPDATE_REQUIRED');

      const stale = await http().post('/api/v1/me/terms').set('Cookie', u.cookie).send({ terms_version: terms }).expect(400);
      expect(stale.body.code).toBe('TERMS_NOT_ACCEPTED');
      const ok = await http().post('/api/v1/me/terms').set('Cookie', u.cookie).send({ terms_version: v }).expect(200);
      expect(ok.body.terms_update_required).toBe(false);
      await http().get('/api/v1/me/notifications').set('Cookie', u.cookie).expect(200);
    });
  });
});
