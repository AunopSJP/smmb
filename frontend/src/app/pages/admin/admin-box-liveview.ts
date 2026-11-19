import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, type OnInit, signal } from '@angular/core';
import { AdminApi } from '../../core/admin-api';
import { apiError } from '../../core/api';
import { I18n, type Tr } from '../../core/i18n';
import { Confirm } from '../../shared/confirm-dialog';

/** วินาทีที่เหลือของโหมดดูภาพสด (ไม่เปิด/หมดเวลา = 0) */
export function liveViewSecondsLeft(expiresAt: string | null, now = Date.now()): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - now;
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
}

/** นาที:วินาที เช่น 14:05 */
export function fmtLeft(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * D04 แท็บทดสอบ: ดูภาพสดจากกล้องตู้ตอนเจ้าหน้าที่สแกนจริง (✅ ผู้ใช้สั่ง 2026-11-19 ไว้หาสาเหตุสแกน QR ไม่ติด)
 * แอดมินเปิดเองเป็นรายตู้ · หมดเอง 15 นาที · ภาพอยู่ในหน่วยความจำเซิร์ฟเวอร์ ไม่เก็บ · บันทึกการเปิด/ปิดไว้
 */
@Component({
  selector: 'app-admin-box-liveview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card stack live-card easy-hide">
      <h2 class="section-title">{{ i18n.t({ th: 'ดูภาพสดตอนเจ้าหน้าที่สแกนจริง', en: 'Live view during a real inspection' }) }}</h2>
      <p class="muted small">
        {{ i18n.t({ th: 'ไว้หาสาเหตุสแกน QR ไม่ติด · เปิดได้ครั้งละ 15 นาที · ภาพไม่ถูกเก็บ · บันทึกว่าใครเปิด', en: 'For finding why a QR will not scan · 15 minutes at a time · pictures are not stored · who turned it on is logged' }) }}
      </p>
      @if (!active()) {
        <button type="button" class="btn secondary" [disabled]="busy()" (click)="turnOn()">
          {{ i18n.t({ th: 'เปิดดูภาพสด 15 นาที', en: 'Turn on live view for 15 minutes' }) }}
        </button>
      } @else {
        <p class="status" role="status">
          {{ i18n.t({ th: 'เปิดอยู่ · เหลือ ', en: 'On · ' }) }}{{ left() }}{{ i18n.t({ th: '', en: ' left' }) }}
        </p>
        @if (frame(); as src) {
          <figure class="live">
            <img [src]="src" [alt]="i18n.t({ th: 'ภาพสดจากกล้องตู้', en: 'Live view from the box camera' })" />
            <span class="guide" aria-hidden="true"></span>
            <figcaption class="muted small">
              {{ i18n.t({ th: 'ให้เจ้าหน้าที่สแกนที่ตู้ตามปกติ · ภาพอัปเดตทุกไม่กี่วินาที (ระหว่างส่งภาพ ตู้อ่าน QR ช้าลง) · กรอบแดง = บริเวณที่ตู้ใช้อ่านรอบปกติ', en: 'Let the officer scan as usual · refreshes every few seconds (the box reads slower while sending) · red frame = the area read on normal frames' }) }}
            </figcaption>
          </figure>
        } @else {
          <p class="muted small center">{{ i18n.t({ th: 'รอภาพ… ให้เจ้าหน้าที่สแกน QR หน้าตู้แล้วปลุกตู้', en: 'Waiting for a picture… have the officer scan the front QR to wake the box' }) }}</p>
        }
        <button type="button" class="btn secondary" [disabled]="busy()" (click)="turnOff()">
          {{ i18n.t({ th: 'ปิดทันที', en: 'Turn off now' }) }}
        </button>
      }
      @if (error(); as e) {
        <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
      }
    </section>
  `,
  styles: `
    .live-card {
      gap: 10px;
    }
    .status {
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      background: var(--warn-bg, var(--icon-bg));
      color: var(--warn, var(--text));
      font-weight: var(--fw-strong);
    }
    .center {
      text-align: center;
    }
    .live {
      position: relative;
      margin: 0;
      img {
        display: block;
        inline-size: 100%;
        block-size: auto;
        object-fit: contain;
        border-radius: var(--radius-sm);
        background: var(--print-ink);
      }
      .guide {
        position: absolute;
        inset-inline-start: 12.5%;
        inset-block-start: 8.5%;
        inline-size: 75%;
        block-size: 83%;
        border: 3px solid var(--brand);
        border-radius: var(--radius-xs);
        pointer-events: none;
        box-shadow: 0 0 0 1px rgb(255 255 255 / 53%);
      }
      figcaption {
        margin-block-start: 6px;
        text-align: center;
      }
    }
  `,
})
export class AdminBoxLiveView implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly confirm = inject(Confirm);
  readonly boxId = input.required<string>();

  protected readonly active = signal(false);
  protected readonly busy = signal(false);
  protected readonly left = signal('0:00');
  protected readonly frame = signal<string | null>(null);
  protected readonly error = signal<Tr | null>(null);
  private expiresAt: string | null = null;
  private lastFrameAt = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopTimer());
  }

  async ngOnInit(): Promise<void> {
    try {
      this.apply(await this.api.liveView(this.boxId()));
    } catch {
      // อ่านสถานะไม่ได้ = ถือว่าปิดอยู่ (ปุ่มเปิดยังใช้ได้)
    }
  }

  protected async turnOn(): Promise<void> {
    const ok = await this.confirm.ask({
      title: { th: 'เปิดดูภาพสดตอนเจ้าหน้าที่ตรวจจริง?', en: 'Turn on live view during real inspections?' },
      body: {
        th: 'ตู้จะส่งภาพจากกล้องขึ้นมาให้ดู 15 นาที ภาพอาจมีใบหน้าเจ้าหน้าที่ ใช้หาสาเหตุสแกน QR ไม่ติดเท่านั้น ภาพไม่ถูกเก็บ และบันทึกว่าคุณเป็นคนเปิด',
        en: 'The box will send camera pictures for 15 minutes. They may show the officer’s face, so use it only to find why a QR will not scan. Pictures are not stored and your name is logged.',
      },
      confirm: { th: 'เปิด 15 นาที', en: 'Turn on' },
    });
    if (ok) await this.change(true);
  }

  protected async turnOff(): Promise<void> {
    await this.change(false);
  }

  private async change(on: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.apply(await this.api.setLiveView(this.boxId(), on));
    } catch (err) {
      this.error.set(
        apiError(err).status === 404
          ? { th: 'ไม่พบตู้นี้', en: 'Box not found' }
          : { th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Could not do that — try again' },
      );
    } finally {
      this.busy.set(false);
    }
  }

  private apply(state: { active: boolean; expires_at: string | null }): void {
    this.expiresAt = state.expires_at;
    this.active.set(state.active && liveViewSecondsLeft(state.expires_at) > 0);
    this.left.set(fmtLeft(liveViewSecondsLeft(state.expires_at)));
    this.frame.set(null);
    this.lastFrameAt = '';
    if (this.active()) this.startTimer();
    else this.stopTimer();
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const secs = liveViewSecondsLeft(this.expiresAt);
    this.left.set(fmtLeft(secs));
    if (secs <= 0) {
      this.active.set(false);
      this.frame.set(null);
      this.stopTimer();
      return;
    }
    try {
      const f = await this.api.preview(this.boxId());
      if (f && f.at !== this.lastFrameAt) {
        this.lastFrameAt = f.at;
        this.frame.set('data:image/jpeg;base64,' + f.jpeg_b64);
      }
    } catch {
      // เน็ตกระตุก — ลองรอบหน้า
    }
  }
}
