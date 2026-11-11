import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { HeadApi, type HouseHit, type Member, type Zone, type ZoneDetail, type ZoneHouse } from '../../core/head-api';
import { DisplaySettings } from '../../core/display-settings';
import { I18n, type Tr } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { Confirm } from '../../shared/confirm-dialog';
import { HousesMap, type HouseMapPoint } from '../../shared/houses-map';
import { LoadError } from '../../shared/state-view';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';
import { liveRefresh } from '../../core/live-refresh';

// หัวหน้า: L06 โซนทั้งหมด · L07 แก้โซน (ชื่อ · เวลาตรวจ · บ้าน · เจ้าหน้าที่) — ใช้ API จริง (api.md §8.3)
// บ้านหลังเดียวอยู่ในโซนของหลายหน่วยงานได้ · ตู้รับเวลาตรวจใหม่ตอน boot / รายงานรายวัน

const MAX_WINDOWS = 4;

const ZONE_ERROR: Record<string, Tr> = {
  ZONE_AREA_INVALID: { th: 'ต้องใส่จังหวัดและเขต/อำเภอคู่กัน (หรือเว้นว่างทั้งหมด)', en: 'Province and district are required together (or leave all blank)' },
  WINDOWS_INVALID: { th: 'เวลาตรวจไม่ถูกต้อง (ไม่ทับกัน · เริ่มก่อนจบ · ไม่ข้ามเที่ยงคืน · ไม่เกิน 4 ช่วง)', en: 'Invalid patrol hours (no overlap · start before end · no midnight crossing · max 4)' },
  ZONE_NAME_TAKEN: { th: 'มีโซนชื่อนี้แล้ว', en: 'A zone with this name exists' },
  HOUSE_NOT_FOUND: { th: 'มีบ้านที่ยังไม่ผูกตู้ / ไม่พบ', en: 'A house is not bound / not found' },
};

// ── L06 · โซน ───────────────────────────────────────────────

