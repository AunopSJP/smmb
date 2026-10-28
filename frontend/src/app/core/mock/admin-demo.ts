import { computed, Injectable, signal } from '@angular/core';
import type { Tr } from '../i18n';

// ข้อมูลจำลองของแอดมิน/ช่าง — รูปร่างตาม api.md §9 (overview, agencies, users, boxes, qr, box-config, logs)
// เพื่อสลับเป็น API จริงทีหลัง · ชื่อ/เบอร์ทั้งหมดเป็นของปลอม

/** สถานะตู้ที่แสดง (design §8) */
export type BoxStatus = 'online' | 'sleeping' | 'offline' | 'service_closed' | 'unbound';

export interface DemoBox {
  /** รหัสตู้ BX- + เลข 5 หลัก (api.md §0) */
  id: string;
  /** ชื่อ Wi-Fi ที่ตู้ปล่อยตอนอยู่โหมดตั้งค่า */
  ap: string;
  house_no: string | null;
  owner: Tr | null;
  owner_id: string | null;
  status: BoxStatus;
  battery_pct: number;
  charging: boolean;
  last_seen: Tr;
  zone: Tr | null;
  /** รุ่นค่าตั้งค่าที่ตู้ใช้อยู่ — ต่ำกว่ารุ่นล่าสุด = รอตู้ดึงค่าใหม่ตอนรายงานรายวัน */
  config_ver: number;
  /** อายุ QR หน้าตู้ / การใช้ QR สำรอง / QR เปิดใช้ตู้ */
  qr_front_age: Tr;
  qr_backup: Tr;
  qr_activate: Tr | null;
  /** คำขอช่างจากเจ้าของบ้าน (api.md §4.4) */
  tech_request?: { reason: Tr; when: Tr; status: 'open' | 'scheduled' | 'done' };
}

/** แบตต่ำกว่านี้ = "แบตต่ำ" */
export const LOW_BATTERY_PCT = 20;

export type QrHealth = 'damaged' | 'suspicious' | 'maybe_fake' | 'expiring';

/**
 * ทางแก้ QR (ขั้นตอนแอดมิน — SMMB_ขั้นตอนการใช้งานแต่ละคน.md "จัดการ QR เสีย")
 * - `swap`    ใบสำรองยังอยู่ → เจ้าของบ้านเอาไปติด (D07)
 * - `reissue` ใบสำรองใช้ไปแล้ว → ออกใหม่ 2 ใบ ช่างไปติด (D07-b)
 * - `fake`    อาจเป็น QR ปลอม → ส่งช่างด่วน (D06)
 */
export type QrFix = 'swap' | 'reissue' | 'fake';

export interface QrCase {
  id: string;
  box_id: string;
  house: string;
  slot: 1 | 2;
  health: QrHealth;
  reason: Tr;
  when: Tr;
  /** ใบสำรองในตู้ถูกสแกนไปแล้วหรือยัง */
  backup_used: boolean;
  fix: QrFix | null;
  /** ขั้นที่กำลังทำ (เริ่ม 0) ในรายการขั้นของทางแก้นั้น */
  step: number;
  resolved: boolean;
  delivery?: 'post' | 'technician';
}

export type AgencyStatus = 'pending' | 'approved' | 'rejected';

export interface DemoAgency {
  id: string;
  name: Tr;
  type: 'police' | 'guard' | 'other';
  head: Tr;
  head_phone: string;
  status: AgencyStatus;
  sent: Tr;
  group_code: string | null;
  members: number;
  /** ช่องทางติดต่อที่หน่วยงานกรอกตอนสมัคร */
  contact: string;
  reject_reason?: string;
}

export type AdminRole = 'owner' | 'officer' | 'admin';

export interface AdminUser {
  id: string;
  name: Tr;
  phone: string;
  house_no?: string;
  agency?: Tr;
  roles: AdminRole[];
  is_head: boolean;
  status: 'active' | 'disabled';
  /** แอดมินที่ล็อกอินอยู่ — แก้บัญชีตัวเองไม่ได้ (CANNOT_CHANGE_SELF) */
  self?: boolean;
  active_sessions: number;
  must_change_password: boolean;
}

