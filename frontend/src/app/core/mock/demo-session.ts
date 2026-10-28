import { Injectable, signal } from '@angular/core';

export type DemoRole = 'owner' | 'officer' | 'head' | 'admin';

/** บัญชีตั้งต้นเมื่อเข้าจากหน้าเลือกบทบาท — ให้ตรงกับ seed ของ backend/scripts/dev-mock.mjs */
export const DEFAULT_ACCOUNT: Record<DemoRole, { roles: DemoRole[]; phone: string }> = {
  owner: { roles: ['owner'], phone: '0812345678' },
  officer: { roles: ['officer'], phone: '0834567890' },
  head: { roles: ['officer', 'head'], phone: '0823456789' },
  admin: { roles: ['admin'], phone: '0800000001' },
};

/**
 * บทบาทที่เลือกในเว็บ — ข้อมูลยืนยันตัวตนจริงมาจาก `Session` และ backend
 */
@Injectable({ providedIn: 'root' })
export class DemoSession {
  /** หน้าที่กำลังใช้อยู่ (ไม่มี "โหมดปัจจุบัน" ใน session จริง — เว็บเลือกเอง) */
  readonly role = signal<DemoRole>('owner');
  /** บทบาททั้งหมดของบัญชี = Me.roles (หลายบทบาทได้ · head มาพร้อม officer · admin อยู่คนเดียว) */
  readonly roles = signal<DemoRole[]>(['owner']);
  readonly phone = signal('0812345678');
  /** ส่งคำขอเข้าหน่วยงานแล้ว รอหัวหน้า = Me.agency_status 'pending' */
  readonly agencyPending = signal(false);

  /** เข้าแบบบัญชีตั้งต้นของบทบาทนั้น (หน้าเลือกบทบาท) */
  useDefault(role: DemoRole): void {
    const a = DEFAULT_ACCOUNT[role];
    this.signIn(role, a.roles, a.phone);
  }

  signIn(role: DemoRole, roles: DemoRole[], phone: string): void {
    this.role.set(role);
    this.roles.set(roles);
    this.phone.set(phone);
    this.agencyPending.set(false);
  }

  addRole(role: DemoRole): void {
    this.roles.update((r) => (r.includes(role) ? r : [...r, role]));
  }
}
