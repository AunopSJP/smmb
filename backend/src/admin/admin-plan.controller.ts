import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { RequireRole } from '../auth/auth.decorators.js';
import { AdminPlanService } from './admin-plan.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class PlanCodeParam {
  @Matches(/^[a-z][a-z0-9_]{1,30}$/) code!: string;
}

class CreatePlanDto {
  @Transform(trim) @IsString() @Matches(/^[a-z][a-z0-9_]{1,30}$/) code!: string;
  @Transform(trim) @IsString() @Length(1, 80) name_th!: string;
  @Transform(trim) @IsString() @Length(1, 80) name_en!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) price_note?: string;
}

class UpdatePlanDto {
  @IsOptional() @IsBoolean() is_default?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

@RequireRole('admin')
@Controller('api/v1/admin/plans')
export class AdminPlanController {
  constructor(private readonly plans: AdminPlanService) {}

  @Get()
  list() {
    return this.plans.list();
  }

  @Post()
  create(@Body() body: CreatePlanDto) {
    return this.plans.create(body);
  }

  @Patch(':code')
  update(@Param() params: PlanCodeParam, @Body() body: UpdatePlanDto) {
    if (body.is_default === undefined && body.is_active === undefined) {
      throw new BadRequestException('send is_default or is_active');
    }
    return this.plans.update(params.code, body);
  }
}