/** ค่าตั้งค่าเริ่มต้นของตู้ — api.md §9.5 BoxConfigDefaults */
export interface BoxConfigDefaults {
  report_at: string;
  scan_timeout_s: number;
  max_attempts: number;
  flash_when_dark: boolean;
  longpoll_wait_s: number;
}

export type LogType = 'inspection' | 'delivery' | 'sos' | 'box_problem' | 'scan' | 'data_access';

export interface DemoAdminLog {
  id: string;
  type: LogType;
  title: Tr;
  sub: Tr;
  fail?: boolean;
}

/** ตัวอักษรที่ไม่สับสน (ไม่มี 0/O, 1/I/L) — ใช้กับรหัสกลุ่มและรหัสชั่วคราว */
const SAFE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const randomCode = (n: number) => Array.from({ length: n }, () => SAFE[Math.floor(Math.random() * SAFE.length)]).join('');
/** รหัสกลุ่ม 8 ตัว แสดงเป็น XXXX-XXXX (api.md §9.2) */
export const newGroupCode = () => {
  const c = randomCode(8);
  return `${c.slice(0, 4)}-${c.slice(4)}`;
};

const tr = (th: string, en: string): Tr => ({ th, en });

@Injectable({ providedIn: 'root' })
export class AdminDemo {
  /** ตัวเลขรวมทั้งระบบ (รายการตู้ในหน้าจอเป็นแค่ตัวอย่าง) */
  readonly totals = { boxes_online: 118, boxes_total: 124, low_battery: 3 };

  readonly boxes = signal<DemoBox[]>([
    {
      id: 'BX-00042', ap: 'MAILBOX-3F9A', house_no: '99/9', owner: tr('สมศรี ใจดี', 'Somsri J.'), owner_id: 'U-0001', status: 'online',
      battery_pct: 82, charging: true, last_seen: tr('5 นาที', '5 min'), zone: tr('สภ.เมือง · โซน A', 'Mueang police · zone A'),
      config_ver: 12, qr_front_age: tr('อายุ 4 เดือน', '4 months old'), qr_backup: tr('ยังไม่เคยใช้', 'Never used'),
      qr_activate: tr('ใช้แล้ว 12 ต.ค.', 'Used 12 Oct'),
      tech_request: { reason: tr('เปลี่ยน Wi-Fi', 'Change Wi-Fi'), when: tr('26 ต.ค. 14:20', '26 Oct 14:20'), status: 'open' },
    },
    {
      id: 'BX-00017', ap: 'MAILBOX-8B12', house_no: '45/2', owner: tr('มานี มีสุข', 'Manee M.'), owner_id: 'U-0002', status: 'offline',
      battery_pct: 31, charging: false, last_seen: tr('27 ชม.', '27 h'), zone: tr('สภ.เมือง · โซน C', 'Mueang police · zone C'),
      config_ver: 11, qr_front_age: tr('อายุ 11 เดือน', '11 months old'), qr_backup: tr('ยังไม่เคยใช้', 'Never used'),
      qr_activate: tr('ใช้แล้ว 2 ธ.ค. 2025', 'Used 2 Dec 2025'),
    },
    {
      id: 'BX-00031', ap: 'MAILBOX-51C4', house_no: '12/4', owner: tr('ปิติ ยินดี', 'Piti Y.'), owner_id: 'U-0003', status: 'sleeping',
      battery_pct: 14, charging: false, last_seen: tr('2 ชม.', '2 h'), zone: tr('สภ.เมือง · โซน B', 'Mueang police · zone B'),
      config_ver: 12, qr_front_age: tr('อายุ 6 เดือน', '6 months old'), qr_backup: tr('ยังไม่เคยใช้', 'Never used'),
      qr_activate: tr('ใช้แล้ว 3 เม.ย.', 'Used 3 Apr'),
    },
    {
      id: 'BX-00058', ap: 'MAILBOX-77E0', house_no: '77/3', owner: tr('ชูใจ รักบ้าน', 'Chujai R.'), owner_id: 'U-0004', status: 'online',
      battery_pct: 67, charging: true, last_seen: tr('1 นาที', '1 min'), zone: tr('สภ.เมือง · โซน C', 'Mueang police · zone C'),
      config_ver: 12, qr_front_age: tr('อายุ 2 เดือน', '2 months old'), qr_backup: tr('ยังไม่เคยใช้', 'Never used'),
      qr_activate: tr('ใช้แล้ว 20 ส.ค.', 'Used 20 Aug'),
    },
    {
      id: 'BX-00063', ap: 'MAILBOX-88D4', house_no: '88/4', owner: tr('ด.ต. มานะ ดีงาม', 'Pol. Sgt. Mana'), owner_id: 'U-0092', status: 'sleeping',
      battery_pct: 90, charging: false, last_seen: tr('40 นาที', '40 min'), zone: tr('สภ.เมือง · โซน B', 'Mueang police · zone B'),
      config_ver: 12, qr_front_age: tr('อายุ 1 เดือน', '1 month old'), qr_backup: tr('ยังไม่เคยใช้', 'Never used'),
      qr_activate: tr('ใช้แล้ว 25 ก.ย.', 'Used 25 Sep'),
    },
    {
      id: 'BX-00071', ap: 'MAILBOX-7C21', house_no: null, owner: null, owner_id: null, status: 'unbound',
      battery_pct: 95, charging: true, last_seen: tr('10 นาที', '10 min'), zone: null,
      config_ver: 12, qr_front_age: tr('ใหม่', 'New'), qr_backup: tr('ยังไม่เคยใช้', 'Never used'), qr_activate: null,
    },
  ]);

