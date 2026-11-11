import type { NextFunction, Request, Response } from 'express';
import { containsNul, RejectNulPipe, requireJsonBody, stripPathPrefix } from './app-setup.js';
import { validateEnv } from './config/env.js';

const run = (prefix: string, url: string) => {
  const req = { url, originalUrl: url } as Request;
  let called = false;
  stripPathPrefix(prefix)(req, {} as Response, (() => (called = true)) as NextFunction);
  return { url: req.url, originalUrl: req.originalUrl, called };
};

describe('stripPathPrefix (ตู้เซ็นจาก path เต็ม · route จับคู่จาก path ที่ตัด prefix แล้ว)', () => {
  it('cuts the prefix from url but keeps originalUrl (the box signs originalUrl)', () => {
    expect(run('/smmb-api', '/smmb-api/v1/box/jobs?wait=50')).toEqual({ url: '/v1/box/jobs?wait=50', originalUrl: '/smmb-api/v1/box/jobs?wait=50', called: true });
    expect(run('/smmb-api', '/smmb-api/api/health/live').url).toBe('/api/health/live');
    expect(run('/smmb-api', '/smmb-api').url).toBe('/');
    expect(run('/smmb-api', '/smmb-api?x=1').url).toBe('?x=1');
  });

  it('leaves other paths alone — including look-alikes — and does nothing without a prefix', () => {
    expect(run('/smmb-api', '/smmb-apix/v1/box/jobs').url).toBe('/smmb-apix/v1/box/jobs');
    expect(run('/smmb-api', '/v1/box/jobs').url).toBe('/v1/box/jobs');
    expect(run('', '/smmb-api/v1/box/jobs').url).toBe('/smmb-api/v1/box/jobs');
  });
});

describe('API_PATH_PREFIX env', () => {
  const base = {
    DATABASE_URL: 'postgres://x',
    REDIS_URL: 'redis://x',
    PUBLIC_BASE_URL: 'https://h.example',
    QR_ALLOWED_HOSTS: 'h.example',
    BOX_MASTER_KEY: 'a'.repeat(40),
    QR_SIGNING_KEY: 'b'.repeat(40),
  };
  it('accepts /smmb-api (trailing slash trimmed) and empty', () => {
    expect(validateEnv({ ...base, API_PATH_PREFIX: '/smmb-api/' }).API_PATH_PREFIX).toBe('/smmb-api');
    expect(validateEnv(base).API_PATH_PREFIX).toBe('');
  });
  it('rejects values that are not a path', () => {
    expect(() => validateEnv({ ...base, API_PATH_PREFIX: 'smmb-api' })).toThrow(/API_PATH_PREFIX/);
    expect(() => validateEnv({ ...base, API_PATH_PREFIX: '/a b' })).toThrow(/API_PATH_PREFIX/);
  });
});

describe('containsNul / RejectNulPipe (NUL เก็บลง Postgres ไม่ได้ → ต้อง 400 ไม่ใช่ 500)', () => {
  const NUL = String.fromCharCode(0);
  it('finds NUL in strings, nested objects, arrays and keys', () => {
    expect(containsNul('a' + NUL + 'b')).toBe(true);
    expect(containsNul({ a: { b: ['ok', 'x' + NUL] } })).toBe(true);
    expect(containsNul({ ['k' + NUL]: 1 })).toBe(true);
  });
  it('leaves normal input alone (Thai, emoji, quotes, numbers, null, buffers)', () => {
    expect(containsNul('สมศรี 😀 \' OR 1=1 --')).toBe(false);
    expect(containsNul({ a: 1, b: null, c: [true, 'x'], d: Buffer.from([0, 1]) })).toBe(false);
  });
  it('pipe throws 400 for NUL and passes everything else through unchanged', () => {
    const pipe = new RejectNulPipe();
    expect(() => pipe.transform('a' + NUL)).toThrow(/NUL/);
    const v = { phone: '0812345678' };
    expect(pipe.transform(v)).toBe(v);
  });
});

describe('requireJsonBody (กัน form-urlencoded login CSRF)', () => {
  const call = (method: string, path: string, headers: Record<string, string>, contentType?: string) => {
    const req = { method, path, originalUrl: path, headers, is: (t: string) => (contentType && contentType.startsWith(t) ? t : false) } as unknown as Request;
    let status = 0;
    let nextCalled = false;
    const res = { status: (s: number) => ((status = s), { json: () => undefined }) } as unknown as Response;
    requireJsonBody()(req, res, (() => (nextCalled = true)) as NextFunction);
    return { status, nextCalled };
  };
  it('rejects non-JSON bodies on mutating methods with 415', () => {
    expect(call('POST', '/api/v1/auth/signin', { 'content-length': '30' }, 'application/x-www-form-urlencoded')).toEqual({ status: 415, nextCalled: false });
    expect(call('PATCH', '/api/v1/me', { 'content-length': '5' }, 'text/plain').status).toBe(415);
  });
  it('allows JSON, bodiless requests, GET, and the raw box/firmware routes', () => {
    expect(call('POST', '/api/v1/auth/signin', { 'content-length': '30' }, 'application/json; charset=utf-8').nextCalled).toBe(true);
    expect(call('POST', '/api/v1/auth/signout', {}).nextCalled).toBe(true);
    expect(call('GET', '/api/v1/me', {}).nextCalled).toBe(true);
    expect(call('POST', '/v1/box/report', { 'content-length': '10' }, 'application/octet-stream').nextCalled).toBe(true);
    expect(call('POST', '/api/v1/admin/firmware/0.3.0', { 'content-length': '900000' }, 'application/octet-stream').nextCalled).toBe(true);
  });
});
