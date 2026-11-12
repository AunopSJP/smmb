import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { request, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

export const WEB = 'http://localhost:4211';
export const API = 'http://localhost:3211';
const SIM = resolve(process.cwd(), '../backend/scripts/box-sim.mjs'); // สูตรเซ็น HMAC อยู่ที่ไฟล์นี้ที่เดียว
const run = promisify(execFile);

export const DEMO = {
  admin: '0800000001',
  owner: '0812345678',
  head: '0823456789',
  officer: '0834567890',
  password: 'demo1234',
};

let phoneSeq = Math.floor(Date.now() / 1000) % 100000; // เบอร์ทดสอบไม่ซ้ำข้ามรอบ/ข้าม spec
export function newPhone(): string {
  phoneSeq += 1;
  return `09${String(phoneSeq).padStart(8, '0')}`.slice(0, 10);
}

/** ผู้ใช้เรียก API ที่มี cookie ของตัวเอง */
export async function apiAs(phone: string, password: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.post('/api/v1/auth/signin', { data: { phone, password } });
  if (!res.ok()) throw new Error(`signin ${phone} → ${res.status()}`);
  return ctx;
}

export const adminApi = () => apiAs(DEMO.admin, DEMO.password);

export interface TestBox {
  id: string;
  secret: string;
  front: string; // รหัสใต้ QR หน้าตู้ (slot 1)
  backup: string;
  activate: string; // รหัสใต้ QR เปิดใช้ตู้
  frontUrl: string;
}

/** รหัสทุกอย่างของตู้ดึงจาก API แอดมิน ไม่ hardcode */
export async function boxInfo(admin: APIRequestContext, id: string): Promise<TestBox> {
  const secret = (await (await admin.post(`/api/v1/admin/boxes/${id}/device-secret`)).json()) as { device_secret: string };
  const d = (await (await admin.get(`/api/v1/admin/boxes/${id}`)).json()) as { qr: { slot: number | string; print_code: string; url: string }[] };
  const qr = (slot: number | string) => d.qr.find((q) => q.slot === slot)!;
  return { id, secret: secret.device_secret, front: qr(1).print_code, backup: qr(2).print_code, activate: qr('activate').print_code, frontUrl: qr(1).url };
}

/** ลงทะเบียนตู้ใหม่ผ่านแอดมิน API (ตู้ใหม่ทุกครั้ง ไม่ใช้ตู้ร่วมกันข้าม spec) */
export async function registerBox(admin: APIRequestContext): Promise<TestBox> {
  const res = await admin.post('/api/v1/admin/boxes', { data: { count: 1 } });
  const [b] = (await res.json()) as { box_id: string }[];
  return boxInfo(admin, b!.box_id);
}

/** สมัครเจ้าของบ้านผ่าน API (ข้ามฟอร์ม · ฟอร์มจริงทดสอบใน owner.spec) แล้วผูกตู้ */
export async function signupOwnerWithBox(admin: APIRequestContext, name = 'เจ้าของ e2e'): Promise<{ phone: string; password: string; box: TestBox; api: APIRequestContext }> {
  const box = await registerBox(admin);
  const phone = newPhone();
  const password = 'pass1234';
  const anon = await request.newContext({ baseURL: API });
  const terms = (await (await anon.get('/api/v1/terms/current')).json()) as { data?: { version: string }; version?: string };
  const version = terms.data?.version ?? terms.version!;
  const s = await anon.post('/api/v1/auth/signup/owner', { data: { name, phone, password, house_no: '77/7', terms_version: version } });
  if (!s.ok()) throw new Error(`signup owner → ${s.status()} ${await s.text()}`);
  const act = await anon.post('/api/v1/boxes/activate', { data: { code: box.activate } });
  if (!act.ok()) throw new Error(`activate → ${act.status()} ${await act.text()}`);
  return { phone, password, box, api: anon };
}

/** ตู้จำลอง = box-sim.mjs เป็น child process */
export class BoxSim {
  private proc?: ChildProcess;
  private out = '';
  constructor(private readonly box: TestBox) {}

  private args(cmd: string[]): string[] {
    return [SIM, ...cmd, '--url', API, '--box', this.box.id, '--secret', this.box.secret];
  }

  /** ถือ long-poll ทิ้งไว้ (--manual: ได้งานแล้วแค่รอคำสั่ง ready/result) */
  start(mode: 'poll-manual' | 'live' = 'poll-manual'): void {
    const cmd = mode === 'live' ? ['live'] : ['poll', '--manual'];
    this.proc = spawn(process.execPath, this.args(cmd), { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout!.on('data', (d: Buffer) => (this.out += d.toString()));
    this.proc.stderr!.on('data', (d: Buffer) => (this.out += d.toString()));
  }

  /** รอจนตู้ได้งานใหม่ (ไม่นับงานที่เคยเห็นแล้ว) */
  async nextJob(timeoutMs = 30_000): Promise<string> {
    const seen = new Set(this.jobs());
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const fresh = this.jobs().find((j) => !seen.has(j));
      if (fresh) return fresh;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`ตู้จำลองไม่ได้งานใหม่ใน ${timeoutMs} ms\n${this.out.slice(-800)}`);
  }

  private jobs(): string[] {
    return [...this.out.matchAll(/"job_id":"(J-[0-9a-f]{6})"/g)].map((m) => m[1]!);
  }

  async ready(job: string): Promise<void> {
    await run(process.execPath, this.args(['ready', '--job', job]));
  }

  /** text ว่าง = อ่าน QR ไม่ได้ */
  async result(job: string, attempt: number, text?: string): Promise<string> {
    const { stdout } = await run(process.execPath, this.args(['result', '--job', job, '--attempt', String(attempt), ...(text ? ['--text', text] : [])]));
    return stdout;
  }

  async boot(): Promise<void> {
    await run(process.execPath, this.args(['boot']));
  }

  async stop(): Promise<void> {
    const p = this.proc;
    this.proc = undefined;
    if (!p || p.exitCode !== null) return;
    if (process.platform === 'win32') await run('taskkill', ['/pid', String(p.pid), '/T', '/F']).catch(() => undefined);
    else p.kill();
  }
}

/** เปิด devTools (ปุ่มคัดลอกข้อความ QR) เฉพาะในเทสต์ — ไม่แตะ public/config.json */
export async function enableDevTools(ctx: BrowserContext): Promise<void> {
  await ctx.route('**/config.json', (r) => r.fulfill({ json: { apiBase: '', devTools: true } }));
}

export async function signIn(page: Page, phone: string, password: string, expectUrl: RegExp): Promise<void> {
  await page.goto('/auth/signin');
  await page.getByLabel('เบอร์โทรศัพท์').fill(phone);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL(expectUrl);
}
