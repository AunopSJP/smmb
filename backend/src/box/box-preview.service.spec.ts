import type pg from 'pg';
import { BoxPreviewService, LIVE_VIEW_MS } from './box-preview.service.js';

/** ตารางงานจำลอง: id → ชนิดงาน (เฉพาะงานที่ยังไม่จบ ของตู้ BX-00001) · เลียนเงื่อนไขของ SQL ใน store() */
function fakePool(jobs: Record<string, 'test' | 'inspect'>): pg.Pool {
  return {
    query: async (_sql: string, params: unknown[]) => {
      const [jobId, boxId, live] = params as [string, string, boolean];
      const type = jobs[jobId];
      const ok = boxId === 'BX-00001' && type !== undefined && (type === 'test' || (type === 'inspect' && live));
      return { rowCount: ok ? 1 : 0 };
    },
  } as unknown as pg.Pool;
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

describe('BoxPreviewService live view window', () => {
  it('rejects frames from a real inspection until an admin turns live view on', async () => {
    const svc = new BoxPreviewService(fakePool({ 'J-aaaaaa': 'inspect' }));
    expect(await svc.store('BX-00001', 'J-aaaaaa', jpeg)).toBe(false);
    svc.enableLive('BX-00001');
    expect(await svc.store('BX-00001', 'J-aaaaaa', jpeg)).toBe(true);
    expect(svc.latest('BX-00001')?.jobId).toBe('J-aaaaaa');
  });

  it('always accepts test-job frames, even with live view off', async () => {
    const svc = new BoxPreviewService(fakePool({ 'J-bbbbbb': 'test' }));
    expect(await svc.store('BX-00001', 'J-bbbbbb', jpeg)).toBe(true);
  });

  it('turning it on for one box does not open another box', async () => {
    const svc = new BoxPreviewService(fakePool({ 'J-aaaaaa': 'inspect' }));
    svc.enableLive('BX-00002');
    expect(await svc.store('BX-00001', 'J-aaaaaa', jpeg)).toBe(false);
  });

  it('expires after 15 minutes and drops the last frame', async () => {
    const svc = new BoxPreviewService(fakePool({ 'J-aaaaaa': 'inspect' }));
    const t0 = 1_000_000;
    const until = svc.enableLive('BX-00001', t0);
    expect(until.getTime()).toBe(t0 + LIVE_VIEW_MS);
    expect(svc.liveActive('BX-00001', t0 + LIVE_VIEW_MS - 1)).toBe(true);
    expect(svc.liveActive('BX-00001', t0 + LIVE_VIEW_MS)).toBe(false);
    expect(svc.liveExpiresAt('BX-00001', t0 + LIVE_VIEW_MS)).toBeNull();
  });

  it('turning it off clears the stored frame at once', async () => {
    const svc = new BoxPreviewService(fakePool({ 'J-aaaaaa': 'inspect' }));
    svc.enableLive('BX-00001');
    await svc.store('BX-00001', 'J-aaaaaa', jpeg);
    svc.disableLive('BX-00001');
    expect(svc.latest('BX-00001')).toBeNull();
    expect(svc.liveActive('BX-00001')).toBe(false);
  });

  it('refuses non-JPEG or oversized bodies', async () => {
    const svc = new BoxPreviewService(fakePool({ 'J-bbbbbb': 'test' }));
    expect(await svc.store('BX-00001', 'J-bbbbbb', Buffer.from([0x89, 0x50]))).toBe(false);
    expect(await svc.store('BX-00001', 'J-bbbbbb', Buffer.alloc(70 * 1024, 0xff))).toBe(false);
  });
});
