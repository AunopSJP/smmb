import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * วันที่รูปแบบ YYYY-MM-DD ที่เป็นวันจริงในปฏิทิน (กัน 2026-13-45)
 * — `@Matches` เดิมผ่าน regex แต่ Postgres ตอบ 22008 แล้วกลายเป็น 500
 */
export function IsCalendarDate(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const [y, m, d] = value.split('-').map(Number);
          if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
          const dt = new Date(Date.UTC(y, m - 1, d));
          return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
        },
      },
    });
  };
}
