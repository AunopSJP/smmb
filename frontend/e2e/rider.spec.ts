import { expect, test } from '@playwright/test';
import { adminApi, signupOwnerWithBox, type TestBox } from './helpers/stack';

const delivered = async (api: Awaited<ReturnType<typeof signupOwnerWithBox>>['api'], box: TestBox): Promise<number> => {
  const res = await api.get(`/api/v1/boxes/${box.id}/events?type=delivered&per_page=100`);
  const body = (await res.json()) as { data?: unknown[]; items?: unknown[] };
  return (body.data ?? body.items ?? []).length;
};

/** เส้น c: ไรเดอร์ (ไม่ล็อกอิน) เปิดลิงก์ QR → ส่งของ → สำเร็จ · ใช้ตั๋วซ้ำไม่ได้ · เกิน 5 ครั้ง/ชม. ถูกจำกัด */
test('ไรเดอร์ส่งของสำเร็จ ตั๋วใช้ซ้ำไม่ได้ และส่งเกิน 5 ครั้ง/ชม. ถูกจำกัด', async ({ page, request }) => {
  const owner = await signupOwnerWithBox(await adminApi());
  const path = new URL(owner.box.frontUrl).pathname;
  expect(path).toMatch(/^\/b\//);

  // ส่งครั้งที่ 1 — จับ request ที่ยิงตอนกดปุ่ม เพื่อเอาตั๋วไปลองใช้ซ้ำ
  await page.goto(path);
  await expect(page.getByText('คุณกำลังส่งของที่บ้านเลขที่')).toBeVisible();
  const post = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/public/') && r.postData() !== null);
  await page.getByRole('button', { name: 'วางของในตู้แล้ว' }).click();
  const used = await post;
  await expect(page.getByRole('heading', { name: 'ส่งสำเร็จ' })).toBeVisible();
  expect(await delivered(owner.api, owner.box)).toBe(1);

  // เปิดหน้าสำเร็จ/ย้อนกลับ/รีโหลดแล้วต้องไม่นับซ้ำ
  await page.reload();
  expect(await delivered(owner.api, owner.box)).toBe(1);

  // ยิงตั๋วใบเดิมซ้ำ → ถูกปฏิเสธ และยังนับ 1
  const replay = await request.post(used.url(), { data: JSON.parse(used.postData()!) });
  expect(replay.ok()).toBe(false);
  expect([404, 409, 410]).toContain(replay.status());
  expect(await delivered(owner.api, owner.box)).toBe(1);

  // ส่งต่อจนครบ 5 แล้วครั้งที่ 6 ต้องเห็นหน้าจำกัด
  for (let i = 2; i <= 5; i++) {
    await page.goto(path);
    await page.getByRole('button', { name: 'วางของในตู้แล้ว' }).click();
    await expect(page.getByRole('heading', { name: 'ส่งสำเร็จ' })).toBeVisible();
  }
  expect(await delivered(owner.api, owner.box)).toBe(5);

  await page.goto(path);
  await page.getByRole('button', { name: 'วางของในตู้แล้ว' }).click();
  await expect(page.getByRole('heading', { name: 'แจ้งส่งของบ่อยเกินไป' })).toBeVisible();
  expect(await delivered(owner.api, owner.box)).toBe(5);
});
