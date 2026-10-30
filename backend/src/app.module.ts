import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AdminModule } from './admin/admin.module.js';
import { AgencyModule } from './agency/agency.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BoxModule } from './box/box.module.js';
import { InspectionModule } from './inspection/inspection.module.js';
import { RiderModule } from './rider/rider.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { SosModule } from './sos/sos.module.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { validateEnv } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { PushModule } from './push/push.module.js';
import { SupportModule } from './support/support.module.js';

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
    SupportModule,
    BoxModule,
    InspectionModule,
    SchedulerModule,
    RiderModule,
    SosModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
