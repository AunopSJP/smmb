import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Role } from '../auth/account.service.js';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import { normalizePhone } from '../auth/phone.js';
import type { AuthContext } from '../auth/session.service.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { AdminAgencyService } from './admin-agency.service.js';
import { SupportService } from '../support/support.service.js';
import { AdminUsersService } from './admin-users.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class AgencyIdParam {
  @IsUUID() id!: string;
}
class UserIdParam {
  @Matches(/^U-\d{1,12}$/) id!: string;
}
class UserRoleParam extends UserIdParam {
  @IsIn(['admin', 'owner', 'officer']) role!: Role;
}

class ListAgenciesQuery {
  @IsOptional() @IsIn(['pending', 'approved', 'rejected']) status?: 'pending' | 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

class RejectAgencyDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) reason?: string;
}

class HeadInfo {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @Transform(({ value }) => normalizePhone(value) ?? value)
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'phone must be a Thai mobile number like 0812345678' })
  phone!: string;
}
class CreateAgencyDto {
  @Transform(trim) @IsString() @Length(1, 200) name!: string;
  @IsIn(['police', 'guard', 'other']) type!: 'police' | 'guard' | 'other';
  @Transform(trim) @IsString() @Length(3, 200) contact!: string;
  @ValidateNested() @Type(() => HeadInfo) head!: HeadInfo;
}

class SupportContactDto {
  @Transform(trim) @IsString() @Length(1, 500) contact!: string;
}

class ListUsersQuery {
  @IsOptional() @IsIn(['admin', 'owner', 'officer', 'head']) role?: Role | 'head';
  @IsOptional() @IsIn(['active', 'disabled']) status?: 'active' | 'disabled';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) per_page: number = 20;
}

class SetUserStatusDto {
  @IsIn(['active', 'disabled']) status!: 'active' | 'disabled';
}

class PutRoleDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) level?: number;
  @IsOptional() @IsIn(['active', 'disabled']) status?: 'active' | 'disabled';
}

// docs/api.md §9 — แอดมินเท่านั้น
@RequireRole('admin')
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly agencies: AdminAgencyService,
    private readonly users: AdminUsersService,
    private readonly support: SupportService,
  ) {}

  // ── §9.2 หน่วยงาน ──────────────────────────────────────────────────────

  @Get('agencies')
  listAgencies(@Query() q: ListAgenciesQuery) {
    return this.agencies.list(q);
  }

  @Get('agencies/:id')
  getAgency(@Auth() auth: AuthContext, @Param() p: AgencyIdParam) {
    return this.agencies.get(auth.userId, p.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('agencies/:id/approve')
  approveAgency(@Auth() auth: AuthContext, @Param() p: AgencyIdParam) {
    return this.agencies.approve(auth.userId, p.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('agencies/:id/reject')
  async rejectAgency(@Auth() auth: AuthContext, @Param() p: AgencyIdParam, @Body() dto: RejectAgencyDto) {
    await this.agencies.reject(auth.userId, p.id, dto.reason || undefined);
    return { ok: true };
  }

  @Post('agencies')
  createAgency(@Auth() auth: AuthContext, @Body() dto: CreateAgencyDto) {
    return this.agencies.create(auth.userId, dto);
  }

  // ── §3.1 ช่องทางติดต่อผู้ดูแล ─────────────────────────────────────────

  @Put('settings/support-contact')
  setSupportContact(@Auth() auth: AuthContext, @Body() dto: SupportContactDto) {
    return this.support.set(auth.userId, dto.contact);
  }

  // ── §9.3 ผู้ใช้ ────────────────────────────────────────────────────────

  @Get('users')
  listUsers(@Query() q: ListUsersQuery) {
    return this.users.list({ role: q.role, status: q.status, q: q.q, page: q.page, perPage: q.per_page });
  }

  @Get('users/:id')
  getUser(@Auth() auth: AuthContext, @Param() p: UserIdParam) {
    return this.users.get(auth.userId, p.id);
  }

  @Patch('users/:id')
  async setUserStatus(@Auth() auth: AuthContext, @Param() p: UserIdParam, @Body() dto: SetUserStatusDto) {
    await this.users.setStatus(auth.userId, p.id, dto.status);
    return { ok: true };
  }

  @Put('users/:id/roles/:role')
  async putRole(@Auth() auth: AuthContext, @Param() p: UserRoleParam, @Body() dto: PutRoleDto) {
    await this.users.putRole(auth.userId, p.id, p.role, dto);
    return { ok: true };
  }

  @Delete('users/:id/roles/:role')
  async deleteRole(@Auth() auth: AuthContext, @Param() p: UserRoleParam) {
    await this.users.deleteRole(auth.userId, p.id, p.role);
    return { ok: true };
  }

  /** รหัสชั่วคราวแสดงครั้งเดียว — ไม่เก็บ ไม่ log */
  @RateLimit({ limit: 10, windowSec: 60 })
  @HttpCode(HttpStatus.OK)
  @Post('users/:id/reset-password')
  resetPassword(@Auth() auth: AuthContext, @Param() p: UserIdParam) {
    return this.users.resetPassword(auth.userId, p.id);
  }
}
