import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PushModule } from '../push/push.module.js';
import { AgencyController } from './agency.controller.js';
import { AgencyService } from './agency.service.js';

@Module({
  imports: [AuthModule, PushModule],
  controllers: [AgencyController],
  providers: [AgencyService],
})
export class AgencyModule {}
