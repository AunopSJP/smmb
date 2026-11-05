import { BadRequestException, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { Response } from 'express';
import { Auth, Public, RequireRole } from '../auth/auth.decorators.js';
import { BoxAuthGuard, type BoxRequest } from '../box/box-auth.guard.js';
import type { AuthContext } from '../auth/session.service.js';
import { InspectionPhotoService } from './inspection-photo.service.js';

class IdParam {
  @IsUUID() id!: string;
}

const send = (res: Response, p: { mime: string; photo: Buffer }) => {
  // ข้อมูลส่วนบุคคล — ห้ามแคชที่ไหน
  res.set({ 'Content-Type': p.mime, 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' });
  return new StreamableFile(p.photo);
};

/** โปรโตคอล §2.10 — ตู้ส่งรูปเจ้าหน้าที่หลังตรวจผ่าน · body (เซ็นแล้ว) `{ jpeg_b64 }` · ไม่รับ → 409 PHOTO_NOT_ACCEPTED */
@Public()
@UseGuards(BoxAuthGuard)
@Controller('v1/box/jobs')
export class BoxInspectionPhotoController {
  constructor(private readonly photos: InspectionPhotoService) {}

  @Post(':job_id/photo')
  @HttpCode(HttpStatus.OK)
  async upload(@Req() req: BoxRequest, @Param('job_id') job: string) {
    const body = req.body as { jpeg_b64?: unknown } | undefined;
    const b64 = body && typeof body === 'object' && !Buffer.isBuffer(body) && typeof body.jpeg_b64 === 'string' ? body.jpeg_b64 : '';
    if (!/^J-[0-9a-f]{6}$/.test(job)) throw new NotFoundException();
    if (!b64) throw new BadRequestException('jpeg_b64 is required');
    const saved = await this.photos.saveFromBox(req.box!.id, job, Buffer.from(b64, 'base64'));
    if (!saved) throw new ConflictException({ code: 'PHOTO_NOT_ACCEPTED', message: 'photo only for a passed inspection of this box, once, within 2 minutes' });
    return { server_time: Math.floor(Date.now() / 1000) };
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
