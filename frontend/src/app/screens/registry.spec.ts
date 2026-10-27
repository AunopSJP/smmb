import { routes } from '../app.routes';
import { SCREENS, screen, screenUrl, TABS } from './registry';

describe('screen registry', () => {
  it('screen codes are unique', () => {
    const codes = SCREENS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('paths are unique within each area', () => {
    const keys = SCREENS.map((s) => `${s.area}/${s.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every "next" link and tab points to a real screen', () => {
    for (const s of SCREENS) for (const n of s.next ?? []) expect(() => screen(n), `${s.code} → ${n}`).not.toThrow();
    for (const tabs of Object.values(TABS)) for (const t of tabs ?? []) expect(() => screen(t.code)).not.toThrow();
  });

  it('every screen has Thai and English titles', () => {
    for (const s of SCREENS) {
      expect(s.title.th, s.code).toBeTruthy();
      expect(s.title.en, s.code).toBeTruthy();
    }
  });

  it('builds URLs with the area prefix', () => {
    expect(screenUrl('H03')).toBe('/home');
    expect(screenUrl('H12-b')).toBe('/home/history/inspection');
    expect(screenUrl('O02')).toBe('/officer/scan');
  });

  it('every built page belongs to a registered screen', async () => {
    const { BUILT_CODES } = await import('../app.routes');
    for (const c of BUILT_CODES) expect(() => screen(c), c).not.toThrow();
  });

  it('every screen has a route', () => {
    const count = routes.reduce((n, r) => n + (r.children?.length ?? 0), 0);
    expect(count).toBe(SCREENS.length);
  });
});
