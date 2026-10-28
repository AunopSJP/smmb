import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PushModule } from '../push/push.module.js';
import { CodeAttempts } from '../rate-limit/code-attempts.js';
import { RiderController } from './rider.controller.js';
import { RiderService } from './rider.service.js';

/** ไรเดอร์แจ้งส่งของ (เฟส 4) */
@Module({
  imports: [AuthModule, PushModule],
  controllers: [RiderController],
  providers: [RiderService, CodeAttempts],
})
export class RiderModule {}
