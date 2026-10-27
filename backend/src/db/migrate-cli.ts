// ใช้: npm run migrate        (dev — build แล้วอ่าน .env)
//      npm run migrate:prod   (prod — ต้องมี DATABASE_URL ใน env)
import { resolve } from 'node:path';
import { runMigrations } from './migrate.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

try {
  await runMigrations(url, resolve(process.env.MIGRATIONS_DIR ?? 'sql/migrations'));
} catch (err) {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
}

