import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
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
  /** แก้รายละเอียดแพ็กที่มีอยู่ (`code` แก้ไม่ได้) */
  @IsOptional() @Transform(trim) @IsString() @Length(1, 80) name_th?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 80) name_en?: string;
  /** ข้อความราคา/หมายเหตุ — ส่ง `null` หรือ `""` เพื่อล้าง */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) price_note?: string | null;
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
  update(@Auth() auth: AuthContext, @Param() params: PlanCodeParam, @Body() body: UpdatePlanDto) {
    if (Object.values(body).every((v) => v === undefined)) {
      throw new BadRequestException('send at least one of is_default, is_active, name_th, name_en, price_note');
    }
    return this.plans.update(params.code, body, auth.userId);
  }
}
