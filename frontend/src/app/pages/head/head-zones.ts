import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { HeadApi, type HouseHit, type Member, type Zone, type ZoneDetail, type ZoneHouse } from '../../core/head-api';
import { DisplaySettings } from '../../core/display-settings';
import { I18n, type Tr } from '../../core/i18n';
import { fmtWhen, fmtWhenSec } from '../../core/time';
import { Toast } from '../../core/toast';
import { Confirm } from '../../shared/confirm-dialog';
import { HousesMap, type HouseMapPoint } from '../../shared/houses-map';
import { EmptyState, LoadError, LoadingRows } from '../../shared/state-view';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';
import { PlacePicker, type PlaceChange } from '../../shared/place-picker';
import { TimeSelect } from '../../shared/time-select';
import { Icon } from '../../shared/icon';
import { liveRefresh } from '../../core/live-refresh';

// หัวหน้า: L06 โซนทั้งหมด · L07 แก้โซน (ชื่อ · เวลาตรวจ · บ้าน · เจ้าหน้าที่) — ใช้ API จริง (api.md §8.3)
// บ้านหลังเดียวอยู่ในโซนของหลายหน่วยงานได้ · ตู้รับเวลาตรวจใหม่ตอน boot / รายงานรายวัน

const MAX_WINDOWS = 4;
/** ความยาวสูงสุดของแต่ละช่วงเวลาตรวจ (นาที) — ตรงกับ backend MAX_WINDOW_MINUTES (✅ ผู้ใช้สั่ง 2026-11-20) */
export const MAX_WINDOW_MINUTES = 30;

/**
 * ตรวจช่วงเวลาตรวจใหม่ก่อนเพิ่ม: "HH:mm" ถูกต้อง · เริ่มก่อนจบ · ยาวไม่เกิน 30 นาที · ไม่ทับช่วงที่มีอยู่
 * เทียบสตริงได้ตรง ๆ เพราะ 24 ชม. ความยาวเท่ากัน (ช่วงที่ชิดกัน เช่น 06–09 กับ 09–10 ถือว่าไม่ทับ)
 */
export function windowProblem(from: string, to: string, existing: [string, string][]): boolean {
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to) || from >= to) return true;
  if (tooLong(from, to)) return true;
  return existing.some(([a, b]) => from < b && a < to);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** ช่วงยาวเกิน 30 นาทีหรือไม่ (ใช้ทั้งตอนตรวจแถวและก่อนบันทึก) */
export function tooLong(from: string, to: string): boolean {
  return toMinutes(to) - toMinutes(from) > MAX_WINDOW_MINUTES;
}

function toHhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * ช่วงใหม่ที่จะเพิ่ม: ยังไม่มี → 06:00–06:30 · มีแล้ว → ต่อจากช่วงที่จบช้าสุด 30 นาที (ไม่เกิน 23:59)
 * ถ้าท้ายวันเต็มแล้วให้ไปเริ่มก่อนช่วงแรก — ผู้ใช้ปรับต่อในแถวได้เสมอ
 */
export function nextWindow(existing: [string, string][]): [string, string] {
  const len = MAX_WINDOW_MINUTES;
  if (!existing.length) return ['06:00', '06:30'];
  const lastEnd = Math.max(...existing.map(([, t]) => toMinutes(t)));
  if (lastEnd < 23 * 60 + 59) return [toHhmm(lastEnd), toHhmm(Math.min(lastEnd + len, 23 * 60 + 59))];
  const firstStart = Math.min(...existing.map(([f]) => toMinutes(f)));
  if (firstStart >= len) return [toHhmm(firstStart - len), toHhmm(firstStart)];
  return ['06:00', '06:30']; // ไม่มีช่องว่าง — แถวจะขึ้น "ทับกับช่วงอื่น" ให้ผู้ใช้ปรับเอง
}

const ZONE_ERROR: Record<string, Tr> = {
  ZONE_AREA_INVALID: { th: 'ต้องใส่จังหวัดและเขต/อำเภอคู่กัน (หรือเว้นว่างทั้งหมด)', en: 'Province and district are required together (or leave all blank)' },
  WINDOWS_INVALID: { th: 'เวลาตรวจไม่ถูกต้อง (ไม่ทับกัน · เริ่มก่อนจบ · ไม่ข้ามเที่ยงคืน · ช่วงละไม่เกิน 30 นาที · ไม่เกิน 4 ช่วง)', en: 'Invalid patrol hours (no overlap · start before end · no midnight crossing · max 30 min each · max 4)' },
  ZONE_NAME_TAKEN: { th: 'มีโซนชื่อนี้แล้ว', en: 'A zone with this name exists' },
  HOUSE_NOT_FOUND: { th: 'เพิ่มไม่ได้ เพราะมีบ้านที่ไม่พบหรือยังไม่ผูกตู้ — ค้นบ้านใหม่แล้วเลือกอีกครั้ง', en: 'Can’t add: a house was not found or has no mailbox yet — search again and re-select' },
  HOUSE_INCOMPLETE: { th: 'เพิ่มไม่ได้ เพราะมีบ้านที่ข้อมูลยังไม่ครบ (ที่อยู่ / จังหวัด-เขต-แขวง / หมุด) — ให้เจ้าของบ้านกรอกให้ครบก่อน', en: 'Can’t add: a house has incomplete details (address / province-district-subdistrict / pin) — ask the owner to complete them first' },
  PLACE_INVALID: { th: 'พื้นที่ไม่ตรงรายชื่อมาตรฐาน — เลือกจังหวัด เขต/อำเภอ แขวง/ตำบลจากรายการ', en: 'Area is not in the standard list — pick province, district and subdistrict from the dropdowns' },
  PATROL_HOURS_LIMIT: { th: 'เวลาตรวจรวมต่อวันของบางตู้จะเกินเพดาน (ตู้ตื่นกินไฟมาก) — ลดเวลาตรวจลง หรือให้แอดมินขยายเพดานของตู้นั้น', en: 'A box would exceed its daily patrol-hours limit (an awake box uses a lot of power) — shorten the hours, or ask the admin to raise that box’s limit' },
  OFFICER_NOT_MEMBER: { th: 'เพิ่มไม่ได้ เพราะมีคนที่ไม่ได้เป็นสมาชิกของหน่วยงาน — โหลดรายชื่อใหม่แล้วเลือกอีกครั้ง', en: 'Can’t add: someone is not a member of this agency — reload the list and re-select' },
};

