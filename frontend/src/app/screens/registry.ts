import type { Tr } from '../core/i18n';
import type { IconName } from '../shared/icon';

// รายการหน้าจอทั้งหมด — รหัสตรงกับ wireframe (docs/HANDOFF.md §4.1) และ error ใน api.md
// หน้าที่ยังไม่ได้ทำจริงจะแสดงเป็นหน้าโครง (ชื่อ + คำอธิบาย + ปุ่มไปหน้าถัดไป) เหมือน prototype

export type Area = 'owner' | 'officer' | 'head' | 'admin' | 'rider' | 'auth';

export interface ScreenDef {
  code: string;
  area: Area;
  /** path ภายใต้ prefix ของ area (ไม่มี / นำหน้า) */
  path: string;
  title: Tr;
  note?: Tr;
  /** หน้าที่กดไปต่อได้ (รหัส) */
  next?: string[];
  /** สถานะอื่นของหน้านี้ใน wireframe (จะทำเป็นข้อมูลจำลองแต่ละแบบ) */
  states?: string[];
  /** ข้อเสนอ ยังไม่อยู่ในขอบเขต */
  proposal?: boolean;
  /** เต็มจอ ไม่มีแท็บล่าง และไม่มีขอบ (เช่น SOS) */
  fullscreen?: boolean;
  /** ไม่มีแท็บล่าง แต่มีขอบปกติ (หน้าย่อยที่มีปุ่มย้อนกลับ) */
  noTabs?: boolean;
  /** เกี่ยวกับการสร้างบัญชี/ล็อกอิน — รอตัดสินใจเรื่องฐานข้อมูล */
  waitingDecision?: boolean;
}

export interface TabDef {
  code: string;
  icon: IconName;
  label: Tr;
}

export const AREA_PREFIX: Record<Area, string> = {
  owner: 'home',
  officer: 'officer',
  head: 'agency',
  admin: 'admin',
  rider: 'r',
  auth: 'auth',
};

export const AREA_LABEL: Record<Area, Tr> = {
  owner: { th: 'เจ้าของบ้าน', en: 'Homeowner' },
  officer: { th: 'เจ้าหน้าที่', en: 'Officer' },
  head: { th: 'หัวหน้าหน่วยงาน', en: 'Agency head' },
  admin: { th: 'แอดมิน / ช่าง', en: 'Admin / technician' },
  rider: { th: 'ไรเดอร์', en: 'Rider' },
  auth: { th: 'ล็อกอิน / สมัคร', en: 'Sign-in / sign-up' },
};

/** แท็บล่างของแต่ละบทบาท — ตาม wireframe */
export const TABS: Partial<Record<Area, TabDef[]>> = {
  owner: [
    { code: 'H03', icon: 'home', label: { th: 'หน้าหลัก', en: 'Home' } },
    { code: 'H12', icon: 'list', label: { th: 'ประวัติ', en: 'History' } },
    { code: 'H13', icon: 'target', label: { th: 'ตั้งค่าตู้', en: 'Mailbox' } },
  ],
  officer: [
    { code: 'O01', icon: 'home', label: { th: 'หน้าสรุป', en: 'Summary' } },
    { code: 'O12', icon: 'alert', label: { th: 'SOS', en: 'SOS' } },
    { code: 'O13', icon: 'user', label: { th: 'บัญชี', en: 'Account' } },
  ],
  head: [
    { code: 'L04', icon: 'home', label: { th: 'หน้าหลัก', en: 'Home' } },
    { code: 'L05', icon: 'user', label: { th: 'สมาชิก', en: 'Members' } },
    { code: 'L06', icon: 'pin', label: { th: 'โซน', en: 'Zones' } },
    { code: 'L08', icon: 'list', label: { th: 'ประวัติ', en: 'History' } },
  ],
  admin: [
    { code: 'D01', icon: 'home', label: { th: 'ภาพรวม', en: 'Overview' } },
    { code: 'D03', icon: 'box', label: { th: 'ตู้', en: 'Boxes' } },
    { code: 'D05', icon: 'scan', label: { th: 'QR', en: 'QR' } },
    { code: 'D11', icon: 'list', label: { th: 'ประวัติ', en: 'History' } },
  ],
};

const s = (code: string, area: Area, path: string, th: string, en: string, extra: Partial<ScreenDef> = {}): ScreenDef => ({
  code,
  area,
  path,
  title: { th, en },
  ...extra,
});
const n = (th: string, en: string): Tr => ({ th, en });

