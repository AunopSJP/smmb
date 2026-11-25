import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScanChime } from './scan-chime';

/** AudioContext ปลอม — นับว่าเล่นกี่โน้ต */
function fakeAudio(state: AudioContextState = 'running') {
  const started: number[] = [];
  class FakeCtx {
    state = state;
    currentTime = 0;
    destination = {};
    resume = vi.fn(() => Promise.resolve());
    createOscillator() {
      const osc = { type: '', frequency: { value: 0 }, connect: (g: unknown) => g, start: () => started.push(osc.frequency.value), stop() {}, disconnect() {}, onended: null };
      return osc;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d, disconnect() {} };
    }
  }
  vi.stubGlobal('AudioContext', FakeCtx);
  return started;
}

describe('ScanChime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('plays a rising two-note chime and vibrates', () => {
    const started = fakeAudio();
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    TestBed.inject(ScanChime).play();
    expect(started).toEqual([880, 1320]);
    expect(vibrate).toHaveBeenCalled();
  });

  it('stays silent without crashing when sound is still locked', async () => {
    const started = fakeAudio('suspended');
    const chime = TestBed.inject(ScanChime);
    expect(() => chime.play()).not.toThrow();
    await Promise.resolve();
    expect(started).toEqual([]);
  });
});
