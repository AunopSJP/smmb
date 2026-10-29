import { Injectable, signal } from '@angular/core';
import { DELIVERY_LIMIT_PER_HOUR, normalizeCode } from '../rider-rules';
export { DELIVERY_LIMIT_PER_HOUR, normalizeCode } from '../rider-rules';

// ตัวจำลองไรเดอร์ (ไม่ได้ใช้แทน API ในหน้าไรเดอร์จริง)
// ไม่เก็บข้อมูลตัวตนไรเดอร์ · log การสแกน/พิมพ์รหัสเก็บที่ server ทุกครั้งแม้ไม่ผ่าน

export type RiderError = 'QR_INVALID' | 'CODE_ATTEMPTS_EXCEEDED' | 'BOX_SERVICE_CLOSED' | 'DELIVERY_LIMIT' | 'TICKET_EXPIRED';

interface DemoQr {
  /** ส่วนท้ายลิงก์ QR หน้าตู้ /b/<token> */
  token: string;
  /** รหัสพิมพ์ใต้ QR */
  print_code: string;
  box_id: string;
  house_no: string;
  revoked?: boolean;
}

export interface DeliveryTicket {
  ticket: string;
  box_id: string;
  house_no: string;
  issued_at: number;
}

/** อายุ delivery ticket 10 นาที (✅ 2026-10-27) */
export const TICKET_TTL_MS = 10 * 60 * 1000;
/** พิมพ์รหัสผิด 3 ครั้งติดกัน → รอ 30 วิ (✅ 2026-10-27 · ของจริง: ผิดอีกรอบรอเพิ่มเป็น 2 เท่า สูงสุด 15 นาที) */
export const CODE_MAX_WRONG = 3;
export const CODE_LOCK_MS = 30 * 1000;

@Injectable({ providedIn: 'root' })
export class RiderDemo {
  /** ใช้ในเทสต์ */
  now: () => number = () => Date.now();

  readonly qrs: DemoQr[] = [
    { token: 'BX00042-1-K7M2QX', print_code: 'H4KD9TRW', box_id: 'BX-00042', house_no: '99/9' },
    { token: 'BX00042-2-P3VN8Z', print_code: 'M7QA2XKE', box_id: 'BX-00042', house_no: '99/9' },
    { token: 'BX00031-1-R9TW4C', print_code: 'C2PZ8HNM', box_id: 'BX-00031', house_no: '12/4' },
    { token: 'BX00063-1-Q5JD7S', print_code: 'T6WB3KRV', box_id: 'BX-00063', house_no: '88/4' },
    { token: 'BX00017-1-OLD000', print_code: 'X8YH4NPQ', box_id: 'BX-00017', house_no: '45/2', revoked: true },
  ];
  /** ตู้ที่แอดมินปิดบริการ */
  readonly closedBoxes = signal(new Set(['BX-00063']));
  /** เวลาที่แจ้งส่งของสำเร็จ ต่อตู้ (นับรวมกับปุ่มหน้าตู้ในของจริง) */
  private readonly deliveries = new Map<string, number[]>();
  private wrongCodes = 0;
  readonly codeLockedUntil = signal(0);

  /** ใบที่ได้จากการสแกน/พิมพ์รหัสล่าสุด (หน้า R02 ใช้) */
  readonly ticket = signal<DeliveryTicket | null>(null);

  /** GET /public/qr/:token */
  openQr(token: string): { ok: true; ticket: DeliveryTicket } | { ok: false; code: RiderError } {
    return this.issue(this.qrs.find((q) => q.token === token));
  }

  /** GET /public/codes/:code — ผิดติดกันหลายครั้ง → ต้องรอ */
  openCode(raw: string): { ok: true; ticket: DeliveryTicket } | { ok: false; code: RiderError } {
    if (this.now() < this.codeLockedUntil()) return { ok: false, code: 'CODE_ATTEMPTS_EXCEEDED' };
    const code = normalizeCode(raw);
    const qr = this.qrs.find((q) => q.print_code === code);
    if (!qr || qr.revoked) {
      this.wrongCodes++;
      if (this.wrongCodes >= CODE_MAX_WRONG) {
        this.wrongCodes = 0;
        this.codeLockedUntil.set(this.now() + CODE_LOCK_MS);
        return { ok: false, code: 'CODE_ATTEMPTS_EXCEEDED' };
      }
      return { ok: false, code: 'QR_INVALID' };
    }
    this.wrongCodes = 0;
    return this.issue(qr);
  }

  private issue(qr: DemoQr | undefined): { ok: true; ticket: DeliveryTicket } | { ok: false; code: RiderError } {
    // ใบที่ถูกยกเลิก (410 QR_REVOKED) แสดงเหมือน QR ไม่ถูกต้อง
    if (!qr || qr.revoked) return { ok: false, code: 'QR_INVALID' };
    if (this.closedBoxes().has(qr.box_id)) return { ok: false, code: 'BOX_SERVICE_CLOSED' };
    const t: DeliveryTicket = { ticket: `T-${Math.random().toString(36).slice(2, 10)}`, box_id: qr.box_id, house_no: qr.house_no, issued_at: this.now() };
    this.ticket.set(t);
    return { ok: true, ticket: t };
  }

  /** POST /public/deliveries — ต้องมีใบจากการสแกนก่อนเสมอ */
  deliver(t: DeliveryTicket): { ok: true; at: number } | { ok: false; code: RiderError } {
    const now = this.now();
    if (now - t.issued_at > TICKET_TTL_MS) return { ok: false, code: 'TICKET_EXPIRED' };
    if (this.closedBoxes().has(t.box_id)) return { ok: false, code: 'BOX_SERVICE_CLOSED' };
    const recent = (this.deliveries.get(t.box_id) ?? []).filter((at) => now - at < 60 * 60 * 1000);
    if (recent.length >= DELIVERY_LIMIT_PER_HOUR) return { ok: false, code: 'DELIVERY_LIMIT' };
    this.deliveries.set(t.box_id, [...recent, now]);
    return { ok: true, at: now };
  }

  /** ปุ่มจำลอง: ทำให้ตู้นี้แจ้งครบเพดานแล้ว */
  fillLimit(boxId: string): void {
    const now = this.now();
    this.deliveries.set(boxId, Array.from({ length: DELIVERY_LIMIT_PER_HOUR }, () => now));
  }

  /** ปุ่มจำลอง: ใบหมดอายุ (เปิดหน้าค้างไว้นาน) */
  expireTicket(): void {
    this.ticket.update((t) => (t ? { ...t, issued_at: t.issued_at - TICKET_TTL_MS - 1 } : t));
  }
}
