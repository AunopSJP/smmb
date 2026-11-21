import type pg from 'pg';

/**
 * ✅ 2026-11-20 แต่ละช่วงเวลาตรวจยาวได้ไม่เกิน 30 นาที (API ตีกลับช่วงที่ยาวกว่า)
 * เทสต์ที่ต้องการ "ตรวจได้ทั้งวัน" (ไม่ผูกกับนาฬิกาเครื่องที่รันเทสต์) สร้างโซนด้วยช่วงสั้นผ่าน API ก่อน
 * แล้วใช้ตัวนี้เขียนช่วง 00:00–23:59 ลงฐานข้อมูลตรง ๆ แทน
 */
export const SHORT_WINDOW: [string, string][] = [['06:00', '06:30']];

export async function allDayWindows(pool: pg.Pool, zoneId: string): Promise<void> {
  await pool.query(`DELETE FROM app.zone_window_tb WHERE zone_id = $1::uuid`, [zoneId]);
  await pool.query(`INSERT INTO app.zone_window_tb (zone_id, start_time, end_time) VALUES ($1::uuid, '00:00', '23:59')`, [zoneId]);
}
