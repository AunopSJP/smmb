/** Maximum parcel reports accepted for one mailbox per hour, enforced by the backend. */
export const DELIVERY_LIMIT_PER_HOUR = 5;

/** Printed mailbox codes ignore letter case, spaces, and separators. */
export const normalizeCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** ตัวอักษรที่ใช้ในรหัสใต้ QR (ไม่มี 0 1 O I L ที่สับสนง่าย) */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** รหัสใต้ QR ที่กรองตัวที่ไม่มีในชุด · สูงสุด 8 ตัว (ยังไม่ใส่ขีด) */
export const cleanCode = (raw: string): string =>
  [...normalizeCode(raw)].filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, 8);

/** แสดงเป็น H4KD-9TRW (ขีดหลังตัวที่ 4 เมื่อพิมพ์เกิน 4 ตัว) */
export const formatCode = (raw: string): string => {
  const c = cleanCode(raw);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};
