import { fmtLeft, liveViewSecondsLeft } from './admin-box-liveview';

describe('liveViewSecondsLeft', () => {
  const now = Date.parse('2026-11-19T10:00:00Z');

  it('counts the seconds until the window ends', () => {
    expect(liveViewSecondsLeft('2026-11-19T10:15:00Z', now)).toBe(900);
    expect(liveViewSecondsLeft('2026-11-19T10:00:00.400Z', now)).toBe(1);
  });

  it('is 0 when off, expired or unreadable', () => {
    expect(liveViewSecondsLeft(null, now)).toBe(0);
    expect(liveViewSecondsLeft('2026-11-19T09:59:00Z', now)).toBe(0);
    expect(liveViewSecondsLeft('not a date', now)).toBe(0);
  });
});

describe('fmtLeft', () => {
  it('formats minutes and padded seconds', () => {
    expect(fmtLeft(900)).toBe('15:00');
    expect(fmtLeft(65)).toBe('1:05');
    expect(fmtLeft(0)).toBe('0:00');
    expect(fmtLeft(-3)).toBe('0:00');
  });
});