  readonly qrCases = signal<QrCase[]>([
    { id: 'q1', box_id: 'BX-00058', house: '77/3', slot: 1, health: 'maybe_fake', reason: tr('เจ้าหน้าที่สแกนเจอ QR ที่ไม่ใช่ของระบบ', 'An officer scanned a QR that is not ours'), when: tr('วันนี้ 22:04', 'Today 22:04'), backup_used: false, fix: 'fake', step: 0, resolved: false },
    { id: 'q2', box_id: 'BX-00042', house: '99/9', slot: 1, health: 'damaged', reason: tr('เจ้าหน้าที่แจ้ง "ขาด / ฉีก"', 'Officer reported it torn'), when: tr('วันนี้ 22:15', 'Today 22:15'), backup_used: false, fix: null, step: 0, resolved: false },
    { id: 'q3', box_id: 'BX-00031', house: '12/4', slot: 1, health: 'suspicious', reason: tr('ไรเดอร์พิมพ์แทนสแกน 3 ครั้ง / 7 วัน', 'Riders typed the code 3 times in 7 days'), when: tr('เมื่อคืน 23:00', 'Last night 23:00'), backup_used: false, fix: null, step: 0, resolved: false },
    { id: 'q4', box_id: 'BX-00017', house: '45/2', slot: 1, health: 'expiring', reason: tr('อายุ 11 เดือน', '11 months old'), when: tr('เมื่อคืน 23:00', 'Last night 23:00'), backup_used: false, fix: null, step: 0, resolved: false },
  ]);

  readonly agencies = signal<DemoAgency[]>([
    { id: 'a3', name: tr('สภ.บางพลี', 'Bang Phli police'), type: 'police', head: tr('พ.ต.ท. ชาตรี มั่นคง', 'Pol. Lt. Col. Chatree'), head_phone: '081-000-2222', status: 'pending', sent: tr('25 ต.ค.', '25 Oct'), group_code: null, members: 1, contact: 'สภ.บางพลี 02-312-0000' },
    { id: 'a1', name: tr('สภ.เมือง', 'Mueang police'), type: 'police', head: tr('พ.ต.ท. วีระ กล้าหาญ', 'Pol. Lt. Col. Weera'), head_phone: '081-000-1111', status: 'approved', sent: tr('1 ต.ค.', '1 Oct'), group_code: 'PX7K-2MQ9', members: 9, contact: 'สถานี 02-111-2222' },
    { id: 'a2', name: tr('รปภ. หมู่บ้านสุขใจ', 'Sukjai village guards'), type: 'guard', head: tr('คุณวิชัย ใจดี', 'Mr. Wichai'), head_phone: '089-333-4444', status: 'approved', sent: tr('3 ต.ค.', '3 Oct'), group_code: 'RJ4W-9QTC', members: 4, contact: 'ป้อมหน้าหมู่บ้าน 089-333-4444' },
  ]);

