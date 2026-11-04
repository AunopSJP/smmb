import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiError } from '../core/api';
import { I18n, type Tr } from '../core/i18n';
import { Icon } from './icon';

type State = 'idle' | 'live' | 'uploading' | 'done' | 'error';

const ERRORS: Record<string, Tr> = {
  camera: { th: 'เปิดกล้องหน้าไม่ได้ — อนุญาตกล้องในเบราว์เซอร์แล้วลองอีกครั้ง', en: 'Could not open the front camera — allow camera access and try again' },
  PHOTO_WINDOW_CLOSED: { th: 'เลยเวลาถ่ายรูปแล้ว (ต้องถ่ายภายใน 15 นาทีหลังตรวจผ่าน)', en: 'Too late — the photo must be taken within 15 minutes of passing' },
  PHOTO_TOO_LARGE: { th: 'รูปใหญ่เกินไป โปรดลองอีกครั้ง', en: 'Photo too large — try again' },
  default: { th: 'ส่งรูปไม่สำเร็จ โปรดลองอีกครั้ง', en: 'Could not send the photo — try again' },
};

/**
 * Snapface — เจ้าหน้าที่ถ่ายรูปตัวเองด้วยกล้องหน้าหลังตรวจผ่าน (api.md §6.4 · ✅ 2026-11-04)
 * ย่อเหลือกว้าง 480 px JPEG ก่อนส่ง (~30–60 KB) · ส่งได้ครั้งเดียว · เจ้าของบ้าน/แอดมินเห็น เก็บ 30 วัน
 */
@Component({
  selector: 'app-selfie-capture',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="selfie" [class.ok]="state() === 'done'">
      @switch (state()) {
        @case ('done') {
          <p class="row-msg"><app-icon name="check" [size]="20" />{{ i18n.t({ th: 'ส่งรูปยืนยันตัวแล้ว', en: 'Confirmation photo sent' }) }}</p>
        }
        @case ('live') {
          <video #video playsinline muted autoplay></video>
          <button type="button" class="btn" (click)="capture()">{{ i18n.t({ th: 'ถ่ายรูป', en: 'Take photo' }) }}</button>
        }
        @case ('uploading') {
          <p class="row-msg">{{ i18n.t({ th: 'กำลังส่งรูป…', en: 'Sending…' }) }}</p>
        }
        @default {
          <strong>{{ i18n.t({ th: 'ถ่ายรูปยืนยันตัว', en: 'Take a confirmation photo' }) }}</strong>
          <span class="small">{{ i18n.t({ th: 'ถ่ายหน้าตัวเองให้เห็นชัด · เจ้าของบ้านจะเห็นรูปนี้ (เก็บ 30 วัน)', en: 'Take a clear photo of your face · the homeowner will see it (kept 30 days)' }) }}</span>
          @if (state() === 'error' && error(); as e) {
            <p class="err" role="alert">{{ i18n.t(e) }}</p>
          }
          <button type="button" class="btn" (click)="open()">
            <app-icon name="user" [size]="20" />{{ i18n.t({ th: 'เปิดกล้องหน้า', en: 'Open front camera' }) }}
          </button>
        }
      }
    </section>
  `,
  styles: `
    .selfie {
      display: grid;
      gap: 10px;
      padding: 14px;
      border-radius: var(--radius-sm);
      background: rgb(255 255 255 / 15%);
    }
    .selfie.ok {
      background: rgb(255 255 255 / 22%);
    }
    video {
      inline-size: 100%;
      max-block-size: 50vh;
      border-radius: var(--radius-sm);
      transform: scaleX(-1);
      background: #000;
      object-fit: cover;
    }
    .row-msg {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
    }
    .err {
      font-weight: 700;
    }
  `,
})
export class SelfieCapture {
  protected readonly i18n = inject(I18n);
  private readonly http = inject(HttpClient);
  /** inspection id */
  readonly inspectionId = input.required<string>();
  readonly done = output<void>();
  protected readonly state = signal<State>('idle');
  protected readonly error = signal<Tr | null>(null);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected async open(): Promise<void> {
    this.error.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
      this.state.set('live');
      setTimeout(() => {
        const v = this.video()?.nativeElement;
        if (v && this.stream) v.srcObject = this.stream;
      });
    } catch {
      this.fail('camera');
    }
  }

  protected async capture(): Promise<void> {
    const v = this.video()?.nativeElement;
    if (!v || !v.videoWidth) return;
    const w = Math.min(480, v.videoWidth);
    const h = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(v, 0, 0, w, h);
    this.stop();
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.75));
    if (!blob) return this.fail('default');
    this.state.set('uploading');
    try {
      await firstValueFrom(
        this.http.post(`/api/v1/inspections/${encodeURIComponent(this.inspectionId())}/photo`, blob, { headers: { 'Content-Type': 'image/jpeg' } }),
      );
      this.finish();
    } catch (err) {
      const { code } = apiError(err);
      if (code === 'PHOTO_EXISTS') return this.finish();
      this.fail(code && ERRORS[code] ? code : 'default');
    }
  }

  private finish(): void {
    this.state.set('done');
    this.done.emit();
  }

  private fail(key: string): void {
    this.stop();
    this.error.set(ERRORS[key] ?? ERRORS['default']);
    this.state.set('error');
  }

  private stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
