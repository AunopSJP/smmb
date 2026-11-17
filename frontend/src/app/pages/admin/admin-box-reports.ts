import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { type AdminBoxDetail } from '../../core/admin-api';
import { I18n } from '../../core/i18n';
import { seenText } from './admin-box-shared';

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
    return this.i18n.t({ th: 'เหตุการณ์จากตู้', en: 'Box event' }) + (typeof type === 'string' ? ` · ${type}` : '');
  }

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
