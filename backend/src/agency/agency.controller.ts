import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { IsCalendarDate } from '../common/validators.js';
import { AccessService } from '../auth/access.service.js';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { AgencyTodayService } from './agency-today.service.js';
import { AgencyService, type AgencyDto, type MemberDto, type MemberStatus } from './agency.service.js';

class ListMembersQuery {
  @IsOptional() @IsIn(['pending', 'active', 'disabled']) status?: MemberStatus;
}

const t = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** ส่งมาเฉพาะที่เปลี่ยน · '' = ล้างช่องนั้น (ยกเว้น contact ห้ามว่าง) */
class AgencyContactDto {
  @IsOptional() @Transform(t) @IsString() @Length(3, 200) contact?: string;
  @IsOptional() @Transform(t) @IsString() @MaxLength(300) address?: string;
  @IsOptional() @Transform(t) @IsString() @MaxLength(100) subdistrict?: string;
  @IsOptional() @Transform(t) @IsString() @MaxLength(100) district?: string;
  @IsOptional() @Transform(t) @IsString() @MaxLength(100) province?: string;
  @IsOptional() @Transform(t) @ValidateIf((o: { postal_code?: string }) => o.postal_code !== '') @IsString() @Matches(/^[0-9]{5}$/, { message: 'postal_code must be 5 digits' }) postal_code?: string;
  @IsOptional() @Transform(t) @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @Transform(t) @IsString() @MaxLength(200) email?: string;
  @IsOptional() @Transform(t) @IsString() @MaxLength(100) contact_person?: string;
  @IsOptional() @Transform(t) @IsString() @MaxLength(300) coverage_note?: string;
  @IsOptional() @ValidateIf((o: { lat?: number | null }) => o.lat !== null) @IsNumber() @Min(-90) @Max(90) lat?: number | null;
  @IsOptional() @ValidateIf((o: { lng?: number | null }) => o.lng !== null) @IsNumber() @Min(-180) @Max(180) lng?: number | null;
}

class TodayQuery {
  /** mine = โซนที่ฉันอยู่ · all = ทุกโซน · <uuid> = เลือกโซนเดียว (ต้องเป็นโซนของหน่วยงานนี้ ไม่งั้น 404) */
  @IsOptional() @Matches(/^(mine|all|[0-9a-fA-F-]{36})$/) zone?: string;
}

/** ตัวกรองประวัติการสแกน (L08) — ใช้ทั้งรายการและส่งออก CSV */
class LogFilterQuery {
  @IsOptional() @IsUUID() zone?: string;
  @IsOptional() @Matches(/^U-\d{1,12}$/) officer?: string;
  /** บ้านเลขที่ / รหัสตู้ */
  @IsOptional() @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @Length(1, 50) q?: string;
  @IsOptional() @IsCalendarDate() from?: string;
  @IsOptional() @IsCalendarDate() to?: string;
  @IsOptional() @Transform(({ value }: { value: unknown }) => value === true || value === 'true' || value === '1') @IsBoolean() problems?: boolean;
}

const toFilter = (q: LogFilterQuery) => ({ zoneId: q.zone, officerId: q.officer, q: q.q, from: q.from, to: q.to, problems: q.problems });

class LogsQuery extends LogFilterQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page: number = 1;
}

class ExportLogsQuery extends LogFilterQuery {
  /** ย้อนหลังกี่วัน (1–365) — ไม่ส่งและไม่ระบุ from = 30 วัน · ระบุ from/to แล้วไม่ใช้ */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

class SetActiveDto {
  @IsBoolean() is_active!: boolean;
}

/** :user_id ต้องเป็นรูป U-… — อย่างอื่นตอบ 400 ก่อนถึงฐานข้อมูล */
class UserIdParam {
  @Matches(/^U-\d{1,12}$/) user_id!: string;
}

// docs/api.md §8 — ทุก route ทำกับหน่วยงานของตัวเองเท่านั้น
@Controller('api/v1/agency')
export class AgencyController {
  constructor(
    private readonly agency: AgencyService,
    private readonly access: AccessService,
    private readonly todays: AgencyTodayService,
  ) {}

  /** หน่วยงานของหัวหน้าคนนี้ (RequireRole('head') รับประกันว่ามีและอนุมัติแล้ว) */
  private async agencyId(auth: AuthContext): Promise<string> {
    return (await this.access.load(auth.userId)).agency!.id;
  }

  /** ไม่ติด RequireRole — หัวหน้าของหน่วยงานที่ยังรออนุมัติต้องเห็นสถานะ (L02 / L02-b) */
  @Get()
  get(@Auth() auth: AuthContext): Promise<AgencyDto> {
    return this.agency.get(auth.userId);
  }

