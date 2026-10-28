import {
  boxStatus,
  configVersion,
  DEFAULT_CONFIG,
  localMinutes,
  mergeWindows,
  minutesIntoWindow,
  resolveDefaults,
  type BoxConfig,
} from './box-config.js';
import { judgeTest } from './box-job.service.js';

// เวลาไทย = UTC+7
const bkk = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00+07:00`);

describe('mergeWindows (patrol windows of every zone that has the box)', () => {
  it('merges overlapping and touching windows from different zones/agencies', () => {
    expect(
      mergeWindows([
        ['17:00', '21:00'],
        ['06:00', '09:00'],
        ['08:30', '10:00'],
        ['21:00', '22:00'],
      ]),
    ).toEqual([
      ['06:00', '10:00'],
      ['17:00', '22:00'],
    ]);
  });

  it('a box in no zone gets no windows', () => {
    expect(mergeWindows([])).toEqual([]);
  });
});

describe('configVersion', () => {
  const cfg: BoxConfig = { ...DEFAULT_CONFIG, windows: [['06:00', '09:00']], tz: 'Asia/Bangkok' };
  it('changes whenever anything the box uses changes, and is never 0', () => {
    const v = configVersion(cfg);
    expect(v).toBeGreaterThan(0);
    expect(configVersion({ ...cfg })).toBe(v);
    expect(configVersion({ ...cfg, windows: [['06:00', '09:30']] })).not.toBe(v);
    expect(configVersion({ ...cfg, longpoll_wait_s: 40 })).not.toBe(v);
  });
});

describe('resolveDefaults', () => {
  it('ignores values outside the allowed ranges so a box always gets a usable config', () => {
    expect(resolveDefaults({ longpoll_wait_s: 999, max_attempts: 2, report_at: '25:00' }, { scan_timeout_s: 30 })).toEqual({
      ...DEFAULT_CONFIG,
      max_attempts: 2,
      scan_timeout_s: 30,
    });
  });
});

describe('patrol time (Asia/Bangkok)', () => {
  it('reads local time in Bangkok', () => {
    expect(localMinutes(bkk('06:05'))).toBe(6 * 60 + 5);
  });
  it('knows how long a window has been running', () => {
    expect(minutesIntoWindow([['06:00', '09:00']], bkk('06:07'))).toBe(7);
    expect(minutesIntoWindow([['06:00', '09:00']], bkk('09:00'))).toBeNull();
  });
});

describe('boxStatus', () => {
  const box = { service_active: true, owner_user_id: 'U-0001', last_poll_date: null as Date | null, last_seen_date: null as Date | null };
  const windows: [string, string][] = [['06:00', '09:00']];

  it('closed and unbound boxes say so first', () => {
    expect(boxStatus({ ...box, service_active: false }, windows, 50)).toBe('service_closed');
    expect(boxStatus({ ...box, owner_user_id: null }, windows, 50)).toBe('unbound');
  });

  it('online while it keeps a long-poll open', () => {
    const now = bkk('07:00');
    expect(boxStatus({ ...box, last_poll_date: new Date(now.getTime() - 60_000) }, windows, 50, now)).toBe('online');
  });

  it('offline when patrol hours started over 5 minutes ago and the box is not polling', () => {
    const now = bkk('06:10');
    const seen = new Date(now.getTime() - 3600_000);
    expect(boxStatus({ ...box, last_seen_date: seen }, windows, 50, now)).toBe('offline');
    expect(boxStatus({ ...box, last_seen_date: seen }, windows, 50, bkk('06:03'))).toBe('sleeping');
  });

  it('sleeping outside patrol hours if it reported in the last 26 hours, offline after that', () => {
    const now = bkk('12:00');
    expect(boxStatus({ ...box, last_seen_date: new Date(now.getTime() - 25 * 3600_000) }, windows, 50, now)).toBe('sleeping');
    expect(boxStatus({ ...box, last_seen_date: new Date(now.getTime() - 27 * 3600_000) }, windows, 50, now)).toBe('offline');
    expect(boxStatus(box, windows, 50, now)).toBe('offline');
  });
});

describe('judgeTest (test job: any readable QR passes)', () => {
  it('retries until the last attempt, then fails', () => {
    expect(judgeTest(1, false, null, 3)).toMatchObject({ status: 'retry', attempts_left: 2 });
    expect(judgeTest(3, false, null, 3)).toMatchObject({ status: 'fail' });
    expect(judgeTest(2, true, 'hello', 3)).toMatchObject({ status: 'pass' });
    expect(judgeTest(1, true, '', 3)).toMatchObject({ status: 'retry' });
  });
});
