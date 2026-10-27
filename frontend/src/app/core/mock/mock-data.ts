// ข้อมูลจำลองสำหรับทำหน้าจอ — รูปร่างตามสัญญา API (docs/api.md) เพื่อให้สลับเป็นข้อมูลจริงได้ภายหลัง
// ชื่อ/เบอร์ทั้งหมดเป็นของปลอม

export const MOCK_OWNER = {
  house_no: '99/9',
  box: {
    id: 'BX-00042',
    name: 'ตู้หน้าบ้าน',
    online: true,
    battery_pct: 82,
    last_seen_min: 5,
  },
  events: [
    { id: 'e1', kind: 'inspected' as const, agency: 'สภ.เมือง', officer: 'ส.ต.ต. สมชาย', time: '22:15' },
    { id: 'e2', kind: 'delivered' as const, time: '14:02' },
    { id: 'e3', kind: 'inspected' as const, agency: 'รปภ. หมู่บ้าน', officer: 'คุณวิชัย', time: '07:40' },
  ],
};

export const MOCK_BOX_SETTINGS = {
  name: 'ตู้หน้าบ้าน',
  id: 'MAILBOX-3F9A',
  battery_pct: 82,
  charging: true,
  wifi: 'บ้านสมศรี_2.4G',
  push_on: true,
  callback_phone: '089-111-2222',
};

export type HistoryKind = 'inspected' | 'delivered' | 'sos_closed' | 'box_offline';

export interface HistoryItem {
  id: string;
  kind: HistoryKind;
  date: string; // แสดงผลแล้ว (ตอนต่อ API จะมาจาก ISO)
  date_en: string;
  time: string;
  agency?: string;
  agency_en?: string;
  officer?: string;
  officer_en?: string;
  zone?: string;
  duration_min?: number;
  back_online?: string;
  battery_pct?: number;
}

export const MOCK_HISTORY: HistoryItem[] = [
  { id: 'h1', kind: 'inspected', date: '26 ต.ค. 2026', date_en: '26 Oct 2026', time: '22:15', agency: 'สภ.เมือง', agency_en: 'Mueang police', officer: 'ส.ต.ต. สมชาย ใจกล้า', officer_en: 'Pol. L/Cpl. Somchai', zone: 'โซน A' },
  { id: 'h2', kind: 'delivered', date: '26 ต.ค. 2026', date_en: '26 Oct 2026', time: '14:02' },
  { id: 'h3', kind: 'sos_closed', date: '24 ต.ค. 2026', date_en: '24 Oct 2026', time: '20:31', duration_min: 12, officer: 'ส.ต.ต. สมชาย ใจกล้า', officer_en: 'Pol. L/Cpl. Somchai' },
  { id: 'h4', kind: 'box_offline', date: '22 ต.ค. 2026', date_en: '22 Oct 2026', time: '17:05', back_online: '17:40', duration_min: 35, battery_pct: 41 },
  { id: 'h5', kind: 'inspected', date: '22 ต.ค. 2026', date_en: '22 Oct 2026', time: '07:40', agency: 'รปภ. หมู่บ้าน', agency_en: 'Village guard', officer: 'คุณวิชัย', officer_en: 'Mr. Wichai', zone: 'โซน 1' },
];

export type OwnerNotificationKind = 'inspected' | 'delivered' | 'swap_backup_qr' | 'box_offline' | 'low_battery' | 'sos_closed';

