import { type AdminBoxRow } from '../../core/admin-api';
import { type Tr } from '../../core/i18n';
import { minutesAgo, type BoxStatus } from '../../core/owner-api';

// แอดมิน: D03 ตู้ทั้งหมด + ลงทะเบียนตู้ใหม่ · D04 รายละเอียดตู้ (QR จริง · ทดสอบปลุกตู้ · รหัสลับเขียนลงบอร์ด) — api.md §9.4

export type Tone = '' | 'ok' | 'warn' | 'danger';
export const LOW_BATTERY_PCT = 20;

const STATUS: Record<BoxStatus, { label: Tr; tone: Tone }> = {
  online: { label: { th: 'ออนไลน์', en: 'Online' }, tone: 'ok' },
  sleeping: { label: { th: 'พักอยู่', en: 'Sleeping' }, tone: '' },
  offline: { label: { th: 'ไม่ออนไลน์', en: 'Offline' }, tone: 'danger' },
  service_closed: { label: { th: 'ปิดบริการ', en: 'Closed' }, tone: '' },
  unbound: { label: { th: 'ยังไม่ผูก', en: 'Unbound' }, tone: '' },
};

/** ป้ายสถานะตู้ — แบตต่ำแทนออนไลน์/พักอยู่ */
export function boxBadge(b: Pick<AdminBoxRow, 'status' | 'battery'>): { label: Tr; tone: Tone } {
  if ((b.status === 'online' || b.status === 'sleeping') && b.battery && b.battery.pct < LOW_BATTERY_PCT) {
    return { label: { th: 'แบตต่ำ', en: 'Low battery' }, tone: 'warn' };
  }
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
