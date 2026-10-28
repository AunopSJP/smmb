// สร้างบัญชีแอดมิน (คนแรก หรือช่างเพิ่ม) จากเครื่องเซิร์ฟเวอร์ — ไม่มี route ให้สมัครเป็นแอดมินเอง
//   npm run admin:create -- 0812345678 "ชื่อแอดมิน"        (dev — build แล้วอ่าน .env)
//   node dist/db/create-admin-cli.js 0812345678 "ชื่อ"    (เซิร์ฟเวอร์จริง — ต้องมี DATABASE_URL ใน env)
// ได้รหัสผ่านชั่วคราว (แสดงครั้งเดียว) → ล็อกอินแล้วระบบบังคับเปลี่ยนรหัส + ยอมรับข้อตกลงก่อนใช้งาน
// เบอร์ที่มีบัญชีอยู่แล้วใช้ไม่ได้ — แอดมินมีบทบาทอื่นร่วมไม่ได้ (ช่างใช้เบอร์แยก)
import pg from 'pg';
import { normalizePhone } from '../auth/phone.js';
import { PasswordService } from '../auth/password.service.js';
import { newTempPassword } from '../common/codes.js';

const url = process.env.DATABASE_URL;
const phone = normalizePhone(process.argv[2]);
const name = (process.argv[3] ?? '').trim();
if (!url || !phone || !name || name.length > 100) {
  console.error('usage: create-admin-cli <phone 0812345678> <name>   (DATABASE_URL required)');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const temp = newTempPassword();
  const hash = await new PasswordService().hash(temp);
  await client.query('BEGIN');
  const { rows } = await client.query<{ user_id: string }>(
    `INSERT INTO app.user_tb (phone, name, display_name, password_hash, must_change_password)
     VALUES ($1, $2, $2, $3, true) ON CONFLICT (phone) DO NOTHING RETURNING user_id`,
    [phone, name, hash],
  );
  if (!rows[0]) {
    await client.query('ROLLBACK');
    console.error(`✗ ${phone} already has an account — admins need their own phone number`);
    process.exitCode = 1;
  } else {
    await client.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'admin')`, [rows[0].user_id]);
    await client.query('COMMIT');
    console.log(`✓ admin ${rows[0].user_id} (${phone}) created`);
    console.log(`  temporary password: ${temp}`);
    console.log('  sign in and change it right away — it is not shown again');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(`✗ ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
