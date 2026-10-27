import { NOTIFICATION_TYPES, renderMessage } from './messages.js';
import { isAllowedPushEndpoint } from './push.sender.js';
import { buildPayload } from './push.service.js';

describe('isAllowedPushEndpoint (SSRF guard)', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx',
    'https://db5p.notify.windows.com/w/?token=abc',
  ])('allows %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc', // ไม่ใช่ https
    'https://fcm.googleapis.com:8443/x', // พอร์ตแปลก
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://fcm.googleapis.com.evil.example/x',
    'https://evil.example/fcm.googleapis.com',
    'not a url',
  ])('rejects %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});

describe('messages', () => {
  it('every type has Thai and English text', () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const lang of ['th', 'en'] as const) {
        const m = renderMessage(type, {}, lang);
        expect(m.title, `${type}/${lang}`).toBeTruthy();
        expect(typeof m.body).toBe('string');
      }
    }
  });

  it('shows Bangkok time', () => {
    const m = renderMessage('inspected', { agency_name: 'สภ.X', officer_name: 'ส.ต.ต. สมชาย', at: '2026-10-27T15:15:00Z' }, 'th');
    expect(m.body).toBe('สภ.X · ส.ต.ต. สมชาย มาตรวจ 22:15');
  });
});

describe('buildPayload', () => {
  it('uses the Angular service worker format and opens the link on click', () => {
    const p = buildPayload({ type: 'sos_new', data: { house_no: '99/9', phone: '0812345678' }, link: '/officer/sos/1', tag: 'sos-1' }, 'en');
    expect(p.notification).toMatchObject({
      title: '🆘 SOS',
      body: 'House 99/9 · 0812345678',
      tag: 'sos-1',
      renotify: true,
      requireInteraction: true,
      data: { type: 'sos_new', link: '/officer/sos/1', onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/officer/sos/1' } } },
    });
  });

  it('non-urgent messages do not stick on screen', () => {
    const p = buildPayload({ type: 'delivered', data: {}, link: '/' }, 'th');
    expect(p.notification).not.toHaveProperty('requireInteraction');
  });
});
