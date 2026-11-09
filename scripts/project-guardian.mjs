#!/usr/bin/env node
/**
 * SMMB Project Guardian — ตรวจสุขภาพโปรเจ็คแบบไม่แก้โค้ด
 *
 * ใช้:
 *   node scripts/project-guardian.mjs            # ตรวจเร็ว (static + git)
 *   node scripts/project-guardian.mjs --full     # + build/lint/unit test ทั้ง backend/frontend
 *   node scripts/project-guardian.mjs --full --ci
 *
 * ผลลัพธ์: reports/guardian-YYYY-MM-DD_HH-mm.md + สรุปใน terminal
 * Exit code 1 เมื่อมี FAIL (build/test/lint/route) · warning ไม่ทำให้ fail
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const FULL = args.has('--full');
const CI = args.has('--ci');
const REPORT_DIR = join(ROOT, 'reports');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const checks = [];
const details = [];
let failed = 0;

const stamp = new Date().toISOString();
const safeStamp = stamp.replace(/[:.]/g, '-').slice(0, 16);
const reportPath = join(REPORT_DIR, `guardian-${safeStamp}.md`);
mkdirSync(REPORT_DIR, { recursive: true });

function add(name, status, summary, detail = '') {
  checks.push({ name, status, summary });
  if (status === 'FAIL') failed += 1;
  if (detail.trim()) details.push(`### ${name}\n\n${detail.trim()}\n`);
}
function info(name, summary) {
  add(name, 'INFO', summary);
}
function warn(name, summary, detail = '') {
  add(name, 'WARN', summary, detail);
}
function fail(name, summary, detail = '') {
  add(name, 'FAIL', summary, detail);
}
function ok(name, summary) {
  add(name, 'PASS', summary);
}

function run(command, commandArgs, cwd, timeout = 240_000) {
  const started = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    timeout,
    shell: process.platform === 'win32',
    env: { ...process.env, CI: CI ? '1' : process.env.CI },
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return {
    code: result.status ?? 1,
    output,
    ms: Date.now() - started,
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

function runCheck(name, command, commandArgs, cwd, timeout) {
  if (!FULL) {
    info(name, 'ข้าม (ใช้ --full เพื่อรัน)');
    return false;
  }
  const r = run(command, commandArgs, cwd, timeout);
  const tail = r.output.split(/\r?\n/).slice(-40).join('\n');
  if (r.code === 0) ok(name, `ผ่านใน ${(r.ms / 1000).toFixed(1)}s`);
  else fail(name, r.timedOut ? 'timeout' : `exit ${r.code}`, `\`\`\`\n${tail}\n\`\`\``);
  return r.code === 0;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/');

// ── 1. Git ─────────────────────────────────────────────────────────────
try {
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], ROOT).output.trim() || '?';
  const commit = run('git', ['rev-parse', '--short', 'HEAD'], ROOT).output.trim() || '?';
  const status = run('git', ['status', '--porcelain'], ROOT).output.trim();
  const lines = status ? status.split(/\r?\n/).filter(Boolean) : [];
  if (lines.length === 0) ok('Git working tree', `สะอาด · ${branch}@${commit}`);
  else warn('Git working tree', `มี ${lines.length} ไฟล์ยังไม่ commit · ${branch}@${commit}`, lines.slice(0, 30).map((l) => `- \`${l}\``).join('\n'));
} catch (e) {
  warn('Git working tree', 'อ่านสถานะ git ไม่ได้', String(e));
}

// ── 2. Registry ↔ routes ───────────────────────────────────────────────
try {
  const registry = read('frontend/src/app/screens/registry.ts');
  const routes = read('frontend/src/app/app.routes.ts');

  const screens = [...registry.matchAll(/\bs\('([^']+)',\s*'([^']+)',\s*'([^']*)'/g)].map((m) => ({ code: m[1], area: m[2], path: m[3] }));
  const builtBlock = routes.split('const BUILT')[1]?.split('};')[0] ?? '';
  const built = [...builtBlock.matchAll(/^\s{2}'?([A-Za-z0-9-]+)'?:\s/gm)].map((m) => m[1]);

  const dupCodes = screens.filter((s, i) => screens.findIndex((x) => x.code === s.code) !== i).map((s) => s.code);
  const dupPaths = screens.filter((s, i) => screens.findIndex((x) => x.area === s.area && x.path === s.path) !== i).map((s) => `${s.area}/${s.path}`);
  const builtUnknown = built.filter((c) => !screens.some((s) => s.code === c));
  const missingBuilt = screens.filter((s) => !built.includes(s.code)).map((s) => s.code);
  // หน้า proposal: true = ตั้งใจยังไม่ทำ (อ่านจาก registry ไม่ hardcode)
  const proposalCodes = registry
    .split(/\r?\n/)
    .filter((line) => /proposal:\s*true/.test(line))
    .map((line) => line.match(/s\('([^']+)'/)?.[1])
    .filter(Boolean);
  const unexpectedMissing = missingBuilt.filter((c) => !proposalCodes.includes(c));

  if (dupCodes.length || dupPaths.length || builtUnknown.length) {
    fail('Registry ↔ routes', 'พบรหัส/เส้นทางซ้ำหรือ route ไม่มีใน registry', [
      dupCodes.length ? `รหัสซ้ำ: ${[...new Set(dupCodes)].join(', ')}` : '',
      dupPaths.length ? `path ซ้ำ: ${[...new Set(dupPaths)].join(', ')}` : '',
      builtUnknown.length ? `BUILT ไม่มีใน registry: ${builtUnknown.join(', ')}` : '',
    ].filter(Boolean).join('\n'));
  } else if (unexpectedMissing.length) {
    warn('Registry ↔ routes', `${unexpectedMissing.length} หน้ายังไม่มี component จริง`, unexpectedMissing.join(', '));
  } else {
    ok('Registry ↔ routes', `${screens.length} หน้า · built ${built.length} · ไม่มีรหัส/ path ซ้ำ`);
  }

  // แท็บต้องอ้างรหัสที่มีจริง
  const tabBlocks = [...registry.matchAll(/export const TABS(?:_EASY)?[\s\S]*?\n\};/g)].map((m) => m[0]);
  const tabCodes = [...tabBlocks.join('\n').matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]);
  const badTabs = [...new Set(tabCodes.filter((c) => !screens.some((s) => s.code === c)))];
  if (badTabs.length) fail('Tabs', `แท็บอ้างรหัสที่ไม่มีใน registry: ${badTabs.join(', ')}`);
  else ok('Tabs', `${tabCodes.length} รายการอ้างรหัสหน้าจอถูกต้อง`);
} catch (e) {
  fail('Registry ↔ routes', 'ตรวจไม่ได้', String(e));
}

// ── 3. 3-mode coverage ────────────────────────────────────────────────
try {
  const pages = walk(join(ROOT, 'frontend/src/app/pages')).filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'));
  const missing = [];
  for (const file of pages) {
    const src = readFileSync(file, 'utf8');
    const markers = (src.match(/easy-hide|easy-only|adv-only|desk-only/g) ?? []).length;
    const touchesMode = /DisplaySettings|data-mode|easyMode|advancedMode/.test(src);
    if (markers === 0 && !touchesMode) missing.push(rel(file));
  }
  if (missing.length) warn('3-mode coverage', `${missing.length} ไฟล์ไม่มี marker โหมดเลย`, missing.map((f) => `- ${f}`).join('\n'));
  else ok('3-mode coverage', `ทุกหน้า (${pages.length} ไฟล์) มี marker หรืออ่าน DisplaySettings`);
} catch (e) {
  warn('3-mode coverage', 'ตรวจไม่ได้', String(e));
}

// ── 4. i18n ไทย/อังกฤษ ────────────────────────────────────────────────
try {
  const files = walk(join(ROOT, 'frontend/src/app')).filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'));
  const bad = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/i18n\.t\(\{([^{}]*)\}\)/g)) {
      const block = m[1];
      if (/\bth\s*:/.test(block) && !/\ben\s*:/.test(block)) {
        const line = src.slice(0, m.index).split('\n').length;
        bad.push(`${rel(file)}:${line}`);
      }
    }
  }
  if (bad.length) warn('i18n ไทย/อังกฤษ', `${bad.length} จุดมี th: แต่ไม่มี en:`, bad.slice(0, 25).map((x) => `- ${x}`).join('\n'));
  else ok('i18n ไทย/อังกฤษ', 'ทุก i18n.t({ th, en }) มีครบสองภาษา');
} catch (e) {
  warn('i18n ไทย/อังกฤษ', 'ตรวจไม่ได้', String(e));
}

// ── 5. ความลับ/ข้อมูลที่อาจหลุด ────────────────────────────────────────
try {
  const files = [...walk(join(ROOT, 'frontend/src')), ...walk(join(ROOT, 'backend/src'))].filter((p) => /\.(ts|html|json)$/.test(p) && !/\.(spec|e2e-spec)\.ts$/.test(p) && !rel(p).includes('/mock/'));
  const suspicious = [];
  const re = /(password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{12,}['"]/i;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    src.split(/\r?\n/).forEach((line, i) => {
      if (re.test(line) && !/process\.env|placeholder|example|mock|demo|type\s|interface\s|import\s/.test(line)) {
        suspicious.push(`${rel(file)}:${i + 1} ${line.trim().slice(0, 120)}`);
      }
    });
  }
  if (suspicious.length) warn('Hardcoded secrets', `${suspicious.length} จุดน่าสงสัย`, suspicious.slice(0, 20).map((x) => `- \`${x}\``).join('\n'));
  else ok('Hardcoded secrets', 'ไม่พบค่าลับฝังใน source');
} catch (e) {
  warn('Hardcoded secrets', 'ตรวจไม่ได้', String(e));
}

// ── 6. Migrations ─────────────────────────────────────────────────────
try {
  const dir = join(ROOT, 'backend/sql/migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const numbers = files.map((f) => Number(f.slice(0, 4))).filter((n) => Number.isFinite(n));
  const dup = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (dup.length) fail('Migrations', `เลข migration ซ้ำ: ${[...new Set(dup)].join(', ')}`);
  else ok('Migrations', `${files.length} ไฟล์ · ล่าสุด ${files.at(-1)} · เลขไม่ซ้ำ`);
} catch (e) {
  warn('Migrations', 'ตรวจไม่ได้', String(e));
}

// ── 7. TODO/FIXME (ข้อมูล) ────────────────────────────────────────────
try {
  const files = [...walk(join(ROOT, 'frontend/src/app')), ...walk(join(ROOT, 'backend/src'))].filter((p) => p.endsWith('.ts'));
  let count = 0;
  for (const file of files) count += (readFileSync(file, 'utf8').match(/\b(TODO|FIXME|HACK)\b/g) ?? []).length;
  info('TODO/FIXME', count ? `พบ ${count} จุด` : 'ไม่พบ');
} catch {
  info('TODO/FIXME', 'ตรวจไม่ได้');
}

// ── 8. Build / lint / unit test ───────────────────────────────────────
runCheck('Frontend build', NPM, ['--prefix', 'frontend', 'run', 'build'], ROOT);
runCheck('Frontend unit tests', NPM, ['--prefix', 'frontend', 'test', '--', '--watch=false'], ROOT, 300_000);
runCheck('Backend build', NPM, ['--prefix', 'backend', 'run', 'build'], ROOT);
runCheck('Backend lint', NPM, ['--prefix', 'backend', 'run', 'lint'], ROOT);
runCheck('Backend unit tests', NPM, ['--prefix', 'backend', 'test'], ROOT, 300_000);

// ── Report ────────────────────────────────────────────────────────────
const icon = { PASS: '✅', WARN: '⚠️', FAIL: '❌', INFO: 'ℹ️' };
const overall = failed ? 'FAIL' : checks.some((c) => c.status === 'WARN') ? 'WARN' : 'PASS';
const summary = [
  `# SMMB Project Guardian — ${stamp}`,
  '',
  `**ผลรวม: ${icon[overall]} ${overall}**${FULL ? ' · โหมดเต็ม (build/lint/test)' : ' · โหมดเร็ว (static)'}`,
  '',
  '| การตรวจ | ผล | สรุป |',
  '|---|---|---|',
  ...checks.map((c) => `| ${c.name} | ${icon[c.status]} ${c.status} | ${c.summary} |`),
  '',
  '## รายละเอียด',
  '',
  ...details,
].join('\n');
writeFileSync(reportPath, `${summary}\n`, 'utf8');

if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, { flag: 'a' });
  } catch {
    // ignore
  }
}

console.log(`\n${icon[overall]} SMMB Project Guardian: ${overall}`);
for (const c of checks) console.log(`${icon[c.status]} ${c.name} — ${c.summary}`);
console.log(`\n📄 Report: ${rel(reportPath)}\n`);
process.exit(failed ? 1 : 0);
