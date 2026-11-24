import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { REDIS } from '../src/db/db.module.js';

// ต้องเปิด Postgres ก่อน; Redis ใช้ double เพื่อให้ readiness test deterministic
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(REDIS)
      .useValue({ status: 'ready', ping: async () => 'PONG', quit: async () => 'OK' })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health/live', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/live').expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/health reports every service up', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      services: { postgres: 'up', redis: 'up', push: 'up' },
    });
  });

  it('unknown route uses the api.md §0 error shape', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found', path: '/api/v1/nope' });
    expect(typeof res.body.timestamp).toBe('string');
  });
});

// /api/health เป็น public และไม่จำกัดความถี่ (monitor เรียกบ่อย) → ถูกยิงถี่ ๆ ต้องไม่ไปแตะ Redis/Postgres ทุกคำขอ
describe('Health under load (e2e)', () => {
  let app: INestApplication<App>;
  let pings = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REDIS)
      .useValue({
        status: 'ready',
        ping: async () => {
          pings += 1;
          return 'PONG';
        },
        quit: async () => 'OK',
      })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers a burst of requests with 200 while checking dependencies only a few times', async () => {
    pings = 0;
    const results = await Promise.all(Array.from({ length: 30 }, () => request(app.getHttpServer()).get('/api/health')));
    expect(results.every((r) => r.status === 200 && r.body.status === 'ok')).toBe(true);
    expect(pings).toBeLessThanOrEqual(2);
  });
});
