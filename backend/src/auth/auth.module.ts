import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { COUNTER_STORE, RedisCounterStore } from '../rate-limit/rate-limit.store.js';
import { PushModule } from '../push/push.module.js';
import { AccessService } from './access.service.js';
import { AccountService } from './account.service.js';
import { AuthController, MeController, TermsController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { MeService } from './me.service.js';
import { PasswordService } from './password.service.js';
import { RolesGuard } from './roles.guard.js';
import { SessionService } from './session.service.js';
import { AccountSetupGuard } from './account-setup.guard.js';
import { TermsService } from './terms.service.js';

@Module({
  imports: [PushModule],
  controllers: [AuthController, MeController, TermsController],
  providers: [
    AccountService,
    { provide: COUNTER_STORE, useClass: RedisCounterStore },
    // ลำดับสำคัญ: rate limit → ล็อกอิน → ตั้งค่าบัญชี (รหัสชั่วคราว/ข้อตกลง) → บทบาท
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: AccountSetupGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    AccessService,
    AuthService,
    MeService,
    PasswordService,
    SessionService,
    TermsService,
  ],
  exports: [AccessService, AccountService, MeService, PasswordService, SessionService, COUNTER_STORE],
})
export class AuthModule {}
