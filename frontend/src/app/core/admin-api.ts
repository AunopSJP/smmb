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

export interface ReissuedQr extends PrintableQr {
  id: string;
  version: number;
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

export interface AdminOverview {
  boxes: { total: number; online: number; offline: number; sleeping: number; service_closed: number; unbound: number; low_battery: number };
  agencies_pending: number;
  qr_issues: { total: number; by_health: Record<'damaged' | 'suspicious' | 'maybe_fake' | 'expiring', number> };
  sos_open: number;
  technician_requests_open: number;
  owners_by_plan: { plan_code: string; owners_count: number }[];
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
  can_delete: boolean;
  service_active: boolean;
  registered_at: string;
  config: { config_ver: number; config: BoxConfig; box_config_ver: number | null; in_sync: boolean };
  qr: (PrintableQr & { id: string; version: number; status: string; health: string; issued_at: string })[];
  reports: { kind: 'boot' | 'report' | 'event'; at: string; body: Record<string, unknown> }[];
  camera_diagnostics: CameraDiagnostics | null;
  auth_failures: { reason: string; at: string }[];
}

export type AdminLogType = 'inspection' | 'delivery' | 'sos' | 'box_problem' | 'scan' | 'data_access';
export interface AdminLog {
  id: string;
  type: AdminLogType;
  box_id: string | null;
  house_no: string | null;
  actor_name: string | null;
  qr_slot: string | null;
  method: string | null;
  result: string | null;
  details: string | null;
  created_at: string;
  fail: boolean;
}

export interface CameraDiagnostics {
  state: 'started' | 'ready' | 'scan_result' | 'error';
  at: string;
  job_id: string | null;
  width: number | null;
  height: number | null;
  attempt: number | null;
  frames: number | null;
  qr_shapes: number | null;
  read_ok: boolean | null;
  read_ms: number | null;
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

export interface AdminTechnicianRequest {
  id: string;
  box_id: string;
  house_no: string | null;
  owner_name: string;
  owner_phone: string;
  reason: 'wifi_change' | 'repair' | 'other';
  note: string | null;
  status: 'open' | 'scheduled' | 'done';
  created_at: string;
  scheduled_at: string | null;
  admin_note: string | null;
}

export type AdminQrHealth = 'damaged' | 'suspicious' | 'maybe_fake' | 'expiring';
export type AdminQrFix = 'swap' | 'reissue' | 'fake';
export type AdminQrIssueStatus = 'open' | 'owner_notified' | 'owner_confirmed' | 'qr_reissued' | 'technician_dispatched' | 'resolved';
export interface AdminQrIssue {
  id: string;
  box_id: string;
  house_no: string;
  slot: 1 | 2;
  health: AdminQrHealth;
  health_reasons: string[];
  last_scanned_at: string | null;
  backup_used: boolean;
  fix: AdminQrFix | null;
  status: AdminQrIssueStatus;
  step: number;
  resolved: boolean;
  created_at: string;
  updated_at: string;
  delivery_method: 'post' | 'technician' | null;
}

export interface AdminPlan {
  code: string;
  name_th: string;
  name_en: string;
  price_note: string | null;
  features: Record<string, number | boolean>;
  is_default: boolean;
  is_active: boolean;
  owners_count: number;
}

export interface AdminUserPlan {
  id: string;
  user_id: string;
  plan_code: string;
  starts_at: string;
  ends_at: string | null;
  note: string | null;
  set_by: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  overview(): Promise<AdminOverview> {
    return this.get('/api/v1/admin/overview');
  }

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
  resetBoxConfig(id: string): Promise<{ box_id: string; config_ver: number; config: BoxConfig }> {
    return firstValueFrom(this.http.delete<{ box_id: string; config_ver: number; config: BoxConfig }>(`/api/v1/admin/boxes/${encodeURIComponent(id)}/config`));
  }
  reissueQr(id: string, slots: (1 | 2)[], requestId: string): Promise<{ box_id: string; qr: ReissuedQr[] }> {
    return this.post(`/api/v1/admin/boxes/${encodeURIComponent(id)}/qr/reissue`, { slots, request_id: requestId });
  }
  deleteBox(id: string): Promise<{ box_id: string; deleted: true }> {
    return firstValueFrom(this.http.delete<{ box_id: string; deleted: true }>(`/api/v1/admin/boxes/${encodeURIComponent(id)}`));
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
  logs(page = 1): Promise<Paged<AdminLog>> {
    return this.get(`/api/v1/admin/logs?page=${page}&per_page=100`);
  }
  technicianRequests(status?: AdminTechnicianRequest['status']): Promise<AdminTechnicianRequest[]> {
    return this.get(`/api/v1/admin/technician-requests${status ? `?status=${status}` : ''}`);
  }
  updateTechnicianRequest(id: string, input: { status: 'scheduled' | 'done'; scheduled_at?: string; note?: string }): Promise<AdminTechnicianRequest> {
    return firstValueFrom(this.http.patch<AdminTechnicianRequest>(`/api/v1/admin/technician-requests/${encodeURIComponent(id)}`, input));
  }
  qrIssues(health?: AdminQrHealth[]): Promise<AdminQrIssue[]> {
    const query = health?.length ? `?health=${health.join(',')}` : '';
    return this.get(`/api/v1/admin/qr${query}`);
  }
  qrIssue(id: string): Promise<AdminQrIssue> {
    return this.get(`/api/v1/admin/qr/${encodeURIComponent(id)}`);
  }
  chooseQrFix(id: string, fix: AdminQrFix): Promise<AdminQrIssue> {
    return this.post(`/api/v1/admin/qr/${encodeURIComponent(id)}/fix`, { fix });
  }
  requestBackupSwap(id: string): Promise<AdminQrIssue> {
    return this.post(`/api/v1/admin/qr/${encodeURIComponent(id)}/request-backup-swap`);
  }
  recordQrReissue(id: string, slots: (1 | 2)[], deliveryMethod?: 'post' | 'technician'): Promise<AdminQrIssue> {
    return this.post(`/api/v1/admin/qr/${encodeURIComponent(id)}/reissue`, { slots, ...(deliveryMethod ? { delivery_method: deliveryMethod } : {}) });
  }
  dispatchQrTechnician(id: string): Promise<AdminQrIssue> {
    return this.post(`/api/v1/admin/qr/${encodeURIComponent(id)}/dispatch-technician`);
  }
  resolveQrIssue(id: string): Promise<AdminQrIssue> {
    return this.post(`/api/v1/admin/qr/${encodeURIComponent(id)}/resolve`);
  }

  plans(): Promise<AdminPlan[]> {
    return this.get('/api/v1/admin/plans');
  }
  createPlan(input: { code: string; name_th: string; name_en: string; price_note?: string }): Promise<AdminPlan> {
    return this.post('/api/v1/admin/plans', input);
  }
  updatePlan(code: string, input: { is_default?: boolean; is_active?: boolean }): Promise<AdminPlan> {
    return firstValueFrom(this.http.patch<AdminPlan>(`/api/v1/admin/plans/${encodeURIComponent(code)}`, input));
  }
  userPlans(id: string): Promise<AdminUserPlan[]> {
    return this.get(`/api/v1/admin/users/${encodeURIComponent(id)}/plans`);
  }
  setUserPlan(id: string, input: { plan_code: string; ends_at?: string; note?: string }): Promise<AdminUserPlan[]> {
    return firstValueFrom(this.http.put<AdminUserPlan[]>(`/api/v1/admin/users/${encodeURIComponent(id)}/plan`, input));
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

