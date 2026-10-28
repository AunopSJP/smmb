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
