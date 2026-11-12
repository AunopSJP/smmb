import { expect, test } from '@playwright/test';
import { DEMO, signIn } from './helpers/stack';

/** เส้น d: SOS ด้วยสอง browser context — เจ้าของ (บ้านเดโม) กด → เจ้าหน้าที่รับ → ปิดเรื่อง */
test('SOS: เจ้าของกด เจ้าหน้าที่เห็นและรับ เจ้าของเห็นชื่อ+เบอร์ แล้วปิดเรื่อง เบอร์ต้องหาย', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const officerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const officer = await officerCtx.newPage();
  await signIn(owner, DEMO.owner, DEMO.password, /\/home$/);
  await signIn(officer, DEMO.officer, DEMO.password, /\/officer$/);

  // เจ้าของกดค้าง 3 วินาที
  const sos = owner.getByRole('button', { name: /SOS ขอความช่วยเหลือ/ });
  await sos.scrollIntoViewIfNeeded();
  const box = (await sos.boundingBox())!;
  await owner.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await owner.mouse.down();
  await owner.waitForTimeout(3300);
  await owner.mouse.up();
  await expect(owner).toHaveURL(/\/home\/sos/);
  await expect(owner.getByText('ยังไม่มีคนรับ').first()).toBeVisible();

  // เจ้าหน้าที่เห็นในรายการ SOS แล้วรับเรื่อง
  await officer.goto('/officer/sos');
  await expect(officer.getByText('SOS ใหม่ รอรับเรื่อง')).toBeVisible({ timeout: 20_000 });
  await officer.getByText('บ้านเลขที่ 99/9').first().click();
  await officer.getByRole('button', { name: 'รับเรื่อง', exact: true }).click();
  await expect(officer.getByText('คุณรับเรื่องแล้ว')).toBeVisible();

  // เจ้าของเห็นชื่อ+เบอร์เจ้าหน้าที่ (poll ทุกวินาที)
  await expect(owner.getByText('มีเจ้าหน้าที่รับแล้ว')).toBeVisible({ timeout: 20_000 });
  await expect(owner.getByText(DEMO.officer).first()).toBeVisible();
  await expect(owner.getByText('ส.ต.ต. สมชาย').first()).toBeVisible();

  // เจ้าหน้าที่ปิดเรื่อง
  await officer.getByRole('link', { name: /ถึงแล้ว ปิดเรื่อง/ }).click();
  await officer.getByRole('button', { name: /ปิดเรื่อง|ยืนยัน|บันทึก/ }).last().click();

  // เจ้าของเห็นว่าปิดแล้ว และเบอร์ต้องไม่เหลือในหน้า
  await expect(owner.getByText('ปิดเรื่องแล้ว').first()).toBeVisible({ timeout: 20_000 });
  expect(await owner.locator('body').innerText()).not.toContain(DEMO.officer);
  expect(await owner.content()).not.toContain(`tel:${DEMO.officer}`);

  await ownerCtx.close();
  await officerCtx.close();
});
