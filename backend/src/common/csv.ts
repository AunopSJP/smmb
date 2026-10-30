/**
 * สร้าง CSV (UTF-8 + BOM ให้ Excel อ่านภาษาไทยถูก) · ทุกช่องครอบด้วย "…" และ " → ""
 * กัน CSV injection: ช่องที่ขึ้นต้นด้วย = + - @ หรือ tab/CR ใส่ ' นำหน้า ไม่ให้ Excel ตีความเป็นสูตร
 */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
