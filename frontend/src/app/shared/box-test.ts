import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { AdminApi, type Job } from '../core/admin-api';
import { apiError } from '../core/api';
import { I18n, type Tr } from '../core/i18n';
import { QrImage } from './qr-image';

/**
 * ทดสอบปลุกตู้ของจริง (api.md §9.4 test-jobs) — แอดมิน D04 / ช่าง T01
 * สร้างงาน → ตู้ที่ถือ long-poll ได้งานทันที → ปี๊บ + เปิดกล้อง (ready) → แสดง QR ทดสอบให้กล้องตู้อ่าน → ผ่าน
 * ใช้ตรวจทั้งเน็ต · การปลุก · กล้อง · การอ่าน QR ของตู้ในครั้งเดียว
 */
const STATE: Record<Job['status'] | 'starting', { label: Tr; tone: '' | 'ok' | 'warn' | 'danger' }> = {
  starting: { label: { th: 'กำลังสร้างงาน…', en: 'Creating the job…' }, tone: '' },
  waiting: { label: { th: 'รอตู้รับงาน… (ตู้ต้องออนไลน์อยู่)', en: 'Waiting for the box to pick it up… (it must be online)' }, tone: '' },
  delivered: { label: { th: 'ตู้ได้งานแล้ว กำลังเปิดกล้อง…', en: 'Box got the job, starting the camera…' }, tone: 'warn' },
  ready: { label: { th: 'ตู้พร้อม (ปี๊บ 1 ครั้ง) — ยื่น QR ด้านล่างให้กล้องตู้', en: 'Box ready (1 beep) — hold the QR below to its camera' }, tone: 'warn' },
  passed: { label: { th: 'ผ่าน: ตู้อ่าน QR ได้ (ปี๊บ 2 ครั้ง)', en: 'Passed: the box read the QR (2 beeps)' }, tone: 'ok' },
  failed: { label: { th: 'ไม่ผ่าน: ตู้อ่าน QR ไม่ได้', en: 'Failed: the box could not read the QR' }, tone: 'danger' },
  expired: { label: { th: 'หมดเวลา: ตู้ไม่ตอบ', en: 'Timed out: the box did not answer' }, tone: 'danger' },
};

