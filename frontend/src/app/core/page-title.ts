import { effect, inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { I18n } from './i18n';
import { screen } from '../screens/registry';

/**
 * ตั้งชื่อแท็บ/ชื่อแอปตามหน้าจอ + ภาษาที่เลือก (routes เก็บชื่อไทยไว้เป็นค่าเริ่มต้น)
 * — เปลี่ยนภาษาแล้วชื่อหน้าอัปเดตทันที ไม่ค้างเป็นไทยอย่างเดียว
 */
@Injectable({ providedIn: 'root' })
export class PageTitle {
  private readonly title = inject(Title);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly code = signal<string | null>(null);

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(() => {
      this.code.set(this.deepestCode() ?? null);
    });
    this.code.set(this.deepestCode() ?? null);

    effect(() => {
      const code = this.code();
      if (!code) return;
      try {
        // i18n.t อ่าน signal ภาษา → เปลี่ยนภาษาแล้วชื่อเรื่องอัปเดตตาม
        this.title.setTitle(`${this.i18n.t(screen(code).title)} · Smart Mailbox`);
      } catch {
        // หน้าไม่มีรหัสใน registry (เช่น หน้า error) — ใช้ชื่อเดิมที่ route ตั้งไว้
      }
    });
  }

  private deepestCode(): string | undefined {
    let r = this.route.snapshot;
    while (r.firstChild) r = r.firstChild;
    return r.data['code'] as string | undefined;
  }
}