// ── L06 · โซน ───────────────────────────────────────────────

@Component({
  selector: 'app-head-zones',
  imports: [RouterLink, PageHeader, EmptyState, LoadingRows],
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
        </a>
      } @empty {
        @if (zonesFailed()) {
          <app-empty-state kind="error" [title]="i18n.t({ th: 'โหลดรายการโซนไม่สำเร็จ', en: 'Couldn’t load zones' })" (retry)="ngOnInit()" />
        } @else if (loading()) {
          <app-loading-rows [rows]="2" [label]="i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' })" />
        } @else {
          <app-empty-state [title]="i18n.t({ th: 'ยังไม่มีโซน', en: 'No zones yet' })" [hint]="i18n.t({ th: 'โซนคือกลุ่มบ้านที่เจ้าหน้าที่ดูแล — สร้างโซนแรกเพื่อเริ่ม', en: 'A zone is a group of houses your officers cover — create the first one to begin' })">
            <a class="btn" [routerLink]="url('L07')" [queryParams]="{ zone: 'new' }">{{ i18n.t({ th: 'สร้างโซน', en: 'Create a zone' }) }}</a>
          </app-empty-state>
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
      min-block-size: 44px;
      padding: 6px 14px;
      font-size: var(--fs-sm);
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
        font-size: var(--fs-md);
      }
    }
    .push {
      margin-inline-start: auto;
    }
    .warn-text {
      color: var(--orange);
      font-weight: var(--fw-strong);
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
    return fmtWhen(z.updated_at, this.i18n.lang());
  }
}

// ── L07 · แก้โซน / สร้างโซน ──────────────────────────────────────

