import { AppError } from '../common/http-exception.filter.js';
import { MAX_WINDOW_MINUTES, MAX_WINDOWS, normalizeWindows } from './zone.service.js';

const codeOf = (input: unknown) => {
  try {
    normalizeWindows(input);
    return 'ok';
  } catch (err) {
    return err instanceof AppError ? err.code : 'other';
  }
};

describe('normalizeWindows', () => {
  it('sorts windows by start time', () => {
    expect(
      normalizeWindows([
        ['17:00', '17:30'],
        ['06:00', '06:30'],
      ]),
    ).toEqual([
      ['06:00', '06:30'],
      ['17:00', '17:30'],
    ]);
  });

  it('allows touching windows and an empty list', () => {
    expect(codeOf([['06:00', '06:30'], ['06:30', '07:00']])).toBe('ok');
    expect(codeOf([])).toBe('ok');
  });

  it(`allows windows up to ${MAX_WINDOW_MINUTES} minutes, rejects longer ones`, () => {
    expect(codeOf([['08:45', '09:15']])).toBe('ok');
    expect(codeOf([['23:29', '23:59']])).toBe('ok');
    expect(codeOf([['06:00', '06:31']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['06:00', '09:00']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['00:00', '23:59']])).toBe('WINDOWS_INVALID');
  });

  it('rejects overnight, reversed, overlapping and malformed windows', () => {
    expect(codeOf([['23:50', '00:10']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['09:00', '09:00']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['06:00', '06:30'], ['06:20', '06:40']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['6:00', '06:30']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['24:00', '24:30']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['06:00']])).toBe('WINDOWS_INVALID');
    expect(codeOf('06:00-06:30')).toBe('WINDOWS_INVALID');
  });

  it(`allows at most ${MAX_WINDOWS} windows`, () => {
    const w = (h: number) => [`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`];
    expect(codeOf([w(1), w(2), w(3), w(4)])).toBe('ok');
    expect(codeOf([w(1), w(2), w(3), w(4), w(5)])).toBe('WINDOWS_INVALID');
  });
});