export const MOCK_OWNER_NOTIFICATIONS: {
  id: string;
  kind: OwnerNotificationKind;
  title: string;
  title_en: string;
  body: string;
  body_en: string;
  /** รหัสหน้าที่เปิดเมื่อแตะ */
  open: string;
  history_id?: string;
}[] = [
  { id: 'n1', kind: 'inspected', title: 'ตำรวจ สภ.เมือง มาตรวจ', title_en: 'Mueang police checked', body: 'ส.ต.ต. สมชาย · 22:15', body_en: 'Pol. L/Cpl. Somchai · 22:15', open: 'H12-b', history_id: 'h1' },
  { id: 'n2', kind: 'delivered', title: 'มีของมาส่ง', title_en: 'Delivery', body: 'ไรเดอร์แจ้งว่าใส่ของในตู้แล้ว · 14:02', body_en: 'A rider left a parcel · 14:02', open: 'H12-c', history_id: 'h2' },
  { id: 'n3', kind: 'swap_backup_qr', title: 'กรุณาเอา QR สำรองไปติดแทน', title_en: 'Put up the backup QR', body: 'QR หน้าตู้ชำรุด · เมื่อวาน', body_en: 'Front QR damaged · yesterday', open: 'H03' },
  { id: 'n4', kind: 'box_offline', title: 'ตู้ไม่ออนไลน์', title_en: 'Mailbox offline', body: 'ถึงเวลาตรวจแล้วตู้ยังไม่เชื่อมต่อ · 17:05', body_en: 'Offline during patrol hours · 17:05', open: 'H12-d', history_id: 'h4' },
  { id: 'n5', kind: 'low_battery', title: 'แบตตู้ต่ำกว่า 20%', title_en: 'Battery below 20%', body: 'ดูว่าแผงโซลาร์โดนแดดไหม · 23 ต.ค.', body_en: 'Check the solar panel gets sun · 23 Oct', open: 'H13' },
  { id: 'n6', kind: 'sos_closed', title: 'SOS ปิดเรื่องแล้ว', title_en: 'SOS closed', body: 'ส.ต.ต. สมชาย เขียนหมายเหตุ · 24 ต.ค.', body_en: 'Pol. L/Cpl. Somchai left a note · 24 Oct', open: 'H11-b' },
];

/** เจ้าหน้าที่ที่รับ SOS (เห็นเบอร์ได้เฉพาะตอน SOS เปิดอยู่ — api.md §11) */
export const MOCK_SOS_OFFICER = {
  name: 'ส.ต.ต. สมชาย ใจกล้า',
  name_en: 'Pol. L/Cpl. Somchai',
  agency: 'สภ.เมือง',
  agency_en: 'Mueang police',
  phone: '0812345678',
  close_note: 'ตรวจรอบบ้านแล้ว ไม่พบผู้บุกรุก แนะนำให้ล็อกประตูหลัง',
  close_note_en: 'Checked around the house, no intruder found. Please lock the back door.',
};

export const MOCK_OFFICER = {
  agency: 'สภ.เมือง',
  zone: 'โซน A',
  display_name: 'ส.ต.ต. สมชาย',
  window: '17:00–21:00',
  in_window: true,
  checked: 5,
  total: 10,
  next_house: '99/9',
  houses: [
    { house_no: '99/9', checked_at: null as string | null },
    { house_no: '99/10', checked_at: null as string | null },
    { house_no: '99/7', checked_at: '18:42' },
    { house_no: '99/6', checked_at: '18:30' },
  ],
};

/** SOS ที่ส่งถึงเจ้าหน้าที่ — เห็นชื่อ/เบอร์เจ้าของบ้านได้เฉพาะตอน SOS เปิดอยู่ (api.md §11) */
export const MOCK_OFFICER_SOS = {
  house_no: '99/9',
  address: 'ซอยร่มเย็น 3 · หมู่บ้านสุขใจ',
  address_en: 'Soi Romyen 3 · Sukjai village',
  owner_name: 'คุณสมศรี ใจดี',
  owner_name_en: 'Ms. Somsri',
  owner_phone: '0898765432',
  sent_to: 'เจ้าหน้าที่ในโซน A',
  sent_to_en: 'Zone A officers',
  other_officer: 'ส.ต.ท. ใจดี',
  other_officer_en: 'Pol. Cpl. Jaidee',
};

export const MOCK_OFFICER_SOS_HISTORY = [
  { id: 's1', house_no: '12/4', when: '24 ต.ค. 20:31', when_en: '24 Oct 20:31', by: 'ด.ต. มานะ', by_en: 'Pol. Sgt. Mana', status: 'closed' as const },
  { id: 's2', house_no: '77/1', when: '21 ต.ค. 09:12', when_en: '21 Oct 09:12', by: null, by_en: null, status: 'cancelled' as const },
];

export const MOCK_OFFICER_ACCOUNT = {
  name: 'ส.ต.ต. สมชาย ใจกล้า',
  name_en: 'Pol. L/Cpl. Somchai',
  phone: '081-234-5678',
  agency: 'สภ.เมือง',
  agency_en: 'Mueang police',
  zone: 'A · 10 หลัง',
  zone_en: 'A · 10 houses',
  windows: '06:00–09:00 · 17:00–21:00',
};
