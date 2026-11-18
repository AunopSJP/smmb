import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO, signIn } from './helpers/stack';

/**
 * ตรวจการเข้าถึง (accessibility) ด้วย axe-core ตามมาตรฐาน WCAG 2.2 ระดับ AA
 * - ล้มเมื่อพบปัญหาระดับ serious / critical (ปัญหา minor / moderate ถูกพิมพ์ไว้ในรายงานเฉยๆ)
 * - รันที่จอมือถือ 375px ตาม playwright.config (ผู้ใช้หลักใช้มือถือ)
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);

/** สแกนหน้าปัจจุบัน แล้วสรุปผลเป็นข้อความอ่านง่าย · คืนเฉพาะรายการที่ต้องแก้ */
async function scan(page: Page, label: string): Promise<string[]> {
  // รอให้หน้าวาดเสร็จและไม่มีงานโหลดค้าง ก่อนสแกน
  await page.waitForLoadState('networkidle');
  // ขยายความสูงจอชั่วคราว ให้แถบเมนูล่าง (sticky) อยู่ใต้เนื้อหาทั้งหมด
  // ไม่งั้น axe รายงาน "target-size: partially obscured" กับรายการที่ถูกแถบเมนูบังชั่วคราวตอนยังไม่เลื่อน (ผู้ใช้เลื่อนหนีได้ ไม่ใช่บั๊กจริง)
  const original = page.viewportSize();
  await page.setViewportSize({ width: original?.width ?? 375, height: 4000 });
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  if (original) await page.setViewportSize(original);

  const lines = violations.map(
    (v) => `[${v.impact}] ${v.id} (${v.nodes.length} จุด) — ${v.help}\n    เช่น ${v.nodes[0]?.target.join(' ')}`,
  );
  if (lines.length) console.log(`\n== a11y: ${label} ==\n${lines.join('\n')}`);

  return violations.filter((v) => BLOCKING.has(v.impact ?? '')).map((v) => `${label}: ${v.id} (${v.nodes.length} จุด)`);
}

test.describe('a11y — หน้าที่ไม่ต้องล็อกอิน', () => {
  for (const path of ['/auth/signin', '/auth/signup/owner']) {
    test(`ไม่มีปัญหาร้ายแรง: ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(await scan(page, path)).toEqual([]);
    });
  }
});

/** หน้าหลักของแต่ละบทบาท · ใช้บัญชีตัวอย่างจาก seed (DEMO) */
const ROLES = [
  { name: 'เจ้าของบ้าน', phone: DEMO.owner, url: /\/home$/ },
  { name: 'เจ้าหน้าที่', phone: DEMO.officer, url: /\/officer/ },
  { name: 'หัวหน้า', phone: DEMO.head, url: /\/agency/ },
  { name: 'แอดมิน', phone: DEMO.admin, url: /\/admin/ },
];

test.describe('a11y — หน้าหลักแต่ละบทบาท', () => {
  for (const role of ROLES) {
    test(`ไม่มีปัญหาร้ายแรง: ${role.name}`, async ({ page }) => {
      await signIn(page, role.phone, DEMO.password, role.url);
      expect(await scan(page, `${role.name} ${new URL(page.url()).pathname}`)).toEqual([]);
    });
  }
});
