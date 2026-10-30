import { HttpClient } from '@angular/common/http';
import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DisplaySettings } from './display-settings';
import { Session, type Me, type ServerPrefs } from './session';

const same = (a: ServerPrefs, b: Partial<ServerPrefs> | undefined) =>
  !!b && a.theme === b.theme && a.lang === b.lang && a.text_size === b.text_size && a.simple_home === b.simple_home && a.night_auto_dark === b.night_auto_dark;

/**
 * ภาษา/ธีม/ขนาดตัวอักษรเก็บกับบัญชี (PATCH /me) — server ใช้ `prefs.lang` แปลข้อความแจ้งเตือน
 * - ล็อกอิน/โหลดบัญชี → ใช้ค่าจากบัญชีกับเครื่องนี้ (ครั้งเดียวต่อบัญชีที่เข้ามา)
 * - เปลี่ยนค่าในแอป → ส่งไปบันทึก (รวมการเปลี่ยนที่เกิดถี่ ๆ ภายใน 0.6 วิ เป็นครั้งเดียว)
 */
@Injectable({ providedIn: 'root' })
export class PrefsSync {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly display = inject(DisplaySettings);
  private appliedFor: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const me = this.session.me();
      untracked(() => {
        if (!me) {
          this.appliedFor = null;
          return;
        }
        if (this.appliedFor !== me.id) {
          this.appliedFor = me.id;
          this.display.apply(me.prefs);
        }
      });
    });

    effect(() => {
      const snapshot = this.display.prefs();
      untracked(() => {
        const me = this.session.me();
        if (!me || this.appliedFor !== me.id || same(snapshot, me.prefs)) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.push(snapshot), 600);
      });
    });
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  private async push(prefs: ServerPrefs): Promise<void> {
    try {
      const me = await firstValueFrom(this.http.patch<Me>('/api/v1/me', { prefs }));
      // เก็บค่าที่ server ยืนยันไว้ใน Me (ไม่ apply ซ้ำ เพื่อไม่ให้ค่าเด้งกลับระหว่างที่ผู้ใช้กดต่อ)
      this.session.me.update((cur) => (cur ? { ...cur, prefs: me.prefs } : cur));
    } catch {
      // ออฟไลน์/ล้มเหลว — ใช้ค่าในเครื่องต่อ แล้วลองใหม่เมื่อค่าเปลี่ยนครั้งถัดไป
    }
  }
}
