import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PushModule } from '../push/push.module.js';
import { SupportModule } from '../support/support.module.js';
import { AdminAgencyService } from './admin-agency.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminLogsService } from './admin-logs.service.js';
import { AdminController } from './admin.controller.js';
import { AdminPlanController } from './admin-plan.controller.js';
import { AdminUserPlanController } from './admin-user-plan.controller.js';
import { AdminPlanService } from './admin-plan.service.js';
import { TechnicianRequestService } from '../box/technician-request.service.js';
import { BoxModule } from '../box/box.module.js';
import { AdminOverviewService } from './admin-overview.service.js';

@Module({
  imports: [AuthModule, PushModule, SupportModule, BoxModule],
  controllers: [AdminController, AdminPlanController, AdminUserPlanController],
  providers: [AdminAgencyService, AdminUsersService, AdminLogsService, AdminPlanService, TechnicianRequestService, AdminOverviewService],
})
export class AdminModule {}
