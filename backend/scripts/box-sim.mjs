#!/usr/bin/env node
// ตู้จำลอง — เซ็นคำขอแบบเดียวกับเฟิร์มแวร์ แล้วเรียก /v1/box/* (โปรโตคอล docs/SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md)
// ใช้ทดสอบเซิร์ฟเวอร์ตอนยังไม่มีบอร์ด และเป็นตัวอย่างโค้ดให้ทีมเฟิร์มแวร์เทียบ (Node 20+ ไม่ต้องติดตั้งอะไรเพิ่ม)
//
//   node scripts/box-sim.mjs boot   --url http://localhost:3000 --box BX-00001 --secret <64 hex>
//   node scripts/box-sim.mjs report --battery 15
//   node scripts/box-sim.mjs live   [--wait 50]              ทำตัวเหมือนบอร์ดจริง: boot → ถือ long-poll วนไป → งานทดสอบผ่านเอง
//                                                           งานตรวจ: ให้วางข้อความ QR ประจำตัว (ปุ่ม "คัดลอกข้อความ QR" ในหน้า O06 เมื่อเปิด devTools)
//   node scripts/box-sim.mjs poll   [--wait 50] [--fail]     ถือ long-poll วนไป ได้งานแล้ว ready + ส่งผลอ่าน QR
//   node scripts/box-sim.mjs event  --type camera_error
//   node scripts/box-sim.mjs poll   --manual              ได้งานแล้วแค่พิมพ์ออกมา (สั่ง ready / result เองทีละขั้น)
//   node scripts/box-sim.mjs ready  --job J-xxxxxx
//   node scripts/box-sim.mjs result --job J-xxxxxx --attempt 1 --text 'SMMB-O1....'   (ไม่ใส่ --text = อ่านไม่ได้)
//
// ค่า --url / --box / --secret ใส่เป็น env แทนได้: SMMB_URL, SMMB_BOX, SMMB_SECRET
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

const BASE = String(opt('url', process.env.SMMB_URL ?? 'http://localhost:3000')).replace(/\/+$/, '');
const BOX = String(opt('box', process.env.SMMB_BOX ?? ''));
const SECRET = String(opt('secret', process.env.SMMB_SECRET ?? ''));

if (!['boot', 'report', 'poll', 'live', 'event', 'ready', 'result'].includes(cmd) || !/^BX-\d+$/.test(BOX) || !/^[0-9a-f]{64}$/i.test(SECRET)) {
  console.error('usage: box-sim.mjs <live|boot|report|poll|event|ready|result> --url <server> --box BX-00001 --secret <device_secret 64 hex>');
  process.exit(2);
}

let clockOffset = 0; // ตู้จริงตั้งนาฬิกาจาก server_time ทุกครั้ง
const nowS = () => Math.floor(Date.now() / 1000) + clockOffset;
let configVer = 0;

/** เซ็นแบบเดียวกับเฟิร์มแวร์: HMAC-SHA256(device_secret เป็นสตริง ASCII, METHOD|PATH|TS|NONCE|sha256hex(body)) */
function sign(method, path, ts, nonce, body) {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', SECRET).update(`${method}|${path}|${ts}|${nonce}|${bodyHash}`).digest('hex');
}

async function call(method, path, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const ts = String(nowS());
  const nonce = randomBytes(6).toString('hex');
  const started = Date.now();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'X-Box-Id': BOX,
      'X-Timestamp': ts,
      'X-Nonce': nonce,
      'X-Signature': sign(method, path, ts, nonce, body),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body || undefined,
  });
  const serverTime = Number(res.headers.get('x-server-time'));
  if (serverTime) clockOffset += serverTime - nowS();
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  const ms = Date.now() - started;
  console.log(`${method} ${path} → ${res.status} (${ms} ms)${json ? ' ' + JSON.stringify(json) : ''}`);
  if (json?.config_ver) configVer = json.config_ver;
  return { status: res.status, json };
}

