#!/usr/bin/env node
// โหมด mock: รัน backend ได้ทันทีโดยไม่ต้องติดตั้ง PostgreSQL / Redis / Docker
//   npm run dev:mock            (build แล้วรันสคริปต์นี้)
//   npm run dev:mock -- --reset (ล้างข้อมูล mock แล้วเริ่มใหม่)
//
// - ฐานข้อมูล = PGlite (Postgres ตัวจริงที่ฝังในโปรแกรม) เก็บในโฟลเดอร์ backend/.mockdb/ → ปิดเปิดใหม่ข้อมูลยังอยู่
// - ครั้งแรกใส่ข้อมูลจำลอง: แอดมิน · เจ้าของบ้าน · หน่วยงาน + หัวหน้า + เจ้าหน้าที่ · โซนตรวจทั้งวัน · ตู้ BX-00001 (ผูกแล้ว) + BX-00002 (ยังไม่ผูก)
// - ไม่มี Redis ก็ทำงานได้ (rate limit ปล่อยผ่าน) · ทุกคำขอจากตู้พิมพ์ลง console
// - สร้าง VAPID key ให้เอง (.mockdb.vapid.json) · เจ้าหน้าที่ไม่ถูกบังคับเปิดแจ้งเตือน (SKIP_PUSH_REQUIRED)
// - ใช้ตอน dev / ทดสอบบอร์ดเท่านั้น — ห้ามใช้กับเซิร์ฟเวอร์จริง
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import webpush from 'web-push';

if (process.env.NODE_ENV === 'production') {
  console.error('dev:mock refuses to run with NODE_ENV=production');
  process.exit(1);
}

const DATA_DIR = resolve(process.env.SMMB_MOCK_DATA_DIR?.trim() || '.mockdb');
const dataDirRelative = relative(resolve('.'), DATA_DIR);
if (!dataDirRelative || dataDirRelative === '..' || dataDirRelative.startsWith(`..${sep}`) || isAbsolute(dataDirRelative)) {
  console.error('SMMB_MOCK_DATA_DIR must stay inside the backend workspace (for example .mockdb-sales-demo)');
  process.exit(1);
}
const DB_PORT = Number(process.env.MOCK_DB_PORT ?? 54329);
const PASSWORD = 'demo1234'; // ตรงกับข้อมูลจำลองของหน้าเว็บ (frontend core/mock)
const LAN_IPS = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address);
const demoHost = process.env.SMMB_DEMO_HOST?.trim() || LAN_IPS[0] || 'localhost';
const publicUrl = new URL(process.env.PUBLIC_BASE_URL || `http://${demoHost}:4200`);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (loopbackHosts.has(publicUrl.hostname) && demoHost !== 'localhost') publicUrl.hostname = demoHost;
const publicBaseUrl = publicUrl.toString().replace(/\/$/, '');
const publicHost = publicUrl.hostname;

if (process.argv.includes('--reset') && existsSync(DATA_DIR)) {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('mock data cleared');
}

