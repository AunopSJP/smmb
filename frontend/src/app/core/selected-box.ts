import { inject, Injectable, signal } from '@angular/core';
import { AppReset } from './app-reset';

/**
 * ตู้ที่เจ้าของบ้านเลือกไว้ล่าสุด (เจ้าของมีหลายตู้) — ใช้ข้ามแท็บ หน้าหลัก/ประวัติ/ตั้งค่า
 * แท็บล่างไม่พก `?box=` ไปด้วย ถ้าไม่จำไว้ สลับตู้ที่หน้าหลักแล้วกด "ตั้งค่า" จะกลับไปตู้แรกเงียบ ๆ
 * ลำดับความสำคัญ: `?box=` ใน URL → ค่าที่จำ → ตู้แรก · หน้าที่ใช้ต้องตรวจว่า id นี้อยู่ในรายการตู้ของบัญชีก่อน
 * ล้างตอนออกจากระบบ/สลับบัญชี (เครื่องใช้ร่วม)
 */
@Injectable({ providedIn: 'root' })
export class SelectedBox {
  readonly id = signal<string | null>(null);

  constructor() {
    inject(AppReset).register(() => this.id.set(null));
  }
}
