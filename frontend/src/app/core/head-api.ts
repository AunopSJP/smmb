import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { BoxStatus } from './owner-api';

// หัวหน้าหน่วยงาน — api.md §8 (ทุก route ทำกับหน่วยงานของตัวเองเท่านั้น)

export type AgencyType = 'police' | 'guard' | 'other';
export type MemberStatus = 'pending' | 'active' | 'disabled';

/** api.md §8.1 */
export interface Agency {
  id: string;
  name: string;
  type: AgencyType;
  status: 'pending' | 'approved' | 'rejected';
  group_code: string | null;
  reject_reason: string | null;
  contact: string | null;
  heads: { id: string; display_name: string }[];
}

/** api.md §8.2 */
export interface Member {
  id: string;
  name: string;
  display_name: string;
  phone: string;
  status: MemberStatus;
  is_head: boolean;
  zones: { id: string; name: string }[];
  joined_at: string;
  last_inspection_at: string | null;
}

/** api.md §8.3 */
export interface Zone {
  id: string;
  name: string;
  windows: [string, string][];
  tz: string;
  houses_count: number;
  officers_count: number;
  is_mine: boolean;
  updated_at: string;
}

export interface ZoneHouse {
  box_id: string;
  house_no: string | null;
  box_name: string | null;
  box_status: BoxStatus;
}

export interface ZoneDetail extends Zone {
  houses: ZoneHouse[];
  officers: Member[];
}

export interface HouseHit {
  box_id: string;
  house_no: string | null;
  box_name: string | null;
  zones: { agency_name: string; zone_name: string }[];
}

export const AGENCY_TYPE_LABEL: Record<AgencyType, { th: string; en: string }> = {
  police: { th: 'ตำรวจ', en: 'Police' },
  guard: { th: 'รปภ.', en: 'Guards' },
  other: { th: 'อื่น ๆ', en: 'Other' },
};

/** แสดงรหัสกลุ่มแบบอ่านง่าย PX7K-2MQ9 (ตอนส่งตัด - ออก) */
export const showGroupCode = (c: string | null) => (c && c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : (c ?? ''));

@Injectable({ providedIn: 'root' })
export class HeadApi {
  private readonly http = inject(HttpClient);
  /** หน่วยงานล่าสุดที่โหลด (หัวหน้าทุกหน้าใช้ชื่อ/รหัสกลุ่มร่วมกัน) */
  readonly agency = signal<Agency | null>(null);

  private get<T>(url: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(url));
  }

  async loadAgency(): Promise<Agency> {
    const a = await this.get<Agency>('/api/v1/agency');
    this.agency.set(a);
    return a;
  }
  async setContact(contact: string): Promise<void> {
    await firstValueFrom(this.http.patch('/api/v1/agency', { contact }));
    await this.loadAgency();
  }
  async rotateCode(): Promise<void> {
    await firstValueFrom(this.http.post('/api/v1/agency/group-code/rotate', {}));
    await this.loadAgency();
  }

  members(status?: MemberStatus): Promise<Member[]> {
    return this.get<Member[]>('/api/v1/agency/members' + (status ? `?status=${status}` : ''));
  }
  approve(id: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/v1/agency/members/${id}/approve`, {}));
  }
  reject(id: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/v1/agency/members/${id}/reject`, {}));
  }
  setActive(id: string, isActive: boolean): Promise<unknown> {
    return firstValueFrom(this.http.patch(`/api/v1/agency/members/${id}/status`, { is_active: isActive }));
  }
  makeHead(id: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/v1/agency/members/${id}/make-head`, {}));
  }
  removeHead(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/v1/agency/members/${id}/head`));
  }
  /** รหัสชั่วคราว แสดงครั้งเดียว */
  resetPassword(id: string): Promise<{ temp_password: string }> {
    return firstValueFrom(this.http.post<{ temp_password: string }>(`/api/v1/agency/members/${id}/reset-password`, {}));
  }

  zones(filter: 'mine' | 'all' = 'all'): Promise<Zone[]> {
    return this.get<Zone[]>(`/api/v1/agency/zones?zone=${filter}`);
  }
  zone(id: string): Promise<ZoneDetail> {
    return this.get<ZoneDetail>(`/api/v1/agency/zones/${encodeURIComponent(id)}`);
  }
  createZone(name: string, windows: [string, string][]): Promise<Zone> {
    return firstValueFrom(this.http.post<Zone>('/api/v1/agency/zones', { name, windows }));
  }
  updateZone(id: string, patch: { name?: string; windows?: [string, string][] }): Promise<Zone> {
    return firstValueFrom(this.http.patch<Zone>(`/api/v1/agency/zones/${encodeURIComponent(id)}`, patch));
  }
  setHouses(id: string, boxIds: string[]): Promise<ZoneHouse[]> {
    return firstValueFrom(this.http.put<ZoneHouse[]>(`/api/v1/agency/zones/${encodeURIComponent(id)}/houses`, { box_ids: boxIds }));
  }
  setOfficers(id: string, userIds: string[]): Promise<Member[]> {
    return firstValueFrom(this.http.put<Member[]>(`/api/v1/agency/zones/${encodeURIComponent(id)}/officers`, { user_ids: userIds }));
  }
  removeZone(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/v1/agency/zones/${encodeURIComponent(id)}`));
  }
  searchHouses(q: string): Promise<HouseHit[]> {
    return this.get<HouseHit[]>(`/api/v1/agency/houses/search?q=${encodeURIComponent(q)}`);
  }
}
