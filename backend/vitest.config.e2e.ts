import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // ใช้ฐานข้อมูลเดียวกัน (และเทสต์ข้อตกลงใหม่กระทบทุกบัญชี) → รันทีละไฟล์
    fileParallelism: false,
    // เทสต์เดิมใช้โซนทั้งวัน (00:00–23:59) → ปิดเพดานเวลาตรวจ · เทสต์เพดานตั้งต่อตู้เอง (config_override)
    env: { PATROL_HOURS_LIMIT: '24' },
  },
});
