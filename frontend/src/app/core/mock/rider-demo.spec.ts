import { CODE_LOCK_MS, CODE_MAX_WRONG, DELIVERY_LIMIT_PER_HOUR, RiderDemo, TICKET_TTL_MS } from './rider-demo';

describe('RiderDemo', () => {
  let d: RiderDemo;
  let now: number;
  beforeEach(() => {
    d = new RiderDemo();
    now = 1_000_000;
    d.now = () => now;
  });

  it('a code works with any case, dashes or spaces', () => {
    const r = d.openCode('h4kd - 9trw');
    expect(r.ok && r.ticket.house_no).toBe('99/9');
  });

  it('a cancelled (old) QR looks the same as an invalid one', () => {
    expect(d.openQr('BX00017-1-OLD000')).toEqual({ ok: false, code: 'QR_INVALID' });
    expect(d.openQr('nope')).toEqual({ ok: false, code: 'QR_INVALID' });
  });

  it('a closed box cannot take deliveries', () => {
    expect(d.openQr('BX00063-1-Q5JD7S')).toEqual({ ok: false, code: 'BOX_SERVICE_CLOSED' });
  });

  it('too many wrong codes in a row locks code entry for a while', () => {
    for (let i = 1; i < CODE_MAX_WRONG; i++) expect(d.openCode('AAAA-AAAA')).toEqual({ ok: false, code: 'QR_INVALID' });
    expect(d.openCode('AAAA-AAAA')).toEqual({ ok: false, code: 'CODE_ATTEMPTS_EXCEEDED' });
    expect(d.openCode('H4KD-9TRW')).toEqual({ ok: false, code: 'CODE_ATTEMPTS_EXCEEDED' });
    now += CODE_LOCK_MS + 1;
    expect(d.openCode('H4KD-9TRW').ok).toBe(true);
  });

  it('deliveries are capped per box per hour, across both QRs of the box', () => {
    const front = d.openQr('BX00042-1-K7M2QX');
    const backup = d.openQr('BX00042-2-P3VN8Z');
    if (!front.ok || !backup.ok) throw new Error('setup');
    for (let i = 0; i < DELIVERY_LIMIT_PER_HOUR; i++) expect(d.deliver(i % 2 ? backup.ticket : front.ticket).ok).toBe(true);
    expect(d.deliver(front.ticket)).toEqual({ ok: false, code: 'DELIVERY_LIMIT' });
    now += 60 * 60 * 1000 + 1;
    const again = d.openQr('BX00042-1-K7M2QX');
    expect(again.ok && d.deliver(again.ticket).ok).toBe(true);
  });

  it('an old ticket must be re-scanned', () => {
    const r = d.openQr('BX00042-1-K7M2QX');
    if (!r.ok) throw new Error('setup');
    now += TICKET_TTL_MS + 1;
    expect(d.deliver(r.ticket)).toEqual({ ok: false, code: 'TICKET_EXPIRED' });
  });
});
