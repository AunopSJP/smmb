import { effect, inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { I18n, type Tr } from './i18n';
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
  private readonly titleTr = signal<Tr | null>(null);

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(() => {
      this.titleTr.set(this.resolveTitle());
    });
    this.titleTr.set(this.resolveTitle());

    effect(() => {
      const tr = this.titleTr();
      if (tr) this.title.setTitle(`${this.i18n.t(tr)} · Smart Mailbox`);
    });
  }

  private resolveTitle(): Tr | null {
    const code = this.deepestCode();
    if (code) {
      try {
        return screen(code).title;
      } catch {
        return null;
      }
    }
    // หน้า error/settings ที่ไม่มีรหัสใน registry — route ใส่ titleTr ไว้
    let r = this.route.snapshot;
    while (r.firstChild) r = r.firstChild;
    return (r.data['titleTr'] as Tr | undefined) ?? null;
  }

  private deepestCode(): string | undefined {
    let r = this.route.snapshot;
    while (r.firstChild) r = r.firstChild;
    return r.data['code'] as string | undefined;
  }
}
