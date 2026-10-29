import { describe, expect, it } from 'vitest';
import { DELIVERY_LIMIT_PER_HOUR, normalizeCode } from './rider-rules';

describe('rider rules', () => {
  it('normalizes a printed mailbox code independent of case and separators', () => {
    expect(normalizeCode('h4kd - 9trw')).toBe('H4KD9TRW');
  });

  it('defines the delivery limit displayed by the live rider flow', () => {
    expect(DELIVERY_LIMIT_PER_HOUR).toBe(5);
  });
});
