// ดึง Noto Serif Thai สำหรับหัวเรื่อง (ชุด minimal)
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = join(process.cwd(), 'assets', 'fonts');
await mkdir(dir, { recursive: true });

const cssUrl = 'https://fonts.googleapis.com/css2?family=Noto+Serif+Thai:wght@400;500;600&display=swap';
const res = await fetch(cssUrl, {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
});
if (!res.ok) throw new Error(`fonts css ${res.status}`);
let css = await res.text();

const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
let i = 0;
for (const url of urls) {
  const name = `serif-${String(i++).padStart(2, '0')}.woff2`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font ${url} ${r.status}`);
  await writeFile(join(dir, name), Buffer.from(await r.arrayBuffer()));
  css = css.replaceAll(url, `./${name}`);
}
await writeFile(join(dir, 'serif.css'), css, 'utf8');
console.log(`serif fonts=${urls.length}`);
