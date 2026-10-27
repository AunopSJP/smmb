import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/db/db.module.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';

// ต้องมีฐานข้อมูลที่รัน migration + `npm run seed:dev` แล้ว (ไม่ต้องมี Redis — ใช้ตัวนับในหน่วยความจำ)
const SECRET_FIELDS = ['password_hash', 'token_hash', 'token_version'];

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  // เบอร์ไม่ซ้ำกันในแต่ละรอบที่รัน (ฐานข้อมูลอาจมีของรอบก่อน)
  const run = String(Date.now()).slice(-6);
  let seq = 0;
  const phone = () => `09${run}${String(seq++).padStart(2, '0')}`;

  const http = () => request(app.getHttpServer());
  const sid = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='));
  /** ทุกคำตอบต้องไม่มีฟิลด์ลับ (CLAUDE.md กฎข้อ 12) */
  const noSecrets = (res: request.Response) => {
    for (const f of SECRET_FIELDS) expect(res.text).not.toContain(f);
    return res;
  };

  const signupOwner = async (p = phone(), password = 'password123') => {
    const res = await http()
      .post('/api/v1/auth/signup/owner')
      .send({ name: 'สมศรี', phone: p, password, house_no: '12/3', terms_version: terms })
      .expect(201)
      .then(noSecrets);
    return { phone: p, password, cookie: sid(res)!.split(';')[0], me: res.body };
  };

  const approvedAgency = async () => {
    const code = `G${run}${seq++}`;
    await pool.query(
      `INSERT INTO app.agency_tb (name, type, status, group_code, approved_date) VALUES ($1, 'police', 'approved', $2, now())`,
      [`สภ.ทดสอบ ${code}`, code],
    );
    return code;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(COUNTER_STORE)
      .useValue(counters)
      .compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    pool = app.get(PG_POOL);
    terms = (await http().get('/api/v1/terms/current').expect(200)).body.version;
  });

  beforeEach(() => counters.clear());

  afterAll(async () => {
    await app.close();
  });

  describe('session required by default', () => {
    it('no cookie → 401 NO_SESSION', async () => {
      const res = await http().get('/api/v1/auth/verify').expect(401);
      expect(res.body).toMatchObject({ code: 'NO_SESSION', path: '/api/v1/auth/verify' });
    });

    it('unknown cookie → 401 SESSION_EXPIRED', async () => {
      const res = await http().get('/api/v1/me').set('Cookie', 'sid=not-a-real-token').expect(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('signup owner', () => {
    it('creates account, owner role, free plan, terms acceptance, and a safe cookie', async () => {
      const p = phone();
      const res = await http()
        .post('/api/v1/auth/signup/owner')
        .send({ name: 'สมศรี', phone: p.replace(/^0/, '+66 ').replace(/(\d{2})(\d{3})/, '$1-$2-'), password: 'password123', house_no: '12/3', terms_version: terms })
        .expect(201)
        .then(noSecrets);
      expect(res.body).toMatchObject({ roles: ['owner'], phone: p, agency: null, agency_status: null, status: 'active' });
      expect(res.body.id).toMatch(/^U-\d{4,}$/);
      expect(res.body.prefs).toMatchObject({ lang: 'th', theme: 'system' });

      const cookie = sid(res)!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);

      const { rows } = await pool.query(
        `SELECT
           (SELECT plan_code FROM app.user_plan_tb WHERE user_id = $1) AS plan,
           (SELECT count(*)::int FROM app.terms_acceptance_tb WHERE user_id = $1) AS accepted,
           (SELECT token_hash FROM app.session_tb WHERE user_id = $1) AS token_hash`,
        [res.body.id],
      );
      expect(rows[0]).toMatchObject({ plan: 'free', accepted: 1 });
      // ฐานข้อมูลเก็บ hash ไม่ใช่ token ใน cookie
      expect(cookie).not.toContain(rows[0].token_hash);
      expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('duplicate phone → 409 PHONE_TAKEN', async () => {
      const { phone: p } = await signupOwner();
      const res = await http()
        .post('/api/v1/auth/signup/owner')
        .send({ name: 'x', phone: p, password: 'password123', house_no: '1', terms_version: terms })
        .expect(409);
      expect(res.body.code).toBe('PHONE_TAKEN');
    });

    it('old terms version → 400 TERMS_NOT_ACCEPTED, nothing created', async () => {
      const p = phone();
      const res = await http()
        .post('/api/v1/auth/signup/owner')
        .send({ name: 'x', phone: p, password: 'password123', house_no: '1', terms_version: 'old' })
        .expect(400);
      expect(res.body.code).toBe('TERMS_NOT_ACCEPTED');
      const { rows } = await pool.query('SELECT 1 FROM app.user_tb WHERE phone = $1', [p]);
      expect(rows).toHaveLength(0);
    });

    it('bad phone, short password, unknown field → 400 with message list', async () => {
      const res = await http()
        .post('/api/v1/auth/signup/owner')
        .send({ name: 'x', phone: '12345', password: 'short', house_no: '1', terms_version: terms, role: 'admin' })
        .expect(400);
      expect(Array.isArray(res.body.message)).toBe(true);
      expect(res.body.message.join(' ')).toMatch(/phone/);
      expect(res.body.message.join(' ')).toMatch(/password/);
      expect(res.body.message.join(' ')).toMatch(/role should not exist/);
    });
  });

  describe('signin / signout', () => {
    it('wrong password and unknown phone give the same answer', async () => {
      const { phone: p } = await signupOwner();
      const wrong = await http().post('/api/v1/auth/signin').send({ phone: p, password: 'nope-nope' }).expect(401);
      const unknown = await http()
        .post('/api/v1/auth/signin')
        .send({ phone: '0700000000', password: 'nope-nope' })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('signin → { ok, data: Me } + cookie that works; signout revokes it', async () => {
      const { phone: p, password } = await signupOwner();
      const res = await http().post('/api/v1/auth/signin').send({ phone: p, password }).expect(200).then(noSecrets);
      expect(res.body).toMatchObject({ ok: true, data: { roles: ['owner'], phone: p } });
      const cookie = sid(res)!.split(';')[0];

      await http().get('/api/v1/auth/verify').set('Cookie', cookie).expect(200).then(noSecrets);
      await http().post('/api/v1/auth/signout').set('Cookie', cookie).expect(200);
      const after = await http().get('/api/v1/auth/verify').set('Cookie', cookie).expect(401);
      expect(after.body.code).toBe('SESSION_REVOKED');
    });

    it('5 wrong passwords lock the account — even the right password is refused', async () => {
      const { phone: p, password } = await signupOwner();
      for (let i = 0; i < 5; i++) {
        await http().post('/api/v1/auth/signin').send({ phone: p, password: 'wrong-pass' }).expect(401);
      }
      counters.clear('rl:'); // แยกจากเพดานต่อ IP — ทดสอบการล็อกบัญชีอย่างเดียว
      const res = await http().post('/api/v1/auth/signin').send({ phone: p, password }).expect(401);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
    });

    it('more than 5 signin calls a minute from one IP → 429 RATE_LIMITED', async () => {
      for (let i = 0; i < 5; i++) {
        await http().post('/api/v1/auth/signin').send({ phone: '0700000000', password: 'x' }).expect(401);
      }
      const res = await http().post('/api/v1/auth/signin').send({ phone: '0700000000', password: 'x' }).expect(429);
      expect(res.body.code).toBe('RATE_LIMITED');
    });

    it('disabled account: right password → ACCOUNT_DISABLED, existing session stops working', async () => {
      const { phone: p, password, cookie, me } = await signupOwner();
      await pool.query(`UPDATE app.user_tb SET status = 'disabled' WHERE user_id = $1`, [me.id]);
      const res = await http().post('/api/v1/auth/signin').send({ phone: p, password }).expect(401);
      expect(res.body.code).toBe('ACCOUNT_DISABLED');
      const verify = await http().get('/api/v1/auth/verify').set('Cookie', cookie).expect(401);
      expect(verify.body.code).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('change password', () => {
    it('wrong current password → 401 INVALID_CREDENTIALS', async () => {
      const { cookie } = await signupOwner();
      const res = await http()
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookie)
        .send({ current_password: 'wrong-pass', new_password: 'new-password-1' })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('success kicks every session; the new password works', async () => {
      const { phone: p, password, cookie } = await signupOwner();
      const other = sid(await http().post('/api/v1/auth/signin').send({ phone: p, password }).expect(200))!.split(';')[0];

      await http()
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookie)
        .send({ current_password: password, new_password: 'new-password-1' })
        .expect(200);

      for (const c of [cookie, other]) {
        const res = await http().get('/api/v1/auth/verify').set('Cookie', c).expect(401);
        expect(res.body.code).toBe('SESSION_REVOKED');
      }
      counters.clear('rl:');
      await http().post('/api/v1/auth/signin').send({ phone: p, password }).expect(401);
      await http().post('/api/v1/auth/signin').send({ phone: p, password: 'new-password-1' }).expect(200);
    });
  });

  describe('officer and agency signup', () => {
    it('unknown or unapproved group code → 404 GROUP_CODE_INVALID', async () => {
      await pool.query(`INSERT INTO app.agency_tb (name, type, status, group_code) VALUES ('รอ', 'guard', 'pending', $1)`, [
        `P${run}`,
      ]);
      for (const code of ['NOPE1234', `P${run}`]) {
        const res = await http()
          .post('/api/v1/auth/signup/officer')
          .send({ name: 'x', phone: phone(), password: 'password123', group_code: code, terms_version: terms })
          .expect(404);
        expect(res.body.code).toBe('GROUP_CODE_INVALID');
      }
    });

    it('officer signup → no roles yet, waiting for the head (A11)', async () => {
      const code = await approvedAgency();
      const res = await http()
        .post('/api/v1/auth/signup/officer')
        .send({ name: 'ส.ต.ต. สมชาย', phone: phone(), password: 'password123', group_code: code.toLowerCase(), terms_version: terms })
        .expect(201)
        .then(noSecrets);
      expect(res.body).toMatchObject({ roles: [], agency_status: 'pending', agency: { is_head: false } });
    });

    it('agency signup → agency pending, first member is head, no roles yet (L02)', async () => {
      const res = await http()
        .post('/api/v1/auth/signup/agency')
        .send({
          agency: { name: 'รปภ.หมู่บ้าน', type: 'guard' },
          head: { name: 'หัวหน้า', phone: phone(), password: 'password123' },
          terms_version: terms,
        })
        .expect(201)
        .then(noSecrets);
      expect(res.body).toMatchObject({ roles: [], agency_status: 'pending', agency: { is_head: true, type: 'guard' } });
    });
  });

  describe('one phone, many roles', () => {
    it('owner joins an agency: still an owner, officer part is pending; joining twice → 409', async () => {
      const { cookie } = await signupOwner();
      const code = await approvedAgency();
      const res = await http()
        .post('/api/v1/me/agency/join')
        .set('Cookie', cookie)
        .send({ group_code: code, terms_version: terms })
        .expect(201)
        .then(noSecrets);
      expect(res.body).toMatchObject({ roles: ['owner'], agency_status: 'pending' });

      const again = await http()
        .post('/api/v1/me/agency/join')
        .set('Cookie', cookie)
        .send({ group_code: code, terms_version: terms })
        .expect(409);
      expect(again.body.code).toBe('ROLE_EXISTS');
    });

    it('approved officer adds the owner role → roles [owner, officer]; adding twice → 409', async () => {
      const code = await approvedAgency();
      const signup = await http()
        .post('/api/v1/auth/signup/officer')
        .send({ name: 'x', phone: phone(), password: 'password123', group_code: code, terms_version: terms })
        .expect(201);
      const cookie = sid(signup)!.split(';')[0];
      // หัวหน้าอนุมัติ (route ยังไม่มี — ทำตรงในฐานข้อมูล)
      await pool.query(`UPDATE app.agency_member_tb SET status = 'active' WHERE user_id = $1`, [signup.body.id]);
      await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'officer')`, [signup.body.id]);

      const res = await http()
        .post('/api/v1/me/roles/owner')
        .set('Cookie', cookie)
        .send({ house_no: '99', terms_version: terms })
        .expect(201)
        .then(noSecrets);
      expect(res.body).toMatchObject({ roles: ['owner', 'officer'], agency_status: 'active' });
      const plan = await pool.query(`SELECT plan_code FROM app.user_plan_tb WHERE user_id = $1`, [signup.body.id]);
      expect(plan.rows).toEqual([{ plan_code: 'free' }]);

      const again = await http()
        .post('/api/v1/me/roles/owner')
        .set('Cookie', cookie)
        .send({ house_no: '99', terms_version: terms })
        .expect(409);
      expect(again.body.code).toBe('ROLE_EXISTS');
    });

    it('an admin account cannot take any other role → 403 ADMIN_ROLE_EXCLUSIVE', async () => {
      const code = await approvedAgency();
      const signup = await http()
        .post('/api/v1/auth/signup/officer')
        .send({ name: 'admin', phone: phone(), password: 'password123', group_code: code, terms_version: terms })
        .expect(201);
      const cookie = sid(signup)!.split(';')[0];
      await pool.query(`DELETE FROM app.agency_member_tb WHERE user_id = $1`, [signup.body.id]);
      await pool.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'admin')`, [signup.body.id]);

      const owner = await http()
        .post('/api/v1/me/roles/owner')
        .set('Cookie', cookie)
        .send({ house_no: '1', terms_version: terms })
        .expect(403);
      expect(owner.body.code).toBe('ADMIN_ROLE_EXCLUSIVE');
      const join = await http()
        .post('/api/v1/me/agency/join')
        .set('Cookie', cookie)
        .send({ group_code: code, terms_version: terms })
        .expect(403);
      expect(join.body.code).toBe('ADMIN_ROLE_EXCLUSIVE');
      const me = await http().get('/api/v1/me').set('Cookie', cookie).expect(200);
      expect(me.body.roles).toEqual(['admin']);
    });
  });
});
