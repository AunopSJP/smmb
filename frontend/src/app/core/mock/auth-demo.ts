import { Injectable, signal, type WritableSignal } from '@angular/core';
import type { Tr } from '../i18n';

// ล็อกอิน / สมัคร / เปลี่ยนรหัส / เพิ่มบทบาท — **จำลองในหน่วยความจำของหน้าเว็บเท่านั้น ไม่สร้างบัญชีจริง ไม่เรียก backend**
// (เรื่องบัญชี/ฐานข้อมูลยังไม่ได้ตัดสินใจ — CLAUDE.md "ตอนนี้: ทำหน้าเว็บก่อน")
// รูปร่างคำตอบและ code ของ error ตาม api.md §2 เพื่อสลับเป็น API จริงทีหลัง

export type SigninError = 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED';
export type SignupError = 'PHONE_TAKEN' | 'GROUP_CODE_INVALID' | 'TERMS_NOT_ACCEPTED';
export type AddRoleError = 'ROLE_EXISTS' | 'ADMIN_ROLE_EXCLUSIVE' | 'GROUP_CODE_INVALID' | 'TERMS_NOT_ACCEPTED' | 'INVALID';
export type ActivateError = 'QR_INVALID' | 'BOX_ALREADY_OWNED';
export type DemoAccountRole = 'owner' | 'officer' | 'head' | 'admin';

interface DemoAccount {
  phone: string;
  name: Tr;
  /** บทบาทที่ได้รับแล้ว (คำขอที่รออยู่ไม่นับ) */
  roles: DemoAccountRole[];
  password: string;
  /** ถูกหัวหน้า/แอดมินรีเซ็ตรหัส → ต้องเปลี่ยนก่อนใช้งาน */
  must_change_password?: boolean;
  /** รอหัวหน้ายืนยัน (officer) / รอแอดมินอนุมัติหน่วยงาน (agency) */
  pending?: 'officer' | 'agency';
}

/** รหัสผ่านของบัญชีทดลองบนหน้าจอ (ไม่ใช่บัญชีจริง) */
export const DEMO_PASSWORD = 'demo1234';
/** api.md §2: รหัสผิด (signin หรือ change-password) 5 ครั้งใน 15 นาที → ล็อก 15 นาที */
export const SIGNIN_MAX_FAILS = 5;
export const SIGNIN_LOCK_MS = 15 * 60 * 1000;
/** รหัสผ่าน 8–128 ตัว ไม่บังคับอักขระพิเศษ (backend auth.dto.ts) */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** หน้าแรกของแต่ละบทบาท */
export const ROLE_HOME: Record<DemoAccountRole, string> = {
  owner: '/home',
  officer: '/officer',
  head: '/agency',
  admin: '/admin',
};

/** เบอร์: ตัดขีด/ช่องว่าง · +66 → 0 · ต้องเป็น 0 + 9 หลัก (api.md §2) */
export function normalizePhone(raw: string): string | null {
  // เลขไทย ๐-๙ และเต็มความกว้างจากคีย์บอร์ดมือถือ → เลขอารบิก ก่อนตัดอักขระอื่น (ให้ตรงกับ backend)
  let d = raw
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    .normalize('NFKC')
    .replace(/[^\d+]/g, '');
  if (d.startsWith('+66')) d = '0' + d.slice(3);
  else if (d.startsWith('66') && d.length === 11) d = '0' + d.slice(2);
  return /^0\d{9}$/.test(d) ? d : null;
}

export const normalizeGroupCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface SignupForm {
  name: string;
  phone: string;
  password: string;
  house_no: string;
  /** หมู่บ้าน/ย่าน (ไม่บังคับ) */
  area: string;
  group_code: string;
  agency_name: string;
  agency_type: 'police' | 'guard' | 'other';
  /** ช่องทางติดต่อหน่วยงาน (สมัครหน่วยงาน) — แสดงให้คนที่ขอเข้า */
  contact: string;
  terms: boolean;
}

