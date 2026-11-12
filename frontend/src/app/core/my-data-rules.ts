import type { Tr } from './i18n';

// หน้า "ข้อมูลของฉัน" (/settings/my-data) — logic ล้วน ๆ (ไม่แตะ DOM/HTTP) เพื่อทดสอบได้
// สัญญา API = ข้อเสนอ F-002 ใน docs/agent-sync/to-backend.md (ยังรอ backend ตอบ) · ตัดสินจาก `code` / สถานะ ไม่ดู message (CLAUDE.md กฎข้อ 10)

export type Availability = 'unknown' | 'yes' | 'no';

/** ผลตรวจครั้งเดียวว่า backend มี route นี้ไหม: 2xx = มี · 404/405/501 = ยังไม่มี · อย่างอื่น (เน็ตหลุด/401/5xx) = ยังไม่รู้ → ซ่อนไว้ก่อน */
export function availabilityFromStatus(status: number | null | undefined): Availability {
  if (status === null || status === undefined) return 'unknown';
  if (status >= 200 && status < 300) return 'yes';
  if (status === 404 || status === 405 || status === 501) return 'no';
  return 'unknown';
}

/** คำที่ผู้ใช้ต้องพิมพ์ยืนยันก่อนลบ (ตามภาษา) — ที่ส่ง API เป็น "DELETE" เสมอ */
export function confirmPhrase(lang: 'th' | 'en'): string {
  return lang === 'th' ? 'ลบบัญชี' : 'DELETE';
}

export type DeleteStep = 'preview' | 'confirm' | 'result';

export interface DeletePreview {
  counts: Record<string, number>;
  blockers: { code: string }[];
  retained: { kind: string; reason?: string }[];
}

/** เหตุที่ลบไม่ได้ → ข้อความ + ทางแก้ (รหัสที่ไม่รู้จัก = ข้อความกลาง · ห้ามโชว์รหัสดิบเป็นข้อความหลัก) */
const BLOCKER_TEXT: Record<string, Tr> = {
  LAST_HEAD: { th: 'คุณเป็นหัวหน้าคนเดียวของหน่วยงาน — ตั้งหัวหน้าคนอื่นก่อน แล้วค่อยลบ', en: 'You are the only head of your agency — appoint another head first' },
  SOS_OPEN: { th: 'มี SOS ที่ยังเปิดอยู่ — รอให้ปิดเคสก่อน แล้วค่อยลบ', en: 'An SOS is still open — wait until it is closed' },
  IS_ADMIN: { th: 'บัญชีผู้ดูแลระบบลบเองไม่ได้ — ติดต่อผู้ดูแลระบบคนอื่น', en: 'Admin accounts can’t be deleted here — contact another admin' },
  BOX_BOUND: { th: 'ยังมีตู้ที่ผูกอยู่ — คืนตู้ก่อน แล้วค่อยลบ', en: 'You still have a linked mailbox — return it first' },
};
export function blockerText(code: string): Tr {
  return BLOCKER_TEXT[code] ?? { th: 'ตอนนี้ลบบัญชีไม่ได้ — ติดต่อผู้ดูแลระบบเพื่อขอความช่วยเหลือ', en: 'The account can’t be deleted right now — contact the admin for help' };
}

const COUNT_LABEL: Record<string, Tr> = {
  boxes: { th: 'ตู้ที่ผูก', en: 'Linked mailboxes' },
  sessions: { th: 'เครื่องที่ล็อกอิน', en: 'Signed-in devices' },
  notifications: { th: 'การแจ้งเตือน', en: 'Notifications' },
  push_subscriptions: { th: 'เครื่องที่รับแจ้งเตือน', en: 'Push devices' },
};
export function countLabel(key: string): Tr {
  return COUNT_LABEL[key] ?? { th: 'ข้อมูลอื่น', en: 'Other data' };
}

const RETAINED_LABEL: Record<string, Tr> = {
  scan_log: { th: 'บันทึกการสแกน/พิมพ์รหัส', en: 'Scan and typed-code logs' },
  data_access_log: { th: 'บันทึกการเข้าถึงข้อมูล', en: 'Data access logs' },
  terms_acceptance: { th: 'บันทึกการยอมรับข้อตกลง', en: 'Terms acceptance records' },
};
export function retainedLabel(kind: string): Tr {
  return RETAINED_LABEL[kind] ?? { th: 'ข้อมูลที่กฎหมาย/ระบบต้องเก็บ', en: 'Records the system must keep' };
}

export const RETAINED_NOTE: Tr = {
  th: 'ข้อมูลกลุ่มนี้จะไม่ถูกลบ เพราะเป็นหลักฐานที่ระบบต้องเก็บไว้ (แก้หรือลบไม่ได้)',
  en: 'These records are NOT deleted: they are audit evidence the system must keep (cannot be edited or removed)',
};

/** ปุ่ม "ลบบัญชีถาวร" กดได้เมื่อ: ไม่มีเหตุขวาง + พิมพ์คำยืนยันตรง + กรอกรหัสผ่าน + ไม่ได้กำลังส่ง */
export function canSubmitDelete(args: { typed: string; password: string; lang: 'th' | 'en'; blockers: unknown[]; busy: boolean }): boolean {
  return !args.busy && args.blockers.length === 0 && args.typed.trim() === confirmPhrase(args.lang) && args.password.length > 0;
}

/** ขั้นถัดไปของลบบัญชี: มีเหตุขวางแล้วห้ามไปขั้นยืนยัน */
export function canContinueFromPreview(p: DeletePreview | null): boolean {
  return !!p && p.blockers.length === 0;
}

/** error ของ `DELETE /me` / ส่งออก / เครื่อง → ข้อความ (ตัดสินจาก code/status) */
export function myDataErrorText(code: string | null, status: number | null): Tr {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return { th: 'รหัสผ่านไม่ถูกต้อง — ตรวจรหัสแล้วลองอีกครั้ง (ผิด 5 ครั้งบัญชีจะถูกพัก 15 นาที)', en: 'Wrong password — check it and retry (5 wrong tries lock the account for 15 minutes)' };
    case 'ACCOUNT_LOCKED':
      return { th: 'กรอกผิดหลายครั้ง บัญชีถูกพักไว้ 15 นาที — รอแล้วลองใหม่', en: 'Too many tries — the account is locked for 15 minutes' };
    case 'RATE_LIMITED':
    case 'EXPORT_LIMIT':
      return { th: 'ทำบ่อยเกินไป — รอสักครู่หรือลองใหม่พรุ่งนี้', en: 'Too many requests — wait a while or try tomorrow' };
    case 'DELETE_BLOCKED':
      return { th: 'ตอนนี้ลบบัญชีไม่ได้ — กลับไปดูเหตุผลในขั้นแรก', en: 'The account can’t be deleted now — go back to the first step to see why' };
    case 'CONFIRM_MISMATCH':
      return { th: 'คำยืนยันไม่ตรง — พิมพ์ให้ตรงตามที่แสดง', en: 'The confirmation text doesn’t match — type it exactly as shown' };
  }
  if (status === 0) return { th: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Can’t reach the server — check your connection and retry' };
  if ((status ?? 0) >= 500) return { th: 'เซิร์ฟเวอร์ขัดข้อง — ลองอีกครั้งภายหลัง', en: 'The server is having trouble — try again later' };
  return { th: 'ทำรายการไม่สำเร็จ — ลองอีกครั้ง ถ้ายังไม่ได้ให้ติดต่อผู้ดูแลระบบ', en: 'That did not work — try again, or contact the admin if it keeps failing' };
}
