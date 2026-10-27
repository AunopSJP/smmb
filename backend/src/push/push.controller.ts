import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Auth, Public } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { AppError } from '../common/http-exception.filter.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { NotificationService, type NotificationDto, type Page } from './notification.service.js';
import { ListNotificationsQuery, MarkReadDto, SubscribeDto, UnsubscribeDto } from './push.dto.js';
import { PushService } from './push.service.js';

const pushUnavailable = () =>
  new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'PUSH_UNAVAILABLE', 'push notifications are not configured');

// docs/api.md §3 — Web Push
@Controller('api/v1/me/push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Public()
  @Get('vapid-key')
  vapidKey() {
    if (!this.push.enabled) throw pushUnavailable();
    return { public_key: this.push.publicKey };
  }

  @Post('subscriptions')
  async subscribe(@Auth() auth: AuthContext, @Body() dto: SubscribeDto) {
    await this.push.subscribe(auth.userId, auth.sessionId, {
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      deviceLabel: dto.device_label,
    });
    return { ok: true };
  }

  @HttpCode(HttpStatus.OK)
  @Delete('subscriptions')
  async unsubscribe(@Auth() auth: AuthContext, @Body() dto: UnsubscribeDto) {
    await this.push.unsubscribe(auth.userId, dto.endpoint);
    return { ok: true };
  }

  /** ส่งทดสอบ 1 ครั้งถึงเครื่องนี้ (ขั้น "เปิดแจ้งเตือน" A03) — ไม่เก็บลงหน้าแจ้งเตือน */
  @RateLimit({ limit: 5, windowSec: 60 })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('test')
  async test(@Auth() auth: AuthContext) {
    if (!this.push.enabled) throw pushUnavailable();
    const r = await this.push.sendToUser(auth.userId, { type: 'test', data: {}, link: '/' }, auth.sessionId);
    return { sent: r.sent };
  }
}

// docs/api.md §3 — หน้าแจ้งเตือน H14 / L09 / D12
@Controller('api/v1/me/notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@Auth() auth: AuthContext, @Query() q: ListNotificationsQuery): Promise<Page<NotificationDto>> {
    return this.notifications.list(auth.userId, { page: q.page, perPage: q.per_page, unread: q.unread });
  }

  @HttpCode(HttpStatus.OK)
  @Post('read')
  async markRead(@Auth() auth: AuthContext, @Body() dto: MarkReadDto) {
    return { ok: true, updated: await this.notifications.markRead(auth.userId, dto.ids) };
  }
}
