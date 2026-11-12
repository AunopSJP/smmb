// เปิด backend mock สำหรับ e2e: ลบเฉพาะ backend/.mockdb-e2e → build → dev-mock (พอร์ต 3211)
import { spawn, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../../../backend');
rmSync(resolve(backend, '.mockdb-e2e'), { recursive: true, force: true }); // ลบได้เฉพาะโฟลเดอร์นี้
execFileSync(process.execPath, [resolve(backend, 'node_modules/@nestjs/cli/bin/nest.js'), 'build'], { cwd: backend, stdio: 'inherit' });

const child = spawn(process.execPath, ['scripts/dev-mock.mjs'], {
  cwd: backend,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3211',
    MOCK_DB_PORT: '54339',
    SMMB_MOCK_DATA_DIR: '.mockdb-e2e',
    SMMB_DEMO_HOST: 'localhost',
    PUBLIC_BASE_URL: 'http://localhost:4211',
    QR_ALLOWED_HOSTS: 'localhost',
    SCHEDULER: 'off',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill());
