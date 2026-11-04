import type pg from 'pg';

/**
 * ✅ 2026-11-04 หัวหน้าเพิ่มบ้าน = ส่งคำขอให้เจ้าของบ้านยอมรับก่อน
 * เทสต์ที่ไม่ได้ทดสอบขั้นยอมรับโดยตรง ใช้ตัวนี้แทนการกดยอมรับของเจ้าของบ้าน (เทสต์ขั้นยอมรับจริงอยู่ box.e2e-spec "owner consent")
 */
export async function acceptPendingHouses(pool: pg.Pool): Promise<void> {
  await pool.query(
    `WITH done AS (
       UPDATE app.zone_box_request_tb SET status = 'accepted', decided_date = now() WHERE status = 'pending' RETURNING zone_id, box_id
     )
     INSERT INTO app.zone_box_tb (zone_id, box_id) SELECT zone_id, box_id FROM done ON CONFLICT DO NOTHING`,
  );
}
