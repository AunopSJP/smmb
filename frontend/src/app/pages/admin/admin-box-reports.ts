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

/** ชนิด event ที่ตู้ส่ง (ไลบรารี smmb_link) */
const EVENT_TEXT: Record<string, Tr> = {
  camera_error: { th: 'กล้องเปิดไม่ได้', en: 'Camera failed to start' },
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
    return parts.join(' · ');
  }
}
