import { describe, expect, it } from 'vitest';
import type { AdminLog } from './admin-api';
import { initialOf, logDetail, logRaw, parsePgArray } from './admin-log-text';

const row = (p: Partial<AdminLog>): AdminLog => ({
  id: 'x:1', type: 'scan', box_id: null, house_no: null, actor_name: 'สมชาย', qr_slot: null,
  method: null, result: null, details: null, created_at: '2026-11-27T00:00:00Z', fail: false, ...p,
});
const SOS = '4eace3e7-1d8b-45cf-b086-c94f80e7a62a';

describe('admin log text', () => {
  it('translates a scan row and the box actor', () => {
    expect(logDetail(row({ actor_name: 'box', method: 'scan', result: 'unreadable' }), 'th')).toBe('ตู้ · สแกน QR · อ่านไม่ได้');
  });

  it('says what was viewed without showing the long id, and keeps it for the CSV', () => {
    const l = row({ type: 'data_access', result: 'user', details: `{name,phone,sos:${SOS}}` });
    expect(logDetail(l, 'th')).toBe('สมชาย · ข้อมูลผู้ใช้ · ชื่อ, เบอร์โทร, ตอน SOS');
    expect(logRaw(l)).toContain(SOS);
  });

  it('keeps a typed SOS close note as written', () => {
    expect(logDetail(row({ type: 'sos', result: 'closed', details: 'ok' }), 'th')).toBe('สมชาย · ปิดงานแล้ว · ok');
  });

  it('reads quoted array items that contain commas', () => {
    expect(parsePgArray('{box_unbound,"reason:ย้ายบ้าน, ขายแล้ว"}')).toEqual(['box_unbound', 'reason:ย้ายบ้าน, ขายแล้ว']);
  });

  it('skips a leading Thai vowel for the avatar initial', () => {
    expect(initialOf('แอดมิน')).toBe('อ');
    expect(initialOf('สมศรี')).toBe('ส');
    expect(initialOf('', 'A')).toBe('A');
  });
});
