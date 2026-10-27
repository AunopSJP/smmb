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
