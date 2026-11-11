import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, model, signal, viewChild } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { I18n } from '../core/i18n';
import { ApiConfig } from '../core/api';
import { Icon } from './icon';
import { addBaseTiles } from './map-tiles';

export interface LatLng {
  lat: number;
  lng: number;
}

/** กลางกรุงเทพ — ใช้ตอนยังไม่มีหมุด */
const DEFAULT_CENTER: LatLng = { lat: 13.7563, lng: 100.5018 };

/** ปัดเหลือ 6 ตำแหน่ง (~10 ซม.) ตรงกับคอลัมน์ numeric(9,6) */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** ลิงก์นำทาง (เปิดแอปแผนที่ของเครื่อง) */
export const directionsUrl = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

/**
 * แผนที่ OpenStreetMap + หมุดบ้าน (Leaflet โหลดเมื่อใช้ ไม่อยู่ใน bundle แรก)
 * - `editable`: แตะแผนที่เพื่อปักหมุด / ลากหมุด / ปุ่ม "ใช้ตำแหน่งปัจจุบัน" → อัปเดต `value`
 * - แสดงอย่างเดียว: มีปุ่ม "นำทาง"
 */
@Component({
  selector: 'app-map-pin',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map" #host [style.block-size.px]="height()" role="group" [attr.aria-label]="i18n.t({ th: 'แผนที่ตำแหน่งบ้าน', en: 'Map of the house location' })"></div>
    <div class="bar">
      @if (editable()) {
        <button type="button" class="btn secondary small" (click)="locate()" [disabled]="locating()">
          <app-icon name="target" [size]="18" />{{ locating() ? i18n.t({ th: 'กำลังหาตำแหน่ง…', en: 'Locating…' }) : i18n.t({ th: 'ใช้ตำแหน่งปัจจุบัน', en: 'Use my location' }) }}
        </button>
        @if (value()) {
          <button type="button" class="btn secondary small" (click)="value.set(null)">{{ i18n.t({ th: 'ล้างหมุด', en: 'Clear pin' }) }}</button>
        }
      } @else if (value(); as v) {
        <a class="btn small" [href]="directions(v)" target="_blank" rel="noopener">{{ i18n.t({ th: 'นำทาง', en: 'Directions' }) }}</a>
      }
    </div>
    @if (editable()) {
      <p class="muted small">
        @if (geoError()) {
          {{ i18n.t({ th: 'หาตำแหน่งไม่ได้ — อนุญาตตำแหน่งในเบราว์เซอร์ หรือแตะแผนที่เพื่อปักหมุดเอง', en: 'Could not get your location — allow location access, or tap the map to drop the pin' }) }}
        } @else if (value()) {
          {{ i18n.t({ th: 'ลากหมุดหรือแตะแผนที่เพื่อปรับตำแหน่ง', en: 'Drag the pin or tap the map to adjust' }) }}
        } @else {
          {{ i18n.t({ th: 'แตะแผนที่ตรงบ้านของคุณเพื่อปักหมุด', en: 'Tap your house on the map to drop a pin' }) }}
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 8px;
    }
    .map {
      inline-size: 100%;
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: var(--bg);
      z-index: 0;
    }
    .bar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .bar .btn {
      inline-size: auto;
      min-block-size: 40px;
      padding: 6px 14px;
    }
    :host ::ng-deep .pin {
      inline-size: 26px;
      block-size: 26px;
      border-radius: 50% 50% 50% 0;
      background: var(--brand);
      border: 3px solid #fff;
      transform: rotate(-45deg);
      box-shadow: 0 2px 6px rgb(0 0 0 / 35%);
    }
  `,
})
export class MapPin {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(ApiConfig);
  readonly value = model<LatLng | null>(null);
  readonly editable = input(false);
  readonly height = input(220);
  protected readonly locating = signal(false);
  protected readonly geoError = signal(false);
  protected readonly directions = directionsUrl;
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private L: typeof Leaflet | null = null;
  private map: Leaflet.Map | null = null;
  private marker: Leaflet.Marker | null = null;
  private resize: ResizeObserver | null = null;

  constructor() {
    void this.init();
    effect(() => this.sync(this.value()));
    inject(DestroyRef).onDestroy(() => {
      this.resize?.disconnect();
      this.map?.remove();
    });
  }

  private async init(): Promise<void> {
    const L = (await import('leaflet')).default ?? (await import('leaflet'));
    this.L = L;
    const start = this.value() ?? DEFAULT_CENTER;
    const map = L.map(this.host().nativeElement, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], this.value() ? 17 : 11);
    addBaseTiles(L, map, `${this.api.apiBase()}/api/v1/map-tiles`);
    if (this.editable()) map.on('click', (e: Leaflet.LeafletMouseEvent) => this.value.set({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }));
    this.map = map;
    this.sync(this.value());
    // แผนที่อยู่ในการ์ด/details ที่อาจถูกซ่อนตอนสร้าง (ขนาด 0) — พอแสดงจริงต้องบอก Leaflet วัดขนาดใหม่
    // (เดิมใช้ setTimeout 200ms ครั้งเดียว ซึ่งยังไม่ทันตอนผู้ใช้เพิ่งกดเปิด details → แผนที่ว่าง/หมุดเยื้อง)
    this.resize = new ResizeObserver(() => {
      if (this.host().nativeElement.clientWidth > 0) this.map?.invalidateSize();
    });
    this.resize.observe(this.host().nativeElement);
    setTimeout(() => map.invalidateSize(), 200);
  }

  private sync(v: LatLng | null): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    if (!v) {
      this.marker?.remove();
      this.marker = null;
      return;
    }
    if (!this.marker) {
      const icon = L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [13, 26] });
      this.marker = L.marker([v.lat, v.lng], { icon, draggable: this.editable(), keyboard: false }).addTo(map);
      this.marker.on('dragend', () => {
        const p = this.marker!.getLatLng();
        this.value.set({ lat: round6(p.lat), lng: round6(p.lng) });
      });
    } else {
      this.marker.setLatLng([v.lat, v.lng]);
    }
    if (!map.getBounds().contains([v.lat, v.lng])) map.setView([v.lat, v.lng], Math.max(map.getZoom(), 16));
  }

  protected locate(): void {
    if (!navigator.geolocation) {
      this.geoError.set(true);
      return;
    }
    this.locating.set(true);
    this.geoError.set(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(false);
        const v = { lat: round6(pos.coords.latitude), lng: round6(pos.coords.longitude) };
        this.value.set(v);
        this.map?.setView([v.lat, v.lng], 18);
      },
      () => {
        this.locating.set(false);
        this.geoError.set(true);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
}
