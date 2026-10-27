import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env.js';

/** ตั้งค่าที่ใช้ทั้งตอนรันจริงและตอนเทสต์ — แก้ที่เดียว */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // มี reverse proxy หน้า NestJS ตอนขึ้นจริง — ไม่ตั้ง IP ใน log/rate limit จะเป็นของ proxy หมด
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy !== false) app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ตัดฟิลด์ที่ไม่ได้ประกาศทิ้ง
      forbidNonWhitelisted: true, // และตอบ 400 ถ้าส่งมา
      transform: true,
    }),
  );
}
