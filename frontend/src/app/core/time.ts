import type { Lang } from './i18n';

/**
 * รูปแบบวันเวลากลางทั้งแอป (A8)
 * กติกาเดียว: วันนี้ / เมื่อวาน / "16 พ.ย." + เวลา 24 ชม. (HH:mm)
 * - ใช้ทุกหน้า รวมประวัติของหัวหน้าและ log ของแอดมิน
 * - ปีแสดงเฉพาะเมื่อไม่ใช่ปีปัจจุบัน (หรือเมื่อขอแบบเต็ม)
 * - ภาษาไทยใช้ พ.ศ. ตามที่ผู้ใช้เห็นทั้งแอป · อังกฤษใช้ ค.ศ.
 */
const TZ = 'Asia/Bangkok';

const valid = (input: string | Date): Date | null => {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** วันตามเวลาไทยเป็น YYYY-MM-DD (ใช้เทียบวันนี้/เมื่อวาน และเป็น key ของกลุ่ม) */
export function bkkDay(input: string | Date = new Date()): string {
  const d = valid(input);
  if (!d) return '';
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** เวลา 24 ชม. — "14:47" หรือ "14:47:52" */
export function fmtTime(input: string | Date, seconds = false): string {
  const d = valid(input);
  if (!d) return '—';
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: false,
    timeZone: TZ,
  });
}

/** เวลาแบบมีวินาที (โหมดละเอียด) — คงชื่อเดิมไว้ให้หน้าที่ใช้อยู่ */
export function bkkClock(iso: string): string {
  return fmtTime(iso, true);
}

/** วันที่แบบเต็ม (มีปี) — ไทย "16 พ.ย. 2569" · อังกฤษ "16 Nov 2026" */
export function fmtDate(input: string | Date, lang: Lang): string {
  const d = valid(input);
  if (!d) return '—';
  return d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  });
}

/** วันที่แบบไม่ต้องมีปี ถ้าเป็นปีเดียวกัน — ไทย "16 พ.ย." · อังกฤษ "16 Nov" */
export function fmtMonthDay(input: string | Date, lang: Lang): string {
  const d = valid(input);
  if (!d) return '—';
  return d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  });
}

/**
 * วันแบบอ่านเร็ว: วันนี้ / เมื่อวาน / วันที่ (ใส่ปีเมื่อคนละปี)
 * ใช้เป็นหัวข้อกลุ่มในรายการและบรรทัดวันที่ในตาราง
 */
export function fmtDay(input: string | Date, lang: Lang): string {
  const d = valid(input);
  if (!d) return '—';
  const day = bkkDay(d);
  if (day === bkkDay()) return lang === 'th' ? 'วันนี้' : 'Today';
  if (day === bkkDay(new Date(Date.now() - 86_400_000))) return lang === 'th' ? 'เมื่อวาน' : 'Yesterday';
  const sameYear = day.slice(0, 4) === bkkDay().slice(0, 4);
  return sameYear ? fmtMonthDay(d, lang) : fmtDate(d, lang);
}

/** วัน + เวลา 24 ชม. — "วันนี้ 14:47" · "16 พ.ย. 14:47" */
export function fmtWhen(input: string | Date, lang: Lang): string {
  const d = valid(input);
  if (!d) return '—';
  return `${fmtDay(d, lang)} ${fmtTime(d)}`;
}

/** วัน + เวลาแบบมีวินาที (โหมดละเอียด/log) */
export function fmtWhenSec(input: string | Date, lang: Lang): string {
  const d = valid(input);
  if (!d) return '—';
  return `${fmtDay(d, lang)} ${fmtTime(d, true)}`;
}

/** วันที่เต็ม + เวลา — ใช้ในตาราง log ที่ต้องอ้างอิงย้อนหลังข้ามปี */
export function fmtDateTime(input: string | Date, lang: Lang): string {
  const d = valid(input);
  if (!d) return '—';
  return `${fmtDate(d, lang)} ${fmtTime(d)}`;
}
