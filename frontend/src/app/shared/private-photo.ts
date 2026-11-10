import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { I18n } from '../core/i18n';

/**
 * รูปที่ต้องล็อกอินถึงจะดูได้ (เช่น รูปยืนยันตัวเจ้าหน้าที่) — โหลดผ่าน HttpClient (ส่ง cookie) แล้วแสดงด้วย object URL
 * ไม่ใช้ <img src> ตรง ๆ เพราะ apiBase อาจอยู่คนละ path และต้องไม่ให้เบราว์เซอร์แคช
 */
@Component({
  selector: 'app-private-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url(); as u) {
      <img [src]="u" [alt]="alt()" />
    } @else if (failed()) {
      <p class="muted small">{{ i18n.t({ th: 'ไม่มีรูป หรือรูปถูกลบแล้ว (เก็บ 30 วัน)', en: 'No photo, or it was deleted (kept 30 days)' }) }}</p>
    } @else {
      <p class="muted small">{{ i18n.t({ th: 'กำลังโหลดรูป…', en: 'Loading photo…' }) }}</p>
    }
  `,
  styles: `
    img {
      display: block;
      inline-size: 100%;
      max-inline-size: 520px;
      max-block-size: 420px;
      aspect-ratio: 4 / 3;
      object-fit: contain;
      background: var(--icon-bg);
      border-radius: var(--radius-sm);
      margin-inline: auto;
    }
  `,
})
export class PrivatePhoto {
  protected readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  readonly src = input.required<string>();
  readonly alt = input('');
  protected readonly url = signal<string | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const src = this.src();
      untracked(() => void this.load(src));
    });
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  private async load(src: string): Promise<void> {
    this.revoke();
    this.failed.set(false);
    try {
      const blob = await firstValueFrom(this.http.get(src, { responseType: 'blob' }));
      this.url.set(URL.createObjectURL(blob));
    } catch {
      this.failed.set(true);
    }
  }

  private revoke(): void {
    const u = this.url();
    if (u) URL.revokeObjectURL(u);
    this.url.set(null);
  }
}
