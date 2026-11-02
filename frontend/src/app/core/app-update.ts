import { DOCUMENT, Location } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationError, NavigationStart, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

const RELOAD_KEY = 'smmb.chunk-reload';

/**
 * หลัง deploy เวอร์ชันใหม่ เบราว์เซอร์อาจถือไฟล์เก่าไว้ → หน้าที่โหลดทีหลัง (lazy chunk) หาไฟล์ไม่เจอ
 * แล้วการเปลี่ยนหน้าล้มเงียบ ๆ (เช่น ล็อกอินแล้วไม่ไปไหน)
 * - service worker เจอเวอร์ชันใหม่ → รอจนผู้ใช้เปลี่ยนหน้าครั้งถัดไป แล้วโหลดเต็มหน้าไปที่ปลายทางนั้นเลย (ไม่ทิ้งฟอร์มที่กำลังกรอก)
 * - เปลี่ยนหน้าล้มเพราะโหลดไฟล์ไม่ได้ → โหลดเต็มหน้าไปปลายทางเดิม 1 ครั้ง (กันวนไม่รู้จบด้วย sessionStorage)
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly doc = inject(DOCUMENT);
  private readonly sw = inject(SwUpdate, { optional: true });
  private newVersion = false;

  constructor() {
    this.sw?.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') this.newVersion = true;
    });
    this.sw?.unrecoverable.subscribe(() => this.reload(this.location.path(true) || '/'));
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart && this.newVersion) {
        this.reload(e.url);
      } else if (e instanceof NavigationError && this.isChunkError(e.error) && !this.alreadyTried()) {
        this.reload(e.url);
      }
    });
  }

  private isChunkError(err: unknown): boolean {
    const msg = String((err as { message?: string } | null)?.message ?? err);
    return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(msg);
  }

  private alreadyTried(): boolean {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      return Date.now() - last < 30_000;
    } catch {
      return false;
    }
  }

  private reload(url: string): void {
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      /* ไม่มี storage ก็ข้าม */
    }
    // โหลดเต็มหน้า (ได้ index.html + ไฟล์ชุดใหม่) ไปปลายทางเดิม
    this.doc.location.assign(this.location.prepareExternalUrl(url));
  }
}
