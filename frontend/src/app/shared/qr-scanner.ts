import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  type OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import jsQR from 'jsqr';

export type ScannerFailure = 'denied' | 'unsupported' | 'error';

/** BarcodeDetector ของเบราว์เซอร์ (Chrome Android มี · Safari ยังไม่มี → ใช้ jsQR แทน) */
interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare const BarcodeDetector:
  | { new (opts: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> }
  | undefined;

/** ขอสิทธิ์กล้องแล้วหรือยัง (ไว้ข้ามหน้าอธิบาย O02-c ครั้งต่อไป) */
const ASKED_KEY = 'smmb.camera.asked';
export const cameraAsked = (): boolean => {
  try {
    return localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
};
export const markCameraAsked = (): void => {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    // ไม่มีที่เก็บ (private mode) — ถามใหม่ทุกครั้งก็ไม่เป็นไร
  }
};

/** สถานะสิทธิ์กล้อง (ถ้าเบราว์เซอร์บอกได้) */
export async function cameraPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const p = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return p.state;
  } catch {
    return 'unknown';
  }
}

/**
 * กล้องหลังของมือถือ + อ่าน QR อัตโนมัติ (ต้องเป็น HTTPS หรือ localhost)
 * - `scanned` ส่งข้อความใน QR + เวลาที่ใช้ตั้งแต่เปิดกล้องจนอ่านติด (ms → scan_ms ของ api.md §6.2)
 * - `failed`: denied = ไม่ให้สิทธิ์กล้อง · unsupported = เบราว์เซอร์ไม่มีกล้อง/ไม่ใช่ HTTPS
 */
@Component({
  selector: 'app-qr-scanner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <video #video playsinline muted autoplay aria-hidden="true"></video>
    <canvas #canvas hidden></canvas>
    <span class="frame" aria-hidden="true"><span class="line"></span></span>
    @if (torchSupported()) {
      <button type="button" class="torch" [attr.aria-pressed]="torch()" (click)="toggleTorch()">
        <ng-content select="[torch-label]" />
      </button>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      overflow: hidden;
      border-radius: var(--radius, 16px);
      background: #000;
      aspect-ratio: 1;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .frame {
      position: absolute;
      inset: 14%;
      border: 3px solid rgb(255 255 255 / 85%);
      border-radius: 18px;
      box-shadow: 0 0 0 999px rgb(0 0 0 / 35%);
    }
    .line {
      position: absolute;
      left: 8%;
      right: 8%;
      top: 50%;
      height: 2px;
      background: #ff3b3b;
      animation: sweep 1.8s ease-in-out infinite alternate;
    }
    @keyframes sweep {
      from {
        top: 12%;
      }
      to {
        top: 88%;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .line {
        animation: none;
      }
    }
    .torch {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      min-height: 44px;
      padding: 0 16px;
      border-radius: 22px;
      border: 0;
      background: rgb(0 0 0 / 55%);
      color: #fff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
  `,
})
export class QrScanner implements OnInit {
  readonly scanned = output<{ text: string; ms: number }>();
  readonly failed = output<ScannerFailure>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  protected readonly torchSupported = signal(false);
  protected readonly torch = signal(false);

  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private detector: Detector | null = null;
  private started = 0;
  private done = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  async ngOnInit(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.failed.emit('unsupported');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err) {
      markCameraAsked();
      const name = (err as DOMException).name;
      this.failed.emit(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'unsupported' : 'error');
      return;
    }
    markCameraAsked();
    if (this.done) return this.stop(); // ปิดหน้าไปก่อนกล้องเปิดเสร็จ
    const video = this.video().nativeElement;
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);
    const track = this.stream.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
    this.torchSupported.set(caps.torch === true);
    this.detector = await this.makeDetector();
    this.started = performance.now();
    this.loop();
  }

  protected async toggleTorch(): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    const on = !this.torch();
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      this.torch.set(on);
    } catch {
      this.torchSupported.set(false);
    }
  }

  private async makeDetector(): Promise<Detector | null> {
    try {
      if (typeof BarcodeDetector !== 'undefined' && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
        return new BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch {
      // ใช้ jsQR แทน
    }
    return null;
  }

  private loop(): void {
    if (this.done) return;
    this.timer = setTimeout(async () => {
      const text = await this.readFrame().catch(() => null);
      if (text && !this.done) {
        this.done = true;
        this.scanned.emit({ text, ms: Math.round(performance.now() - this.started) });
        this.stop();
        return;
      }
      this.loop();
    }, 150);
  }

  private async readFrame(): Promise<string | null> {
    const video = this.video().nativeElement;
    if (video.readyState < 2 || !video.videoWidth) return null;
    if (this.detector) {
      const found = await this.detector.detect(video);
      return found[0]?.rawValue || null;
    }
    // jsQR: ย่อภาพให้ด้านยาวไม่เกิน 640 พอ (เร็วขึ้นมาก อ่าน QR หน้าตู้ได้)
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    const canvas = this.canvas().nativeElement;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    return jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data || null;
  }

  private stop(): void {
    this.done = true;
    if (this.timer) clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
