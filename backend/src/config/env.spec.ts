import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://x',
  REDIS_URL: 'redis://x',
  PUBLIC_BASE_URL: 'https://dev.example.com/',
  QR_ALLOWED_HOSTS: 'dev.example.com, Smmb.App ,',
  BOX_MASTER_KEY: 'm'.repeat(64),
  QR_SIGNING_KEY: 'q'.repeat(64),
};

describe('validateEnv', () => {
  it('parses and normalizes values', () => {
    const env = validateEnv(base);
    expect(env.PUBLIC_BASE_URL).toBe('https://dev.example.com');
    expect(env.QR_ALLOWED_HOSTS).toEqual(['dev.example.com', 'smmb.app']);
    expect(env.PORT).toBe(3000);
    expect(env.TRUST_PROXY).toBe(false);
  });

  it('parses TRUST_PROXY', () => {
    expect(validateEnv({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(validateEnv({ ...base, TRUST_PROXY: 'loopback' }).TRUST_PROXY).toBe('loopback');
  });

  it('fails fast when required values are missing', () => {
    for (const key of ['DATABASE_URL', 'REDIS_URL', 'PUBLIC_BASE_URL', 'QR_ALLOWED_HOSTS', 'BOX_MASTER_KEY', 'QR_SIGNING_KEY']) {
      expect(() => validateEnv({})).toThrow(`${key} is required`);
    }
  });

  it('rejects a bad PUBLIC_BASE_URL', () => {
    expect(() => validateEnv({ ...base, PUBLIC_BASE_URL: 'not a url' })).toThrow(/PUBLIC_BASE_URL/);
  });

  it('box and QR keys must be long and different', () => {
    expect(() => validateEnv({ ...base, BOX_MASTER_KEY: 'short' })).toThrow(/BOX_MASTER_KEY must be at least 32/);
    expect(() => validateEnv({ ...base, QR_SIGNING_KEY: base.BOX_MASTER_KEY })).toThrow(/must differ/);
  });
});