// ค่า env ที่ขาด → ใช้ค่า dev (ของจริงต้องตั้งเองใน .env)
const defaults = {
  NODE_ENV: 'development',
  PORT: '3000',
  REDIS_URL: 'redis://127.0.0.1:6379',
  PUBLIC_BASE_URL: publicBaseUrl,
  QR_ALLOWED_HOSTS: `${publicHost},localhost`,
  BOX_MASTER_KEY: 'smmb-mock-master-key-dev-only-0000000000',
  QR_SIGNING_KEY: 'smmb-mock-qr-signing-key-dev-only-000000',
};
for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v;
process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?sslmode=disable`;
process.env.DB_POOL_MAX = '1'; // PGlite มี session เดียว → ต่อทีละ connection (transaction ไม่ปนกัน)
process.env.BOX_REQUEST_LOG = '1';
// เจ้าหน้าที่ใช้งานได้แม้ยังไม่เปิดแจ้งเตือน (มือถือทดสอบอาจยังลงเว็บแอปไม่ได้) — ของจริงยังบังคับตามเดิม
process.env.SKIP_PUSH_REQUIRED = '1';
// ไม่มี VAPID key → สร้างให้แล้วเก็บไว้ (ใช้ชุดเดิมทุกครั้ง — เปลี่ยน = เครื่องที่เปิดแจ้งเตือนไว้ต้องเปิดใหม่)
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  const file = resolve('.mockdb.vapid.json');
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(webpush.generateVAPIDKeys()));
  const keys = JSON.parse(readFileSync(file, 'utf8'));
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT ||= 'mailto:dev@example.com';
}

// 1) ฐานข้อมูลฝังในโปรแกรม + เปิดพอร์ตให้ pg ต่อเหมือน Postgres ปกติ
const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { btree_gist } });
const socket = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 4 });
await socket.start();

// 2) migration + ข้อมูลจำลอง (ครั้งแรกเท่านั้น)
const { runMigrations } = await import('../dist/db/migrate.js');
await runMigrations(process.env.DATABASE_URL, resolve('sql/migrations'), () => undefined);
const { deviceSecret, frontQrToken, newActivateToken, newPrintCode, showPrintCode } = await import('../dist/box/box-crypto.js');
const { PasswordService } = await import('../dist/auth/password.service.js');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const seeded = (await client.query(`SELECT 1 FROM app.user_tb WHERE phone = '0800000001'`)).rowCount > 0;
if (!seeded) await seed(client);
const boxes = (
  await client.query(`
    SELECT b.box_id, b.owner_user_id IS NOT NULL AS bound, b.house_no,
           (SELECT print_code FROM app.box_qr_code_tb q WHERE q.box_id = b.box_id AND q.slot = 'activate' AND q.status = 'active') AS activate_code
    FROM app.box_tb b ORDER BY b.box_id LIMIT 10`)
).rows;
await client.end();

// 3) บอกข้อมูลที่ต้องใช้ แล้วเปิดเซิร์ฟเวอร์
const port = process.env.PORT;
const line = '─'.repeat(78);
console.log(`\n${line}\n SMMB backend — โหมด mock (ข้อมูลอยู่ ${DATA_DIR})${seeded ? '' : ' · ใส่ข้อมูลจำลองแล้ว'}\n${line}`);
console.log(` URL ให้บอร์ด ESP32 (วงแลนเดียวกัน): ${LAN_IPS.map((ip) => `http://${ip}:${port}`).join('  ') || '(ไม่พบ IP วงแลน)'}`);
console.log(` URL เว็บและ QR สำหรับมือถือ: ${publicBaseUrl}`);
console.log(` บนเครื่องนี้: http://localhost:${port}/api/health/live`);
console.log(`\n ตู้ (เขียน box_id + device_secret ลงบอร์ด):`);
for (const b of boxes) {
  console.log(`   ${b.box_id}  ${b.bound ? `ผูกแล้ว บ้าน ${b.house_no}` : `ยังไม่ผูก · รหัสผูกตู้ ${b.activate_code ? showPrintCode(b.activate_code) : '-'}`}`);
  console.log(`     device_secret = ${deviceSecret(process.env.BOX_MASTER_KEY, b.box_id)}`);
}
console.log(`\n บัญชีจำลอง (รหัสผ่าน ${PASSWORD}): แอดมิน 0800000001 · เจ้าของบ้าน 0812345678 · หัวหน้า 0823456789 · เจ้าหน้าที่ 0834567890`);
console.log(` ทดสอบปลุกตู้: ล็อกอินแอดมิน → ตู้ → เลือกตู้ → "ทดสอบปลุกตู้ + กล้อง" · ติดตั้งตู้ใหม่: เมนู "งานช่าง (ติดตั้ง)"`);
console.log(` ไม่มีบอร์ด: npm run box:sim -- live --url http://localhost:${port} --box BX-00001 --secret <device_secret>`);
console.log(`   (ทำตัวเหมือนบอร์ด: boot → ถือ long-poll · งานทดสอบผ่านเอง · งานตรวจให้วางข้อความ QR ประจำตัวจากปุ่มในหน้า O06)`);
console.log(`${line}\n`);

