import { Module } from '@nestjs/common';
import { BoxModule } from '../box/box.module.js';
import { PushModule } from '../push/push.module.js';
import { SchedulerService } from './scheduler.service.js';

/** งานเบื้องหลัง (design §8) */
@Module({
  imports: [BoxModule, PushModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
