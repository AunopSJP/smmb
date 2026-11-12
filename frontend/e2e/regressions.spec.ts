import { expect, test } from '@playwright/test';
import { newPhone } from './helpers/stack';

/** กันบั๊กที่เคยแก้ใน FLOW_AND_GAPS 3.2-c — ทุกข้อทดสอบที่ 375x812 แบบผู้ใช้จริง */

test('เปิดลิงก์ตรงตอนยังไม่ล็อกอินต้องไม่เสีย ?next=', async ({ page }) => {
  // หน้าสมัครต้องเปิดได้ ไม่ถูกเด้งไป signin
  await page.goto('/auth/choose');
  await expect(page.getByText('เลือกให้ตรงกับคุณ')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/auth/choose');

  // หน้าที่ต้องล็อกอิน → signin พร้อม next ชี้หน้าเดิม (ไม่ใช่ "/")
  await page.goto('/home/history');
  await page.waitForURL(/\/auth\/signin/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/home/history');
});

const rgb = (s: string): [number, number, number] => {
  const m = s.match(/\d+(\.\d+)?/g)!.map(Number);
  return [m[0]!, m[1]!, m[2]!];
};

test('ช่องบังคับที่ว่างต้องมีขอบสีเตือนหลังกดถัดไป', async ({ page }) => {
  await page.goto('/auth/signup/owner');
  const name = page.getByLabel('ชื่อ - นามสกุล');
  const phone = page.getByLabel('เบอร์โทรศัพท์');
  const border = (l: typeof name) => l.evaluate((el) => getComputedStyle(el).borderTopColor);

  const before = await border(name);
  await phone.fill('0911111111'); // ช่องนี้กรอกแล้ว ใช้เทียบกับขอบปกติ
  await page.getByRole('button', { name: 'ถัดไป' }).click();

  const bad = rgb(await border(name));
  expect(await border(name)).not.toBe(before);
  expect(bad[0]).toBeGreaterThan(bad[1] + 40); // เป็นโทนแดง/เตือน
  expect(bad[0]).toBeGreaterThan(bad[2] + 40);
  expect(await border(phone)).toBe(before); // ช่องที่ครบแล้วต้องไม่ขึ้นเตือน
  await expect(page.locator('#signup-error, [role=alert]').first()).toBeVisible();
});

test('ปุ่มหลักของฟอร์มกดครั้งเดียวติด แม้เพิ่งพิมพ์ช่องสุดท้าย', async ({ page }) => {
  await page.goto('/auth/signup/owner');
  await page.getByLabel('ชื่อ - นามสกุล').fill('ทดสอบ กดครั้งเดียว');
  await page.getByLabel('เบอร์โทรศัพท์').fill(newPhone());
  const pw = page.getByLabel('รหัสผ่าน');
  await pw.click();
  await pw.pressSequentially('pass1234'); // โฟกัสค้างที่ช่องสุดท้าย แล้วแตะปุ่มทันที

  const btn = page.getByRole('button', { name: 'ถัดไป' });
  await btn.scrollIntoViewIfNeeded();
  const b = (await btn.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); // คลิกจริงที่พิกัดเดิมครั้งเดียว ไม่ retry
  await expect(page.getByText('ขั้น 2 จาก 3')).toBeVisible({ timeout: 3_000 });
});
