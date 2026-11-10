import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { IsCalendarDate } from '../common/validators.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
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
  /** ช่วงวันที่ตามเวลาไทย YYYY-MM-DD (รวมวันนั้น) */
  @IsOptional() @IsCalendarDate() from?: string;
  @IsOptional() @IsCalendarDate() to?: string;
  @IsOptional() @IsIn(['inspected', 'delivered']) type?: 'inspected' | 'delivered';
}

class TechnicianRequestIdParam extends BoxIdParam {
  @IsUUID() id!: string;
}

class UpdateBoxDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 40) name?: string;
  /** ย่าน/หมู่บ้าน · '' = ล้าง */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) area?: string;
  /** ที่อยู่บ้าน · '' = ล้าง */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) address_line?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) subdistrict?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) district?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) province?: string;
  /** พิกัดหมุดบ้าน — ต้องส่ง lat และ lng คู่กัน */
  @ValidateIf((o: { lat?: number; lng?: number }) => o.lat !== undefined || o.lng !== undefined) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ValidateIf((o: { lat?: number; lng?: number }) => o.lat !== undefined || o.lng !== undefined) @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @IsBoolean() clear_location?: boolean;
}

class TechnicianRequestDto {
  @IsIn(['wifi_change', 'repair', 'other']) reason!: TechnicianRequestReason;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}

class ConfirmTechnicianDto {
  @IsIn(['ok', 'still_broken']) result!: 'ok' | 'still_broken';
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
    return this.boxes.events(auth.userId, p.box_id, q.page, q.per_page, { from: q.from, to: q.to, type: q.type });
  }

  /** ตั้งชื่อตู้ และ/หรือย่าน (ส่งอย่างน้อยหนึ่งอย่าง) */
  @Patch(':box_id')
  update(@Auth() auth: AuthContext, @Param() p: BoxIdParam, @Body() body: UpdateBoxDto) {
    if (Object.values(body).every((v) => v === undefined)) throw new BadRequestException('send at least one field');
    if (body.clear_location && body.lat !== undefined) throw new BadRequestException('clear_location and lat/lng are exclusive');
    return this.boxes.update(auth.userId, p.box_id, body);
  }

  /** เจ้าของกด "เปลี่ยน Wi-Fi" → ตู้รับคำสั่งแล้วตัด Wi-Fi เก่า กลับโหมดปล่อย Wi-Fi (api.md §4.4) */
  @RateLimit({ limit: 5, windowSec: 60 })
  @Post(':box_id/wifi-reset')
  @HttpCode(HttpStatus.OK)
  requestWifiReset(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.boxes.requestWifiReset(auth.userId, p.box_id);
  }

  @RateLimit({ limit: 10, windowSec: 60 })
  @Delete(':box_id/wifi-reset')
  cancelWifiReset(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.boxes.cancelWifiReset(auth.userId, p.box_id);
  }

  @Post(':box_id/technician-requests')
  requestTechnician(@Auth() auth: AuthContext, @Param() p: BoxIdParam, @Body() body: TechnicianRequestDto) {
    return this.technicianRequests.create(auth.userId, p.box_id, body);
  }

  @Get(':box_id/technician-requests')
  technicianRequestsForOwner(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.technicianRequests.ownerList(auth.userId, p.box_id);
  }

  @Post(':box_id/technician-requests/:id/confirm')
  confirmTechnician(@Auth() auth: AuthContext, @Param() p: TechnicianRequestIdParam, @Body() body: ConfirmTechnicianDto) {
    return this.technicianRequests.confirm(auth.userId, p.box_id, p.id, body.result);
  }

  @Post(':box_id/qr-backup-placed')
  confirmQrBackupPlaced(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.qrIssues.ownerPlacedBackup(auth.userId, p.box_id);
  }
}
