/**
 * เวลาแบบมีวินาที (โหมดละเอียด) เป็นเวลาไทย (Asia/Bangkok)
 * วันนี้ = "14:07:52" · วันอื่น = "11/11 14:07:52" (วัน/เดือน ไม่ผูกกับภาษา) — เวลาที่ไม่ใช่วันนี้ต้องมีวันที่เสมอ
 */
export function bkkClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const tz = 'Asia/Bangkok';
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz });
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz });
  if (day(d) === day(new Date())) return time;
  const dm = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', timeZone: tz });
  return `${dm} ${time}`;
}
