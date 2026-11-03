import { DestroyRef, inject, Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { Subject } from 'rxjs';

/**
 * สัญญาณให้หน้าที่เปิดอยู่ดึงข้อมูลใหม่ทันที — ไม่ต้องให้ผู้ใช้กดรีเฟรชเอง
 * มาจาก: แจ้งเตือน push เข้า (SOS / มีคนขอเข้าหน่วยงาน / ตรวจแล้ว …) · กลับมาที่แอป (สลับแท็บ/ปลดล็อกจอ) · เน็ตกลับมา
 * และหน้าที่บันทึกข้อมูลเรียก `changed()` ให้ส่วนอื่นของจอ (ตัวเลขบนแท็บ ฯลฯ) อัปเดตตาม
 */
@Injectable({ providedIn: 'root' })
export class LiveRefresh {
  private readonly subject = new Subject<void>();
  readonly ticks = this.subject.asObservable();

  constructor() {
    const swPush = inject(SwPush, { optional: true });
    // service worker ทำงานเฉพาะ build production — dev ไม่มี push ก็ใช้รอบเวลาแทน
    if (swPush?.isEnabled) swPush.messages.subscribe(() => this.subject.next());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.subject.next();
      });
      window.addEventListener('focus', () => this.subject.next());
      window.addEventListener('online', () => this.subject.next());
    }
  }

  /** มีการบันทึกข้อมูล — ให้หน้าอื่น/ตัวเลขบนแท็บดึงใหม่ */
  changed(): void {
    this.subject.next();
  }
}

/**
 * ดึงข้อมูลใหม่อัตโนมัติ: ทุก `everyMs` (เฉพาะตอนจอเปิดอยู่) + ทันทีเมื่อมีสัญญาณจาก {@link LiveRefresh}
 * เรียกใน constructor / field initializer (ต้องอยู่ใน injection context) · ไม่เรียกซ้อนถ้ารอบก่อนยังไม่เสร็จ
 */
export function liveRefresh(load: () => Promise<unknown> | void, everyMs: number): void {
  const live = inject(LiveRefresh);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await load();
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') void run();
  }, everyMs);
  const sub = live.ticks.subscribe(() => void run());
  inject(DestroyRef).onDestroy(() => {
    clearInterval(timer);
    sub.unsubscribe();
  });
}
