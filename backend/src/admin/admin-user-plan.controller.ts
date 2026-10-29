import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { AdminPlanService } from './admin-plan.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class OwnerIdParam {
  @Matches(/^U-\d{4,10}$/) id!: string;
}

class SetUserPlanDto {
  @Transform(trim) @IsString() @Matches(/^[a-z][a-z0-9_]{1,30}$/) plan_code!: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) ends_at?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) note?: string;
}

@RequireRole('admin')
@Controller('api/v1/admin/users')
export class AdminUserPlanController {
  constructor(private readonly plans: AdminPlanService) {}

  @Get(':id/plans')
  history(@Param() params: OwnerIdParam) {
    return this.plans.userHistory(params.id);
  }

  @Put(':id/plan')
  setPlan(@Auth() auth: AuthContext, @Param() params: OwnerIdParam, @Body() body: SetUserPlanDto) {
    return this.plans.setUserPlan(auth.userId, params.id, body);
  }
}
