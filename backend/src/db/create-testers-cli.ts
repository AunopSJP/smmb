// สร้างบัญชีทีมทดสอบ (1 คน 1 บทบาท) + หน่วยงานทดสอบที่อนุมัติแล้ว + โซนตรวจทั้งวัน — รันบนเครื่องเซิร์ฟเวอร์
//   npm run testers:create -- --owner 0924320342 "ชื่อ" --officer 0876543210 "ชื่อ" --head 0839596313 "ชื่อ"
//   node dist/db/create-testers-cli.js …                     (เซิร์ฟเวอร์จริง — ต้องมี DATABASE_URL ใน env)
// ได้รหัสผ่านชั่วคราว (แสดงครั้งเดียว) → ล็อกอินแล้วระบบบังคับเปลี่ยนรหัส + ยอมรับข้อตกลงก่อนใช้งาน
// เจ้าของบ้านยังไม่ผูกตู้ (ทดสอบผูกเองด้วย QR เปิดใช้ตู้) · หัวหน้าเพิ่มบ้านเข้าโซนเอง · เบอร์ที่มีบัญชีอยู่แล้วจะข้าม ไม่แก้ของเดิม
import pg from 'pg';
import { normalizePhone } from '../auth/phone.js';
import { PasswordService } from '../auth/password.service.js';
import { newGroupCode, newTempPassword } from '../common/codes.js';

type Role = 'owner' | 'officer' | 'head';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
// CLI นี้สร้าง "หน่วยงานทดสอบ + โซน 00:00–23:59" — ห้ามรันบน production เด็ดขาด
if (process.env.NODE_ENV === 'production') {
  console.error('refusing to create tester accounts with NODE_ENV=production');
  process.exit(1);
}
const people: { role: Role; phone: string; name: string }[] = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 3) {
  const role = args[i]?.replace(/^--/, '') as Role;
  const phone = normalizePhone(args[i + 1]);
  const name = (args[i + 2] ?? '').trim();
  if (!['owner', 'officer', 'head'].includes(role) || !phone || !name || name.length > 100) {
    console.error('usage: create-testers-cli --owner <phone> <name> --officer <phone> <name> --head <phone> <name>   (DATABASE_URL required)');
    process.exit(2);
  }
  people.push({ role, phone, name });
}
if (!url || !people.length) {
  console.error('usage: create-testers-cli --owner <phone> <name> --officer <phone> <name> --head <phone> <name>   (DATABASE_URL required)');
  process.exit(2);
}

const AGENCY = 'หน่วยงานทดสอบ (ทีม SMMB)';
const client = new pg.Client({ connectionString: url });
await client.connect();
const passwords = new PasswordService();
try {
  await client.query('BEGIN');
  // หน่วยงานทดสอบ (ใช้ของเดิมถ้าเคยสร้างแล้ว) + โซนตรวจทั้งวัน
  let agency = (await client.query<{ agency_id: string; group_code: string }>(`SELECT agency_id, group_code FROM app.agency_tb WHERE name = $1`, [AGENCY])).rows[0];
  if (!agency && people.some((p) => p.role !== 'owner')) {
    agency = (
      await client.query<{ agency_id: string; group_code: string }>(
        `INSERT INTO app.agency_tb (name, type, status, group_code, contact, approved_date)
         VALUES ($1, 'other', 'approved', $2, 'ทีมทดสอบ SMMB', now()) RETURNING agency_id, group_code`,
        [AGENCY, newGroupCode()],
      )
    ).rows[0];
  }
  let zone: string | null = null;
  if (agency) {
    zone = (await client.query<{ zone_id: string }>(`SELECT zone_id FROM app.zone_tb WHERE agency_id = $1 AND name = 'โซนทดสอบ (ทั้งวัน)' AND deleted_date IS NULL`, [agency.agency_id])).rows[0]?.zone_id ?? null;
    if (!zone) {
      zone = (await client.query<{ zone_id: string }>(`INSERT INTO app.zone_tb (agency_id, name) VALUES ($1, 'โซนทดสอบ (ทั้งวัน)') RETURNING zone_id`, [agency.agency_id])).rows[0].zone_id;
      await client.query(`INSERT INTO app.zone_window_tb (zone_id, start_time, end_time) VALUES ($1, '00:00', '23:59')`, [zone]);
    }
  }

  const out: string[] = [];
  for (const p of people) {
    const temp = newTempPassword();
    const { rows } = await client.query<{ user_id: string }>(
      `INSERT INTO app.user_tb (phone, name, display_name, password_hash, must_change_password)
       VALUES ($1, $2, $2, $3, true) ON CONFLICT (phone) DO NOTHING RETURNING user_id`,
      [p.phone, p.name, await passwords.hash(temp)],
    );
    const id = rows[0]?.user_id;
    if (!id) {
      out.push(`✗ ${p.role.padEnd(7)} ${p.phone}  มีบัญชีอยู่แล้ว — ข้าม (ไม่แก้บัญชีเดิม)`);
      continue;
    }
    if (p.role === 'owner') {
      await client.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'owner')`, [id]);
      await client.query(`INSERT INTO app.user_plan_tb (user_id, plan_code) SELECT $1, plan_code FROM app.plan_tb WHERE is_default`, [id]);
    } else {
      // หัวหน้า = เจ้าหน้าที่ + is_head ในหน่วยงาน (เหมือนข้อมูลจริง)
      await client.query(`INSERT INTO app.user_role_tb (user_id, role) VALUES ($1, 'officer')`, [id]);
      await client.query(
        `INSERT INTO app.agency_member_tb (agency_id, user_id, is_head, status, decided_date) VALUES ($1, $2, $3, 'active', now())`,
        [agency!.agency_id, id, p.role === 'head'],
      );
      await client.query(`INSERT INTO app.zone_officer_tb (zone_id, user_id) VALUES ($1, $2)`, [zone, id]);
    }
    out.push(`✓ ${p.role.padEnd(7)} ${p.phone}  ${p.name}  temporary password: ${temp}`);
  }
  await client.query('COMMIT');
  console.log(out.join('\n'));
  if (agency) console.log(`\nหน่วยงาน "${AGENCY}" · รหัสกลุ่ม ${agency.group_code.slice(0, 4)}-${agency.group_code.slice(4)} · โซน "โซนทดสอบ (ทั้งวัน)" 00:00–23:59`);
  console.log('ส่งรหัสชั่วคราวให้แต่ละคนเป็นการส่วนตัว — ล็อกอินแล้วต้องเปลี่ยนรหัสทันที (ไม่แสดงซ้ำ)');
} catch (err) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(`✗ ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
