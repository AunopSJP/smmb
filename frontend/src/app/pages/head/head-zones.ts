import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { HeadDemo, type DemoZone } from '../../core/mock/head-demo';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';

// ── L06 · โซน ───────────────────────────────────────────────

@Component({
  selector: 'app-head-zones',
  imports: [RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="agency() + ' · ' + i18n.t({ th: 'หัวหน้าหน่วยงาน', en: 'Agency head' })"
      [title]="i18n.t({ th: 'โซน', en: 'Zones' })"
      [bell]="url('L09')"
    />
    <div class="stack grow">
      @for (z of demo.zones(); track z.id) {
        <a class="card zone" [class.warn]="!z.officer_ids.length" [routerLink]="url('L07')" [queryParams]="{ zone: z.id }">
          <span class="title-row">
            <strong>{{ z.name }}</strong>
            @if (z.mine) {
              <span class="chip ok">{{ i18n.t({ th: 'โซนที่ฉันอยู่', en: 'My zone' }) }}</span>
            }
            <span class="chip push">{{ z.house_count }} {{ i18n.t({ th: 'หลัง', en: 'houses' }) }}</span>
          </span>
          @if (z.officer_ids.length) {
            <span class="muted small">{{ officers(z) }}</span>
          } @else {
            <span class="warn-text small">{{ i18n.t({ th: 'ยังไม่มีเจ้าหน้าที่', en: 'No officers yet' }) }}</span>
          }
          <span class="muted small">{{ i18n.t({ th: 'เวลาตรวจ ', en: 'Patrol ' }) }}{{ z.windows.join(' · ') || '—' }}</span>
        </a>
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
  protected readonly demo = inject(HeadDemo);
  protected readonly url = screenUrl;

  ngOnInit(): void {
    // ออกจากหน้าแก้โซนโดยไม่บันทึก = ทิ้งร่าง
    this.demo.draft.set(null);
  }
  protected readonly agency = computed(() => (this.i18n.lang() === 'th' ? this.demo.agency.name : this.demo.agency.name_en));

  protected officers(z: DemoZone): string {
    const names = z.officer_ids.map((id) => this.demo.memberName(id, this.i18n.lang()));
    return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  }
}

// ── L07 · แก้โซน ──────────────────────────────────────────────

@Component({
  selector: 'app-head-zone-edit',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demo.draft(); as d) {
      <app-page-header [caption]="i18n.t({ th: 'แก้ไขโซน', en: 'Edit zone' })" [title]="d.name" [back]="url('L06')" />
      <div class="stack grow">
        <section class="card stack">
          <div class="head">
            <strong>{{ i18n.t({ th: 'บ้านในโซน', en: 'Houses' }) }} ({{ d.houses.length }})</strong>
            <a [routerLink]="url('L07-b')" class="add">+ {{ i18n.t({ th: 'เพิ่ม', en: 'Add' }) }}</a>
          </div>
          <div class="chips">
            @for (h of shownHouses(); track h) {
              <button type="button" class="pill" (click)="removeHouse(h)" [attr.aria-label]="i18n.t({ th: 'เอาออก ', en: 'Remove ' }) + h">{{ h }} <span aria-hidden="true">×</span></button>
            }
            @if (d.houses.length > shownHouses().length) {
              <button type="button" class="pill more" (click)="allHouses.set(true)">+{{ d.houses.length - shownHouses().length }}</button>
            }
            @if (!d.houses.length) {
              <span class="muted small">{{ i18n.t({ th: 'ยังไม่มีบ้าน', en: 'No houses yet' }) }}</span>
            }
          </div>
        </section>

        <section class="card stack">
          <div class="head">
            <strong>{{ i18n.t({ th: 'เจ้าหน้าที่', en: 'Officers' }) }}</strong>
            <a [routerLink]="url('L07-c')" class="add">+ {{ i18n.t({ th: 'เพิ่ม', en: 'Add' }) }}</a>
          </div>
          <div class="chips">
            @for (id of d.officer_ids; track id) {
              <button type="button" class="pill" (click)="removeOfficer(id)">{{ demo.memberName(id, i18n.lang()) }} <span aria-hidden="true">×</span></button>
            } @empty {
              <span class="warn-text small">{{ i18n.t({ th: 'ยังไม่มีเจ้าหน้าที่ — SOS จากบ้านในโซนนี้จะไปถึงทั้งหน่วยงาน', en: 'No officers — SOS from these houses goes to the whole agency' }) }}</span>
            }
          </div>
        </section>

        <section class="card stack">
          <div class="head">
            <strong>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</strong>
            <button type="button" class="add" (click)="adding.set(!adding())">+ {{ i18n.t({ th: 'เพิ่ม', en: 'Add' }) }}</button>
          </div>
          <div class="chips">
            @for (w of d.windows; track w) {
              <button type="button" class="pill red" (click)="removeWindow(w)">{{ w }} <span aria-hidden="true">×</span></button>
            }
          </div>
          @if (adding()) {
            <div class="add-window">
              <input type="time" #from value="06:00" [attr.aria-label]="i18n.t({ th: 'เริ่ม', en: 'From' })" />
              <span>–</span>
              <input type="time" #to value="09:00" [attr.aria-label]="i18n.t({ th: 'ถึง', en: 'To' })" />
              <button type="button" class="btn small-btn" (click)="addWindow(from.value, to.value)">{{ i18n.t({ th: 'เพิ่ม', en: 'Add' }) }}</button>
            </div>
            @if (windowError()) {
              <p class="err small"><app-icon name="alert" [size]="14" /> {{ i18n.t({ th: 'เวลาเริ่มต้องก่อนเวลาจบ (ไม่ข้ามเที่ยงคืน)', en: 'Start must be before end (no crossing midnight)' }) }}</p>
            }
          }
        </section>
        <p class="muted small">{{ i18n.t({ th: 'ตู้ในโซนจะรู้เวลาตรวจใหม่ภายใน 1 วัน', en: 'Mailboxes learn the new hours within 1 day' }) }}</p>

        <button type="button" class="btn big push-end" (click)="save()">{{ i18n.t({ th: 'บันทึกโซน', en: 'Save zone' }) }}</button>
      </div>
    }
  `,
  styleUrl: './head-zone-edit.scss',
})
export class HeadZoneEdit implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(HeadDemo);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  /** ?zone=z1 | new */
  readonly zone = input<string>();
  protected readonly adding = signal(false);
  protected readonly windowError = signal(false);
  protected readonly allHouses = signal(false);
  protected readonly shownHouses = computed(() => {
    const h = this.demo.draft()?.houses ?? [];
    return this.allHouses() ? h : h.slice(0, 3);
  });

  ngOnInit(): void {
    const d = this.demo.draft();
    // กลับมาจากหน้าเลือกบ้าน/เจ้าหน้าที่ → ใช้ร่างเดิม · เปิดโซนใหม่ → เริ่มร่างใหม่
    if (!d || (this.zone() && this.zone() !== d.id)) this.demo.editZone(this.zone() === 'new' ? undefined : (this.zone() ?? 'z1'));
  }

  private patch(fn: (d: DemoZone) => DemoZone): void {
    this.demo.draft.update((d) => (d ? fn(d) : d));
  }

  protected removeHouse(h: string): void {
    this.patch((d) => ({ ...d, houses: d.houses.filter((x) => x !== h) }));
  }

  protected removeOfficer(id: string): void {
    this.patch((d) => ({ ...d, officer_ids: d.officer_ids.filter((x) => x !== id) }));
  }

  protected removeWindow(w: string): void {
    this.patch((d) => ({ ...d, windows: d.windows.filter((x) => x !== w) }));
  }

  /** ไม่ข้ามเที่ยงคืน (ฐานข้อมูลบังคับ start_time < end_time) */
  protected addWindow(from: string, to: string): void {
    if (!from || !to || from >= to) {
      this.windowError.set(true);
      return;
    }
    this.windowError.set(false);
    const w = `${from}–${to}`;
    this.patch((d) => ({ ...d, windows: [...new Set([...d.windows, w])].sort() }));
    this.adding.set(false);
  }

  protected save(): void {
    this.demo.saveDraft();
    this.demo.draft.set(null);
    this.toast.show({ th: 'บันทึกโซนแล้ว', en: 'Zone saved' });
    void this.router.navigateByUrl(screenUrl('L06'));
  }
}

// ── L07-b · เพิ่มบ้าน / L07-c · เพิ่มเจ้าหน้าที่ ───────────────────

interface PickItem {
  key: string;
  title: string;
  sub: string;
  disabled: boolean;
}

@Component({
  selector: 'app-head-zone-picker',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="demo.draft()?.name ?? ''"
      [title]="officers ? i18n.t({ th: 'เพิ่มเจ้าหน้าที่', en: 'Add officers' }) : i18n.t({ th: 'เพิ่มบ้านเข้าโซน', en: 'Add houses' })"
      [back]="url('L07')"
    />
    <div class="stack grow">
      <label class="search">
        <strong class="small">{{ i18n.t({ th: 'ค้นหา', en: 'Search' }) }}</strong>
        <input type="search" [placeholder]="i18n.t({ th: 'พิมพ์เพื่อค้นหา', en: 'Type to search' })" (input)="q.set($any($event.target).value)" />
      </label>
      <ul class="list">
        @for (it of items(); track it.key) {
          <li>
            <label class="row" [class.off]="it.disabled">
              <input type="checkbox" [disabled]="it.disabled" [checked]="picked().has(it.key)" (change)="toggle(it.key)" />
              <span>
                <strong>{{ it.title }}</strong>
                <span class="muted small block">{{ it.sub }}</span>
              </span>
            </label>
          </li>
        } @empty {
          <li class="row muted">{{ i18n.t({ th: 'ไม่พบ', en: 'Nothing found' }) }}</li>
        }
      </ul>
      <button type="button" class="btn big push-end" [disabled]="!picked().size" (click)="add()">
        {{ i18n.t({ th: 'เพิ่ม ', en: 'Add ' }) }}{{ picked().size }}
        {{ officers ? i18n.t({ th: 'คน', en: 'people' }) : i18n.t({ th: 'หลัง', en: 'houses' }) }}
      </button>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .search {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    input[type='search'] {
      font: inherit;
      min-height: 52px;
      padding: 8px 14px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    label.row {
      cursor: pointer;
    }
    .off {
      opacity: 0.55;
      cursor: default;
    }
    input[type='checkbox'] {
      width: 22px;
      height: 22px;
      accent-color: var(--brand);
      flex: none;
    }
    .block {
      display: block;
    }
  `,
})
export class HeadZonePicker implements OnInit {
  protected readonly i18n = inject(I18n);
  protected readonly demo = inject(HeadDemo);
  private readonly router = inject(Router);
  protected readonly url = screenUrl;
  /** L07-c = เลือกเจ้าหน้าที่ · L07-b = เลือกบ้าน */
  protected readonly officers = inject(ActivatedRoute).snapshot.data['code'] === 'L07-c';
  protected readonly q = signal('');
  protected readonly picked = signal(new Set<string>());

  ngOnInit(): void {
    if (!this.demo.draft()) this.demo.editZone('z1');
  }

  protected readonly items = computed<PickItem[]>(() => {
    const d = this.demo.draft();
    const t = (th: string, en: string) => this.i18n.t({ th, en });
    const list: PickItem[] = this.officers
      ? this.demo.activeOfficers().map((m) => {
          const inThis = d?.officer_ids.includes(m.id) ?? false;
          const zones = this.demo.zoneOf(m.id).filter((z) => z !== d?.name);
          return {
            key: m.id,
            title: this.demo.memberName(m.id, this.i18n.lang()),
            sub: inThis
              ? t(`อยู่${d?.name}แล้ว`, `Already in ${d?.name}`)
              : zones.length
                ? t(`อยู่${zones.join(', ')} · 1 คนอยู่หลายโซนได้`, `In ${zones.join(', ')} · can be in several zones`)
                : t('ยังไม่มีโซน', 'No zone yet'),
            disabled: inThis,
          };
        })
      : this.demo.housePool
          .filter((h) => !d?.houses.includes(h.house))
          .map((h) => ({
            key: h.house,
            title: h.house,
            sub: !h.bound
              ? t('ยังไม่ผูกตู้', 'No mailbox bound yet')
              : h.zone
                ? t(`อยู่${h.zone}แล้ว (ย้ายมาได้)`, `In ${h.zone} (can move)`)
                : t('ยังไม่มีโซน', 'No zone yet'),
            disabled: false,
          }));
    const q = this.q().trim().toLowerCase();
    return q ? list.filter((i) => `${i.title} ${i.sub}`.toLowerCase().includes(q)) : list;
  });

  protected toggle(key: string): void {
    this.picked.update((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  protected add(): void {
    const keys = [...this.picked()];
    this.demo.draft.update((d) =>
      d
        ? this.officers
          ? { ...d, officer_ids: [...new Set([...d.officer_ids, ...keys])] }
          : { ...d, houses: [...new Set([...d.houses, ...keys])] }
        : d,
    );
    void this.router.navigate([screenUrl('L07')], { queryParams: { zone: this.demo.draft()?.id } });
  }
}
