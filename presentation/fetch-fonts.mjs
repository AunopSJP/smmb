// ดึงฟอนต์ IBM Plex (ไทย + Latin) จาก Google Fonts มาเก็บไว้ในเครื่อง
// เพื่อให้ไฟล์เด็คและ PDF ใช้ฟอนต์เดียวกันได้แม้ไม่มีเน็ต
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = join(process.cwd(), 'assets', 'fonts');
const cssUrl =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

await mkdir(dir, { recursive: true });

const res = await fetch(cssUrl, {
  headers: {
    // UA ของ Chrome ทำให้ได้ woff2 + unicode-range แยกชุดไทย/Latin
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
});
if (!res.ok) throw new Error(`fonts css ${res.status}`);
let css = await res.text();

const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
let i = 0;
for (const url of urls) {
  const name = `plex-${String(i++).padStart(2, '0')}.woff2`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font ${url} ${r.status}`);
  await writeFile(join(dir, name), Buffer.from(await r.arrayBuffer()));
  css = css.replaceAll(url, `./${name}`);
}

await writeFile(join(dir, 'fonts.css'), css, 'utf8');
console.log(`fonts=${urls.length} css=${css.length}B`);
