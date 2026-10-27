// ข้อความแจ้งเตือนทุก type (api.md §14) — ต้องมีทั้งไทยและอังกฤษ (CLAUDE.md กฎข้อ 11)
// เก็บแค่ type + data ในฐานข้อมูล แล้วแปลตอนส่ง/ตอนอ่าน → เปลี่ยนภาษาแล้วประวัติเปลี่ยนตาม

export type Lang = 'th' | 'en';

export const NOTIFICATION_TYPES = [
  'inspected',
  'delivered',
  'box_offline',
  'low_battery',
  'swap_backup_qr',
  'box_problem',
  'sos_new',
  'sos_taken',
  'sos_accepted',
  'sos_closed',
  'sos_cancelled',
  'member_pending',
  'member_approved',
  'member_rejected',
  'agency_pending',
  'agency_approved',
  'agency_rejected',
  'qr_fake',
  'qr_health',
  'box_silent_26h',
  'technician_request',
  'plan_expiring',
  'test',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

type Data = Record<string, unknown>;
type Text = { title: string; body: string };
type Render = (d: Data) => Text;

/** ค่าธรรมดาเท่านั้น — object/array ไม่ใส่ในข้อความ (กันขึ้น "[object Object]") */
const s = (v: unknown, fallback = '') =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : fallback;

/** เวลาไทย HH:mm จาก ISO */
const hhmm = (iso: unknown) => {
  if (typeof iso !== 'string') return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
};

const box = (d: Data, lang: Lang) => s(d.box_name, s(d.box_id, lang === 'th' ? 'ตู้ของคุณ' : 'your mailbox'));

const MESSAGES: Record<NotificationType, Record<Lang, Render>> = {
  inspected: {
    th: (d) => ({ title: '👮 มีเจ้าหน้าที่มาตรวจ', body: `${s(d.agency_name)} · ${s(d.officer_name)} มาตรวจ ${hhmm(d.at)}` }),
    en: (d) => ({ title: '👮 Patrol check', body: `${s(d.agency_name)} · ${s(d.officer_name)} checked at ${hhmm(d.at)}` }),
  },
  delivered: {
    th: () => ({ title: '🛵 มีของมาส่ง', body: 'มีคนแจ้งส่งของที่ตู้ของคุณ' }),
    en: () => ({ title: '🛵 Delivery', body: 'Someone left a delivery at your mailbox' }),
  },
  box_offline: {
    th: (d) => ({ title: '⚠️ ตู้ไม่ออนไลน์', body: `${box(d, 'th')} ไม่ออนไลน์ตอนถึงเวลาตรวจ` }),
    en: (d) => ({ title: '⚠️ Mailbox offline', body: `${box(d, 'en')} was offline during patrol hours` }),
  },
  low_battery: {
    th: (d) => ({ title: '🔋 แบตตู้ใกล้หมด', body: `${box(d, 'th')} แบตเหลือ ${s(d.battery_pct)}%` }),
    en: (d) => ({ title: '🔋 Low battery', body: `${box(d, 'en')} battery at ${s(d.battery_pct)}%` }),
  },
  swap_backup_qr: {
    th: () => ({ title: '📮 เปลี่ยน QR หน้าตู้', body: 'กรุณาเอา QR สำรองในตู้ไปติดแทนใบเดิม' }),
    en: () => ({ title: '📮 Replace the front QR', body: 'Please put the backup QR from inside the box on the front' }),
  },
  box_problem: {
    th: (d) => ({ title: '⚠️ ตู้มีปัญหา', body: `เจ้าหน้าที่แจ้งว่า ${box(d, 'th')} ไม่ตอบ` }),
    en: (d) => ({ title: '⚠️ Mailbox problem', body: `An officer reported ${box(d, 'en')} did not respond` }),
  },
  sos_new: {
    th: (d) => ({ title: '🆘 SOS', body: `บ้าน ${s(d.house_no)} · ${s(d.phone)}` }),
    en: (d) => ({ title: '🆘 SOS', body: `House ${s(d.house_no)} · ${s(d.phone)}` }),
  },
  sos_taken: {
    th: (d) => ({ title: 'SOS มีคนรับแล้ว', body: `รับแล้วโดย ${s(d.officer_name)}` }),
    en: (d) => ({ title: 'SOS taken', body: `Accepted by ${s(d.officer_name)}` }),
  },
  sos_accepted: {
    th: (d) => ({ title: '✅ มีเจ้าหน้าที่รับเรื่องแล้ว', body: `${s(d.officer_name)} กำลังดูแล` }),
    en: (d) => ({ title: '✅ Help is on the way', body: `${s(d.officer_name)} accepted your SOS` }),
  },
  sos_closed: {
    th: () => ({ title: 'ปิดเรื่อง SOS แล้ว', body: 'เจ้าหน้าที่ปิดเรื่องแล้ว' }),
    en: () => ({ title: 'SOS closed', body: 'The officer closed your SOS' }),
  },
  sos_cancelled: {
    th: (d) => ({ title: 'SOS ถูกยกเลิก', body: `บ้าน ${s(d.house_no)} ยกเลิก SOS แล้ว` }),
    en: (d) => ({ title: 'SOS cancelled', body: `House ${s(d.house_no)} cancelled the SOS` }),
  },
  member_pending: {
    th: (d) => ({ title: 'มีคนขอเข้าหน่วยงาน', body: `${s(d.name)} รอให้คุณยืนยัน` }),
    en: (d) => ({ title: 'New member request', body: `${s(d.name)} is waiting for your approval` }),
  },
  member_approved: {
    th: (d) => ({ title: 'เข้าหน่วยงานแล้ว', body: `${s(d.agency_name)} ยืนยันคุณแล้ว` }),
    en: (d) => ({ title: 'You are approved', body: `${s(d.agency_name)} approved your request` }),
  },
  member_rejected: {
    th: (d) => ({ title: 'คำขอไม่ผ่าน', body: `${s(d.agency_name)} ปฏิเสธคำขอของคุณ` }),
    en: (d) => ({ title: 'Request declined', body: `${s(d.agency_name)} declined your request` }),
  },
  agency_pending: {
    th: (d) => ({ title: 'หน่วยงานใหม่รออนุมัติ', body: s(d.agency_name) }),
    en: (d) => ({ title: 'New agency to review', body: s(d.agency_name) }),
  },
  agency_approved: {
    th: (d) => ({ title: 'อนุมัติหน่วยงานแล้ว', body: `${s(d.agency_name)} ใช้งานได้แล้ว แชร์รหัสกลุ่มให้ลูกทีมได้เลย` }),
    en: (d) => ({ title: 'Agency approved', body: `${s(d.agency_name)} is ready — share the group code with your team` }),
  },
  agency_rejected: {
    th: (d) => ({ title: 'หน่วยงานไม่ผ่านการอนุมัติ', body: s(d.agency_name) }),
    en: (d) => ({ title: 'Agency not approved', body: s(d.agency_name) }),
  },
  qr_fake: {
    th: (d) => ({ title: '🚨 พบ QR ที่ไม่ใช่ของระบบ', body: `ตู้ ${s(d.box_id)}` }),
    en: (d) => ({ title: '🚨 Unrecognised QR found', body: `Mailbox ${s(d.box_id)}` }),
  },
  qr_health: {
    th: (d) => ({ title: 'QR ไม่ปกติ', body: `${s(d.count)} ใบ` }),
    en: (d) => ({ title: 'QR codes need attention', body: `${s(d.count)} codes` }),
  },
  box_silent_26h: {
    th: (d) => ({ title: 'ตู้ไม่รายงาน', body: `ตู้ ${s(d.box_id)} ไม่รายงานเกิน 26 ชม.` }),
    en: (d) => ({ title: 'Mailbox silent', body: `Mailbox ${s(d.box_id)} has not reported for 26 hours` }),
  },
  technician_request: {
    th: (d) => ({ title: 'มีคนขอช่าง', body: `ตู้ ${s(d.box_id)} · ${s(d.reason)}` }),
    en: (d) => ({ title: 'Technician requested', body: `Mailbox ${s(d.box_id)} · ${s(d.reason)}` }),
  },
  plan_expiring: {
    th: (d) => ({ title: 'แพ็กเกจใกล้หมดอายุ', body: `แพ็กเกจจะหมดอายุใน ${s(d.days)} วัน` }),
    en: (d) => ({ title: 'Plan expiring', body: `Your plan expires in ${s(d.days)} days` }),
  },
  test: {
    th: () => ({ title: 'Smart Mailbox', body: 'เปิดแจ้งเตือนสำเร็จ ✅' }),
    en: () => ({ title: 'Smart Mailbox', body: 'Notifications are on ✅' }),
  },
};

export function renderMessage(type: NotificationType, data: Data, lang: Lang): Text {
  return MESSAGES[type][lang](data);
}

/** SOS ต้องเด้งค้างจนกด (api.md §14) */
export const isUrgent = (type: NotificationType) => type === 'sos_new';
