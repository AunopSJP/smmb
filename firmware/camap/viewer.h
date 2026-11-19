#pragma once

#define CAMAP_STREAM_PORT 81
#define CAMAP_STRINGIFY_VALUE(value) #value
#define CAMAP_STRINGIFY(value) CAMAP_STRINGIFY_VALUE(value)
constexpr unsigned STREAM_PORT = CAMAP_STREAM_PORT;

constexpr char VIEWER_HTML[] = R"HTML(<!doctype html>
<html lang="th">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ESP32-CAM · ภาพสด</title>
<style>
:root{color-scheme:dark;background:#151917;color:#eef3ef;font:1rem system-ui,sans-serif}
body{margin:0;padding:clamp(16px,4vw,40px)}
main{max-width:800px;margin:auto}
header{display:flex;align-items:center;justify-content:space-between;gap:8px 24px;flex-wrap:wrap;margin-bottom:16px}
h1{font-size:clamp(1.5rem,5vw,2rem);margin:0}
#status{color:#c3d0c7;margin:0}
.screen{position:relative;aspect-ratio:4/3;background:#090c0a;border:1px solid #516056;border-radius:8px;overflow:hidden;display:grid;place-items:center}
img{width:100%;height:100%;object-fit:contain}
#faces{position:absolute;inset:0;pointer-events:none}
#qrbox{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#qrbox polygon{fill:none;stroke:#fbbf24;stroke-width:3;stroke-linejoin:round;vector-effect:non-scaling-stroke}
#qrbox polygon.ok{stroke:#4ade80}
.face{position:absolute;box-sizing:border-box;border:2px solid #b8e3be}
.controls{display:flex;justify-content:flex-end;margin-top:16px}
.analysis{margin-top:16px}
.analysis label{display:flex;align-items:center;gap:8px;min-height:44px;width:fit-content}
.analysis input{width:18px;height:18px;accent-color:#b8e3be}
.analysis p{margin:4px 0;overflow-wrap:anywhere}
form{margin-top:20px}
fieldset{margin:0;padding:14px;border:1px solid #516056;border-radius:8px;display:flex;flex-wrap:wrap;gap:12px;align-items:end;min-width:0}
legend{padding:0 6px}
label{display:grid;gap:4px;flex:1 1 140px}
button,select{font:inherit;min-height:44px;padding:8px 12px;border-radius:6px}
select{background:#202722;color:inherit;border:1px solid #68796d}
button{font-weight:650;border:0;background:#b8e3be;color:#16281b;cursor:pointer}
button:disabled,fieldset:disabled button{opacity:.65;cursor:default}
:is(button,select):focus-visible{outline:2px solid #fff;outline-offset:4px}
#settings-status{color:#c3d0c7;margin:8px 0 0}
</style>
<main>
<header><h1>ESP32-CAM</h1><p id="status" role="status">กำลังเปิดกล้อง…</p></header>
<div class="screen"><img id="feed" alt="ภาพสดจากกล้อง" hidden><div id="faces" aria-hidden="true"></div><svg id="qrbox" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"></svg></div>
<div class="controls"><button id="retry" type="button">เชื่อมต่อใหม่</button></div>
<section class="analysis" aria-label="วิเคราะห์ภาพ">
<label><input id="analyze" type="checkbox" disabled> <span id="analyze-text">สแกน QR และตรวจจับใบหน้า</span></label>
<p id="analysis-status" role="status"></p>
</section>
<form id="settings">
<fieldset disabled>
<legend>รายละเอียดภาพ</legend>
<label>ความละเอียด<select name="resolution">
<option value="0">160 × 120</option>
<option value="1">320 × 240</option>
<option value="2">640 × 480</option>
<option value="3">1024 × 768 (ดูความคม)</option>
<option value="4">1280 × 1024 (ดูความคม)</option>
</select></label>
<label>คุณภาพ JPEG<select name="quality">
<option value="0">สูง</option>
<option value="1">มาตรฐาน</option>
<option value="2">ประหยัดข้อมูล</option>
</select></label>
<button type="submit">ใช้การตั้งค่า</button>
</fieldset>
<p id="settings-status" role="status"></p>
</form>
<section class="analysis" id="tune" hidden aria-label="ความคมของภาพ">
<label>ความคมของภาพ (sharpness)<select id="sharp"><option value="-3">-3</option><option value="-2">-2</option><option value="-1">-1</option><option value="0">0</option><option value="1">+1</option><option value="2">+2</option><option value="3">+3</option></select></label>
<p id="tune-status" role="status">โฟกัสปรับที่เลนส์เท่านั้น (หมุนเลนส์ถ้าเป็นแบบโฟกัสมือ)</p>
</section>
<noscript><p>เปิด JavaScript เพื่อดูภาพสด</p></noscript>
</main>
<script>
const feed = document.querySelector('#feed');
const status = document.querySelector('#status');
const retry = document.querySelector('#retry');
const settings = document.querySelector('#settings');
const fields = settings.querySelector('fieldset');
const settingsStatus = document.querySelector('#settings-status');
const resolution = settings.elements.namedItem('resolution');
const quality = settings.elements.namedItem('quality');
const analyze = document.querySelector('#analyze');
const analysisStatus = document.querySelector('#analysis-status');
const faceLayer = document.querySelector('#faces');
const qrLayer = document.querySelector('#qrbox');
const analyzeText = document.querySelector('#analyze-text');
const SVG_NS = 'http://www.w3.org/2000/svg';
// ความคมของเซนเซอร์ (เฉพาะ camtest — รุ่นอื่นไม่มี /tune แล้วส่วนนี้ซ่อนอยู่)
const tuneBox = document.querySelector('#tune');
const sharpSelect = document.querySelector('#sharp');
async function loadTune(query) {
  try {
    const response = await fetch('/tune' + (query ? '?' + query : ''));
    if (!response.ok) throw new Error('no tune');
    const t = await response.json();
    tuneBox.hidden = false;
    sharpSelect.value = String(t.sharp);
  } catch {
    tuneBox.hidden = true;
  }
}
sharpSelect.addEventListener('change', () => loadTune('sharp=' + sharpSelect.value));
// ความกว้าง QR ที่ตู้เห็น (พิกเซลของภาพวิเคราะห์) และเทียบกับตู้จริงที่ใช้ภาพกว้าง 320 px — QR ประจำตัวต้องกว้างราว 100 px ขึ้นไปถึงถอดได้
const PROD_WIDTH = 320;
const MIN_PROD_QR_PX = 100;
// บอกว่างานวิเคราะห์เบื้องหลังยังเดินอยู่ไหม: จำนวนรอบ + เวลาต่อรอบ (runs ไม่เพิ่ม = วิเคราะห์ไม่เสร็จ)
function analysisInfo(current) {
  return current.runs === undefined ? '' : ' · วิเคราะห์แล้ว ' + current.runs + ' รอบ (รอบละ ' + current.ms + ' ms)';
}
// path 2/4 = ภาพจากกล้องเป็นกระจก ตัวอ่านกลับด้านให้เอง · pass 2 = ต้องลับขอบก่อนถึงอ่านได้ (ภาพเบลอ)
function pathNote(current) {
  const mirror = current.path === 2 || current.path === 4;
  return (mirror ? ' · ภาพกระจก กลับด้านให้อัตโนมัติ' : '') + (current.pass === 2 ? ' · ลับขอบ' : '');
}
function qrWidthPx(current) {
  if (!current.aw || !current.qrboxes || !current.qrboxes.length) return 0;
  const b = current.qrboxes[0];
  const xs = [b[0], b[2], b[4], b[6]];
  return Math.max(...xs) - Math.min(...xs);
}
function qrSize(current) {
  const w = qrWidthPx(current);
  if (!w) return '';
  return ' · กว้าง ' + w + ' px จากภาพ ' + current.aw + ' px (เทียบตู้จริง ≈ ' + Math.round(w * PROD_WIDTH / current.aw) + ' px)';
}
function qrVerdict(current) {
  const prod = qrWidthPx(current) * PROD_WIDTH / (current.aw || PROD_WIDTH);
  return prod < MIN_PROD_QR_PX ? 'เล็กเกินไป — ขยับเข้าใกล้กล้อง' : 'ขนาดพอแต่ถอดไม่ได้ — น่าจะเบลอ (เลนส์โฟกัสไม่ตรงระยะ) หรือจอสะท้อนแสง';
}
// เส้นล้อม QR ที่ตู้เห็น: เขียว = ถอดรหัสได้ · เหลือง = เห็นรูปทรงแต่ถอดไม่ได้
function drawQr(current) {
  if (feed.hidden || !current.aw || !current.qrboxes || !current.qrboxes.length) {
    qrLayer.replaceChildren();
    return;
  }
  qrLayer.replaceChildren(...current.qrboxes.map((b) => {
    const polygon = document.createElementNS(SVG_NS, 'polygon');
    const points = [];
    for (let i = 0; i < 8; i += 2) points.push((b[i] / current.aw).toFixed(4) + ',' + (b[i + 1] / current.ah).toFixed(4));
    polygon.setAttribute('points', points.join(' '));
    if (b[8]) polygon.setAttribute('class', 'ok');
    return polygon;
  }));
}
let analysisTimer;
let analysisRequest = 0;
let timeout;
let firstFrame;
function stopWaiting() {
  clearTimeout(timeout);
  clearInterval(firstFrame);
}
function unavailable() {
  stopWaiting();
  feed.hidden = true;
  feed.removeAttribute('src');
  faceLayer.replaceChildren();
  qrLayer.replaceChildren();
  status.textContent = 'เปิดภาพไม่ได้ · ลองเชื่อมต่อใหม่';
}
function connect() {
  stopWaiting();
  feed.hidden = true;
  faceLayer.replaceChildren();
  qrLayer.replaceChildren();
  status.textContent = 'กำลังเปิดกล้อง…';
  feed.src = 'http://' + location.hostname + ':)HTML" CAMAP_STRINGIFY(CAMAP_STREAM_PORT) R"HTML(/stream?t=' + Date.now();
  firstFrame = setInterval(() => {
    if (feed.naturalWidth === 0) return;
    stopWaiting();
    feed.hidden = false;
    status.textContent = 'กำลังแสดงภาพสด';
  }, 100);
  timeout = setTimeout(unavailable, 10000);
}
feed.addEventListener('error', unavailable);
async function updateAnalysis(value) {
  clearTimeout(analysisTimer);
  const request = ++analysisRequest;
  const manual = value !== undefined;
  if (manual) analyze.disabled = true;
  try {
    const update = manual ? {method:'PUT', body:value ? '1' : '0'} : undefined;
    const response = await fetch('/analysis', update);
    if (!response.ok) throw new Error('Analysis unavailable');
    const current = await response.json();
    if (request !== analysisRequest) return;
    analyze.checked = current.enabled;
    if (current.face_off) analyzeText.textContent = 'สแกน QR · วาดกรอบล้อม QR';
    analyze.disabled = false;
    const seen = current.qrboxes && current.qrboxes.length;
    const base = !feed.hidden && feed.naturalWidth > 640 ? 'ภาพใหญ่กว่า 640×480 — ไม่วิเคราะห์ QR (ใช้ดูความคมของภาพอย่างเดียว)' : current.qr ? 'QR: ' + current.qr + qrSize(current) + pathNote(current) : seen ? 'เห็นรูปทรง QR' + qrSize(current) + ' · ' + qrVerdict(current) : current.enabled ? 'ยังไม่พบ QR' : '';
    const message = base && current.enabled ? base + analysisInfo(current) : base;
    if (analysisStatus.textContent !== message) analysisStatus.textContent = message;
    drawQr(current);
    const boxes = feed.hidden ? [] : current.faces.map(([x, y, width, height]) => {
      const box = document.createElement('span');
      box.className = 'face';
      box.style.left = x * 100 + '%';
      box.style.top = y * 100 + '%';
      box.style.width = width * 100 + '%';
      box.style.height = height * 100 + '%';
      return box;
    });
    faceLayer.replaceChildren(...boxes);
    if (current.enabled) analysisTimer = setTimeout(updateAnalysis, 600);
  } catch {
    if (request !== analysisRequest) return;
    if (manual) analyze.checked = !value;
    faceLayer.replaceChildren();
    qrLayer.replaceChildren();
    analysisStatus.textContent = 'อ่านผลวิเคราะห์ไม่ได้ · ลองเชื่อมต่อใหม่';
    if (analyze.checked) analysisTimer = setTimeout(updateAnalysis, 1600);
    analyze.disabled = false;
  }
}
analyze.addEventListener('change', () => updateAnalysis(analyze.checked));
async function loadSettings(update) {
  const response = await fetch('/settings', update);
  if (!response.ok) throw new Error('Camera settings unavailable');
  const current = await response.json();
  for (const option of resolution.options) {
    option.disabled = Number(option.value) > current.maxResolution;
  }
  resolution.value = String(current.resolution);
  quality.value = String(current.quality);
  fields.disabled = false;
}
function refreshSettings() {
  settingsStatus.textContent = '';
  loadSettings().catch(() => {
    settingsStatus.textContent = 'อ่านการตั้งค่าไม่ได้ · ลองเชื่อมต่อใหม่';
  });
}
retry.addEventListener('click', () => {
  connect();
  refreshSettings();
  if (!analyze.disabled) updateAnalysis();
});
settings.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = resolution.value + quality.value;
  fields.disabled = true;
  retry.disabled = true;
  stopWaiting();
  feed.hidden = true;
  feed.removeAttribute('src');
  settingsStatus.textContent = 'กำลังใช้การตั้งค่า…';
  try {
    await loadSettings({method: 'PUT', body});
    settingsStatus.textContent = 'ใช้การตั้งค่าแล้ว';
  } catch {
    try { await loadSettings(); } catch { fields.disabled = false; }
    settingsStatus.textContent = 'ใช้การตั้งค่าไม่ได้ · ลองอีกครั้ง';
  } finally {
    retry.disabled = false;
    connect();
  }
});
refreshSettings();
updateAnalysis();
connect();
loadTune();
</script>
</html>)HTML";

#undef CAMAP_STRINGIFY
#undef CAMAP_STRINGIFY_VALUE
#undef CAMAP_STREAM_PORT
