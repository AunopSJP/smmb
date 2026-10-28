import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Param, Post } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { Public } from '../auth/auth.decorators.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { RiderService } from './rider.service.js';

class DeliverDto {
  @IsString() @MaxLength(400) delivery_ticket!: string;
}

/** ไรเดอร์ (api.md §5) — public ไม่มีบัญชี · เพดานต่อ IP กันไล่เดารหัส (เพดานต่อตู้อยู่ใน service) */
@Public()
@Controller('api/v1/public')
export class RiderController {
  constructor(private readonly rider: RiderService) {}

  @RateLimit({ limit: 30, windowSec: 60 })
  @Get('qr/:token')
  byToken(@Param('token') token: string, @Ip() ip: string) {
    return this.rider.byToken(token.slice(0, 40), ip ?? null);
  }

  @RateLimit({ limit: 20, windowSec: 60 })
  @Get('codes/:code')
  byCode(@Param('code') code: string, @Ip() ip: string) {
    return this.rider.byCode(code.slice(0, 20), ip ?? null);
  }

  @RateLimit({ limit: 20, windowSec: 60 })
  @HttpCode(HttpStatus.CREATED)
  @Post('deliveries')
  deliver(@Body() body: DeliverDto) {
    return this.rider.deliver(body.delivery_ticket);
  }
}
