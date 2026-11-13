import { expect, test, type Page } from '@playwright/test';
import { adminApi, newPhone } from './helpers/stack';

/** ฟอร์มสมัครที่จัดใหม่เป็นขั้นเล็ก ๆ: เจ้าหน้าที่ (ของไม่บังคับพับไว้) · หน่วยงาน 4 ขั้น · เพิ่มบทบาทเจ้าของบ้าน (A15) 3 ขั้น */

async function approvedGroupCode(): Promise<string> {
  const admin = await adminApi();
  const res = await admin.get('/api/v1/admin/agencies');
  const list = (await res.json()) as { status: string; group_code: string | null }[];
  const g = list.find((a) => a.status === 'approved' && a.group_code)?.group_code;
  if (!g) throw new Error('no approved agency with a group code in the mock data');
  return g;
}

const next = (page: Page) => page.getByRole('button', { name: 'ถัดไป' });

test('เจ้าหน้าที่สมัคร: เลขประจำตัวและผู้ติดต่อฉุกเฉินพับไว้ แล้วต่อไปเพิ่มบทบาทเจ้าของบ้านได้ (A15 3 ขั้น)', async ({ page }) => {
  const group = await approvedGroupCode();
  const phone = newPhone();

  // ── สมัครเจ้าหน้าที่ ──
  await page.goto('/auth/signup/officer');
  await page.getByLabel('รหัสกลุ่มจากหัวหน้า').fill(group);
  await page.getByLabel('ชื่อ - นามสกุล (ยศ)').fill('เจ้าหน้าที่ สมัครใหม่');
  await page.getByLabel('ตำแหน่ง / ยศ').fill('ผบ.หมู่');
  const staffNo = page.getByLabel('เลขประจำตัว (ไม่บังคับ)');
  await expect(staffNo).toBeHidden(); // อยู่ในกลุ่มพับ ไม่รกฟอร์มหลัก
  await page.getByText('เลขประจำตัว และผู้ติดต่อฉุกเฉิน').click();
  await expect(staffNo).toBeVisible();
  await next(page).click();

  await expect(page.getByText('ขั้น 2 จาก 2')).toBeVisible();
  await page.getByLabel('เบอร์โทรศัพท์').fill(phone);
  await page.getByLabel('รหัสผ่าน').fill('pass1234');
  await page.locator('.terms input[type=checkbox]').check();
  await page.getByRole('button', { name: 'ส่งคำขอสมัคร' }).click();
  await expect(page).toHaveURL(/\/auth\/waiting/);

  // ── เพิ่มบทบาทเจ้าของบ้าน (A15) ──
  await page.goto('/auth/add/owner');
  await expect(page.getByText('ขั้น 1 จาก 3')).toBeVisible();
  await next(page).click(); // ว่างเปล่า → ต้องเตือนเป็นข้อความ ไม่ผ่าน
  await expect(page.getByRole('alert').first()).toContainText('บ้านเลขที่');
  await expect(page.getByText('ขั้น 1 จาก 3')).toBeVisible();

  await page.getByLabel('บ้านเลขที่', { exact: true }).fill('45/6');
  await page.getByLabel('ที่อยู่ (ซอย').fill('ซอยทดสอบ 2');
  await page.getByLabel('แขวง / ตำบล').fill('บางนา');
  await page.getByLabel('เขต / อำเภอ').fill('บางนา');
  await page.getByLabel('จังหวัด').fill('กรุงเทพมหานคร');
  await page.getByLabel('รหัสไปรษณีย์').fill('10260');
  await next(page).click();

  await expect(page.getByText('ขั้น 2 จาก 3')).toBeVisible();
  await next(page).click(); // ยังไม่เลือกประเภทบ้าน/จำนวนคน
  await expect(page.getByRole('alert').first()).toContainText('ประเภทบ้าน');
  await page.getByLabel('คอนโด / อพาร์ตเมนต์').check();
  await page.getByLabel('จำนวนผู้อยู่อาศัย (คน)').fill('2');
  await next(page).click();

  await expect(page.getByText('ขั้น 3 จาก 3')).toBeVisible();
  await expect(page.getByText('45/6 ซอยทดสอบ 2 บางนา บางนา กรุงเทพมหานคร 10260')).toBeVisible();
  await expect(page.getByText('คอนโด / อพาร์ตเมนต์ · 2 คน')).toBeVisible();
  await page.locator('.terms input[type=checkbox]').check();
  await page.getByRole('button', { name: 'เพิ่มบทบาทแล้วไปผูกตู้' }).click();
  await expect(page).toHaveURL(/\/auth\/activate/);
});

test('สมัครหน่วยงาน 4 ขั้น: ขั้นไหนขาดอะไรบอกเป็นข้อความ และสรุปก่อนส่งคำขอ', async ({ page }) => {
  const phone = newPhone();
  await page.goto('/auth/signup/agency');
  await expect(page.getByText('ขั้น 1 จาก 4')).toBeVisible();
  await next(page).click(); // ว่างเปล่า
  await expect(page.getByRole('alert').first()).toContainText('ชื่อหัวหน้า');

  await page.getByLabel('ชื่อหัวหน้า (ยศ)').fill('หัวหน้า ทดสอบ');
  await page.getByLabel('เบอร์โทรศัพท์').fill(phone);
  await page.getByLabel('รหัสผ่าน').fill('pass1234');
  await next(page).click();

  await expect(page.getByText('ขั้น 2 จาก 4')).toBeVisible();
  await next(page).click();
  await expect(page.getByRole('alert').first()).toContainText('ชื่อหน่วยงาน');
  await page.getByLabel('ชื่อหน่วยงาน').fill('สภ.ทดสอบสมัครใหม่');
  await page.getByLabel('ช่องทางติดต่อหน่วยงาน').fill('สถานี 02-111-2222');
  await page.getByLabel('ที่ตั้งหน่วยงาน').fill('ถ.ทดสอบ อ.เมือง');
  await next(page).click();

  await expect(page.getByText('ขั้น 3 จาก 4')).toBeVisible();
  await next(page).click(); // ขั้นนี้บังคับ เขต/อำเภอ จังหวัด และเบอร์หน่วยงาน
  await expect(page.getByRole('alert').first()).toContainText('ที่ตั้ง');
  await expect(page.getByText('ขั้น 3 จาก 4')).toBeVisible();
  await page.getByLabel('เขต / อำเภอ').fill('เมือง');
  await page.getByLabel('จังหวัด').fill('เชียงใหม่');
  await page.getByLabel('เบอร์โทรหน่วยงาน').fill('021112222');
  await next(page).click();

  await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
  await expect(page.getByText('สภ.ทดสอบสมัครใหม่').first()).toBeVisible();
  await expect(page.getByText('หัวหน้า ทดสอบ')).toBeVisible();
  await page.locator('.terms input[type=checkbox]').check();
  await page.getByRole('button', { name: 'ส่งคำขอหน่วยงาน' }).click();
  await expect(page).toHaveURL(/\/agency|\/auth\/pending|\/auth\/waiting/);
});
