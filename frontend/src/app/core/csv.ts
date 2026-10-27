/**
 * สร้าง CSV (UTF-8 + BOM ให้ Excel อ่านภาษาไทยถูก) — ของจริงมาจาก GET /admin/logs/export.csv
 * กัน "CSV injection": ช่องที่ขึ้นต้นด้วย = + - @ หรือ tab ใส่ ' นำหน้า ไม่ให้ Excel ตีความเป็นสูตร
 */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** ให้เบราว์เซอร์ดาวน์โหลดไฟล์ข้อความ */
export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
