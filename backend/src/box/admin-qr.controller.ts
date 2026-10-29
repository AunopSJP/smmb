import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Auth, RequireRole } from '../auth/auth.decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import type { QrIssueDelivery, QrIssueFix, QrIssueDto } from './qr-issue.service.js';
import { QrIssueService } from './qr-issue.service.js';

const HEALTH = ['damaged', 'suspicious', 'maybe_fake', 'expiring'] as const satisfies readonly QrIssueDto['health'][];

class QrIdParam {
  @IsUUID() qr_id!: string;
}

class QrHealthQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsIn(HEALTH, { each: true })
  health?: QrIssueDto['health'][];
}

class QrFixDto {
  @IsIn(['swap', 'reissue', 'fake']) fix!: QrIssueFix;
}

class QrReissueDto {
  @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsIn([1, 2], { each: true }) slots!: (1 | 2)[];
  @IsOptional() @IsIn(['post', 'technician']) delivery_method?: QrIssueDelivery;
}

@RequireRole('admin')
@Controller('api/v1/admin/qr')
export class AdminQrController {
  constructor(private readonly issues: QrIssueService) {}

  @Get()
  list(@Query() query: QrHealthQuery) {
    return this.issues.list(query.health);
  }

  @Get(':qr_id')
  get(@Param() params: QrIdParam) {
    return this.issues.get(params.qr_id);
  }

  @Post(':qr_id/fix')
  chooseFix(@Auth() auth: AuthContext, @Param() params: QrIdParam, @Body() body: QrFixDto) {
    return this.issues.chooseFix(params.qr_id, body.fix, auth.userId);
  }

  @Post(':qr_id/request-backup-swap')
  requestBackupSwap(@Auth() auth: AuthContext, @Param() params: QrIdParam) {
    return this.issues.requestBackupSwap(params.qr_id, auth.userId);
  }

  @Post(':qr_id/reissue')
  recordReissue(@Param() params: QrIdParam, @Body() body: QrReissueDto) {
    return this.issues.recordReissue(params.qr_id, body.slots, body.delivery_method ?? null);
  }

  @Post(':qr_id/dispatch-technician')
  dispatchTechnician(@Param() params: QrIdParam) {
    return this.issues.dispatchTechnician(params.qr_id);
  }

  @Post(':qr_id/resolve')
  resolve(@Auth() auth: AuthContext, @Param() params: QrIdParam) {
    return this.issues.resolve(params.qr_id, auth.userId);
  }
}
