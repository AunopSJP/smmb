import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** api.md §3.3 — รายการพื้นที่กลาง (จังหวัด → เขต/อำเภอ → แขวง/ตำบล) */
export interface PlaceProvince { id: number; name: string }
export interface PlaceDistrict { id: number; name: string; prefix: string }
export interface PlaceSubdistrict { id: number; name: string; prefix: string; zip: string | null }

/** เทียบชื่อแบบเดียวกับฝั่งเซิร์ฟเวอร์ (app.norm_place): ไม่สนคำนำหน้า/ช่องว่าง/ตัวพิมพ์ */
export function normPlace(t: string | null | undefined): string {
  const n = (t ?? '').trim().toLowerCase().replace(/^(จังหวัด|จ\.|อำเภอ|อ\.|เขต|ตำบล|ต\.|แขวง)\s*/, '');
  return ['กรุงเทพ', 'กรุงเทพฯ', 'กทม', 'กทม.', 'bangkok'].includes(n) ? 'กรุงเทพมหานคร' : n;
}

/** ดึงรายการพื้นที่ (ข้อมูลคงที่ → จำไว้ในหน่วยความจำตลอดการใช้งานแอป) */
@Injectable({ providedIn: 'root' })
export class PlaceApi {
  private readonly http = inject(HttpClient);
  private provinces$: Promise<PlaceProvince[]> | null = null;
  private readonly districts$ = new Map<number, Promise<PlaceDistrict[]>>();
  private readonly subdistricts$ = new Map<number, Promise<PlaceSubdistrict[]>>();

  /** พลาดแล้วไม่จำ → เรียกใหม่ได้ (เช่น เน็ตหลุดชั่วคราว) */
  private remember<T>(cache: Map<number, Promise<T>>, key: number, load: () => Promise<T>): Promise<T> {
    let p = cache.get(key);
    if (!p) {
      p = load().catch((e) => {
        cache.delete(key);
        throw e;
      });
      cache.set(key, p);
    }
    return p;
  }

  provinces(): Promise<PlaceProvince[]> {
    this.provinces$ ??= firstValueFrom(this.http.get<PlaceProvince[]>('/api/v1/places/provinces')).catch((e) => {
      this.provinces$ = null;
      throw e;
    });
    return this.provinces$;
  }

  districts(provinceId: number): Promise<PlaceDistrict[]> {
    return this.remember(this.districts$, provinceId, () => firstValueFrom(this.http.get<PlaceDistrict[]>(`/api/v1/places/provinces/${provinceId}/districts`)));
  }

  subdistricts(districtId: number): Promise<PlaceSubdistrict[]> {
    return this.remember(this.subdistricts$, districtId, () => firstValueFrom(this.http.get<PlaceSubdistrict[]>(`/api/v1/places/districts/${districtId}/subdistricts`)));
  }
}
