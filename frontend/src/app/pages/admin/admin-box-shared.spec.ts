import { boxBadge, inPatrolWindow } from './admin-box-shared';

// เวลาไทย = UTC+7 → 14:49 ไทย = 07:49Z
const at = (hhmmBangkok: string) => new Date(`2026-11-16T${String((Number(hhmmBangkok.slice(0, 2)) + 17) % 24).padStart(2, '0')}:${hhmmBangkok.slice(3)}:00Z`);
const W: [string, string][] = [['14:40', '14:50']];
const online = { status: 'online' as const, battery: null };

describe('inPatrolWindow', () => {
  it('counts the start minute but not the end minute (same as backend)', () => {
    expect(inPatrolWindow(W, at('14:40'))).toBe(true);
    expect(inPatrolWindow(W, at('14:49'))).toBe(true);
    expect(inPatrolWindow(W, at('14:50'))).toBe(false);
    expect(inPatrolWindow(W, at('14:39'))).toBe(false);
  });
});

describe('boxBadge (online outside patrol hours)', () => {
  it('says ready to scan inside the window', () => {
    expect(boxBadge(online, W, at('14:45')).label.th).toBe('ออนไลน์ · พร้อมสแกน');
  });
  it('says outside patrol hours once the window has ended, even while still online', () => {
    const b = boxBadge(online, W, at('14:52'));
    expect(b.label.th).toBe('ออนไลน์ · ยังตรวจไม่ได้');
    expect(b.tone).toBe('ok');
  });
  it('treats a box in no zone as outside patrol hours', () => {
    expect(boxBadge(online, [], at('14:45')).label.th).toBe('ออนไลน์ · ยังตรวจไม่ได้');
  });
  it('keeps the old label when no windows are given (list pages)', () => {
    expect(boxBadge(online).label.th).toBe('ออนไลน์ · พร้อมสแกน');
  });
  it('does not touch other statuses and low battery still wins', () => {
    expect(boxBadge({ status: 'sleeping', battery: null }, W, at('14:52')).label.th).toBe('ตู้พัก');
    expect(boxBadge({ status: 'online', battery: { pct: 10, charging: false, reported_at: null } }, W, at('14:52')).label.th).toBe('แบตต่ำ');
  });
});
