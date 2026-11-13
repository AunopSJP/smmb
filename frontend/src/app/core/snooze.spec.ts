import { describe, expect, it } from 'vitest';
import { isSnoozed, PUSH_NUDGE_SNOOZE_HOURS, snoozeUntil } from './snooze';

describe('snooze', () => {
  const now = 1_000_000_000_000;
  it('is snoozed until the stored time, then the banner returns', () => {
    const until = snoozeUntil(PUSH_NUDGE_SNOOZE_HOURS, now);
    expect(isSnoozed(String(until), now)).toBe(true);
    expect(isSnoozed(String(until), now + PUSH_NUDGE_SNOOZE_HOURS * 3600_000 - 1)).toBe(true);
    expect(isSnoozed(String(until), now + PUSH_NUDGE_SNOOZE_HOURS * 3600_000)).toBe(false);
  });
  it('shows the banner for missing, garbage or absurdly far values', () => {
    expect(isSnoozed(null, now)).toBe(false);
    expect(isSnoozed('', now)).toBe(false);
    expect(isSnoozed('abc', now)).toBe(false);
    expect(isSnoozed(String(now + 400 * 3600_000), now)).toBe(false);
  });
});
