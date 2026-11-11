/** ครอบคำค้นสำหรับ LIKE/ILIKE แบบ "มีคำนี้" — escape \ % _ ให้เป็นตัวอักษรธรรมดา (ผู้ใช้พิมพ์ % แล้วต้องไม่ได้ทุกแถว) */
export const likeContains = (q: string) => '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
