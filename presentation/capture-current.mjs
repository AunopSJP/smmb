import { chromium } from "file:///C:/aunopsjp/dev/smmb/frontend/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const out = join(process.cwd(), "assets", "shots", "current");
await mkdir(out, { recursive: true });

const BASE = "http://localhost:4200";
const PASS = "demo1234";
const browser = await chromium.launch({ channel: "chrome" });

async function loginPage(rolePhone) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", locale: "th-TH" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/auth/signin", { waitUntil: "networkidle" });
  await page.waitForSelector("input[type=tel]", { timeout: 20000 });
  await page.fill("input[type=tel]", rolePhone);
  await page.fill("input[type=password]", PASS);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.includes("/auth"), { timeout: 25000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}

async function markRead(page) {
  const status = await page.evaluate(async () => {
    const r = await fetch("/api/v1/me/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    return r.status;
  });
  console.log("markRead", status);
}

async function dismissPushBanner(page) {
  const x = page.getByRole("button", { name: /ปิดไว้ก่อน/ });
  if (await x.count()) {
    await x.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function shot(page, name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, name + ".png") });
  console.log("shot", name, page.url());
}

// owner history
{
  const { ctx, page } = await loginPage("0812345678");
  await markRead(page);
  await page.goto(BASE + "/home/history", { waitUntil: "networkidle" });
  await shot(page, "owner-history");
  await ctx.close();
}

// officer home
{
  const { ctx, page } = await loginPage("0834567890");
  await markRead(page);
  await page.goto(BASE + "/officer", { waitUntil: "networkidle" });
  await shot(page, "officer-home");
  await ctx.close();
}

// head home
{
  const { ctx, page } = await loginPage("0823456789");
  await markRead(page);
  await page.goto(BASE + "/agency", { waitUntil: "networkidle" });
  await shot(page, "head-home");
  await ctx.close();
}

// rider entry (no login)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", locale: "th-TH" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/r", { waitUntil: "networkidle" });
  await shot(page, "rider-entry");
  await ctx.close();
}

// owner settings in 3 modes
{
  const { ctx, page } = await loginPage("0812345678");
  await markRead(page);
  await page.goto(BASE + "/home/settings", { waitUntil: "networkidle" });
  await dismissPushBanner(page);
  for (const mode of ["easy", "default", "advanced"]) {
    const status = await page.evaluate(async (m) => {
      const r = await fetch("/api/v1/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefs: { ui_mode: m, theme: "light", text_size: "normal" } }) });
      return r.status;
    }, mode);
    console.log("patch", mode, status);
    await page.goto(BASE + "/home/settings", { waitUntil: "networkidle" });
    await dismissPushBanner(page);
    await shot(page, "mode-" + mode);
  }
  await ctx.close();
}

await browser.close();
