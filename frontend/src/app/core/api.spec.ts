import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { isSessionExpiry } from './api';

const e401 = (code?: string) => new HttpErrorResponse({ status: 401, error: code ? { code } : {} });

describe('isSessionExpiry', () => {
  it('401 ทั่วไป = session หมดอายุ', () => {
    expect(isSessionExpiry(e401('SESSION_EXPIRED'), '/api/v1/me')).toBe(true);
    expect(isSessionExpiry(e401(), '/api/v1/boxes')).toBe(true);
  });
  it('401 ของ /auth/* ไม่นับ (หน้าล็อกอิน/เปลี่ยนรหัสจัดการเอง)', () => {
    expect(isSessionExpiry(e401('INVALID_CREDENTIALS'), '/api/v1/auth/signin')).toBe(false);
  });
  it('ยืนยันรหัสผ่านซ้ำผิด (INVALID_CREDENTIALS) ที่ route อื่น ไม่เตะผู้ใช้ออก', () => {
    expect(isSessionExpiry(e401('INVALID_CREDENTIALS'), '/api/v1/me')).toBe(false);
  });
  it('ไม่ใช่ 401 / ไม่ใช่ HttpErrorResponse = false', () => {
    expect(isSessionExpiry(new HttpErrorResponse({ status: 403 }), '/api/v1/me')).toBe(false);
    expect(isSessionExpiry(new Error('x'), '/api/v1/me')).toBe(false);
  });
});
