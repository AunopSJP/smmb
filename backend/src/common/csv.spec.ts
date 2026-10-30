import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('starts with a BOM, quotes every cell and doubles inner quotes', () => {
    const csv = toCsv([
      ['a', 'b "c"'],
      ['ไทย', '1'],
    ]);
    expect(csv).toBe('﻿"a","b ""c"""\r\n"ไทย","1"');
  });

  it('defuses spreadsheet formulas', () => {
    const csv = toCsv([['=1+1', '+SUM(A1)', '-2', '@x', '\tz', 'ok']]);
    expect(csv).toBe('﻿"\'=1+1","\'+SUM(A1)","\'-2","\'@x","\'\tz","ok"');
  });
});
