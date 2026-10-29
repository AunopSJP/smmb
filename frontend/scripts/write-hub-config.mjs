import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const outputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/smmb-web/browser');
const indexPath = resolve(outputDirectory, 'index.html');
const configPath = resolve(outputDirectory, 'config.json');

await access(indexPath);
await writeFile(
  configPath,
  `${JSON.stringify({ apiBase: '/smmb-api', devTools: false }, null, 2)}\n`,
  'utf8',
);
console.log(`Wrote hub runtime config to ${configPath}`);
