import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PushModule } from '../push/push.module.js';
import { SosModule } from '../sos/sos.module.js';
import { AdminBoxController } from './admin-box.controller.js';
import { AdminBoxService } from './admin-box.service.js';
import { BoxAuthGuard } from './box-auth.guard.js';
import { BoxConfigService } from './box-config.service.js';
import { BoxJobService } from './box-job.service.js';
import { BoxProtocolController } from './box-protocol.controller.js';
import { BoxProtocolService } from './box-protocol.service.js';
import { JobHub } from './job-hub.js';
import { OwnerBoxController } from './owner-box.controller.js';
import { OwnerBoxService } from './owner-box.service.js';
import { CodeAttempts } from '../rate-limit/code-attempts.js';

/** ตู้: API ของตู้ `/v1/box/*` + แอดมินลงทะเบียน/ดูตู้/งานทดสอบ/ค่าตั้งค่า + เจ้าของบ้านผูกตู้ (เฟส 2) */
@Module({
  imports: [AuthModule, PushModule, SosModule],
  controllers: [BoxProtocolController, AdminBoxController, OwnerBoxController],
  providers: [AdminBoxService, BoxAuthGuard, BoxConfigService, BoxJobService, BoxProtocolService, CodeAttempts, JobHub, OwnerBoxService],
  exports: [BoxConfigService, BoxJobService],
})
export class BoxModule {}
