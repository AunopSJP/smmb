import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Env } from './config/env.js';

/** ตั้งค่าที่ใช้ทั้งตอนรันจริงและตอนเทสต์ — แก้ที่เดียว */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // มี reverse proxy หน้า NestJS ตอนขึ้นจริง — ไม่ตั้ง IP ใน log/rate limit จะเป็นของ proxy หมด
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy !== false) app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');

  app.use(cookieParser());
  // API ของตู้: อ่าน body เป็นไบต์ดิบ (ต้องเซ็นจากไบต์ที่ตู้ส่งจริง) — BoxAuthGuard ตรวจลายเซ็นแล้วค่อยแปลงเป็น JSON
  // ลงทะเบียนก่อน app.init() → อยู่ก่อนตัวอ่าน JSON ของ Nest (ตัวนั้นข้ามคำขอที่อ่าน body แล้ว)
  app.use('/v1/box', express.raw({ type: () => true, limit: '16kb' }));
  // ดูคำขอจากตู้แบบสด ๆ ตอนทดสอบบอร์ด (npm run dev:mock เปิดให้เอง) — เหตุผลที่ลายเซ็นไม่ผ่านพิมพ์จาก BoxAuthGuard
  if (process.env.BOX_REQUEST_LOG === '1') {
    const log = new Logger('Box');
    app.use('/v1/box', (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const started = Date.now();
      res.on('finish', () => {
        const box = typeof req.headers['x-box-id'] === 'string' ? req.headers['x-box-id'] : '-';
        log.log(`${box} ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started} ms)`);
      });
      next();
    });
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ตัดฟิลด์ที่ไม่ได้ประกาศทิ้ง
      forbidNonWhitelisted: true, // และตอบ 400 ถ้าส่งมา
      transform: true,
    }),
  );
}
