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
  const sos = owner.getByTestId('sos-hold');
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

/** เส้นคืนเรื่อง (issue #11): รับแล้วไปไม่ได้ → ยืนยันคืน → เจ้าของเห็นแจ้งพร้อมปุ่มโทร */
test('SOS คืนเรื่อง: ยืนยันก่อน แล้วกลับเป็นรอคนรับ เจ้าของได้ปุ่มโทร 191/1669', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const officerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const officer = await officerCtx.newPage();
  await signIn(owner, DEMO.owner, DEMO.password, /\/home$/);
  await signIn(officer, DEMO.officer, DEMO.password, /\/officer$/);

  const sos = owner.getByTestId('sos-hold');
  await sos.scrollIntoViewIfNeeded();
  const box = (await sos.boundingBox())!;
  await owner.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await owner.mouse.down();
  await owner.waitForTimeout(3300);
  await owner.mouse.up();
  await expect(owner).toHaveURL(/\/home\/sos/);

  await officer.goto('/officer/sos');
  await expect(officer.getByText('SOS ใหม่ รอรับเรื่อง')).toBeVisible({ timeout: 20_000 });
  await officer.getByText('บ้านเลขที่ 99/9').first().click();
  await officer.getByRole('button', { name: 'รับเรื่อง', exact: true }).click();
  await expect(officer.getByText('คุณรับเรื่องแล้ว')).toBeVisible();
  await expect(owner.getByText('มีเจ้าหน้าที่รับแล้ว')).toBeVisible({ timeout: 20_000 });

  // กดแล้วเปลี่ยนใจ = ยังดูแลต่อ
  await officer.getByRole('button', { name: 'ไปไม่ได้ คืนเรื่อง' }).click();
  await officer.getByRole('button', { name: 'ไม่คืน ดูแลต่อ' }).click();
  await expect(officer.getByText('คุณรับเรื่องแล้ว')).toBeVisible();

  await officer.getByRole('button', { name: 'ไปไม่ได้ คืนเรื่อง' }).click();
  await officer.getByRole('alertdialog').getByRole('button', { name: 'คืนเรื่อง', exact: true }).click();
  await expect(officer).toHaveURL(/\/officer\/sos$/);
  await expect(officer.getByText('คุณคืนแล้ว')).toBeVisible();

  await expect(owner.getByText(/เจ้าหน้าที่คืนเรื่อง/).first()).toBeVisible({ timeout: 20_000 });
  await expect(owner.locator('a[href="tel:191"]')).toBeVisible();
  await expect(owner.locator('a[href="tel:1669"]')).toBeVisible();
  expect(await owner.content()).not.toContain(`tel:${DEMO.officer}`);

  // เก็บกวาด: ยกเลิก SOS ของบ้านเดโม
  await owner.getByRole('link', { name: 'ยกเลิก SOS' }).click();
  await owner.getByRole('button', { name: 'ปลอดภัยแล้ว' }).click();
  await expect(owner).toHaveURL(/\/home$/);
  await ownerCtx.close();
  await officerCtx.close();
});
