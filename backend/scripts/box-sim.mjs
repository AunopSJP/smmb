#!/usr/bin/env node
// ตู้จำลอง — เซ็นคำขอแบบเดียวกับเฟิร์มแวร์ แล้วเรียก /v1/box/* (โปรโตคอล docs/SMMB_โปรโตคอลตู้-เซิร์ฟเวอร์.md)
// ใช้ทดสอบเซิร์ฟเวอร์ตอนยังไม่มีบอร์ด และเป็นตัวอย่างโค้ดให้ทีมเฟิร์มแวร์เทียบ (Node 20+ ไม่ต้องติดตั้งอะไรเพิ่ม)
//
//   node scripts/box-sim.mjs boot   --url http://localhost:3000 --box BX-00001 --secret <64 hex>
//   node scripts/box-sim.mjs report --battery 15
//   node scripts/box-sim.mjs poll   [--wait 50] [--fail]     ถือ long-poll วนไป ได้งานแล้ว ready + ส่งผลอ่าน QR
//   node scripts/box-sim.mjs event  --type camera_error
//
// ค่า --url / --box / --secret ใส่เป็น env แทนได้: SMMB_URL, SMMB_BOX, SMMB_SECRET
import { createHash, createHmac, randomBytes } from 'node:crypto';

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

if (!['boot', 'report', 'poll', 'event'].includes(cmd) || !/^BX-\d+$/.test(BOX) || !/^[0-9a-f]{64}$/i.test(SECRET)) {
  console.error('usage: box-sim.mjs <boot|report|poll|event> --url <server> --box BX-00001 --secret <device_secret 64 hex>');
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
    const job = json.job;
    await sleep(800); // เปิดไฟ + กล้อง
    await call('POST', `/v1/box/jobs/${job.job_id}/ready`, { light: 'on', flash: false });
    for (let attempt = 1; attempt <= job.attempt_max; attempt++) {
      await sleep(1500); // กล้องอ่าน QR
      const read = !fail;
      const r = await call('POST', `/v1/box/jobs/${job.job_id}/result`, {
        attempt, read_ok: read, qr_text: read ? 'SIM-QR-TEXT' : null, read_ms: 1500, flash: false,
      });
      if (r.json?.status !== 'retry') break;
    }
  }
}