  readonly users = signal<AdminUser[]>([
    { id: 'U-0001', name: tr('สมศรี ใจดี', 'Somsri J.'), phone: '089-111-2222', house_no: '99/9', roles: ['owner'], is_head: false, status: 'active', active_sessions: 2, must_change_password: false },
    { id: 'U-0101', name: tr('ส.ต.ต. สมชาย ใจกล้า', 'Pol. L/Cpl. Somchai'), phone: '081-234-5678', agency: tr('สภ.เมือง', 'Mueang police'), roles: ['officer'], is_head: false, status: 'active', active_sessions: 1, must_change_password: false },
    { id: 'U-0090', name: tr('พ.ต.ท. วีระ กล้าหาญ', 'Pol. Lt. Col. Weera'), phone: '081-000-1111', agency: tr('สภ.เมือง', 'Mueang police'), roles: ['officer'], is_head: true, status: 'active', active_sessions: 1, must_change_password: false },
    { id: 'U-0092', name: tr('ด.ต. มานะ ดีงาม', 'Pol. Sgt. Mana'), phone: '086-444-5555', house_no: '88/4', agency: tr('สภ.เมือง', 'Mueang police'), roles: ['owner', 'officer'], is_head: false, status: 'active', active_sessions: 2, must_change_password: false },
    { id: 'U-0002', name: tr('มานี มีสุข', 'Manee M.'), phone: '086-777-1234', house_no: '45/2', roles: ['owner'], is_head: false, status: 'active', active_sessions: 1, must_change_password: false },
    { id: 'U-0900', name: tr('แอดมิน สมาร์ท', 'Admin Smart'), phone: '080-000-0000', roles: ['admin'], is_head: false, status: 'active', self: true, active_sessions: 1, must_change_password: false },
  ]);

  readonly config = signal<{ ver: number; values: BoxConfigDefaults; updated: Tr }>({
    ver: 12,
    values: { report_at: '23:30', scan_timeout_s: 20, max_attempts: 3, flash_when_dark: true, longpoll_wait_s: 50 },
    updated: tr('20 ต.ค. โดยแอดมิน สมาร์ท', '20 Oct by Admin Smart'),
  });

  readonly logs: DemoAdminLog[] = [
    { id: 'g1', type: 'inspection', title: tr('ตรวจ · 99/9 · 22:15', 'Inspection · 99/9 · 22:15'), sub: tr('ส.ต.ต. สมชาย · QR หน้าตู้ · ตู้สแกนผ่าน', 'Pol. L/Cpl. Somchai · front QR · box scan passed') },
    { id: 'g2', type: 'scan', title: tr('สแกน · 77/3 · 22:04', 'Scan · 77/3 · 22:04'), sub: tr('ด.ต. มานะ · QR ไม่ใช่ของระบบ', 'Pol. Sgt. Mana · not a system QR'), fail: true },
    { id: 'g3', type: 'scan', title: tr('สแกน · 88/1 · 21:40', 'Scan · 88/1 · 21:40'), sub: tr('ด.ต. มานะ · ไม่ใช่โซนของตัวเอง', 'Pol. Sgt. Mana · not their zone'), fail: true },
    { id: 'g4', type: 'sos', title: tr('SOS · 12/4 · 20:31', 'SOS · 12/4 · 20:31'), sub: tr('รับโดย ด.ต. มานะ ใน 0:18', 'Accepted by Pol. Sgt. Mana in 0:18') },
    { id: 'g5', type: 'delivery', title: tr('ส่งของ · 99/9 · 14:02', 'Delivery · 99/9 · 14:02'), sub: tr('ไรเดอร์ · QR หน้าตู้ · สแกน', 'Rider · front QR · scanned') },
    { id: 'g6', type: 'data_access', title: tr('เปิดดูข้อมูล · ผู้ใช้ สมศรี · 11:20', 'Data viewed · user Somsri · 11:20'), sub: tr('แอดมิน สมาร์ท · ชื่อ เบอร์ บ้านเลขที่', 'Admin Smart · name, phone, house no.') },
    { id: 'g7', type: 'box_problem', title: tr('ตู้มีปัญหา · 45/2 · 17:05', 'Box problem · 45/2 · 17:05'), sub: tr('ไม่ออนไลน์ตอนเริ่มเวลาตรวจ', 'Offline at patrol start') },
  ];

