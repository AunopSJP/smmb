import { normalizePhone } from './mock/auth-demo';

/**
 * ช่องกรอกเบอร์มือถือของบัญชี (ล็อกอิน/สมัคร) — ให้เหลือเลข 10 หลักพอดีกับเบอร์ไทย
 * - วางเบอร์ที่มีขีด/ช่องว่าง/+66/เลขไทย → แปลงเป็น 0812345678 ให้เลย (ไม่ตัดกลางทาง)
 * - พิมพ์เอง → รับเฉพาะตัวเลข ไม่เกิน 10 ตัว
 * ไม่ใช้ `maxlength` ของ HTML เพราะตัดข้อความที่วางมาก่อนจะได้แปลง
 */
export function sanitizePhoneInput(raw: string): string {
  const whole = normalizePhone(raw);
  if (whole) return whole;
  return raw
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    .normalize('NFKC')
    .replace(/\D/g, '')
    .slice(0, 10);
}

/** ใช้ใน template: `(input)="phone.set(bindPhone($any($event.target)))"` — เขียนค่าที่แก้แล้วกลับลงช่อง และคืนค่านั้น */
export function bindPhone(el: HTMLInputElement): string {
  const clean = sanitizePhoneInput(el.value);
  if (el.value !== clean) el.value = clean;
  return clean;
}
