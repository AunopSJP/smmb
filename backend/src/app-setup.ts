import { BadRequestException, Injectable, Logger, ValidationPipe, type PipeTransform } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Env } from './config/env.js';

/**
 * ตัด prefix (เช่น /smmb-api) ออกจาก req.url ตอนจับคู่ route — req.originalUrl ยังเป็น path เต็ม
 * ลายเซ็นของตู้เซ็นจาก originalUrl จึงยังตรง · ไม่ตั้ง prefix = ไม่ทำอะไร
 */
export function stripPathPrefix(prefix: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    if (prefix && (req.url === prefix || req.url.startsWith(prefix + '/') || req.url.startsWith(prefix + '?'))) {
      req.url = req.url.slice(prefix.length) || '/';
    }
    next();
  };
}

/**
 * ตัวอักษร NUL (U+0000) เก็บลง Postgres ไม่ได้ → เดิมกลายเป็น 500 (ยิงได้แม้ไม่ล็อกอิน เช่น เบอร์ตอน signin)
 * ตรวจ string ทุกตัวใน body / query / path ก่อนถึง handler → 400
 */
const NUL = String.fromCharCode(0);
export function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes(NUL);
  if (depth > 20 || value === null || typeof value !== 'object' || Buffer.isBuffer(value)) return false;
  for (const [k, v] of Object.entries(value)) if (k.includes(NUL) || containsNul(v, depth + 1)) return true;
  return false;
}

@Injectable()
export class RejectNulPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (containsNul(value)) throw new BadRequestException('input contains a NUL character');
    return value;
  }
}

/** เมธอดที่เปลี่ยนข้อมูลต้องส่ง JSON เท่านั้น — form-urlencoded จากเว็บอื่นทำ login CSRF ได้ (ไม่ต้องผ่าน CORS preflight) */
const JSON_ONLY_EXEMPT = /^\/(v1\/box\/|api\/v1\/admin\/firmware(\/|$))/;
export function requireJsonBody() {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !hasBody || JSON_ONLY_EXEMPT.test(req.path) || req.is('application/json')) return next();
    res.status(415).json({
      statusCode: 415,
      error: 'Unsupported Media Type',
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'content-type must be application/json',
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  };
}

/**
 * กัน CSRF อีกชั้น: คำขอที่เปลี่ยนข้อมูลและมี header `Origin` ต้องมาจาก host เดียวกัน หรือ origin ของ PUBLIC_BASE_URL
 * ไม่มี Origin (ตู้/curl) = ผ่าน · นอก production ยอม localhost/127.0.0.1 (ng serve proxy เปลี่ยน host)
 */
