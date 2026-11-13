import { describe, expect, it } from 'vitest';
import { arrowNavTarget } from './arrow-nav';

describe('arrowNavTarget', () => {
  const make = () => {
    const g = document.createElement('div');
    g.className = 'segmented';
    g.innerHTML = '<button id="a"></button><button id="b" disabled></button><button id="c"></button>';
    document.body.appendChild(g);
    // jsdom ไม่คำนวณ layout → offsetParent เป็น null · จำลองให้เห็นทุกปุ่ม
    g.querySelectorAll('button').forEach((b) => Object.defineProperty(b, 'offsetParent', { get: () => document.body }));
    return g;
  };
  it('moves with arrows, skips disabled, wraps around', () => {
    const g = make();
    const a = g.querySelector('#a')!, c = g.querySelector('#c')!;
    expect(arrowNavTarget(g, a, 'ArrowRight')?.id).toBe('c');
    expect(arrowNavTarget(g, c, 'ArrowRight')?.id).toBe('a');
    expect(arrowNavTarget(g, a, 'ArrowLeft')?.id).toBe('c');
    expect(arrowNavTarget(g, a, 'End')?.id).toBe('c');
    expect(arrowNavTarget(g, c, 'Home')?.id).toBe('a');
    expect(arrowNavTarget(g, a, 'x')).toBeNull();
  });
});
