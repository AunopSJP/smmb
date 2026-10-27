import { computed, Injectable, signal } from '@angular/core';

/** หน้าสรุปเจ้าหน้าที่ใน wireframe: O01 ปกติ · O01-b SOS เข้า · O01-c กำลังดูแล SOS · O01-d นอกเวลาตรวจ · O01-e ตรวจครบแล้ว */
export type OfficerHomeState = 'normal' | 'sos_incoming' | 'handling' | 'off_hours' | 'all_done';

export const OFFICER_HOME_STATES: { v: OfficerHomeState; code: string; th: string; en: string }[] = [
  { v: 'normal', code: 'O01', th: 'ปกติ', en: 'Normal' },
  { v: 'sos_incoming', code: 'O01-b', th: 'SOS เข้า', en: 'SOS in' },
  { v: 'handling', code: 'O01-c', th: 'กำลังดูแล', en: 'Handling' },
  { v: 'off_hours', code: 'O01-d', th: 'นอกเวลา', en: 'Off hours' },
  { v: 'all_done', code: 'O01-e', th: 'ครบแล้ว', en: 'All done' },
];

export interface ZoneHouse {
  house_no: string;
  checked_at: string | null;
}

/** SOS ที่เข้ามา: ใหม่ → รับแล้ว (โดยเรา) / คนอื่นรับ / เจ้าของยกเลิก → ปิด */
export type OfficerSosStatus = 'none' | 'incoming' | 'handling' | 'taken' | 'cancelled' | 'closed';

export type CameraPermission = 'unknown' | 'granted' | 'denied';

/**
 * สถานะจำลองของเจ้าหน้าที่ — ตอนต่อ API จริงมาจาก
 * `GET /inspections/summary` (api.md §6.1), `POST /inspections` + poll (§6.2–6.3), `GET /sos/*` (§7.2)
 */
@Injectable({ providedIn: 'root' })
export class OfficerDemo {
  readonly state = signal<OfficerHomeState>('normal');

  readonly houses = signal<ZoneHouse[]>([
    { house_no: '99/9', checked_at: null },
    { house_no: '99/10', checked_at: null },
    { house_no: '99/8', checked_at: null },
    { house_no: '99/7', checked_at: '18:42' },
    { house_no: '99/6', checked_at: '18:30' },
  ]);
  /** บ้านทั้งหมดในโซน (มีมากกว่าที่แสดงในรายการตัวอย่าง) */
  readonly zoneTotal = 10;
  private readonly checkedOutsideList = 3;

  readonly checked = computed(
    () => this.houses().filter((h) => h.checked_at !== null).length + this.checkedOutsideList,
  );
  readonly nextHouse = computed(() => this.houses().find((h) => h.checked_at === null)?.house_no ?? null);

  /** บ้านที่กำลังตรวจ (หลังสแกน QR หน้าตู้) */
  readonly inspecting = signal('99/9');
  /** ครั้งที่ลองยื่น QR ประจำตัว (1..3) */
  readonly attempt = signal(1);
  readonly camera = signal<CameraPermission>('unknown');

  readonly sos = signal<OfficerSosStatus>('none');
  readonly sosAcceptedAt = signal<string | null>(null);

  /** จำนวนบนแท็บ SOS — SOS ที่ยังต้องสนใจ */
  readonly sosBadge = computed(() => (this.sos() === 'incoming' || this.sos() === 'handling' ? 1 : 0));

  setState(s: OfficerHomeState): void {
    this.state.set(s);
    this.sos.set(s === 'sos_incoming' ? 'incoming' : s === 'handling' ? 'handling' : 'none');
    if (s === 'handling') this.sosAcceptedAt.set('22:16');
  }

  startInspection(house: string): void {
    this.inspecting.set(house);
    this.attempt.set(1);
  }

  markChecked(house: string, time: string): void {
    this.houses.update((list) => list.map((h) => (h.house_no === house ? { ...h, checked_at: time } : h)));
  }

  acceptSos(): void {
    this.sos.set('handling');
    this.sosAcceptedAt.set(nowHHmm());
    this.state.set('handling');
  }

  closeSos(): void {
    this.sos.set('closed');
    this.state.set('normal');
  }
}

export function nowHHmm(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}
