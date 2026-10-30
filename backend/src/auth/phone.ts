/**
 * แปลงเบอร์มือถือไทยให้อยู่รูปเดียว `0812345678` — คืน null ถ้าไม่ใช่เบอร์ที่รับ
 * รับ: ช่องว่าง ขีด จุด วงเล็บ · +66 / 66 นำหน้า · เลขไทย ๐-๙ · เลขเต็มความกว้าง · อักขระล่องหนที่ติดมาตอนคัดลอก
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let digits = input
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50)) // เลขไทย (คีย์บอร์ดไทยบนมือถือ)
    .normalize('NFKC') // เลขและ + แบบเต็มความกว้าง
    .replace(/[\s\-.()​-‍﻿]/g, ''); // ช่องว่าง ขีด จุด วงเล็บ + zero-width
  if (digits.startsWith('+66')) digits = '0' + digits.slice(3);
  else if (/^66\d{9}$/.test(digits)) digits = '0' + digits.slice(2);
  return /^0\d{9}$/.test(digits) ? digits : null;
}