export const SCREENS: ScreenDef[] = [
  // ── เจ้าของบ้าน ─────────────────────────────────────────────
  // สถานะ H03-b/c/d: /home?state=new|offline|todo (หรือแถบ "จำลอง" บนหน้าหลัก)
  s('H03', 'owner', '', 'หน้าหลัก', 'Home', { states: ['H03-b', 'H03-c', 'H03-d', 'H03-L'], next: ['H09', 'H14', 'H12'] }),
  s('H09', 'owner', 'sos', 'SOS · กำลังส่ง', 'SOS · sending', {
    fullscreen: true,
    note: n('กดค้าง 3 วิ แล้วส่งถึงเจ้าหน้าที่ในโซนเป็นขั้น ๆ', 'Hold 3 s, then sent to zone officers in stages'),
    states: ['H03-e', 'H09-b', 'H09-c'],
    next: ['H10', 'H11', 'H08'],
  }),
  s('H08', 'owner', 'sos/no-officer', 'บ้านยังไม่มีเจ้าหน้าที่', 'No officer for this house', {
    fullscreen: true,
    note: n('บอกให้โทร 191 / 1669 ทันที', 'Tell the user to call 191 / 1669 now'),
  }),
  s('H10', 'owner', 'sos/cancel', 'ยืนยันยกเลิก SOS', 'Cancel SOS?', { fullscreen: true, next: ['H03'] }),
  s('H11', 'owner', 'sos/accepted', 'มีเจ้าหน้าที่รับเรื่องแล้ว', 'Help is on the way', { fullscreen: true, next: ['H11-b'] }),
  s('H11-b', 'owner', 'sos/closed', 'ปิดเรื่อง SOS แล้ว', 'SOS closed', { fullscreen: true, next: ['H03'] }),
  s('H12', 'owner', 'history', 'ประวัติ', 'History', { next: ['H12-b', 'H12-c', 'H12-d', 'H12-e'] }),
  s('H12-b', 'owner', 'history/inspection', 'รายละเอียดการตรวจ', 'Inspection details'),
  s('H12-c', 'owner', 'history/delivery', 'รายละเอียดการส่งของ', 'Delivery details'),
  s('H12-d', 'owner', 'history/offline', 'ตู้ไม่ออนไลน์', 'Mailbox offline'),
  s('H12-e', 'owner', 'history/range', 'เลือกช่วงวันที่', 'Pick a date range', { fullscreen: true }),
  s('H13', 'owner', 'settings', 'ตั้งค่าตู้', 'Mailbox settings', { next: ['H13-b', 'H13-d', 'H15'] }),
  s('H13-b', 'owner', 'settings/wifi', 'เปลี่ยน Wi-Fi', 'Change Wi-Fi', { next: ['H13-c'] }),
  s('H13-c', 'owner', 'settings/technician', 'แจ้งช่างแล้ว', 'Technician requested'),
  s('H13-d', 'owner', 'settings/display', 'การแสดงผล', 'Display'),
  s('H14', 'owner', 'notifications', 'แจ้งเตือน', 'Notifications'),
  s('H15', 'owner', 'family', 'สมาชิกในบ้าน', 'Family members', { proposal: true, next: ['H15-b', 'H15-c'] }),
  s('H15-b', 'owner', 'family/invite', 'เชิญสมาชิก', 'Invite a member', { proposal: true }),
  s('H15-c', 'owner', 'family/member-home', 'หน้าหลักของสมาชิก', 'Member home', { proposal: true }),

  // ── เจ้าหน้าที่ ─────────────────────────────────────────────
  // สถานะหน้าสรุป O01-b/c/d/e: /officer?state=sos_incoming|handling|off_hours|all_done
  s('O01', 'officer', '', 'หน้าสรุป', 'Summary', { states: ['O01-b', 'O01-c', 'O01-d', 'O01-e', 'O01-N'], next: ['O02', 'O09'] }),
  s('O02', 'officer', 'scan', 'สแกน QR หน้าตู้', 'Scan the mailbox QR', { fullscreen: true, next: ['O02-b', 'O05', 'O04', 'O04-b'] }),
  s('O02-b', 'officer', 'scan/code', 'พิมพ์รหัสใต้ QR', 'Type the code under the QR', { fullscreen: true, next: ['O03'] }),
  s('O02-c', 'officer', 'scan/camera', 'ขอสิทธิ์กล้อง', 'Camera permission', { fullscreen: true, next: ['O02', 'O02-b'] }),
  s('O03', 'officer', 'check/qr-condition', 'QR หน้าตู้เสียไหม', 'Is the QR damaged?', { fullscreen: true, next: ['O05'] }),
  s('O04', 'officer', 'check/not-system', 'QR ไม่ใช่ของระบบ', 'Not a system QR', {
    fullscreen: true,
    note: n('อาจถูกแปะทับ — แจ้งแอดมินทันที', 'May have been covered — admin is alerted'),
  }),
  s('O04-b', 'officer', 'check/denied', 'ตรวจไม่ได้', 'Cannot inspect', {
    fullscreen: true,
    note: n('?reason=zone|window|code — ไม่อยู่ในโซน / นอกเวลาตรวจ / รหัสผิด', '?reason=zone|window|code'),
  }),
  s('O05', 'officer', 'check/wake', 'กำลังปลุกตู้', 'Waking the mailbox', { fullscreen: true, states: ['O05-b'], next: ['O06'] }),
  s('O06', 'officer', 'check/badge', 'QR ประจำตัว', 'Your badge QR', {
    fullscreen: true,
    note: n('ยื่นให้กล้องตู้ · เปลี่ยนทุก 30 วิ · ลองได้ 3 ครั้ง', 'Show to the box camera · refreshes every 30 s · 3 tries'),
    states: ['O06-b'],
    next: ['O08', 'O06-c'],
  }),
  s('O06-c', 'officer', 'check/badge-failed', 'ตู้สแกนไม่ผ่าน 3 ครั้ง', 'Box failed 3 times', { fullscreen: true }),
  s('O08', 'officer', 'check/done', 'ตรวจแล้ว', 'Inspection recorded', { fullscreen: true, next: ['O01'] }),
  s('O12', 'officer', 'sos', 'รายการ SOS', 'SOS list', { next: ['O09'] }),
  s('O09', 'officer', 'sos/case', 'SOS · รับเรื่อง', 'SOS · accept', { fullscreen: true, states: ['O09-b', 'O09-c'], next: ['O10'] }),
  s('O10', 'officer', 'sos/handling', 'กำลังดูแล SOS', 'Handling SOS', { fullscreen: true, next: ['O11'] }),
  s('O11', 'officer', 'sos/close', 'ปิดเรื่อง + หมายเหตุ', 'Close with a note', { fullscreen: true, next: ['O12'] }),
  s('O13', 'officer', 'account', 'บัญชี', 'Account', { next: ['O13-b'] }),
  s('O13-b', 'officer', 'account/display', 'การแสดงผล', 'Display'),

  // ── หัวหน้าหน่วยงาน ────────────────────────────────────────
  s('L04', 'head', '', 'ภาพรวมทีมวันนี้', 'Team today', { next: ['L09', 'O02'] }),
  s('L05', 'head', 'members', 'สมาชิก', 'Members', { next: ['L05-b'] }),
  s('L05-b', 'head', 'members/manage', 'จัดการสมาชิก', 'Manage member', { noTabs: true }),
  s('L06', 'head', 'zones', 'โซน', 'Zones', { next: ['L07'] }),
  s('L07', 'head', 'zones/edit', 'แก้โซน', 'Edit zone', { noTabs: true, next: ['L07-b', 'L07-c'] }),
  s('L07-b', 'head', 'zones/houses', 'เพิ่มบ้าน', 'Add houses', { noTabs: true }),
  s('L07-c', 'head', 'zones/officers', 'เพิ่มเจ้าหน้าที่', 'Add officers', { noTabs: true }),
  s('L08', 'head', 'history', 'Log การตรวจ', 'Inspection log'),
  s('L09', 'head', 'notifications', 'แจ้งเตือน', 'Notifications', { noTabs: true }),
  s('L02', 'head', 'setup/pending', 'รอแอดมินอนุมัติ', 'Waiting for admin', { states: ['L02-b'], noTabs: true, next: ['L03'], waitingDecision: true }),
  s('L03', 'head', 'setup/approved', 'อนุมัติแล้ว · แชร์รหัสกลุ่ม', 'Approved · share the group code', { next: ['L04'] }),

  // ── แอดมิน / ช่าง ──────────────────────────────────────────
  s('D01', 'admin', '', 'ภาพรวม', 'Overview', { next: ['D02', 'D09', 'D10', 'D13', 'D12', 'T01'] }),
  s('D03', 'admin', 'boxes', 'ตู้', 'Mailboxes', { next: ['D04'] }),
  s('D04', 'admin', 'boxes/detail', 'รายละเอียดตู้', 'Mailbox details', { noTabs: true, next: ['T01'] }),
  s('D05', 'admin', 'qr', 'สุขภาพ QR', 'QR health', { next: ['D06', 'D06-b'] }),
  s('D06', 'admin', 'qr/fake', 'QR ปลอม', 'Fake QR', { fullscreen: true, next: ['D08'] }),
  s('D06-b', 'admin', 'qr/damaged', 'QR เสีย · เลือกวิธีแก้', 'Damaged QR · choose a fix', { noTabs: true, next: ['D07', 'D07-b'] }),
  s('D07', 'admin', 'qr/waiting-owner', 'รอเจ้าของบ้าน', 'Waiting for the owner', { noTabs: true, next: ['D08'] }),
  s('D07-b', 'admin', 'qr/reissued', 'ใช้ใบสำรองแล้ว · ออกใหม่ 2 ใบ', 'Backup used · reissue 2', { noTabs: true, next: ['D08'] }),
  s('D08', 'admin', 'qr/fixed', 'แก้แล้ว', 'Fixed', { fullscreen: true, next: ['D05'] }),
  s('D09', 'admin', 'users', 'ผู้ใช้', 'Users', { noTabs: true }),
  s('D10', 'admin', 'config', 'ค่าตั้งค่าตู้', 'Mailbox config', { noTabs: true }),
  s('D11', 'admin', 'history', 'Log ทั้งหมด', 'All logs'),
  s('D02', 'admin', 'agencies/pending', 'คำขอหน่วยงาน', 'Agency requests', { noTabs: true }),
  s('D13', 'admin', 'agencies', 'หน่วยงาน', 'Agencies', { noTabs: true, next: ['D02'] }),
  s('D12', 'admin', 'notifications', 'แจ้งเตือน', 'Notifications', { noTabs: true }),
  // ไม่มีใน wireframe — api.md §9.7 (2026-10-27)
  s('D14', 'admin', 'plans', 'แพ็กเกจ', 'Plans', { noTabs: true, note: n('จัดการรายการแพ็กเกจ · ไม่มีใน wireframe', 'Manage plans · not in the wireframe') }),
  s('T01', 'admin', 'tech', 'เช็กลิสต์ติดตั้ง', 'Install checklist', { noTabs: true, next: ['T02', 'T02-b'] }),
  s('T02', 'admin', 'tech/wifi', 'หน้าตั้ง Wi-Fi ของตู้', 'Mailbox Wi-Fi setup', {
    noTabs: true,
    note: n('หน้านี้ตู้แสดงเอง (192.168.4.1) — ทีมฮาร์ดแวร์ทำ · ในแอปเป็นตัวอย่าง', 'Served by the box itself (192.168.4.1) — preview only'),
    next: ['T02-b', 'T02-c'],
  }),
  s('T02-b', 'admin', 'tech/lights', 'ดูไฟที่ตู้', 'Read the box lights', { noTabs: true, next: ['T01', 'T02-c'] }),
  s('T02-c', 'admin', 'tech/failed', 'ต่อ Wi-Fi ไม่ได้', 'Wi-Fi failed', { noTabs: true, next: ['T02'] }),

  // ── ไรเดอร์ (ไม่ล็อกอิน) ───────────────────────────────────
  // ทางเข้าจริง: ลิงก์ใน QR หน้าตู้ /b/<token> → R02 (app.routes.ts)
  s('R01', 'rider', '', 'แจ้งส่งของ · พิมพ์รหัส', 'Delivery · type the code', { next: ['R02', 'R03', 'R03-b'] }),
  s('R02', 'rider', 'deliver', 'ส่งของ', 'Deliver', { next: ['R04', 'R03-c'] }),
  s('R03', 'rider', 'invalid', 'QR ไม่ถูกต้อง', 'Invalid QR', { next: ['R01'] }),
  s('R03-b', 'rider', 'closed', 'ตู้ปิดบริการ', 'Mailbox not in service'),
  s('R03-c', 'rider', 'limited', 'ส่งถี่เกินไป', 'Too many deliveries', { next: ['R02'] }),
  s('R04', 'rider', 'done', 'แจ้งส่งของแล้ว', 'Delivery sent', { fullscreen: true }),

  // ── ล็อกอิน / สมัคร (รอตัดสินใจเรื่องบัญชี) ─────────────────
  s('A01', 'auth', 'line', 'เปิดใน LINE อยู่', 'Opened inside LINE', {
    note: n('บอกให้เปิดใน Safari / Chrome (แจ้งเตือนใน LINE ใช้ไม่ได้)', 'Ask to open in Safari / Chrome'),
  }),
  s('A02', 'auth', 'install', 'ติดตั้งเป็นแอป (iPhone)', 'Install the app (iPhone)'),
  s('A03', 'auth', 'notifications', 'เปิดแจ้งเตือน', 'Turn on notifications'),
  s('A04', 'auth', 'signin', 'ล็อกอิน', 'Sign in', { states: ['A04-b'], next: ['A05'], waitingDecision: true }),
  s('A05', 'auth', 'choose', 'เลือกประเภทผู้ใช้', 'Choose account type', { next: ['A06', 'A10', 'L01'], waitingDecision: true }),
  s('A06', 'auth', 'signup/owner', 'สมัคร · เจ้าของบ้าน', 'Sign up · homeowner', { states: ['A06-b'], next: ['A07'], waitingDecision: true }),
  s('A07', 'auth', 'activate', 'สแกน QR เปิดใช้ตู้', 'Scan the activation QR', { states: ['A07-b', 'A07-c'], next: ['A08'], waitingDecision: true }),
  s('A08', 'auth', 'activate/name', 'ตั้งชื่อตู้', 'Name your mailbox', { next: ['A09'], waitingDecision: true }),
  s('A09', 'auth', 'activate/done', 'พร้อมใช้งาน', 'All set', { fullscreen: true, waitingDecision: true }),
  s('A10', 'auth', 'signup/officer', 'สมัคร · เจ้าหน้าที่', 'Sign up · officer', { next: ['A11'], waitingDecision: true }),
  s('A11', 'auth', 'waiting', 'รอหัวหน้ายืนยัน', 'Waiting for your head', { states: ['A11-b'], next: ['A12'], waitingDecision: true }),
  s('L01', 'auth', 'signup/agency', 'สมัครหน่วยงาน', 'Register an agency', { next: ['L02'], waitingDecision: true }),
  s('A12', 'auth', 'push-required', 'ต้องเปิดแจ้งเตือนก่อน', 'Notifications required', { next: ['O01'] }),
  // ไม่มีใน wireframe — เพิ่มตาม api.md §2 (2026-10-27)
  s('A14', 'auth', 'password', 'เปลี่ยนรหัสผ่าน', 'Change password', {
    note: n('?forced=1 = บังคับหลังถูกรีเซ็ต (PASSWORD_CHANGE_REQUIRED) · ไม่มีใน wireframe', '?forced=1 after a reset · not in the wireframe'),
    next: ['A04'],
  }),
  s('A15', 'auth', 'add/owner', 'เพิ่มบทบาทเจ้าของบ้าน', 'Add homeowner role', {
    note: n('POST /me/roles/owner · ไม่มีใน wireframe', 'POST /me/roles/owner · not in the wireframe'),
    next: ['A07'],
  }),
  s('A16', 'auth', 'add/agency', 'ขอเข้าหน่วยงาน', 'Join an agency', {
    note: n('POST /me/agency/join · ไม่มีใน wireframe', 'POST /me/agency/join · not in the wireframe'),
    next: ['A11'],
  }),
  s('A13', 'auth', 'terms', 'ข้อตกลง', 'Terms', {
    note: n('ต้องมีข้อความว่า SOS ไม่ได้แทนการโทร 191', 'Must say SOS does not replace calling 191'),
  }),
];

const BY_CODE = new Map(SCREENS.map((d) => [d.code, d]));

export function screen(code: string): ScreenDef {
  const d = BY_CODE.get(code);
  if (!d) throw new Error(`unknown screen ${code}`);
  return d;
}

/** URL เต็มของหน้า เช่น '/home/history' */
export function screenUrl(code: string): string {
  const d = screen(code);
  return `/${AREA_PREFIX[d.area]}${d.path ? `/${d.path}` : ''}`;
}
