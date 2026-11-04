import { describe, expect, it } from 'vitest';
import { sniffMime } from './inspection-photo.service.js';

describe('sniffMime (Snapface upload)', () => {
  it('accepts JPEG and WebP by their real header, not the client content type', () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
  });

  it('rejects anything else', () => {
    expect(sniffMime(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull(); // PNG
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });
});
