import { describe, expect, it } from 'vitest';
import { sanitizePhoneInput } from './phone-input';

describe('sanitizePhoneInput', () => {
  it.each([
    ['0812345678', '0812345678'],
    ['081-234-5678', '0812345678'], // วางเบอร์ที่มีขีด → ไม่ถูกตัดกลางทาง
    ['+66 81 234 5678', '0812345678'],
    ['๐๘๑๒๓๔๕๖๗๘', '0812345678'],
    ['08123456789012', '0812345678'], // เกิน 10 ตัว → ตัดที่ 10
    ['08a1b2', '0812'], // พิมพ์ตัวอักษร → ทิ้ง
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(sanitizePhoneInput(input)).toBe(expected);
  });
  it('never returns more than 10 characters', () => {
    expect(sanitizePhoneInput('9'.repeat(40))).toHaveLength(10);
  });
});
