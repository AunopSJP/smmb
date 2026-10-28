import { phoneIn, prettyPhone } from './contact-card';

describe('phoneIn', () => {
  it('finds a Thai phone number inside free text', () => {
    expect(phoneIn('สถานี 02-111-2222 (24 ชม.)')).toBe('021112222');
    expect(phoneIn('ป้อมยาม 081 234 5678')).toBe('0812345678');
    expect(phoneIn('+66 81-234-5678')).toBe('0812345678');
  });

  it('formats landlines and mobiles for display', () => {
    expect(prettyPhone('021112222')).toBe('02-111-2222');
    expect(prettyPhone('0812345678')).toBe('081-234-5678');
  });

  it('returns null when there is no usable number', () => {
    expect(phoneIn('ติดต่อที่ป้อมหน้าหมู่บ้าน')).toBeNull();
    expect(phoneIn('ห้อง 1234')).toBeNull();
    expect(phoneIn(null)).toBeNull();
  });
});
