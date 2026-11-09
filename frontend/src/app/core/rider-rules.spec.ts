import { describe, expect, it } from 'vitest';
import { cleanCode, DELIVERY_LIMIT_PER_HOUR, formatCode, normalizeCode } from './rider-rules';

describe('rider rules', () => {
  it('normalizes a printed mailbox code independent of case and separators', () => {
    expect(normalizeCode('h4kd - 9trw')).toBe('H4KD9TRW');
  });

  it('defines the delivery limit displayed by the live rider flow', () => {
    expect(DELIVERY_LIMIT_PER_HOUR).toBe(5);
  });

  it('drops characters outside the printed alphabet (0 1 O I L) and separators', () => {
    expect(cleanCode('h4kd-9trw')).toBe('H4KD9TRW');
    expect(cleanCode('O0 1IL H4KD')).toBe('H4KD');
  });

  it('limits to 8 characters and puts a dash after the 4th', () => {
    expect(formatCode('h4kd')).toBe('H4KD');
    expect(formatCode('h4kd9')).toBe('H4KD-9');
    expect(formatCode('H4KD-9TRWXYZ')).toBe('H4KD-9TRW');
  });
});
