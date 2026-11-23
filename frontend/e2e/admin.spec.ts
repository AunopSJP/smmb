import { expect, test } from '@playwright/test';
import { BoxSim, DEMO, adminApi, boxInfo, signIn } from './helpers/stack';

test('หัวเมนูแอดมินบนเดสก์ท็อปแสดงรูปโลโก้', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, DEMO.admin, DEMO.password, /\/admin/);
  const logo = page.locator('aside .brand img.logo');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test('ไอคอนติดตั้งใช้ URL ใหม่และโหลดได้ทุกขนาด', async ({ page, request }) => {
  await page.goto('/');
  const manifestUrl = await page.locator('link[rel="manifest"]').evaluate((link: HTMLLinkElement) => link.href);
  const manifestResponse = await request.get(manifestUrl);
  expect(manifestResponse.ok()).toBe(true);
  const manifest: { icons: { src: string }[] } = await manifestResponse.json();
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(touchIcon).toMatch(/^icons\/v\d+\/icon-192x192\.png$/);
  expect(manifest.icons.map(({ src }) => src)).toContain(touchIcon);
  for (const { src } of manifest.icons) {
    expect(src).toMatch(/^icons\/v\d+\//);
    const response = await request.get(new URL(src, manifestUrl).href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
});

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
