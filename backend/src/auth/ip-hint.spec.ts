import { ipHint } from './ip-hint.js';

describe('ipHint', () => {
  it.each([
    ['203.0.113.57', '203.0.113.x'],
    ['203.0.113.57/32', '203.0.113.x'],
    ['::ffff:203.0.113.57', '203.0.113.x'],
    ['2001:db8:abcd:12:34:56:78:9a', '2001:db8:abcd::'],
    ['2001:db8:abcd:12::1/128', '2001:db8:abcd::'],
  ])('%s → %s', (input, expected) => {
    expect(ipHint(input)).toBe(expected);
  });

  it.each([null, undefined, '', '::1', 'garbage', '2001:db8::'])('gives nothing for %s', (input) => {
    expect(ipHint(input)).toBeNull();
  });
});
