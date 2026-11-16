import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { PlaceService } from './place.service.js';

/**
 * รายการพื้นที่สำหรับ Dropdown (api.md §3.3) — เปิดสาธารณะเพราะหน้าสมัครก่อนล็อกอินต้องใช้
 * เป็นข้อมูลสาธารณะของทางราชการ ไม่มีข้อมูลส่วนบุคคล
 */
@Public()
@Controller('api/v1/places')
export class PlaceController {
  constructor(private readonly places: PlaceService) {}

  @RateLimit({ limit: 600, windowSec: 60 })
  @Get('provinces')
  async provinces() {
    return this.places.provinces();
  }

  @RateLimit({ limit: 600, windowSec: 60 })
  @Get('provinces/:id/districts')
  async districts(@Param('id', ParseIntPipe) id: number) {
    return this.places.districts(id);
  }

  @RateLimit({ limit: 600, windowSec: 60 })
  @Get('districts/:id/subdistricts')
  async subdistricts(@Param('id', ParseIntPipe) id: number) {
    return this.places.subdistricts(id);
  }
}
