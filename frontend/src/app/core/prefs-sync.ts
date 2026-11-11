import { HttpClient } from '@angular/common/http';
import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DisplaySettings } from './display-settings';
import { Session, type Me, type ServerPrefs } from './session';
import { Toast } from './toast';

const sameList = (a: string[], b: string[] | undefined) => !!b && a.length === b.length && a.every((x) => b.includes(x));

const same = (a: ServerPrefs, b: Partial<ServerPrefs> | undefined) =>
  !!b && a.theme === b.theme && a.lang === b.lang && a.text_size === b.text_size && a.simple_home === b.simple_home && a.night_auto_dark === b.night_auto_dark &&
  a.easy_mode === b.easy_mode && a.ui_mode === b.ui_mode &&
  sameList(a.muted_types, b.muted_types);

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
  private readonly toast = inject(Toast);
  private appliedFor: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: ServerPrefs | null = null;
  private retryBound = false;

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
      this.pending = null;
      this.retryBound = false;
    } catch {
      // ออฟไลน์/ล้มเหลว — เก็บค่าไว้ในเครื่อง + แจ้งผู้ใช้ และลองใหม่เมื่อกลับมาออนไลน์
      this.pending = prefs;
      this.toast.error({
        th: 'บันทึกการตั้งค่าไม่สำเร็จ — ระบบจะลองใหม่เมื่อกลับมาออนไลน์',
        en: 'Could not save the setting — it will retry when you are back online',
      });
      if (!this.retryBound && typeof window !== 'undefined') {
        this.retryBound = true;
        window.addEventListener('online', () => {
          this.retryBound = false;
          if (this.pending) void this.push(this.pending);
        }, { once: true });
      }
    }
  }
}
