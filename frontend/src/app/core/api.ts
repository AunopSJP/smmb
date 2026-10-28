import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { screenUrl } from '../screens/registry';

/**
 * ค่าที่ตั้งตอนรัน (ไม่ต้อง build ใหม่) — ไฟล์ `config.json` ข้าง index.html
 * - `apiBase`: path นำหน้า API เมื่อ API ไม่ได้อยู่ที่ `/api` ของโดเมนเดียวกัน เช่น `/smmb-api`
 *   (ห้ามฮาร์ดโค้ดโดเมน — CLAUDE.md กฎข้อ 8 · ใส่เป็น path ของโดเมนเดียวกันเท่านั้น cookie `sid` จึงไปด้วย)
 */
@Injectable({ providedIn: 'root' })
export class ApiConfig {
  readonly apiBase = signal('');
  /** เครื่องมือทดสอบ (เช่น ปุ่มคัดลอกข้อความ QR ประจำตัวให้ตู้จำลอง) — เปิดเฉพาะเครื่อง dev / ทดสอบ */
  readonly devTools = signal(false);

  async load(): Promise<void> {
    try {
      const res = await fetch('config.json', { cache: 'no-store' });
      if (!res.ok) return;
      const cfg = (await res.json()) as { apiBase?: unknown; devTools?: unknown };
      this.devTools.set(cfg.devTools === true);
      if (typeof cfg.apiBase === 'string') this.apiBase.set(cfg.apiBase.replace(/\/+$/, ''));
    } catch {
      // ไม่มีไฟล์ = API อยู่ /api ของโดเมนเดียวกัน (dev ใช้ proxy.conf.json)
    }
  }
}

/**
 * ใส่ apiBase หน้า `/api/...` + ส่ง cookie (`sid`) ไปด้วยทุกคำขอ
 * 403 PUSH_REQUIRED (เจ้าหน้าที่/หัวหน้ายังไม่เปิดแจ้งเตือน) → หน้า A12 ที่เดียว ไม่ต้องให้ทุกหน้าจัดการเอง
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const router = inject(Router);
  return next(req.clone({ url: inject(ApiConfig).apiBase() + req.url, withCredentials: true })).pipe(
    tap({
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 403 && (err.error as { code?: string } | null)?.code === 'PUSH_REQUIRED') {
          void router.navigateByUrl(screenUrl('A12'));
        }
      },
    }),
  );
};

/** error จาก API (api.md §0) — ตัดสินจาก `code` เท่านั้น ห้ามดู message (กฎข้อ 10) */
export interface ApiError {
  status: number;
  code: string | null;
  /** ฟิลด์เพิ่มที่ server ส่งมา เช่น next_window */
  body: Record<string, unknown>;
}

export function apiError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    const body = (err.error && typeof err.error === 'object' ? err.error : {}) as Record<string, unknown>;
    return { status: err.status, code: typeof body['code'] === 'string' ? body['code'] : null, body };
  }
  return { status: 0, code: null, body: {} };
}

/** เน็ตหลุด / server ไม่ตอบ (status 0) */
export const isOffline = (e: ApiError) => e.status === 0;
