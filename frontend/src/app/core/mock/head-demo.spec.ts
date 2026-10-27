import { HeadDemo } from './head-demo';

describe('HeadDemo', () => {
  let d: HeadDemo;
  beforeEach(() => (d = new HeadDemo()));

  it('"my zones" filter shows only zones the head belongs to', () => {
    expect(d.visibleZones().map((z) => z.name)).toEqual(['โซน A']);
    d.zoneFilter.set('all');
    expect(d.visibleZones()).toHaveLength(3);
  });

  it('adding yourself to a zone makes it "my zone" after saving', () => {
    d.editZone('z3');
    d.draft.update((z) => (z ? { ...z, officer_ids: [...z.officer_ids, 'U-0090'] } : z));
    d.saveDraft();
    expect(d.zones().find((z) => z.id === 'z3')?.mine).toBe(true);
  });

  it('editing a zone does not change it until saved', () => {
    d.editZone('z1');
    d.draft.update((z) => (z ? { ...z, houses: [] } : z));
    expect(d.zones().find((z) => z.id === 'z1')?.houses.length).toBe(10);
  });

  it('disabling a member removes them from every zone and from head', () => {
    d.setHead('U-0092', true);
    d.setStatus('U-0092', 'disabled');
    expect(d.member('U-0092')?.is_head).toBe(false);
    expect(d.zones().some((z) => z.officer_ids.includes('U-0092'))).toBe(false);
  });

  it('a new zone gets the next letter', () => {
    d.editZone(undefined);
    expect(d.draft()?.name).toBe('โซน D');
  });
});
