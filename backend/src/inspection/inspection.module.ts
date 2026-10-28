import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BoxModule } from '../box/box.module.js';
import { PushModule } from '../push/push.module.js';
import { SosModule } from '../sos/sos.module.js';
import { CodeAttempts } from '../rate-limit/code-attempts.js';
import { InspectionController, OfficerController } from './inspection.controller.js';
import { InspectionService } from './inspection.service.js';

/** ตรวจตู้ (เฟส 3) — ลงทะเบียนตัวตัดสินงาน 'inspect' กับ BoxJobService ตอนเริ่ม */
@Module({
  imports: [AuthModule, BoxModule, PushModule, SosModule],
  controllers: [InspectionController, OfficerController],
  providers: [InspectionService, CodeAttempts],
  exports: [InspectionService],
})
export class InspectionModule {}
