import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Ip, Param, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { InspectionService, PROBLEM_REASONS, type ProblemReason, type QrCondition } from './inspection.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class IdParam {
  @IsUUID() id!: string;
}

/** สแกน (qr_text) หรือพิมพ์รหัสใต้ QR (code) อย่างใดอย่างหนึ่ง + เวลาที่ใช้สแกนจนติด */
class StartDto {
  @IsOptional() @IsString() @MaxLength(300) qr_text?: string;
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsOptional() @IsInt() @Min(0) @Max(600_000) scan_ms?: number;
}

class QrConditionDto {
  @IsIn(['faded', 'torn', 'missing', 'covered', 'ok']) condition!: QrCondition;
}

class ProblemDto {
  @IsIn(PROBLEM_REASONS as unknown as string[]) reason!: ProblemReason;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) note?: string;
}

/** ตรวจตู้ (api.md §6) — เจ้าหน้าที่/หัวหน้า · การตรวจของคนอื่น → 404 */
@RequireRole('officer')
@Controller('api/v1/inspections')
export class InspectionController {
  constructor(private readonly inspections: InspectionService) {}

  @Post()
  start(@Auth() auth: AuthContext, @Body() body: StartDto, @Ip() ip: string) {
    if ((body.qr_text === undefined) === (body.code === undefined)) throw new BadRequestException('send either qr_text or code');
    return this.inspections.start(auth.userId, body, ip ?? null);
  }

  /** หน้ารอตู้ poll ทุก 1 วิ (✅) */
  @RateLimit({ limit: 150, windowSec: 60 })
  @Get(':id')
  get(@Auth() auth: AuthContext, @Param() p: IdParam) {
    return this.inspections.get(auth.userId, p.id);
  }

  /** QR ประจำตัว — ขอใหม่ทุก 30 วิ (เพดานเผื่อเปิดหน้าใหม่ / เน็ตกระตุก) */
  @RateLimit({ limit: 10, windowSec: 60 })
  @Get(':id/badge')
  badge(@Auth() auth: AuthContext, @Param() p: IdParam) {
    return this.inspections.badge(auth.userId, p.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/qr-condition')
  qrCondition(@Auth() auth: AuthContext, @Param() p: IdParam, @Body() body: QrConditionDto) {
    return this.inspections.setQrCondition(auth.userId, p.id, body.condition);
  }

  @Post(':id/box-problem')
  problem(@Auth() auth: AuthContext, @Param() p: IdParam, @Body() body: ProblemDto) {
    return this.inspections.reportProblem(auth.userId, p.id, body.reason, body.note || null);
  }
}

/** หน้าสรุปเจ้าหน้าที่ (api.md §6.1) */
@RequireRole('officer')
@Controller('api/v1/officer')
export class OfficerController {
  constructor(private readonly inspections: InspectionService) {}

  @Get('summary')
  summary(@Auth() auth: AuthContext) {
    return this.inspections.summary(auth.userId);
  }
}
