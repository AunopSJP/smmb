/**
 * "ปิดไว้ก่อน" ของแถบเตือนที่ไม่ควรหายถาวร (เช่น เครื่องนี้ยังไม่ได้เปิดแจ้งเตือน)
 * เก็บเวลาที่แถบจะกลับมาไว้ในเครื่อง (localStorage) — เปิดไม่ได้/ค่าเพี้ยน = ถือว่าไม่ได้ปิดไว้ (แสดงแถบ)
 */
export const PUSH_NUDGE_KEY = 'smmb.pushNudgeUntil';
/** แถบเตือนแจ้งเตือนกลับมาใหม่หลังกดปิดไว้ก่อนกี่ชั่วโมง (SOS พึ่งแจ้งเตือน จึงไม่ปล่อยหายนาน) */
export const PUSH_NUDGE_SNOOZE_HOURS = 12;

/** ยังอยู่ในช่วงปิดไว้ก่อนหรือไม่ — `raw` คือค่าที่เก็บไว้ (epoch ms เป็นข้อความ) */
export function isSnoozed(raw: string | null | undefined, now = Date.now()): boolean {
  if (!raw) return false;
  const until = Number(raw);
  // ค่าเพี้ยน หรืออยู่ไกลเกินช่วงที่ตั้งได้ (เช่นนาฬิกาเครื่องเคยเดินผิด) → ไม่เชื่อ ให้แสดงแถบ
  if (!Number.isFinite(until) || until - now > PUSH_NUDGE_SNOOZE_HOURS * 3600_000) return false;
  return until > now;
}

export function snoozeUntil(hours = PUSH_NUDGE_SNOOZE_HOURS, now = Date.now()): number {
  return now + hours * 3600_000;
}
