import { Injectable } from '@angular/core';

/**
 * ทะเบียน “ล้างสถานะในหน่วยความจำ” ของ service ที่มีชีวิตรอดข้ามหน้า
 * เรียกตอนออกจากระบบ/session หมดอายุ — เครื่องใช้ร่วมจะไม่เห็นข้อมูล/PII ของบัญชีก่อน
 * (service ที่ยังไม่ถูกสร้างไม่ต้องลงทะเบียน เพราะยังไม่มีสถานะให้ล้าง)
 */
@Injectable({ providedIn: 'root' })
export class AppReset {
  private readonly fns = new Set<() => void>();

  /** ลงทะเบียนตัวล้าง — เรียกครั้งเดียวใน constructor ของ service */
  register(fn: () => void): void {
    this.fns.add(fn);
  }

  resetAll(): void {
    for (const fn of this.fns) {
      try {
        fn();
      } catch {
        // ตัวล้างตัวหนึ่งพังต้องไม่กันตัวอื่น — ข้อมูลที่เหลือจะถูกล้างรอบหน้า
      }
    }
  }
}
