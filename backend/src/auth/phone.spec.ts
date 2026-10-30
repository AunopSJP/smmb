import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it.each([
    ['0812345678', '0812345678'],
    ['081-234-5678', '0812345678'],
    ['081 234 5678', '0812345678'],
    ['(081) 234.5678', '0812345678'],
    ['+66812345678', '0812345678'],
    ['+66 81 234 5678', '0812345678'],
    ['66812345678', '0812345678'],
    ['๐๘๑๒๓๔๕๖๗๘', '0812345678'], // เลขไทย
    ['０８１２３４５６７８', '0812345678'], // เต็มความกว้าง
    ['​081 234​5678﻿', '0812345678'], // zero-width / NBSP จากการคัดลอก
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '081234567', '08123456789', '1812345678', 'abc', '+1 812 345 678'])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizePhone(812345678)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});
