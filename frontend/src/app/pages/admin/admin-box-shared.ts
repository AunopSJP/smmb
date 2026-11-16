import { type AdminBoxRow } from '../../core/admin-api';
import { type Tr } from '../../core/i18n';
import { minutesAgo, type BoxStatus } from '../../core/owner-api';

// แอดมิน: D03 ตู้ทั้งหมด + ลงทะเบียนตู้ใหม่ · D04 รายละเอียดตู้ (QR จริง · ทดสอบปลุกตู้ · รหัสลับเขียนลงบอร์ด) — api.md §9.4

export type Tone = '' | 'ok' | 'warn' | 'danger';
export const LOW_BATTERY_PCT = 20;

const STATUS: Record<BoxStatus, { label: Tr; tone: Tone }> = {
  online: { label: { th: 'ออนไลน์ · พร้อมสแกน', en: 'Online · ready to scan' }, tone: 'ok' },
  sleeping: { label: { th: 'พักอยู่ · นอกเวลาตรวจ', en: 'Sleeping · outside patrol hours' }, tone: '' },
  offline: { label: { th: 'ไม่ออนไลน์', en: 'Offline' }, tone: 'danger' },
  service_closed: { label: { th: 'ปิดบริการ', en: 'Closed' }, tone: '' },
  unbound: { label: { th: 'ยังไม่ผูก', en: 'Unbound' }, tone: '' },
};

/** ตู้ออนไลน์แต่อยู่นอกเวลาตรวจ (เช่น ตื่นหลังเปิดเครื่อง หรือเพิ่งพ้นเวลาตรวจ) — เซิร์ฟเวอร์ไม่รับตรวจช่วงนี้ จึงไม่บอกว่า "พร้อมสแกน" */
const ONLINE_OUTSIDE_WINDOW: { label: Tr; tone: Tone } = {
  label: { th: 'ออนไลน์ · นอกเวลาตรวจ', en: 'Online · outside patrol hours' },
  tone: 'ok',
};

/** นาทีของวันตามเวลาไทย (0–1439) */
function bangkokMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** อยู่ในช่วงเวลาตรวจไหม (HH:mm · เริ่มนับ จบไม่นับ ตรงกับ minutesIntoWindow ของ backend) */
export function inPatrolWindow(windows: [string, string][], now = new Date()): boolean {
  const m = bangkokMinutes(now);
  const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return windows.some(([s, e]) => m >= mins(s) && m < mins(e));
}

/**
 * ป้ายสถานะตู้ — แบตต่ำแทนออนไลน์/พักอยู่
 * ส่ง windows (เวลาตรวจของตู้) มาด้วยเมื่อรู้ → ออนไลน์นอกเวลาตรวจจะขึ้น "นอกเวลาตรวจ" แทน "พร้อมสแกน"
 * (เซิร์ฟเวอร์นับออนไลน์จากการถาม long-poll ภายใน 100 วิ จึงค้างออนไลน์ ~2 นาทีหลังพ้นเวลาตรวจ)
 */
export function boxBadge(b: Pick<AdminBoxRow, 'status' | 'battery'>, windows?: [string, string][], now = new Date()): { label: Tr; tone: Tone } {
  if ((b.status === 'online' || b.status === 'sleeping') && b.battery && b.battery.pct < LOW_BATTERY_PCT) {
    return { label: { th: 'แบตต่ำ', en: 'Low battery' }, tone: 'warn' };
  }
  if (b.status === 'online' && windows && !inPatrolWindow(windows, now)) return ONLINE_OUTSIDE_WINDOW;
  return STATUS[b.status];
}

/** "ไม่เคยติดต่อ" / "5 นาทีที่แล้ว" */
export function seenText(iso: string | null): Tr {
  const m = minutesAgo(iso);
  if (m === null) return { th: 'ยังไม่เคยติดต่อ', en: 'never connected' };
  if (m < 1) return { th: 'เมื่อสักครู่', en: 'just now' };
  if (m < 60) return { th: `${m} นาทีที่แล้ว`, en: `${m} min ago` };
  if (m < 1440) return { th: `${Math.floor(m / 60)} ชม.ที่แล้ว`, en: `${Math.floor(m / 60)} h ago` };
  return { th: `${Math.floor(m / 1440)} วันที่แล้ว`, en: `${Math.floor(m / 1440)} d ago` };
}

export const SLOT_LABEL: Record<string, Tr> = {
  '1': { th: 'QR หน้าตู้', en: 'Front QR' },
  '2': { th: 'QR สำรอง', en: 'Backup QR' },
  activate: { th: 'QR เปิดใช้ตู้', en: 'Activation QR' },
};
