import { Controller, Get, Module } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { SupportService } from './support.service.js';

// api.md §3.1 — public: คนที่ยังล็อกอินไม่ได้ (ลืมรหัส A04) ก็ต้องเห็นช่องทางติดต่อ
@Public()
@Controller('api/v1/support')
class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  get() {
    return this.support.get();
  }
}

@Module({
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
