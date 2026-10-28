import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * error ที่ client ต้องแยกหน้าจอ — ใส่ `code` (รายการใน docs/api.md §15)
 * client ตัดสินจาก `code` เท่านั้น ห้ามดู `message`
 */
export class AppError extends HttpException {
  /** extra = ฟิลด์เพิ่มในคำตอบ (เช่น `server_time` ให้ตู้ตั้งนาฬิกา) — ห้ามใส่ข้อมูลส่วนบุคคล */
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super({ code, message }, status);
  }
}

/** error ของ body-parser มี `status` 4xx + `expose: true` + `type` (เช่น 'entity.too.large', 'entity.parse.failed') */
function isClientBodyError(e: unknown): e is { status: number; type?: string } {
  if (!e || typeof e !== 'object') return false;
  const x = e as { status?: unknown; expose?: unknown; type?: unknown };
  return typeof x.status === 'number' && x.status >= 400 && x.status < 500 && x.expose === true && typeof x.type === 'string';
}

/** แปลงทุก error ให้เป็นรูปแบบเดียวกันตาม docs/api.md §0 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as { message?: string | string[]; code?: string };
        message = b.message ?? exception.message;
        code = b.code;
      }
    } else if (isClientBodyError(exception)) {
      // error จากตัวอ่าน body (express/body-parser) เช่น body ใหญ่เกิน (413) · JSON พัง (400) — ความผิดของ client ไม่ใช่ 500
      status = exception.status;
      message = exception.type === 'entity.too.large' ? 'request body too large' : 'request body could not be read';
    } else {
      // ไม่ส่งรายละเอียดภายในออกไปให้ client
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      statusCode: status,
      error: HttpStatus[status]
        ? HttpStatus[status]
            .toLowerCase()
            .split('_')
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(' ')
        : 'Error',
      ...(code ? { code } : {}),
      message,
      ...(exception instanceof AppError ? exception.extra : {}),
      path: req.originalUrl ?? req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
