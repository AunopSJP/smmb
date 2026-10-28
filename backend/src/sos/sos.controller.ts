import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import type { Response } from 'express';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { SosService } from './sos.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class IdParam {
  @IsUUID() id!: string;
}
class CreateDto {
  @Matches(/^BX-\d{5,10}$/) box_id!: string;
}
class CancelDto {
  @IsIn(['safe', 'mistake']) reason!: 'safe' | 'mistake';
}
class CloseDto {
  @Transform(trim) @IsString() @Length(1, 500) note!: string;
}
class ListQuery {
  @IsOptional() @IsIn(['open', 'mine', 'closed']) status?: 'open' | 'mine' | 'closed';
}

/** SOS (api.md §7) — เจ้าของบ้านกด · เจ้าหน้าที่ที่ถูกส่งถึงรับเรื่อง · คนอื่น → 404 */
@Controller('api/v1/sos')
export class SosController {
  constructor(private readonly sos: SosService) {}

  /** 201 Sos · บ้านยังไม่อยู่ในโซน → 200 { code: SOS_NO_COVERAGE, call } (ไม่สร้าง SOS) · มีอยู่แล้ว → 409 SOS_ALREADY_OPEN + sos */
  @RequireRole('owner')
  @Post()
  async create(@Auth() auth: AuthContext, @Body() body: CreateDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.sos.create(auth.userId, body.box_id);
    res.status('code' in r ? HttpStatus.OK : HttpStatus.CREATED);
    return r;
  }

  @RequireRole('officer')
  @Get()
  list(@Auth() auth: AuthContext, @Query() q: ListQuery) {
    return this.sos.list(auth.userId, q.status ?? 'open');
  }

  /** หน้ารอ SOS / หน้ารับเรื่อง poll ทุก 1 วิ */
  @RequireRole('owner', 'officer')
  @RateLimit({ limit: 150, windowSec: 60 })
  @Get(':id')
  get(@Auth() auth: AuthContext, @Param() p: IdParam) {
    return this.sos.get(auth.userId, p.id);
  }

  /** มุมมองเจ้าหน้าที่ (เห็นชื่อ + เบอร์เจ้าของบ้านเฉพาะตอนเปิดอยู่) */
  @RequireRole('officer')
  @RateLimit({ limit: 150, windowSec: 60 })
  @Get(':id/card')
  card(@Auth() auth: AuthContext, @Param() p: IdParam) {
    return this.sos.getCard(auth.userId, p.id);
  }

  @RequireRole('owner')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(@Auth() auth: AuthContext, @Param() p: IdParam, @Body() body: CancelDto) {
    return this.sos.cancel(auth.userId, p.id, body.reason);
  }

  @RequireRole('officer')
  @HttpCode(HttpStatus.OK)
  @Post(':id/accept')
  accept(@Auth() auth: AuthContext, @Param() p: IdParam) {
    return this.sos.accept(auth.userId, p.id);
  }

  @RequireRole('officer')
  @HttpCode(HttpStatus.OK)
  @Post(':id/close')
  close(@Auth() auth: AuthContext, @Param() p: IdParam, @Body() body: CloseDto) {
    return this.sos.close(auth.userId, p.id, body.note);
  }
}
