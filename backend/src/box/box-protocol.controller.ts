import {
  BadRequestException,
  Body,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { AllowClockSkew, BoxAuthGuard, type BoxRequest } from './box-auth.guard.js';
import { BoxJobService } from './box-job.service.js';
import { bool, BoxProtocolService, int, MAX_WAIT_S, nowS, text } from './box-protocol.service.js';

/** box_id ที่ BoxAuthGuard ยืนยันแล้ว */
const BoxId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const box = ctx.switchToHttp().getRequest<BoxRequest>().box;
  if (!box) throw new Error('@BoxId() used without BoxAuthGuard');
  return box.id;
});

type Body = Record<string, unknown>;

const jobId = (id: string) => {
  if (!/^J-[0-9a-f]{6}$/.test(id)) throw new NotFoundException();
  return id;
};

/**
 * API ของตู้ (โปรโตคอล §2 · api.md §13) — ไม่มี cookie ใช้ลายเซ็น HMAC ทุกคำขอ
 * path `/v1/box/*` ไม่มี `/api` นำหน้า (ตามไฟล์โปรโตคอล)
 * ⏸ `POST /v1/box/deliveries` (ปุ่มหน้าตู้) ยังไม่เขียน — รอทีมยืนยัน (CLAUDE.md "ห้ามทำ")
 */
@Public()
@UseGuards(BoxAuthGuard)
@Controller('v1/box')
export class BoxProtocolController {
  constructor(
    private readonly box: BoxProtocolService,
    private readonly jobs: BoxJobService,
  ) {}

  /** §2.1 เปิดเครื่อง — ยอมให้นาฬิกาเพี้ยน (ยังไม่เคยตั้งเวลา) */
  @Post('boot')
  @HttpCode(HttpStatus.OK)
  @AllowClockSkew()
  boot(@BoxId() id: string, @Body() body: Body) {
    return this.box.checkIn(id, 'boot', body);
  }

  /** §2.2 รายงานรายวัน */
  @Post('report')
  @HttpCode(HttpStatus.OK)
  report(@BoxId() id: string, @Body() body: Body) {
    return this.box.checkIn(id, 'report', body);
  }

  /** §2.3 long-poll — มีงาน 200 · ครบเวลาไม่มีงาน 204 (เวลาอยู่ใน header X-Server-Time) */
  @Get('jobs')
  async jobs(@BoxId() id: string, @Query('wait') wait: string | undefined, @Res({ passthrough: true }) res: Response) {
    const waitS = wait === undefined ? MAX_WAIT_S : Number(wait);
    if (!Number.isInteger(waitS) || waitS < 0 || waitS > MAX_WAIT_S) throw new BadRequestException(`wait must be 0–${MAX_WAIT_S}`);
    const closed = new Promise<void>((resolve) => res.on('close', () => resolve()));
    const job = await this.box.poll(id, waitS, closed);
    if (!job) {
      res.status(HttpStatus.NO_CONTENT);
      return;
    }
    return { server_time: nowS(), config_ver: await this.box.configVer(id), job };
  }

  /** §2.4 เปิดไฟ + กล้องแล้ว · งานหมดอายุ/จบแล้ว → 410 JOB_EXPIRED */
  @Post('jobs/:job_id/ready')
  @HttpCode(HttpStatus.OK)
  async ready(@BoxId() id: string, @Param('job_id') job: string, @Body() body: Body) {
    await this.jobs.ready(id, jobId(job), bool(body.flash));
    return { server_time: nowS(), config_ver: await this.box.configVer(id) };
  }

  /** §2.5 ผลอ่าน QR ทุกครั้งที่ลอง — server ตัดสิน pass / retry / fail */
  @Post('jobs/:job_id/result')
  @HttpCode(HttpStatus.OK)
  async result(@BoxId() id: string, @Param('job_id') job: string, @Body() body: Body) {
    const attempt = int(body.attempt, 1, 5);
    const readOk = bool(body.read_ok);
    if (attempt === null || readOk === null) throw new BadRequestException('attempt (1–5) and read_ok are required');
    if (body.qr_text !== undefined && body.qr_text !== null && text(body.qr_text, 1024) === null) {
      throw new BadRequestException('qr_text must be a string (max 1024)');
    }
    const verdict = await this.jobs.result(id, jobId(job), {
      attempt,
      read_ok: readOk,
      qr_text: text(body.qr_text, 1024),
      read_ms: int(body.read_ms, 0, 600_000),
      flash: bool(body.flash),
    });
    return { server_time: nowS(), ...verdict };
  }

  /** §2.6 เหตุการณ์อื่น */
  @Post('events')
  @HttpCode(HttpStatus.OK)
  event(@BoxId() id: string, @Body() body: Body) {
    if (typeof body.type !== 'string' || !/^[a-z_]{1,40}$/.test(body.type)) {
      throw new BadRequestException('type is required (e.g. wifi_reset_button, battery_critical, camera_error)');
    }
    return this.box.event(id, body);
  }
}
