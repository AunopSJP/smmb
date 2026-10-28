import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** api.md §6.2 */
export interface Inspection {
  id: string;
  job_id: string;
  box: { id: string; house_no: string; name: string };
  qr_slot: 1 | 2;
  method: 'scan' | 'code';
  status: 'waking' | 'ready' | 'passed' | 'failed' | 'expired' | 'box_problem';
  attempt: number;
  attempts_max: number;
  attempts_left: number;
  expires_at: string;
  ask_qr_condition: boolean;
  checked_at: string | null;
}

/** api.md §6.1 */
export interface OfficerSummary {
  in_window: boolean;
  window: { zone_id: string; zone_name: string; start: string; end: string } | null;
  houses_total: number;
  houses_checked: number;
  next_house: { box_id: string; house_no: string; box_name: string } | null;
  houses: { box_id: string; house_no: string; box_name: string; checked_at: string | null }[];
  open_sos: import('./owner-api').SosCard[];
}

export type QrCondition = 'faded' | 'torn' | 'missing' | 'covered' | 'ok';
/** ตู้ไม่มีไฟสถานะ ใช้เสียง Buzzer (2026-10-28): ไม่มีเสียงเลย / มีเสียงแต่ไม่สแกน / สแกนไม่ผ่าน 3 ครั้ง / ตู้เสียหาย */
export type ProblemReason = 'no_response' | 'no_scan' | 'scan_failed_3' | 'damaged' | 'other';

/** ตรวจตู้ (api.md §6) — error โยนต่อให้หน้าเรียก apiError() แล้วดู code */
@Injectable({ providedIn: 'root' })
export class InspectionApi {
  private readonly http = inject(HttpClient);

  summary(): Promise<OfficerSummary> {
    return firstValueFrom(this.http.get<OfficerSummary>('/api/v1/officer/summary'));
  }

  start(body: { qr_text: string; scan_ms: number } | { code: string }): Promise<Inspection> {
    return firstValueFrom(this.http.post<Inspection>('/api/v1/inspections', body));
  }

  get(id: string): Promise<Inspection> {
    return firstValueFrom(this.http.get<Inspection>(`/api/v1/inspections/${encodeURIComponent(id)}`));
  }

  badge(id: string): Promise<{ qr: string; expires_at: string }> {
    return firstValueFrom(this.http.get<{ qr: string; expires_at: string }>(`/api/v1/inspections/${encodeURIComponent(id)}/badge`));
  }

  qrCondition(id: string, condition: QrCondition): Promise<Inspection> {
    return firstValueFrom(this.http.post<Inspection>(`/api/v1/inspections/${encodeURIComponent(id)}/qr-condition`, { condition }));
  }

  problem(id: string, reason: ProblemReason, note?: string): Promise<Inspection> {
    return firstValueFrom(this.http.post<Inspection>(`/api/v1/inspections/${encodeURIComponent(id)}/box-problem`, { reason, note }));
  }
}

/** เวลาไทย HH:mm */
export const hhmm = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '';
