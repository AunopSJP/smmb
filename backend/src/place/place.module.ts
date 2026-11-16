import { Global, Module } from '@nestjs/common';
import { PlaceController } from './place.controller.js';
import { PlaceService } from './place.service.js';

/** Global เพราะทุกโมดูลที่บันทึกที่อยู่ (auth / box / agency) ต้องเรียก PlaceService.resolve */
@Global()
@Module({
  controllers: [PlaceController],
  providers: [PlaceService],
  exports: [PlaceService],
})
export class PlaceModule {}
