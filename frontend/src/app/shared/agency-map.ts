import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, model, viewChild } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { I18n } from '../core/i18n';
import { ApiConfig } from '../core/api';
import { addBaseTiles } from './map-tiles';
import type { LatLng } from './map-pin';

/** หน่วยงานที่แสดงบนแผนที่ (api.md §8.1b `GET /agencies/map`) */
export interface AgencyMapItem {
  id: string;
  name: string;
  type: string;
  address: string | null;
  locality: string | null;
  phone: string | null;
  contact: string | null;
  coverage_note: string | null;
  lat: number;
  lng: number;
}

const DEFAULT_CENTER: LatLng = { lat: 13.7563, lng: 100.5018 };

/**
 * แผนที่หลายหมุด: หน่วยงานทุกแห่ง (หมุดแดง) + บ้านของเจ้าของ (จุดน้ำเงิน) — แตะหมุดเพื่อเลือก (ใช้ OpenStreetMap + Leaflet)
 * ✅ 2026-11-06 ให้เจ้าของบ้านรู้ว่าแต่ละหน่วยงานอยู่ตรงไหน เพื่อเลือกว่าควรไปอยู่กับหน่วยงานไหน
 */
@Component({
  selector: 'app-agency-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="map" #host [style.block-size.px]="height()" role="application" [attr.aria-label]="i18n.t({ th: 'แผนที่หน่วยงาน', en: 'Map of agencies' })"></div>`,
  styles: `
    .map {
      inline-size: 100%;
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: var(--bg);
      z-index: 0;
    }
    :host ::ng-deep .ag-pin {
      inline-size: 26px;
      block-size: 26px;
      border-radius: 50% 50% 50% 0;
      background: var(--brand);
      border: 3px solid #fff;
      transform: rotate(-45deg);
      box-shadow: 0 2px 6px rgb(0 0 0 / 35%);
      display: grid;
      place-items: center;
    }
    :host ::ng-deep .ag-pin span {
      transform: rotate(45deg);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
    }
    :host ::ng-deep .ag-pin.sel {
      background: #6f1f25;
      outline: 3px solid #efefef;
    }
    :host ::ng-deep .home-dot {
      inline-size: 18px;
      block-size: 18px;
      border-radius: 50%;
      background: #e8590c;
      border: 3px solid #fff;
      box-shadow: 0 0 0 2px #e8590c;
    }
  `,
})
export class AgencyMap {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(ApiConfig);
  readonly agencies = input<AgencyMapItem[]>([]);
  /** บ้านของเจ้าของ (ถ้ามีหมุด) */
  readonly home = input<LatLng | null>(null);
  readonly selected = model<string | null>(null);
  readonly height = input(300);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private L: typeof Leaflet | null = null;
  private map: Leaflet.Map | null = null;
  private markers = new Map<string, Leaflet.Marker>();
  private homeMarker: Leaflet.Marker | null = null;
  private fitted = false;
  private resize: ResizeObserver | null = null;

  constructor() {
    void this.init();
    effect(() => this.sync(this.agencies(), this.home(), this.selected()));
    inject(DestroyRef).onDestroy(() => {
      this.resize?.disconnect();
      this.map?.remove();
    });
  }

  private async init(): Promise<void> {
    const L = (await import('leaflet')).default ?? (await import('leaflet'));
    this.L = L;
    const c = this.home() ?? DEFAULT_CENTER;
    const map = L.map(this.host().nativeElement, { zoomControl: true, attributionControl: true }).setView([c.lat, c.lng], 12);
    addBaseTiles(L, map, `${this.api.apiBase()}/api/v1/map-tiles`);
    this.map = map;
    this.sync(this.agencies(), this.home(), this.selected());
    this.resize = new ResizeObserver(() => {
      if (this.host().nativeElement.clientWidth > 0) this.map?.invalidateSize();
    });
    this.resize.observe(this.host().nativeElement);
    setTimeout(() => map.invalidateSize(), 200);
  }

  private sync(list: AgencyMapItem[], home: LatLng | null, selected: string | null): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    const seen = new Set<string>();
    for (const [i, a] of list.entries()) {
      seen.add(a.id);
      const html = `<div class="ag-pin${a.id === selected ? ' sel' : ''}"><span>${i + 1}</span></div>`;
      const icon = L.divIcon({ className: '', html, iconSize: [26, 26], iconAnchor: [13, 26] });
      const old = this.markers.get(a.id);
      if (old) {
        old.setIcon(icon);
        old.setLatLng([a.lat, a.lng]);
      } else {
        const m = L.marker([a.lat, a.lng], { icon, keyboard: false, title: a.name }).addTo(map);
        m.on('click', () => this.selected.set(a.id));
        this.markers.set(a.id, m);
      }
    }
    for (const [id, m] of this.markers) {
      if (!seen.has(id)) {
        m.remove();
        this.markers.delete(id);
      }
    }
    if (home) {
      const icon = L.divIcon({ className: '', html: '<div class="home-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      if (!this.homeMarker) this.homeMarker = L.marker([home.lat, home.lng], { icon, keyboard: false, interactive: false }).addTo(map);
      else this.homeMarker.setLatLng([home.lat, home.lng]);
    } else {
      this.homeMarker?.remove();
      this.homeMarker = null;
    }
    // ครั้งแรกที่มีข้อมูล → ซูมให้เห็นทั้งหมด
    if (!this.fitted && (list.length || home)) {
      const pts: [number, number][] = [...list.map((a): [number, number] => [a.lat, a.lng]), ...(home ? [[home.lat, home.lng] as [number, number]] : [])];
      if (pts.length === 1) map.setView(pts[0], 15);
      else map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
      this.fitted = true;
    }
    const sel = selected ? list.find((a) => a.id === selected) : null;
    if (sel) map.panTo([sel.lat, sel.lng]);
  }
}
