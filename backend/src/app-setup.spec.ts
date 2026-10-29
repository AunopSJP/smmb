import type { NextFunction, Request, Response } from 'express';
import { stripPathPrefix } from './app-setup.js';
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
