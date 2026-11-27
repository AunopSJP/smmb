import type { AdminLog } from './admin-api';
import type { Tr } from './i18n';

/**
 * แปลค่าดิบของประวัติระบบ (D11) เป็นข้อความที่คนอ่านเข้าใจ (✅ 2026-11-27)
 * บนจอไม่แสดงรหัสยาว (uuid) · ค่าดิบครบอยู่ในคอลัมน์ "ข้อมูลดิบ" ของ CSV
 * ค่าที่ไม่รู้จัก = แสดงตามเดิม (ยกเว้นรหัสยาว)
 */
const tr = (th: string, en: string): Tr => ({ th, en });

const ACTOR: Record<string, Tr> = {
  rider: tr('ไรเดอร์', 'rider'),
  box: tr('ตู้', 'box'),
  officer: tr('เจ้าหน้าที่', 'officer'),
  owner: tr('เจ้าของบ้าน', 'owner'),
};

const METHOD: Record<string, Tr> = {
  scan: tr('สแกน QR', 'scanned'),
  code: tr('พิมพ์รหัส', 'typed code'),
};

const SCAN_RESULT: Record<string, Tr> = {
  ok: tr('ปกติ', 'ok'),
  invalid: tr('QR หรือรหัสไม่ถูกต้อง', 'invalid QR or code'),
  not_system: tr('ไม่ใช่ QR ของระบบ', 'not a system QR'),
  revoked: tr('QR ถูกยกเลิกแล้ว', 'revoked QR'),
  service_closed: tr('ตู้ปิดบริการ', 'service closed'),
  not_in_zone: tr('ไม่ใช่บ้านในโซน', 'not in zone'),
  outside_window: tr('นอกเวลาตรวจ', 'outside patrol hours'),
  box_offline: tr('ตู้ไม่ออนไลน์', 'box offline'),
  already_owned: tr('ตู้มีเจ้าของแล้ว', 'already owned'),
  already_mine: tr('เป็นตู้ของตัวเองอยู่แล้ว', 'already theirs'),
  unreadable: tr('อ่านไม่ได้', 'unreadable'),
  expired: tr('QR หมดอายุ', 'expired QR'),
  bad_sig: tr('QR ประจำตัวปลอมหรือเสียหาย', 'bad badge signature'),
  wrong_job: tr('QR ของการตรวจอื่น', 'QR from another inspection'),
  wrong_user: tr('QR ของคนอื่น', 'another person’s QR'),
  no_inspection: tr('ไม่มีการตรวจที่เปิดอยู่', 'no open inspection'),
};

const STATUS: Record<string, Record<string, Tr>> = {
  inspection: { open: tr('ยังไม่จบ', 'not finished'), passed: tr('ผ่าน', 'passed'), failed: tr('ไม่ผ่าน', 'failed') },
  box_problem: { box_problem: tr('แจ้งปัญหาตู้', 'box problem reported') },
  delivery: { delivered: tr('ส่งของแล้ว', 'delivered') },
  sos: { open: tr('รอคนรับ', 'not accepted'), accepted: tr('มีคนรับแล้ว', 'accepted'), closed: tr('ปิดงานแล้ว', 'closed'), cancelled: tr('ยกเลิกแล้ว', 'cancelled') },
  sos_return: { self: tr('คืนเอง', 'returned by the officer'), system: tr('ระบบคืนอัตโนมัติ', 'returned by the system') },
};

const PROBLEM: Record<string, Tr> = {
  no_response: tr('ไม่มีเสียงจากตู้', 'no sound from the box'),
  no_scan: tr('ตู้มีเสียง แต่ไม่สแกน', 'box beeped but did not scan'),
  scan_failed_3: tr('สแกนไม่ผ่าน 3 ครั้ง', 'failed to scan 3 times'),
  damaged: tr('ตู้เสียหาย / ถูกงัด', 'damaged / forced open'),
  other: tr('อื่น ๆ', 'other'),
};

const SUBJECT: Record<string, Tr> = {
  user: tr('ข้อมูลผู้ใช้', 'user data'),
  box: tr('ข้อมูลตู้', 'box data'),
  agency: tr('ข้อมูลหน่วยงาน', 'agency data'),
};

