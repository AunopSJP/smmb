import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

/**
 * proxy tile แผนที่ผ่านโดเมนของเรา — เบราว์เซอร์ผู้ใช้บางเครือข่ายถูกพร็อกซี/ไฟร์วอลล์บล็อก
 * โดเมนภายนอก (tile.openstreetmap.org / cartocdn.com ตอบ 504) ทำให้แผนที่ขึ้นช่องว่าง
 *
 * - เรียกจาก server (ที่มีเน็ตออกได้) แล้ว cache ในหน่วยความจำ → ไม่ยิงผู้ให้บริการทุกครั้ง
 * - ลอง OpenStreetMap ก่อน แล้ว fallback ไป CARTO
 * - ต้องระบุ User-Agent ตามข้อกำหนดของผู้ให้บริการ และคง attribution ในแผนที่ฝั่งเว็บ
 */
@Injectable()
export class MapTilesService {
  /** cache หน่วยความจำกลาง (tile ~15–30 KB) — พอสำหรับหมู่บ้าน/หลายบ้าน ไม่กิน RAM มาก */
  private readonly cache = new Map<string, { buf: Buffer; type: string }>();
  private readonly maxEntries = 800;

  async tile(z: number, x: number, y: number): Promise<{ buf: Buffer; type: string }> {
    const limit = 2 ** z;
    if (!Number.isInteger(z) || z < 0 || z > 19) throw new BadRequestException('invalid zoom');
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= limit || y >= limit) {
      throw new BadRequestException('invalid tile coordinates');
    }

    const key = `${z}/${x}/${y}`;
    const hit = this.cache.get(key);
    if (hit) {
      // LRU แบบง่าย: ย้ายไปท้ายสุดเมื่อถูกใช้
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }

    const urls = [
      `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      // subdomain ตามตำแหน่งเพื่อกระจายโหลด
      `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            'user-agent': 'SMMB/1.0 (+https://hub.sjp-dev.net; smart mailbox tile proxy)',
            accept: 'image/png,image/*;q=0.8',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const type = res.headers.get('content-type') ?? 'image/png';
        if (!type.startsWith('image/')) continue;
        const entry = { buf: Buffer.from(await res.arrayBuffer()), type };
        this.cache.set(key, entry);
        if (this.cache.size > this.maxEntries) {
          const oldest = this.cache.keys().next().value;
          if (oldest !== undefined) this.cache.delete(oldest);
        }
        return entry;
      } catch {
        // ลองผู้ให้บริการถัดไป
      }
    }
    throw new NotFoundException('tile unavailable');
  }
}
