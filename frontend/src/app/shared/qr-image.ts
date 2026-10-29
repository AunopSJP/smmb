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
  /**
   * โลโก้กลาง QR (URL ของรูป) — ใช้เฉพาะ QR ที่พิมพ์ติดตู้ (ระดับ H) · ห้ามใช้กับ QR ประจำตัวเจ้าหน้าที่ที่กล้องตู้อ่าน
   * เป็นแค่ตัวช่วยให้คนจำได้ ไม่ใช่ความปลอดภัย (ความปลอดภัยคือลายเซ็นใน QR ที่เซิร์ฟเวอร์ตรวจ)
   */
  readonly logo = input<string | null>(null);
  protected readonly src = signal<string | null>(null);

  constructor() {
    effect(() => {
      const text = this.text();
      const logo = this.logo();
      // โลโก้บัง QR ได้ไม่เกินที่ระดับแก้ผิดพลาดรับไหว — มีโลโก้ต้องเป็น H เสมอ
      const level = logo ? 'H' : this.level();
      if (!text) {
        this.src.set(null);
        return;
      }
      QRCode.toDataURL(text, { errorCorrectionLevel: level, margin: 2, width: 512, color: { dark: '#000000', light: '#ffffff' } })
        .then((url) => (logo ? withLogo(url, logo) : url))
        .then((url) => this.src.set(url))
        .catch(() => this.src.set(null));
    });
  }
}

/** ความกว้างโลโก้เทียบกับ QR ทั้งใบ (พื้นที่ ≈ 4.6%) — ต่ำกว่าที่ระดับ H กู้ได้ (~30%) มาก เผื่อภาพพิมพ์เสียหาย */
const LOGO_RATIO = 0.215;

/** วาดโลโก้กลาง QR (มีพื้นขาวรองกันสับสนกับจุด QR) — โหลดโลโก้ไม่ได้ก็คืน QR เปล่า (สแกนได้เหมือนเดิม) */
function withLogo(qrUrl: string, logoUrl: string): Promise<string> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((ok, fail) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => fail(new Error('image'));
      img.src = src;
    });
  return Promise.all([load(qrUrl), load(logoUrl)])
    .then(([qr, logo]) => {
      const canvas = document.createElement('canvas');
      canvas.width = qr.width;
      canvas.height = qr.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return qrUrl;
      ctx.drawImage(qr, 0, 0);
      const size = Math.round(qr.width * LOGO_RATIO);
      const pad = Math.round(size * 0.12);
      const x = Math.round((qr.width - size) / 2);
      const y = Math.round((qr.height - size) / 2);
      const radius = Math.round(size * 0.22);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, size + pad * 2, size + pad * 2, radius);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, radius * 0.8);
      ctx.clip();
      ctx.drawImage(logo, x, y, size, size);
      ctx.restore();
      return canvas.toDataURL('image/png');
    })
    .catch(() => qrUrl);
}
