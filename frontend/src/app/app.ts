import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { DisplaySettings } from './core/display-settings';
import { AppUpdate } from './core/app-update';
import { PrefsSync } from './core/prefs-sync';
import { PageTitle } from './core/page-title';
import { Session } from './core/session';
import { startFieldA11y } from './core/field-a11y';
import { installArrowNav } from './core/arrow-nav';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  // สร้างตั้งแต่เปิดแอป → ใส่ธีม/ขนาดตัวอักษร/ภาษาบน <html> ทันที
  private readonly display = inject(DisplaySettings);
  /** ซิงก์ภาษา/ธีมกับบัญชี (PATCH /me) */
  private readonly prefsSync = inject(PrefsSync);
  /** deploy ใหม่แล้วไฟล์เก่าค้าง cache → โหลดหน้าใหม่ให้เอง */
  private readonly appUpdate = inject(AppUpdate);
  /** ชื่อแท็บตามหน้าจอ + ภาษา */
  private readonly pageTitle = inject(PageTitle);

  constructor() {
    // แคนวาส ErrOffline: เน็ตหลุด → พาไปหน้าแจ้งไม่มีอินเทอร์เน็ต (ไม่เด้งกลับอัตโนมัติ ให้ผู้ใช้กดลองอีกครั้ง)
    const doc = inject(DOCUMENT);
    startFieldA11y(doc);
    const win = doc.defaultView;
    const router = inject(Router);
    const session = inject(Session);
    const AFTER_OFFLINE = 'smmb.after-offline';
    const onOffline = () => {
      if (!win || win.location.pathname.startsWith('/error/')) return;
      try {
        sessionStorage.setItem(AFTER_OFFLINE, win.location.pathname + win.location.search);
      } catch {
        /* storage ปิด — ยังพาไปหน้า error ได้ */
      }
      void router.navigateByUrl('/error/offline');
    };
    const onOnline = () => {
      if (!win?.location.pathname.startsWith('/error/offline')) return;
      let back = '/';
      try {
        back = sessionStorage.getItem(AFTER_OFFLINE) || '/';
        sessionStorage.removeItem(AFTER_OFFLINE);
      } catch {
        /* ใช้ '/' */
      }
      win.location.assign(back);
    };
    const onExpired = (e: Event) => {
      // 401 ตอนยังไม่เคยล็อกอิน (เช่น เช็ก /me ตอนเปิดแอป) ไม่ใช่ "session หมดอายุ" — ปล่อยให้ guard ของ route ตัดสิน
      // ไม่งั้นลิงก์ตรงของหน้าสาธารณะ (สมัคร · QR เปิดใช้ตู้ · /in/<บทบาท>) ถูกเด้งไปหน้าเข้าสู่ระบบและ ?next= หาย
      if (!session.me()) return;
      session.invalidate();
      const next = (e as CustomEvent<{ next?: string }>).detail?.next;
      void router.navigateByUrl(next ? `/auth/signin?next=${encodeURIComponent(next)}` : '/auth/signin', { replaceUrl: true });
    };
    // โหลดหน้า "ไม่มีอินเทอร์เน็ต" (พร้อมปุ่มโทร 191/1669) ล่วงหน้า — เน็ตหลุดแล้วโหลดชิ้นนี้ไม่ได้ จะเด้งไปหน้า error ของเบราว์เซอร์
    void import('./pages/error-screen').catch(() => undefined);
    const removeArrowNav = win?.document ? installArrowNav(win.document) : undefined;
    win?.addEventListener('offline', onOffline);
    win?.addEventListener('online', onOnline);
    win?.addEventListener('smmb:session-expired', onExpired);
    inject(DestroyRef).onDestroy(() => {
      removeArrowNav?.();
      win?.removeEventListener('offline', onOffline);
      win?.removeEventListener('online', onOnline);
      win?.removeEventListener('smmb:session-expired', onExpired);
    });
  }
}
