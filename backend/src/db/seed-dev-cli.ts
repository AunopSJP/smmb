// ใช้: npm run seed:dev — ใส่ข้อมูลตั้งต้นของเครื่อง dev (sql/dev-seed.sql) · ไม่รันถ้า NODE_ENV=production
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('refusing to run dev seed with NODE_ENV=production');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(await readFile(resolve('sql/dev-seed.sql'), 'utf8'));
  console.log('✓ dev seed applied');
} finally {
  await client.end();
}
