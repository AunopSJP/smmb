import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AdminModule } from './admin/admin.module.js';
import { AgencyModule } from './agency/agency.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { validateEnv } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { PushModule } from './push/push.module.js';

// path ของ route: เว็บแอป `/api/v1/*` · health `/api/health*` · ตู้ `/v1/box/*` (docs/api.md)
// จึงไม่ตั้ง global prefix — แต่ละ controller เขียน path เต็มเอง
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    DbModule,
    AuthModule,
    PushModule,
    AgencyModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
