import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
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
  qr: { slot: 1 | 2 | 'activate'; url: string }[];
}

// งานเบื้องหลัง (design §8): ตู้หลุดในเวลาตรวจ · ตู้เงียบ 26 ชม. · สุขภาพ QR · ล้างของหมดอายุ
describe('Scheduler (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 0;
  const phone = () => `07${run}${String(seq++).padStart(2, '0')}`;
  const PW = 'password123';

  const http = () => request(app.getHttpServer());
  const sid = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body: object = {}) => http().post(url).set('Cookie', cookie).send(body),
    put: (url: string, body: object = {}) => http().put(url).set('Cookie', cookie).send(body),
  });

  let admin: { id: string; cookie: string };
  const register = async (): Promise<Registered> => (await as(admin.cookie).post('/api/v1/admin/boxes', { count: 1 }).expect(201)).body[0];
  const signupOwner = async (house: string) => {
    const res = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'เจ้าของ', phone: phone(), password: PW, house_no: house, terms_version: terms })
      .expect(201);
    return { id: res.body.id as string, cookie: sid(res) };
  };
  /** ตู้ที่มีเจ้าของแล้ว */
  const boundBox = async (house: string) => {
    const b = await register();
    const owner = await signupOwner(house);
    await as(owner.cookie).post('/api/v1/boxes/activate', { qr_text: b.qr.find((q) => q.slot === 'activate')!.url }).expect(200);
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
    // หัวหน้า/เจ้าหน้าที่ต้องเปิดแจ้งเตือนก่อนใช้งาน (403 PUSH_REQUIRED)
    await as(cookie)
      .post('/api/v1/me/push/subscriptions', { endpoint: `https://fcm.googleapis.com/fcm/send/sch-${run}-${seq++}`, keys: { p256dh: 'p', auth: 'a' } })
      .expect(201);
    return cookie;
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

  /** จำนวนแจ้งเตือนชนิดนี้ของตู้นี้ที่ผู้ใช้คนนี้ได้รับ */
  const notified = async (userId: string, type: string, boxId: string) =>
    (await pool.query(`SELECT 1 FROM app.notification_tb WHERE user_id = $1 AND type = $2 AND data->>'box_id' = $3`, [userId, type, boxId])).rowCount ?? 0;

  /** ตู้ที่ผูกแล้วและอยู่ในโซนที่ตรวจทั้งวัน */
  const patrolledBox = async () => {
    const { b, owner } = await boundBox(`77/${seq++}`);
    const head = await readyHead();
    const zone = (await as(head).post('/api/v1/agency/zones', { name: `โซน ${seq++}`, windows: [['00:00', '23:59']] }).expect(201)).body;
    await as(head).put(`/api/v1/agency/zones/${zone.id}/houses`, { box_ids: [b.box_id] }).expect(200);
    return { b, owner };
  };
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  /** เที่ยงวันไทย — อยู่กลางเวลาตรวจทั้งวันแน่ ๆ (ไม่ผูกกับนาฬิกาจริงของเครื่องที่รันเทสต์) */
  const noon = () => new Date(`${today()}T12:00:00+07:00`);
  const minutesBefore = (d: Date, m: number) => new Date(d.getTime() - m * 60_000);
  const scheduler = () => app.get(SchedulerService);

  describe('box offline during patrol hours', () => {
    it('alerts the owner and admins once, again only after the box was back; boxes without patrol hours or closed are left alone', async () => {
      const { b, owner } = await patrolledBox();
      const now = noon();
      const lastPoll = (m: number) => pool.query(`UPDATE app.box_tb SET last_poll_date = $2 WHERE box_id = $1`, [b.box_id, minutesBefore(now, m)]);

      await lastPoll(2); // เพิ่งถือ long-poll
      await scheduler().watchOffline(now);
      expect(await notified(owner.id, 'box_offline', b.box_id)).toBe(0);

      await lastPoll(20); // หายไป 20 นาทีกลางเวลาตรวจ
      await scheduler().watchOffline(now);
      expect(await notified(owner.id, 'box_offline', b.box_id)).toBe(1);
      expect(await notified(admin.id, 'box_offline', b.box_id)).toBe(1);

      await scheduler().watchOffline(now); // รอบต่อไป ไม่แจ้งซ้ำ
      expect(await notified(owner.id, 'box_offline', b.box_id)).toBe(1);

      await lastPoll(1); // กลับมาออนไลน์ → ล้างเครื่องหมาย
      await scheduler().watchOffline(now);
      await lastPoll(30); // หลุดอีกรอบ → แจ้งใหม่
      await scheduler().watchOffline(now);
      expect(await notified(owner.id, 'box_offline', b.box_id)).toBe(2);

      // ตู้ที่ไม่อยู่ในโซนไหน (ไม่มีเวลาตรวจ) → ไม่แจ้ง
      const lone = await boundBox(`78/${seq++}`);
      await pool.query(`UPDATE app.box_tb SET last_poll_date = $2 WHERE box_id = $1`, [lone.b.box_id, minutesBefore(now, 600)]);
      await scheduler().watchOffline(now);
      expect(await notified(lone.owner.id, 'box_offline', lone.b.box_id)).toBe(0);

      // ปิดบริการ → ไม่แจ้ง
      await pool.query(`UPDATE app.box_tb SET service_active = false, offline_notified_date = NULL WHERE box_id = $1`, [b.box_id]);
      await scheduler().watchOffline(now);
      expect(await notified(owner.id, 'box_offline', b.box_id)).toBe(2);
    });

    it('the first 5 minutes of a patrol window are a grace period', async () => {
      const { b, owner } = await patrolledBox();
      await pool.query(`UPDATE app.box_tb SET last_poll_date = NULL WHERE box_id = $1`, [b.box_id]);
      await scheduler().watchOffline(new Date(`${today()}T00:03:00+07:00`));
      expect(await notified(owner.id, 'box_offline', b.box_id)).toBe(0);
      await scheduler().watchOffline(new Date(`${today()}T00:08:00+07:00`));
      expect(await notified(owner.id, 'box_offline', b.box_id)).toBe(1);
    });
  });

  describe('silent box (26 hours)', () => {
    it('alerts admins once when a box that was seen goes quiet, and rearms when it reports again', async () => {
      const { b, owner } = await boundBox(`79/${seq++}`);
      const now = new Date();
      const seen = (h: number) => pool.query(`UPDATE app.box_tb SET last_seen_date = $2 WHERE box_id = $1`, [b.box_id, new Date(now.getTime() - h * 3600_000)]);

      await seen(5);
      await scheduler().watchSilent(now);
      expect(await notified(admin.id, 'box_silent_26h', b.box_id)).toBe(0);

      await seen(27);
      await scheduler().watchSilent(now);
      await scheduler().watchSilent(now);
      expect(await notified(admin.id, 'box_silent_26h', b.box_id)).toBe(1);
      expect(await notified(owner.id, 'box_silent_26h', b.box_id)).toBe(0); // เรื่องนี้แจ้งแอดมินเท่านั้น

      await seen(1);
      await scheduler().watchSilent(now);
      await seen(30);
      await scheduler().watchSilent(now);
      expect(await notified(admin.id, 'box_silent_26h', b.box_id)).toBe(2);
    });
  });

  describe('QR health (daily)', () => {
    const front = async (boxId: string) =>
      (
        await pool.query<{ health: string; health_reasons: string[]; health_notified_date: Date | null }>(
          `SELECT health, health_reasons, health_notified_date FROM app.box_qr_code_tb WHERE box_id = $1 AND slot = '1' AND status = 'active'`,
          [boxId],
        )
      ).rows[0];
    const adminNotices = async () =>
      ((await pool.query(`SELECT count(*)::int AS n FROM app.notification_tb WHERE user_id = $1 AND type = 'qr_health'`, [admin.id])).rows[0] as { n: number }).n;

    it('flags a QR that is 11 months old and tells admins once', async () => {
      const { b } = await boundBox(`80/${seq++}`);
      expect((await front(b.box_id)).health).toBe('ok');
      await pool.query(`UPDATE app.box_qr_code_tb SET created_date = now() - interval '11 months 2 days' WHERE box_id = $1 AND slot = '1'`, [b.box_id]);

      await scheduler().checkQrHealth();
      const row = await front(b.box_id);
      expect(row).toMatchObject({ health: 'expiring', health_reasons: ['age_11m'] });
      expect(row.health_notified_date).not.toBeNull();
      const before = await adminNotices();
      expect(before).toBeGreaterThan(0);

      await scheduler().checkQrHealth(); // ไม่มีอะไรใหม่ → ไม่แจ้งซ้ำ
      expect(await adminNotices()).toBe(before);
    });

    it('flags a front QR nobody scanned for 2 days although the house is in a zone — not one just scanned, nor a house without a zone', async () => {
      const quiet = await patrolledBox();
      const scanned = await patrolledBox();
      const noZone = await boundBox(`81/${seq++}`);
      await pool.query(
        `UPDATE app.box_qr_code_tb SET created_date = now() - interval '5 days',
           last_scanned_date = CASE WHEN box_id = $2 THEN now() - interval '1 hour' ELSE NULL END
         WHERE box_id = ANY($1) AND slot = '1'`,
        [[quiet.b.box_id, scanned.b.box_id, noZone.b.box_id], scanned.b.box_id],
      );
      await scheduler().checkQrHealth();
      expect(await front(quiet.b.box_id)).toMatchObject({ health: 'suspicious', health_reasons: ['not_scanned_2d'] });
      expect((await front(scanned.b.box_id)).health).toBe('ok');
      expect((await front(noZone.b.box_id)).health).toBe('ok');
    });

    it('keeps a stronger flag (maybe_fake) and rearms the notice once a QR is ok again', async () => {
      const { b } = await patrolledBox();
      await pool.query(`UPDATE app.box_qr_code_tb SET created_date = now() - interval '12 months', health = 'maybe_fake' WHERE box_id = $1 AND slot = '1'`, [b.box_id]);
      await scheduler().checkQrHealth();
      expect((await front(b.box_id)).health).toBe('maybe_fake');
      await pool.query(`UPDATE app.box_qr_code_tb SET health = 'ok', health_reasons = '{}', created_date = now() WHERE box_id = $1 AND slot = '1'`, [b.box_id]);
      await scheduler().checkQrHealth();
      expect((await front(b.box_id)).health_notified_date).toBeNull();
    });
  });

  describe('plan (GET /me/plan) and the expiring notice', () => {
    it('shows the current plan in the saved language, flags expiring/expired, and warns the owner once', async () => {
      const owner = await signupOwner(`97/${seq++}`);
      const plan = async () => (await http().get('/api/v1/me/plan').set('Cookie', owner.cookie).expect(200)).body;
      expect(await plan()).toMatchObject({ code: 'free', name: 'ฟรี', status: 'active', ends_at: null });
      await http().patch('/api/v1/me').set('Cookie', owner.cookie).send({ prefs: { lang: 'en' } }).expect(200);
      expect((await plan()).name).toBe('Free');

      // ใกล้หมดอายุ (3 วัน) → status expiring + แจ้งเตือนครั้งเดียว
      await pool.query(`UPDATE app.user_plan_tb SET end_date = now() + interval '3 days' WHERE user_id = $1`, [owner.id]);
      expect(await plan()).toMatchObject({ status: 'expiring', ends_at: expect.any(String) });
      const count = async () => (await pool.query(`SELECT 1 FROM app.notification_tb WHERE user_id = $1 AND type = 'plan_expiring'`, [owner.id])).rowCount ?? 0;
      await scheduler().watchPlans();
      await scheduler().watchPlans();
      expect(await count()).toBe(1);

      // ยังเหลือเยอะ → active · หมดแล้ว → expired (ยังเห็นแพ็กล่าสุด)
      await pool.query(`UPDATE app.user_plan_tb SET end_date = now() + interval '30 days' WHERE user_id = $1`, [owner.id]);
      expect((await plan()).status).toBe('active');
      await pool.query(`UPDATE app.user_plan_tb SET start_date = now() - interval '10 days', end_date = now() - interval '1 day' WHERE user_id = $1`, [owner.id]);
      expect(await plan()).toMatchObject({ code: 'free', status: 'expired' });
    });

    it('only homeowners can read it', async () => {
      const head = await readyHead();
      await as(head).get('/api/v1/me/plan').expect(404);
      await http().get('/api/v1/me/plan').expect(401);
    });
  });

  describe('cleanup', () => {
    it('removes sessions that expired long ago and keeps recent ones', async () => {
      const mk = (hash: string, expire: string) =>
        pool.query(`INSERT INTO app.session_tb (token_hash, user_id, token_version, expire_date) VALUES ($1, $2, 0, now() + $3::interval)`, [hash, admin.id, expire]);
      await mk(`old-${run}`, '-40 days');
      await mk(`recent-${run}`, '-1 day');
      await scheduler().cleanup();
      const left = (await pool.query(`SELECT token_hash FROM app.session_tb WHERE token_hash IN ($1, $2)`, [`old-${run}`, `recent-${run}`])).rows.map((r: { token_hash: string }) => r.token_hash);
      expect(left).toEqual([`recent-${run}`]);
    });
  });

  it('one tick runs the due jobs and never throws', async () => {
    await expect(scheduler().tick()).resolves.toBeUndefined();
  });
});