@Component({
  selector: 'app-head-zones',
  imports: [RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="i18n.t({ th: 'โซน', en: 'Zones' })" [bell]="url('L09')" />
    <div class="stack grow">
      <div class="filter-row">
        <div class="segmented grow-seg easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'ขอบเขตโซน', en: 'Zone scope' })">
          <button type="button" [attr.aria-pressed]="scope() === 'mine'" (click)="scope.set('mine')">{{ i18n.t({ th: 'โซนของฉัน', en: 'My zones' }) }}</button>
          <button type="button" [attr.aria-pressed]="scope() === 'all'" (click)="scope.set('all')">{{ i18n.t({ th: 'ทุกโซน', en: 'All zones' }) }}</button>
        </div>
        <a class="btn add" [routerLink]="url('L07')" [queryParams]="{ zone: 'new' }">+ {{ i18n.t({ th: 'สร้างโซน', en: 'New zone' }) }}</a>
      </div>
      @if (shown().length) {
        <section class="card adv-only">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'โซนที่แสดง', en: 'Zones shown' }) }}</dt><dd class="mono">{{ shown().length }}</dd>
            <dt>{{ i18n.t({ th: 'บ้านรวม', en: 'Houses' }) }}</dt><dd class="mono">{{ totalHouses() }}</dd>
            <dt>{{ i18n.t({ th: 'เจ้าหน้าที่รวม', en: 'Officers' }) }}</dt><dd class="mono">{{ totalOfficers() }}</dd>
            <dt>{{ i18n.t({ th: 'ยังไม่มีเจ้าหน้าที่', en: 'No officers yet' }) }}</dt><dd class="mono">{{ noOfficerZones() }}</dd>
          </dl>
        </section>
      }
      @for (z of shown(); track z.id) {
        <a class="card zone" [class.warn]="!z.officers_count" [routerLink]="url('L07')" [queryParams]="{ zone: z.id }">
          <span class="title-row">
            <strong>{{ z.name }}</strong>
            @if (z.is_mine) {
              <span class="chip ok">{{ i18n.t({ th: 'โซนที่ฉันอยู่', en: 'My zone' }) }}</span>
            }
            <span class="chip push">{{ z.houses_count }} {{ i18n.t({ th: 'หลัง', en: 'houses' }) }}</span>
          </span>
          @if (z.officers_count) {
            <span class="muted small">{{ z.officers_count }} {{ i18n.t({ th: 'เจ้าหน้าที่', en: 'officers' }) }}</span>
          } @else {
            <span class="warn-text small">{{ i18n.t({ th: 'ยังไม่มีเจ้าหน้าที่', en: 'No officers yet' }) }}</span>
          }
          <span class="muted small">{{ i18n.t({ th: 'เวลาตรวจ ', en: 'Patrol ' }) }}{{ windows(z) }}</span>
          @if (!z.area) {
            <span class="warn-text small easy-only">{{ i18n.t({ th: 'ยังไม่ได้ตั้งพื้นที่', en: 'No area set yet' }) }}</span>
          }
          <span class="muted small block adv-only">
            {{ areaText(z) }} · {{ i18n.t({ th: 'แก้ล่าสุด ', en: 'updated ' }) }}{{ updated(z) }}
          </span>
        </a>
      } @empty {
        @if (zonesFailed()) {
          <p class="muted"><span class="danger-text">{{ i18n.t({ th: 'โหลดรายการโซนไม่สำเร็จ', en: 'Couldn’t load zones' }) }}</span> <button type="button" class="see-all" (click)="ngOnInit()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button></p>
        } @else {
          <p class="muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ยังไม่มีโซน — สร้างโซนแรก', en: 'No zones yet — create the first one' }) }}</p>
        }
      }
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .filter-row {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .grow-seg {
      flex: 1;
    }
    .add {
      inline-size: auto;
      min-block-size: 40px;
      padding: 6px 14px;
      font-size: 0.875rem;
    }
    .zone {
      display: flex;
      flex-direction: column;
      gap: 2px;
      text-decoration: none;
      color: inherit;
      &.warn {
        border: 2px solid var(--orange-line);
      }
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      strong {
        font-size: 1.0625rem;
      }
    }
    .push {
      margin-inline-start: auto;
    }
    .warn-text {
      color: var(--orange);
      font-weight: 700;
    }
    .zone-meta {
      overflow-wrap: break-word;
    }
  `,
})
export class HeadZones implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  protected readonly url = screenUrl;
  protected readonly zones = signal<Zone[]>([]);
  protected readonly scope = signal<'mine' | 'all'>('all');
  protected readonly shown = computed(() => (this.scope() === 'mine' ? this.zones().filter((z) => z.is_mine) : this.zones()));
  protected readonly totalHouses = computed(() => this.shown().reduce((n, z) => n + z.houses_count, 0));
  protected readonly totalOfficers = computed(() => this.shown().reduce((n, z) => n + z.officers_count, 0));
  protected readonly noOfficerZones = computed(() => this.shown().filter((z) => !z.officers_count).length);
  protected readonly loading = signal(true);
  /** โหลดโซนไม่สำเร็จ (ห้ามขึ้น "ยังไม่มีโซน") */
  protected readonly zonesFailed = signal(false);

  /** หัวหน้าคนอื่นแก้โซน → ขึ้นเองโดยไม่ต้องรีเฟรช */
  private readonly _live = liveRefresh(async () => this.zones.set(await this.api.zones('all').catch(() => this.zones())), 15_000);

  async ngOnInit(): Promise<void> {
    void this.api.loadAgency().catch(() => undefined);
    try {
      this.zones.set(await this.api.zones('all'));
      this.zonesFailed.set(false);
    } catch {
      if (!this.zones().length) this.zonesFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected windows(z: Zone): string {
    return z.windows.map((w) => w.join('–')).join(' · ') || '—';
  }

  /** โหมดละเอียด: รหัสพื้นที่ของโซน (จังหวัด/เขต/แขวง) */
  protected areaText(z: Zone): string {
    if (!z.area) return this.i18n.t({ th: 'ยังไม่ตั้งพื้นที่', en: 'no area' });
    return [z.area.subdistrict, z.area.district, z.area.province].filter(Boolean).join(' / ');
  }

  protected updated(z: Zone): string {
    return new Date(z.updated_at).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  }
}

// ── L07 · แก้โซน / สร้างโซน ──────────────────────────────────────

@Component({
  selector: 'app-head-zone-edit',
  imports: [PageHeader, RouterLink, LoadError, HousesMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './head-zone-edit.scss',
  template: `
    <app-page-header [caption]="isNew() ? i18n.t({ th: 'สร้างโซน', en: 'New zone' }) : i18n.t({ th: 'แก้ไขโซน', en: 'Edit zone' })" [title]="name() || i18n.t({ th: 'โซนใหม่', en: 'New zone' })" [back]="url('L06')" />
    <div class="stack grow">
      @if (zone(); as z) {
        <p class="adv-only">{{ i18n.t({ th: 'แก้ล่าสุด ', en: 'Updated ' }) }}{{ updated(z.updated_at) }}</p>
        <div class="tabs" role="tablist">
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'settings'" [class.active]="tab() === 'settings'" (click)="tab.set('settings')">{{ i18n.t({ th: 'ตั้งค่า', en: 'Settings' }) }}</button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'houses'" [class.active]="tab() === 'houses'" (click)="tab.set('houses')">{{ i18n.t({ th: 'บ้าน', en: 'Houses' }) }} ({{ z.houses.length }})</button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'officers'" [class.active]="tab() === 'officers'" (click)="tab.set('officers')">{{ i18n.t({ th: 'เจ้าหน้าที่', en: 'Officers' }) }} ({{ z.officers.length }})</button>
        </div>
      }
      @if (tab() === 'settings' || isNew()) {
      <section class="card stack">
        <label class="field">
          <span>{{ i18n.t({ th: 'ชื่อโซน', en: 'Zone name' }) }}</span>
          <input maxlength="50" [value]="name()" (input)="name.set($any($event.target).value)" />
        </label>
        <fieldset class="stack area" id="zone-area">
          <legend><strong>{{ i18n.t({ th: 'พื้นที่ที่โซนนี้ดูแล', en: 'Area this zone covers' }) }}</strong></legend>
          <span class="muted small easy-hide">{{ i18n.t({ th: 'ตอนเพิ่มบ้าน จะเห็นเฉพาะบ้านที่อยู่ในพื้นที่นี้', en: 'When adding houses you will only see houses inside this area' }) }}</span>
          <label class="field">
            <span>{{ i18n.t({ th: 'จังหวัด', en: 'Province' }) }}</span>
            <input maxlength="100" autocomplete="off" [value]="province()" (input)="province.set($any($event.target).value)" />
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'เขต / อำเภอ', en: 'District' }) }}</span>
            <input maxlength="100" autocomplete="off" [value]="district()" (input)="district.set($any($event.target).value)" />
          </label>
          <label class="field easy-hide">
            <span>{{ i18n.t({ th: 'แขวง / ตำบล (ไม่บังคับ)', en: 'Sub-district (optional)' }) }}</span>
            <input maxlength="100" autocomplete="off" [value]="subdistrict()" (input)="subdistrict.set($any($event.target).value)" />
          </label>
          @if (zone()?.area; as a) {
            <p class="muted small mono adv-only">{{ a.subdistrict || '—' }} / {{ a.district }} / {{ a.province }}</p>
          }
        </fieldset>
        <div class="head">
          <strong>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</strong>
          <span class="muted small">Asia/Bangkok</span>
        </div>
        <div class="chips">
          @for (w of windows(); track $index) {
            <button type="button" class="pill" (click)="removeWindow($index)" [attr.aria-label]="i18n.t({ th: 'นำออก ', en: 'Remove ' }) + w.join('–')">{{ w[0] }}–{{ w[1] }} <span aria-hidden="true">×</span></button>
          } @empty {
            <span class="warn-text small">{{ i18n.t({ th: 'ยังไม่มีเวลาตรวจ — ตู้จะไม่รับงานตรวจ', en: 'No patrol hours — boxes won’t take inspections' }) }}</span>
          }
        </div>
        @if (windows().length < maxWindows) {
          <div class="add-window">
            <input type="time" [value]="from()" (input)="from.set($any($event.target).value)" [attr.aria-label]="i18n.t({ th: 'เริ่ม', en: 'From' })" />
            <span>–</span>
            <input type="time" [value]="to()" (input)="to.set($any($event.target).value)" [attr.aria-label]="i18n.t({ th: 'ถึง', en: 'To' })" />
            <button type="button" class="btn secondary small-btn" (click)="addWindow()">{{ i18n.t({ th: 'เพิ่ม', en: 'Add' }) }}</button>
          </div>
        }
        <p class="muted small">{{ i18n.t({ th: 'ทั้งวัน = 00:00–23:59 · ข้ามเที่ยงคืนให้แยก 2 ช่วง', en: 'All day = 00:00–23:59 · split overnight into 2 windows' }) }}</p>
        @if (windows().length) {
          <p class="muted small adv-only">{{ windows().length }}/{{ maxWindows }} {{ i18n.t({ th: 'ช่วง', en: 'windows' }) }} · {{ durationText() }}</p>
        }
        @if (error(); as e) {
          <p class="err small" role="alert">{{ i18n.t(e) }}</p>
        }
        <button type="button" class="btn" [disabled]="busy() || !name().trim()" (click)="saveBasics()">
          {{ isNew() ? i18n.t({ th: 'สร้างโซน', en: 'Create zone' }) : i18n.t({ th: 'บันทึกชื่อ + เวลาตรวจ', en: 'Save name + hours' }) }}
        </button>
      </section>

      @if (isNew()) {
        <p class="muted small">{{ i18n.t({ th: 'กด "สร้างโซน" ก่อน แล้วจะเพิ่มบ้านและเจ้าหน้าที่ได้ในหน้านี้', en: 'Press “Create zone” first — then you can add houses and officers here' }) }}</p>
      }
      @if (zone()) {
        <button type="button" class="btn secondary danger-outline easy-hide" (click)="remove()">{{ i18n.t({ th: 'ลบโซนนี้', en: 'Delete this zone' }) }}</button>
      }
      }
      @if (zone(); as z) {
        @if (tab() === 'houses') {
        <section class="card stack">
          <div class="head">
            <strong>{{ i18n.t({ th: 'บ้านในโซน', en: 'Houses' }) }} ({{ activeCount(z.houses) }})</strong>
          </div>
          @if (areaReady()) {
            @if (mapPoints().length) {
              <app-houses-map [points]="mapPoints()" [(selected)]="mapSelected" (toggle)="togglePick($event)" [height]="display.easyMode() ? 200 : 260" />
            } @else {
              <p class="muted small">{{ i18n.t({ th: 'ยังไม่มีบ้านที่ปักหมุดพิกัด — เจ้าของบ้านต้องปักหมุดในหน้าตั้งค่าตู้ก่อน จึงจะเห็นบนแผนที่', en: 'No house has a pin yet — owners must pin their house in the mailbox settings before it appears on the map.' }) }}</p>
            }
          }
          <div class="house-list">
            @for (h of z.houses; track h.box_id) {
              <div class="house-row" [class.pending]="h.pending">
                <span class="grow">
                  <strong>{{ h.house_no ?? h.box_id }}</strong>
                  @if (h.area) { <span class="muted small block">{{ h.area }}</span> }
                </span>
                @if (h.pending) {
                  <span class="chip">{{ i18n.t({ th: 'รอเจ้าของบ้านยืนยัน', en: 'Awaiting owner' }) }}</span>
                } @else {
                  <span class="chip ok">{{ i18n.t({ th: 'อยู่ในโซน', en: 'In zone' }) }}</span>
                }
                <button type="button" class="icon-btn" (click)="askRemoveHouse(h)" [attr.aria-label]="(h.pending ? i18n.t({ th: 'ยกเลิกคำขอ ', en: 'Cancel request ' }) : i18n.t({ th: 'นำออก ', en: 'Remove ' })) + (h.house_no ?? h.box_id)">
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            } @empty {
              <p class="muted small">{{ i18n.t({ th: 'ยังไม่มีบ้านในโซน', en: 'No houses in this zone yet' }) }}</p>
            }
          </div>
          @if (!areaReady()) {
            <p class="info-box small" role="status">
              {{ i18n.t({ th: 'โซนนี้ยังไม่ได้ตั้งจังหวัด/อำเภอ — ไปที่แท็บ “ตั้งค่า” แล้วบันทึกพื้นที่ก่อน จึงจะค้นหาและเพิ่มบ้านได้', en: 'This zone has no province/district yet. Set the area in the “Settings” tab first, then come back to add houses.' }) }}
              <button type="button" class="see-all" (click)="goArea()">{{ i18n.t({ th: 'ไปตั้งพื้นที่', en: 'Set the area' }) }}</button>
            </p>
          } @else {
          <form class="search-row" (submit)="$event.preventDefault(); search()">
            <input type="search" [attr.aria-label]="i18n.t({ th: 'ค้นบ้าน', en: 'Search houses' })" [placeholder]="i18n.t({ th: 'บ้านเลขที่ / หมู่บ้าน / รหัสตู้', en: 'House no. / village / box id' })" [value]="q()" (input)="q.set($any($event.target).value)" />
            <button type="submit" class="btn secondary small-btn" [disabled]="searching()">{{ i18n.t({ th: 'ค้น', en: 'Search' }) }}</button>
          </form>
          <div class="filters easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'ตัวกรอง', en: 'Filters' })">
            <label class="chip-toggle"><input type="checkbox" [checked]="onlyUnzoned()" (change)="onlyUnzoned.set($any($event.target).checked); refilter()" />{{ i18n.t({ th: 'ยังไม่มีใครดูแล', en: 'Not covered yet' }) }}</label>
            <label class="chip-toggle"><input type="checkbox" [checked]="onlyOnline()" (change)="onlyOnline.set($any($event.target).checked); refilter()" />{{ i18n.t({ th: 'ตู้ออนไลน์', en: 'Box online' }) }}</label>
          </div>
          <button type="button" class="btn secondary small-btn browse" [disabled]="searching()" (click)="browse()">
            {{ i18n.t({ th: 'ดูบ้านที่ยังไม่มีใครดูแล', en: 'Show houses nobody covers yet' }) }}
          </button>
          @if (searchFailed()) {
            <app-load-error (retry)="mode() === 'browse' ? browse() : search()" />
          } @else if (searched()) {
            <div class="result-head">
              <span class="muted small">{{ i18n.t({ th: 'พบ ', en: 'Found ' }) }}{{ hits().length }}{{ i18n.t({ th: ' หลัง', en: ' houses' }) }}{{ picked().size ? i18n.t({ th: ' · เลือก ', en: ' · selected ' }) + picked().size : '' }}</span>
              @if (hits().length >= 20) {
                <span class="muted small">{{ i18n.t({ th: 'แสดง 20 หลังแรก — พิมพ์คำค้นให้แคบลงเพื่อดูที่เหลือ', en: 'Showing the first 20 — narrow the search to see more' }) }}</span>
              }
              @if (addable().length > 1) {
                <button type="button" class="see-all" (click)="selectAllPicks()">{{ i18n.t({ th: 'เลือกที่แสดงทั้งหมด', en: 'Select all shown' }) }}</button>
              }
            </div>
            @if (picked().size) {
              <div class="pick-bar">
                <span>{{ i18n.t({ th: 'เลือก ', en: 'Selected ' }) }}{{ picked().size }}{{ i18n.t({ th: ' หลัง', en: ' houses' }) }}</span>
                <button type="button" class="see-all" (click)="clearPicks()">{{ i18n.t({ th: 'ล้างที่เลือก', en: 'Clear' }) }}</button>
                <button type="button" class="btn" [disabled]="savingHouses()" (click)="addPicked()">{{ savingHouses() ? i18n.t({ th: 'กำลังส่ง…', en: 'Sending…' }) : i18n.t({ th: 'ส่งคำขอ ', en: 'Send requests ' }) + picked().size }}</button>
              </div>
            }
            <div class="hit-list">
              @for (h of hits(); track h.box_id) {
                @let canPick = selectable(h);
                <label class="hit" [class.done]="!canPick" [class.picked]="picked().has(h.box_id)">
                  <input type="checkbox" [checked]="picked().has(h.box_id)" [disabled]="!canPick" (change)="togglePick(h.box_id)" />
                  <span class="grow">
                    <strong>{{ h.house_no ?? h.box_id }}</strong>
                    @if (h.area) { <span class="chip">{{ h.area }}</span> }
                    <span class="muted small block">{{ h.box_id }}{{ h.box_name ? ' · ' + h.box_name : '' }}{{ h.locality ? ' · ' + h.locality : '' }}</span>
                    <span class="muted small block">
                      {{ statusText(h) }} ·
                      @if (!h.zones.length) {
                        <span class="warn-text">{{ i18n.t({ th: 'ยังไม่มีใครดูแล', en: 'nobody covers it yet' }) }}</span>
                      } @else {
                        {{ i18n.t({ th: 'อยู่ในโซน: ', en: 'In zones: ' }) }}{{ zonesOf(h) }}
                      }
                    </span>
                  </span>
                  @if (pendingHere(h.box_id)) {
                    <span class="chip">{{ i18n.t({ th: 'รอเจ้าของบ้านยืนยัน', en: 'Awaiting owner' }) }}</span>
                  } @else if (inZone(h.box_id)) {
                    <span class="chip ok">{{ i18n.t({ th: 'อยู่ในโซนนี้แล้ว', en: 'In this zone' }) }}</span>
                  }
                </label>
              }
            </div>
            @if (!hits().length) {
              <p class="muted small">
                {{ mode() === 'browse'
                  ? i18n.t({ th: 'ไม่มีบ้านที่รอเพิ่มแล้ว — ทุกหลังที่เจ้าของผูกตู้แล้วมีหน่วยงานดูแลอยู่', en: 'Nothing waiting — every bound house is already covered' })
                  : i18n.t({ th: 'ไม่พบ — ค้นได้เฉพาะตู้ที่เจ้าของบ้านผูกแล้ว (ตรวจสอบว่าเจ้าของผูกตู้แล้ว และพิมพ์บ้านเลขที่ตรงกับที่เจ้าของกรอก)', en: 'Nothing found — only boxes already bound by an owner (check the owner has bound it and the number matches what they entered)' }) }}
              </p>
            }
          }
          <p class="muted small easy-hide">{{ i18n.t({ th: 'เพิ่มแล้วเจ้าของบ้านต้องกดยอมรับก่อน · บ้านเดียวอยู่ได้หลายหน่วยงาน · แนะนำให้เลือกหลายหลังแล้วส่งคำขอครั้งเดียว', en: 'Owners must accept before a house joins · a house may be in several agencies · select several houses and send once' }) }}</p>
          }
        </section>
        }

        @if (tab() === 'officers') {
        <section class="card stack">
          <div class="section-head">
            <div>
              <strong>{{ i18n.t({ th: 'เจ้าหน้าที่ในโซน', en: 'Officers in this zone' }) }}</strong>
              <span class="muted small block">{{ i18n.t({ th: 'เลือกคนที่จะมาตรวจโซนนี้', en: 'Choose who patrols this zone' }) }}</span>
            </div>
            <span class="chip brand">{{ z.officers.length }} {{ i18n.t({ th: 'คน', en: 'people' }) }}</span>
          </div>
          <div class="search-row">
            <input type="search" [attr.aria-label]="i18n.t({ th: 'ค้นเจ้าหน้าที่', en: 'Search officers' })" [placeholder]="i18n.t({ th: 'ค้นชื่อ / ตำแหน่ง / เลขประจำตัว', en: 'Name / position / staff no.' })" [value]="memberQ()" (input)="memberQ.set($any($event.target).value)" />
          </div>
          @if (savingOfficers()) {
            <p class="muted small" role="status">{{ i18n.t({ th: 'กำลังบันทึก…', en: 'Saving…' }) }}</p>
          }
          <div class="member-list">
            @for (m of filteredMembers(); track m.id) {
              <label class="member" [class.on]="inOfficers(m.id)">
                <span class="avatar" aria-hidden="true">{{ memberInitials(m.display_name) }}</span>
                <span class="grow">
                  <span class="name-row">
                    <strong>{{ m.display_name }}</strong>
                    @if (m.is_head) { <span class="chip brand">{{ i18n.t({ th: 'หัวหน้า', en: 'Head' }) }}</span> }
                  </span>
                  <span class="muted small block">{{ m.position || i18n.t({ th: 'เจ้าหน้าที่', en: 'Officer' }) }}@if (m.staff_no) { · {{ m.staff_no }} }</span>
                  <span class="muted small block">{{ m.zones.length }} {{ i18n.t({ th: 'โซน', en: 'zones' }) }} · {{ i18n.t({ th: 'ตรวจล่าสุด ', en: 'last check ' }) }}{{ m.last_inspection_at ? updated(m.last_inspection_at) : i18n.t({ th: 'ยังไม่มี', en: 'none yet' }) }}</span>
                </span>
                <input class="check" type="checkbox" [checked]="inOfficers(m.id)" (change)="toggleOfficer(m.id, $any($event.target).checked, $event)" [attr.aria-label]="m.display_name" />
              </label>
            } @empty {
              <p class="muted small">
                @if (memberQ().trim()) {
                  {{ i18n.t({ th: 'ไม่พบชื่อที่ค้น — ลองพิมพ์ชื่อหรือเลขประจำตัวบางส่วน', en: 'No match — try part of the name or staff no.' }) }}
                } @else {
                  {{ i18n.t({ th: 'ยังไม่มีสมาชิกที่ใช้งานได้ — ให้เจ้าหน้าที่สมัครด้วยรหัสกลุ่ม แล้วอนุมัติที่หน้า', en: 'No active members yet — officers sign up with the group code, then you approve them on' }) }}
                  <a [routerLink]="url('L05')">{{ i18n.t({ th: 'สมาชิก', en: 'Members' }) }}</a>
                }
              </p>
            }
          </div>
          <p class="muted small easy-hide">{{ i18n.t({ th: 'คนที่ยังไม่ได้อนุมัติจะไม่อยู่ในรายการ · หัวหน้าตรวจตู้ได้เฉพาะโซนที่ใส่ตัวเองไว้ · การเปลี่ยนแปลงบันทึกทันที', en: 'Members not yet approved are not listed · heads can only inspect zones they are in · changes save immediately' }) }}</p>
        </section>
        }
      }
    </div>
  `,
  styles: `
    .browse {
      align-self: flex-start;
    }
    .warn-text {
      color: var(--orange);
      font-weight: 700;
    }
    .hit,
    .officer {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
      border-block-start: 1px solid var(--line);
    }
    .officer input {
      inline-size: 22px;
      block-size: 22px;
    }
    .block {
      display: block;
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .danger-outline {
      color: var(--sos);
    }
  `,
})
export class HeadZoneEdit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(HeadApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  protected readonly display = inject(DisplaySettings);
  protected readonly url = screenUrl;
  protected readonly maxWindows = MAX_WINDOWS;
  protected readonly tab = signal<'settings' | 'houses' | 'officers'>('settings');
  protected readonly mapSelected = signal<string | null>(null);
  protected readonly memberQ = signal('');
  protected readonly savingOfficers = signal(false);
  private initialTabSet = false;

  protected readonly filteredMembers = computed(() => {
    const q = this.memberQ().trim().toLowerCase();
    if (!q) return this.members();
    return this.members().filter((m) => `${m.display_name} ${m.position} ${m.staff_no}`.toLowerCase().includes(q));
  });
  /** ?zone=<uuid>|new */
  readonly zoneParam = input<string | undefined>(undefined, { alias: 'zone' });
  protected readonly isNew = computed(() => !this.zoneParam() || this.zoneParam() === 'new');

  protected readonly zone = signal<ZoneDetail | null>(null);
  protected readonly members = signal<Member[]>([]);
  protected readonly name = signal('');
  protected readonly windows = signal<[string, string][]>([]);
  protected readonly province = signal('');
  protected readonly district = signal('');
  protected readonly subdistrict = signal('');
  protected readonly from = signal('06:00');
  protected readonly to = signal('09:00');
  protected readonly error = signal<Tr | null>(null);
  protected readonly busy = signal(false);
  protected readonly q = signal('');
  protected readonly hits = signal<HouseHit[]>([]);
  protected readonly searched = signal(false);
  protected readonly onlyUnzoned = signal(false);
  protected readonly onlyOnline = signal(false);
  protected readonly mode = signal<'search' | 'browse'>('search');
  protected readonly searchedFor = signal('');
  protected readonly addable = computed(() => this.hits().filter((h) => !this.inZone(h.box_id) && !this.pendingHere(h.box_id)));
  /** ติ๊กบ้านหลายหลังแล้วส่งคำขอครั้งเดียว (แทนการกด + ทีละหลัง) */
  protected readonly picked = signal<Set<string>>(new Set());
  protected readonly searching = signal(false);
  protected readonly searchFailed = signal(false);
  protected readonly savingHouses = signal(false);
  private autoBrowsed = false;

  /** หมุดแผนที่: บ้านในโซน + ผลค้นหา (เฉพาะที่มีพิกัด) */
  protected readonly mapPoints = computed<HouseMapPoint[]>(() => {
    const pts: HouseMapPoint[] = [];
    const zoneIds = new Set<string>();
    for (const h of this.zone()?.houses ?? []) {
      if (h.lat == null || h.lng == null) continue;
      zoneIds.add(h.box_id);
      pts.push({ box_id: h.box_id, label: h.house_no ?? h.box_id, lat: Number(h.lat), lng: Number(h.lng), kind: h.pending ? 'pending' : 'zone' });
    }
    let n = 0;
    for (const h of this.hits()) {
      if (h.lat == null || h.lng == null || zoneIds.has(h.box_id)) continue;
      n += 1;
      pts.push({
        box_id: h.box_id,
        label: h.house_no ?? h.box_id,
        lat: Number(h.lat),
        lng: Number(h.lng),
        kind: 'hit',
        n,
        picked: this.picked().has(h.box_id),
      });
    }
    return pts;
  });

  constructor() {
    effect(() => {
      const id = this.zoneParam();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string | undefined): Promise<void> {
    // โหลดซ้ำโซนเดิม (หลังบันทึก) ไม่ล้างจอ — ล้างเฉพาะตอนเปลี่ยนโซน ไม่งั้นจอว่างชั่วครู่และปุ่มที่กดระหว่างนั้นหาย
    if (this.zone()?.id !== id) {
      this.zone.set(null);
      this.mapSelected.set(null);
    }
    this.error.set(null);
    this.members.set(await this.api.members('active').catch(() => this.members()));
    if (!id || id === 'new') {
      this.name.set('');
      this.windows.set([]);
      this.province.set('');
      this.district.set('');
      this.subdistrict.set('');
      if (!this.initialTabSet) {
        this.initialTabSet = true;
        this.tab.set('settings');
      }
      return;
    }
    try {
      const z = await this.api.zone(id);
      this.zone.set(z);
      if (!this.initialTabSet) {
        this.initialTabSet = true;
        this.tab.set('houses');
      }
      this.name.set(z.name);
      this.windows.set(z.windows);
      this.province.set(z.area?.province ?? '');
      this.district.set(z.area?.district ?? '');
      this.subdistrict.set(z.area?.subdistrict ?? '');
      // เปิดโซนครั้งแรก → โชว์บ้านที่ยังไม่มีใครดูแลเลย (ไม่ต้องกดปุ่มก่อน)
      if (!this.autoBrowsed && z.area) {
        this.autoBrowsed = true;
        void this.browse();
      }
    } catch {
      void this.router.navigateByUrl(screenUrl('L06'));
    }
  }

  protected addWindow(): void {
    const [f, t] = [this.from(), this.to()];
    if (!/^\d{2}:\d{2}$/.test(f) || !/^\d{2}:\d{2}$/.test(t) || f >= t) {
      this.error.set(ZONE_ERROR['WINDOWS_INVALID']);
      return;
    }
    this.error.set(null);
    this.windows.update((w) => [...w, [f, t] as [string, string]].sort((a, b) => a[0].localeCompare(b[0])));
  }

  protected removeWindow(i: number): void {
    this.windows.update((w) => w.filter((_, j) => j !== i));
  }

  /** POST /agency/zones (สร้าง) · PATCH /agency/zones/:id (ชื่อ + เวลาตรวจ) */
  protected async saveBasics(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.isNew()) {
        const z = await this.api.createZone(this.name().trim(), this.windows(), this.areaBody());
        this.toast.show({ th: 'สร้างโซนแล้ว — เพิ่มบ้านและเจ้าหน้าที่ต่อ', en: 'Zone created — now add houses and officers' });
        void this.router.navigate([screenUrl('L07')], { queryParams: { zone: z.id }, replaceUrl: true });
      } else {
        await this.api.updateZone(this.zone()!.id, { name: this.name().trim(), windows: this.windows(), ...this.areaBody() });
        this.toast.show({ th: 'บันทึกแล้ว — ตู้ได้เวลาตรวจใหม่ตอนรายงานครั้งถัดไป', en: 'Saved — boxes get the new hours at their next report' });
        await this.load(this.zone()!.id);
      }
    } catch (err) {
      const e = apiError(err);
      this.error.set(ZONE_ERROR[e.code ?? ''] ?? { th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save' });
    } finally {
      this.busy.set(false);
    }
  }

  /** ว่างทั้งสามช่อง = ล้างพื้นที่ · ต้องมีจังหวัดและเขต/อำเภอคู่กัน */
  private areaBody(): { province: string; district: string; subdistrict: string } {
    return { province: this.province().trim(), district: this.district().trim(), subdistrict: this.subdistrict().trim() };
  }

  /** ปุ่ม "ไปตั้งพื้นที่" — สลับไปแท็บตั้งค่าแล้วเลื่อนไปการ์ดพื้นที่ */
  protected goArea(): void {
    this.tab.set('settings');
    setTimeout(() => document.getElementById('zone-area')?.scrollIntoView({ block: 'start' }), 0);
  }

  protected readonly areaReady = computed(() => !!this.zone()?.area);

  protected async search(): Promise<void> {
    const q = this.q().trim();
    if (!q) return this.browse();
    this.mode.set('search');
    this.searchedFor.set(q);
    this.picked.set(new Set());
    this.searching.set(true);
    this.searchFailed.set(false);
    try {
      this.hits.set(await this.api.searchHouses(q, { unzoned: this.onlyUnzoned(), online: this.onlyOnline(), zone: this.zone()?.id }));
    } catch {
      this.hits.set([]);
      this.searchFailed.set(true);
    } finally {
      this.searched.set(true);
      this.searching.set(false);
    }
  }

  /** บ้านที่เจ้าของผูกตู้แล้วแต่ยังไม่มีหน่วยงานไหนดูแล */
  protected async browse(): Promise<void> {
    this.mode.set('browse');
    this.picked.set(new Set());
    this.searching.set(true);
    this.searchFailed.set(false);
    try {
      this.hits.set(await this.api.searchHouses('', { unzoned: true, online: this.onlyOnline(), zone: this.zone()?.id }));
    } catch {
      this.hits.set([]);
      this.searchFailed.set(true);
    } finally {
      this.searched.set(true);
      this.searching.set(false);
    }
  }

  /** เปลี่ยนตัวกรอง → ค้นรอบเดิมใหม่ */
  protected refilter(): void {
    if (!this.searched()) return;
    void (this.mode() === 'browse' ? this.browse() : this.search());
  }

  protected activeCount(houses: { pending: boolean }[]): number {
    return houses.filter((h) => !h.pending).length;
  }

  protected pendingHere(boxId: string): boolean {
    return !!this.zone()?.houses.some((h) => h.box_id === boxId && h.pending);
  }

  protected statusText(h: HouseHit): string {
    const t: Record<string, Tr> = {
      online: { th: 'ตู้ออนไลน์', en: 'box online' },
      sleeping: { th: 'ตู้พัก', en: 'box sleeping' },
      offline: { th: 'ตู้ไม่ออนไลน์', en: 'box offline' },
      service_closed: { th: 'ปิดบริการ', en: 'service closed' },
      unbound: { th: 'ยังไม่ผูก', en: 'not bound' },
    };
    return this.i18n.t(t[h.box_status] ?? { th: h.box_status, en: h.box_status });
  }

  protected inZone(boxId: string): boolean {
    return !!this.zone()?.houses.some((h) => h.box_id === boxId);
  }

  protected zonesOf(h: HouseHit): string {
    return h.zones.map((z) => (z.mine ? z.zone_name + this.i18n.t({ th: ' (ของเรา)', en: ' (ours)' }) : `${z.agency_name} / ${z.zone_name}`)).join(', ');
  }

  /** ชุดบ้านล่าสุดที่กดไว้ (ก่อนโหลดใหม่เสร็จ) + คิวบันทึก — กดเพิ่ม/เอาออกหลายหลังติดกันต้องไม่หาย */
  private houseIds: string[] | null = null;
  private houseSave: Promise<void> = Promise.resolve();
  private currentHouses(): string[] {
    return this.houseIds ?? this.zone()?.houses.map((h) => h.box_id) ?? [];
  }

  /** เลือกได้เฉพาะบ้านที่ยังไม่อยู่ในโซนนี้และยังไม่มีคำขอค้าง */
  protected selectable(h: HouseHit): boolean {
    return !this.inZone(h.box_id) && !this.pendingHere(h.box_id);
  }

  protected togglePick(boxId: string): void {
    this.mapSelected.set(boxId);
    this.picked.update((set) => {
      const next = new Set(set);
      if (next.has(boxId)) next.delete(boxId);
      else next.add(boxId);
      return next;
    });
  }

  protected selectAllPicks(): void {
    this.picked.set(new Set(this.addable().map((h) => h.box_id)));
  }

  protected clearPicks(): void {
    this.picked.set(new Set());
  }

  /** ส่งคำขอทั้งหมดที่ติ๊กในครั้งเดียว (เจ้าของบ้านต้องกดยอมรับก่อน) */
  protected async addPicked(): Promise<void> {
    const ids = [...this.picked()].filter((id) => !this.currentHouses().includes(id));
    if (!ids.length || this.savingHouses()) return;
    const ok = await this.confirm.ask({
      title: { th: `ส่งคำขอเพิ่ม ${ids.length} หลัง?`, en: `Send requests for ${ids.length} ${ids.length === 1 ? 'house' : 'houses'}?` },
      body: {
        th: 'เจ้าของบ้านแต่ละหลังต้องกดยอมรับก่อน บ้านจึงเข้าโซน — ระหว่างรอจะแสดงเป็น “รอเจ้าของบ้านยืนยัน”',
        en: 'Each owner must accept before the house joins the zone. Until then it shows as “awaiting owner”.',
      },
      confirm: { th: 'ส่งคำขอ', en: 'Send requests' },
    });
    if (!ok) return;
    this.savingHouses.set(true);
    await this.setHouses([...this.currentHouses(), ...ids]);
    this.picked.set(new Set());
    this.savingHouses.set(false);
  }

  /** ลบบ้าน/ยกเลิกคำขอ — ต้องยืนยัน (แตะพลาดแล้วบ้านหลุดจากโซน) */
  protected async askRemoveHouse(h: ZoneHouse): Promise<void> {
    const ok = await this.confirm.ask({
      title: h.pending
        ? { th: `ยกเลิกคำขอของบ้าน ${h.house_no ?? h.box_id}?`, en: `Cancel the request for ${h.house_no ?? h.box_id}?` }
        : { th: `นำบ้าน ${h.house_no ?? h.box_id} ออกจากโซน?`, en: `Remove ${h.house_no ?? h.box_id} from this zone?` },
      body: h.pending
        ? { th: 'เจ้าของบ้านจะไม่ได้รับคำขอให้ยอมรับอีก (เพิ่มใหม่ได้ภายหลัง)', en: 'The owner will no longer see this request (you can add it again later).' }
        : { th: 'บ้านหลังนี้จะไม่ถูกตรวจและไม่รับ SOS ของโซนนี้ (ประวัติเดิมยังอยู่)', en: 'This house will no longer be inspected or receive SOS for this zone (history is kept).' },
      confirm: h.pending ? { th: 'ยกเลิกคำขอ', en: 'Cancel request' } : { th: 'นำออก', en: 'Remove' },
      danger: true,
    });
    if (ok) await this.removeHouse(h.box_id);
  }

  protected removeHouse(boxId: string): Promise<void> {
    return this.setHouses(this.currentHouses().filter((id) => id !== boxId));
  }

  /** PUT /agency/zones/:id/houses — แทนที่ทั้งชุด (ทีละคำขอ ใช้ชุดล่าสุดเสมอ) */
  private setHouses(ids: string[]): Promise<void> {
    const z = this.zone();
    if (!z) return Promise.resolve();
    this.houseIds = ids;
    this.houseSave = this.houseSave.then(async () => {
      if (this.houseIds !== ids) return; // มีการกดใหม่กว่า — รอบนั้นบันทึกชุดล่าสุดเอง
      try {
        await this.api.setHouses(z.id, ids);
        if (this.houseIds !== ids) return;
        this.houseIds = null;
        await this.load(z.id);
        if (this.searched()) await (this.mode() === 'browse' ? this.browse() : this.search());
      } catch (err) {
        this.houseIds = null;
        await this.load(z.id).catch(() => undefined);
        const e = apiError(err);
        this.toast.show(ZONE_ERROR[e.code ?? ''] ?? { th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save — try again' });
      } finally {
        if (this.houseIds === null) this.savingHouses.set(false);
      }
    });
    return this.houseSave;
  }

  protected inOfficers(id: string): boolean {
    return !!this.zone()?.officers.some((o) => o.id === id);
  }

  /** ชุดเจ้าหน้าที่ล่าสุดที่ติ๊กไว้ (ก่อนโหลดใหม่เสร็จ) + คิวบันทึก — ติ๊กหลายคนติดกันต้องไม่หายคนใดคนหนึ่ง */
  private officerIds: string[] | null = null;
  private officerSave: Promise<void> = Promise.resolve();

  protected memberInitials(name: string): string {
    return name.replace(/[.\s]/g, '').slice(0, 2).toUpperCase();
  }

  /** PUT /agency/zones/:id/officers — แทนที่ทั้งชุด */
  protected async toggleOfficer(id: string, on: boolean, event?: Event): Promise<void> {
    const z = this.zone();
    if (!z) return;
    const current = this.officerIds ?? z.officers.map((o) => o.id);
    const next = current.filter((x) => x !== id);
    if (on) next.push(id);
    if (!on) {
      const leavingNone = next.length === 0;
      const ok = await this.confirm.ask({
        title: { th: 'นำเจ้าหน้าที่ออกจากโซน?', en: 'Remove this officer from the zone?' },
        body: leavingNone
          ? { th: 'โซนนี้จะไม่มีเจ้าหน้าที่ตรวจเลย — บ้านในโซนจะไม่ถูกตรวจและไม่ได้รับ SOS', en: 'This zone will have no officers — houses will not be inspected and SOS will not reach anyone.' }
          : { th: 'เจ้าหน้าที่คนนี้จะไม่เห็นบ้านในโซนและไม่ได้รับ SOS ของโซนนี้อีก', en: 'They will no longer see houses in this zone or receive its SOS.' },
        confirm: { th: 'นำออก', en: 'Remove' },
        danger: true,
      });
      if (!ok) {
        if (event?.target instanceof HTMLInputElement) event.target.checked = true;
        return;
      }
    }
    this.savingOfficers.set(true);
    const ids = current.filter((x) => x !== id);
    if (on) ids.push(id);
    this.officerIds = ids;
    this.officerSave = this.officerSave.then(async () => {
      if (this.officerIds !== ids) return; // มีการติ๊กใหม่กว่า — รอบนั้นบันทึกชุดล่าสุดเอง
      try {
        await this.api.setOfficers(z.id, ids);
        if (this.officerIds === ids) {
          this.officerIds = null;
          await this.load(z.id);
        }
      } catch {
        this.officerIds = null;
        await this.load(z.id).catch(() => undefined);
        this.toast.show({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save — try again' });
      } finally {
        if (this.officerIds === null) this.savingOfficers.set(false);
      }
    });
    return this.officerSave;
  }

  /** โหมดละเอียด: เวลารวมของทุกช่วงในหนึ่งวัน (คำนวณจากช่วงที่ตั้งไว้จริง) */
  protected durationText(): string {
    const mins = this.windows().reduce((n, [f, t]) => n + this.toMinutes(t) - this.toMinutes(f), 0);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return this.i18n.t({ th: `${h} ชม. ${m} น.`, en: `${h} h ${m} m` });
  }

  protected updated(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok' });
  }

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  protected async remove(): Promise<void> {
    const z = this.zone();
    if (
      !z ||
      !(await this.confirm.ask({
        title: { th: `ลบโซน "${z.name}"?`, en: `Delete zone "${z.name}"?` },
        body: {
          th: 'บ้านและเจ้าหน้าที่ในโซนนี้จะถูกถอดออกจากโซน (ข้อมูลบ้านไม่ถูกลบ)',
          en: 'Houses and officers are removed from this zone (house records are kept).',
        },
        confirm: { th: 'ลบโซน', en: 'Delete zone' },
        danger: true,
      }))
    )
      return;
    try {
      await this.api.removeZone(z.id);
      void this.router.navigateByUrl(screenUrl('L06'));
    } catch {
      this.toast.show({ th: 'ลบไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t delete' });
    }
  }
}

/** L07-b / L07-c (เพิ่มบ้าน / เพิ่มเจ้าหน้าที่) — รวมอยู่ในหน้า L07 แล้ว */
@Component({
  selector: 'app-head-zone-picker',
  template: '',
})
export class HeadZonePicker {
  constructor() {
    const router = inject(Router);
    const zone = new URLSearchParams(location.search).get('zone');
    void router.navigate([screenUrl('L07')], { queryParams: zone ? { zone } : {}, replaceUrl: true });
  }
}
