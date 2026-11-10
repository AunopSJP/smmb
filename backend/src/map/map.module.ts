import { Module } from '@nestjs/common';
import { MapTilesController } from './map-tiles.controller.js';
import { MapTilesService } from './map-tiles.service.js';

@Module({
  controllers: [MapTilesController],
  providers: [MapTilesService],
})
export class MapModule {}
