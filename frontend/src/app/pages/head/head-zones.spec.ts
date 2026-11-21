import { nextWindow, tooLong, windowProblem } from './head-zones';

/** ช่วงเวลาตรวจของโซน: กันเวลาซ้อน/ซ้ำ/กลับด้าน ก่อนกด "เพิ่มช่วงเวลานี้" */
describe('windowProblem', () => {
  it('accepts a valid window when nothing overlaps', () => {
    expect(windowProblem('13:00', '13:30', [])).toBe(false);
    expect(windowProblem('13:00', '13:30', [['06:00', '06:30']])).toBe(false);
  });

  it('accepts back-to-back windows (shared edge is not an overlap)', () => {
    expect(windowProblem('06:30', '07:00', [['06:00', '06:30']])).toBe(false);
    expect(windowProblem('06:00', '06:30', [['06:30', '07:00']])).toBe(false);
  });

  it('rejects a duplicate window', () => {
    expect(windowProblem('06:00', '06:30', [['06:00', '06:30']])).toBe(true);
  });

  it('rejects partial overlaps in both directions', () => {
    expect(windowProblem('06:15', '06:45', [['06:00', '06:30']])).toBe(true);
    expect(windowProblem('05:45', '06:15', [['06:00', '06:30']])).toBe(true);
    expect(windowProblem('06:10', '06:20', [['06:00', '06:30']])).toBe(true); // ซ้อนอยู่ข้างใน
  });

  it('rejects windows longer than 30 minutes', () => {
    expect(windowProblem('06:00', '06:31', [])).toBe(true);
    expect(windowProblem('06:00', '09:00', [])).toBe(true);
    expect(tooLong('06:00', '06:30')).toBe(false);
  });

  it('rejects equal or reversed times', () => {
    expect(windowProblem('09:00', '09:00', [])).toBe(true);
    expect(windowProblem('10:00', '09:00', [])).toBe(true);
  });

  it('rejects malformed values instead of guessing', () => {
    expect(windowProblem('9:00', '09:30', [])).toBe(true);
    expect(windowProblem('09:00', '', [])).toBe(true);
    expect(windowProblem('', '', [])).toBe(true);
  });
});

/** ปุ่ม "เพิ่มช่วงเวลา": เติมแถวใหม่ (ช่วงละ 30 นาที) ที่ไม่ทับช่วงเดิมเมื่อทำได้ */
describe('nextWindow', () => {
  it('starts with a morning window', () => {
    expect(nextWindow([])).toEqual(['06:00', '06:30']);
  });

  it('continues after the latest window for 30 minutes', () => {
    expect(nextWindow([['06:00', '06:30']])).toEqual(['06:30', '07:00']);
    expect(nextWindow([['17:00', '17:30'], ['06:00', '06:30']])).toEqual(['17:30', '18:00']);
  });

  it('caps at 23:59', () => {
    expect(nextWindow([['23:20', '23:40']])).toEqual(['23:40', '23:59']);
  });

  it('goes before the first window when the evening is full', () => {
    expect(nextWindow([['12:00', '12:30'], ['23:29', '23:59']])).toEqual(['11:30', '12:00']);
  });

  it('never returns an empty window', () => {
    const [f, t] = nextWindow([['00:00', '00:30'], ['23:29', '23:59']]);
    expect(f < t).toBe(true);
  });

  it('never suggests a window longer than 30 minutes', () => {
    const [f, t] = nextWindow([['06:00', '06:30']]);
    expect(tooLong(f, t)).toBe(false);
  });
});
