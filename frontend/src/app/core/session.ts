import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiError } from './api';
import { PushNotifications } from './push-notifications';
import { DemoSession, type DemoRole } from './mock/demo-session';
import { screenUrl } from '../screens/registry';

/** api.md §3 `Me` (เฉพาะที่หน้าเว็บใช้) */
export interface Me {
  id: string;
  roles: DemoRole[];
  agency_status: 'pending' | 'active' | 'rejected' | 'disabled' | null;
  name: string;
  display_name: string;
  phone: string;
  agency: { id: string; name: string; type: string; is_head: boolean; contact: string | null } | null;
  push: { subscribed: boolean };
  /** การแสดงผลที่เก็บกับบัญชี — `lang` ใช้แปลข้อความแจ้งเตือนจาก server ด้วย */
  prefs: ServerPrefs;
  must_change_password: boolean;
  terms_update_required: boolean;
}

export interface ServerPrefs {
  theme: 'light' | 'dark' | 'system';
  lang: 'th' | 'en';
  text_size: 'normal' | 'large' | 'xlarge';
  simple_home: boolean;
  night_auto_dark: boolean;
}

/** หน้าแรกของแต่ละบทบาท */
export const ROLE_HOME: Record<DemoRole, string> = { owner: '/home', officer: '/officer', head: '/agency', admin: '/admin' };

/**
 * บัญชีที่ล็อกอินอยู่จริง (cookie `sid` · api.md §2–3)
 * ซิงก์ไปที่ DemoSession ด้วย เพื่อให้แท็บล่าง/หน้าที่ยังใช้ข้อมูลจำลองรู้บทบาทเดียวกัน
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly http = inject(HttpClient);
  private readonly demo = inject(DemoSession);
  private readonly push = inject(PushNotifications);
  readonly me = signal<Me | null>(null);
  private loaded: Promise<Me | null> | null = null;

  /** โหลดครั้งเดียวต่อการเปิดแอป (guard เรียก) */
  ensure(): Promise<Me | null> {
    this.loaded ??= this.refresh();
    return this.loaded;
  }

  async refresh(): Promise<Me | null> {
    try {
      const me = await firstValueFrom(this.http.get<Me>('/api/v1/me'));
      this.set(me);
      return me;
    } catch {
      this.set(null);
      return null;
    }
  }

  /** คืน code ของ error ถ้าไม่ผ่าน (INVALID_CREDENTIALS / ACCOUNT_LOCKED / ACCOUNT_DISABLED / …) */
  async signin(phone: string, password: string): Promise<{ ok: true; me: Me } | { ok: false; code: string | null; status: number }> {
    try {
      const res = await firstValueFrom(this.http.post<{ ok: true; data: Me }>('/api/v1/auth/signin', { phone, password }));
      this.set(res.data);
      this.loaded = Promise.resolve(res.data);
      await this.push.syncExisting().catch(() => undefined);
      return { ok: true, me: res.data };
    } catch (err) {
      const e = apiError(err);
      return { ok: false, code: e.code, status: e.status };
    }
  }

  async signout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/v1/auth/signout', {})).catch(() => undefined);
    this.set(null);
    this.loaded = Promise.resolve(null);
  }

  /** เลือกหน้าที่จะใช้ (บัญชีหลายบทบาท) — ไม่มี "โหมด" ที่ server */
  use(role: DemoRole): void {
    const me = this.me();
    if (me) this.demo.signIn(role, me.roles, me.phone);
  }

  private set(me: Me | null): void {
    this.me.set(me);
    if (!me) return;
    const current = this.demo.role();
    const role = me.roles.includes(current) ? current : (me.roles.find((r) => r !== 'officer' || !me.roles.includes('head')) ?? me.roles[0] ?? 'owner');
    this.demo.signIn(role, me.roles, me.phone);
    this.demo.agencyPending.set(me.agency_status === 'pending');
  }
}

/**
 * หน้า core ที่ต้องล็อกอินจริง — ยังไม่ล็อกอิน → หน้าเข้าสู่ระบบ (แล้วกลับมาหน้าเดิม)
 * ไม่มีบทบาทนี้ → หน้าแรกของบทบาทที่มี · ต้องเปลี่ยนรหัส/ยอมรับข้อตกลงก่อน → หน้านั้น
 */
export function requireRole(role: DemoRole): CanActivateFn {
  return async (_route, state) => {
    const session = inject(Session);
    const router = inject(Router);
    const me = await session.ensure();
    if (!me) return router.createUrlTree([screenUrl('A04')], { queryParams: { next: state.url } });
    if (me.must_change_password) return router.createUrlTree([screenUrl('A14')], { queryParams: { forced: 1 } });
    if (me.terms_update_required) return router.createUrlTree([screenUrl('A13')], { queryParams: { update: 1 } });
    const ok = me.roles.includes(role) || (role === 'officer' && me.roles.includes('head'));
    if (!ok) return router.createUrlTree([ROLE_HOME[me.roles[0] ?? 'owner'] ?? screenUrl('A04')]);
    session.use(role === 'officer' && !me.roles.includes('officer') ? 'head' : role);
    return true;
  };
}

/** ต้องล็อกอินเท่านั้น (ยังไม่มีบทบาทก็เข้าได้ เช่น หัวหน้าที่หน่วยงานยังรออนุมัติ L02) */
export const requireSignedIn: CanActivateFn = async (_route, state) => {
  const session = inject(Session);
  const router = inject(Router);
  const me = await session.ensure();
  return me ? true : router.createUrlTree([screenUrl('A04')], { queryParams: { next: state.url } });
};

/** หน้าแรก (/) — ล็อกอินอยู่ → หน้าแรกของบทบาท · ยังไม่ล็อกอิน → เข้าสู่ระบบ */
export const homeRedirect: CanActivateFn = async () => {
  // inject ก่อน await เสมอ (หลัง await ไม่อยู่ใน injection context แล้ว)
  const session = inject(Session);
  const router = inject(Router);
  const me = await session.ensure();
  if (!me) return router.createUrlTree([screenUrl('A04')]);
  const role = me.roles.includes('head') ? 'head' : (me.roles[0] ?? 'owner');
  return router.createUrlTree([ROLE_HOME[role]]);
};
