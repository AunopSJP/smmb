import { randomInt } from 'node:crypto';

/** ไม่มีตัวที่สับสน 0/O, 1/I/L (design §5.1) */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** รหัสกลุ่มของหน่วยงาน — แชร์ให้ลูกทีมพิมพ์ตอนสมัคร */
export const newGroupCode = () => randomCode(8);

/**
 * รหัสผ่านชั่วคราวหลังรีเซ็ต — แสดงครั้งเดียว ผู้ใช้ต้องเปลี่ยนก่อนใช้งานอื่น
 * 10 ตัว จาก 31 ตัวอักษร ≈ 49 bit + ล็อกบัญชีเมื่อผิดติดกัน
 */
export const newTempPassword = () => randomCode(10);
