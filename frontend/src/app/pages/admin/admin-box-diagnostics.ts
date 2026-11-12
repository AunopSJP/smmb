import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { AdminApi, type AdminBoxDetail, type BeepPattern } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { EmptyState } from '../../shared/state-view';
import { seenText } from './admin-box-shared';

/** D04 แท็บ "ทดสอบ" ส่วนเครื่องมือ: ทดสอบเสียง Buzzer + สถานะบอร์ด/กล้อง (แยกจาก admin-box.ts) · สั่งแล้วแจ้ง `changed` ให้หน้าแม่โหลดตู้ใหม่ */
@Component({
  selector: 'app-admin-box-diagnostics',
  imports: [EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = box();
        <h2 class="section-title">{{ i18n.t({ th: 'ทดสอบเสียง Buzzer', en: 'Buzzer test' }) }}</h2>
        <section class="card stack">
          <p class="muted small">{{ i18n.t({ th: 'กดแล้วตู้ที่ออนไลน์จะส่งเสียงตามรูปแบบนั้นทันที (ต้องยืนอยู่ใกล้ตู้) · ใช้ตรวจสอบว่าลำโพง/ขาต่อทำงาน และให้ช่างรู้จักความหมายของเสียงแต่ละแบบ', en: 'The online box plays that pattern right away (stand near it) · checks the buzzer wiring and teaches what each sound means' }) }}</p>
          <div class="beeps">
            @for (p of beepPatterns; track p.v) {
              <button type="button" class="beep" [class.on]="b.buzzer.pattern === p.v && b.buzzer.status === 'pending'" [disabled]="beepBusy()" (click)="testBeep(p.v)">
                <strong>{{ i18n.t(p.label) }}</strong>
                <span class="muted small">{{ i18n.t(p.sound) }}</span>
              </button>
            }
          </div>
          @switch (b.buzzer.status) {
            @case ('pending') {
              <p class="status warn" role="status">{{ i18n.t({ th: 'ส่งคำสั่งแล้ว รอตู้รับ… (ตู้ต้องออนไลน์ · หมดอายุใน 2 นาที)', en: 'Sent — waiting for the box… (it must be online · expires in 2 min)' }) }}</p>
            }
            @case ('done') {
              <p class="status ok" role="status">{{ i18n.t({ th: 'ตู้ส่งเสียง "', en: 'The box played “' }) }}{{ i18n.t(beepName(b.buzzer.pattern)) }}{{ i18n.t({ th: '" แล้ว · ', en: '” · ' }) }}{{ i18n.t(seen(b.buzzer.done_at)) }}</p>
              <p class="muted small">{{ i18n.t({ th: 'ไม่ได้ยินเสียง? ตรวจสอบสายลำโพง/Buzzer ที่ขา GPIO ของบอร์ด และกระแสไฟ (ดูรูปแบบเสียงในคู่มือ §2.5)', en: 'No sound? Check the buzzer wiring on the board and the power supply (patterns: protocol §2.5)' }) }}</p>
            }
            @case ('expired') {
              <p class="status danger" role="alert">{{ i18n.t({ th: 'ตู้ไม่รับคำสั่งภายใน 2 นาที — ตู้ออนไลน์อยู่ไหม? หรือยังเป็นเฟิร์มแวร์เก่า (ต้อง 0.2.8 ขึ้นไป)', en: 'The box did not take it within 2 min — is it online? Or it runs old firmware (needs 0.2.8+)' }) }}</p>
            }
          }
        </section>

        <h2 class="section-title">{{ i18n.t({ th: 'สถานะบอร์ดและกล้อง', en: 'Board and camera status' }) }}</h2>
        <section class="card">
          @if (b.camera_diagnostics; as camera) {
            @switch (camera.state) {
              @case ('started') {
                <p class="status warn">{{ i18n.t({ th: 'เริ่มทดสอบกล้องแล้ว', en: 'Camera test started' }) }}</p>
              }
              @case ('ready') {
                <p class="status ok">{{ i18n.t({ th: 'กล้องเริ่มทำงานแล้ว รอผลอ่าน QR', en: 'Camera initialized; waiting for QR scan' }) }}</p>
              }
              @case ('scan_result') {
                @if (camera.read_ok) {
                  <p class="status ok">{{ i18n.t({ th: 'กล้องอ่าน QR ได้', en: 'Camera read a QR code' }) }}</p>
                } @else if ((camera.frames ?? 0) > 0) {
                  <p class="status warn">{{ i18n.t({ th: 'กล้องรับภาพได้ แต่ยังไม่พบ QR', en: 'Camera captured frames but found no QR code' }) }}</p>
                } @else {
                  <p class="status danger">{{ i18n.t({ th: 'ยังไม่ได้ภาพจากกล้อง', en: 'No camera frames were captured' }) }}</p>
                }
              }
              @case ('error') {
                <p class="status danger">{{ i18n.t({ th: 'เปิดกล้องไม่สำเร็จ', en: 'Camera initialization failed' }) }}</p>
              }
            }
            <dl class="kv small">
              <dt>{{ i18n.t({ th: 'รายงานล่าสุด', en: 'Latest report' }) }}</dt><dd>{{ i18n.t(seen(camera.at)) }}</dd>
              @if (camera.width !== null && camera.height !== null) {
                <dt>{{ i18n.t({ th: 'ความละเอียด', en: 'Resolution' }) }}</dt><dd>{{ camera.width }} × {{ camera.height }}</dd>
              }
              @if (camera.frames !== null) {
                <dt>{{ i18n.t({ th: 'จำนวนภาพที่อ่าน', en: 'Frames captured' }) }}</dt><dd>{{ camera.frames }}</dd>
              }
              @if (camera.qr_shapes !== null) {
                <dt>{{ i18n.t({ th: 'ภาพที่พบรูปทรง QR', en: 'Frames with a QR shape' }) }}</dt><dd>{{ camera.qr_shapes }}</dd>
              }
              @if (camera.read_ms !== null) {
                <dt>{{ i18n.t({ th: 'เวลาอ่าน', en: 'Scan time' }) }}</dt><dd>{{ camera.read_ms }} {{ i18n.t({ th: 'มิลลิวินาที', en: 'ms' }) }}</dd>
              }
            </dl>
          } @else {
            <app-empty-state compact [title]="i18n.t({ th: 'ยังไม่มีรายงานทดสอบกล้อง', en: 'No camera test report yet' })" [hint]="i18n.t({ th: 'กด “ทดสอบปลุกตู้” ด้านบน', en: 'Run the wake test above' })" />
          }
        </section>

  `,
  styles: `
.beeps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
}
.beep {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 12px 14px;
  border: 1px solid var(--line-strong, var(--line));
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
@media (hover: hover) {
  .beep:hover:not([disabled]) {
    border-color: var(--brand-text);
    background: var(--brand-lighter);
  }
}
.beep.on {
  border-color: var(--brand-text);
  background: var(--brand-light);
}
.beep[disabled] {
  opacity: 0.6;
  cursor: wait;
}
  `,
})
export class AdminBoxDiagnostics {
  readonly box = input.required<AdminBoxDetail>();
  readonly changed = output<void>();
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly seen = seenText;

  protected readonly beepBusy = signal(false);
  /** รูปแบบเสียง (ตรงกับโปรโตคอล §2.5 และข้อความในแอปเจ้าหน้าที่) */
  protected readonly beepPatterns: { v: BeepPattern; label: Tr; sound: Tr }[] = [
    { v: 'ready', label: { th: 'พร้อม / ได้งาน', en: 'Ready' }, sound: { th: 'สั้น 1 ครั้ง', en: 'short ×1' } },
    { v: 'pass', label: { th: 'ผ่าน', en: 'Pass' }, sound: { th: 'สั้น 2 ครั้ง', en: 'short ×2' } },
    { v: 'retry', label: { th: 'ลองอีกครั้ง', en: 'Retry' }, sound: { th: 'ยาว 1 ครั้ง', en: 'long ×1' } },
    { v: 'fail', label: { th: 'ไม่ผ่าน', en: 'Fail' }, sound: { th: 'ยาว 3 ครั้ง', en: 'long ×3' } },
    { v: 'error', label: { th: 'ผิดพลาด', en: 'Error' }, sound: { th: 'ยาว 1 + สั้น 2', en: 'long ×1 + short ×2' } },
    { v: 'wifi', label: { th: 'รับคำสั่ง Wi-Fi', en: 'Wi-Fi command' }, sound: { th: 'สั้น 3 ถี่ ๆ', en: 'short ×3 fast' } },
  ];
  protected beepName(p: BeepPattern | null): Tr {
    return this.beepPatterns.find((x) => x.v === p)?.label ?? { th: '', en: '' };
  }

  protected async testBeep(pattern: BeepPattern): Promise<void> {
    const id = this.box().id;
    if (!id || this.beepBusy()) return;
    this.beepBusy.set(true);
    try {
      await this.api.requestBeep(id, pattern);
      this.changed.emit();
    } catch {
      this.toast.show({ th: 'สั่งทดสอบเสียงไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not start the buzzer test — check your connection and try again' });
    } finally {
      this.beepBusy.set(false);
    }
  }
}
