import { canonicalRequest, deviceSecret, frontQrSig, frontQrToken, safeEqualHex, signRequest } from './box-crypto.js';

// ค่าชุดนี้อยู่ในไฟล์โปรโตคอล §1 ด้วย — ทีมเฟิร์มแวร์ใช้เทียบว่าเซ็นถูก · แก้สูตรต้องแก้ทั้งสองที่
const MASTER = 'smmb-example-master-key-do-not-use-in-prod';
const SECRET = '65dafb799784ed3b28d608b1f06bc7201ab8097735360ae35682f339428ea35f';

describe('box signatures (test vector shared with firmware)', () => {
  it('device secret = hex(HMAC-SHA256(master key, box_id))', () => {
    expect(deviceSecret(MASTER, 'BX-00042')).toBe(SECRET);
  });

  it('signs METHOD|PATH|TIMESTAMP|NONCE|sha256(body) with the 64-char secret as the key', () => {
    const body = '{"fw":"1.0.3","config_ver":0,"battery_pct":87}';
    expect(canonicalRequest('post', '/v1/box/boot', '1761123456', '9f2c41ab77e0', body)).toBe(
      'POST|/v1/box/boot|1761123456|9f2c41ab77e0|94a898b63fd5c28b66aabd2351290dce3abf39779493d5f948eb78d56fd33813',
    );
    expect(signRequest(SECRET, 'POST', '/v1/box/boot', '1761123456', '9f2c41ab77e0', body)).toBe(
      'ba685f7b6f384ac1b514ef80e43e8bbe70f4c9bda93ded8205f1889f9b0f7ff8',
    );
  });

  it('a GET signs the path with its query and the hash of an empty body', () => {
    expect(signRequest(SECRET, 'GET', '/v1/box/jobs?wait=50', '1761123500', 'a1b2c3d4e5f6', Buffer.alloc(0))).toBe(
      '86c6520798d17a12cf2af3d156f02f1a361cb5ac3138245135d6176bd901de6c',
    );
  });

  it('any change to the body, path, time or box breaks the signature', () => {
    const sig = signRequest(SECRET, 'POST', '/v1/box/report', '1', 'nonce1234', '{"a":1}');
    expect(signRequest(SECRET, 'POST', '/v1/box/report', '1', 'nonce1234', '{"a":2}')).not.toBe(sig);
    expect(signRequest(SECRET, 'POST', '/v1/box/boot', '1', 'nonce1234', '{"a":1}')).not.toBe(sig);
    expect(signRequest(SECRET, 'POST', '/v1/box/report', '2', 'nonce1234', '{"a":1}')).not.toBe(sig);
    expect(signRequest(deviceSecret(MASTER, 'BX-00043'), 'POST', '/v1/box/report', '1', 'nonce1234', '{"a":1}')).not.toBe(sig);
  });

  it('compares hex without caring about case', () => {
    expect(safeEqualHex('abcd', 'ABCD')).toBe(true);
    expect(safeEqualHex('abcd', 'abce')).toBe(false);
    expect(safeEqualHex('abcd', 'abc')).toBe(false);
  });
});

describe('front QR token', () => {
  it('is BXnnnnn-slot-6 chars with no confusing letters, and changes with slot and version', () => {
    const t = frontQrToken('k'.repeat(32), 'BX-00042', '1', 1);
    expect(t).toMatch(/^BX00042-1-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    expect(frontQrSig('k'.repeat(32), 'BX-00042', '1', 2)).not.toBe(t.slice(-6));
    expect(frontQrSig('k'.repeat(32), 'BX-00042', '2', 1)).not.toBe(t.slice(-6));
  });
});

describe('badge QR (officer)', () => {
  const key = 'q'.repeat(32);
  it('round-trips, and any change or another key is rejected', async () => {
    const { badgeToken, readBadge } = await import('./box-crypto.js');
    const t = badgeToken(key, { j: 'J-8f31c2', u: 'U-0071', e: 1761124030 });
    expect(t).toMatch(/^SMMB-O2\.J-8f31c2\.U-0071\.[0-9a-z]+\.[\w-]{16}$/);
    expect(t.length).toBeLessThan(60); // QR เล็กพอให้กล้องความละเอียดต่ำอ่านได้
    expect(readBadge(key, t)).toEqual({ j: 'J-8f31c2', u: 'U-0071', e: 1761124030 });
    expect(readBadge('k'.repeat(32), t)).toBeNull();
    const [j, u, e, sig] = t.slice('SMMB-O2.'.length).split('.') as [string, string, string, string];
    expect(readBadge(key, `SMMB-O2.J-000000.${u}.${e}.${sig}`)).toBeNull(); // เปลี่ยน job
    expect(readBadge(key, `SMMB-O2.${j}.U-0099.${e}.${sig}`)).toBeNull(); // เปลี่ยนคน
    expect(readBadge(key, `SMMB-O2.${j}.${u}.${(Number.parseInt(e, 36) + 1).toString(36)}.${sig}`)).toBeNull(); // ยืดอายุ
    expect(readBadge(key, `${t}.x`)).toBeNull();
    expect(readBadge(key, t.replace('SMMB-O2.', 'SMMB-O1.'))).toBeNull(); // รุ่นเก่า
    expect(readBadge(key, 'hello')).toBeNull();
  });
});
