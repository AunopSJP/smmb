import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // ใช้ฐานข้อมูลเดียวกัน (และเทสต์ข้อตกลงใหม่กระทบทุกบัญชี) → รันทีละไฟล์
    fileParallelism: false,
  },
});
