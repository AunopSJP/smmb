import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PushModule } from '../push/push.module.js';
import { SosController } from './sos.controller.js';
import { SosService } from './sos.service.js';

/** SOS (เฟส 4) — เลื่อนขั้นอัตโนมัติทุก 5 วิ จากเวลาในฐานข้อมูล */
@Module({
  imports: [AuthModule, PushModule],
  controllers: [SosController],
  providers: [SosService],
  exports: [SosService],
})
export class SosModule {}
