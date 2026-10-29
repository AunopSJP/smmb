import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi, type AdminAgency, type AdminBoxRow, type AdminOverview } from '../core/admin-api';
import { I18n, type Tr } from '../core/i18n';
import { Session } from '../core/session';
import { Toast } from '../core/toast';
import { LOW_BATTERY_PCT, seenText } from './admin/admin-boxes';
import { screenUrl } from '../screens/registry';
import { Icon, type IconName } from '../shared/icon';
import { PageHeader } from '../shared/page-header';

/** D01 ภาพรวมแอดมิน — ใช้ยอดสรุปจาก backend และรายการจริงสำหรับงานค้าง */
@Component({
  selector: 'app-admin-home',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'แอดมิน Smart Mailbox', en: 'Smart Mailbox admin' })"
      [title]="i18n.t({ th: 'ภาพรวม', en: 'Overview' })"
      [bell]="url('D12')"
    />

    <div class="stack">
      <div class="stats">
        <a class="stat link" [routerLink]="url('D03')">
          <p class="label">{{ i18n.t({ th: 'ตู้ออนไลน์', en: 'Boxes online' }) }}</p>
          <p class="value ok">{{ online() }}/{{ totalBoxes() }}</p>
        </a>
        <a class="stat link" [routerLink]="url('D03')" [queryParams]="{ filter: 'low' }">
          <p class="label">{{ i18n.t({ th: 'แบตต่ำ', en: 'Low battery' }) }}</p>
          <p class="value warn">{{ lowCount() }}</p>
        </a>
        <a class="stat link" [routerLink]="url('D03')" [queryParams]="{ filter: 'unbound' }">
          <p class="label">{{ i18n.t({ th: 'ตู้ยังไม่ผูก', en: 'Unbound boxes' }) }}</p>
          <p class="value">{{ unbound() }}</p>
        </a>
        <a class="stat link" [routerLink]="url('D02')">
          <p class="label">{{ i18n.t({ th: 'หน่วยงานรอ', en: 'Agencies waiting' }) }}</p>
          <p class="value">{{ pendingCount() }}</p>
        </a>
      </div>

      <h2 class="section-title">{{ i18n.t({ th: 'ต้องจัดการ', en: 'To do' }) }}</h2>
      <nav class="list">
        @for (t of todo(); track t.key) {
          <a class="row" [routerLink]="t.path" [queryParams]="t.query ?? null">
            <span class="icon-bubble" [class.danger]="t.tag === 'urgent'" [class.warn]="t.tag === 'box'">
              <app-icon [name]="t.icon" [size]="20" />
            </span>
            <span class="grow">
              <strong>{{ i18n.t(t.title) }}</strong>
              <span class="muted small block">{{ i18n.t(t.sub) }}</span>
            </span>
            <span class="chip" [class.danger]="t.tag === 'urgent'" [class.warn]="t.tag === 'box'">
              {{ i18n.t(tagLabel[t.tag]) }}
            </span>
          </a>
        } @empty {
          <p class="row muted">{{ i18n.t({ th: 'ไม่มีงานค้าง', en: 'Nothing to do' }) }}</p>
        }
      </nav>

      <nav class="list">
        @for (m of menu; track m.code) {
          <a class="row" [routerLink]="url(m.code)" [queryParams]="m.code === 'A14' ? { from: 'D01' } : null">
            <span class="icon-bubble"><app-icon [name]="m.icon" [size]="20" /></span>
            <strong class="grow">{{ i18n.t(m.label) }}</strong>
            <app-icon name="chevronRight" [size]="18" />
          </a>
        }
      </nav>
      <section class="card support">
        <span class="muted small">{{ i18n.t({ th: 'ช่องทางติดต่อผู้ดูแล (แสดงให้ผู้ใช้เห็นตอนต้องติดต่อแอดมิน)', en: 'Admin contact (shown when users need the admin)' }) }}</span>
        @if (editingSupport()) {
          <input class="support-input" maxlength="500" [value]="supportDraft()" (input)="supportDraft.set($any($event.target).value)" />
          <div class="two">
            <button type="button" class="btn secondary" (click)="editingSupport.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
            <button type="button" class="btn" [disabled]="!supportDraft().trim()" (click)="saveSupport()">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
          </div>
        } @else {
          <strong>{{ support() ?? i18n.t({ th: 'ยังไม่ได้ตั้ง', en: 'Not set' }) }}</strong>
          <button type="button" class="btn secondary" (click)="editSupport()">{{ i18n.t({ th: 'แก้ไข', en: 'Edit' }) }}</button>
        }
      </section>
      <button type="button" class="btn secondary signout" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .link {
      text-decoration: none;
      color: inherit;
    }
    .plans {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .support {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .support-input {
      min-height: 48px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .signout {
      color: var(--brand);
      box-shadow: inset 0 0 0 1.5px var(--line);
    }
  `,
})
export class AdminHome implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly editingSupport = signal(false);
  protected readonly supportDraft = signal('');
  protected readonly support = signal<string | null>(null);
  protected readonly boxes = signal<AdminBoxRow[]>([]);
  protected readonly overview = signal<AdminOverview | null>(null);
  protected readonly pending = signal<AdminAgency[]>([]);
  protected readonly technicianRequests = signal(0);
  protected readonly online = computed(() => this.overview()?.boxes.online ?? this.boxes().filter((b) => b.status === 'online' || b.status === 'sleeping').length);
  protected readonly totalBoxes = computed(() => this.overview()?.boxes.total ?? this.boxes().length);
  protected readonly lowCount = computed(() => this.overview()?.boxes.low_battery ?? this.low().length);
  protected readonly pendingCount = computed(() => this.overview()?.agencies_pending ?? this.pending().length);
  protected readonly unbound = computed(() => this.overview()?.boxes.unbound ?? this.boxes().filter((b) => b.status === 'unbound').length);
  protected readonly low = computed(() => this.boxes().filter((b) => b.bound && b.battery && b.battery.pct < LOW_BATTERY_PCT));

  async ngOnInit(): Promise<void> {
    const [overview, boxes, pending, support, technicianRequests] = await Promise.all([
      this.api.overview().catch(() => null),
      this.api.boxes().catch(() => null),
      this.api.agencies('pending').catch(() => []),
      firstValueFrom(this.http.get<{ contact: string | null }>('/api/v1/support')).catch(() => null),
      this.api.technicianRequests('open').catch(() => []),
    ]);
    this.overview.set(overview);
    this.boxes.set(boxes?.data ?? []);
    this.pending.set(pending);
    this.support.set(support?.contact ?? null);
    this.technicianRequests.set(technicianRequests.length);
  }

  protected editSupport(): void {
    this.supportDraft.set(this.support() ?? '');
    this.editingSupport.set(true);
  }

  /** PUT /admin/settings/support-contact { contact } */
  protected async saveSupport(): Promise<void> {
    const v = this.supportDraft().trim();
    if (!v) return;
    try {
      await firstValueFrom(this.http.put('/api/v1/admin/settings/support-contact', { contact: v }));
      this.support.set(v);
      this.editingSupport.set(false);
      this.toast.show({ th: 'บันทึกช่องทางติดต่อแล้ว', en: 'Contact saved' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่ได้', en: 'Couldn’t save' });
    }
  }

  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04')));
  }

  /** งานค้าง: หน่วยงานรออนุมัติ · ตู้ไม่ออนไลน์ · แบตต่ำ — หายไปเมื่อจัดการแล้ว */
  protected readonly todo = computed(() => {
    const items: { key: string; icon: IconName; tag: 'urgent' | 'pending' | 'box'; title: Tr; sub: Tr; path: string; query?: Record<string, string> }[] = [];
    for (const a of this.pending()) {
      items.push({ key: a.id, icon: 'user', tag: 'pending', title: { th: 'หน่วยงานใหม่ · ' + a.name, en: 'New agency · ' + a.name }, sub: { th: 'รออนุมัติ', en: 'Waiting for approval' }, path: screenUrl('D02') });
    }
    if (this.technicianRequests() > 0) {
      items.push({ key: 'technician-requests', icon: 'user', tag: 'pending', title: { th: 'มีคำขอช่างใหม่', en: 'New technician requests' }, sub: { th: `${this.technicianRequests()} รายการรอดำเนินการ`, en: `${this.technicianRequests()} requests waiting` }, path: screenUrl('D15') });
    }
    for (const b of this.boxes().filter((x) => x.status === 'offline')) {
      const seen = seenText(b.last_seen_at);
      items.push({ key: b.id, icon: 'box', tag: 'box', title: { th: 'ตู้ ' + (b.house_no ?? b.id) + ' ไม่ออนไลน์', en: 'Box ' + (b.house_no ?? b.id) + ' offline' }, sub: { th: 'ติดต่อล่าสุด ' + seen.th, en: 'Last seen ' + seen.en }, path: screenUrl('D04'), query: { id: b.id } });
    }
    for (const b of this.low()) {
      items.push({ key: 'low-' + b.id, icon: 'alert', tag: 'urgent', title: { th: 'แบตต่ำ · ' + (b.house_no ?? b.id), en: 'Low battery · ' + (b.house_no ?? b.id) }, sub: { th: b.battery!.pct + '%', en: b.battery!.pct + '%' }, path: screenUrl('D04'), query: { id: b.id } });
    }
    return items;
  });

  protected readonly tagLabel = {
    urgent: { th: 'ด่วน', en: 'Urgent' },
    pending: { th: 'รอ', en: 'Waiting' },
    box: { th: 'ตู้', en: 'Box' },
  };
  protected readonly menu: { code: string; icon: IconName; label: Tr }[] = [
    { code: 'D09', icon: 'user', label: { th: 'ผู้ใช้', en: 'Users' } },
    { code: 'D10', icon: 'target', label: { th: 'ค่าตั้งค่าตู้', en: 'Mailbox config' } },
    { code: 'D13', icon: 'shield', label: { th: 'หน่วยงาน', en: 'Agencies' } },
    { code: 'T01', icon: 'settings', label: { th: 'งานช่าง (ติดตั้ง)', en: 'Technician (install)' } },
    { code: 'D15', icon: 'user', label: { th: 'คำขอช่างจากเจ้าของบ้าน', en: 'Owner technician requests' } },
    { code: 'A14', icon: 'user', label: { th: 'เปลี่ยนรหัสผ่านของฉัน', en: 'Change my password' } },
  ];
}
