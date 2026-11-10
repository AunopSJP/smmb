/** DI tokens แยกไฟล์ เพื่อให้ service ที่ inject pool ไม่เกิด circular import กับ DbModule */
export const PG_POOL = Symbol('PG_POOL');
export const REDIS = Symbol('REDIS');
