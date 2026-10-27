import { toCsv } from './csv';

describe('toCsv', () => {
  it('starts with a BOM, quotes every cell and doubles quotes', () => {
    expect(toCsv([['a', 'b "c"']])).toBe('﻿"a","b ""c"""');
  });

  it('cells that look like formulas are made harmless', () => {
    const csv = toCsv([['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', 'ok']]);
    expect(csv).toBe(`﻿"'=HYPERLINK(""x"")","'+1","'-2","'@SUM(A1)","ok"`);
  });

  it('rows are separated by CRLF', () => {
    expect(toCsv([['1'], ['2']]).split('\r\n')).toHaveLength(2);
  });
});
