// ตัวรัน migration: รันไฟล์ migrations/*.sql ที่ยังไม่เคยรัน ตามลำดับชื่อไฟล์ ไฟล์ละหนึ่ง transaction
// กฎของโปรเจกต์: ห้ามแก้ไฟล์ที่ apply แล้ว → เก็บ checksum ไว้ ถ้าไฟล์เก่าถูกแก้ จะหยุดและแจ้ง
// รันจากคำสั่ง: ดู migrate-cli.ts
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const LOCK_KEY = 727_001; // advisory lock กันรันซ้อนกันสองตัว

export async function runMigrations(databaseUrl: string, dir: string, log = console.log): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('CREATE SCHEMA IF NOT EXISTS app');
    await client.query(`CREATE TABLE IF NOT EXISTS app.migration_tb (
      migration_name text PRIMARY KEY,
      checksum       text NOT NULL,
      created_date   timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      'SELECT migration_name AS name, checksum FROM app.migration_tb',
    );
    const done = new Map(rows.map((r) => [r.name, r.checksum]));

    for (const name of files) {
      const sql = await readFile(join(dir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prev = done.get(name);
      if (prev !== undefined) {
        if (prev !== checksum) {
          throw new Error(`Migration ${name} was edited after it was applied. Write a new migration instead.`);
        }
        continue;
      }
      log(`→ applying ${name}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO app.migration_tb (migration_name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${name} failed: ${(err as Error).message}`);
      }
      applied.push(name);
    }
    for (const name of done.keys()) {
      if (!files.includes(name)) log(`⚠ ${name} is in the database but its file is missing`);
    }
    log(applied.length ? `✓ applied ${applied.length} migration(s)` : '✓ database is up to date');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}
