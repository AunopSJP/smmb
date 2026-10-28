import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import QRCode from 'qrcode';

/**
 * รูป QR จริงจากข้อความ (สร้างในเครื่อง ไม่ส่งข้อความไปที่อื่น)
 * - QR ประจำตัวเจ้าหน้าที่ให้กล้องตู้อ่าน: ใหญ่ ขาวดำชัด ขอบขาวพอ
 * - ใบพิมพ์ QR หน้าตู้: ระดับแก้ข้อผิดพลาด H (✅ design §5.1)
 */
@Component({
  selector: 'app-qr-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src(); as s) {
      <img [src]="s" [alt]="label()" width="100%" />
    } @else {
      <span class="blank" [attr.aria-label]="label()"></span>
    }
  `,
  styles: `
    :host {
      display: block;
      aspect-ratio: 1;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }
    .blank {
      display: block;
      width: 100%;
      height: 100%;
      background: #f2f2f2;
    }
  `,
})
export class QrImage {
  readonly text = input.required<string>();
  readonly label = input('QR');
  readonly level = input<'L' | 'M' | 'Q' | 'H'>('M');
  protected readonly src = signal<string | null>(null);

  constructor() {
    effect(() => {
      const text = this.text();
      const level = this.level();
      if (!text) {
        this.src.set(null);
        return;
      }
      QRCode.toDataURL(text, { errorCorrectionLevel: level, margin: 2, width: 512, color: { dark: '#000000', light: '#ffffff' } })
        .then((url) => this.src.set(url))
        .catch(() => this.src.set(null));
    });
  }
}
