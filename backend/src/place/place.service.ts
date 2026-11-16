import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { AppError } from '../common/http-exception.filter.js';
import { PG_POOL } from '../db/db.module.js';

export interface PlaceProvince { id: number; name: string }
export interface PlaceDistrict { id: number; name: string; prefix: string }
export interface PlaceSubdistrict { id: number; name: string; prefix: string; zip: string | null }

/** ชื่อพื้นที่มาตรฐานหลังตรวจกับตารางกลาง (ไม่ระบุ = null) */
export interface ResolvedPlace {
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  /** รหัสไปรษณีย์ของแขวง/ตำบลที่เลือก (null = ไม่ได้เลือกแขวง หรือไม่มีข้อมูล) */
  postal_code: string | null;
}

/** เทียบชื่อแบบเดียวกับ app.norm_place ในฐานข้อมูล: ไม่สนคำนำหน้า/ช่องว่าง/ตัวพิมพ์ */
export function normPlace(t: unknown): string {
  const s = typeof t === 'string' ? t.trim().toLowerCase() : '';
  const n = s.replace(/^(จังหวัด|จ\.|อำเภอ|อ\.|เขต|ตำบล|ต\.|แขวง)\s*/, '');
  return ['กรุงเทพ', 'กรุงเทพฯ', 'กทม', 'กทม.', 'bangkok'].includes(n) ? 'กรุงเทพมหานคร' : n;
}

interface PlaceCache {
  provinces: PlaceProvince[];
  districts: Map<number, PlaceDistrict[]>;
  subdistricts: Map<number, PlaceSubdistrict[]>;
}

/**
 * ตารางพื้นที่กลาง จังหวัด → เขต/อำเภอ → แขวง/ตำบล (migration 0042)
 * ข้อมูลคงที่ (~8,000 แถว) → โหลดครั้งเดียวเก็บในหน่วยความจำ · ที่อยู่ทุกจุดต้องผ่าน resolve() ก่อนบันทึก
 */
@Injectable()
export class PlaceService {
  private cache: Promise<PlaceCache> | null = null;

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  private load(): Promise<PlaceCache> {
    this.cache ??= this.fetchAll().catch((e) => {
      this.cache = null; // โหลดพลาด (เช่น DB ล่มชั่วคราว) → ลองใหม่คำขอหน้า
      throw e;
    });
    return this.cache;
  }

  private async fetchAll(): Promise<PlaceCache> {
    const p = await this.pool.query<{ province_id: number; name_th: string }>(`SELECT province_id, name_th FROM app.province_tb ORDER BY name_th COLLATE "C"`);
    const d = await this.pool.query<{ district_id: number; province_id: number; name_th: string; prefix_th: string }>(
      `SELECT district_id, province_id, name_th, prefix_th FROM app.district_tb ORDER BY name_th COLLATE "C"`,
    );
    const s = await this.pool.query<{ subdistrict_id: number; district_id: number; name_th: string; prefix_th: string; zip_code: string | null }>(
      `SELECT subdistrict_id, district_id, name_th, prefix_th, zip_code FROM app.subdistrict_tb ORDER BY name_th COLLATE "C"`,
    );
    const districts = new Map<number, PlaceDistrict[]>();
    for (const r of d.rows) {
      const list = districts.get(r.province_id) ?? [];
      list.push({ id: r.district_id, name: r.name_th, prefix: r.prefix_th });
      districts.set(r.province_id, list);
    }
    const subdistricts = new Map<number, PlaceSubdistrict[]>();
    for (const r of s.rows) {
      const list = subdistricts.get(r.district_id) ?? [];
      list.push({ id: r.subdistrict_id, name: r.name_th, prefix: r.prefix_th, zip: r.zip_code });
      subdistricts.set(r.district_id, list);
    }
    return { provinces: p.rows.map((r) => ({ id: r.province_id, name: r.name_th })), districts, subdistricts };
  }

  async provinces(): Promise<PlaceProvince[]> {
    return (await this.load()).provinces;
  }

  /** ไม่พบจังหวัด → 404 */
  async districts(provinceId: number): Promise<PlaceDistrict[]> {
    const c = await this.load();
    if (!c.provinces.some((p) => p.id === provinceId)) throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'province not found');
    return c.districts.get(provinceId) ?? [];
  }

  /** ไม่พบเขต/อำเภอ → 404 */
  async subdistricts(districtId: number): Promise<PlaceSubdistrict[]> {
    const c = await this.load();
    const found = [...c.districts.values()].some((l) => l.some((d) => d.id === districtId));
    if (!found) throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'district not found');
    return c.subdistricts.get(districtId) ?? [];
  }

  /**
   * ตรวจ + แปลงที่อยู่เป็นชื่อมาตรฐาน · ว่างทั้งหมด = ไม่ตั้ง (null ทั้งสามช่อง)
   * ลำดับต้องครบชั้น: เขต/อำเภอต้องมีจังหวัด · แขวง/ตำบลต้องมีเขต/อำเภอ · และต้องอยู่ใต้กันจริง
   * ไม่ตรงตาราง → 400 PLACE_INVALID (client ตัดสินจาก code)
   */
  async resolve(input: { province?: string | null; district?: string | null; subdistrict?: string | null }): Promise<ResolvedPlace> {
    const empty = (v: unknown) => typeof v !== 'string' || !v.trim();
    if (empty(input.province) && empty(input.district) && empty(input.subdistrict)) {
      return { province: null, district: null, subdistrict: null, postal_code: null };
    }
    const bad = (msg: string) => new AppError(HttpStatus.BAD_REQUEST, 'PLACE_INVALID', msg);
    const c = await this.load();
    if (empty(input.province)) throw bad('province is required with district/subdistrict');
    const prov = c.provinces.find((p) => normPlace(p.name) === normPlace(input.province));
    if (!prov) throw bad('unknown province');
    if (empty(input.district)) {
      if (!empty(input.subdistrict)) throw bad('district is required with subdistrict');
      return { province: prov.name, district: null, subdistrict: null, postal_code: null };
    }
    const dist = (c.districts.get(prov.id) ?? []).find((d) => normPlace(d.name) === normPlace(input.district));
    if (!dist) throw bad('unknown district for this province');
    if (empty(input.subdistrict)) return { province: prov.name, district: dist.name, subdistrict: null, postal_code: null };
    const sub = (c.subdistricts.get(dist.id) ?? []).find((s) => normPlace(s.name) === normPlace(input.subdistrict));
    if (!sub) throw bad('unknown subdistrict for this district');
    return { province: prov.name, district: dist.name, subdistrict: sub.name, postal_code: sub.zip };
  }

  /** ตรวจว่าที่อยู่ที่เก็บไว้ (ข้อความ) ตรงมาตรฐานครบ 3 ชั้นไหม — บ้านเก่าที่พิมพ์เองจะไม่ผ่าน */
  async isStandard(province: string | null, district: string | null, subdistrict: string | null): Promise<boolean> {
    if (!province || !district || !subdistrict) return false;
    try {
      const r = await this.resolve({ province, district, subdistrict });
      return r.province === province && r.district === district && r.subdistrict === subdistrict;
    } catch {
      return false;
    }
  }
}
