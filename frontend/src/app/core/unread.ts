import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Session } from './session';

const EVERY_MS = 60_000;

/**
 * จำนวนแจ้งเตือนที่ยังไม่อ่าน (จุดแดงบนกระดิ่ง) — ถามเซิร์ฟเวอร์ตอนล็อกอินแล้วทุก 1 นาที · อ่านแล้วเรียก refresh() ให้ตัวเลขลดทันที
 * GET /me/notifications?unread=true&per_page=1 → ใช้ `total`
 */
@Injectable({ providedIn: 'root' })
export class UnreadCount {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  readonly count = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const me = this.session.me();
      untracked(() => {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.count.set(0);
        if (!me) return;
        void this.refresh();
        this.timer = setInterval(() => void this.refresh(), EVERY_MS);
      });
    });
  }

  async refresh(): Promise<void> {
    if (!this.session.me()) return;
    try {
      const r = await firstValueFrom(this.http.get<{ total: number }>('/api/v1/me/notifications?unread=true&per_page=1'));
      this.count.set(r.total ?? 0);
    } catch {
      // ถามไม่ได้ครั้งนี้ — คงตัวเลขเดิมไว้
    }
  }
}
