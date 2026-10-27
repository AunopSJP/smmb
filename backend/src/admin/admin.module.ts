import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PushModule } from '../push/push.module.js';
import { AdminAgencyService } from './admin-agency.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [AuthModule, PushModule],
  controllers: [AdminController],
  providers: [AdminAgencyService, AdminUsersService],
})
export class AdminModule {}
