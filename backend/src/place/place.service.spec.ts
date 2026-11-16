import { describe, expect, it } from 'vitest';
import { normPlace, PlaceService } from './place.service.js';

/** ตารางพื้นที่จำลองเล็ก ๆ — ไม่ต้องใช้ฐานข้อมูล (PlaceService อ่านผ่าน pool.query 3 ครั้งแล้วจำไว้) */
const fakePool = {
  query: async (sql: string) => {
    if (sql.includes('app.province_tb')) return { rows: [{ province_id: 1, name_th: 'กรุงเทพมหานคร' }, { province_id: 50, name_th: 'เชียงใหม่' }] };
    if (sql.includes('app.district_tb')) {
      return {
        rows: [
          { district_id: 1020, province_id: 1, name_th: 'บางนา', prefix_th: 'เขต' },
          { district_id: 5001, province_id: 50, name_th: 'เมืองเชียงใหม่', prefix_th: 'อำเภอ' },
        ],
      };
    }
    return {
      rows: [
        { subdistrict_id: 102001, district_id: 1020, name_th: 'บางนาเหนือ', prefix_th: 'แขวง', zip_code: '10260' },
        { subdistrict_id: 102002, district_id: 1020, name_th: 'บางนาใต้', prefix_th: 'แขวง', zip_code: '10260' },
      ],
    };
  },
};
const place = new PlaceService(fakePool as never);

describe('normPlace', () => {
  it('ตัดคำนำหน้า/ช่องว่าง และแปลงชื่อย่อกรุงเทพ', () => {
    expect(normPlace(' แขวงบางนาเหนือ ')).toBe('บางนาเหนือ');
    expect(normPlace('จ. เชียงใหม่')).toBe('เชียงใหม่');
    expect(normPlace('กทม')).toBe('กรุงเทพมหานคร');
    expect(normPlace(undefined)).toBe('');
  });
});

describe('PlaceService.resolve', () => {
  it('ว่างทั้งหมด = ไม่ตั้ง', async () => {
    expect(await place.resolve({ province: '', district: '  ' })).toEqual({ province: null, district: null, subdistrict: null, postal_code: null });
  });

  it('ชื่อมีคำนำหน้า/ตัวย่อ → คืนชื่อมาตรฐาน + รหัสไปรษณีย์', async () => {
    expect(await place.resolve({ province: 'กทม.', district: 'เขตบางนา', subdistrict: 'แขวงบางนาเหนือ' })).toEqual({
      province: 'กรุงเทพมหานคร',
      district: 'บางนา',
      subdistrict: 'บางนาเหนือ',
      postal_code: '10260',
    });
  });

  it('เลือกถึงเขต/อำเภอ (ไม่เลือกแขวง) ได้', async () => {
    expect(await place.resolve({ province: 'เชียงใหม่', district: 'เมืองเชียงใหม่' })).toMatchObject({ subdistrict: null, postal_code: null });
  });

  it('พื้นที่ไม่ตรงตาราง / ไม่อยู่ใต้กัน / ข้ามชั้น → 400 PLACE_INVALID', async () => {
    const code = async (i: object) => place.resolve(i).then(() => 'ok', (e) => (e as { code?: string; response?: { code?: string } }).code ?? (e as { response?: { code?: string } }).response?.code ?? 'error');
    expect(await code({ province: 'ไม่มีจังหวัดนี้' })).toBe('PLACE_INVALID');
    expect(await code({ province: 'เชียงใหม่', district: 'บางนา' })).toBe('PLACE_INVALID'); // เขตอยู่คนละจังหวัด
    expect(await code({ province: 'กรุงเทพมหานคร', district: 'บางนา', subdistrict: 'พิมพ์เอง' })).toBe('PLACE_INVALID');
    expect(await code({ district: 'บางนา' })).toBe('PLACE_INVALID'); // มีเขตแต่ไม่มีจังหวัด
    expect(await code({ province: 'กรุงเทพมหานคร', subdistrict: 'บางนาเหนือ' })).toBe('PLACE_INVALID'); // มีแขวงแต่ไม่มีเขต
  });

  it('isStandard: ต้องตรงชื่อมาตรฐานครบ 3 ชั้น (ชื่อมีคำนำหน้าไม่นับ)', async () => {
    expect(await place.isStandard('กรุงเทพมหานคร', 'บางนา', 'บางนาเหนือ')).toBe(true);
    expect(await place.isStandard('กรุงเทพมหานคร', 'บางนา', 'แขวงบางนาเหนือ')).toBe(false);
    expect(await place.isStandard('กรุงเทพมหานคร', 'บางนา', null)).toBe(false);
  });

  it('รายการ dropdown: เขตของจังหวัดที่ไม่มี → 404', async () => {
    expect((await place.districts(1)).map((d) => d.name)).toEqual(['บางนา']);
    await expect(place.districts(999)).rejects.toMatchObject({ status: 404 });
  });
});
