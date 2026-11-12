import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiError } from './api';
import { availabilityFromStatus, type Availability, type DeletePreview } from './my-data-rules';

export interface MySession {
  id: string;
  device_label: string;
  last_used_at: string;
  created_at: string;
  current: boolean;
  ip_hint?: string | null;
}

/**
 * "ข้อมูลของฉัน" — เครื่องที่ล็อกอิน · ส่งออกข้อมูล · ลบบัญชี
 * สัญญา = ข้อเสนอ F-002 (docs/agent-sync/to-backend.md) · **ยังไม่มีใน backend** — ถ้า route ตอบ 404 หน้าและลิงก์จะไม่แสดง (ไม่มีข้อมูลปลอม)
 * endpoint ที่ฝั่งเว็บเรียก: GET /me/sessions · DELETE /me/sessions/:id · POST /me/sessions/revoke-others · POST /me/export · GET /me/delete-preview · DELETE /me
 */
@Injectable({ providedIn: 'root' })
export class MyDataApi {
  private readonly http = inject(HttpClient);
  /** ตรวจครั้งเดียวต่อการเปิดแอป (จากหน้าตั้งค่า) — ซ่อนลิงก์จนกว่าจะรู้ว่า backend พร้อม */
  readonly availability = signal<Availability>('unknown');
  private probing: Promise<void> | null = null;

  probe(): Promise<void> {
    if (this.availability() !== 'unknown') return Promise.resolve();
    this.probing ??= firstValueFrom(this.http.get('/api/v1/me/sessions'))
      .then(() => this.availability.set('yes'))
      .catch((err: unknown) => this.availability.set(availabilityFromStatus(err instanceof HttpErrorResponse ? err.status : null)))
      .finally(() => (this.probing = null));
    return this.probing;
  }

  async sessions(): Promise<MySession[]> {
    const r = await firstValueFrom(this.http.get<{ items: MySession[] }>('/api/v1/me/sessions'));
    return r.items;
  }

  revoke(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/v1/me/sessions/${encodeURIComponent(id)}`));
  }

  revokeOthers(): Promise<{ revoked: number }> {
    return firstValueFrom(this.http.post<{ revoked: number }>('/api/v1/me/sessions/revoke-others', {}));
  }

  /** ตอบได้ 2 แบบ (backend เลือก): ลิงก์ใช้ครั้งเดียว `{ url, expires_at }` หรือเนื้อไฟล์ JSON ตรง ๆ */
  async exportData(): Promise<{ url: string; expires_at?: string } | { text: string }> {
    const text = await firstValueFrom(this.http.post('/api/v1/me/export', {}, { responseType: 'text' }));
    try {
      const j = JSON.parse(text) as { url?: unknown; expires_at?: unknown };
      if (j && typeof j.url === 'string') return { url: j.url, expires_at: typeof j.expires_at === 'string' ? j.expires_at : undefined };
    } catch {
      // ไม่ใช่ JSON ก็ถือเป็นเนื้อไฟล์
    }
    return { text };
  }

  deletePreview(): Promise<DeletePreview> {
    return firstValueFrom(this.http.get<DeletePreview>('/api/v1/me/delete-preview'));
  }

  deleteAccount(password: string): Promise<unknown> {
    return firstValueFrom(this.http.delete('/api/v1/me', { body: { password, confirm: 'DELETE' } }));
  }

  errorOf(err: unknown): { code: string | null; status: number } {
    const e = apiError(err);
    return { code: e.code ?? null, status: e.status ?? 0 };
  }
}
