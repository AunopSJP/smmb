import { expect, test } from '@playwright/test';
import { BoxSim, adminApi, newPhone, registerBox } from './helpers/stack';

/** เส้น a: เจ้าของบ้าน สมัคร → ผูกตู้ด้วยรหัสเปิดใช้ → ตั้งชื่อ → เห็นสถานะตู้บนหน้าหลัก */
test('เจ้าของบ้านสมัคร ผูกตู้ ตั้งชื่อ แล้วเห็นสถานะตู้', async ({ page }) => {
  const admin = await adminApi();
  const box = await registerBox(admin);
  const phone = newPhone();
  const next = () => page.getByRole('button', { name: 'ถัดไป' });

  await page.goto('/auth/signup/owner');
  await page.getByLabel('ชื่อ - นามสกุล').fill('เจ้าของ อีทูอี');
  await page.getByLabel('เบอร์โทรศัพท์').fill(phone);
  await page.getByLabel('รหัสผ่าน').fill('pass1234');
  await next().click();

  // ขั้น 2 · ที่อยู่บ้าน
  await expect(page.getByText('ขั้น 2 จาก 4')).toBeVisible();
  await page.getByLabel('บ้านเลขที่', { exact: true }).fill('12/3');
  await page.getByLabel('ที่อยู่ (ซอย').fill('ซอยทดสอบ 1');
  await page.getByLabel('แขวง / ตำบล').fill('บางนา');
  await page.getByLabel('เขต / อำเภอ').fill('บางนา');
  await page.getByLabel('จังหวัด').fill('กรุงเทพมหานคร');
  await page.getByLabel('รหัสไปรษณีย์').fill('10260');
  await next().click();

  // ขั้น 3 · รายละเอียดบ้าน (ประเภทบ้านเป็นตัวเลือกแบบปุ่ม · จำนวนคนมีปุ่ม + / −)
  await expect(page.getByText('ขั้น 3 จาก 4')).toBeVisible();
  await page.getByLabel('บ้านเดี่ยว').check();
  const people = page.getByLabel('จำนวนผู้อยู่อาศัย (คน)');
  await page.getByRole('button', { name: 'เพิ่มจำนวนผู้อยู่อาศัย' }).click();
  await page.getByRole('button', { name: 'เพิ่มจำนวนผู้อยู่อาศัย' }).click();
  await expect(people).toHaveValue('2');
  await next().click();

  // ขั้น 4 · ตรวจและยืนยัน
  await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
  await expect(page.getByText('12/3 ซอยทดสอบ 1 บางนา บางนา กรุงเทพมหานคร 10260')).toBeVisible();

  await page.locator('.terms input[type=checkbox]').check();
  await page.getByRole('button', { name: 'สมัครและไปผูกตู้' }).click();
  await expect(page).toHaveURL(/\/auth\/activate/);

  await page.getByRole('button', { name: 'พิมพ์รหัสใต้ QR' }).click();
  await page.getByPlaceholder('เช่น K7M2-QX9A').fill(box.activate);
  await page.getByRole('button', { name: 'ผูกตู้', exact: true }).click();
  await expect(page).toHaveURL((u) => u.pathname === '/auth/activate/name' && u.searchParams.get('box') === box.id);

  await page.getByLabel('ชื่อตู้').fill('ตู้อีทูอี');
  await page.getByRole('button', { name: 'บันทึกชื่อตู้' }).click();
  await expect(page.getByText('ตู้เป็นของคุณแล้ว')).toBeVisible();

  // ยังไม่มีตู้ออนไลน์ → หน้าหลักบอกว่าไม่ออนไลน์
  await page.getByRole('button', { name: 'ไปหน้าหลัก' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText('ตู้อีทูอี').first()).toBeVisible();
  await expect(page.getByText('บ้านเลขที่ 12/3')).toBeVisible();
  await expect(page.getByRole('status').getByText('ตู้ไม่ออนไลน์')).toBeVisible();

  // ตู้จำลองต่อเข้า → รีเฟรชแล้วสถานะต้องเปลี่ยนเป็นออนไลน์
  const sim = new BoxSim(box);
  try {
    await sim.boot();
    sim.start();
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole('status').getByText('ตู้ไม่ออนไลน์')).toHaveCount(0);
      await expect(page.getByText('ยังไม่เคยติดต่อ')).toHaveCount(0);
    }).toPass({ timeout: 20_000 });
  } finally {
    await sim.stop();
  }
});