const FIELD: Record<string, Tr> = {
  name: tr('ชื่อ', 'name'),
  phone: tr('เบอร์โทร', 'phone'),
  house_no: tr('บ้านเลขที่', 'house number'),
  'heads.name': tr('ชื่อหัวหน้า', 'head names'),
  'heads.phone': tr('เบอร์หัวหน้า', 'head phones'),
  'agency.contact': tr('ช่องทางติดต่อหน่วยงาน', 'agency contacts'),
  location: tr('พิกัดบ้าน', 'house location'),
  face_photo: tr('รูปถ่ายเจ้าหน้าที่', 'officer photo'),
  self_export: tr('ส่งออกข้อมูลของตัวเอง', 'exported their own data'),
  plan: tr('เปลี่ยนแพ็กเกจ', 'changed plan'),
  device_secret: tr('ดูรหัสลับของตู้', 'viewed the box secret'),
  service_opened: tr('เปิดบริการตู้', 'opened service'),
  service_closed: tr('ปิดบริการตู้', 'closed service'),
  box_unbound: tr('ยกเลิกการผูกตู้', 'unbound the box'),
  by_owner: tr('เจ้าของทำเอง', 'by the owner'),
  wifi_reset_requested: tr('สั่งตั้ง Wi-Fi ใหม่', 'requested Wi-Fi reset'),
  wifi_reset_cancelled: tr('ยกเลิกคำสั่งตั้ง Wi-Fi', 'cancelled Wi-Fi reset'),
  standby_requested: tr('สั่งตู้พัก', 'requested standby'),
  live_view_on: tr('เปิดดูภาพสดจากกล้อง', 'turned live view on'),
  live_view_off: tr('ปิดภาพสด', 'turned live view off'),
  config_override: tr('ตั้งค่าเฉพาะตู้', 'changed box settings'),
  config_reset: tr('ล้างค่าเฉพาะตู้', 'reset box settings'),
  box_deleted: tr('ลบตู้', 'deleted the box'),
  qr_reissue_1: tr('ออก QR หน้าตู้ใหม่', 'new front QR'),
  qr_reissue_2: tr('ออก QR สำรองใหม่', 'new backup QR'),
};

/** รายการที่มีรหัสต่อท้าย `คำ:รหัส` → บอกแค่บริบท ไม่แสดงรหัส */
const CONTEXT: Record<string, Tr> = {
  sos: tr('ตอน SOS', 'during an SOS'),
  patrol: tr('ระหว่างตรวจ', 'during patrol'),
  inspection: tr('ของการตรวจ', 'for an inspection'),
};

const LONG_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const pick = (map: Record<string, Tr> | undefined, v: string, lang: 'th' | 'en') => map?.[v]?.[lang] ?? v.replace(LONG_ID, '…');

/** อาร์เรย์ของ Postgres ที่มาเป็นข้อความ `{a,b,"c, d"}` */
export function parsePgArray(v: string): string[] {
  const body = v.replace(/^\{|\}$/g, '');
  return (body.match(/"(?:\\.|[^"\\])*"|[^,]+/g) ?? []).map((x) => (x.startsWith('"') ? x.slice(1, -1).replace(/\\(.)/g, '$1') : x.trim())).filter(Boolean);
}

function field(f: string, lang: 'th' | 'en'): string {
  const i = f.indexOf(':');
  if (i > 0) {
    const key = f.slice(0, i);
    if (key === 'reason') return `${lang === 'th' ? 'เหตุผล: ' : 'reason: '}${f.slice(i + 1)}`;
    if (CONTEXT[key]) return CONTEXT[key][lang];
  }
  return pick(FIELD, f, lang);
}

/** บรรทัดรายละเอียดของแถว (ผู้กระทำ · QR · วิธี · ผล · เพิ่มเติม) */
export function logDetail(log: AdminLog, lang: 'th' | 'en'): string {
  const actor = log.actor_name ? pick(ACTOR, log.actor_name, lang) : '—';
  const parts: string[] = [actor];
  if (log.type === 'data_access') {
    if (log.result) parts.push(pick(SUBJECT, log.result, lang));
    if (log.details) parts.push(parsePgArray(log.details).map((f) => field(f, lang)).join(', '));
  } else if (log.type === 'terms') {
    if (log.result) parts.push(`${lang === 'th' ? 'ฉบับ ' : 'version '}${log.result}`);
  } else {
    if (log.qr_slot) parts.push(`QR ${log.qr_slot}`);
    if (log.method) parts.push(pick(METHOD, log.method, lang));
    if (log.result) parts.push(pick(log.type === 'scan' ? SCAN_RESULT : STATUS[log.type], log.result, lang));
    // หมายเหตุปิด SOS เป็นข้อความที่คนพิมพ์ — แสดงตามเดิม
    if (log.details) parts.push(log.type === 'sos' ? log.details : pick(PROBLEM, log.details, lang));
  }
  return parts.filter(Boolean).join(' · ');
}

/** ค่าดิบครบทุกตัวสำหรับ CSV (ใช้สอบย้อนหลัง) */
export function logRaw(log: AdminLog): string {
  // เวลาเป็น ISO ตรง ๆ — หัวข้อบนจอใช้ "วันนี้/เมื่อวาน" ซึ่งเปิดไฟล์ทีหลังแล้วอ่านไม่ได้ · ช่องว่างคงตำแหน่งไว้
  return [
    ['id', log.id], ['type', log.type], ['at', log.created_at], ['box', log.box_id], ['house', log.house_no],
    ['actor', log.actor_name], ['qr', log.qr_slot], ['method', log.method], ['result', log.result], ['details', log.details],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(' | ');
}

/** อักษรย่อในวงกลม — ข้ามสระหน้า (เ แ โ ใ ไ) ไม่ให้ได้สระลอย ๆ */
export function initialOf(name: string | null | undefined, fallback = '?'): string {
  return ((name ?? '').trim().replace(/^[เแโใไ]+/, '').charAt(0) || fallback).toUpperCase();
}
