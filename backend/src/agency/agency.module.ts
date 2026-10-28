import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BoxModule } from '../box/box.module.js';
import { PushModule } from '../push/push.module.js';
import { AgencyController } from './agency.controller.js';
import { AgencyService } from './agency.service.js';
import { AgencyTodayService } from './agency-today.service.js';
import { HouseController, ZoneController } from './zone.controller.js';
import { ZoneService } from './zone.service.js';

@Module({
  imports: [AuthModule, PushModule, BoxModule],
  controllers: [AgencyController, ZoneController, HouseController],
  providers: [AgencyService, ZoneService, AgencyTodayService],
})
export class AgencyModule {}
