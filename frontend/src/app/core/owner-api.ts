import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type BoxStatus = 'online' | 'offline' | 'sleeping' | 'service_closed' | 'unbound';
export type SosStage = 'zone' | 'agency' | 'call_yourself';
export type SosStatus = 'open' | 'accepted' | 'closed' | 'cancelled';

export interface BoxSummary {
  id: string;
  name: string;
  house_no: string;
  status: BoxStatus;
}

export interface BoxEvent {
  id: string;
  type: 'inspected' | 'delivered';
  at: string;
  officer?: { agency_type: string; agency_name: string; display_name: string };
  qr_slot?: 1 | 2;
  method?: 'scan' | 'code';
}

/** api.md §4.2 (ฉบับย่อ) */
export interface BoxDetail extends BoxSummary {
  battery: { pct: number; charging: boolean | null; reported_at: string | null } | null;
  last_seen_at: string | null;
  coverage: { has_officer: boolean; agency_names: string[] };
  patrol: { in_window: boolean; windows: [string, string][]; tz: string };
  latest_events: BoxEvent[];
  open_sos: { id: string; stage: SosStage; status: SosStatus } | null;
}

/** api.md §7.1 */
export interface Sos {
  id: string;
  box: { id: string; house_no: string };
  status: SosStatus;
  stage: SosStage;
  created_at: string;
  stage_changed_at: string;
  accepted_by: { display_name: string; agency_name: string; phone: string | null; at: string } | null;
  close_note: string | null;
}

/** api.md §7.2 */
export interface SosCard {
  id: string;
  status: SosStatus;
  stage: SosStage;
  created_at: string;
  house_no: string;
  owner: { name: string; phone: string } | null;
  accepted_by: { display_name: string; agency_name: string } | null;
  mine: boolean;
}

/** ตู้ของเจ้าของบ้าน + SOS (api.md §4, §7) */
@Injectable({ providedIn: 'root' })
export class OwnerApi {
  private readonly http = inject(HttpClient);

  boxes(): Promise<BoxSummary[]> {
    return firstValueFrom(this.http.get<BoxSummary[]>('/api/v1/boxes'));
  }
  box(id: string): Promise<BoxDetail> {
    return firstValueFrom(this.http.get<BoxDetail>(`/api/v1/boxes/${encodeURIComponent(id)}`));
  }
  rename(id: string, name: string): Promise<unknown> {
    return firstValueFrom(this.http.patch('/api/v1/boxes/' + encodeURIComponent(id), { name }));
  }
  events(id: string, page = 1): Promise<{ data: BoxEvent[]; page: number; per_page: number }> {
    return firstValueFrom(this.http.get<{ data: BoxEvent[]; page: number; per_page: number }>(`/api/v1/boxes/${encodeURIComponent(id)}/events?page=${page}`));
  }
  /** 201 Sos · 200 { code: SOS_NO_COVERAGE } · 409 SOS_ALREADY_OPEN (body.sos) */
  startSos(boxId: string): Promise<Sos | { code: 'SOS_NO_COVERAGE'; call: string[] }> {
    return firstValueFrom(this.http.post<Sos | { code: 'SOS_NO_COVERAGE'; call: string[] }>('/api/v1/sos', { box_id: boxId }));
  }
  sos(id: string): Promise<Sos> {
    return firstValueFrom(this.http.get<Sos>(`/api/v1/sos/${encodeURIComponent(id)}`));
  }
  cancelSos(id: string, reason: 'safe' | 'mistake'): Promise<Sos> {
    return firstValueFrom(this.http.post<Sos>(`/api/v1/sos/${encodeURIComponent(id)}/cancel`, { reason }));
  }
}

/** SOS ฝั่งเจ้าหน้าที่ (api.md §7.2) */
@Injectable({ providedIn: 'root' })
export class OfficerSosApi {
  private readonly http = inject(HttpClient);

  list(status: 'open' | 'mine' | 'closed'): Promise<SosCard[]> {
    return firstValueFrom(this.http.get<SosCard[]>(`/api/v1/sos?status=${status}`));
  }
  card(id: string): Promise<SosCard> {
    return firstValueFrom(this.http.get<SosCard>(`/api/v1/sos/${encodeURIComponent(id)}/card`));
  }
  accept(id: string): Promise<SosCard> {
    return firstValueFrom(this.http.post<SosCard>(`/api/v1/sos/${encodeURIComponent(id)}/accept`, {}));
  }
  close(id: string, note: string): Promise<SosCard> {
    return firstValueFrom(this.http.post<SosCard>(`/api/v1/sos/${encodeURIComponent(id)}/close`, { note }));
  }
}

/** วินาทีตั้งแต่ iso */
export const secondsSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
export const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
/** "5 นาทีที่แล้ว" แบบสั้น (นาที) */
export const minutesAgo = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null);