  /** เช็กลิสต์ช่าง T01 — ขั้นที่กำลังทำ (0–4) · 5 = เสร็จ */
  readonly installStep = signal(0);
  readonly qrTested = signal({ front: false, backup: false });

  /** ช่องทางติดต่อผู้ดูแลระบบ (GET /support · แอดมินตั้งด้วย PUT /admin/settings/support-contact) */
  readonly supportContact = signal<string | null>('ทีมดูแล Smart Mailbox 02-000-1234');

  readonly pendingAgencies = computed(() => this.agencies().filter((a) => a.status === 'pending'));
  readonly openQr = computed(() => this.qrCases().filter((c) => !c.resolved));

  box(id: string | undefined): DemoBox | undefined {
    return this.boxes().find((b) => b.id === id);
  }

  qrCase(id: string | undefined): QrCase | undefined {
    return this.qrCases().find((c) => c.id === id);
  }

  /** เคส QR ที่ยังเปิดของตู้นี้ (แสดงในหน้ารายละเอียดตู้) */
  caseOfBox(boxId: string): QrCase | undefined {
    return this.openQr().find((c) => c.box_id === boxId);
  }

  // ── ตู้ ──

  /** ของจริง: PATCH /admin/boxes/:id/service — ปิดแล้วไรเดอร์เห็น R03-b และตรวจไม่ได้ */
  setService(id: string, active: boolean): void {
    this.patchBox(id, { status: active ? 'online' : 'service_closed' });
  }

  /** ของจริง: POST /admin/boxes/:id/unbind { reason } → ออก QR เปิดใช้ตู้ใบใหม่ */
  unbind(id: string): void {
    this.patchBox(id, { status: 'unbound', house_no: null, owner: null, owner_id: null, zone: null, qr_activate: null, tech_request: undefined });
  }

  /** ของจริง: PATCH /admin/technician-requests/:id { status } → แจ้งเจ้าของบ้าน */
  setTechRequest(id: string, status: 'scheduled' | 'done'): void {
    const b = this.box(id);
    if (b?.tech_request) this.patchBox(id, { tech_request: { ...b.tech_request, status } });
  }

