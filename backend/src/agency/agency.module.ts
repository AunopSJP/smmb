import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PushModule } from '../push/push.module.js';
import { AgencyController } from './agency.controller.js';
import { AgencyService } from './agency.service.js';
import { ZoneController } from './zone.controller.js';
import { ZoneService } from './zone.service.js';

@Module({
  imports: [AuthModule, PushModule],
  controllers: [AgencyController, ZoneController],
  providers: [AgencyService, ZoneService],
})
export class AgencyModule {}
