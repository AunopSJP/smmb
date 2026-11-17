import { inject, Injectable, signal } from '@angular/core';
import { apiError } from './api';
import { InspectionApi } from './inspection-api';
import { Toast } from './toast';

/**
 * ปุ่ม "นำทาง" ของเจ้าหน้าที่ — ขอพิกัดบ้านจาก server ตอนกดเท่านั้น แล้วเปิดแอปแผนที่ของเครื่อง
 * (server ให้เฉพาะตู้ในโซนของตัวเอง + ในเวลาตรวจ และบันทึกการเปิดดู — api.md §6.1)
 * ไม่เก็บพิกัดไว้ในแอป: ปิดแล้วต้องขอใหม่ทุกครั้ง
 */
@Injectable({ providedIn: 'root' })
export class HouseNav {
  private readonly api = inject(InspectionApi);
  private readonly toast = inject(Toast);
  /** กำลังขอพิกัดของตู้ไหนอยู่ (ไว้ปิดปุ่มกันกดซ้ำ) */
  readonly busy = signal<string | null>(null);

  /** เปิดเส้นทางไปบ้านของตู้นี้ในแอปแผนที่ */
  async open(boxId: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(boxId);
    // เปิดแท็บตั้งแต่ตอนนิ้วแตะ — ถ้ารอคำตอบก่อนค่อยเปิด เบราว์เซอร์ (โดยเฉพาะ Safari) จะบล็อกเป็น popup
    const tab = window.open('', '_blank');
    try {
      const p = await this.api.location(boxId);
      const url = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err) {
      tab?.close();
      // ตัดสินจาก code/สถานะเท่านั้น (กฎข้อ 10)
      const e = apiError(err);
      this.toast.show(
        e.code === 'OUTSIDE_PATROL_WINDOW'
          ? { th: 'นำทางได้เฉพาะในเวลาตรวจ', en: 'Directions are available during patrol hours only' }
          : e.status === 404
            ? { th: 'บ้านนี้ไม่มีหมุดตำแหน่งให้นำทาง', en: 'This house has no location pin' }
            : { th: 'เปิดเส้นทางไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t open directions — try again' },
      );
    } finally {
      this.busy.set(null);
    }
  }
}
