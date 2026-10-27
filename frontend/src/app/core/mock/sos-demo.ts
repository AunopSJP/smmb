import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

export type SosStatus = 'idle' | 'open' | 'accepted' | 'closed' | 'cancelled';
/** ขั้นของ SOS (design §7): แจ้งโซน → ทั้งหน่วยงาน → ให้โทรเอง */
export type SosStage = 'zone' | 'agency' | 'call_yourself';

/** วินาทีที่เลื่อนขั้น (api.md §7) */
export const STAGE_AGENCY_AT = 30;
export const STAGE_CALL_AT = 60;

/**
 * สถานะ SOS จำลองของเจ้าของบ้าน — ตอนต่อ API จริงมาจาก `GET /sos/:id` (poll ทุก 1 วิ หรือ SSE)
 * มีปุ่ม "จำลอง" ให้ข้ามไปสถานะถัดไปได้โดยไม่ต้องรอ
 */
@Injectable({ providedIn: 'root' })
export class SosDemo {
  readonly status = signal<SosStatus>('idle');
  private readonly startedAt = signal<number | null>(null);
  private readonly acceptedAt = signal<number | null>(null);
  private readonly now = signal(Date.now());
  readonly cancelReason = signal<'safe' | 'mistake' | null>(null);
  /** บ้านยังไม่อยู่ในโซนใด → ส่งไม่ถึงใคร (หน้า H08) */
  readonly houseHasOfficers = signal(true);

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  readonly elapsedSec = computed(() => {
    const s = this.startedAt();
    return s === null ? 0 : Math.max(0, Math.floor((this.now() - s) / 1000));
  });

  readonly stage = computed<SosStage>(() => {
    const t = this.elapsedSec();
    return t >= STAGE_CALL_AT ? 'call_yourself' : t >= STAGE_AGENCY_AT ? 'agency' : 'zone';
  });

  /** นาทีที่ใช้จนมีคนรับ (แสดงตอนปิดเรื่อง) */
  readonly minutesToAccept = computed(() => {
    const s = this.startedAt();
    const a = this.acceptedAt();
    return s === null || a === null ? 0 : Math.max(1, Math.round((a - s) / 60000));
  });

  start(): void {
    this.startedAt.set(Date.now());
    this.acceptedAt.set(null);
    this.now.set(Date.now());
    this.cancelReason.set(null);
    this.status.set('open');
  }

  /** จำลอง: ข้ามเวลาไปข้างหน้า (ดูขั้นถัดไปโดยไม่ต้องรอ) */
  skip(seconds: number): void {
    const s = this.startedAt();
    if (s !== null) this.startedAt.set(s - seconds * 1000);
  }

  accept(): void {
    this.acceptedAt.set(Date.now());
    this.status.set('accepted');
  }

  close(): void {
    this.status.set('closed');
  }

  cancel(reason: 'safe' | 'mistake'): void {
    this.cancelReason.set(reason);
    this.status.set('cancelled');
  }

  reset(): void {
    this.status.set('idle');
    this.startedAt.set(null);
  }
}
