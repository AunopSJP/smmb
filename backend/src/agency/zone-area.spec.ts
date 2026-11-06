import { describe, expect, it } from 'vitest';
import { normalizeArea } from './zone.service.js';

describe('normalizeArea (zone coverage)', () => {
  it('trims, keeps the optional subdistrict and treats all-blank as "no area"', () => {
    expect(normalizeArea({ province: ' กรุงเทพมหานคร ', district: 'จตุจักร', subdistrict: '' })).toEqual({ province: 'กรุงเทพมหานคร', district: 'จตุจักร', subdistrict: null });
    expect(normalizeArea({ province: '', district: '  ', subdistrict: '' })).toBeNull();
    expect(normalizeArea(undefined)).toBeNull();
  });

  it('needs province and district together', () => {
    expect(() => normalizeArea({ province: 'กรุงเทพ' })).toThrow();
    expect(() => normalizeArea({ district: 'จตุจักร' })).toThrow();
    expect(() => normalizeArea({ subdistrict: 'ลาดยาว' })).toThrow();
  });
});
