import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DisplaySettings } from '../../core/display-settings';
import { I18n } from '../../core/i18n';
import { OwnerApi } from '../../core/owner-api';
import { screenUrl } from '../../screens/registry';
import { AgencyMap, type AgencyMapItem } from '../../shared/agency-map';
import { directionsUrl, type LatLng } from '../../shared/map-pin';
import { PageHeader } from '../../shared/page-header';

const TYPE_LABEL: Record<string, { th: string; en: string }> = {
  police: { th: 'ตำรวจ', en: 'Police' },
  guard: { th: 'รปภ.', en: 'Security guards' },
  other: { th: 'หน่วยงานอื่น', en: 'Other agency' },
};

const km = (a: LatLng, b: LatLng): number => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * H16 · หน่วยงานใกล้บ้านบนแผนที่ (✅ 2026-11-06) — เจ้าของบ้านดูว่าแต่ละหน่วยงานอยู่ตรงไหน เพื่อเลือกว่าควรไปอยู่กับหน่วยงานไหน
 * เรียงตามระยะจากหมุดบ้านของตัวเอง (ไม่มีหมุด = เรียงตามชื่อ) · ข้อมูลเป็นสิ่งที่หน่วยงานตั้งใจเปิดเผย
 */
@Component({
  selector: 'app-owner-agencies',
  imports: [PageHeader, AgencyMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="i18n.t({ th: 'หน่วยงานใกล้บ้าน', en: 'Agencies near you' })" [back]="url('H13')" />
    <div class="stack grow">
      <p class="muted small easy-hide">{{ i18n.t({ th: 'ดูว่าแต่ละหน่วยงานอยู่ตรงไหน แล้วติดต่อหน่วยงานที่ต้องการ ให้หัวหน้าเพิ่มบ้านคุณเข้าโซน (คุณจะได้รับคำขอให้กดยอมรับ)', en: 'See where each agency is, then contact the one you want. Its head adds your house to a zone and you will get a request to accept.' }) }}</p>
      @if (display.easyMode()) {
        <p class="muted small easy-only">{{ i18n.t({ th: 'แตะที่หน่วยงานเพื่อดูเบอร์โทรและเส้นทาง', en: 'Tap an agency to see its phone number and directions' }) }}</p>
      }
      @if (!home()) {
        <p class="info-box small easy-hide" role="status">{{ i18n.t({ th: 'ปักหมุดบ้านของคุณที่หน้าตั้งค่าตู้ จะเห็นระยะห่างจากแต่ละหน่วยงาน', en: 'Pin your house in the mailbox settings to see the distance to each agency' }) }}</p>
      }
      @if (!display.easyMode()) {
        <app-agency-map [agencies]="agencies()" [home]="home()" [(selected)]="selected" [height]="320" />
      }
      @if (advanced()) {
        <p class="muted small adv-only">{{ i18n.t({ th: 'หน่วยงาน ', en: 'Agencies: ' }) }}{{ agencies().length }}{{ i18n.t({ th: ' แห่ง · เรียงตามระยะจากบ้าน', en: ' · sorted by distance from home' }) }}</p>
      }
      @if (loaded() && !agencies().length) {
        <p class="card muted" role="status">{{ i18n.t({ th: 'ยังไม่มีหน่วยงานที่ปักหมุดไว้', en: 'No agency has put a pin on the map yet' }) }}</p>
      }
      <div class="list">
        @for (a of sorted(); track a.item.id) {
          <button type="button" class="row ag" [class.on]="selected() === a.item.id" (click)="selected.set(a.item.id)">
            <span class="grow">
              <strong>{{ a.item.name }}</strong>
              <span class="muted small block">{{ typeLabel(a.item.type) }}{{ a.item.locality ? ' · ' + a.item.locality : '' }}</span>
              @if (selected() === a.item.id) {
                @if (a.item.address) { <span class="small block">{{ a.item.address }}</span> }
                @if (a.item.coverage_note) { <span class="small block">{{ i18n.t({ th: 'พื้นที่ดูแล: ', en: 'Covers: ' }) }}{{ a.item.coverage_note }}</span> }
                <span class="small block">{{ i18n.t({ th: 'ติดต่อ: ', en: 'Contact: ' }) }}{{ a.item.contact }}</span>
                <span class="actions">
                  @if (a.item.phone) { <a class="btn small" [href]="'tel:' + a.item.phone">{{ i18n.t({ th: 'โทร', en: 'Call' }) }}</a> }
                  <a class="btn secondary small" [href]="dir(a.item)" target="_blank" rel="noopener">{{ i18n.t({ th: 'นำทาง', en: 'Directions' }) }}</a>
                </span>
                @if (advanced()) {
                  <span class="small block adv-only mono">{{ i18n.t({ th: 'รหัส ', en: 'id ' }) }}{{ a.item.id }} · {{ a.item.type }}</span>
                  <span class="small block adv-only mono">{{ a.item.lat.toFixed(5) }}, {{ a.item.lng.toFixed(5) }}</span>
                }
              }
            </span>
            @if (a.km !== null) { <span class="chip">{{ a.km < 10 ? a.km.toFixed(1) : a.km.toFixed(0) }} {{ i18n.t({ th: 'กม.', en: 'km' }) }}</span> }
          </button>
        }
      </div>
      <p class="muted small easy-hide">{{ i18n.t({ th: 'หมุดคือที่ตั้งหน่วยงาน · หน่วยงานจะดูแลบ้านเมื่อคุณกดยอมรับคำขอเท่านั้น', en: 'The pins are agency locations. An agency only covers your house after you accept its request.' }) }}</p>
    </div>
  `,
  styles: `
    .ag {
      text-align: start;
      align-items: flex-start;
    }
    .ag.on {
      box-shadow: inset 0 0 0 2px var(--brand);
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-block-start: 8px;
    }
    .actions .btn {
      inline-size: auto;
      min-block-size: 40px;
      padding: 6px 14px;
    }
    :host-context([data-mode='easy']) .ag {
      min-block-size: 96px;
      gap: 16px;
      strong { font-size: 1.375rem; }
    }
  `,
})
export class OwnerAgencies {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly display = inject(DisplaySettings);
  protected readonly advanced = this.display.advancedMode;
  private readonly http = inject(HttpClient);
  private readonly owner = inject(OwnerApi);
  protected readonly agencies = signal<AgencyMapItem[]>([]);
  protected readonly home = signal<LatLng | null>(null);
  protected readonly selected = signal<string | null>(null);
  protected readonly loaded = signal(false);
  protected readonly dir = (a: AgencyMapItem) => directionsUrl({ lat: a.lat, lng: a.lng });

  protected readonly sorted = computed(() => {
    const h = this.home();
    return this.agencies()
      .map((item) => ({ item, km: h ? km(h, { lat: item.lat, lng: item.lng }) : null }))
      .sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : a.item.name.localeCompare(b.item.name)));
  });

  constructor() {
    void firstValueFrom(this.http.get<AgencyMapItem[]>('/api/v1/agencies/map'))
      .then((l) => this.agencies.set(l))
      .catch(() => undefined)
      .finally(() => this.loaded.set(true));
    void this.owner
      .boxes()
      .then(async (b) => (b[0] ? this.owner.box(b[0].id) : null))
      .then((d) => this.home.set(d?.location ?? null))
      .catch(() => undefined);
  }

  protected typeLabel(t: string): string {
    const l = TYPE_LABEL[t] ?? TYPE_LABEL['other'];
    return this.i18n.t(l);
  }
}
