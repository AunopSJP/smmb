import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { MapTilesService } from './map-tiles.service.js';

/**
 * tile แผนที่แบบ same-origin: GET /api/v1/map-tiles/:z/:x/:y
 * เปิดสาธารณะ (หน้าแผนที่ก่อนล็อกอินก็ใช้) — จำกัดขนาดพิกัด + rate limit + cache ที่ service
 */
@Public()
@Controller('api/v1/map-tiles')
export class MapTilesController {
  constructor(private readonly tiles: MapTilesService) {}

  @RateLimit({ limit: 1200, windowSec: 60 })
  @Get(':z/:x/:y')
  async tile(@Param('z') z: string, @Param('x') x: string, @Param('y') y: string, @Res() res: Response): Promise<void> {
    const tile = await this.tiles.tile(Number(z), Number(x), Number(y.replace(/\.png$/i, '')));
    res.setHeader('Content-Type', tile.type);
    // ให้ browser/CDN cache นาน — tile ของแผนที่เดิมไม่เปลี่ยน
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.send(tile.buf);
  }
}