async function diagnostic(type, data = {}) {
  return call('POST', '/v1/box/events', { type, ...data });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const battery = Number(opt('battery', 87));

if (cmd === 'boot') {
  await call('POST', '/v1/box/boot', {
    fw: 'sim-0.1', config_ver: configVer, reset_reason: 'power_on', battery_pct: battery, battery_mv: 3980, charging: true, rssi: -61, wifi_ch: 6,
  });
} else if (cmd === 'report') {
  await call('POST', '/v1/box/report', {
    fw: 'sim-0.1', config_ver: configVer, battery_pct: battery, battery_mv: 3790, charging: false, solar_mv: 0, temp_c: 41, rssi: -66,
    wake_count: 38, jobs_done: 2, scan_fail: 0, wifi_fail: 0, uptime_s: 86400,
  });
} else if (cmd === 'event') {
  await call('POST', '/v1/box/events', { type: String(opt('type', 'camera_error')) });
} else if (cmd === 'ready') {
  await call('POST', `/v1/box/jobs/${opt('job')}/ready`, { flash: false });
} else if (cmd === 'result') {
  const text = opt('text', null);
  await call('POST', `/v1/box/jobs/${opt('job')}/result`, {
    attempt: Number(opt('attempt', 1)), read_ok: typeof text === 'string', qr_text: typeof text === 'string' ? text : null, read_ms: 1500, flash: false,
  });
} else if (cmd === 'poll') {
  const wait = Number(opt('wait', 50));
  const fail = opt('fail', false) === true;
  console.log(`holding long-poll every ${wait}s — create a test job from the admin API to wake this box (Ctrl+C to stop)`);
  for (;;) {
    const { status, json } = await call('GET', `/v1/box/jobs?wait=${wait}`).catch((err) => {
      console.error(`network error: ${err.message} — retry in 30 s`);
      return { status: 0 };
    });
    if (status === 0) { await sleep(30_000); continue; }
    if (status !== 200 || !json?.job) continue;
    if (opt('manual', false) === true) { console.log('job received — run ready / result yourself'); await sleep(65_000); continue; }
    const job = json.job;
    if (job.type === 'test') await diagnostic('camera_test_started', { job_id: job.job_id });
    await sleep(800); // เปิดไฟ + กล้อง
    const ready = await call('POST', `/v1/box/jobs/${job.job_id}/ready`, { light: 'on', flash: false });
    if (job.type === 'test' && ready.status === 200) await diagnostic('camera_ready', { job_id: job.job_id, width: 640, height: 480 });
    for (let attempt = 1; attempt <= job.attempt_max; attempt++) {
      await sleep(1500); // กล้องอ่าน QR
      const read = !fail;
      const r = await call('POST', `/v1/box/jobs/${job.job_id}/result`, {
        attempt, read_ok: read, qr_text: read ? 'SIM-QR-TEXT' : null, read_ms: 1500, flash: false,
      });
      if (job.type === 'test' && r.status === 200) {
        await diagnostic('camera_scan_result', {
          job_id: job.job_id, attempt, frames: 24, qr_shapes: read ? 1 : 0, read_ok: read, read_ms: 1500,
        });
      }
      if (r.json?.status !== 'retry') break;
    }
  }
}

if (cmd === 'live') {
  // เหมือนเฟิร์มแวร์: boot (ตั้งนาฬิกา + รับค่า) → ถือ long-poll → ได้งาน: ปี๊บ + ready → อ่าน QR → result
  const wait = Number(opt('wait', 50));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const boot = await call('POST', '/v1/box/boot', {
    fw: 'sim-0.2', config_ver: configVer, reset_reason: 'power_on', battery_pct: battery, battery_mv: 3980, charging: true, rssi: -61, wifi_ch: 6,
  });
  if (boot.status !== 200) {
    console.error('boot failed — check --url / --box / --secret');
    process.exit(1);
  }
  console.log(`\n🔔 ปี๊บ — ออนไลน์แล้ว · ถือ long-poll ทุก ${wait} วิ (Ctrl+C หยุด)\n`);
  for (;;) {
    const { status, json } = await call('GET', `/v1/box/jobs?wait=${wait}`).catch((err) => {
      console.error(`network error: ${err.message} — retry in 10 s`);
      return { status: 0 };
    });
    if (status === 0) {
      await sleep(10_000);
      continue;
    }
    if (status !== 200 || !json?.job) continue;
    const job = json.job;
    console.log(`\n🔔 ปี๊บ — ได้งาน ${job.type} ${job.job_id} · เปิดกล้อง`);
    if (job.type === 'test') await diagnostic('camera_test_started', { job_id: job.job_id });
    await sleep(600);
    const ready = await call('POST', `/v1/box/jobs/${job.job_id}/ready`, { flash: false });
    if (job.type === 'test' && ready.status === 200) await diagnostic('camera_ready', { job_id: job.job_id, width: 640, height: 480 });
    for (let attempt = 1; attempt <= job.attempt_max; attempt++) {
      let text = 'SIM-TEST-QR';
      if (job.type === 'test') {
        await sleep(1200);
      } else {
        // งานตรวจ: ตู้จำลองไม่มีกล้อง — วางข้อความที่อยู่ใน QR ประจำตัว (หน้า O06 ปุ่ม "คัดลอกข้อความ QR" เมื่อเปิด devTools)
        // ไม่มีคีย์บอร์ด (รันเบื้องหลัง) = อ่านไม่ได้ — ใช้ poll --manual + ready/result แทน
        text = (await rl.question(`  [ครั้งที่ ${attempt}/${job.attempt_max}] วางข้อความ QR ประจำตัว (เว้นว่าง = อ่านไม่ได้): `).catch(() => '')).trim();
      }
      const r = await call('POST', `/v1/box/jobs/${job.job_id}/result`, {
        attempt, read_ok: !!text, qr_text: text || null, read_ms: 1200, flash: false,
      });
      if (job.type === 'test' && r.status === 200) {
        await diagnostic('camera_scan_result', {
          job_id: job.job_id, attempt, frames: 18, qr_shapes: text ? 1 : 0, read_ok: !!text, read_ms: 1200,
        });
      }
      const v = r.json?.status;
      console.log(v === 'pass' ? '🔔🔔 ผ่าน (ปี๊บสั้น 2)' : v === 'retry' ? '🔔— ลองใหม่ (ปี๊บยาว 1)' : '🔔—🔔—🔔— ไม่ผ่าน (ปี๊บยาว 3)');
      if (v !== 'retry') break;
    }
  }
}

