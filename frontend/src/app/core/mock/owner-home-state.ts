import { computed, Injectable, signal } from '@angular/core';

/**
 * สถานะของหน้าหลักเจ้าของบ้านใน wireframe
 * - normal  H03   ปกติ
 * - new     H03-b ผู้ใช้ใหม่: ยังไม่เปิดแจ้งเตือน + บ้านยังไม่อยู่ในโซนใด + ยังไม่มีเหตุการณ์
 * - offline H03-c ตู้ไม่ออนไลน์ในเวลาตรวจ
 * - todo    H03-d มีงานต้องทำ: QR หน้าตู้ชำรุด + แบตต่ำ
 * ตอนต่อ API จริง ค่าพวกนี้มาจาก `GET /boxes/:id` (`warnings`, `online_state`, `tasks`) — api.md §4.2
 */
export type HomeState = 'normal' | 'new' | 'offline' | 'todo';

export const HOME_STATES: { v: HomeState; code: string; th: string; en: string }[] = [
  { v: 'normal', code: 'H03', th: 'ปกติ', en: 'Normal' },
  { v: 'new', code: 'H03-b', th: 'ผู้ใช้ใหม่', en: 'New user' },
  { v: 'offline', code: 'H03-c', th: 'ตู้ออฟไลน์', en: 'Offline' },
  { v: 'todo', code: 'H03-d', th: 'มีงานต้องทำ', en: 'To-do' },
];

@Injectable({ providedIn: 'root' })
export class OwnerHomeState {
  readonly state = signal<HomeState>('normal');

  /** ผู้ใช้กด "เปิดแจ้งเตือน" แล้ว (จำลอง) */
  readonly pushOn = signal(false);
  /** ผู้ใช้กด "ติดแล้ว" หลังเอา QR สำรองไปติด (จำลอง) */
  readonly qrSwapped = signal(false);

  readonly showPushBanner = computed(() => this.state() === 'new' && !this.pushOn());
  readonly noOfficer = computed(() => this.state() === 'new');
  readonly offline = computed(() => this.state() === 'offline');
  readonly qrTask = computed(() => this.state() === 'todo' && !this.qrSwapped());
  readonly lowBattery = computed(() => this.state() === 'todo');
  readonly noEvents = computed(() => this.state() === 'new');
  readonly taskCount = computed(() => (this.qrTask() ? 1 : 0) + (this.lowBattery() ? 1 : 0));

  set(state: HomeState): void {
    this.state.set(state);
    // เริ่มสถานะใหม่ = งานที่กดไปแล้วกลับมาให้ดูอีกครั้ง
    this.pushOn.set(false);
    this.qrSwapped.set(false);
  }
}
