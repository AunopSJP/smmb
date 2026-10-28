import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { BoxStatus } from './owner-api';

// แอดมิน (+ ช่างติดตั้ง ใช้บัญชีแอดมิน) — api.md §9

export type QrSlotName = 1 | 2 | 'activate';

export interface PrintableQr {
  slot: QrSlotName;
  url: string;
  print_code: string;
}

/** POST /admin/boxes — รหัสลับประจำตู้ได้ตอนนี้ (หรือเปิดดูใหม่แบบมีบันทึก) */
export interface RegisteredBox {
  box_id: string;
  device_secret: string;
  qr: PrintableQr[];
}

export interface AdminBoxRow {
  id: string;
  house_no: string | null;
  name: string | null;
  bound: boolean;
  status: BoxStatus;
  battery: { pct: number; charging: boolean | null; reported_at: string | null } | null;
  last_seen_at: string | null;
  last_poll_at: string | null;
  fw: string | null;
}

export interface BoxConfig {
  report_at: string;
  scan_timeout_s: number;
  max_attempts: number;
  flash_when_dark: boolean;
  longpoll_wait_s: number;
  windows?: [string, string][];
}

export interface AdminBoxDetail extends AdminBoxRow {
  service_active: boolean;
  registered_at: string;
  config: { config_ver: number; config: BoxConfig; box_config_ver: number | null; in_sync: boolean };
  qr: (PrintableQr & { id: string; version: number; status: string; health: string; issued_at: string })[];
  reports: { kind: 'boot' | 'report' | 'event'; at: string; body: Record<string, unknown> }[];
  auth_failures: { reason: string; at: string }[];
}

export type JobStatus = 'waiting' | 'delivered' | 'ready' | 'passed' | 'failed' | 'expired';

export interface Job {
  id: string;
  box_id: string;
  type: 'inspect' | 'test';
  status: JobStatus;
  created_at: string;
  expires_at: string;
  delivered_at: string | null;
  ready_at: string | null;
  wake_ms: number | null;
  attempts: { attempt: number; read_ok: boolean; verdict: string; reason: string | null; at: string }[];
}

export interface AdminAgency {
  id: string;
  name: string;
  type: 'police' | 'guard' | 'other';
  status: 'pending' | 'approved' | 'rejected';
  group_code: string | null;
  created_at: string;
  heads: { id: string; display_name: string }[];
}

export interface AdminAgencyDetail extends AdminAgency {
  reject_reason: string | null;
  approved_at: string | null;
  heads_contact: { id: string; name: string; display_name: string; phone: string }[];
  counts: { members_active: number; members_pending: number; zones: number; houses: number };
}

export interface AdminUser {
  id: string;
  name: string;
  display_name: string;
  phone: string;
  status: 'active' | 'disabled';
  roles: { role: 'admin' | 'owner' | 'officer'; level: number; status: 'active' | 'disabled' }[];
  agency: { id: string; name: string; status: string; is_head: boolean } | null;
  created_at: string;
}

export interface Paged<T> {
  data: T[];
  page: number;
  per_page: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  private get<T>(url: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(url));
  }
  private post<T>(url: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(url, body));
  }

  // ตู้ §9.4
  boxes(q = '', page = 1): Promise<Paged<AdminBoxRow>> {
    return this.get(`/api/v1/admin/boxes?per_page=100&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  }
  box(id: string): Promise<AdminBoxDetail> {
    return this.get(`/api/v1/admin/boxes/${encodeURIComponent(id)}`);
  }
  registerBoxes(count: number): Promise<RegisteredBox[]> {
    return this.post('/api/v1/admin/boxes', { count });
  }
  revealSecret(id: string): Promise<{ box_id: string; device_secret: string }> {
    return this.post(`/api/v1/admin/boxes/${encodeURIComponent(id)}/device-secret`);
  }
  startTest(id: string): Promise<Job> {
    return this.post(`/api/v1/admin/boxes/${encodeURIComponent(id)}/test-jobs`);
  }
  testJob(id: string, jobId: string): Promise<Job> {
    return this.get(`/api/v1/admin/boxes/${encodeURIComponent(id)}/test-jobs/${encodeURIComponent(jobId)}`);
  }
  config(): Promise<{ config_ver: number; config: BoxConfig }> {
    return this.get('/api/v1/admin/box-config');
  }
  setConfig(c: BoxConfig): Promise<unknown> {
    return firstValueFrom(this.http.put('/api/v1/admin/box-config', c));
  }

  // หน่วยงาน §9.2
  agencies(status?: 'pending' | 'approved' | 'rejected'): Promise<AdminAgency[]> {
    return this.get(`/api/v1/admin/agencies${status ? `?status=${status}` : ''}`);
  }
  agency(id: string): Promise<AdminAgencyDetail> {
    return this.get(`/api/v1/admin/agencies/${id}`);
  }
  approveAgency(id: string): Promise<unknown> {
    return this.post(`/api/v1/admin/agencies/${id}/approve`);
  }
  rejectAgency(id: string, reason?: string): Promise<unknown> {
    return this.post(`/api/v1/admin/agencies/${id}/reject`, reason ? { reason } : {});
  }

  // ผู้ใช้ §9.3
  users(q = '', role?: string): Promise<Paged<AdminUser>> {
    const p = new URLSearchParams({ per_page: '100' });
    if (q) p.set('q', q);
    if (role) p.set('role', role);
    return this.get(`/api/v1/admin/users?${p}`);
  }
  setUserStatus(id: string, status: 'active' | 'disabled'): Promise<unknown> {
    return firstValueFrom(this.http.patch(`/api/v1/admin/users/${id}`, { status }));
  }
  resetPassword(id: string): Promise<{ temp_password: string }> {
    return this.post(`/api/v1/admin/users/${id}/reset-password`);
  }
}

