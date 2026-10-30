import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { AccessService } from '../auth/access.service.js';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { ZoneService, type ZoneFilter } from './zone.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class ZoneIdParam {
  @IsUUID() id!: string;
}

class ZoneListQuery {
  /** ตัวกรอง ไม่ใช่สิทธิ์ — หัวหน้าเห็นได้ทุกโซนของหน่วยงาน (design §18) */
  @IsOptional() @IsIn(['mine', 'all']) zone?: ZoneFilter;
}

class CreateZoneDto {
  @Transform(trim) @IsString() @Length(1, 50) name!: string;
  /** [["06:00","09:00"], …] — ตรวจละเอียดใน normalizeWindows (400 WINDOWS_INVALID) */
  @IsArray() windows!: unknown[];
}

class UpdateZoneDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 50) name?: string;
  @IsOptional() @IsArray() windows?: unknown[];
}

class SetHousesDto {
  @IsArray() @ArrayMaxSize(2000) @Matches(/^BX-\d{5,10}$/, { each: true }) box_ids!: string[];
}

class HouseSearchQuery {
  /** ไม่ส่ง/ว่าง = รายการบ้านที่ยังไม่มีหน่วยงานไหนดูแล (ไว้ไล่เพิ่มเข้าโซน) */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50) q?: string;
}

class SetOfficersDto {
  @IsArray() @ArrayMaxSize(500) @Matches(/^U-\d{1,12}$/, { each: true }) user_ids!: string[];
}

// docs/api.md §8.3 — ค้นบ้านเพื่อเพิ่มเข้าโซน (/agency/houses/search)
@Controller('api/v1/agency/houses')
export class HouseController {
  constructor(
    private readonly zones: ZoneService,
    private readonly access: AccessService,
  ) {}

  @RequireRole('head')
  @Get('search')
  async search(@Auth() auth: AuthContext, @Query() q: HouseSearchQuery) {
    return this.zones.searchHouses(await this.access.load(auth.userId).then((a) => a.agency!.id), q.q);
  }
}

// docs/api.md §8.3 — หัวหน้าจัดการทุกโซนของหน่วยงานตัวเอง
@Controller('api/v1/agency/zones')
export class ZoneController {
  constructor(
    private readonly zones: ZoneService,
    private readonly access: AccessService,
  ) {}

  private async agencyId(auth: AuthContext): Promise<string> {
    return (await this.access.load(auth.userId)).agency!.id;
  }

  @RequireRole('head')
  @Get()
  async list(@Auth() auth: AuthContext, @Query() q: ZoneListQuery) {
    return this.zones.list(await this.agencyId(auth), auth.userId, q.zone);
  }

  @RequireRole('head')
  @Post()
  async create(@Auth() auth: AuthContext, @Body() dto: CreateZoneDto) {
    return this.zones.create(await this.agencyId(auth), auth.userId, dto.name, dto.windows);
  }

  @RequireRole('head')
  @Get(':id')
  async get(@Auth() auth: AuthContext, @Param() p: ZoneIdParam) {
    return this.zones.get(await this.agencyId(auth), auth.userId, p.id);
  }

  @RequireRole('head')
  @Patch(':id')
  async update(@Auth() auth: AuthContext, @Param() p: ZoneIdParam, @Body() dto: UpdateZoneDto) {
    return this.zones.update(await this.agencyId(auth), auth.userId, p.id, dto);
  }

  @RequireRole('head')
  @Put(':id/houses')
  async setHouses(@Auth() auth: AuthContext, @Param() p: ZoneIdParam, @Body() dto: SetHousesDto) {
    return this.zones.setHouses(await this.agencyId(auth), p.id, dto.box_ids);
  }

  @RequireRole('head')
  @Put(':id/officers')
  async setOfficers(@Auth() auth: AuthContext, @Param() p: ZoneIdParam, @Body() dto: SetOfficersDto) {
    return this.zones.setOfficers(await this.agencyId(auth), p.id, dto.user_ids);
  }

  @RequireRole('head')
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async remove(@Auth() auth: AuthContext, @Param() p: ZoneIdParam) {
    await this.zones.remove(await this.agencyId(auth), p.id);
    return { ok: true };
  }
}
