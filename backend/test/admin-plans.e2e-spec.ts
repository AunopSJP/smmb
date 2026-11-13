import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { configureApp } from '../src/app-setup.js';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/db/db.module.js';
import { COUNTER_STORE, MemoryCounterStore } from '../src/rate-limit/rate-limit.store.js';

// แพ็กเกจของแอดมิน (api.md §9.x): แก้รายละเอียดแพ็กที่มีอยู่ — ชื่อไทย/อังกฤษ/ข้อความราคา
describe('Admin plans — edit details (e2e)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;
  const counters = new MemoryCounterStore();
  let terms: string;
  const run = String(Date.now()).slice(-6);
  let seq = 10;
  const http = () => request(app.getHttpServer());
  const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='))!.split(';')[0];
  const code = `t${run}`;

  const signup = async () => {
    const res = await http().post('/api/v1/auth/signup/owner').send({ name: 'ผู้ทดสอบ', phone: `06${run}${seq++}`, password: 'password123', house_no: '1', terms_version: terms }).expect(201);
    return { id: res.body.id as string, cookie: cookieOf(res) };
  };
  let admin: { id: string; cookie: string };

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
    await http().post('/api/v1/admin/plans').set('Cookie', admin.cookie).send({ code, name_th: 'ทดลอง', name_en: 'Trial', price_note: 'ฟรี' }).expect(201);
  });
  beforeEach(() => counters.clear());
  afterAll(async () => {
    await pool.query(`DELETE FROM app.plan_tb WHERE plan_code = $1`, [code]);
    await app.close();
  });

  const patch = (body: object, who = admin) => http().patch(`/api/v1/admin/plans/${code}`).set('Cookie', who.cookie).send(body);

  it('edits the names and the price note; the code never changes', async () => {
    const res = await patch({ name_th: '  แพ็กใหม่  ', name_en: 'New plan', price_note: '99 บาท/เดือน' }).expect(200);
    expect(res.body).toMatchObject({ code, name_th: 'แพ็กใหม่', name_en: 'New plan', price_note: '99 บาท/เดือน', is_active: true });
    const list = (await http().get('/api/v1/admin/plans').set('Cookie', admin.cookie).expect(200)).body as { code: string; name_th: string }[];
    expect(list.find((p) => p.code === code)?.name_th).toBe('แพ็กใหม่');
  });

  it('clears the price note with null or an empty string, and leaves untouched fields alone', async () => {
    await patch({ price_note: 'x' }).expect(200);
    expect((await patch({ price_note: null }).expect(200)).body.price_note).toBeNull();
    await patch({ price_note: 'y' }).expect(200);
    const res = await patch({ price_note: '   ' }).expect(200);
    expect(res.body.price_note).toBeNull();
    expect(res.body.name_en).toBe('New plan'); // ไม่แตะชื่อ
  });

  it('rejects an empty body, blank names and over-long values', async () => {
    await patch({}).expect(400);
    await patch({ name_th: '' }).expect(400);
    await patch({ name_en: 'x'.repeat(81) }).expect(400);
    await patch({ price_note: 'x'.repeat(201) }).expect(400);
    await patch({ code: 'other' }).expect(400); // แก้รหัสไม่ได้ (ฟิลด์เกินถูกปฏิเสธ)
  });

  it('unknown plan → 404; a non-admin cannot edit (404)', async () => {
    await http().patch('/api/v1/admin/plans/nope_plan').set('Cookie', admin.cookie).send({ name_th: 'x' }).expect(404);
    const owner = await signup();
    await patch({ name_th: 'แฮก' }, owner).expect(404);
    expect((await pool.query(`SELECT name_th FROM app.plan_tb WHERE plan_code = $1`, [code])).rows[0].name_th).toBe('แพ็กใหม่');
  });

  it('a failed status change rolls back the detail edit in the same request', async () => {
    await pool.query(`UPDATE app.plan_tb SET is_default = false WHERE plan_code = $1`, [code]);
    // ตั้งเป็นเริ่มต้น + ปิดให้เลือกพร้อมกัน = ขัดแย้ง → ชื่อต้องไม่ถูกเปลี่ยน
    await patch({ name_th: 'ไม่ควรบันทึก', is_default: true, is_active: false }).expect(409);
    expect((await pool.query(`SELECT name_th FROM app.plan_tb WHERE plan_code = $1`, [code])).rows[0].name_th).toBe('แพ็กใหม่');
  });

  it('writes an audit row listing the changed fields', async () => {
    await patch({ name_en: 'Audited' }).expect(200);
    const { rows } = await pool.query(`SELECT detail FROM app.admin_audit_log_tb WHERE subject_kind = 'plan' AND subject_id = $1 AND action = 'plan.update' ORDER BY created_date DESC LIMIT 1`, [code]);
    expect(rows[0].detail).toEqual({ fields: ['name_en'] });
  });
});
