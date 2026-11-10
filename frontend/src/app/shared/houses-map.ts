import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, model, output, viewChild } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { ApiConfig } from '../core/api';
import { addBaseTiles } from './map-tiles';

export interface HouseMapPoint {
  box_id: string;
  label: string;
  lat: number;
  lng: number;
  /** hit = ยังไม่อยู่ในโซน (เลือกได้) · zone = อยู่ในโซน · pending = รอเจ้าของ */
  kind: 'hit' | 'zone' | 'pending';
  /** เลขบนหมุด (เฉพาะ hit) */
  n?: number;
  picked?: boolean;
}

/**
 * แผนที่บ้านในหน้าเพิ่มบ้านเข้าโซน — แสดงบ้านในโซน + ผลค้นหา
 * แตะหมุดที่เลือกได้ = ติ๊ก/ยกเลิก (ประสานกับลิสต์ด้านล่าง)
 */
@Component({
  selector: 'app-houses-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="map" #host [style.block-size.px]="height()" role="application" [attr.aria-label]="'แผนที่บ้านในโซน'"></div>`,
  styles: `
    .map {
      inline-size: 100%;
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: var(--bg);
      z-index: 0;
      border: 1px solid var(--line);
    }
    :host ::ng-deep .h-pin {
      display: grid;
      place-items: center;
      inline-size: 26px;
      block-size: 26px;
      border-radius: 50% 50% 50% 0;
      background: var(--brand);
      border: 3px solid #fff;
      rotate: -45deg;
      box-shadow: 0 2px 6px rgb(0 0 0 / 35%);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
    }
    :host ::ng-deep .h-pin > span {
      rotate: 45deg;
      line-height: 1;
    }
    :host ::ng-deep .h-pin.zone {
      background: var(--ok);
    }
    :host ::ng-deep .h-pin.pending {
      background: var(--warn);
    }
    :host ::ng-deep .h-pin.picked {
      background: #e8590c;
      outline: 3px solid #ffd9c2;
    }
    :host ::ng-deep .h-pin.sel {
      outline: 3px solid #f3c6c9;
    }
  `,
})
export class HousesMap {
  private readonly api = inject(ApiConfig);
  readonly points = input<HouseMapPoint[]>([]);
  readonly selected = model<string | null>(null);
  readonly height = input(260);
  /** แตะหมุดที่เลือกได้ → ให้ parent ติ๊ก/ยกเลิก */
  readonly toggle = output<string>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private L: typeof Leaflet | null = null;
  private map: Leaflet.Map | null = null;
  private markers = new Map<string, Leaflet.Marker>();
  private resize: ResizeObserver | null = null;
  private fitted = false;
  private zoneKey = '';

  constructor() {
    void this.init();
    effect(() => this.sync(this.points(), this.selected()));
    inject(DestroyRef).onDestroy(() => {
      this.resize?.disconnect();
      this.map?.remove();
    });
  }

  private async init(): Promise<void> {
    const L = (await import('leaflet')).default ?? (await import('leaflet'));
    this.L = L;
    const map = L.map(this.host().nativeElement, { zoomControl: true, attributionControl: true }).setView([13.7563, 100.5018], 12);
    addBaseTiles(L, map, `${this.api.apiBase()}/api/v1/map-tiles`);
    this.map = map;
    this.sync(this.points(), this.selected());
    this.resize = new ResizeObserver(() => {
      if (this.host().nativeElement.clientWidth > 0) this.map?.invalidateSize();
    });
    this.resize.observe(this.host().nativeElement);
    setTimeout(() => map.invalidateSize(), 200);
  }

  private sync(points: HouseMapPoint[], selected: string | null): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;
    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.box_id);
      const cls = ['h-pin', p.kind, p.picked ? 'picked' : '', p.box_id === selected ? 'sel' : ''].filter(Boolean).join(' ');
      const inner = p.kind === 'hit' ? String(p.n ?? '') : p.kind === 'zone' ? '✓' : '…';
      const icon = L.divIcon({ className: '', html: `<div class="${cls}"><span>${inner}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 26] });
      const old = this.markers.get(p.box_id);
      if (old) {
        old.setIcon(icon);
        old.setLatLng([p.lat, p.lng]);
      } else {
        const m = L.marker([p.lat, p.lng], { icon, keyboard: false, title: p.label }).addTo(map);
        m.on('click', () => {
          this.selected.set(p.box_id);
          if (p.kind === 'hit') this.toggle.emit(p.box_id);
        });
        this.markers.set(p.box_id, m);
      }
    }
    for (const [id, m] of this.markers) {
      if (!seen.has(id)) {
        m.remove();
        this.markers.delete(id);
      }
    }
    // fit ครั้งแรกต่อชุดข้อมูล (ผลค้นหาเปลี่ยน → จัดกรอบใหม่)
    const key = points.map((p) => p.box_id).join(',');
    if (points.length && (!this.fitted || key !== this.zoneKey)) {
      map.fitBounds(points.map((p): [number, number] => [p.lat, p.lng]), { padding: [28, 28], maxZoom: 16 });
      this.fitted = true;
      this.zoneKey = key;
    }
    if (selected) {
      const p = points.find((x) => x.box_id === selected);
      if (p) map.panTo([p.lat, p.lng]);
    }
  }
}
