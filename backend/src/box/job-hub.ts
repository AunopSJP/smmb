import { Injectable } from '@nestjs/common';

/**
 * ปลุก long-poll ของตู้ทันทีที่มีงาน (โปรโตคอล §2.3)
 * เก็บในหน่วยความจำ — ใช้ได้เมื่อรัน backend **ตัวเดียว** (self-host เครื่องเดียวตามแผน)
 * ถ้าวันหนึ่งรันหลายตัว ต้องเปลี่ยนเป็น Postgres LISTEN/NOTIFY หรือ Redis pub/sub (ตู้ที่ถือ poll กับตัวที่สร้างงานอาจคนละตัว)
 */
@Injectable()
export class JobHub {
  private readonly waiters = new Map<string, Set<() => void>>();

  /** ลงชื่อรอก่อนค้นงานในฐานข้อมูล — กันงานที่สร้างระหว่างค้นหลุดไป */
  listen(boxId: string): { woken: Promise<void>; cancel: () => void } {
    let wake!: () => void;
    const woken = new Promise<void>((resolve) => (wake = resolve));
    const set = this.waiters.get(boxId) ?? new Set();
    set.add(wake);
    this.waiters.set(boxId, set);
    const cancel = () => {
      set.delete(wake);
      if (!set.size && this.waiters.get(boxId) === set) this.waiters.delete(boxId);
    };
    return { woken: woken.then(cancel), cancel };
  }

  wake(boxId: string): void {
    for (const fn of this.waiters.get(boxId) ?? []) fn();
  }

  /** จำนวนตู้ที่กำลังถือ long-poll (ไว้ดูตอนทดสอบ) */
  get waiting(): number {
    return this.waiters.size;
  }
}
