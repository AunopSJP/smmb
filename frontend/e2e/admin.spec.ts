import { expect, test } from '@playwright/test';
import { BoxSim, DEMO, adminApi, boxInfo, signIn } from './helpers/stack';

/** เส้น e: แอดมิน ลงทะเบียนตู้ → เห็น QR 3 ใบ → ทดสอบปลุกตู้ผ่านตู้จำลอง */
test('แอดมินลงทะเบียนตู้ เห็น QR 3 ใบ และทดสอบปลุกตู้ผ่านตู้จำลอง', async ({ page }) => {
  await signIn(page, DEMO.admin, DEMO.password, /\/admin/);
  await page.goto('/admin/boxes');
  await page.getByRole('button', { name: 'สร้าง', exact: true }).click();

  const reg = page.locator('.reg').first();
  await expect(page.getByText('ลงทะเบียนแล้ว')).toBeVisible();
  const boxId = (await reg.locator('strong').first().innerText()).trim();
  expect(boxId).toMatch(/^BX-\d{5,}$/);
  const secret = (await reg.locator('code.secret').innerText()).trim();
  expect(secret).toMatch(/^[0-9a-f]{64}$/);

  // QR 3 ใบ: หน้าตู้ · สำรอง · เปิดใช้ตู้ — แต่ละใบมีรูป QR และรหัสใต้ QR ครบ
  const figs = reg.locator('figure');
  await expect(figs).toHaveCount(3);
  for (const label of ['QR หน้าตู้', 'QR สำรอง', 'QR เปิดใช้ตู้']) await expect(reg.locator('figcaption', { hasText: label })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await expect(figs.nth(i).locator('img, canvas, svg').first()).toBeVisible();
    expect(await figs.nth(i).locator('figcaption strong').innerText()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  }

  // ข้อมูลที่เห็นบนจอตรงกับ API แอดมิน
  const box = await boxInfo(await adminApi(), boxId);
  expect(box.secret).toBe(secret);

  // ตู้จำลองถือ long-poll → ปลุกจากหน้า D04
  const sim = new BoxSim(box);
  try {
    sim.start('live');
    await page.goto(`/admin/boxes/detail?id=${boxId}`);
    await page.getByRole('tab', { name: 'ทดสอบ' }).click();
    await page.getByRole('button', { name: 'ทดสอบปลุกตู้ + กล้อง' }).click();
    await expect(page.getByRole('status')).toContainText('ผ่าน', { timeout: 40_000 });
  } finally {
    await sim.stop();
  }
});
