import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../db/db.module.js';

/**
 * บันทึกการกระทำที่กระทบสิทธิ์/ข้อมูลสำคัญ (อนุมัติหน่วยงาน · ให้/ถอด role · reset รหัส · เปลี่ยนค่ากลาง)
 * เขียนแบบไม่ทำให้คำขอหลักล้ม — ถ้า log ล้มให้ log error ไว้
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async log(
    actorId: string,
    action: string,
    subjectKind: 'user' | 'agency' | 'box' | 'zone' | 'plan',
    subjectId: string,
    detail: Record<string, unknown> = {},
    ip?: string | null,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO app.admin_audit_log_tb (actor_user_id, action, subject_kind, subject_id, detail, ip)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [actorId, action, subjectKind, subjectId, JSON.stringify(detail), ip ?? null],
      );
    } catch (err) {
      this.logger.error(`audit write failed (${action} ${subjectKind}:${subjectId}): ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