  private patchBox(id: string, patch: Partial<DemoBox>): void {
    this.boxes.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  // ── QR เสีย ──

  /** D06-b เลือกทางแก้: ยังอยู่ → แจ้งเจ้าของบ้าน (request-backup-swap) · ใช้ไปแล้ว → ออกใหม่ 2 ใบ (reissue) */
  chooseFix(id: string, fix: 'swap' | 'reissue'): void {
    // swap: ขั้น 0 แจ้งเจ้าของบ้านแล้ว → ขั้น 1 รอเจ้าของบ้าน
    // reissue: ขั้น 0 ออกใหม่ 2 ใบ + ขั้น 1 ปิดรหัสใบเก่า ทำทันที → ขั้น 2 ส่งช่าง
    this.patchCase(id, { fix, step: fix === 'swap' ? 1 : 2 });
  }

  /** เจ้าของบ้านกด "ติดแล้ว" (POST /boxes/:id/qr/backup-placed) หรือมีการสแกนใบสำรอง → ระบบปิดรหัสใบเก่า */
  ownerPlacedBackup(id: string): void {
    const c = this.qrCase(id);
    if (c?.fix === 'swap' && c.step === 1) this.patchCase(id, { step: 3 });
  }

  /** ขั้นสุดท้ายของ swap: ออกใบสำรองใหม่ (reissue slot 2) */
  issueNewBackup(id: string, delivery: 'post' | 'technician'): void {
    const c = this.qrCase(id);
    if (c?.fix === 'swap' && c.step === 3) this.patchCase(id, { delivery, resolved: true, step: 4 });
  }

  /** ส่งช่าง (reissue ขั้น 2 → 3 · fake ขั้น 0 → 1) — ของจริง: dispatch-technician */
  dispatchTechnician(id: string): void {
    const c = this.qrCase(id);
    if (c?.fix === 'reissue' && c.step === 2) this.patchCase(id, { step: 3 });
    if (c?.fix === 'fake' && c.step === 0) this.patchCase(id, { step: 1 });
  }

  /** ช่างแก้เสร็จ → บันทึกสถานะเป็นปกติ (POST /admin/qr/:id/resolve) — ต้องส่งช่างก่อน */
  resolve(id: string): void {
    const c = this.qrCase(id);
    const ready = (c?.fix === 'reissue' && c.step === 3) || (c?.fix === 'fake' && c.step === 1);
    if (ready) this.patchCase(id, { resolved: true, step: c.fix === 'reissue' ? 4 : 3 });
  }

  private patchCase(id: string, patch: Partial<QrCase>): void {
    this.qrCases.update((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  // ── หน่วยงาน ──

  /** ของจริง: POST /admin/agencies/:id/approve → { group_code } · หัวหน้าได้บทบาท officer + แจ้งเตือน */
  approve(id: string): string | null {
    const a = this.agencies().find((x) => x.id === id);
    if (a?.status !== 'pending') return null; // AGENCY_NOT_PENDING
    const code = newGroupCode();
    this.agencies.update((list) => list.map((x) => (x.id === id ? { ...x, status: 'approved', group_code: code } : x)));
    return code;
  }

  /** ของจริง: POST /admin/agencies/:id/reject { reason? } — หัวหน้าเห็นเหตุผลที่ L02-b */
  reject(id: string, reason: string): void {
    this.agencies.update((list) =>
      list.map((x) => (x.id === id && x.status === 'pending' ? { ...x, status: 'rejected', reject_reason: reason.trim() || undefined } : x)),
    );
  }

  /**
   * POST /admin/agencies — แอดมินสร้างให้แล้วแจกรหัสกลุ่ม (ทางเลือกแทนการรอสมัคร)
   * เบอร์ใหม่ → บัญชีใหม่ + รหัสชั่วคราว (เข้าครั้งแรกต้องเปลี่ยนรหัส + ยอมรับข้อตกลง)
   * เบอร์ที่มีบัญชีแล้ว → ใช้บัญชีเดิม ไม่มีรหัสชั่วคราว · อยู่หน่วยงานอื่นแล้ว → ROLE_EXISTS · บัญชีแอดมิน → ADMIN_ROLE_EXCLUSIVE
   */
  createAgency(
    name: string,
    type: DemoAgency['type'],
    contact: string,
    headName: string,
    rawPhone: string,
  ): { ok: true; group_code: string; temp_password: string | null } | { ok: false; code: 'ROLE_EXISTS' | 'ADMIN_ROLE_EXCLUSIVE' | 'INVALID' } {
    const digits = rawPhone.replace(/\D/g, '').replace(/^66/, '0');
    const c = contact.trim();
    if (!name.trim() || !headName.trim() || !/^0\d{9}$/.test(digits) || c.length < 3 || c.length > 200) return { ok: false, code: 'INVALID' };
    const existing = this.users().find((u) => u.phone.replace(/\D/g, '') === digits);
    if (existing?.roles.includes('admin')) return { ok: false, code: 'ADMIN_ROLE_EXCLUSIVE' };
    if (existing?.roles.includes('officer')) return { ok: false, code: 'ROLE_EXISTS' };
    const agencyName = tr(name.trim(), name.trim());
    const group_code = newGroupCode();
    const phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    this.agencies.update((list) => [
      { id: `a${Date.now()}`, name: agencyName, type, head: tr(headName.trim(), headName.trim()), head_phone: phone, status: 'approved', sent: tr('วันนี้', 'Today'), group_code, members: 1, contact: c },
      ...list,
    ]);
    if (existing) {
      this.patchUser(existing.id, { roles: [...existing.roles, 'officer'], is_head: true, agency: agencyName });
      return { ok: true, group_code, temp_password: null };
    }
    const temp = randomCode(10);
    this.users.update((list) => [
      ...list,
      { id: `U-${1000 + list.length}`, name: tr(headName.trim(), headName.trim()), phone, agency: agencyName, roles: ['officer'], is_head: true, status: 'active', active_sessions: 0, must_change_password: true },
    ]);
    return { ok: true, group_code, temp_password: temp };
  }

  // ── ผู้ใช้ ──

  /** ค้นชื่อ/เบอร์ — เบอร์ค้นได้แม้พิมพ์มีขีด (api.md §9.3) */
  searchUsers(q: string): AdminUser[] {
    const text = q.trim().toLowerCase();
    if (!text) return this.users();
    const digits = text.replace(/\D/g, '');
    return this.users().filter(
      (u) =>
        u.name.th.toLowerCase().includes(text) ||
        u.name.en.toLowerCase().includes(text) ||
        (digits.length >= 3 && u.phone.replace(/\D/g, '').includes(digits)),
    );
  }

  user(id: string | undefined): AdminUser | undefined {
    return this.users().find((u) => u.id === id);
  }

  /**
   * ตั้งบทบาท (PUT/DELETE /admin/users/:id/roles/:role) — คืน code ของ error ถ้าทำไม่ได้
   * แอดมินมีบทบาทอื่นร่วมไม่ได้ · แก้บัญชีตัวเองไม่ได้ · ถอด officer = ออกจากหน่วยงานและหัวหน้า
   */
  setRoles(id: string, roles: AdminRole[]): 'CANNOT_CHANGE_SELF' | 'ADMIN_ROLE_EXCLUSIVE' | 'NO_ROLE' | null {
    const u = this.user(id);
    if (!u) return null;
    if (u.self) return 'CANNOT_CHANGE_SELF';
    if (roles.includes('admin') && roles.length > 1) return 'ADMIN_ROLE_EXCLUSIVE';
    if (!roles.length) return 'NO_ROLE';
    const officer = roles.includes('officer');
    this.patchUser(id, { roles, is_head: officer && u.is_head, agency: officer ? u.agency : undefined });
    return null;
  }

  /** ของจริง: POST /admin/users/:id/reset-password → { temp_password } ครั้งเดียว + เตะทุกเครื่อง */
  resetPassword(id: string): string | null {
    const u = this.user(id);
    if (!u || u.self) return null;
    this.patchUser(id, { must_change_password: true, active_sessions: 0 });
    return randomCode(10);
  }

  /** ปิดทั้งบัญชี = เตะทุกเครื่อง (PATCH /admin/users/:id { status }) */
  setUserStatus(id: string, status: 'active' | 'disabled'): void {
    const u = this.user(id);
    if (!u || u.self) return;
    this.patchUser(id, { status, active_sessions: status === 'disabled' ? 0 : u.active_sessions });
  }

  private patchUser(id: string, patch: Partial<AdminUser>): void {
    this.users.update((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  // ── ค่าตั้งค่าตู้ ──

  /** ของจริง: PUT /admin/box-config → config_ver + 1 · ตู้ดึงไปภายใน 1 วัน (ตอนรายงานรายวัน) */
  saveConfig(values: BoxConfigDefaults): void {
    const ver = this.config().ver + 1;
    this.config.set({ ver, values, updated: tr('เมื่อสักครู่ โดยคุณ', 'Just now by you') });
  }
}
