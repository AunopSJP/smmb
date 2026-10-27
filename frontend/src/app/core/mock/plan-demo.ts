import { computed, Injectable, signal } from '@angular/core';
import type { Tr } from '../i18n';

// แพ็กเกจของเจ้าของบ้าน — design §17 · api.md §4.5, §9.7 (ใช้ร่วมกันระหว่างหน้าเจ้าของบ้านกับหน้าแอดมิน)
// ผูกกับบัญชีเจ้าของบ้าน · ไม่มีการชำระเงิน · แอดมินเปลี่ยน = ปิดแถวเดิม + เพิ่มแถวใหม่ (เก็บประวัติ ไม่ทับ)
// SOS และการตรวจตู้ไม่ขึ้นกับแพ็กเกจเสมอ

export interface DemoPlan {
  code: string;
  name: Tr;
  price_note: Tr | null;
  /** ❓ ยังไม่ได้กำหนดว่าแต่ละแพ็กต่างกันตรงไหน (design §17 ข้อ 7) */
  features: Record<string, number | boolean>;
  is_default: boolean;
  is_active: boolean;
}

export interface UserPlanRow {
  user_id: string;
  plan_code: string;
  /** YYYY-MM-DD (ตอนต่อ API เป็น ISO timestamp) */
  starts_at: string;
  ends_at: string | null;
  note?: string;
  by: Tr;
}

export type PlanStatus = 'active' | 'expiring' | 'expired' | 'none';

export type PlanError = 'PLAN_INACTIVE' | 'NOT_OWNER' | 'CODE_TAKEN' | 'CODE_INVALID' | 'NAME_REQUIRED' | 'BAD_END';

/** วันที่แบบไทย ปี ค.ศ. ให้ตรงกับข้อมูลจำลองอื่น */
export function showDate(iso: string, lang: 'th' | 'en'): string {
  const d = new Date(`${iso}T00:00:00+07:00`);
  return d.toLocaleDateString(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
}

const SYSTEM: Tr = { th: 'ระบบ (ตอนสมัคร)', en: 'System (at sign-up)' };

@Injectable({ providedIn: 'root' })
export class PlanDemo {
  /** วันนี้ (YYYY-MM-DD เวลาไทย) — เทสต์เปลี่ยนได้ */
  today: () => string = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  readonly plans = signal<DemoPlan[]>([
    { code: 'free', name: { th: 'ฟรี', en: 'Free' }, price_note: null, features: {}, is_default: true, is_active: true },
  ]);

  readonly rows = signal<UserPlanRow[]>([
    { user_id: 'U-0001', plan_code: 'free', starts_at: '2026-10-12', ends_at: null, by: SYSTEM },
    { user_id: 'U-0092', plan_code: 'free', starts_at: '2026-09-25', ends_at: null, by: SYSTEM },
    { user_id: 'U-0002', plan_code: 'free', starts_at: '2025-12-02', ends_at: null, by: SYSTEM },
    { user_id: 'U-0003', plan_code: 'free', starts_at: '2026-04-03', ends_at: null, by: SYSTEM },
    { user_id: 'U-0004', plan_code: 'free', starts_at: '2026-08-20', ends_at: null, by: SYSTEM },
  ]);

  readonly activePlans = computed(() => this.plans().filter((p) => p.is_active));

  plan(code: string | undefined): DemoPlan | undefined {
    return this.plans().find((p) => p.code === code);
  }

  /** แพ็กปัจจุบัน = แถวที่ starts_at <= วันนี้ < ends_at (หรือไม่มีวันจบ) — server คำนวณทุกครั้ง */
  current(userId: string): UserPlanRow | undefined {
    const t = this.today();
    return this.rows().find((r) => r.user_id === userId && r.starts_at <= t && (r.ends_at === null || t < r.ends_at));
  }

  /** active / expiring (เหลือ ≤ 7 วัน) / expired / none */
  status(userId: string): PlanStatus {
    const cur = this.current(userId);
    if (!cur) return this.rows().some((r) => r.user_id === userId) ? 'expired' : 'none';
    if (!cur.ends_at) return 'active';
    const days = (Date.parse(cur.ends_at) - Date.parse(this.today())) / 86_400_000;
    return days <= 7 ? 'expiring' : 'active';
  }

  /** ประวัติใหม่ → เก่า (GET /admin/users/:id/plans) */
  history(userId: string): UserPlanRow[] {
    return this.rows()
      .filter((r) => r.user_id === userId)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }

  ownersCount(code: string): number {
    const users = new Set(this.rows().map((r) => r.user_id));
    return [...users].filter((u) => this.current(u)?.plan_code === code).length;
  }

  /**
   * PUT /admin/users/:id/plan — ปิดแถวเดิมวันนี้ + เพิ่มแถวใหม่เริ่มวันนี้ (ใน transaction เดียวของจริง)
   * `isOwner` = บัญชีนั้นเป็นเจ้าของบ้าน (ไม่ใช่ → 400)
   */
  setPlan(userId: string, isOwner: boolean, code: string, endsAt: string | null, note: string, by: Tr): PlanError | null {
    if (!isOwner) return 'NOT_OWNER';
    const plan = this.plan(code);
    if (!plan?.is_active) return 'PLAN_INACTIVE';
    const t = this.today();
    if (endsAt && endsAt <= t) return 'BAD_END';
    const cur = this.current(userId);
    this.rows.update((rows) => [
      ...rows.map((r) => (r === cur ? { ...r, ends_at: t } : r)),
      { user_id: userId, plan_code: code, starts_at: t, ends_at: endsAt, note: note.trim() || undefined, by },
    ]);
    return null;
  }

  /** POST /admin/plans — code แก้ทีหลังไม่ได้ */
  addPlan(code: string, name: Tr, priceNote: Tr | null): PlanError | null {
    const c = code.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(c)) return 'CODE_INVALID';
    if (this.plan(c)) return 'CODE_TAKEN';
    if (!name.th.trim() || !name.en.trim()) return 'NAME_REQUIRED';
    this.plans.update((ps) => [...ps, { code: c, name: { th: name.th.trim(), en: name.en.trim() }, price_note: priceNote, features: {}, is_default: false, is_active: true }]);
    return null;
  }

  /** ตั้งแพ็กเริ่มต้นใหม่ = อันเก่าถูกปลดเอง (คนเดิมไม่เปลี่ยน มีผลกับคนสมัครใหม่) */
  setDefault(code: string): void {
    if (!this.plan(code)?.is_active) return;
    this.plans.update((ps) => ps.map((p) => ({ ...p, is_default: p.code === code })));
  }

  /** ปิด = เลือกให้คนใหม่ไม่ได้ คนเดิมใช้ต่อ · แพ็กเริ่มต้นปิดไม่ได้ (ไม่งั้นคนสมัครใหม่ไม่มีแพ็ก) */
  setActive(code: string, active: boolean): void {
    if (!active && this.plan(code)?.is_default) return;
    this.plans.update((ps) => ps.map((p) => (p.code === code ? { ...p, is_active: active } : p)));
  }
}
