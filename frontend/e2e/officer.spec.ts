import { expect, test, type Page } from '@playwright/test';
import { BoxSim, DEMO, adminApi, boxInfo, enableDevTools, signIn, type TestBox } from './helpers/stack';

let box: TestBox;
let sim: BoxSim;

test.beforeEach(async () => {
  box = await boxInfo(await adminApi(), 'BX-00001'); // ตู้เดโมที่อยู่ในโซนของเจ้าหน้าที่เดโม
  sim = new BoxSim(box);
  sim.start();
});
test.afterEach(async () => sim.stop());

/** เจ้าหน้าที่พิมพ์รหัสใต้ QR หน้าตู้ → ผ่านขั้น "QR เสียไหม" → รอตู้ตื่น */
async function startInspection(page: Page): Promise<string> {
  await signIn(page, DEMO.officer, DEMO.password, /\/officer$/);
  await page.goto('/officer/scan/code');
  await page.getByLabel('รหัสตู้').fill(box.front);
  const job = sim.nextJob();
  await page.getByRole('button', { name: 'ตรวจสอบรหัส' }).click();
  await page.getByText('ดูปกติ').click();
  await page.getByRole('button', { name: /ส่ง แล้วตรวจต่อ/ }).click();
  await expect(page.getByText('กำลังปลุกตู้')).toBeVisible();
  const jobId = await job; // ตู้ตื่นเพราะเซิร์ฟเวอร์ปลุก long-poll
  await sim.ready(jobId);
  await expect(page.getByText('หันจอนี้เข้าหากล้องตู้')).toBeVisible();
  return jobId;
}

async function badgeText(page: Page): Promise<string> {
  await page.getByRole('button', { name: /คัดลอกข้อความ QR/ }).click();
  return page.evaluate(() => navigator.clipboard.readText());
}

test('เจ้าหน้าที่ตรวจตู้ผ่าน แล้วเจ้าของบ้านเห็นในประวัติ', async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await enableDevTools(ctx);
  const page = await ctx.newPage();
  const job = await startInspection(page);

  const qr = await badgeText(page);
  expect(qr.length).toBeGreaterThan(10);
  const out = await sim.result(job, 1, qr); // ตู้จำลองอ่าน QR ประจำตัวแล้วส่งให้เซิร์ฟเวอร์ตัดสิน
  expect(out).toContain('"status":"pass"');
  await expect(page).toHaveURL(/\/officer\/check\/done/);

  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  await signIn(ownerPage, DEMO.owner, DEMO.password, /\/home$/);
  await ownerPage.goto('/home/history');
  await expect(ownerPage.getByText('ส.ต.ต. สมชาย').first()).toBeVisible();
  await ctx.close();
  await owner.close();
});

test('ตู้อ่าน QR ไม่ผ่านครบ 3 ครั้ง → หน้าแจ้งปัญหาตู้', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const job = await startInspection(page);

  for (const attempt of [1, 2, 3]) {
    const out = await sim.result(job, attempt); // ไม่ส่ง text = อ่านไม่ได้
    expect(out).toContain(attempt < 3 ? '"status":"retry"' : '"status":"fail"');
  }
  await expect(page).toHaveURL(/\/officer\/check\/badge-failed/);
  await expect(page.getByRole('heading', { name: 'ตู้สแกนไม่ผ่าน' })).toBeVisible();
  await ctx.close();
});
