import type * as Leaflet from 'leaflet';

/**
 * ชั้นแผนที่พื้นฐาน: OpenStreetMap เป็นหลัก และสลับไป CARTO อัตโนมัติเมื่อโหลด tile ไม่ได้
 * (บางเครือข่าย/ตัวกลางบล็อกหรือตอบ 504 จาก tile.openstreetmap.org — แผนที่เคยขึ้นช่องว่าง)
 * ต้องอนุญาตทั้งสองโดเมนใน CSP `img-src`/`connect-src`
 */
export function addBaseTiles(L: typeof Leaflet, map: Leaflet.Map): Leaflet.TileLayer {
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  let fellBack = false;
  osm.on('tileerror', () => {
    if (fellBack) return;
    fellBack = true;
    osm.remove();
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
  });
  return osm;
}
