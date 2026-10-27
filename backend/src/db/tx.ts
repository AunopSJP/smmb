import type pg from 'pg';

/** อะไรก็ได้ที่ query ได้ — Pool หรือ client ใน transaction */
export type Db = Pick<pg.Pool, 'query'>;

/** รัน fn ใน transaction เดียว · error = ROLLBACK ทั้งก้อน */
export async function withTx<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** error จาก Postgres ตรงกับ SQLSTATE (และชื่อ constraint ถ้าระบุ) ไหม */
export function isPgError(err: unknown, sqlState: string, constraint?: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string };
  return e.code === sqlState && (constraint === undefined || e.constraint === constraint);
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';
