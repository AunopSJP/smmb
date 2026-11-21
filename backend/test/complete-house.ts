/**
 * ✅ 2026-11-16 บ้านที่จะเพิ่มเข้าโซนต้องข้อมูลครบ (ที่อยู่ + พื้นที่มาตรฐาน + หมุด) ไม่งั้นได้ 400 `HOUSE_INCOMPLETE`
 * เทสต์ที่ผูกตู้แล้วจะเอาบ้านเข้าโซน ส่ง body นี้ด้วย `PATCH /api/v1/boxes/:box_id` (ในฐานะเจ้าของบ้าน) หลังผูกตู้
 */
export const COMPLETE_HOUSE = {
  address_line: 'ซอย 3',
  subdistrict: 'ลาดยาว',
  district: 'จตุจักร',
  province: 'กรุงเทพมหานคร',
  lat: 13.7563,
  lng: 100.5018,
} as const;
