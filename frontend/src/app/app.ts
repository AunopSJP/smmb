import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { DisplaySettings } from './core/display-settings';
import { AppUpdate } from './core/app-update';
import { PrefsSync } from './core/prefs-sync';
import { PageTitle } from './core/page-title';

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
    const win = inject(DOCUMENT).defaultView;
    const router = inject(Router);
    const onOffline = () => {
      if (!win?.location.pathname.startsWith('/error/')) void router.navigateByUrl('/error/offline');
    };
    win?.addEventListener('offline', onOffline);
    inject(DestroyRef).onDestroy(() => win?.removeEventListener('offline', onOffline));
  }
}
