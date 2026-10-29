#include "debugview.h"

#include <WebServer.h>
#include <WiFi.h>
#include <esp_camera.h>
#include <esp_task_wdt.h>

#include "camera_qr.h"
#include "settings.h"
#include "signer.h"

static WebServer* server = nullptr;
static uint32_t lastViewMs = 0;
static const uint32_t VIEWER_TTL_MS = 20000;

void cliPoll();  // main.cpp — ให้สั่ง camonly off ได้ระหว่างสตรีม

static String viewKey() { return sha256Hex(settings.secret).substring(0, 8); }

static bool authorized() {
  if (server->arg("k") == viewKey()) return true;
  server->send(403, "text/plain", "forbidden — เปิดจาก URL ที่ตู้พิมพ์ใน Serial (debugcam on)");
  return false;
}

static const char PAGE[] PROGMEM = R"HTML(<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>กล้องตู้ — ทดสอบ</title>
<style>
body{margin:0;background:#111;color:#eee;font-family:system-ui,sans-serif}
.wrap{max-width:720px;margin:auto;padding:10px}
.view{position:relative;background:#000;line-height:0}
.view img{width:100%;display:block}
.view canvas{position:absolute;inset:0;width:100%;height:100%}
.banner{margin:10px 0;padding:12px 14px;border-radius:12px;font-weight:700;font-size:1.05rem;background:#333}
.banner.ok{background:#1f6f3a}.banner.warn{background:#8a5a00}.banner.bad{background:#7a1f1f}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:.9rem;margin-top:6px}
.grid span{color:#aaa}.mono{font-family:ui-monospace,monospace;word-break:break-all}
small{color:#999;display:block;margin-top:10px;line-height:1.4}
</style></head><body><div class="wrap">
<div class="view"><img id="img" alt=""><canvas id="ov"></canvas></div>
<div class="banner" id="msg">กำลังเชื่อมต่อกล้อง…</div>
<div class="grid" id="grid"></div>
<small>กรอบประ = บริเวณที่ตัวอ่าน QR ใช้ทุกเฟรม (นอกกรอบอ่านแค่ 1 ใน 4 เฟรม) · ให้ QR ทั้งใบอยู่ในกรอบ ห่าง 20–30 ซม. ถือนิ่ง ๆ · ภาพนี้ตู้ส่งมาเฉพาะตอนเปิดหน้านี้ ใช้ทดสอบเท่านั้น</small>
</div><script>
const K=new URLSearchParams(location.search).get('k')||'';
const img=document.getElementById('img'),cv=document.getElementById('ov'),msg=document.getElementById('msg'),grid=document.getElementById('grid');
let st=null;
function draw(){
  if(!st||!st.w)return;
  const w=cv.width=img.clientWidth,h=cv.height=img.clientHeight,sx=w/st.w,sy=h/st.h,ctx=cv.getContext('2d');
  ctx.clearRect(0,0,w,h);
  const cw=st.crop_w*sx,ch=st.crop_h*sy,cx=(w-cw)/2,cy=(h-ch)/2;
  ctx.setLineDash([8,6]);ctx.lineWidth=2;ctx.strokeStyle=st.decode_ago_ms>=0&&st.decode_ago_ms<1500?'#4ade80':st.shape_ago_ms>=0&&st.shape_ago_ms<1500?'#fbbf24':'#ffffffaa';
  ctx.strokeRect(cx,cy,cw,ch);
  ctx.setLineDash([]);ctx.strokeStyle='#ffffff55';ctx.beginPath();ctx.moveTo(w/2,cy);ctx.lineTo(w/2,cy+ch);ctx.moveTo(cx,h/2);ctx.lineTo(cx+cw,h/2);ctx.stroke();
}
function verdict(){
  if(!st)return;
  let c='bad',t='';
  if(st.frame_age_ms<0){t='ยังไม่มีภาพจากกล้อง';}
  else if(st.decode_ago_ms>=0&&st.decode_ago_ms<2000){c='ok';t='✅ อ่าน QR ได้: '+st.text;}
  else if(st.shape_ago_ms>=0&&st.shape_ago_ms<2000){c='warn';t='เห็นรูปร่าง QR แต่ถอดไม่ได้ — เบลอ / จอสะท้อนแสง / เอียง ลองขยับห่างออกเล็กน้อย และหันตรง ๆ';}
  else if(st.brightness<40){t='ภาพมืดเกินไป — เพิ่มความสว่างจอ หรือเปิดไฟแฟลช';}
  else if(st.brightness>235){c='warn';t='ภาพสว่างจ้า (ไหม้) — ลดความสว่างจอ / เปลี่ยนมุมเลี่ยงแสงสะท้อน';}
  else{t='ยังไม่เห็น QR — ขยับให้ QR ทั้งใบอยู่ในกรอบประ ห่างประมาณ 20–30 ซม.';}
  msg.className='banner '+c;msg.textContent=t;
  const row=(a,b)=>'<div><span>'+a+'</span></div><div class=mono>'+b+'</div>';
  grid.innerHTML=row('ความสว่าง',st.brightness+' / 255')+row('เฟรมต่อวินาที',st.fps)+row('ขนาดภาพ',st.w+'×'+st.h)
   +row('ไฟแฟลช',st.flash?'เปิด':'ปิด')+row('สถานะ',st.scanning?'กำลังอ่าน QR (งานตรวจ/ทดสอบ)':'ว่าง (ดูภาพเฉยๆ)')
   +(st.scanning?row('รอบนี้',st.scan_frames+' เฟรม · เห็นรูปร่าง QR '+st.scan_shapes+' เฟรม'):'');
}
async function loop(){
  for(;;){
    try{
      const r=await fetch('/stat.json?k='+K+'&t='+Date.now());
      if(r.status===403){msg.className='banner bad';msg.textContent='รหัส ?k= ไม่ถูกต้อง';return;}
      st=await r.json();
      await new Promise(ok=>{const n=new Image();n.onload=()=>{img.src=n.src;ok();};n.onerror=ok;n.src='/snap.jpg?k='+K+'&t='+Date.now();});
      draw();verdict();
    }catch(e){msg.className='banner bad';msg.textContent='ตู้ไม่ตอบ (กำลังรอ long-poll หรือหลุด Wi-Fi) — ลองใหม่อัตโนมัติ';await new Promise(ok=>setTimeout(ok,1500));}
  }
}
loop();
</script></body></html>)HTML";

static void handleRoot() {
  if (!authorized()) return;
  lastViewMs = millis();
  server->send_P(200, "text/html; charset=utf-8", PAGE);
}

static void handleStat() {
  if (!authorized()) return;
  lastViewMs = millis();
  server->sendHeader("Cache-Control", "no-store");
  server->send(200, "application/json", cameraPreviewJson());
}

static void handleSnap() {
  if (!authorized()) return;
  lastViewMs = millis();
  // ไม่ได้อ่าน QR อยู่ → จับเฟรมใหม่ให้ (ถือกล้องไว้ตราบที่ยังมีคนดู)
  if (!cameraScanning()) {
    cameraHold(true);
    if (!cameraRunning() && !cameraStart()) {
      server->send(503, "text/plain", "camera error");
      return;
    }
    cameraPreviewTick();
  }
  uint8_t* jpg = nullptr;
  size_t len = 0;
  if (!cameraPreviewJpeg(&jpg, &len)) {
    server->send(503, "text/plain", "no frame yet");
    return;
  }
  server->sendHeader("Cache-Control", "no-store");
  server->send_P(200, "image/jpeg", (const char*)jpg, len);
  free(jpg);
}

void debugViewStart() {
  if (server || WiFi.status() != WL_CONNECTED) return;
  server = new WebServer(80);
  server->on("/", HTTP_GET, handleRoot);
  server->on("/stat.json", HTTP_GET, handleStat);
  server->on("/snap.jpg", HTTP_GET, handleSnap);
  server->begin();
  Serial.printf("[debugcam] on → %s\n", debugViewUrl().c_str());
}

void debugViewStop() {
  if (!server) return;
  server->stop();
  delete server;
  server = nullptr;
  cameraHold(false);
  cameraStop();
}

void debugViewPoll() {
  if (server) server->handleClient();
}

bool debugViewRunning() { return server != nullptr; }

bool debugViewHasViewer() { return server && lastViewMs && millis() - lastViewMs < VIEWER_TTL_MS; }

void debugViewIdleCheck() {
  // ไม่มีคนดูแล้ว → ปล่อยกล้อง (ประหยัดไฟ + ไม่ถ่ายค้าง)
  if (!server || debugViewHasViewer() || cameraScanning() || !cameraRunning()) return;
  cameraHold(false);
  cameraStop();
  Serial.println("[debugcam] no viewer — camera off");
}

String debugViewUrl() { return "http://" + WiFi.localIP().toString() + "/?k=" + viewKey(); }

// ── ภาพดิบ MJPEG ────────────────────────────────────────────────────────
// ไว้ดูกล้องจริง ๆ: JPEG ฮาร์ดแวร์ → ส่งตรงเป็น multipart ทีละเฟรม ไม่ผ่านตัวกรอง/แปลงเทา/เข้ารหัสซ้ำ
// บล็อกจนครบเวลา (ระหว่างนี้ตู้ไม่ถือ long-poll) · ต้องมี ?k= เหมือนหน้าดูกล้องปกติ
void rawViewRun(uint32_t sec) {
  debugViewStop();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("rawview: ยังไม่ต่อ Wi-Fi");
    return;
  }
  if (!cameraRawBegin()) return;
  WiFiServer srv(80);
  srv.begin();
  const String key = viewKey();
  Serial.printf("rawview: http://%s/?k=%s (%u วิ · ภาพดิบ ไม่ผ่านตัวกรอง)\n", WiFi.localIP().toString().c_str(), key.c_str(), (unsigned)sec);
  const uint32_t endAt = millis() + sec * 1000UL;
  while ((int32_t)(endAt - millis()) > 0) {
    esp_task_wdt_reset();
    cliPoll();
    WiFiClient c = srv.available();
    if (!c) {
      delay(10);
      continue;
    }
    c.setTimeout(2);
    const String req = c.readStringUntil('\n');
    for (uint32_t t = millis(); millis() - t < 1500;) {  // ทิ้ง header ที่เหลือ
      const String h = c.readStringUntil('\n');
      if (h.length() <= 1) break;
    }
    if (req.indexOf("k=" + key) < 0) {
      c.print("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nforbidden");
      c.stop();
      continue;
    }
    if (req.startsWith("GET /stream")) {
      c.print("HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=frame\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
      uint32_t frames = 0, bytes = 0, mark = millis();
      while (c.connected() && (int32_t)(endAt - millis()) > 0) {
        esp_task_wdt_reset();
        cliPoll();
        camera_fb_t* fb = esp_camera_fb_get();
        if (!fb) {
          delay(5);
          continue;
        }
        c.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", (unsigned)fb->len);
        c.write(fb->buf, fb->len);
        c.print("\r\n");
        bytes += fb->len;
        frames++;
        esp_camera_fb_return(fb);
        if (millis() - mark >= 3000) {
          Serial.printf("rawview: %.1f fps · %u KB/frame · %ux%u\n", frames * 1000.0f / (millis() - mark), bytes / frames / 1024,
                        (unsigned)fb->width, (unsigned)fb->height);
          frames = bytes = 0;
          mark = millis();
        }
      }
      c.stop();
    } else {
      const String html = String("<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>") +
                          "<body style='margin:0;background:#000'><img src='/stream?k=" + key + "' style='width:100%;display:block'>";
      c.printf("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\nContent-Length: %u\r\n\r\n%s", (unsigned)html.length(), html.c_str());
      c.stop();
    }
  }
  srv.stop();
  cameraRawEnd();
  Serial.println("rawview: ปิดแล้ว");
}
