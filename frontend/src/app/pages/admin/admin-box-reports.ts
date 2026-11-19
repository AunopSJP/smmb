import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { type AdminBoxDetail } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { seenText } from './admin-box-shared';

/** reset_reason ที่ตู้ส่งตอนบูต (linkResetReason ในเฟิร์มแวร์) */
const RESET_TEXT: Record<string, { text: Tr; bad: boolean }> = {
  power_on: { text: { th: 'เริ่มทำงานใหม่: เปิดเครื่อง / กดรีเซ็ต', en: 'Restarted: power on / reset button' }, bad: false },
  deep_sleep: { text: { th: 'เริ่มทำงานใหม่: ตื่นจากหลับลึก', en: 'Restarted: woke from deep sleep' }, bad: false },
  software: { text: { th: 'เริ่มทำงานใหม่: ตู้สั่งรีสตาร์ตเอง (เช่น หลังอัปเดต)', en: 'Restarted: by the box itself (e.g. after an update)' }, bad: false },
  external: { text: { th: 'เริ่มทำงานใหม่: ขารีเซ็ตภายนอก', en: 'Restarted: external reset pin' }, bad: false },
  brownout: { text: { th: 'เริ่มทำงานใหม่: ไฟตก (แรงดันไฟไม่พอ)', en: 'Restarted: brownout (supply voltage dropped)' }, bad: true },
  watchdog: { text: { th: 'เริ่มทำงานใหม่: โปรแกรมค้าง (watchdog)', en: 'Restarted: program hung (watchdog)' }, bad: true },
  panic: { text: { th: 'เริ่มทำงานใหม่: โปรแกรมล่ม (panic)', en: 'Restarted: program crashed (panic)' }, bad: true },
};

