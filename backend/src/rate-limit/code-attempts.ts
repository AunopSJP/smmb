import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/http-exception.filter.js';
import { COUNTER_STORE, type CounterStore } from './rate-limit.store.js';

/** ผิดติดกันกี่ครั้งถึงต้องรอ (✅ api.md §0) */
export const CODE_STRIKES = 3;
/** รอครั้งแรก 30 วิ · ผิดอีกรอบรอเพิ่มเป็น 2 เท่า สูงสุด 15 นาที */
export const CODE_LOCK_BASE_S = 30;
export const CODE_LOCK_MAX_S = 15 * 60;

/** เวลาที่ต้องรอหลังผิดครบรอบที่ n (n = 1, 2, …) */
export const codeLockSeconds = (round: number) => Math.min(CODE_LOCK_BASE_S * 2 ** (round - 1), CODE_LOCK_MAX_S);

/**
 * กันเดารหัสใต้ QR (ทุก route ที่รับ `code`) — นับต่อ IP
 * ผิด 3 ครั้งติดกัน → 429 CODE_ATTEMPTS_EXCEEDED · ถูก 1 ครั้งนับใหม่
 * ที่เก็บล่ม → ปล่อยผ่านแบบเดียวกับ rate limit (ระบบต้องใช้ได้) แต่บันทึกไว้
 */
@Injectable()
export class CodeAttempts {
  private readonly logger = new Logger('CodeAttempts');

  constructor(@Inject(COUNTER_STORE) private readonly store: CounterStore) {}

  /** เรียกก่อนตรวจรหัส — ยังอยู่ในช่วงรอ → 429 */
  async check(ip: string): Promise<void> {
    let locked = 0;
    try {
      locked = await this.store.get(`code:lock:${ip}`);
    } catch (err) {
      this.logger.warn(`code attempt store unavailable: ${(err as Error).message}`);
    }
    if (locked > 0) throw this.exceeded();
  }

  /** รหัสผิด — ครบรอบ → ตั้งเวลารอ แล้วตอบ 429 ทันทีในครั้งที่ครบ */
  async fail(ip: string): Promise<void> {
    try {
      const n = await this.store.hit(`code:fail:${ip}`, 24 * 3600);
      if (n % CODE_STRIKES === 0) {
        await this.store.hit(`code:lock:${ip}`, codeLockSeconds(n / CODE_STRIKES));
        throw this.exceeded();
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      this.logger.warn(`code attempt store unavailable: ${(err as Error).message}`);
    }
  }

  async succeed(ip: string): Promise<void> {
    await this.store.reset(`code:fail:${ip}`).catch(() => undefined);
  }

  private exceeded() {
    return new AppError(HttpStatus.TOO_MANY_REQUESTS, 'CODE_ATTEMPTS_EXCEEDED', 'too many wrong codes, wait and try again');
  }
}
