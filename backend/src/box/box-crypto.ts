// ลายเซ็นของตู้และ QR หน้าตู้ — ฟังก์ชันล้วน (ไม่แตะฐานข้อมูล) · สูตรเดียวกับที่เฟิร์มแวร์ต้องใช้
// ตัวอย่างค่าจริงให้ทีมเฟิร์มแวร์เทียบ: docs/SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md §1 (และ box-crypto.spec.ts)
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { randomCode } from '../common/codes.js';

export const sha256Hex = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

/**
 * รหัสลับประจำตู้ = hex(HMAC-SHA256(master key, box_id)) — 64 ตัวอักษร
 * เขียนลงบอร์ดตอนผลิต · ตู้ใช้**สตริง 64 ตัวนี้ทั้งก้อน** (ตัวอักษร ASCII) เป็นคีย์ HMAC ตอนเซ็นคำขอ
 */
export function deviceSecret(masterKey: string, boxId: string): string {
  return createHmac('sha256', masterKey).update(boxId).digest('hex');
}

/** ข้อความที่ตู้เซ็น: METHOD|PATH|TIMESTAMP|NONCE|hex(SHA256(BODY)) · PATH รวม query (`/v1/box/jobs?wait=50&config_ver=7`) · ไม่มี body = SHA256 ของค่าว่าง */
export function canonicalRequest(method: string, path: string, timestamp: string, nonce: string, body: Buffer | string): string {
  return `${method.toUpperCase()}|${path}|${timestamp}|${nonce}|${sha256Hex(body)}`;
}

/** X-Signature = hex(HMAC-SHA256(รหัสลับประจำตู้, canonicalRequest)) */
export function signRequest(secret: string, method: string, path: string, timestamp: string, nonce: string, body: Buffer | string): string {
  return createHmac('sha256', secret).update(canonicalRequest(method, path, timestamp, nonce, body)).digest('hex');
}

/** เทียบ hex แบบใช้เวลาเท่ากัน (กันเดาลายเซ็นจากเวลาที่ตอบ) · ไม่สนตัวเล็กใหญ่ */
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), 'utf8');
  const y = Buffer.from(b.toLowerCase(), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** ตัวอักษรของรหัสสั้น — ไม่มีตัวที่สับสน 0/O, 1/I/L (ชุดเดียวกับ common/codes.ts) */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** ลายเซ็นย่อ 6 ตัวของ QR หน้าตู้ = HMAC(คีย์ QR, box_id|ใบที่|รุ่น) แปลงเป็นตัวอักษร · ไม่รวมโดเมน (design §5.1) */
export function frontQrSig(qrKey: string, boxId: string, slot: '1' | '2', version: number): string {
  const mac = createHmac('sha256', qrKey).update(`${boxId}|${slot}|${version}`).digest();
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[mac[i] % ALPHABET.length];
  return out;
}

/** token ใน QR หน้าตู้: `BX00042-1-K7M2QX` (ลิงก์ = PUBLIC_BASE_URL + /b/ + token) */
export function frontQrToken(qrKey: string, boxId: string, slot: '1' | '2', version: number): string {
  return `${boxId.replace('-', '')}-${slot}-${frontQrSig(qrKey, boxId, slot, version)}`;
}

/** token ใน QR เปิดใช้ตู้: สุ่ม 16 ตัว (เดาไม่ได้ ใช้ได้ครั้งเดียว) */
export const newActivateToken = () => randomCode(16);

/** รหัสพิมพ์ใต้ QR 8 ตัว (เก็บไม่มีขีด) · แสดงเป็น `H4KD-9TRW` */
export const newPrintCode = () => randomCode(8);
export const showPrintCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** id งานปลุกตู้ `J-8f31c2` — สั้นเพราะอยู่ใน QR ประจำตัว (ชนกันได้ → ผู้เรียกลองใหม่) */
export const newJobId = () => `J-${randomBytes(3).toString('hex')}`;

// ── QR ประจำตัวเจ้าหน้าที่ (โปรโตคอล §3.3) ─────────────────────────────
// SMMB-O2.<j>.<u>.<e เลขฐาน 36>.<base64url(HMAC-SHA256(คีย์ QR, "badge|" + j.u.e) ตัด 12 ไบต์)>
// สร้างที่ server เท่านั้น · ผูกกับ job (j) + เจ้าหน้าที่ (u) · หมดอายุ e (วินาที UTC)
// สั้นโดยตั้งใจ (~47 ตัวอักษร): กล้องตู้ความละเอียดต่ำ อ่าน QR เล็ก/แน่นไม่ได้ (O1 ~95 ตัวอักษร อ่านไม่ติดบนบอร์ดจริง)

export interface BadgePayload {
  j: string;
  u: string;
  e: number;
}

const BADGE_PREFIX = 'SMMB-O2.';
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const badgeSig = (qrKey: string, body: string) =>
  createHmac('sha256', qrKey).update(`badge|${body}`).digest().subarray(0, 12).toString('base64url');

export function badgeToken(qrKey: string, p: BadgePayload): string {
  const body = `${p.j}.${p.u}.${p.e.toString(36)}`;
  return `${BADGE_PREFIX}${body}.${badgeSig(qrKey, body)}`;
}

/** ตรวจลายเซ็นของ QR ประจำตัว → payload หรือ null (ไม่ใช่ของระบบ / ถูกแก้) · หมดอายุ/ผิด job ให้ผู้เรียกเช็กเอง */
export function readBadge(qrKey: string, text: string): BadgePayload | null {
  if (!text.startsWith(BADGE_PREFIX)) return null;
  const parts = text.slice(BADGE_PREFIX.length).trim().split('.');
  if (parts.length !== 4) return null;
  const [j, u, e36, sig] = parts;
  if (!j || !u || !e36 || !sig || !/^[0-9a-z]{1,10}$/.test(e36)) return null;
  const expected = badgeSig(qrKey, `${j}.${u}.${e36}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { j, u, e: parseInt(e36, 36) };
}

// ── delivery ticket ของไรเดอร์ (api.md §5) ─────────────────────────────
// ออกตอนสแกน/พิมพ์รหัสผ่าน → ต้องมีตอนกดแจ้งส่งของ (POST ต้องผ่านการสแกนก่อนเสมอ) · อายุ 10 นาที · ใช้ได้ครั้งเดียว (n)

export interface TicketPayload {
  /** box_qr_code_id */
  q: string;
  m: 'scan' | 'code';
  e: number;
  /** สุ่ม — กุญแจกันใช้ซ้ำ */
  n: string;
}

const TICKET_PREFIX = 'SMMB-T1.';
const ticketSig = (key: string, payload: string) =>
  createHmac('sha256', key).update(`ticket|${payload}`).digest().subarray(0, 16).toString('base64url');

export function deliveryTicket(key: string, p: Omit<TicketPayload, 'n'>): string {
  const payload = b64url(JSON.stringify({ q: p.q, m: p.m, e: p.e, n: randomBytes(9).toString('base64url') }));
  return `${TICKET_PREFIX}${payload}.${ticketSig(key, payload)}`;
}

export function readTicket(key: string, text: string): TicketPayload | null {
  if (!text.startsWith(TICKET_PREFIX)) return null;
  const [payload, sig, extra] = text.slice(TICKET_PREFIX.length).split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const expected = ticketSig(key, payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<TicketPayload>;
    return typeof p.q === 'string' && (p.m === 'scan' || p.m === 'code') && typeof p.e === 'number' && typeof p.n === 'string'
      ? { q: p.q, m: p.m, e: p.e, n: p.n }
      : null;
  } catch {
    return null;
  }
}
