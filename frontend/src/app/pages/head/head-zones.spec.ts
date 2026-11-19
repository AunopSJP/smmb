import { nextWindow, windowProblem } from './head-zones';

/** ช่วงเวลาตรวจของโซน: กันเวลาซ้อน/ซ้ำ/กลับด้าน ก่อนกด "เพิ่มช่วงเวลานี้" */
describe('windowProblem', () => {
  it('accepts a valid window when nothing overlaps', () => {
    expect(windowProblem('13:00', '14:00', [])).toBe(false);
    expect(windowProblem('13:00', '14:00', [['06:00', '09:00']])).toBe(false);
  });

  it('accepts back-to-back windows (shared edge is not an overlap)', () => {
    expect(windowProblem('09:00', '10:00', [['06:00', '09:00']])).toBe(false);
    expect(windowProblem('06:00', '09:00', [['09:00', '10:00']])).toBe(false);
  });

  it('rejects a duplicate window', () => {
    expect(windowProblem('06:00', '09:00', [['06:00', '09:00']])).toBe(true);
  });

  it('rejects partial overlaps in both directions', () => {
    expect(windowProblem('08:00', '10:00', [['06:00', '09:00']])).toBe(true);
    expect(windowProblem('05:00', '07:00', [['06:00', '09:00']])).toBe(true);
    expect(windowProblem('07:00', '08:00', [['06:00', '09:00']])).toBe(true); // ซ้อนอยู่ข้างใน
  });

  it('rejects equal or reversed times', () => {
    expect(windowProblem('09:00', '09:00', [])).toBe(true);
    expect(windowProblem('10:00', '09:00', [])).toBe(true);
  });

  it('rejects malformed values instead of guessing', () => {
    expect(windowProblem('9:00', '10:00', [])).toBe(true);
    expect(windowProblem('09:00', '', [])).toBe(true);
    expect(windowProblem('', '', [])).toBe(true);
  });
});

/** ปุ่ม "เพิ่มช่วงเวลา": เติมแถวใหม่ที่ไม่ทับช่วงเดิมเมื่อทำได้ */
describe('nextWindow', () => {
  it('starts with a morning window', () => {
    expect(nextWindow([])).toEqual(['06:00', '09:00']);
  });

  it('continues after the latest window for 3 hours', () => {
    expect(nextWindow([['06:00', '09:00']])).toEqual(['09:00', '12:00']);
    expect(nextWindow([['17:00', '20:00'], ['06:00', '09:00']])).toEqual(['20:00', '23:00']);
  });

  it('caps at 23:59', () => {
    expect(nextWindow([['18:00', '22:00']])).toEqual(['22:00', '23:59']);
  });

  it('goes before the first window when the evening is full', () => {
    expect(nextWindow([['12:00', '23:59']])).toEqual(['09:00', '12:00']);
  });

  it('never returns an empty window', () => {
    const [f, t] = nextWindow([['00:00', '23:59']]);
    expect(f < t).toBe(true);
  });
});
