#!/usr/bin/env node
/**
 * ลบโฟลเดอร์ mock database ที่ค้างใน backend/
 * - ค่าเริ่มต้น: เก็บ `.mockdb` ไว้ (ฐานที่ใช้ประจำ) ลบเฉพาะ `.mockdb-*`
 * - `--all`: ลบ `.mockdb` ด้วย (ใช้เมื่อต้องการเริ่มฐานใหม่ทั้งหมด)
 * - `--dry-run`: แสดงรายการที่จะลบโดยไม่ลบจริง
 *
 * ใช้: npm --prefix backend run mock:clean [-- --all] [--dry-run]
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');
const dry = process.argv.includes('--dry-run');

const size = (dir) => {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += size(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
};

const targets = readdirSync(backend, { withFileTypes: true })
  .filter((e) => e.isDirectory() && (e.name === '.mockdb' || e.name.startsWith('.mockdb-')))
  .filter((e) => (all ? true : e.name !== '.mockdb'))
  .map((e) => e.name);

if (!targets.length) {
  console.log('ไม่มีโฟลเดอร์ mock ที่ต้องลบ');
  process.exit(0);
}

let bytes = 0;
for (const name of targets) {
  const dir = join(backend, name);
  const n = existsSync(dir) ? size(dir) : 0;
  bytes += n;
  console.log(`${dry ? 'จะลบ' : 'ลบ'} ${name} (${(n / 1024 / 1024).toFixed(1)} MB)`);
  if (!dry) rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${dry ? 'จะคืนพื้นที่' : 'คืนพื้นที่'} ${(bytes / 1024 / 1024).toFixed(1)} MB · ${targets.length} โฟลเดอร์`);
if (!all) console.log('เก็บ .mockdb ไว้ · ใช้ --all เพื่อลบทั้งหมด');
