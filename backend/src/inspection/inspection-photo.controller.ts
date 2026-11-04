import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res, StreamableFile } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { Request, Response } from 'express';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { InspectionPhotoService } from './inspection-photo.service.js';

class IdParam {
  @IsUUID() id!: string;
}

const send = (res: Response, p: { mime: string; photo: Buffer }) => {
  // ข้อมูลส่วนบุคคล — ห้ามแคชที่ไหน
  res.set({ 'Content-Type': p.mime, 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' });
  return new StreamableFile(p.photo);
};

/** api.md §6.4 — เจ้าหน้าที่ส่งรูปหลังตรวจผ่าน (body = ไบต์ของรูป image/jpeg หรือ image/webp) */
@RequireRole('officer')
@Controller('api/v1/inspections')
export class InspectionPhotoController {
  constructor(private readonly photos: InspectionPhotoService) {}

  @RateLimit({ limit: 10, windowSec: 60 })
  @Post(':id/photo')
  @HttpCode(HttpStatus.CREATED)
  upload(@Auth() auth: AuthContext, @Param() p: IdParam, @Req() req: Request) {
    return this.photos.save(auth.userId, p.id, req.body);
  }
}

/** เจ้าของบ้านดูรูปเจ้าหน้าที่ที่มาตรวจบ้านตัวเอง */
@RequireRole('owner')
@Controller('api/v1/me/inspection-photos')
export class OwnerInspectionPhotoController {
  constructor(private readonly photos: InspectionPhotoService) {}

  @Get(':id')
  async get(@Auth() auth: AuthContext, @Param() p: IdParam, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.photos.forOwner(auth.userId, p.id));
  }
}

@RequireRole('admin')
@Controller('api/v1/admin/inspection-photos')
export class AdminInspectionPhotoController {
  constructor(private readonly photos: InspectionPhotoService) {}

  @Get(':id')
  async get(@Auth() auth: AuthContext, @Param() p: IdParam, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.photos.forAdmin(auth.userId, p.id));
  }
}
