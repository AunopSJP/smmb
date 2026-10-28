import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PushModule } from '../push/push.module.js';
import { AdminBoxController } from './admin-box.controller.js';
import { AdminBoxService } from './admin-box.service.js';
import { BoxAuthGuard } from './box-auth.guard.js';
import { BoxConfigService } from './box-config.service.js';
import { BoxJobService } from './box-job.service.js';
import { BoxProtocolController } from './box-protocol.controller.js';
import { BoxProtocolService } from './box-protocol.service.js';
import { JobHub } from './job-hub.js';

/** ตู้: API ของตู้ `/v1/box/*` + แอดมินลงทะเบียน/ดูตู้/งานทดสอบ/ค่าตั้งค่า (เฟส 2) */
@Module({
  imports: [AuthModule, PushModule],
  controllers: [BoxProtocolController, AdminBoxController],
  providers: [AdminBoxService, BoxAuthGuard, BoxConfigService, BoxJobService, BoxProtocolService, JobHub],
  exports: [BoxConfigService, BoxJobService],
})
export class BoxModule {}
