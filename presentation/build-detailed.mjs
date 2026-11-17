// สร้าง PDF + ภาพตัวอย่างของเด็คฉบับละเอียด (internal)
// ใช้ Chrome ที่ติดตั้งในเครื่องผ่าน Playwright (ไม่ต้องโหลด browser เพิ่ม)
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = process.cwd();
const playwright = pathToFileURL(join(dir, '..', 'frontend', 'node_modules', 'playwright', 'index.mjs')).href;
const { chromium } = await import(playwright);
const html = pathToFileURL(join(dir, 'smmb-deck-detailed.html')).href;
const shots = join(dir, 'qa-detailed');
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const problems = [];
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
});

await page.goto(html, { waitUntil: 'networkidle' });
await page.evaluate(() => window.__deckReady);
await page.addStyleTag({ content: '.hud, #progress { display: none !important; }' });
await page.waitForTimeout(350);

const count = await page.evaluate(() => window.__slideCount);
for (let i = 0; i < count; i++) {
  await page.evaluate((n) => window.__show(n), i);
  await page.waitForTimeout(110);
  await page.screenshot({ path: join(shots, `slide-${String(i + 1).padStart(2, '0')}.png`) });
}

// ตรวจ layout โหมดพิมพ์ (ตัวเดียวกับที่ Chrome ใช้ทำ PDF)
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(200);
for (let i = 0; i < count; i++) {
  await page.locator('.slide').nth(i).screenshot({ path: join(shots, `print-${String(i + 1).padStart(2, '0')}.png`) });
}

const pdf = await page.pdf({
  width: '1280px',
  height: '720px',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  preferCSSPageSize: true,
});
await writeFile(join(dir, 'SMMB-Smart-Mailbox-Detailed.pdf'), pdf);
const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
const box = (pdf.toString('latin1').match(/\/MediaBox\s*\[([^\]]+)\]/) || [])[1];

console.log(`slides=${count} pdfPages=${pages} mediaBox=${box} bytes=${pdf.length}`);
if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'));
await browser.close();
