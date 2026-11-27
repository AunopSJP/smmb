import { describe, expect, it } from 'vitest';
import { zoneMissing } from './head-api';

const ready = { windows: [['06:00', '06:30']] as [string, string][], officers_count: 1, houses_count: 1, pending_count: 0 };

describe('zoneMissing', () => {
  it('is empty when a zone can be inspected, even with more requests pending', () => {
    expect(zoneMissing({ ...ready, pending_count: 2 })).toEqual([]);
  });

  it('lists every missing part with the tab that fixes it', () => {
    expect(zoneMissing({ windows: [], officers_count: 0, houses_count: 0, pending_count: 0 }).map((m) => m.tab)).toEqual(['settings', 'officers', 'houses']);
  });

  it('says how many houses are still waiting for their owners', () => {
    expect(zoneMissing({ ...ready, houses_count: 0, pending_count: 3 })[0].en).toBe('3 awaiting owners');
  });
});