export type FormKey = 'owner' | 'officer' | 'agency' | 'addOwner' | 'join';

const emptyForm = (): SignupForm => ({ name: '', phone: '', password: '', house_no: '', area: '', group_code: '', agency_name: '', agency_type: 'police', contact: '', terms: false });

export type SigninResult =
  | { ok: true; phone: string; roles: DemoAccountRole[]; name: Tr; must_change_password: boolean; pending: DemoAccount['pending'] | null }
  | { ok: false; code: SigninError; left?: number };

@Injectable({ providedIn: 'root' })
export class AuthDemo {
  /** ใช้ในเทสต์ */
  now: () => number = () => Date.now();

  readonly accounts: DemoAccount[] = [
    { phone: '0891112222', name: { th: 'สมศรี ใจดี', en: 'Somsri J.' }, roles: ['owner'], password: DEMO_PASSWORD },
    { phone: '0812345678', name: { th: 'ส.ต.ต. สมชาย', en: 'Pol. L/Cpl. Somchai' }, roles: ['officer'], password: DEMO_PASSWORD },
    { phone: '0810001111', name: { th: 'พ.ต.ท. วีระ', en: 'Pol. Lt. Col. Weera' }, roles: ['officer', 'head'], password: DEMO_PASSWORD },
    { phone: '0864445555', name: { th: 'ด.ต. มานะ', en: 'Pol. Sgt. Mana' }, roles: ['owner', 'officer'], password: DEMO_PASSWORD },
    { phone: '0876667777', name: { th: 'ส.ต.ต. สมศักดิ์', en: 'Pol. L/Cpl. Somsak' }, roles: ['officer'], password: DEMO_PASSWORD, must_change_password: true },
    { phone: '0800000000', name: { th: 'แอดมิน', en: 'Admin' }, roles: ['admin'], password: DEMO_PASSWORD },
  ];
  /** รหัสกลุ่มของหน่วยงานที่อนุมัติแล้ว → ชื่อหน่วยงาน */
  readonly groupCodes: Record<string, { name: Tr; contact: string }> = {
    PX7K2MQ9: { name: { th: 'สภ.เมือง', en: 'Mueang police' }, contact: 'สถานี 02-111-2222' },
    RJ4W9QTC: { name: { th: 'รปภ. หมู่บ้านสุขใจ', en: 'Sukjai village guards' }, contact: 'ป้อมหน้าหมู่บ้าน 089-333-4444' },
  };

  private readonly fails = new Map<string, { count: number; first: number; lockedUntil: number }>();

  /** ค่าที่กรอกค้างไว้ (กลับจากหน้าข้อตกลงแล้วไม่หาย) */
  readonly forms: Record<FormKey, WritableSignal<SignupForm>> = {
    owner: signal(emptyForm()),
    officer: signal(emptyForm()),
    agency: signal(emptyForm()),
    addOwner: signal(emptyForm()),
    join: signal(emptyForm()),
  };

  /** ผลการสมัครล่าสุด (หน้ารอ / หน้าเสร็จใช้) */
  readonly officerRequest = signal<{ agency: Tr; contact: string; at: string } | null>(null);
  readonly agencyRequest = signal<{ name: string; type: SignupForm['agency_type']; contact: string; at: string } | null>(null);
  readonly ownerHouse = signal<string | null>(null);
  readonly boxName = signal('ตู้หน้าบ้าน');

  account(phone: string): DemoAccount | undefined {
    return this.accounts.find((a) => a.phone === phone);
  }

  // ── รหัสผิดหลายครั้ง (ใช้ร่วมกันระหว่าง signin กับ change-password) ──

  private locked(phone: string): boolean {
    const f = this.fails.get(phone);
    return !!f && this.now() < f.lockedUntil;
  }

