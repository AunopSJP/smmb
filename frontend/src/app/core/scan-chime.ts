import { Injectable } from '@angular/core';

/** เสียงสองโน้ตขึ้น (ติ๊ง-ดิ๊ง) — สั้น ชัด ไม่เหมือนไซเรน SOS */
const NOTES: ReadonlyArray<{ hz: number; at: number; len: number }> = [
  { hz: 880, at: 0, len: 0.14 },
  { hz: 1320, at: 0.16, len: 0.26 },
];
const VOLUME = 0.3;
/** สั่นสั้น 2 ครั้ง (iPhone ไม่รองรับ — ได้แค่เสียง) */
const VIBRATE_PATTERN: number[] = [120, 80, 160];

type AudioCtor = typeof AudioContext;

/**
 * เสียง + สั่นบอกเจ้าหน้าที่ว่า "ตู้อ่าน QR ประจำตัวได้แล้ว" (✅ ผู้ใช้สั่ง 2026-11-25) — เล่นที่ O06 ก่อนไปหน้า O08
 * - เสียงมาจากมือถือ ไม่ใช่ตู้ · ห้ามบอกว่าตู้ทำอะไรต่อหลังผ่าน (Snapface)
 * - เบราว์เซอร์ต้องมีการแตะก่อนจึงเล่นเสียงได้ → ปลดล็อกจากการแตะครั้งถัดไปในหน้า (เจ้าหน้าที่แตะสแกน QR หน้าตู้มาก่อนเสมอ)
 * - เล่นไม่ได้ (ไม่มี Web Audio / ยังไม่ปลดล็อก) = เงียบไป ไม่กระทบการตรวจ · หน้าจอยังขึ้นข้อความ
 */
@Injectable({ providedIn: 'root' })
export class ScanChime {
  private ctx: AudioContext | null = null;
  private readonly onGesture = () => this.unlock();

  constructor() {
    if (typeof document === 'undefined') return;
    document.addEventListener('pointerdown', this.onGesture, { passive: true });
    document.addEventListener('keydown', this.onGesture);
  }

  /** เตรียมเสียงไว้ (เรียกจากการแตะของผู้ใช้ หรือหน้าเปิด — เบราว์เซอร์ที่จำการแตะก่อนหน้าได้จะเล่นได้เลย) */
  unlock(): void {
    const Ctor = this.audioCtor();
    if (!Ctor) return;
    try {
      this.ctx ??= new Ctor();
      void this.ctx.resume().then(() => {
        if (this.ctx?.state === 'running' && typeof document !== 'undefined') {
          document.removeEventListener('pointerdown', this.onGesture);
          document.removeEventListener('keydown', this.onGesture);
        }
      }).catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  /** เล่น "ติ๊ง-ดิ๊ง" + สั่น */
  play(): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(VIBRATE_PATTERN);
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const start = () => {
      if (ctx.state !== 'running') return;
      const t0 = ctx.currentTime + 0.02;
      for (const n of NOTES) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = n.hz;
        // ขึ้น-ลงนุ่ม ไม่มีเสียงแตก
        gain.gain.setValueAtTime(0, t0 + n.at);
        gain.gain.linearRampToValueAtTime(VOLUME, t0 + n.at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + n.at + n.len);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + n.at);
        osc.stop(t0 + n.at + n.len + 0.02);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      }
    };
    if (ctx.state === 'running') start();
    else void ctx.resume().then(start).catch(() => undefined);
  }

  private audioCtor(): AudioCtor | null {
    if (typeof window === 'undefined') return null;
    return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ?? null;
  }
}