@Component({
  selector: 'app-box-test',
  imports: [QrImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!job() && !starting()) {
      <button type="button" class="btn" [class.secondary]="secondary()" (click)="start()">{{ i18n.t(label()) }}</button>
      @if (error(); as e) {
        <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
      }
    } @else {
      @let st = state();
      <section class="card stack test">
        <p class="status" [class.ok]="st.tone === 'ok'" [class.warn]="st.tone === 'warn'" [class.danger]="st.tone === 'danger'" role="status">
          {{ i18n.t(st.label) }}
        </p>
        @if (job(); as j) {
          @if (frame(); as src) {
            <figure class="live">
              <img [src]="src" [alt]="i18n.t({ th: 'ภาพสดจากกล้องตู้', en: 'Live view from the box camera' })" />
              <span class="guide" aria-hidden="true"></span>
              <figcaption class="muted small">{{ i18n.t({ th: 'วาง QR ให้อยู่ในกรอบสีแดง ไม่ให้ถูกตัดขอบ · ภาพรีเฟรชทุก 1–3 วินาที', en: 'Keep the QR inside the red frame, uncropped · refreshes every 1–3 s' }) }}</figcaption>
            </figure>
          } @else if (j.status === 'delivered' || j.status === 'ready') {
            <p class="muted small center">{{ i18n.t({ th: 'รอภาพจากกล้อง…', en: 'Waiting for the camera picture…' }) }}</p>
          }
          @if (j.status === 'ready') {
            <div class="qr"><app-qr-image [text]="'SMMB-TEST ' + j.id" label="test QR" /></div>
            <p class="muted small center">{{ i18n.t({ th: 'ลองได้ ' + attemptsLeft() + ' ครั้ง', en: attemptsLeft() + ' tries left' }) }}</p>
          }
          <dl class="kv small">
            <dt>{{ i18n.t({ th: 'งาน', en: 'Job' }) }}</dt><dd>{{ j.id }}</dd>
            @if (j.wake_ms !== null) {
              <dt>{{ i18n.t({ th: 'ปลุก → พร้อม', en: 'Wake → ready' }) }}</dt><dd>{{ (j.wake_ms / 1000).toFixed(1) }} {{ i18n.t({ th: 'วิ', en: 's' }) }}</dd>
            }
            @for (a of j.attempts; track a.attempt) {
              <dt>{{ i18n.t({ th: 'ครั้งที่ ', en: 'Try ' }) }}{{ a.attempt }}</dt><dd>{{ a.verdict }}{{ a.reason ? ' · ' + a.reason : '' }}</dd>
            }
          </dl>
        }
        @if (done()) {
          <button type="button" class="btn secondary" (click)="reset()">{{ i18n.t({ th: 'ทดสอบอีกครั้ง', en: 'Test again' }) }}</button>
        }
      </section>
    }
  `,
  styles: `
    .test {
      gap: 10px;
    }
    .status {
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      background: var(--icon-bg);
      color: var(--text-muted);
      font-weight: 700;
    }
    .status.ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
    .status.warn {
      background: var(--warn-bg, var(--icon-bg));
      color: var(--warn, var(--text));
    }
    .status.danger {
      background: var(--danger-bg, var(--icon-bg));
      color: var(--danger, var(--sos));
    }
    .qr {
      width: min(72vw, 280px);
      margin: 0 auto;
      background: #fff;
      padding: 8px;
      border-radius: var(--radius-sm);
    }
    .center {
      text-align: center;
    }
    .live {
      position: relative;
      margin: 0;
      img {
        display: block;
        width: 100%;
        border-radius: var(--radius-sm);
        background: #000;
      }
      /* กรอบกลางภาพที่ตู้ใช้อ่านรอบปกติ (75% × 83%) — นอกกรอบอ่านได้เฉพาะเฟรมเต็มที่สุ่มสแกนบางครั้ง */
      .guide {
        position: absolute;
        left: 12.5%;
        top: 8.5%;
        width: 75%;
        height: 83%;
        border: 3px solid var(--brand);
        border-radius: 8px;
        pointer-events: none;
        box-shadow: 0 0 0 1px #fff8;
      }
      figcaption {
        margin-top: 6px;
        text-align: center;
      }
    }
  `,
})
export class BoxTest {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  readonly boxId = input.required<string>();
  readonly label = input<Tr>({ th: 'ทดสอบปลุกตู้ + กล้อง', en: 'Test wake + camera' });
  readonly secondary = input(false);
  /** จบงาน (ผ่าน / ไม่ผ่าน / หมดเวลา) */
  readonly finished = output<Job>();

  protected readonly job = signal<Job | null>(null);
  protected readonly starting = signal(false);
  protected readonly error = signal<Tr | null>(null);
  /** ภาพสดล่าสุดจากกล้องตู้ (data URL) */
  protected readonly frame = signal<string | null>(null);
  protected readonly state = computed(() => STATE[this.job()?.status ?? 'starting']);
  protected readonly done = computed(() => ['passed', 'failed', 'expired'].includes(this.job()?.status ?? ''));
  protected readonly attemptsLeft = computed(() => 3 - (this.job()?.attempts.length ?? 0));
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected async start(): Promise<void> {
    this.error.set(null);
    this.starting.set(true);
    try {
      const j = await this.api.startTest(this.boxId());
      this.job.set(j);
      this.timer = setInterval(() => void this.poll(), 1000);
    } catch (err) {
      const e = apiError(err);
      this.error.set(
        e.code === 'JOB_ALREADY_OPEN'
          ? { th: 'ตู้นี้มีงานค้างอยู่ รอ 1 นาทีแล้วลองใหม่', en: 'This box already has an open job — wait a minute' }
          : e.status === 404
            ? { th: 'ไม่พบตู้นี้', en: 'Box not found' }
            : { th: 'สร้างงานไม่ได้ ลองใหม่', en: 'Couldn’t create the job — try again' },
      );
    } finally {
      this.starting.set(false);
    }
  }

  private async poll(): Promise<void> {
    const j = this.job();
    if (!j) return;
    try {
      const next = await this.api.testJob(this.boxId(), j.id);
      this.job.set(next);
      if (next.status === 'delivered' || next.status === 'ready') {
        const f = await this.api.preview(this.boxId()).catch(() => null);
        if (f && f.job_id === j.id) this.frame.set('data:image/jpeg;base64,' + f.jpeg_b64);
      }
      if (['passed', 'failed', 'expired'].includes(next.status)) {
        this.stop();
        this.finished.emit(next);
      }
    } catch {
      // เน็ตกระตุก — ลองรอบหน้า
    }
  }

  protected reset(): void {
    this.stop();
    this.job.set(null);
    this.frame.set(null);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