  /** นับรหัสผิด → คืนจำนวนครั้งที่เหลือ (0 = เพิ่งล็อก) */
  private fail(phone: string): number {
    const now = this.now();
    let f = this.fails.get(phone);
    if (f && now - f.first > SIGNIN_LOCK_MS && now >= f.lockedUntil) f = undefined;
    const next = { count: (f?.count ?? 0) + 1, first: f?.first ?? now, lockedUntil: 0 };
    if (next.count >= SIGNIN_MAX_FAILS) next.lockedUntil = now + SIGNIN_LOCK_MS;
    this.fails.set(phone, next);
    return SIGNIN_MAX_FAILS - next.count;
  }

  /** POST /auth/signin — เบอร์ไม่มีบัญชีก็ตอบแบบเดียวกัน (นับครั้งเหมือนกัน กันเดาว่าเบอร์ไหนมีบัญชี) */
  signin(rawPhone: string, password: string): SigninResult {
    const phone = normalizePhone(rawPhone) ?? rawPhone;
    if (this.locked(phone)) return { ok: false, code: 'ACCOUNT_LOCKED' };
    const acc = this.account(phone);
    if (acc && password === acc.password) {
      this.fails.delete(phone);
      return { ok: true, phone, roles: acc.roles, name: acc.name, must_change_password: !!acc.must_change_password, pending: acc.pending ?? null };
    }
    const left = this.fail(phone);
    return left <= 0 ? { ok: false, code: 'ACCOUNT_LOCKED' } : { ok: false, code: 'INVALID_CREDENTIALS', left };
  }

