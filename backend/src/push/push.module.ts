import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service.js';
import { NotificationController, PushController } from './push.controller.js';
import { PUSH_SENDER, WebPushSender } from './push.sender.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [PushController, NotificationController],
  providers: [{ provide: PUSH_SENDER, useClass: WebPushSender }, PushService, NotificationService],
  // ส่วนอื่น (SOS, ตรวจตู้, หน่วยงาน) เรียก NotificationService.notify()
  exports: [NotificationService, PushService],
})
export class PushModule {}
