import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { OwnerBoxService } from './owner-box.service.js';
import { QrIssueService } from './qr-issue.service.js';
import { TechnicianRequestService, type TechnicianRequestReason } from './technician-request.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class BoxIdParam {
  @Matches(/^BX-\d{5,10}$/) box_id!: string;
}

/** สแกน (qr_text) หรือพิมพ์รหัสใต้ QR (code) อย่างใดอย่างหนึ่ง */
class ActivateDto {
  @IsOptional() @IsString() @MaxLength(300) qr_text?: string;
  @IsOptional() @IsString() @MaxLength(20) code?: string;
}

class EventsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) per_page = 20;
}

class RenameBoxDto {
  @Transform(trim) @IsString() @Length(1, 40) name!: string;
}

class TechnicianRequestDto {
  @IsIn(['wifi_change', 'repair', 'other']) reason!: TechnicianRequestReason;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}

/** ตู้ของเจ้าของบ้าน (api.md §4.1–4.2) — ตู้ของคนอื่น → 404 */
@RequireRole('owner')
@Controller('api/v1/boxes')
export class OwnerBoxController {
  constructor(
    private readonly boxes: OwnerBoxService,
    private readonly technicianRequests: TechnicianRequestService,
    private readonly qrIssues: QrIssueService,
  ) {}

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  activate(@Auth() auth: AuthContext, @Body() body: ActivateDto, @Ip() ip: string) {
    if ((body.qr_text === undefined) === (body.code === undefined)) throw new BadRequestException('send either qr_text or code');
    return this.boxes.activate(auth.userId, body, ip ?? null);
  }

  @Get()
  list(@Auth() auth: AuthContext) {
    return this.boxes.list(auth.userId);
  }

  /** หน้าหลัก (H03) */
  @Get(':box_id')
  detail(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.boxes.detail(auth.userId, p.box_id);
  }

  /** ประวัติ (H12) */
  @Get(':box_id/events')
  events(@Auth() auth: AuthContext, @Param() p: BoxIdParam, @Query() q: EventsQuery) {
    return this.boxes.events(auth.userId, p.box_id, q.page, q.per_page);
  }

  @Patch(':box_id')
  rename(@Auth() auth: AuthContext, @Param() p: BoxIdParam, @Body() body: RenameBoxDto) {
    return this.boxes.rename(auth.userId, p.box_id, body.name);
  }

  @Post(':box_id/technician-requests')
  requestTechnician(@Auth() auth: AuthContext, @Param() p: BoxIdParam, @Body() body: TechnicianRequestDto) {
    return this.technicianRequests.create(auth.userId, p.box_id, body);
  }

  @Get(':box_id/technician-requests')
  technicianRequestsForOwner(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.technicianRequests.ownerList(auth.userId, p.box_id);
  }

  @Post(':box_id/qr-backup-placed')
  confirmQrBackupPlaced(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.qrIssues.ownerPlacedBackup(auth.userId, p.box_id);
  }
}
