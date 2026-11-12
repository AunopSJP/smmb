import { defineConfig, devices } from '@playwright/test';

/** พอร์ต e2e แยกจากงาน dev: backend 3211 · web 4211 · PGlite 54339 (ไม่ชน 3000/3100/3111/4200/4201) */
export const E2E_WEB = 'http://localhost:4211';
export const E2E_API = 'http://localhost:3211';
const reuse = process.env['E2E_REUSE'] === '1'; // dev: ใช้ server ที่เปิดค้างไว้ (ไม่ล้างฐาน)

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: E2E_WEB,
    viewport: { width: 375, height: 812 },
    trace: 'retain-on-failure',
    locale: 'th-TH',
  },
  projects: [{ name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } }],
  webServer: [
    {
      command: 'node e2e/scripts/start-backend.mjs',
      url: `${E2E_API}/api/health/live`,
      timeout: 240_000,
      reuseExistingServer: reuse,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'node node_modules/@angular/cli/bin/ng.js serve --port 4211 --proxy-config e2e/proxy.e2e.json',
      url: `${E2E_WEB}/`,
      timeout: 240_000,
      reuseExistingServer: reuse,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
