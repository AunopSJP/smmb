import type * as Leaflet from 'leaflet';

/**
 * ชั้นแผนที่พื้นฐาน — โหลด tile ผ่าน backend ของเรา (`/api/v1/map-tiles/{z}/{x}/{y}`)
 * เพื่อให้เป็น same-origin: บางเครือข่าย/พร็อกซีบล็อกโดเมนแผนที่ภายนอก (504) ทำให้แผนที่ว่าง
 * backend จะลอง OpenStreetMap → CARTO และ cache ให้; ต้องคง attribution ตามข้อกำหนด OSM
 */
export function addBaseTiles(L: typeof Leaflet, map: Leaflet.Map, base: string): Leaflet.TileLayer {
  const root = base.replace(/\/+$/, '');
  const layer = L.tileLayer(`${root}/{z}/{x}/{y}`, {
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  // tile ล่ม (backend/เน็ต) → บอกผู้ใช้ + แตะลองใหม่ ไม่ปล่อยเป็นแผนที่เทาเปล่า
  let failed = false;
  let notice: HTMLButtonElement | null = null;
  const showNotice = () => {
    if (failed || !map.getContainer()) return;
    failed = true;
    notice = document.createElement('button');
    notice.type = 'button';
    notice.setAttribute('role', 'status');
    notice.textContent = 'โหลดแผนที่ไม่สำเร็จ · แตะเพื่อลองใหม่ / Map failed · tap to retry';
    notice.style.cssText =
      'position:absolute;z-index:500;inset-inline:12px;bottom:12px;padding:10px 12px;border:0;border-radius:10px;background:var(--qr-bg);color:var(--map-brand-dark);font:inherit;font-weight:700;box-shadow:0 4px 16px rgb(0 0 0 / 25%);cursor:pointer;text-align:center';
    notice.onclick = () => {
      failed = false;
      notice?.remove();
      notice = null;
      layer.redraw();
    };
    map.getContainer().appendChild(notice);
  };
  layer.on('tileerror', showNotice);
  layer.on('load', () => {
    if (notice) {
      notice.remove();
      notice = null;
    }
    failed = false;
  });
  return layer;
}