const stop = async () => {
  await socket.stop().catch(() => undefined);
  await db.close().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await import('../dist/main.js');

// ── ข้อมูลจำลอง ─────────────────────────────────────────────────────────
async function seed(c) {
  const hash = await new PasswordService().hash(PASSWORD);
  const q = (sql, params) => c.query(sql, params);
  await q('BEGIN');
  try {
    const terms = (await q(`SELECT terms_version FROM app.terms_tb WHERE published_date <= now() ORDER BY published_date DESC LIMIT 1`)).rows[0]
      ?.terms_version;
    const user = async (phone, name, houseNo, role) => {
      const id = (
        await q(`INSERT INTO app.user_tb (phone, name, display_name, house_no, password_hash) VALUES ($1, $2, $2, $3, $4) RETURNING user_id`, [
          phone,
          name,
          houseNo,
          hash,
        ])
      ).rows[0].user_id;
      await q(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, $2)`, [id, role]);
      if (terms) await q(`INSERT INTO app.terms_acceptance_tb (user_id, terms_version) VALUES ($1, $2)`, [id, terms]);
      return id;
    };

    const admin = await user('0800000001', 'แอดมิน (จำลอง)', null, 'admin');
    const owner = await user('0812345678', 'สมศรี ใจดี', '99/9', 'owner');
    await q(`INSERT INTO app.user_plan_tb (user_id, plan_code) VALUES ($1, 'free')`, [owner]);
    const head = await user('0823456789', 'ร.ต.อ. หัวหน้า', null, 'officer');
    const officer = await user('0834567890', 'ส.ต.ต. สมชาย', null, 'officer');

    const agency = (
      await q(
        `INSERT INTO app.agency_tb (name, type, status, group_code, contact, approved_by, approved_date)
         VALUES ('สภ.เมือง (จำลอง)', 'police', 'approved', 'PX7K2MQ9', 'สถานี 02-111-2222', $1, now()) RETURNING agency_id`,
        [admin],
      )
    ).rows[0].agency_id;
    await q(`INSERT INTO app.agency_member_tb (agency_id, user_id, is_head, status, decided_by, decided_date) VALUES ($1, $2, true, 'active', $3, now())`, [
      agency,
      head,
      admin,
    ]);
    await q(`INSERT INTO app.agency_member_tb (agency_id, user_id, status, decided_by, decided_date) VALUES ($1, $2, 'active', $3, now())`, [
      agency,
      officer,
      head,
    ]);
    // โซนตรวจทั้งวัน → บอร์ดถือ long-poll ได้ตลอดเวลาที่ทดสอบ
    const zone = (await q(`INSERT INTO app.zone_tb (agency_id, name) VALUES ($1, 'สาย 1 (ทั้งวัน)') RETURNING zone_id`, [agency])).rows[0].zone_id;
    await q(`INSERT INTO app.zone_window_tb (zone_id, start_time, end_time) VALUES ($1, '00:00', '23:59')`, [zone]);
    await q(`INSERT INTO app.zone_officer_tb (zone_id, user_id) VALUES ($1, $2), ($1, $3)`, [zone, head, officer]);

    const box = async (bound) => {
      const id = (await q(`INSERT INTO app.box_tb (registered_by) VALUES ($1) RETURNING box_id`, [admin])).rows[0].box_id;
      for (const slot of ['1', '2']) {
        await q(`INSERT INTO app.box_qr_code_tb (box_id, slot, token, print_code) VALUES ($1, $2, $3, $4)`, [
          id,
          slot,
          frontQrToken(process.env.QR_SIGNING_KEY, id, slot, 1),
          newPrintCode(),
        ]);
      }
      await q(`INSERT INTO app.box_qr_code_tb (box_id, slot, token, print_code, status) VALUES ($1, 'activate', $2, $3, $4)`, [
        id,
        newActivateToken(),
        newPrintCode(),
        bound ? 'used' : 'active',
      ]);
      if (bound) {
        await q(`UPDATE app.box_tb SET owner_user_id = $2, house_no = '99/9', name = 'ตู้หน้าบ้าน', bound_date = now() WHERE box_id = $1`, [id, owner]);
        await q(`INSERT INTO app.zone_box_tb (zone_id, box_id) VALUES ($1, $2)`, [zone, id]);
      }
    };
    await box(true); // BX-00001
    await box(false); // BX-00002
    await q('COMMIT');
  } catch (err) {
    await q('ROLLBACK');
    throw err;
  }
}
