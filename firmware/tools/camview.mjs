// ดูภาพสดดิบ + แผงปรับค่าของกล้องตู้บนเครื่องนี้ที่ http://localhost:8099 (ไม่มี dependency · ใช้ Node 18+)
//   node firmware/tools/camview.mjs <IP ตู้>        เช่น  node firmware/tools/camview.mjs 10.113.254.29
// ใช้กับเฟิร์มแวร์ดูกล้องล้วน: pio run -e camview -t upload
// สคริปต์นี้แค่ส่งต่อหน้าเว็บ/สตรีม MJPEG/คำสั่งปรับค่าระหว่างตู้กับ localhost ในวง LAN — ไม่เก็บภาพ ไม่ส่งออกอินเทอร์เน็ต
import http from 'node:http';

const [boxIp = process.env.BOX_IP] = process.argv.slice(2);
const port = Number(process.env.PORT ?? 8099);
if (!boxIp) {
  console.error('usage: node camview.mjs <box ip>');
  process.exit(1);
}

http
  .createServer((req, res) => {
    const isStream = req.url?.startsWith('/stream');
    const up = http.get({ host: boxIp, port: isStream ? 81 : 80, path: req.url, timeout: isStream ? 8000 : 5000 }, (r) => {
      res.writeHead(r.statusCode ?? 502, { ...r.headers, 'Cache-Control': 'no-store' });
      r.pipe(res);
    });
    up.on('error', () => res.headersSent || res.writeHead(502, { 'Content-Type': 'text/plain' }).end('box unreachable'));
    up.on('timeout', () => up.destroy());
    req.on('close', () => up.destroy());
  })
  .listen(port, '127.0.0.1', () => console.log(`camera view → http://localhost:${port}  (box ${boxIp})`));