export function requireSameOrigin(publicBaseUrl: string, production: boolean) {
  const allowed = new Set<string>();
  if (publicBaseUrl && URL.canParse(publicBaseUrl)) allowed.add(new URL(publicBaseUrl).origin);
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const origin = req.headers.origin;
    if (!origin || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const o = origin !== 'null' && URL.canParse(origin) ? new URL(origin) : null;
    const fwdHost = req.app?.get?.('trust proxy') ? String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim() : '';
    const hosts = [req.headers.host, fwdHost].filter(Boolean);
    const ok =
      o !== null &&
      (allowed.has(o.origin) || hosts.includes(o.host) || (!production && ['localhost', '127.0.0.1', '[::1]'].includes(o.hostname)));
    if (ok) return next();
    res.status(403).json({
      statusCode: 403,
      error: 'Forbidden',
      code: 'CROSS_ORIGIN',
      message: 'cross-origin request rejected',
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  };
}

/**
 * วัดเวลาในเซิร์ฟเวอร์ต่อคำขอ — ส่งกลับเป็น `Server-Timing: app;dur=<ms>` (เห็นใน DevTools/Performance API)
 * เพื่อแยก "เวลาเซิร์ฟเวอร์" ออกจาก "เวลาเครือข่าย/เบราว์เซอร์" · log เฉพาะคำขอที่ช้ากว่า SLOW_REQUEST_MS
 * ห้าม log query string — มีเบอร์โทร/คำค้น (ข้อมูลส่วนบุคคล) ใช้ req.path เท่านั้น
 */
export function serverTiming(): express.RequestHandler {
  const slowMs = Number(process.env.SLOW_REQUEST_MS ?? 300);
  const logger = new Logger('HTTP');
  return (req, res, next): void => {
    const start = process.hrtime.bigint();
    const elapsed = () => Number(process.hrtime.bigint() - start) / 1e6;
    const originalWriteHead = res.writeHead.bind(res) as (...args: unknown[]) => express.Response;
    res.writeHead = function (...args: unknown[]) {
      if (!res.headersSent && !res.getHeader('Server-Timing')) {
        res.setHeader('Server-Timing', `app;dur=${elapsed().toFixed(1)}`);
      }
      return originalWriteHead(...args);
    } as typeof res.writeHead;
    res.on('finish', () => {
      const ms = elapsed();
      // long-poll ของตู้ตั้งใจถือคำขอไว้นาน — ไม่ใช่ปัญหา performance
      if (ms < slowMs || req.path.startsWith('/v1/box/jobs')) return;
      logger.warn(`${req.method} ${req.path} → ${res.statusCode} (${ms.toFixed(0)} ms)`);
    });
    next();
  };
}

/** ตั้งค่าที่ใช้ทั้งตอนรันจริงและตอนเทสต์ — แก้ที่เดียว */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // มี reverse proxy หน้า NestJS ตอนขึ้นจริง — ไม่ตั้ง IP ใน log/rate limit จะเป็นของ proxy หมด
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy !== false) app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.use(serverTiming());
  const prefix = config.get('API_PATH_PREFIX', { infer: true });
  if (prefix) app.use(stripPathPrefix(prefix)); // ต้องอยู่ก่อน express.raw ของ /v1/box

  app.use(requireSameOrigin(config.get('PUBLIC_BASE_URL', { infer: true }), config.get('NODE_ENV', { infer: true }) === 'production'));
  app.use(requireJsonBody()); // ต้องอยู่ก่อนตัวอ่าน body ของ Nest
  app.use(cookieParser());
  // API ของตู้: อ่าน body เป็นไบต์ดิบ (ต้องเซ็นจากไบต์ที่ตู้ส่งจริง) — BoxAuthGuard ตรวจลายเซ็นแล้วค่อยแปลงเป็น JSON
  // ลงทะเบียนก่อน app.init() → อยู่ก่อนตัวอ่าน JSON ของ Nest (ตัวนั้นข้ามคำขอที่อ่าน body แล้ว)
  // ภาพสดจากกล้อง (งานทดสอบ) เป็น JSON ที่มี JPEG แบบ base64 → ใหญ่กว่าคำขออื่น
  // อัปโหลดเฟิร์มแวร์ (ไบต์ดิบ ≤ 1.9 MB) โดยแอดมิน — อ่านเป็น Buffer เอง ไม่ผ่านตัวอ่าน JSON
  const rawFirmware = express.raw({ type: () => true, limit: '2mb' });
  const rawPhoto = express.raw({ type: () => true, limit: '120kb' });
  // เฉพาะการอัปโหลด (POST) — PUT /admin/firmware/auto เป็น JSON ปกติ
  app.use('/api/v1/admin/firmware', (req: express.Request, res: express.Response, next: express.NextFunction) => (req.method === 'POST' ? rawFirmware(req, res, next) : next()));
  app.use('/v1/box/preview', rawPhoto);
  // ใช้ req.path (ไม่มี query string) — เดิมใช้ regex กับ req.url ทำให้ URL ที่มี ?query ไม่ match แล้วตกไปใช้เพดาน 16kb
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (/^\/v1\/box\/jobs\/[^/]+\/photo$/.test(req.path)) return rawPhoto(req, res, next);
    next();
  });
  app.use('/v1/box', express.raw({ type: () => true, limit: '16kb' }));
  // ดูคำขอจากตู้แบบสด ๆ ตอนทดสอบบอร์ด (npm run dev:mock เปิดให้เอง) — เหตุผลที่ลายเซ็นไม่ผ่านพิมพ์จาก BoxAuthGuard
  if (process.env.BOX_REQUEST_LOG === '1') {
    const log = new Logger('Box');
    app.use('/v1/box', (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const started = Date.now();
      res.on('finish', () => {
        const box = typeof req.headers['x-box-id'] === 'string' ? req.headers['x-box-id'] : '-';
        // IP ไว้เช็กว่าตั้ง TRUST_PROXY ถูก (หลัง proxy ต้องเห็น IP จริงของบอร์ด ไม่ใช่ 127.0.0.1)
        log.log(`${box} ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started} ms) from ${req.ip ?? '-'}`);
      });
      next();
    });
  }
  app.useGlobalPipes(
    new RejectNulPipe(),
    new ValidationPipe({
      whitelist: true, // ตัดฟิลด์ที่ไม่ได้ประกาศทิ้ง
      forbidNonWhitelisted: true, // และตอบ 400 ถ้าส่งมา
      transform: true,
    }),
  );
}
