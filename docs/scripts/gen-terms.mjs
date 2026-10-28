// สร้างข้อตกลงฉบับใหม่จาก docs/terms-<version>.md → migration ของ backend + ค่าคงที่ของหน้าเว็บ (A13)
// ใช้: node docs/scripts/gen-terms.mjs 2026-10-27 0004
// ไฟล์ .md คือต้นฉบับ — แก้ที่ .md แล้วรันใหม่เป็น migration ใหม่ (ห้ามแก้ migration ที่ apply แล้ว)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [version, migNo] = process.argv.slice(2);
if (!version || !migNo) throw new Error('usage: node docs/scripts/gen-terms.mjs <version> <migration-number>');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const md = readFileSync(join(root, 'docs', `terms-${version}.md`), 'utf8').replace(/\r\n/g, '\n').trim();
const [th, en] = md.split('<!-- en -->').map((s) => s.trim());
if (!th || !en) throw new Error('the .md needs a Thai part, a "<!-- en -->" line, then the English part');

/** "# title" · บรรทัดใต้ title · "## หัวข้อ" + "- ข้อ" */
function parse(part) {
  const lines = part.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = lines.shift().replace(/^#\s+/, '');
  const intro = lines[0].startsWith('##') ? '' : lines.shift();
  const sections = [];
  for (const l of lines) {
    if (l.startsWith('## ')) sections.push({ title: l.slice(3), items: [] });
    else if (l.startsWith('- ')) sections.at(-1).items.push(l.slice(2));
  }
  return { title, intro, sections };
}

// backend: เก็บทั้งสองภาษาใน body_md เดียว (คั่นด้วย <!-- en -->) — GET /terms/current ส่งให้ client แยกเอง
const tag = 'terms';
if (md.includes(`$${tag}$`)) throw new Error('terms text must not contain the dollar-quote tag');
const sql = `-- ข้อตกลงการใช้งานฉบับ ${version} — สร้างจาก docs/terms-${version}.md ด้วย docs/scripts/gen-terms.mjs (ห้ามแก้ไฟล์นี้)
-- ทุกคนที่ยอมรับฉบับก่อนหน้าจะต้องกดยอมรับฉบับนี้ (403 TERMS_UPDATE_REQUIRED → หน้า A13)
INSERT INTO app.terms_tb (terms_version, body_md, published_date)
VALUES ('${version}', $${tag}$${md}$${tag}$, '${version}T00:00:00+07:00')
ON CONFLICT (terms_version) DO NOTHING;
`;
const migDir = join(root, 'backend', 'sql', 'migrations');
writeFileSync(join(migDir, `${migNo}_terms_${version.replace(/-/g, '')}.sql`), sql);

const ts = `// สร้างจาก docs/terms-${version}.md ด้วย docs/scripts/gen-terms.mjs — ห้ามแก้ไฟล์นี้ตรง ๆ
// ของจริงหน้า A13 อ่านจาก GET /api/v1/terms/current (ฉบับเดียวกัน)

export interface TermsPart {
  title: string;
  intro: string;
  sections: { title: string; items: string[] }[];
}

export const TERMS_VERSION = '${version}';

export const TERMS: { th: TermsPart; en: TermsPart } = ${JSON.stringify({ th: parse(th), en: parse(en) }, null, 2)};
`;
writeFileSync(join(root, 'frontend', 'src', 'app', 'core', 'terms.ts'), ts);
console.log('ok', version);
