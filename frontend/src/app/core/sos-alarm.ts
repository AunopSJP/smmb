import { computed, inject, Injectable, signal } from '@angular/core';
import { LiveRefresh } from './live-refresh';
import { OfficerSosApi } from './owner-api';

/** ถามรายการ SOS ที่ยังไม่มีคนรับทุกกี่ ms ขณะแอปเปิดอยู่ (ตัวเดียวกับ push สั่งถามทันทีผ่าน LiveRefresh) */
const CHECK_MS = 4000;
/** ไซเรนสลับสูง/ต่ำทุกกี่ ms */
const SIREN_STEP_MS = 550;
const SIREN_HIGH_HZ = 980;
const SIREN_LOW_HZ = 700;
/** สั่นซ้ำทุกกี่ ms (รูปแบบสั่น 700 ms + หยุด 300 ms) */
const VIBRATE_EVERY_MS = 1000;
const VIBRATE_PATTERN: number[] = [700, 300];

type AudioCtor = typeof AudioContext;

/**
 * เสียงไซเรน + สั่นต่อเนื่องให้เจ้าหน้าที่ ตราบที่มี SOS "ยังไม่มีใครรับเรื่อง" และแอปเปิดอยู่ (✅ ผู้ใช้ตกลง 2026-11-24)
 * - หยุดเองเมื่อมีใครกดรับ / เจ้าของยกเลิก / ปิดเรื่อง — **ผู้ใช้ปิดเสียงเองไม่ได้** (ตรงกับกฎ SOS ปิดแจ้งเตือนไม่ได้)
 * - ถ้าแอปปิดอยู่ = ได้แค่ push ตามเดิม · ไม่เพิ่มช่องทางอื่น
 * - เบราว์เซอร์บังคับให้มีการแตะก่อนจึงเล่นเสียง/สั่นได้ → ปลดล็อกเมื่อแตะครั้งแรก หรือกด "ทดสอบเสียง" ที่หน้าตั้งค่าแจ้งเตือน
 * - iPhone ไม่รองรับ Vibration API บนเว็บ (ได้แค่เสียง)
 */
@Injectable({ providedIn: 'root' })
export class SosAlarm {
  private readonly api = inject(OfficerSosApi);
  private readonly live = inject(LiveRefresh);

  /** มี SOS ที่ยังไม่มีคนรับ */
  readonly ringing = signal(false);
  /** เบราว์เซอร์ยอมให้เล่นเสียงแล้ว */
  readonly unlocked = signal(false);
  /** ควรดังแต่ยังเงียบ เพราะยังไม่มีใครแตะหน้าจอ → ให้ขึ้นข้อความชวนแตะ */
  readonly needsTap = computed(() => this.ringing() && !this.unlocked());
  readonly supported = typeof window !== 'undefined' && !!this.audioCtor();

  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private sirenTimer: ReturnType<typeof setInterval> | null = null;
  private vibrateTimer: ReturnType<typeof setInterval> | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private liveSub: { unsubscribe(): void } | null = null;
  private watching = 0;
  private busy = false;
  private readonly onGesture = () => void this.unlock();

  /** เริ่มเฝ้า (เรียกจาก shell เจ้าหน้าที่/หัวหน้า) · เรียกซ้อนได้ — นับจำนวน */
  start(): void {
    this.watching += 1;
    if (this.watching > 1) return;
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this.onGesture, { passive: true });
      document.addEventListener('keydown', this.onGesture);
    }
    this.liveSub = this.live.ticks.subscribe(() => void this.check());
    this.checkTimer = setInterval(() => void this.check(), CHECK_MS);
    void this.check();
  }

  stop(): void {
    this.watching = Math.max(0, this.watching - 1);
    if (this.watching > 0) return;
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.onGesture);
      document.removeEventListener('keydown', this.onGesture);
    }
    this.liveSub?.unsubscribe();
    this.liveSub = null;
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = null;
    this.setRinging(false);
  }

  /** ปลดล็อกเสียง — ต้องเรียกจากการแตะ/กดของผู้ใช้ */
  unlock(): Promise<void> {
    const Ctor = this.audioCtor();
    if (!Ctor) return Promise.resolve();
    try {
      this.ctx ??= new Ctor();
      return this.ctx.resume().then(() => {
        if (this.ctx?.state === 'running') {
          this.unlocked.set(true);
          if (typeof document !== 'undefined') {
            document.removeEventListener('pointerdown', this.onGesture);
            document.removeEventListener('keydown', this.onGesture);
          }
          if (this.ringing()) this.apply();
        }
      });
    } catch {
      // เล่นเสียงไม่ได้ — ยังมี push และหน้าจอสีแดง
      return Promise.resolve();
    }
  }

  /** ทดสอบเสียง ~2.5 วินาที (กดจากหน้าตั้งค่า — นับเป็นการแตะเพื่อปลดล็อกด้วย) */
  test(): void {
    void this.unlock().then(() => {
      this.playSiren();
      this.buzz();
      setTimeout(() => {
        if (!this.ringing()) {
          this.stopSiren();
          this.stopBuzz();
        }
      }, 2500);
    });
  }

  private async check(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const cases = await this.api.list('open');
      // เรื่องที่ฉันคืนเองแล้วไม่ดังใส่ฉันอีก (คนอื่นยังได้ยินตามปกติ)
      this.setRinging(cases.some((c) => c.status === 'open' && !c.returned_by_me));
    } catch {
      // ถามไม่สำเร็จ (เน็ตหลุด) — คงสถานะเดิมไว้ ไม่ปิดเสียงเอง
    } finally {
      this.busy = false;
    }
  }

  private setRinging(value: boolean): void {
    if (this.ringing() === value) return;
    this.ringing.set(value);
    this.apply();
  }

  private apply(): void {
    if (this.ringing()) {
      this.playSiren();
      this.buzz();
    } else {
      this.stopSiren();
      this.stopBuzz();
    }
  }

  private playSiren(): void {
    if (!this.ctx || this.ctx.state !== 'running' || this.osc) return;
    const ctx = this.ctx;
    this.osc = ctx.createOscillator();
    this.gain = ctx.createGain();
    this.osc.type = 'square';
    this.gain.gain.value = 0.35;
    this.osc.connect(this.gain).connect(ctx.destination);
    this.osc.frequency.value = SIREN_HIGH_HZ;
    this.osc.start();
    let high = true;
    this.sirenTimer = setInterval(() => {
      high = !high;
      this.osc?.frequency.setValueAtTime(high ? SIREN_HIGH_HZ : SIREN_LOW_HZ, ctx.currentTime);
    }, SIREN_STEP_MS);
  }

  private stopSiren(): void {
    if (this.sirenTimer) clearInterval(this.sirenTimer);
    this.sirenTimer = null;
    try {
      this.osc?.stop();
    } catch {
      // หยุดไปแล้ว
    }
    this.osc?.disconnect();
    this.gain?.disconnect();
    this.osc = null;
    this.gain = null;
  }

  private buzz(): void {
    if (this.vibrateTimer || typeof navigator === 'undefined' || !navigator.vibrate) return;
    navigator.vibrate(VIBRATE_PATTERN);
    this.vibrateTimer = setInterval(() => navigator.vibrate(VIBRATE_PATTERN), VIBRATE_EVERY_MS);
  }

  private stopBuzz(): void {
    if (this.vibrateTimer) clearInterval(this.vibrateTimer);
    this.vibrateTimer = null;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(0);
  }

  private audioCtor(): AudioCtor | null {
    if (typeof window === 'undefined') return null;
    return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ?? null;
  }
}
