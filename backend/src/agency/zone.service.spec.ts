import { AppError } from '../common/http-exception.filter.js';
import { MAX_WINDOWS, normalizeWindows } from './zone.service.js';

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
        ['17:00', '21:00'],
        ['06:00', '09:00'],
      ]),
    ).toEqual([
      ['06:00', '09:00'],
      ['17:00', '21:00'],
    ]);
  });

  it('allows touching windows and an empty list', () => {
    expect(codeOf([['06:00', '09:00'], ['09:00', '10:00']])).toBe('ok');
    expect(codeOf([])).toBe('ok');
  });

  it('rejects overnight, reversed, overlapping and malformed windows', () => {
    expect(codeOf([['22:00', '02:00']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['09:00', '09:00']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['06:00', '09:00'], ['08:30', '10:00']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['6:00', '09:00']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['24:00', '24:30']])).toBe('WINDOWS_INVALID');
    expect(codeOf([['06:00']])).toBe('WINDOWS_INVALID');
    expect(codeOf('06:00-09:00')).toBe('WINDOWS_INVALID');
  });

  it(`allows at most ${MAX_WINDOWS} windows`, () => {
    const w = (h: number) => [`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`];
    expect(codeOf([w(1), w(2), w(3), w(4)])).toBe('ok');
    expect(codeOf([w(1), w(2), w(3), w(4), w(5)])).toBe('WINDOWS_INVALID');
  });
});
