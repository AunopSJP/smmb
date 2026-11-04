import { deviceId } from './api';

describe('deviceId (X-Device-Id)', () => {
  it('works without crypto.randomUUID (plain http on a LAN), stays the same and matches the server format', () => {
    const original = crypto.randomUUID;
    // หน้าเว็บที่ไม่ใช่ HTTPS ไม่มี randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      localStorage.removeItem('smmb.device');
      const id = deviceId();
      expect(id).toMatch(/^[A-Za-z0-9-]{16,64}$/);
      expect(deviceId()).toBe(id);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
