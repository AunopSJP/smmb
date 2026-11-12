import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DisplaySettings } from '../../core/display-settings';
import { I18n } from '../../core/i18n';
import { EmptyState, LoadError } from '../../shared/state-view';
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
  imports: [PageHeader, AgencyMap, LoadError, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="i18n.t({ th: 'หน่วยงานใกล้บ้าน', en: 'Agencies near you' })" [back]="url('H13')" />
    <div class="stack grow">
      <p class="muted small">{{ i18n.t({ th: 'ดูตำแหน่งและระยะทางจากบ้านคุณ · ติดต่อหน่วยงานที่ต้องการ แล้วให้หัวหน้าเพิ่มบ้านเข้าโซน (คุณต้องกดยอมรับก่อน)', en: 'See where each agency is and how far it is from your home. Contact the one you want, then its head adds your house to a zone (you must accept first).' }) }}</p>
      @if (!home()) {
        <p class="info-box small easy-hide" role="status">{{ i18n.t({ th: 'ปักหมุดบ้านของคุณที่หน้าตั้งค่าตู้ จะเห็นระยะห่างจากแต่ละหน่วยงาน', en: 'Pin your house in the mailbox settings to see the distance to each agency' }) }}</p>
      }
      <app-agency-map [agencies]="items()" [home]="home()" [(selected)]="selected" [height]="display.easyMode() ? 240 : 320" />
      @if (advanced()) {
        <p class="muted small adv-only">{{ i18n.t({ th: 'หน่วยงาน ', en: 'Agencies: ' }) }}{{ agencies().length }}{{ i18n.t({ th: ' แห่ง · เรียงตามระยะจากบ้าน', en: ' · sorted by distance from home' }) }}</p>
      }
      @if (failed()) {
        <app-load-error (retry)="load()" />
      } @else if (loaded() && !agencies().length) {
        <app-empty-state [title]="i18n.t({ th: 'ยังไม่มีหน่วยงานที่ปักหมุดไว้', en: 'No agency has put a pin on the map yet' })" />
      }
      <div class="ag-list">
        @for (a of sorted(); track a.item.id; let i = $index) {
          <article class="ag card" [class.on]="selected() === a.item.id">
            <button type="button" class="ag-head" (click)="selected.set(a.item.id)" [attr.aria-expanded]="selected() === a.item.id">
              <span class="num" aria-hidden="true">{{ i + 1 }}</span>
              <span class="grow">
                <strong>{{ a.item.name }}</strong>
                <span class="muted small block">{{ typeLabel(a.item.type) }}{{ a.item.locality ? ' · ' + a.item.locality : '' }}</span>
              </span>
              @if (a.km !== null) {
                <span class="chip">{{ a.km < 10 ? a.km.toFixed(1) : a.km.toFixed(0) }} {{ i18n.t({ th: 'กม.', en: 'km' }) }}</span>
              }
            </button>
            @if (selected() === a.item.id) {
              <div class="ag-body">
                @if (a.item.address) { <span class="small">{{ a.item.address }}</span> }
                @if (a.item.coverage_note) { <span class="small">{{ i18n.t({ th: 'พื้นที่ดูแล: ', en: 'Covers: ' }) }}{{ a.item.coverage_note }}</span> }
                @if (a.item.contact) { <span class="small">{{ i18n.t({ th: 'ติดต่อ: ', en: 'Contact: ' }) }}{{ a.item.contact }}</span> }
                <div class="two">
                  @if (a.item.phone) {
                    <a class="btn" [href]="'tel:' + a.item.phone">{{ i18n.t({ th: 'โทร', en: 'Call' }) }}</a>
                  }
                  <a class="btn secondary" [href]="dir(a.item)" target="_blank" rel="noopener">{{ i18n.t({ th: 'นำทาง', en: 'Directions' }) }}</a>
                </div>
              </div>
            }
          </article>
        }
      </div>
      <p class="muted small easy-hide">{{ i18n.t({ th: 'หมุดคือที่ตั้งหน่วยงาน · หน่วยงานจะดูแลบ้านเมื่อคุณกดยอมรับคำขอเท่านั้น', en: 'The pins are agency locations. An agency only covers your house after you accept its request.' }) }}</p>
    </div>
  `,
  styles: `
    .ag-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ag {
      padding: 0;
      overflow: hidden;
    }
    .ag.on {
      background: color-mix(in srgb, var(--surface) 94%, var(--brand) 6%);
      box-shadow:
        inset 0 0 0 2px var(--brand-text),
        var(--shadow);
    }
    .ag-head {
      display: flex;
      align-items: center;
      gap: 12px;
      inline-size: 100%;
      padding: 14px 16px;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .ag-head:active {
      background: var(--brand-lighter);
    }
    .num {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 30px;
      block-size: 30px;
      border-radius: 50%;
      background: var(--icon-bg);
      color: var(--brand-text);
      font-size: 0.8125rem;
      font-weight: 700;
    }
    .ag.on .num {
      background: var(--action-bg);
      color: var(--action-fg);
    }
    .ag-body {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0 16px 16px;
      border-block-start: 1px solid var(--line);
      padding-block-start: 12px;
    }
    .ag-body .two {
      display: flex;
      gap: 10px;
      margin-block-start: 8px;
    }
    .ag-body .two .btn {
      flex: 1;
    }
    :host-context([data-mode='easy']) .ag-head {
      min-block-size: 84px;
      padding: 18px;
    }
    :host-context([data-mode='easy']) .ag-head strong {
      font-size: 1.25rem;
    }
    :host-context([data-mode='easy']) .num {
      inline-size: 36px;
      block-size: 36px;
      font-size: 1rem;
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
  protected readonly failed = signal(false);
  protected readonly dir = (a: AgencyMapItem) => directionsUrl({ lat: a.lat, lng: a.lng });

  protected readonly sorted = computed(() => {
    const h = this.home();
    return this.agencies()
      .map((item) => ({ item, km: h ? km(h, { lat: item.lat, lng: item.lng }) : null }))
      .sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : a.item.name.localeCompare(b.item.name)));
  });
  /** ส่งให้แผนที่ตามลำดับเดียวกับลิสต์ — หมุดมีเลข 1,2,3 ตรงกัน */
  protected readonly items = computed(() => this.sorted().map((a) => a.item));

  constructor() {
    void this.load();
    void this.owner
      .boxes()
      .then(async (b) => (b[0] ? this.owner.box(b[0].id) : null))
      .then((d) => this.home.set(d?.location ?? null))
      .catch(() => undefined);
  }

  protected async load(): Promise<void> {
    this.failed.set(false);
    try {
      this.agencies.set(await firstValueFrom(this.http.get<AgencyMapItem[]>('/api/v1/agencies/map')));
    } catch {
      this.failed.set(true);
    } finally {
      this.loaded.set(true);
    }
  }

  protected typeLabel(t: string): string {
    const l = TYPE_LABEL[t] ?? TYPE_LABEL['other'];
    return this.i18n.t(l);
  }
}
