import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { HeadApi, type HouseHit, type Member, type Zone, type ZoneDetail } from '../../core/head-api';
import { I18n, type Tr } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';

// หัวหน้า: L06 โซนทั้งหมด · L07 แก้โซน (ชื่อ · เวลาตรวจ · บ้าน · เจ้าหน้าที่) — ใช้ API จริง (api.md §8.3)
// บ้านหลังเดียวอยู่ในโซนของหลายหน่วยงานได้ · ตู้รับเวลาตรวจใหม่ตอน boot / รายงานรายวัน

const MAX_WINDOWS = 4;

const ZONE_ERROR: Record<string, Tr> = {
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
    <app-page-header
      [caption]="(api.agency()?.name ?? '') + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'โซน', en: 'Zones' })"
      [bell]="url('L09')"
    />
    <div class="stack grow">
      @for (z of zones(); track z.id) {
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
        </a>
      } @empty {
        <p class="muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ยังไม่มีโซน — สร้างโซนแรก', en: 'No zones yet — create the first one' }) }}</p>
      }
      <a class="btn push-end" [routerLink]="url('L07')" [queryParams]="{ zone: 'new' }">+ {{ i18n.t({ th: 'สร้างโซนใหม่', en: 'New zone' }) }}</a>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
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
      margin-left: auto;
    }
    .warn-text {
      color: var(--orange);
      font-weight: 700;
    }
  `,
})
export class HeadZones implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  protected readonly url = screenUrl;
  protected readonly zones = signal<Zone[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    void this.api.loadAgency().catch(() => undefined);
    try {
      this.zones.set(await this.api.zones('all'));
    } finally {
      this.loading.set(false);
    }
  }

  protected windows(z: Zone): string {
    return z.windows.map((w) => w.join('–')).join(' · ') || '—';
  }
}

// ── L07 · แก้โซน / สร้างโซน ──────────────────────────────────────

@Component({
  selector: 'app-head-zone-edit',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './head-zone-edit.scss',
  template: `
    <app-page-header [caption]="isNew() ? i18n.t({ th: 'สร้างโซน', en: 'New zone' }) : i18n.t({ th: 'แก้ไขโซน', en: 'Edit zone' })" [title]="name() || i18n.t({ th: 'โซนใหม่', en: 'New zone' })" [back]="url('L06')" />
    <div class="stack grow">
      <section class="card stack">
        <label class="field">
          <span>{{ i18n.t({ th: 'ชื่อโซน', en: 'Zone name' }) }}</span>
          <input maxlength="50" [value]="name()" (input)="name.set($any($event.target).value)" />
        </label>
        <div class="head">
          <strong>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</strong>
          <span class="muted small">Asia/Bangkok</span>
        </div>
        <div class="chips">
          @for (w of windows(); track $index) {
            <button type="button" class="pill" (click)="removeWindow($index)" [attr.aria-label]="i18n.t({ th: 'เอาออก ', en: 'Remove ' }) + w.join('–')">{{ w[0] }}–{{ w[1] }} <span aria-hidden="true">×</span></button>
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
        @if (error(); as e) {
          <p class="err small" role="alert">{{ i18n.t(e) }}</p>
        }
        <button type="button" class="btn" [disabled]="busy() || !name().trim()" (click)="saveBasics()">
          {{ isNew() ? i18n.t({ th: 'สร้างโซน', en: 'Create zone' }) : i18n.t({ th: 'บันทึกชื่อ + เวลาตรวจ', en: 'Save name + hours' }) }}
        </button>
      </section>

      @if (zone(); as z) {
        <section class="card stack">
          <div class="head">
            <strong>{{ i18n.t({ th: 'บ้านในโซน', en: 'Houses' }) }} ({{ z.houses.length }})</strong>
          </div>
          <div class="chips">
            @for (h of z.houses; track h.box_id) {
              <button type="button" class="pill" (click)="removeHouse(h.box_id)" [attr.aria-label]="i18n.t({ th: 'เอาออก ', en: 'Remove ' }) + (h.house_no ?? h.box_id)">
                {{ h.house_no ?? h.box_id }} <span aria-hidden="true">×</span>
              </button>
            } @empty {
              <span class="muted small">{{ i18n.t({ th: 'ยังไม่มีบ้าน', en: 'No houses yet' }) }}</span>
            }
          </div>
          <form class="add-window" (submit)="$event.preventDefault(); search()">
            <input type="search" [placeholder]="i18n.t({ th: 'ค้นบ้านเลขที่ / รหัสตู้', en: 'Search house no. / box id' })" [value]="q()" (input)="q.set($any($event.target).value)" />
            <button type="submit" class="btn secondary small-btn">{{ i18n.t({ th: 'ค้น', en: 'Search' }) }}</button>
          </form>
          @for (h of hits(); track h.box_id) {
            <div class="hit">
              <span class="grow">
                <strong>{{ h.house_no }}</strong> <span class="muted small">{{ h.box_id }}{{ h.box_name ? ' · ' + h.box_name : '' }}</span>
                @if (h.zones.length) {
                  <span class="muted small block">{{ i18n.t({ th: 'อยู่ในโซน: ', en: 'In zones: ' }) }}{{ zonesOf(h) }}</span>
                }
              </span>
              @if (inZone(h.box_id)) {
                <span class="chip ok">{{ i18n.t({ th: 'อยู่แล้ว', en: 'Added' }) }}</span>
              } @else {
                <button type="button" class="btn small-btn" (click)="addHouse(h.box_id)">+ {{ i18n.t({ th: 'เพิ่ม', en: 'Add' }) }}</button>
              }
            </div>
          }
          @if (searched() && !hits().length) {
            <p class="muted small">{{ i18n.t({ th: 'ไม่พบ — ค้นได้เฉพาะตู้ที่เจ้าของบ้านผูกแล้ว', en: 'Nothing found — only boxes already bound by an owner' }) }}</p>
          }
        </section>

        <section class="card stack">
          <div class="head">
            <strong>{{ i18n.t({ th: 'เจ้าหน้าที่ในโซน', en: 'Officers' }) }} ({{ z.officers.length }})</strong>
          </div>
          @for (m of members(); track m.id) {
            <label class="officer">
              <input type="checkbox" [checked]="inOfficers(m.id)" (change)="toggleOfficer(m.id, $any($event.target).checked)" />
              <span class="grow">
                <strong>{{ m.display_name }}</strong>
                @if (m.is_head) {
                  <span class="chip">{{ i18n.t({ th: 'หัวหน้า', en: 'Head' }) }}</span>
                }
              </span>
            </label>
          } @empty {
            <p class="muted small">{{ i18n.t({ th: 'ยังไม่มีสมาชิกที่ใช้งานได้', en: 'No active members yet' }) }}</p>
          }
          <p class="muted small">{{ i18n.t({ th: 'หัวหน้าตรวจตู้ได้เฉพาะโซนที่ใส่ตัวเองไว้', en: 'Heads can only inspect zones they are in' }) }}</p>
        </section>

        <button type="button" class="btn secondary danger-outline" (click)="remove()">{{ i18n.t({ th: 'ลบโซนนี้', en: 'Delete this zone' }) }}</button>
      }
    </div>
  `,
  styles: `
    .hit,
    .officer {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
      border-top: 1px solid var(--line);
    }
    .officer input {
      width: 22px;
      height: 22px;
    }
    .block {
      display: block;
    }
    .grow {
      flex: 1;
      min-width: 0;
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
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  protected readonly maxWindows = MAX_WINDOWS;
  /** ?zone=<uuid>|new */
  readonly zoneParam = input<string | undefined>(undefined, { alias: 'zone' });
  protected readonly isNew = computed(() => !this.zoneParam() || this.zoneParam() === 'new');

  protected readonly zone = signal<ZoneDetail | null>(null);
  protected readonly members = signal<Member[]>([]);
  protected readonly name = signal('');
  protected readonly windows = signal<[string, string][]>([]);
  protected readonly from = signal('06:00');
  protected readonly to = signal('09:00');
  protected readonly error = signal<Tr | null>(null);
  protected readonly busy = signal(false);
  protected readonly q = signal('');
  protected readonly hits = signal<HouseHit[]>([]);
  protected readonly searched = signal(false);

  constructor() {
    effect(() => {
      const id = this.zoneParam();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string | undefined): Promise<void> {
    this.zone.set(null);
    this.error.set(null);
    this.members.set(await this.api.members('active').catch(() => []));
    if (!id || id === 'new') {
      this.name.set('');
      this.windows.set([]);
      return;
    }
    try {
      const z = await this.api.zone(id);
      this.zone.set(z);
      this.name.set(z.name);
      this.windows.set(z.windows);
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
        const z = await this.api.createZone(this.name().trim(), this.windows());
        this.toast.show({ th: 'สร้างโซนแล้ว — เพิ่มบ้านและเจ้าหน้าที่ต่อ', en: 'Zone created — now add houses and officers' });
        void this.router.navigate([screenUrl('L07')], { queryParams: { zone: z.id }, replaceUrl: true });
      } else {
        await this.api.updateZone(this.zone()!.id, { name: this.name().trim(), windows: this.windows() });
        this.toast.show({ th: 'บันทึกแล้ว — ตู้ได้เวลาตรวจใหม่ตอนรายงานครั้งถัดไป', en: 'Saved — boxes get the new hours at their next report' });
        await this.load(this.zone()!.id);
      }
    } catch (err) {
      const e = apiError(err);
      this.error.set(ZONE_ERROR[e.code ?? ''] ?? { th: 'บันทึกไม่ได้', en: 'Couldn’t save' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async search(): Promise<void> {
    const q = this.q().trim();
    if (!q) return;
    this.hits.set(await this.api.searchHouses(q).catch(() => []));
    this.searched.set(true);
  }

  protected inZone(boxId: string): boolean {
    return !!this.zone()?.houses.some((h) => h.box_id === boxId);
  }

  protected zonesOf(h: HouseHit): string {
    return h.zones.map((z) => `${z.agency_name} / ${z.zone_name}`).join(', ');
  }

  protected addHouse(boxId: string): Promise<void> {
    return this.setHouses([...(this.zone()?.houses.map((h) => h.box_id) ?? []), boxId]);
  }

  protected removeHouse(boxId: string): Promise<void> {
    return this.setHouses((this.zone()?.houses.map((h) => h.box_id) ?? []).filter((id) => id !== boxId));
  }

  /** PUT /agency/zones/:id/houses — แทนที่ทั้งชุด */
  private async setHouses(ids: string[]): Promise<void> {
    const z = this.zone();
    if (!z) return;
    try {
      await this.api.setHouses(z.id, ids);
      await this.load(z.id);
    } catch (err) {
      const e = apiError(err);
      this.toast.show(ZONE_ERROR[e.code ?? ''] ?? { th: 'บันทึกไม่ได้', en: 'Couldn’t save' });
    }
  }

  protected inOfficers(id: string): boolean {
    return !!this.zone()?.officers.some((o) => o.id === id);
  }

  /** PUT /agency/zones/:id/officers — แทนที่ทั้งชุด */
  protected async toggleOfficer(id: string, on: boolean): Promise<void> {
    const z = this.zone();
    if (!z) return;
    const ids = z.officers.map((o) => o.id).filter((x) => x !== id);
    if (on) ids.push(id);
    try {
      await this.api.setOfficers(z.id, ids);
      await this.load(z.id);
    } catch {
      this.toast.show({ th: 'บันทึกไม่ได้', en: 'Couldn’t save' });
    }
  }

  protected async remove(): Promise<void> {
    const z = this.zone();
    if (!z || !confirm(this.i18n.t({ th: `ลบโซน "${z.name}"?`, en: `Delete zone "${z.name}"?` }))) return;
    try {
      await this.api.removeZone(z.id);
      void this.router.navigateByUrl(screenUrl('L06'));
    } catch {
      this.toast.show({ th: 'ลบไม่ได้', en: 'Couldn’t delete' });
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