  /** POST /auth/change-password — สำเร็จแล้วทุกเครื่องออกจากระบบ ต้องล็อกอินใหม่ */
  changePassword(phone: string, current: string, next: string): { ok: true } | { ok: false; code: SigninError | 'INVALID'; left?: number } {
    const acc = this.account(phone);
    if (!acc) return { ok: false, code: 'INVALID_CREDENTIALS' };
    if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) return { ok: false, code: 'INVALID' };
    if (this.locked(phone)) return { ok: false, code: 'ACCOUNT_LOCKED' };
    if (current !== acc.password) {
      const left = this.fail(phone);
      return left <= 0 ? { ok: false, code: 'ACCOUNT_LOCKED' } : { ok: false, code: 'INVALID_CREDENTIALS', left };
    }
    this.fails.delete(phone);
    acc.password = next;
    acc.must_change_password = false;
    return { ok: true };
  }

  // ── สมัครใหม่ ──

  private common(f: SignupForm): SignupError | 'INVALID' | null {
    if (!f.terms) return 'TERMS_NOT_ACCEPTED'; // ไม่ยอมรับ = ไม่สร้างบัญชี
    const phone = normalizePhone(f.phone);
    if (!phone || !f.name.trim() || f.password.length < PASSWORD_MIN || f.password.length > PASSWORD_MAX) return 'INVALID';
    // เบอร์ที่มีบัญชีแล้ว → ล็อกอินแล้วเพิ่มบทบาทแทน (ไม่ผูกบทบาทใหม่จากหน้าสมัคร)
    if (this.account(phone)) return 'PHONE_TAKEN';
    return null;
  }

  private create(f: SignupForm, roles: DemoAccountRole[], pending?: DemoAccount['pending']): void {
    this.accounts.push({ phone: normalizePhone(f.phone)!, name: { th: f.name.trim(), en: f.name.trim() }, roles, password: f.password, pending });
  }

  /** POST /auth/signup/owner → ไปผูกตู้ (A07) */
  signupOwner(f: SignupForm): SignupError | 'INVALID' | null {
    const e = this.common(f) ?? (f.house_no.trim() ? null : 'INVALID');
    if (e) return e;
    this.create(f, ['owner']);
    this.ownerHouse.set(f.house_no.trim());
    return null;
  }

  /** POST /auth/signup/officer → รอหัวหน้า (A11) */
  signupOfficer(f: SignupForm, at: string): SignupError | 'INVALID' | null {
    const e = this.common(f);
    if (e) return e;
    const agency = this.groupCodes[normalizeGroupCode(f.group_code)];
    if (!agency) return 'GROUP_CODE_INVALID';
    this.create(f, [], 'officer');
    this.officerRequest.set({ agency: agency.name, contact: agency.contact, at });
    return null;
  }

  /** POST /auth/signup/agency → รอแอดมิน (L02) */
  signupAgency(f: SignupForm, at: string): SignupError | 'INVALID' | null {
    const contact = f.contact.trim();
    const e = this.common(f) ?? (f.agency_name.trim() && contact.length >= 3 && contact.length <= 200 ? null : 'INVALID');
    if (e) return e;
    this.create(f, [], 'agency');
    this.agencyRequest.set({ name: f.agency_name.trim(), type: f.agency_type, contact, at });
    return null;
  }

  // ── เพิ่มบทบาทให้บัญชีที่มีอยู่ (api.md §2) ──

  /** POST /me/roles/owner { house_no, terms_version } → ผูกตู้ต่อ (A07) · ได้แพ็กฟรี */
  addOwnerRole(roles: DemoAccountRole[], f: SignupForm): AddRoleError | null {
    if (roles.includes('admin')) return 'ADMIN_ROLE_EXCLUSIVE';
    if (roles.includes('owner')) return 'ROLE_EXISTS';
    if (!f.terms) return 'TERMS_NOT_ACCEPTED';
    if (!f.house_no.trim()) return 'INVALID';
    this.ownerHouse.set(f.house_no.trim());
    return null;
  }

  /** POST /me/agency/join { group_code, terms_version } → รอหัวหน้า (A11) */
  joinAgency(roles: DemoAccountRole[], pending: boolean, f: SignupForm, at: string): AddRoleError | null {
    if (roles.includes('admin')) return 'ADMIN_ROLE_EXCLUSIVE';
    if (roles.includes('officer') || pending) return 'ROLE_EXISTS';
    if (!f.terms) return 'TERMS_NOT_ACCEPTED';
    const agency = this.groupCodes[normalizeGroupCode(f.group_code)];
    if (!agency) return 'GROUP_CODE_INVALID';
    this.officerRequest.set({ agency: agency.name, contact: agency.contact, at });
    return null;
  }

  // ── ผูกตู้ ──

  /** QR เปิดใช้ตู้ (ลิงก์ /a/<16 ตัว> หรือรหัสใต้ QR) → ตู้ · ใช้ได้ครั้งเดียว */
  private readonly activation = [
    { token: 'A7K2M9QX4T8P3W6R', code: 'K7M2QX9A', box_id: 'BX-00071', owned: false, used: false },
    { token: 'B3N8V2C6X9Z4L7Q1', code: 'P4R7T2W9', box_id: 'BX-00042', owned: true, used: false },
  ];
  readonly activatedBox = signal<string | null>(null);

  /** POST /boxes/activate { qr_text } หรือ { code } — ผูกสำเร็จแล้วรหัสนี้ใช้ไม่ได้อีก */
  activate(by: { token?: string; code?: string }): { ok: true; box_id: string } | { ok: false; code: ActivateError } {
    const a = this.activation.find((x) => (by.token ? x.token === by.token : x.code === normalizeGroupCode(by.code ?? '')));
    if (!a || a.used) return { ok: false, code: 'QR_INVALID' };
    if (a.owned) return { ok: false, code: 'BOX_ALREADY_OWNED' };
    a.used = true;
    this.activatedBox.set(a.box_id);
    return { ok: true, box_id: a.box_id };
  }
}

/** 0812345678 → 081-234-5678 (แสดงผลเท่านั้น) */
export const formatPhone = (p: string) => (/^0\d{9}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);
