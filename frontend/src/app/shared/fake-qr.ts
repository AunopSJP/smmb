import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const N = 25; // ขนาดตาราง

/**
 * รูปที่หน้าตาเหมือน QR สำหรับต้นแบบ (สแกนไม่ได้จริง) — seed เปลี่ยน = ลายเปลี่ยน
 * ของจริง: server สร้าง `SMMB-O2.<j>.<u>.<e>.<sig>` แล้วแอปวาดเป็น QR (api.md §6.3)
 */
@Component({
  selector: 'app-fake-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'-2 -2 ' + (size + 4) + ' ' + (size + 4)" role="img" [attr.aria-label]="label()">
      <rect x="-2" y="-2" [attr.width]="size + 4" [attr.height]="size + 4" fill="#fff" />
      <path [attr.d]="path()" fill="#111827" />
    </svg>
  `,
  styles: `
    svg {
      display: block;
      width: 100%;
      height: auto;
      shape-rendering: crispEdges;
    }
  `,
})
export class FakeQr {
  readonly seed = input(1);
  readonly label = input('QR');
  protected readonly size = N;

  protected readonly path = computed(() => {
    let x = (this.seed() * 2654435761) >>> 0;
    const rand = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
    const finder = (r: number, c: number) => {
      const inBox = (or: number, oc: number) => r >= or && r < or + 7 && c >= oc && c < oc + 7;
      for (const [or, oc] of [
        [0, 0],
        [0, N - 7],
        [N - 7, 0],
      ]) {
        if (inBox(or, oc)) {
          const rr = r - or;
          const cc = c - oc;
          const ring = rr === 0 || rr === 6 || cc === 0 || cc === 6;
          const core = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
          return ring || core ? 1 : 0;
        }
        // ช่องว่างรอบ finder
        if (r >= or - 1 && r <= or + 7 && c >= oc - 1 && c <= oc + 7) return 0;
      }
      return -1;
    };
    let d = '';
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const f = finder(r, c);
        const on = f === -1 ? rand() < 0.5 : f === 1;
        if (on) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    return d;
  });
}