  /** L04 ภาพรวมทีมวันนี้ */
  @RequireRole('head')
  @Get('today')
  async today(@Auth() auth: AuthContext, @Query() q: TodayQuery) {
    return this.todays.today(await this.agencyId(auth), auth.userId, q.zone ?? 'all');
  }

  /** L08 ประวัติการสแกนของคนในหน่วยงาน (รวมที่ไม่ผ่าน) */
  @RequireRole('head')
  @Get('logs')
  async logs(@Auth() auth: AuthContext, @Query() q: LogsQuery) {
    return this.todays.logs(await this.agencyId(auth), q.page, toFilter(q));
  }

  /** ส่งออกประวัติการสแกนเป็น CSV (L08) — `?days=1..365` (ค่าเริ่มต้น 30) · สูงสุด 10,000 แถว */
  @RequireRole('head')
  @Get('logs/export.csv')
  async exportLogs(@Auth() auth: AuthContext, @Query() q: ExportLogsQuery, @Res({ passthrough: true }) res: Response) {
    const days = q.days ?? (q.from || q.to ? null : 30);
    const csv = await this.todays.logsCsv(await this.agencyId(auth), days, toFilter(q));
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="smmb-scan-log-${day}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return csv;
  }

  @RequireRole('head')
  @Patch()
  async setContact(@Auth() auth: AuthContext, @Body() dto: AgencyContactDto) {
    await this.agency.updateProfile(await this.agencyId(auth), dto);
    return this.agency.get(auth.userId);
  }

  @RequireRole('head')
  @RateLimit({ limit: 5, windowSec: 60 })
  @HttpCode(HttpStatus.OK)
  @Post('group-code/rotate')
  async rotate(@Auth() auth: AuthContext) {
    return this.agency.rotateGroupCode(await this.agencyId(auth));
  }

  @RequireRole('head')
  @Get('members')
  async members(@Auth() auth: AuthContext, @Query() q: ListMembersQuery): Promise<MemberDto[]> {
    return this.agency.listMembers(await this.agencyId(auth), q.status);
  }

  @RequireRole('head')
  @HttpCode(HttpStatus.OK)
  @Post('members/:user_id/approve')
  async approve(@Auth() auth: AuthContext, @Param() p: UserIdParam) {
    await this.agency.approve(await this.agencyId(auth), auth.userId, p.user_id);
    return { ok: true };
  }

  @RequireRole('head')
  @HttpCode(HttpStatus.OK)
  @Post('members/:user_id/reject')
  async reject(@Auth() auth: AuthContext, @Param() p: UserIdParam) {
    await this.agency.reject(await this.agencyId(auth), auth.userId, p.user_id);
    return { ok: true };
  }

  @RequireRole('head')
  @Patch('members/:user_id/status')
  async setStatus(@Auth() auth: AuthContext, @Param() p: UserIdParam, @Body() dto: SetActiveDto) {
    await this.agency.setActive(await this.agencyId(auth), auth.userId, p.user_id, dto.is_active);
    return { ok: true };
  }

  @RequireRole('head')
  @HttpCode(HttpStatus.OK)
  @Post('members/:user_id/make-head')
  async makeHead(@Auth() auth: AuthContext, @Param() p: UserIdParam) {
    await this.agency.makeHead(await this.agencyId(auth), p.user_id);
    return { ok: true };
  }

  @RequireRole('head')
  @Delete('members/:user_id/head')
  async removeHead(@Auth() auth: AuthContext, @Param() p: UserIdParam) {
    await this.agency.removeHead(await this.agencyId(auth), auth.userId, p.user_id);
    return { ok: true };
  }

  /** รหัสชั่วคราวแสดงครั้งเดียว — ไม่เก็บ ไม่ log */
  @RequireRole('head')
  @RateLimit({ limit: 10, windowSec: 60 })
  @HttpCode(HttpStatus.OK)
  @Post('members/:user_id/reset-password')
  async resetPassword(@Auth() auth: AuthContext, @Param() p: UserIdParam) {
    return this.agency.resetPassword(await this.agencyId(auth), auth.userId, p.user_id);
  }
}


/** เจ้าของบ้านดูว่าแต่ละหน่วยงานอยู่ตรงไหน เพื่อเลือกว่าจะให้ใครดูแล (✅ 2026-11-06 · api.md §8.1b) */
@RequireRole('owner')
@Controller('api/v1/agencies')
export class AgencyMapController {
  constructor(private readonly agency: AgencyService) {}

  @Get('map')
  map() {
    return this.agency.publicMap();
  }
}