@Component({
  selector: 'app-head-zone-edit',
  imports: [PageHeader, RouterLink, LoadError, EmptyState, LoadingRows, HousesMap, PlacePicker, TimeSelect, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './head-zone-edit.scss',
  template: `
    <app-page-header [caption]="isNew() ? i18n.t({ th: 'สร้างโซน', en: 'New zone' }) : i18n.t({ th: 'แก้ไขโซน', en: 'Edit zone' })" [title]="name() || i18n.t({ th: 'โซนใหม่', en: 'New zone' })" [back]="url('L06')" />
    <div class="stack grow">
      @if (zone(); as z) {
        <div class="tabs" role="tablist" [attr.aria-label]="i18n.t({ th: 'แท็บของโซน', en: 'Zone tabs' })">
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'settings'" [class.active]="tab() === 'settings'" (click)="tab.set('settings')">{{ i18n.t({ th: 'ตั้งค่า', en: 'Settings' }) }}</button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'houses'" [class.active]="tab() === 'houses'" (click)="tab.set('houses')">{{ i18n.t({ th: 'บ้าน', en: 'Houses' }) }} ({{ z.houses.length }})</button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'officers'" [class.active]="tab() === 'officers'" (click)="tab.set('officers')">{{ i18n.t({ th: 'เจ้าหน้าที่', en: 'Officers' }) }} ({{ z.officers.length }})</button>
        </div>
      }
      @if (!isNew() && !zone()) {
        <!-- ระหว่างโหลดโซนเดิม ห้ามโชว์ฟอร์มว่าง (ดูเหมือนโซนใหม่ แล้วกดบันทึกทับได้) -->
        <app-loading-rows [rows]="3" [label]="i18n.t({ th: 'กำลังโหลดโซน…', en: 'Loading zone…' })" />
      } @else if (tab() === 'settings' || isNew()) {
      <section class="card stack">
        <label class="field">
          <span>{{ i18n.t({ th: 'ชื่อโซน', en: 'Zone name' }) }}</span>
          <input maxlength="50" [value]="name()" (input)="name.set($any($event.target).value)" />
        </label>
        <fieldset class="stack area" id="zone-area">
          <legend><strong>{{ i18n.t({ th: 'พื้นที่ที่โซนนี้ดูแล', en: 'Area this zone covers' }) }}</strong></legend>
          <span class="muted small easy-hide">{{ i18n.t({ th: 'ตอนเพิ่มบ้าน จะเห็นเฉพาะบ้านที่อยู่ในพื้นที่นี้', en: 'When adding houses you will only see houses inside this area' }) }}</span>
          <app-place-picker [province]="province()" [district]="district()" [subdistrict]="subdistrict()" [subdistrictRequired]="false" (changed)="setArea($event)" />
          @if (zone()?.area; as a) {
          }
        </fieldset>
        <fieldset class="stack hours">
          <legend class="head">
            <strong>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</strong>
            <span class="muted small">{{ i18n.t({ th: 'เวลาไทย · 24 ชม.', en: 'Thai time · 24 h' }) }}</span>
          </legend>
          <!-- แก้ช่วงเวลาตรงในแถวได้เลย (เดิมต้องเลือกเวลาแล้วกด "เพิ่มช่วง" อีกปุ่มก่อนบันทึก — ลืมกดแล้วเวลาหาย) -->
          <div class="win-list" aria-live="polite">
            @for (w of windows(); track $index; let i = $index) {
              @let bad = rowProblem(i);
              <div class="win-row" [class.bad]="bad">
                <span class="win-n" aria-hidden="true">{{ i + 1 }}</span>
                <span class="win-from" aria-hidden="true">{{ i18n.t({ th: 'เริ่ม', en: 'from' }) }}</span>
                <app-time-select [value]="w[0]" [label]="i18n.t({ th: 'ช่วงที่ ' + (i + 1) + ' เริ่ม', en: 'Window ' + (i + 1) + ' from' })" (changed)="setWindow(i, 0, $event)" />
                <span class="win-to">{{ i18n.t({ th: 'ถึง', en: 'to' }) }}</span>
                <app-time-select [value]="w[1]" [label]="i18n.t({ th: 'ช่วงที่ ' + (i + 1) + ' ถึง', en: 'Window ' + (i + 1) + ' to' })" (changed)="setWindow(i, 1, $event)" />
                <button type="button" class="icon-btn" (click)="removeWindow(i)" [attr.aria-label]="i18n.t({ th: 'ลบช่วงที่ ', en: 'Remove window ' }) + (i + 1)">
                  <app-icon name="close" [size]="18" />
                </button>
                @if (bad) {
                  <span class="win-err small">{{ i18n.t(bad) }}</span>
                }
              </div>
            } @empty {
              <p class="warn-text small">{{ i18n.t({ th: 'ยังไม่มีเวลาตรวจ — ตู้จะไม่รับงานตรวจ', en: 'No patrol hours — boxes won’t take inspections' }) }}</p>
            }
          </div>
          @if (windows().length < maxWindows) {
            <button type="button" class="btn secondary add-win" (click)="addWindow()">
              <app-icon name="plus" [size]="18" />{{ i18n.t({ th: 'เพิ่มช่วงเวลา', en: 'Add a window' }) }}
            </button>
          }
          <p class="muted small">
            @if (windows().length) {
              <span [class.warn-text]="overLimit()">{{ i18n.t({ th: 'รวม ', en: 'Total ' }) }}{{ durationText() }}{{ i18n.t({ th: '/วัน', en: '/day' }) }}@if (zone()?.patrol_limit_hours; as lim) { {{ i18n.t({ th: '(เพดาน ', en: '(limit ' }) }}{{ lim }} {{ i18n.t({ th: 'ชม.)', en: 'h)' }) }} }</span> ·
            }
            {{ i18n.t({ th: 'ข้ามเที่ยงคืนให้แยกเป็น 2 ช่วง · ตู้ตื่นเฉพาะช่วงตรวจเพื่อประหยัดไฟ', en: 'Split overnight into 2 windows · boxes wake only in these hours to save power' }) }}
          </p>
        </fieldset>
        @if (error(); as e) {
          <p class="err small" role="alert">{{ i18n.t(e) }}</p>
        }
        @if (dirty() && !isNew()) {
          <p class="dirty small" role="status">{{ i18n.t({ th: 'มีการแก้ไขที่ยังไม่บันทึก', en: 'You have unsaved changes' }) }}</p>
        }
        <button type="button" class="btn" [disabled]="busy() || !name().trim() || (!isNew() && !dirty())" (click)="saveBasics()">
          {{ busy() ? i18n.t({ th: 'กำลังบันทึก…', en: 'Saving…' }) : isNew() ? i18n.t({ th: 'สร้างโซน', en: 'Create zone' }) : i18n.t({ th: 'บันทึกการตั้งค่า', en: 'Save settings' }) }}
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
              <div class="map-legend muted small" [attr.aria-label]="i18n.t({ th: 'คำอธิบายหมุด', en: 'Pin legend' })">
                <span><i class="lg ok"></i>{{ i18n.t({ th: 'อยู่ในโซนนี้', en: 'In this zone' }) }}</span>
                <span><i class="lg warn"></i>{{ i18n.t({ th: 'รอเจ้าของยืนยัน', en: 'Waiting for owner' }) }}</span>
                <span><i class="lg picked"></i>{{ i18n.t({ th: 'เลือกอยู่', en: 'Selected' }) }}</span>
              </div>
            } @else {
              <p class="muted small">{{ i18n.t({ th: 'ยังไม่มีบ้านที่ปักหมุดพิกัด — เจ้าของบ้านต้องปักหมุดในหน้าตั้งค่าตู้ก่อน จึงจะเห็นบนแผนที่', en: 'No house has a pin yet — owners must pin their house in the mailbox settings before it appears on the map.' }) }}</p>
            }
          }
          <div class="house-list">
            @for (h of z.houses; track h.box_id) {
              <div class="house-row" [class.pending]="h.pending">
                <span class="grow">
                  <strong>{{ h.house_no ?? h.box_id }}</strong>
                  <span class="muted small block">{{ h.box_id }}{{ h.box_name ? ' · ' + h.box_name : '' }}</span>
                  @if (h.area) { <span class="muted small block">{{ h.area }}</span> }
                </span>
                @if (h.pending) {
                  <span class="chip warn">{{ i18n.t({ th: 'รอเจ้าของบ้านยืนยัน', en: 'Awaiting owner' }) }}</span>
                } @else {
                  <span class="chip ok">{{ i18n.t({ th: 'อยู่ในโซน', en: 'In zone' }) }}</span>
                }
                <button type="button" class="icon-btn" (click)="askRemoveHouse(h)" [attr.aria-label]="(h.pending ? i18n.t({ th: 'ถอนคำขอ ', en: 'Withdraw request ' }) : i18n.t({ th: 'นำออก ', en: 'Remove ' })) + (h.house_no ?? h.box_id) + (h.box_name ? ' ' + h.box_name : '')">
                  <app-icon name="close" [size]="18" />
                </button>
              </div>
            } @empty {
              <app-empty-state compact [title]="i18n.t({ th: 'ยังไม่มีบ้านในโซน', en: 'No houses in this zone yet' })" [hint]="areaReady() ? i18n.t({ th: 'เลือกบ้านจากรายการด้านล่าง แล้วกดส่งคำขอ', en: 'Pick houses from the list below, then send requests' }) : ''" />
            }
          </div>
        </section>

        <!-- เพิ่มบ้าน แยกการ์ดจากรายการบ้านในโซน — ไม่ปนกันว่าแถวไหน "อยู่แล้ว" แถวไหน "เลือกเพื่อเพิ่ม" -->
        <section class="card stack">
          <div class="head">
            <strong>{{ i18n.t({ th: 'เพิ่มบ้านเข้าโซน', en: 'Add houses' }) }}</strong>
            @if (zone()?.area; as a) {
              <span class="muted small area-tag">{{ a.district }}</span>
            }
          </div>
          @if (!areaReady()) {
            <p class="info-box small" role="status">
              {{ i18n.t({ th: 'โซนนี้ยังไม่ได้ตั้งจังหวัด/อำเภอ — ไปที่แท็บ “ตั้งค่า” แล้วบันทึกพื้นที่ก่อน จึงจะค้นหาและเพิ่มบ้านได้', en: 'This zone has no province/district yet. Set the area in the “Settings” tab first, then come back to add houses.' }) }}
              <button type="button" class="see-all" (click)="goArea()">{{ i18n.t({ th: 'ไปตั้งพื้นที่', en: 'Set the area' }) }}</button>
            </p>
          } @else {
          @if (overLimit()) {
            <!-- เซิร์ฟเวอร์จะตีกลับ PATROL_HOURS_LIMIT ตอนส่งคำขอ — บอกก่อนให้แก้ต้นเหตุ ไม่ต้องรอเลือกบ้านแล้วล้ม -->
            <p class="info-box warn-box small" role="status">
              {{ i18n.t({ th: 'เวลาตรวจของโซนนี้รวมเกินเพดานชั่วโมงของตู้ — ส่งคำขอเพิ่มบ้านจะไม่ผ่านจนกว่าจะลดเวลาตรวจ', en: 'This zone’s patrol hours exceed the box hour limit — requests will fail until you shorten them' }) }}
              <button type="button" class="see-all" (click)="tab.set('settings')">{{ i18n.t({ th: 'ไปแก้เวลาตรวจ', en: 'Edit patrol hours' }) }}</button>
            </p>
          }
          <form class="search-row" (submit)="$event.preventDefault(); search()">
            <input type="search" [attr.aria-label]="i18n.t({ th: 'ค้นบ้าน', en: 'Search houses' })" [placeholder]="i18n.t({ th: 'เลขที่ หรือหมู่บ้าน', en: 'House no. or village' })" [value]="q()" (input)="q.set($any($event.target).value)" />
            <button type="submit" class="btn secondary small-btn" [disabled]="searching()">{{ i18n.t({ th: 'ค้น', en: 'Search' }) }}</button>
          </form>
          <!-- แหล่งรายการ: แนะนำ (ค่าเริ่ม) / ยังไม่มีใครดูแล / ผลค้น — แทนปุ่มใหญ่ 2 ปุ่มที่ดูเหมือนคำสั่งคนละอย่าง -->
          <div class="segmented easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'แสดงบ้าน', en: 'Show houses' })">
            <button type="button" [attr.aria-pressed]="mode() === 'suggest'" [disabled]="searching()" (click)="suggest()">{{ i18n.t({ th: 'แนะนำ', en: 'Suggested' }) }}</button>
            <button type="button" [attr.aria-pressed]="mode() === 'browse'" [disabled]="searching()" (click)="browse()">{{ i18n.t({ th: 'ยังไม่มีใครดูแล', en: 'Not covered' }) }}</button>
          </div>
          @if (mode() === 'search') {
            <button type="button" class="see-all back-suggest" (click)="q.set(''); suggest()">{{ i18n.t({ th: 'ล้างคำค้น · กลับไปบ้านที่แนะนำ', en: 'Clear search · back to suggestions' }) }}</button>
          }
          <div class="filters easy-hide" role="group" [attr.aria-label]="i18n.t({ th: 'ตัวกรอง', en: 'Filters' })">
            @if (mode() === 'search') {
              <label class="chip-toggle"><input type="checkbox" [checked]="onlyUnzoned()" (change)="onlyUnzoned.set($any($event.target).checked); refilter()" />{{ i18n.t({ th: 'ยังไม่มีใครดูแล', en: 'Not covered yet' }) }}</label>
            }
            <label class="chip-toggle"><input type="checkbox" [checked]="onlyOnline()" (change)="onlyOnline.set($any($event.target).checked); refilter()" />{{ i18n.t({ th: 'เฉพาะตู้ออนไลน์', en: 'Online boxes only' }) }}</label>
          </div>
          @if (searchFailed()) {
            <app-load-error (retry)="rerun()" />
          } @else if (searched()) {
            <div class="result-head">
              <span class="muted small">{{ i18n.t({ th: 'พบ ', en: 'Found ' }) }}{{ hits().length }}{{ hitTotal() > hits().length ? ' / ' + hitTotal() : '' }}{{ i18n.t({ th: ' หลัง', en: ' houses' }) }}{{ picked().size ? i18n.t({ th: ' · เลือก ', en: ' · selected ' }) + picked().size : '' }}</span>
              @if (hitTotal() > hits().length) {
                <span class="muted small">{{ i18n.t({ th: 'แสดง 20 หลังแรก — พิมพ์คำค้นให้แคบลงเพื่อดูที่เหลือ', en: 'Showing the first 20 — narrow the search to see more' }) }}</span>
              }
              @if (addable().length > 1) {
                <button type="button" class="see-all" (click)="selectAllPicks()">{{ i18n.t({ th: 'เลือกที่แสดงทั้งหมด', en: 'Select all shown' }) }}</button>
              }
            </div>
            <div class="hit-list">
              @for (h of hits(); track h.box_id) {
                @let canPick = selectable(h);
                <label class="hit" [class.done]="!canPick" [class.picked]="picked().has(h.box_id)">
                  <input type="checkbox" [checked]="picked().has(h.box_id)" [disabled]="!canPick" (change)="togglePick(h.box_id)" />
                  <span class="grow">
                    <!-- เลขเดียวกับหมุดบนแผนที่ -->
                    @if (pinNo().get(h.box_id); as n) {
                      <span class="hit-n" [attr.aria-label]="i18n.t({ th: 'หมุดที่ ', en: 'Pin ' }) + n">{{ n }}</span>
                    }
                    <strong>{{ h.house_no ?? h.box_id }}</strong>
                    @if (h.area) { <span class="chip">{{ h.area }}</span> }
                    <span class="muted small block">{{ h.box_id }}{{ h.box_name ? ' · ' + h.box_name : '' }}{{ h.locality ? ' · ' + h.locality : '' }}</span>
                    @if (h.complete === false) {
                      <span class="warn-text small block">{{ i18n.t({ th: 'ข้อมูลไม่ครบ — ยังเพิ่มเข้าโซนไม่ได้: ', en: 'Incomplete — cannot be added yet: ' }) }}{{ missingText(h) }}</span>
                    }
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
                    <span class="chip warn">{{ i18n.t({ th: 'รอเจ้าของบ้านยืนยัน', en: 'Awaiting owner' }) }}</span>
                  } @else if (inZone(h.box_id)) {
                    <span class="chip ok">{{ i18n.t({ th: 'อยู่ในโซนนี้แล้ว', en: 'In this zone' }) }}</span>
                  }
                </label>
              }
            </div>
            @if (picked().size) {
              <!-- ติดล่างจอระหว่างเลื่อนรายการ — ไม่ต้องเลื่อนกลับขึ้นไปหาปุ่มส่ง -->
              <div class="pick-bar">
                <span><strong>{{ picked().size }}</strong>{{ i18n.t({ th: ' หลังที่เลือก', en: ' selected' }) }}</span>
                <button type="button" class="see-all" (click)="clearPicks()">{{ i18n.t({ th: 'ล้าง', en: 'Clear' }) }}</button>
                <button type="button" class="btn" [disabled]="savingHouses()" (click)="addPicked()">{{ savingHouses() ? i18n.t({ th: 'กำลังส่ง…', en: 'Sending…' }) : i18n.t({ th: 'ส่งคำขอ', en: 'Send requests' }) }}</button>
              </div>
            }
            @if (!hits().length) {
              <p class="muted small">
                {{ mode() === 'suggest'
                  ? i18n.t({ th: 'ไม่มีบ้านแนะนำเพิ่ม — บ้านที่ข้อมูลครบในพื้นที่นี้อยู่ในโซนหรือรอเจ้าของยืนยันแล้ว (บ้านที่ข้อมูลไม่ครบจะไม่ถูกแนะนำ) · ลองพิมพ์ค้นบ้านเอง', en: 'No more suggestions — complete houses in this area are already in the zone or awaiting the owner (incomplete houses are not suggested) · try searching' })
                  : mode() === 'browse'
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
              @if (memberQ().trim()) {
                <app-empty-state kind="search" compact [hint]="i18n.t({ th: 'ลองพิมพ์ชื่อหรือเลขประจำตัวบางส่วน', en: 'Try part of the name or staff no.' })" />
              } @else {
                <app-empty-state compact [title]="i18n.t({ th: 'ยังไม่มีสมาชิกที่ใช้งานได้', en: 'No active members yet' })" [hint]="i18n.t({ th: 'ให้เจ้าหน้าที่สมัครด้วยรหัสกลุ่ม แล้วอนุมัติที่หน้าสมาชิก', en: 'Officers sign up with the group code, then you approve them on the Members page' })">
                  <a class="btn secondary" [routerLink]="url('L05')">{{ i18n.t({ th: 'สมาชิก', en: 'Members' }) }}</a>
                </app-empty-state>
              }
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
    .map-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      padding-block-start: 6px;
    }
    .map-legend span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .lg {
      display: inline-block;
      inline-size: 10px;
      block-size: 10px;
      border-radius: 50%;
      border: 2px solid var(--map-ring);
      box-shadow: 0 0 0 1px var(--line);
    }
    .lg.ok { background: var(--ok); }
    .lg.warn { background: var(--warn); }
    .lg.picked { background: var(--map-picked); }
    .warn-text {
      color: var(--orange);
      font-weight: var(--fw-strong);
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

  /** เลือกพื้นที่โซนจาก dropdown (จังหวัด → เขต/อำเภอ → แขวง/ตำบล) */
  protected setArea(c: PlaceChange): void {
    this.province.set(c.province);
    this.district.set(c.district);
    this.subdistrict.set(c.subdistrict);
  }
  protected readonly error = signal<Tr | null>(null);
  protected readonly busy = signal(false);
  protected readonly q = signal('');
  protected readonly hits = signal<HouseHit[]>([]);
  protected readonly hitTotal = signal(0);
  protected readonly searched = signal(false);
  protected readonly onlyUnzoned = signal(false);
  protected readonly onlyOnline = signal(false);
  protected readonly mode = signal<'search' | 'browse' | 'suggest'>('search');
  protected readonly searchedFor = signal('');
  protected readonly addable = computed(() => this.hits().filter((h) => this.selectable(h)));
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

  /** box_id → เลขหมุดบนแผนที่ (ผลค้นที่มีพิกัด) */
  protected readonly pinNo = computed(() => new Map(this.mapPoints().filter((p) => p.n).map((p) => [p.box_id, p.n!])));

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
      this.saved.set(this.snapshot());
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
      this.saved.set(this.snapshot());
      // เปิดโซนครั้งแรก → โชว์บ้านที่ยังไม่มีใครดูแลเลย (ไม่ต้องกดปุ่มก่อน)
      if (!this.autoBrowsed && z.area) {
        this.autoBrowsed = true;
        void this.suggest();
      }
    } catch {
      // โซนถูกลบ / ไม่อยู่ในหน่วยงาน — บอกเหตุผลก่อนพากลับ (เดิมเด้งกลับเงียบ ๆ)
      this.toast.error({ th: 'เปิดโซนนี้ไม่ได้ — อาจถูกลบไปแล้ว หรืออินเทอร์เน็ตขัดข้อง', en: 'Couldn’t open this zone — it may have been deleted, or the connection failed' });
      void this.router.navigateByUrl(screenUrl('L06'), { replaceUrl: true });
    }
  }

  /** เพิ่มแถวใหม่ต่อจากช่วงสุดท้าย (3 ชม.) — ผู้ใช้ปรับเวลาในแถวได้ทันที */
  protected addWindow(): void {
    this.error.set(null);
    this.windows.update((w) => [...w, nextWindow(w)]);
  }

  protected removeWindow(i: number): void {
    this.error.set(null);
    this.windows.update((w) => w.filter((_, j) => j !== i));
  }

  protected setWindow(i: number, part: 0 | 1, value: string): void {
    this.error.set(null);
    this.windows.update((w) => w.map((x, j) => (j === i ? ((part === 0 ? [value, x[1]] : [x[0], value]) as [string, string]) : x)));
  }

  /** ปัญหาของแถว i (เริ่มไม่ก่อนจบ / ทับแถวอื่น) — ขึ้นใต้แถวทันที ไม่ต้องรอกดบันทึก */
  protected rowProblem(i: number): Tr | null {
    const w = this.windows();
    const [f, t] = w[i];
    if (f >= t) return { th: 'เวลาเริ่มต้องก่อนเวลาสิ้นสุด', en: 'Start must be before end' };
    if (tooLong(f, t)) return { th: 'ช่วงละไม่เกิน 30 นาที', en: 'Each window can be at most 30 minutes' };
    if (windowProblem(f, t, w.filter((_, j) => j !== i))) return { th: 'ทับกับช่วงอื่น', en: 'Overlaps another window' };
    return null;
  }

  /** ค่าที่โหลดมาล่าสุด — ใช้บอก "ยังไม่บันทึก" และปิดปุ่มบันทึกเมื่อไม่มีอะไรเปลี่ยน */
  private readonly saved = signal('');
  private snapshot(): string {
    return JSON.stringify([this.name().trim(), [...this.windows()].sort(), this.areaBody()]);
  }
  protected readonly dirty = computed(() => this.snapshot() !== this.saved());
  protected readonly overLimit = computed(() => {
    const lim = this.zone()?.patrol_limit_hours;
    return !!lim && this.totalMinutes() > lim * 60;
  });

  /** POST /agency/zones (สร้าง) · PATCH /agency/zones/:id (ชื่อ + เวลาตรวจ) */
  protected async saveBasics(): Promise<void> {
    if (this.windows().some((_, i) => this.rowProblem(i))) {
      this.error.set({ th: 'แก้ช่วงเวลาที่ขึ้นสีแดงก่อนบันทึก', en: 'Fix the highlighted windows before saving' });
      return;
    }
    const windows = [...this.windows()].sort((a, b) => a[0].localeCompare(b[0]));
    this.windows.set(windows);
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.isNew()) {
        const z = await this.api.createZone(this.name().trim(), windows, this.areaBody());
        this.toast.show({ th: 'สร้างโซนแล้ว — เพิ่มบ้านและเจ้าหน้าที่ต่อ', en: 'Zone created — now add houses and officers' });
        void this.router.navigate([screenUrl('L07')], { queryParams: { zone: z.id }, replaceUrl: true });
      } else {
        await this.api.updateZone(this.zone()!.id, { name: this.name().trim(), windows, ...this.areaBody() });
        this.toast.show({ th: 'บันทึกแล้ว — ตู้ได้เวลาตรวจใหม่ตอนรายงานครั้งถัดไป', en: 'Saved — boxes get the new hours at their next report' });
        await this.load(this.zone()!.id);
      }
    } catch (err) {
      const e = apiError(err);
      this.error.set(ZONE_ERROR[e.code ?? ''] ?? { th: 'บันทึกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Couldn’t save — check your connection and try again' });
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
      const r = await this.api.searchHouses(q, { unzoned: this.onlyUnzoned(), online: this.onlyOnline(), zone: this.zone()?.id });
      this.hits.set(r.data);
      this.hitTotal.set(r.total);
    } catch {
      this.hits.set([]);
      this.hitTotal.set(0);
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
      const r = await this.api.searchHouses('', { unzoned: true, online: this.onlyOnline(), zone: this.zone()?.id });
      this.hits.set(r.data);
      this.hitTotal.set(r.total);
    } catch {
      this.hits.set([]);
      this.hitTotal.set(0);
      this.searchFailed.set(true);
    } finally {
      this.searched.set(true);
      this.searching.set(false);
    }
  }

  /** ✅ 2026-11-16 บ้านที่แนะนำ: ข้อมูลครบ อยู่ในพื้นที่โซน ยังไม่อยู่ในโซนนี้ · บ้านที่ยังไม่มีใครดูแลขึ้นก่อน */
  protected async suggest(): Promise<void> {
    this.mode.set('suggest');
    this.picked.set(new Set());
    this.searching.set(true);
    this.searchFailed.set(false);
    try {
      const r = await this.api.searchHouses('', { suggest: true, online: this.onlyOnline(), zone: this.zone()?.id });
      this.hits.set(r.data);
      this.hitTotal.set(r.total);
    } catch {
      this.hits.set([]);
      this.hitTotal.set(0);
      this.searchFailed.set(true);
    } finally {
      this.searched.set(true);
      this.searching.set(false);
    }
  }

  /** รันรอบเดิมซ้ำ (ลองใหม่ / เปลี่ยนตัวกรอง) */
  protected rerun(): void {
    void (this.mode() === 'suggest' ? this.suggest() : this.mode() === 'browse' ? this.browse() : this.search());
  }

  /** ข้อมูลที่ยังขาดของบ้าน เป็นข้อความอ่านง่าย */
  protected missingText(h: HouseHit): string {
    const label = { address: { th: 'ที่อยู่', en: 'address' }, place: { th: 'จังหวัด/เขต/แขวง', en: 'province/district/subdistrict' }, pin: { th: 'หมุดบ้าน', en: 'pin' } } as const;
    return (h.missing ?? []).map((m) => this.i18n.t(label[m])).join(', ');
  }

  /** เปลี่ยนตัวกรอง → ค้นรอบเดิมใหม่ */
  protected refilter(): void {
    if (!this.searched()) return;
    this.rerun();
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
      sleeping: { th: 'ตู้พัก', en: 'box resting' },
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
    // ข้อมูลบ้านไม่ครบ = เลือกไม่ได้ (เซิร์ฟเวอร์ก็ปฏิเสธด้วย HOUSE_INCOMPLETE)
    return !this.inZone(h.box_id) && !this.pendingHere(h.box_id) && h.complete !== false;
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
    const saved = await this.setHouses([...this.currentHouses(), ...ids]);
    // ส่งไม่ผ่าน → เก็บที่เลือกไว้ ให้แก้สาเหตุแล้วกดส่งซ้ำได้ (เดิมล้างทิ้งทุกกรณี)
    if (saved) {
      this.picked.set(new Set());
      this.toast.show({ th: `ส่งคำขอ ${ids.length} หลังแล้ว — รอเจ้าของบ้านกดยอมรับ`, en: `Sent ${ids.length} ${ids.length === 1 ? 'request' : 'requests'} — waiting for owners to accept` }, 'ok');
    }
    this.savingHouses.set(false);
  }

  /** ลบบ้าน/ยกเลิกคำขอ — ต้องยืนยัน (แตะพลาดแล้วบ้านหลุดจากโซน) */
  protected async askRemoveHouse(h: ZoneHouse): Promise<void> {
    // บ้านเลขที่ซ้ำกันได้ (เจ้าของคนเดียวมีหลายตู้) — ใส่ชื่อตู้เพื่อให้ยืนยันถูกหลัง
    const name = h.house_no ?? h.box_id;
    const label = h.box_name ? `${name} (${h.box_name})` : name;
    const ok = await this.confirm.ask({
      title: h.pending
        ? { th: `ถอนคำขอของบ้าน ${label}?`, en: `Withdraw the request for ${label}?` }
        : { th: `นำบ้าน ${label} ออกจากโซน?`, en: `Remove ${label} from this zone?` },
      body: h.pending
        ? { th: 'เจ้าของบ้านจะไม่ได้รับคำขอให้ยอมรับอีก (เพิ่มใหม่ได้ภายหลัง)', en: 'The owner will no longer see this request (you can add it again later).' }
        : { th: 'บ้านหลังนี้จะไม่ถูกตรวจและไม่รับ SOS ของโซนนี้ (ประวัติเดิมยังอยู่)', en: 'This house will no longer be inspected or receive SOS for this zone (history is kept).' },
      // "ถอนคำขอ" ไม่ใช่ "ยกเลิกคำขอ" — กันสับสนกับปุ่ม "ยกเลิก" (ปิดหน้าต่าง) ที่อยู่ติดกัน
      confirm: h.pending ? { th: 'ถอนคำขอ', en: 'Withdraw' } : { th: 'นำออก', en: 'Remove' },
      danger: true,
    });
    if (ok && (await this.setHouses(this.currentHouses().filter((id) => id !== h.box_id)))) {
      this.toast.show(h.pending ? { th: `ถอนคำขอของบ้าน ${label} แล้ว`, en: `Withdrew the request for ${label}` } : { th: `นำบ้าน ${label} ออกจากโซนแล้ว`, en: `Removed ${label} from the zone` }, 'ok');
    }
  }

  /** PUT /agency/zones/:id/houses — แทนที่ทั้งชุด (ทีละคำขอ ใช้ชุดล่าสุดเสมอ) · คืน false ถ้าบันทึกไม่ผ่าน */
  private async setHouses(ids: string[]): Promise<boolean> {
    const z = this.zone();
    if (!z) return false;
    this.houseIds = ids;
    let ok = true;
    this.houseSave = this.houseSave.then(async () => {
      if (this.houseIds !== ids) return; // มีการกดใหม่กว่า — รอบนั้นบันทึกชุดล่าสุดเอง
      try {
        await this.api.setHouses(z.id, ids);
        if (this.houseIds !== ids) return;
        this.houseIds = null;
        await this.load(z.id);
        // รันรายการเดิมซ้ำ (เดิมโหมด "แนะนำ" กลายเป็น "ยังไม่มีใครดูแล" หลังส่งคำขอ)
        if (this.searched()) this.rerun();
      } catch (err) {
        ok = false;
        this.houseIds = null;
        await this.load(z.id).catch(() => undefined);
        const e = apiError(err);
        this.toast.error(ZONE_ERROR[e.code ?? ''] ?? { th: 'บันทึกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Couldn’t save — check your connection and try again' });
      } finally {
        if (this.houseIds === null) this.savingHouses.set(false);
      }
    });
    await this.houseSave;
    return ok;
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
    // ถอดเจ้าหน้าที่ที่ยังเหลือคนอื่นในโซน = ย้อนได้ด้วยการเพิ่มกลับ → ทำเลย + "เลิกทำ" · ถ้าโซนจะว่างเจ้าหน้าที่ยังถามก่อน
    if (!on && next.length === 0) {
      const leavingNone = true;
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
        if (!on) {
          this.toast.showUndo({ th: 'นำเจ้าหน้าที่ออกจากโซนแล้ว', en: 'Officer removed from the zone' }, () => this.toggleOfficer(id, true));
        }
      } catch {
        this.officerIds = null;
        await this.load(z.id).catch(() => undefined);
        this.toast.error({ th: 'บันทึกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Couldn’t save — check your connection and try again' });
      } finally {
        if (this.officerIds === null) this.savingOfficers.set(false);
      }
    });
    return this.officerSave;
  }

  /** โหมดละเอียด: เวลารวมของทุกช่วงในหนึ่งวัน (คำนวณจากช่วงที่ตั้งไว้จริง) */
  private readonly totalMinutes = computed(() => this.windows().reduce((n, [f, t]) => n + Math.max(0, toMinutes(t) - toMinutes(f)), 0));

  protected durationText(): string {
    const mins = this.totalMinutes();
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? this.i18n.t({ th: `${h} ชม. ${m} น.`, en: `${h} h ${m} m` }) : this.i18n.t({ th: `${h} ชม.`, en: `${h} h` });
  }

  protected updated(iso: string): string {
    return fmtWhenSec(iso, this.i18n.lang());
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
      this.toast.show({ th: `ลบโซน "${z.name}" แล้ว`, en: `Deleted zone "${z.name}"` });
      // replaceUrl: กดย้อนกลับแล้วไม่ไปเจอหน้าแก้โซนที่ถูกลบไปแล้ว
      void this.router.navigateByUrl(screenUrl('L06'), { replaceUrl: true });
    } catch {
      this.toast.error({ th: 'ลบไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Couldn’t delete — check your connection and try again' });
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
