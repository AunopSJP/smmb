import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Ip, Param, Patch, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { OwnerBoxService } from './owner-box.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class BoxIdParam {
  @Matches(/^BX-\d{5,10}$/) box_id!: string;
}

/** สแกน (qr_text) หรือพิมพ์รหัสใต้ QR (code) อย่างใดอย่างหนึ่ง */
class ActivateDto {
  @IsOptional() @IsString() @MaxLength(300) qr_text?: string;
  @IsOptional() @IsString() @MaxLength(20) code?: string;
}

class RenameBoxDto {
  @Transform(trim) @IsString() @Length(1, 40) name!: string;
}

/** ตู้ของเจ้าของบ้าน (api.md §4.1–4.2) — ตู้ของคนอื่น → 404 */
@RequireRole('owner')
@Controller('api/v1/boxes')
export class OwnerBoxController {
  constructor(private readonly boxes: OwnerBoxService) {}

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

  @Patch(':box_id')
  rename(@Auth() auth: AuthContext, @Param() p: BoxIdParam, @Body() body: RenameBoxDto) {
    return this.boxes.rename(auth.userId, p.box_id, body.name);
  }
}