/** boot มี reset_reason = ตู้เพิ่งเริ่มทำงานใหม่เพราะอะไร · ไฟตก/ค้าง/โปรแกรมล่ม = ปัญหา (เน้นสีแดง) · ไม่มีค่า = null */
export function resetReasonText(body: Record<string, unknown>): { text: Tr; bad: boolean } | null {
  const reason = body['reset_reason'];
  if (typeof reason !== 'string') return null;
  return RESET_TEXT[reason] ?? { text: { th: `เริ่มทำงานใหม่: ${reason}`, en: `Restarted: ${reason}` }, bad: false };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** QR ประจำตัว (29 โมดูล) ต้องกว้างในภาพอย่างน้อยราวนี้ (px) ตู้ถึงถอดได้ */
export const MIN_QR_PX = 100;

/** event scan_diag (ตู้อ่านไม่ได้ตอนตรวจจริง) → ข้อความบอกสาเหตุที่น่าจะเป็น · ไม่ใช่ scan_diag = null */
export function scanDiagHint(body: Record<string, unknown>): Tr | null {
  if (body['type'] !== 'scan_diag') return null;
  const frames = num(body['frames']);
  const shapes = num(body['qr_shapes']);
  const px = num(body['widest_px']);
  const bright = num(body['brightness']);
  const err = typeof body['decode_err'] === 'string' ? body['decode_err'] : '';
  if (frames === 0) return { th: 'กล้องไม่ส่งภาพให้ตู้เลย — ตรวจสายกล้องและไฟเลี้ยง', en: 'The camera gave the box no frames — check the camera cable and power' };
  if (!shapes) {
    if (bright !== null && bright >= 235) return { th: 'ภาพสว่างจ้า (ไหม้) — ลดความสว่างจอ หรือเอียงจอเลี่ยงแสงสะท้อน', en: 'Image is blown out — lower the screen brightness or tilt it' };
    if (bright !== null && bright <= 40) return { th: 'ภาพมืดเกินไป — เพิ่มความสว่างจอมือถือ', en: 'Image is too dark — raise the phone brightness' };
    return { th: 'ตู้ไม่เห็นรูปทรง QR เลย — QR ไม่อยู่ในภาพ เบลอ หรือเล็กเกินไป · ลองห่างราว 1 ฝ่ามือ ถือนิ่ง ๆ', en: 'The box saw no QR shape — not in view, blurred or too small · try a hand’s width away, hold still' };
  }
  if (px !== null && px > 0 && px < MIN_QR_PX) {
    return { th: `ตู้เห็น QR แต่เล็กเกินไป (กว้าง ${px} px ต้องราว ${MIN_QR_PX} px ขึ้นไป) — ขยับเข้าใกล้กล้อง`, en: `The box saw the QR but it is too small (${px} px wide, needs about ${MIN_QR_PX}+) — move closer` };
  }
  return {
    th: `ตู้เห็น QR ขนาดพอ (กว้าง ${px ?? '?'} px) แต่ถอดรหัสไม่ได้${err ? ` (${err})` : ''} — มักเป็นภาพเบลอ ขอบ QR ถูกตัด หรือจอสะท้อนแสง`,
    en: `The box saw a QR of fair size (${px ?? '?'} px wide) but could not decode it${err ? ` (${err})` : ''} — usually blur, a cropped edge or glare`,
  };
}

/** ชนิด event ที่ตู้ส่ง (ไลบรารี smmb_link) */
const EVENT_TEXT: Record<string, Tr> = {
  camera_error: { th: 'กล้องเปิดไม่ได้', en: 'Camera failed to start' },
  scan_diag: { th: 'ตู้อ่าน QR ประจำตัวไม่ได้ (ตรวจจริง)', en: 'Box could not read the badge QR (real inspection)' },
  camera_test_started: { th: 'เริ่มทดสอบกล้อง', en: 'Camera test started' },
  camera_ready: { th: 'กล้องพร้อม (ทดสอบ)', en: 'Camera ready (test)' },
  camera_scan_result: { th: 'ผลสแกน (ทดสอบ)', en: 'Scan result (test)' },
  ota_failed: { th: 'อัปเดตเฟิร์มแวร์ไม่สำเร็จ / ข้าม', en: 'Firmware update failed / skipped' },
  beep: { th: 'ตู้รับคำสั่งทดสอบเสียง', en: 'Box took the beep command' },
  standby: { th: 'ตู้รับคำสั่งกลับสแตนบาย', en: 'Box took the standby command' },
  wifi_reset: { th: 'ตู้รับคำสั่งเปลี่ยน Wi-Fi', en: 'Box took the Wi-Fi change command' },
};

/** D04 แท็บ "ภาพรวม" ส่วนรายงานจากตู้ + คำขอที่ลายเซ็นไม่ผ่าน (แยกจาก admin-box.ts · แสดงผลอย่างเดียว) */
@Component({
  selector: 'app-admin-box-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = box();
        <h2 class="section-title easy-hide">{{ i18n.t({ th: 'รายงานจากตู้ล่าสุด', en: 'Latest box reports' }) }}</h2>
        <div class="list easy-hide">
          @for (r of b.reports.slice(0, 12); track $index) {
            <div class="row">
              <span class="grow">
                <strong>{{ reportTitle(r) }}</strong>
                @if (resetReason(r.body); as reset) {
                  <span class="small block reset" [class.bad]="reset.bad">{{ i18n.t(reset.text) }}</span>
                }
                @if (scanHint(r.body); as hint) {
                  <span class="small block reset bad">{{ i18n.t(hint) }}</span>
                }
                <span class="muted small block">{{ reportLine(r.body) }}</span>
                @if (traceLines(r.body); as lines) {
                  <span class="mono small block trace">
                    @for (l of lines; track $index) {
                      <span class="block">{{ l }}</span>
                    }
                  </span>
                }
              </span>
              <span class="muted small">{{ i18n.t(seen(r.at)) }}</span>
            </div>
          } @empty {
            <p class="row muted">{{ i18n.t({ th: 'ตู้ยังไม่เคยส่งรายงาน (ยังไม่เปิดเครื่อง / ยังไม่ต่อ Wi-Fi)', en: 'No reports yet (not powered on / no Wi-Fi yet)' }) }}</p>
          }
        </div>
        @if (b.auth_failures.length) {
          <h2 class="section-title easy-hide">{{ i18n.t({ th: 'คำขอที่ลายเซ็นไม่ผ่าน', en: 'Rejected box requests' }) }}</h2>
          <div class="list easy-hide">
            @for (a of b.auth_failures; track $index) {
              <div class="row"><span class="grow"><strong>{{ a.reason }}</strong></span><span class="muted small">{{ i18n.t(seen(a.at)) }}</span></div>
            }
          </div>
        }
  `,
  styles: `
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
    .reset {
      font-weight: var(--fw-strong);
    }
    .reset.bad {
      color: var(--sos);
    }
    .trace {
      margin-block-start: 6px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
  `,
})
export class AdminBoxReports {
  readonly box = input.required<AdminBoxDetail>();
  protected readonly i18n = inject(I18n);
  protected readonly seen = seenText;

  /** ชื่อรายการ: boot/report = "รายงานจากตู้" · event = บอกชนิด (awake_trace = บันทึกวินิจฉัยการตื่นของตู้) */
  protected reportTitle(r: AdminBoxDetail['reports'][number]): string {
    if (r.kind !== 'event') return this.i18n.t({ th: 'รายงานจากตู้', en: 'Report from the box' });
    const type = r.body['type'];
    if (type === 'awake_trace') return this.i18n.t({ th: 'บันทึกการตื่นของตู้ (วินิจฉัย)', en: 'Box wake trace (diagnostic)' });
    const known = typeof type === 'string' ? EVENT_TEXT[type] : undefined;
    if (known) return this.i18n.t(known);
    return this.i18n.t({ th: 'เหตุการณ์จากตู้', en: 'Box event' }) + (typeof type === 'string' ? ` · ${type}` : '');
  }

  protected readonly resetReason = resetReasonText;
  protected readonly scanHint = scanDiagHint;

  /** awake_trace: บรรทัดบันทึกที่ตู้จดไว้ (เวลาในตู้ · เหตุการณ์ · ค่า) — ไม่ใช่ event นี้ = null */
  protected traceLines(body: Record<string, unknown>): string[] | null {
    const t = body['trace'];
    if (!Array.isArray(t)) return null;
    const lines = t.filter((x): x is string => typeof x === 'string');
    return lines.length ? lines : null;
  }

  protected reportLine(body: Record<string, unknown>): string {
    const parts: string[] = [];
    const battery = body['battery_pct'];
    if (typeof battery === 'number' || typeof battery === 'string') parts.push(`${battery}%`);
    const rssi = body['rssi'];
    if (typeof rssi === 'number' || typeof rssi === 'string') parts.push(this.i18n.t({ th: `สัญญาณ ${rssi}`, en: `signal ${rssi}` }));
    const fw = body['fw'];
    if (typeof fw === 'string' || typeof fw === 'number') parts.push(this.i18n.t({ th: `เฟิร์มแวร์ ${fw}`, en: `firmware ${fw}` }));
    if (body['type'] === 'scan_diag') {
      const attempt = body['attempt'];
      if (typeof attempt === 'number') parts.push(this.i18n.t({ th: `ครั้งที่ ${attempt}`, en: `try ${attempt}` }));
      const frames = body['frames'];
      if (typeof frames === 'number') parts.push(this.i18n.t({ th: `ลอง ${frames} เฟรม`, en: `${frames} frames` }));
      const shapes = body['qr_shapes'];
      if (typeof shapes === 'number') parts.push(this.i18n.t({ th: `เห็นรูปทรง QR ${shapes} เฟรม`, en: `QR shape in ${shapes}` }));
      const px = body['widest_px'];
      if (typeof px === 'number') parts.push(this.i18n.t({ th: `กว้างสุด ${px} px`, en: `widest ${px} px` }));
      const bright = body['brightness'];
      if (typeof bright === 'number') parts.push(this.i18n.t({ th: `สว่าง ${bright}/255`, en: `brightness ${bright}/255` }));
    }
    return parts.join(' · ');
  }
}
