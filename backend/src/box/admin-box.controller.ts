import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { CONFIG_LIMITS } from './box-config.js';
import { BoxConfigService } from './box-config.service.js';
import { AdminBoxService } from './admin-box.service.js';

class BoxIdParam {
  @Matches(/^BX-\d{5,10}$/) box_id!: string;
}
class TestJobParam extends BoxIdParam {
  @Matches(/^J-[0-9a-f]{6}$/) job_id!: string;
}

class RegisterBoxesDto {
  /** ลงทะเบียนครั้งละไม่เกิน 50 ตู้ */
  @IsInt() @Min(1) @Max(50) count!: number;
}

class ReissueQrDto {
  @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsIn([1, 2], { each: true }) slots!: (1 | 2)[];
  @IsUUID() request_id!: string;
}

class ListBoxesQuery {
  @IsOptional() @IsString() @MaxLength(50) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) per_page = 20;
}

/** api.md §9.5 BoxConfigDefaults — ช่วงตัวเลขตาม §0 */
class BoxConfigDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) report_at!: string;
  @IsInt() @Min(CONFIG_LIMITS.scan_timeout_s[0]) @Max(CONFIG_LIMITS.scan_timeout_s[1]) scan_timeout_s!: number;
  @IsInt() @Min(CONFIG_LIMITS.max_attempts[0]) @Max(CONFIG_LIMITS.max_attempts[1]) max_attempts!: number;
  @IsBoolean() flash_when_dark!: boolean;
  @IsInt() @Min(CONFIG_LIMITS.longpoll_wait_s[0]) @Max(CONFIG_LIMITS.longpoll_wait_s[1]) longpoll_wait_s!: number;
}

/** แอดมิน: ตู้ (api.md §9.4) + ค่าตั้งค่าตู้ (§9.5) */
@RequireRole('admin')
@Controller('api/v1/admin')
export class AdminBoxController {
  constructor(
    private readonly boxes: AdminBoxService,
    private readonly configs: BoxConfigService,
  ) {}

  /** ลงทะเบียนตู้ตอนผลิต → รหัสลับประจำตู้ (ได้ครั้งเดียว) + QR ชุดแรก */
  @Post('boxes')
  register(@Auth() auth: AuthContext, @Body() body: RegisterBoxesDto) {
    return this.boxes.register(body.count, auth.userId);
  }

  @Get('boxes')
  list(@Query() q: ListBoxesQuery) {
    return this.boxes.list({ q: q.q?.trim() || undefined, page: q.page, perPage: q.per_page });
  }

  @Get('boxes/:box_id')
  detail(@Param() p: BoxIdParam) {
    return this.boxes.detail(p.box_id);
  }

  @Post('boxes/:box_id/qr/reissue')
  reissueQr(@Auth() auth: AuthContext, @Param() p: BoxIdParam, @Body() body: ReissueQrDto) {
    return this.boxes.reissueQr(p.box_id, body.slots, body.request_id, auth.userId);
  }

  @Delete('boxes/:box_id/config')
  resetConfig(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.configs.resetBoxConfig(p.box_id, auth.userId);
  }

  @Delete('boxes/:box_id')
  remove(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.boxes.remove(p.box_id, auth.userId);
  }

  /** งานทดสอบ (ปลุกตู้ + กล้อง) — ตู้ต้องถือ long-poll อยู่ ไม่งั้นงานหมดอายุใน 60 วิ */
  /** เปิดดูรหัสลับประจำตู้อีกครั้ง (เขียนลงบอร์ด) — บันทึกการเปิดดูทุกครั้ง */
  @HttpCode(HttpStatus.OK)
  @Post('boxes/:box_id/device-secret')
  revealSecret(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.boxes.revealSecret(p.box_id, auth.userId);
  }

  @Post('boxes/:box_id/test-jobs')
  testJob(@Auth() auth: AuthContext, @Param() p: BoxIdParam) {
    return this.boxes.createTestJob(p.box_id, auth.userId);
  }

  @Get('boxes/:box_id/test-jobs/:job_id')
  viewTestJob(@Param() p: TestJobParam) {
    return this.boxes.testJob(p.box_id, p.job_id);
  }

  @Get('box-config')
  getConfig() {
    return this.configs.defaultsDto();
  }

  /** แก้ค่ากลาง → config_ver ของทุกตู้เปลี่ยน → ตู้รับค่าใหม่ตอน boot/รายงานรายวันครั้งถัดไป */
  @Put('box-config')
  setConfig(@Auth() auth: AuthContext, @Body() body: BoxConfigDto) {
    const { report_at, scan_timeout_s, max_attempts, flash_when_dark, longpoll_wait_s } = body;
    return this.configs.setDefaults({ report_at, scan_timeout_s, max_attempts, flash_when_dark, longpoll_wait_s }, auth.userId);
  }
}
