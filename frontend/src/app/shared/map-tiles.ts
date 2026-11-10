import type * as Leaflet from 'leaflet';

/**
 * ชั้นแผนที่พื้นฐาน — โหลด tile ผ่าน backend ของเรา (`/api/v1/map-tiles/{z}/{x}/{y}`)
 * เพื่อให้เป็น same-origin: บางเครือข่าย/พร็อกซีบล็อกโดเมนแผนที่ภายนอก (504) ทำให้แผนที่ว่าง
 * backend จะลอง OpenStreetMap → CARTO และ cache ให้; ต้องคง attribution ตามข้อกำหนด OSM
 */
export function addBaseTiles(L: typeof Leaflet, map: Leaflet.Map, base: string): Leaflet.TileLayer {
  const root = base.replace(/\/+$/, '');
  return L.tileLayer(`${root}/{z}/{x}/{y}`, {
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
}

