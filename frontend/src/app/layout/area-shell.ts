import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AdminApi } from '../core/admin-api';
import { I18n, type Tr } from '../core/i18n';
import { ToastHost } from '../core/toast';
import { AREA_LABEL, screen, TABS, TABS_EASY, type Area } from '../screens/registry';
import { DisplaySettings } from '../core/display-settings';
import { Icon, type IconName } from '../shared/icon';
import { TabBar } from '../shared/tab-bar';
import { screenUrl } from '../screens/registry';
import { Session } from '../core/session';
import { RouterLinkActive } from '@angular/router';

/** เมนูข้างของแอดมินบนจอคอม — จัดกลุ่มตามงาน · เมนูที่มี `children` กางเป็นเมนูย่อยได้ (ลิงก์ไปหน้าเดียวกันพร้อมตัวกรอง) */
interface NavItem {
  code: string;
  icon: IconName;
  label: Tr;
  query?: Record<string, string>;
  children?: NavItem[];
}
const ADMIN_NAV: { id: string; title: Tr; items: NavItem[] }[] = [
  {
    id: 'overview',
    title: { th: 'ภาพรวม', en: 'Overview' },
    items: [
      { code: 'D01', icon: 'home', label: { th: 'ภาพรวม', en: 'Overview' } },
      { code: 'D12', icon: 'bell', label: { th: 'แจ้งเตือน', en: 'Notifications' } },
    ],
  },
  {
    id: 'boxes',
    title: { th: 'ตู้', en: 'Boxes' },
    items: [
      {
        code: 'D03',
        icon: 'box',
        label: { th: 'ตู้ทั้งหมด', en: 'All boxes' },
        children: [
          { code: 'D03', icon: 'box', label: { th: 'ทั้งหมด', en: 'All' } },
          { code: 'D03', icon: 'alert', label: { th: 'ไม่ออนไลน์', en: 'Offline' }, query: { filter: 'offline' } },
          { code: 'D03', icon: 'target', label: { th: 'ยังไม่ผูก', en: 'Unbound' }, query: { filter: 'unbound' } },
          { code: 'D03', icon: 'info', label: { th: 'แบตต่ำ', en: 'Low battery' }, query: { filter: 'low' } },
        ],
      },
      { code: 'D05', icon: 'scan', label: { th: 'จัดการ QR', en: 'QR cases' } },
      { code: 'D10', icon: 'layers', label: { th: 'ค่าตั้งค่าตู้', en: 'Mailbox config' } },
      {
        code: 'T01',
        icon: 'settings',
        label: { th: 'งานช่าง', en: 'Technician' },
        children: [
          { code: 'T01', icon: 'check', label: { th: 'เช็กลิสต์ติดตั้ง', en: 'Install checklist' } },
          { code: 'D15', icon: 'list', label: { th: 'คำขอช่าง', en: 'Technician requests' } },
        ],
      },
    ],
  },
  {
    id: 'people',
    title: { th: 'ผู้ใช้และหน่วยงาน', en: 'People' },
    items: [
      {
        code: 'D09',
        icon: 'user',
        label: { th: 'ผู้ใช้', en: 'Users' },
        children: [
          { code: 'D09', icon: 'user', label: { th: 'ทั้งหมด', en: 'All' } },
          { code: 'D09', icon: 'home', label: { th: 'เจ้าของบ้าน', en: 'Owners' }, query: { role: 'owner' } },
          { code: 'D09', icon: 'shield', label: { th: 'เจ้าหน้าที่', en: 'Officers' }, query: { role: 'officer' } },
          { code: 'D09', icon: 'pin', label: { th: 'หัวหน้า', en: 'Heads' }, query: { role: 'head' } },
          { code: 'D09', icon: 'settings', label: { th: 'แอดมิน', en: 'Admins' }, query: { role: 'admin' } },
          { code: 'D09', icon: 'alert', label: { th: 'ปิดบัญชี', en: 'Disabled' }, query: { role: 'off' } },
        ],
      },
      {
        code: 'D13',
        icon: 'shield',
        label: { th: 'หน่วยงาน', en: 'Agencies' },
        children: [
          { code: 'D13', icon: 'shield', label: { th: 'ทั้งหมด', en: 'All' } },
          { code: 'D02', icon: 'check', label: { th: 'รออนุมัติ', en: 'Pending' } },
        ],
      },
      { code: 'D14', icon: 'list', label: { th: 'แพ็กเกจ', en: 'Plans' } },
    ],
  },
  {
    id: 'system',
    title: { th: 'ระบบ', en: 'System' },
    items: [{ code: 'D11', icon: 'list', label: { th: 'ประวัติระบบ', en: 'System log' } }],
  },
];
/** จำการพับเมนูไว้ในเครื่อง (ไม่ใช่ข้อมูลสำคัญ — เปิดไม่ได้ก็ใช้ค่าเริ่มต้น) */
const NAV_KEY = 'smmb.adminNav';
function readNav(): { mini: boolean; closed: string[]; open: string[] } {
  try {
    const v = JSON.parse(localStorage.getItem(NAV_KEY) ?? '{}');
    return { mini: !!v.mini, closed: Array.isArray(v.closed) ? v.closed : [], open: Array.isArray(v.open) ? v.open : [] };
  } catch {
    return { mini: false, closed: [], open: [] };
  }
}

/** Screen codes that intentionally remain prototypes; currently all built screens use APIs. */
const MOCK_SCREENS = new Set<string>();

/**
 * โครงของแต่ละบทบาท: เนื้อหา · แท็บล่าง (ถ้าบทบาทนั้นมี)
 * พื้นที่เนื้อหาขยายตาม viewport ของอุปกรณ์ โดยไม่ล็อกความกว้างหน้าจอ
 */
@Component({
  selector: 'app-area-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TabBar, ToastHost, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="frame" [class.admin-layout]="isAdmin" [class.auth-layout]="area === 'auth'" [class.nav-mini]="mini()" [attr.data-area]="area">
      @if (isAdmin) {
        <aside class="side" [class.mini]="mini()" [attr.aria-label]="i18n.t({ th: 'เมนูแอดมิน', en: 'Admin menu' })">
          <div class="brand">
            <span class="logo" aria-hidden="true">S</span>
            <span class="name">Smart Mailbox<small>{{ i18n.t({ th: 'ศูนย์ควบคุมแอดมิน', en: 'Admin console' }) }}</small></span>
            <button type="button" class="collapse" (click)="toggleMini()" [attr.aria-expanded]="!mini()"
              [attr.aria-label]="mini() ? i18n.t({ th: 'ขยายเมนู', en: 'Expand menu' }) : i18n.t({ th: 'ย่อเมนู', en: 'Collapse menu' })"
              [attr.title]="mini() ? i18n.t({ th: 'ขยายเมนู', en: 'Expand menu' }) : i18n.t({ th: 'ย่อเมนู', en: 'Collapse menu' })">
              <app-icon [name]="mini() ? 'chevronRight' : 'chevronLeft'" [size]="18" />
            </button>
          </div>
          <nav class="nav">
            @for (g of adminNav; track g.id) {
              @if (mini()) {
                <hr class="sep" />
              } @else {
                <button type="button" class="group" [class.easy-hide]="g.id === 'system'" (click)="toggleGroup(g.id)" [attr.aria-expanded]="!groupClosed(g.id)">
                  <span>{{ i18n.t(g.title) }}</span>
                  <app-icon class="caret" [class.down]="!groupClosed(g.id)" name="chevronRight" [size]="14" />
                </button>
              }
              @if (mini() || !groupClosed(g.id)) {
                @for (it of g.items; track it.code + it.label.en) {
                  <div class="item" [class.within]="within(it)" [class.easy-hide]="g.id === 'system'">
                    <a [routerLink]="url(it.code)" routerLinkActive="active"
                      [routerLinkActiveOptions]="{ paths: it.code === 'D01' ? 'exact' : 'subset', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' }"
                      [attr.title]="mini() ? i18n.t(it.label) : null" (click)="it.children && openItem(it)">
                      <app-icon [name]="it.icon" [size]="18" />
                      <span class="lbl">{{ i18n.t(it.label) }}</span>
                      @if (badges()[it.code]; as n) {
                        <b class="count" [class.hot]="it.code === 'D03'" [attr.aria-label]="n + ' ' + i18n.t({ th: 'รายการรอจัดการ', en: 'items waiting' })">{{ n > 99 ? '99+' : n }}</b>
                      }
                    </a>
                    @if (it.children && !mini()) {
                      <button type="button" class="twisty" (click)="toggleItem(it)" [attr.aria-expanded]="expanded(it)"
                        [attr.aria-label]="(expanded(it) ? i18n.t({ th: 'ซ่อนเมนูย่อย ', en: 'Hide submenu ' }) : i18n.t({ th: 'แสดงเมนูย่อย ', en: 'Show submenu ' })) + i18n.t(it.label)">
                        <app-icon class="caret" [class.down]="expanded(it)" name="chevronRight" [size]="14" />
                      </button>
                    }
                  </div>
                  @if (it.children && !mini() && expanded(it)) {
                    <div class="sub">
                      @for (c of it.children; track c.label.en) {
                        <a [routerLink]="url(c.code)" [queryParams]="c.query ?? null" [class.active]="childActive(c)" [attr.aria-current]="childActive(c) ? 'page' : null">
                          <span class="lbl">{{ i18n.t(c.label) }}</span>
                          @if (!c.query && c.code !== it.code && badges()[c.code]; as n) {
                            <b class="count">{{ n > 99 ? '99+' : n }}</b>
                          }
                        </a>
                      }
                    </div>
                  }
                }
              }
            }
          </nav>
          <div class="me">
            <span class="avatar" aria-hidden="true" [attr.title]="mini() ? (session.me()?.display_name ?? '') : null">{{ initial() }}</span>
            <span class="who">
              <strong>{{ session.me()?.display_name ?? '' }}</strong>
              <small>{{ i18n.t({ th: 'แอดมิน', en: 'Admin' }) }}</small>
            </span>
            <button type="button" class="out" (click)="signout()" [attr.aria-label]="i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' })" [attr.title]="i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' })">
              <app-icon name="signout" [size]="18" />
            </button>
          </div>
        </aside>
      }
      @if (mock()) {
        <a class="demo" routerLink="/demo">
          {{ i18n.t({ th: 'ต้นแบบ · ข้อมูลจำลอง', en: 'Prototype · sample data' }) }} · {{ i18n.t(areaLabel()) }}
          <span aria-hidden="true">⇄</span>
        </a>
      }
      <main [class.full]="fullscreen()">
        <router-outlet />
      </main>
      <app-toast />
      @if (tabs(); as t) {
        @if (!hideTabs()) {
          <app-tab-bar [tabs]="t" />
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .frame {
      display: flex;
      flex-direction: column;
      min-block-size: 100dvh;
      inline-size: 100%;
      min-inline-size: 0;
      background: var(--bg);
    }
    .side {
      display: none;
    }
    @media (min-width: 1024px) {
      .admin-layout {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr);
        grid-template-rows: auto 1fr;
        align-items: start;
      }
      .admin-layout {
        grid-template-columns: 264px minmax(0, 1fr);
        transition: grid-template-columns 0.18s ease;
      }
      .admin-layout.nav-mini {
        grid-template-columns: 72px minmax(0, 1fr);
      }
      .admin-layout.nav-mini main {
        max-inline-size: 1560px;
      }
      .admin-layout .side {
        display: flex;
        flex-direction: column;
        gap: 2px;
        grid-row: 1 / span 3;
        position: sticky;
        inset-block-start: 0;
        block-size: 100dvh;
        overflow-y: auto;
        padding: 20px 14px 14px;
        background: var(--surface);
        border-inline-end: 1px solid var(--line-strong, var(--line));
      }
      .admin-layout main {
        max-inline-size: 1360px;
        margin-inline: 0;
        padding: 12px clamp(28px, 3.2vw, 56px) 64px;
        grid-column: 2;
      }
      .admin-layout app-tab-bar {
        display: none;
      }
      .admin-layout app-toast {
        grid-column: 2;
      }
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 4px 12px 8px;
    }
    .collapse {
      margin-inline-start: auto;
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 32px;
      block-size: 32px;
      border: 1px solid var(--line-strong, var(--line));
      border-radius: 8px;
      background: var(--surface);
      color: var(--text-muted);
      cursor: pointer;
    }
    .collapse:hover {
      color: var(--text);
      background: var(--icon-bg);
    }
    .nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .item {
      position: relative;
      display: flex;
      align-items: center;
    }
    .item > a {
      flex: 1;
      min-inline-size: 0;
    }
    .twisty {
      position: absolute;
      inset-inline-end: 4px;
      display: grid;
      place-items: center;
      inline-size: 28px;
      block-size: 28px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
    }
    .item:has(.twisty) > a {
      padding-inline-end: 36px;
    }
    .twisty:hover {
      background: var(--line);
      color: var(--text);
    }
    .caret {
      transition: transform 0.15s ease;
    }
    .caret.down {
      transform: rotate(90deg);
    }
    .item.within > a:not(.active) {
      color: var(--brand-dark);
      font-weight: 600;
    }
    .sub {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin: 2px 0 6px 21px;
      padding-inline-start: 12px;
      border-inline-start: 1.5px solid var(--line-strong, var(--line));
    }
    .side .sub a {
      padding: 7px 10px;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    .side .sub a:hover {
      color: var(--text);
    }
    .side .sub a.active {
      color: var(--brand-dark);
      background: var(--brand-light);
      font-weight: 700;
    }
    .side .sub a.active::before {
      display: none;
    }
    .sep {
      border: 0;
      border-block-start: 1px solid var(--line);
      margin: 10px 8px;
    }
    /* ย่อเมนู: เหลือแต่ไอคอน */
    .side.mini {
      padding-inline: 10px;
    }
    .side.mini .brand {
      flex-direction: column;
      padding-inline: 0;
    }
    .side.mini .name,
    .side.mini .lbl,
    .side.mini .who {
      display: none;
    }
    .side.mini .collapse {
      margin-inline-start: 0;
    }
    .side.mini a {
      justify-content: center;
      padding: 10px 0;
    }
    .side.mini .count {
      position: absolute;
      inset-block-start: 2px;
      inset-inline-end: 2px;
      min-inline-size: 18px;
      padding: 0 4px;
      font-size: 0.625rem;
    }
    .side.mini a.active::before {
      inset-inline-start: -10px;
    }
    .side.mini .me {
      justify-content: center;
      flex-direction: column;
      padding-inline: 0;
    }
    .logo {
      display: grid;
      place-items: center;
      inline-size: 38px;
      block-size: 38px;
      border-radius: 10px;
      background: var(--brand);
      color: #fff;
      font-weight: 800;
      font-size: 1.25rem;
    }
    .name {
      display: flex;
      flex-direction: column;
      font-weight: 800;
      line-height: 1.25;
    }
    .name small {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--text-muted);
    }
    .group {
      display: flex;
      align-items: center;
      justify-content: space-between;
      inline-size: 100%;
      border: 0;
      background: none;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--text-muted);
      padding: 16px 12px 6px;
      cursor: pointer;
      text-align: start;
    }
    .group:hover {
      color: var(--text);
    }
    .side a {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      color: var(--text);
      text-decoration: none;
      font-size: 0.9375rem;
    }
    .lbl {
      flex: 1;
      min-inline-size: 0;
    }
    .count {
      flex: none;
      min-inline-size: 22px;
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--icon-bg);
      color: var(--text);
      font-size: 0.75rem;
      font-weight: 700;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .count.hot {
      background: var(--badge-bg);
      color: #fff;
    }
    .side a app-icon {
      color: var(--text-muted);
    }
    .side a:hover {
      background: var(--icon-bg);
    }
    .side a.active {
      background: var(--brand-light);
      color: var(--brand-dark);
      font-weight: 700;
    }
    .side a.active app-icon {
      color: var(--brand);
    }
    .side a.active::before {
      content: '';
      position: absolute;
      inset-inline-start: -14px;
      inset-block-start: 8px;
      inset-block-end: 8px;
      inline-size: 4px;
      border-radius: 0 4px 4px 0;
      background: var(--brand);
    }
    .me {
      margin-block-start: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 8px 4px;
      border-block-start: 1px solid var(--line-strong, var(--line));
    }
    .avatar {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 36px;
      block-size: 36px;
      border-radius: 50%;
      background: var(--brand-light);
      color: var(--brand-dark);
      font-weight: 800;
    }
    .who {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }
    .who strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.875rem;
    }
    .who small {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .out {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 36px;
      block-size: 36px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
    }
    .out:hover {
      background: var(--danger-bg);
      color: var(--sos);
    }
    .demo {
      display: block;
      text-align: center;
      font-size: 0.75rem;
      padding: 4px 16px;
      background: var(--brand-light);
      color: var(--brand-dark);
      text-decoration: none;
    }
    /* จอใหญ่ (คอม/iPad): จำกัดความกว้างเนื้อหาให้อ่านง่าย กึ่งกลางจอ · มือถือเต็มจอเหมือนเดิม */
    main {
      flex: 1;
      min-inline-size: 0;
      inline-size: 100%;
      max-inline-size: var(--content-w, 640px);
      margin-inline: auto;
      padding: clamp(8px, 1.5vw, 24px) clamp(12px, 2vw, 32px) clamp(24px, 3vw, 40px);
      display: flex;
      flex-direction: column;
    }
    main.full {
      padding: 0;
    }
    /* หน้าลูกเต็มความสูง: อยู่ใน styles.scss (สไตล์ของ component นี้ไปไม่ถึงหน้าลูก) */
    app-tab-bar {
      inline-size: 100%;
      max-inline-size: var(--content-w, 640px);
      margin-inline: auto;
      border-radius: var(--radius) var(--radius) 0 0;
      overflow: hidden;
      position: sticky;
      inset-block-end: 0;
      z-index: 2;
    }
    @media (max-width: 1023px) {
      main {
        padding: 12px 20px 28px;
      }
    }
  `,
})
export class AreaShell {
  protected readonly i18n = inject(I18n);
  private readonly route = inject(ActivatedRoute);
  private readonly area = this.route.snapshot.data['area'] as Area;
  /** แอดมิน/หัวหน้ามีตารางและรายการเยอะ → กว้างกว่าบทบาทอื่น */
  protected readonly isAdmin = this.area === 'admin';
  protected readonly adminNav = ADMIN_NAV;
  /** ย่อเมนูเหลือไอคอน · กลุ่มที่พับ · เมนูที่กาง/พับเมนูย่อยเอง (จำไว้ในเครื่อง) */
  private readonly saved = readNav();
  protected readonly mini = signal(this.saved.mini);
  private readonly closedGroups = signal(new Set(this.saved.closed));
  private readonly openItems = signal(new Set(this.saved.open));
  private readonly saveNav = effect(() => {
    const v = { mini: this.mini(), closed: [...this.closedGroups()], open: [...this.openItems()] };
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify(v));
    } catch {
      // เก็บไม่ได้ (โหมดส่วนตัว) — ใช้ค่าเริ่มต้นครั้งหน้า
    }
  });
  /** URL ปัจจุบัน — ใช้บอกเมนูย่อยที่เลือกอยู่ */
  private readonly nav = inject(Router);
  private readonly loc = toSignal(
    this.nav.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.nav.parseUrl(this.nav.url)),
      startWith(this.nav.parseUrl(this.nav.url)),
    ),
  );
  private currentPath(): string {
    const t = this.loc();
    return t ? '/' + (t.root.children['primary']?.segments.map((x) => x.path).join('/') ?? '') : '';
  }
  protected childActive(c: NavItem): boolean {
    const t = this.loc();
    if (!t || this.currentPath() !== screenUrl(c.code)) return false;
    return ['filter', 'role'].every((k) => (c.query?.[k] ?? null) === (t.queryParams[k] ?? null));
  }
  /** หน้าปัจจุบันอยู่ในเมนูย่อยที่ไม่ใช่หน้าของเมนูแม่ (เช่น คำขอช่าง ใต้ งานช่าง) */
  protected within(it: NavItem): boolean {
    const p = this.currentPath();
    return p !== screenUrl(it.code) && !!it.children?.some((c) => p === screenUrl(c.code));
  }
  protected groupClosed(id: string): boolean {
    return this.closedGroups().has(id);
  }
  protected toggleGroup(id: string): void {
    this.closedGroups.update((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  /** กางไว้เอง · หรืออยู่ในหน้าของเมนูนี้ (ถ้าไม่ได้พับไว้เอง) */
  protected expanded(it: NavItem): boolean {
    const k = it.code + it.label.en;
    if (this.openItems().has(k)) return true;
    if (this.openItems().has('-' + k)) return false;
    const p = this.currentPath();
    return !!it.children?.some((c) => p === screenUrl(c.code));
  }
  protected toggleItem(it: NavItem): void {
    const k = it.code + it.label.en;
    const open = this.expanded(it);
    this.openItems.update((cur) => {
      const n = new Set(cur);
      n.delete(k);
      n.delete('-' + k);
      n.add(open ? '-' + k : k);
      return n;
    });
  }
  protected openItem(it: NavItem): void {
    if (!this.expanded(it)) this.toggleItem(it);
  }
  protected toggleMini(): void {
    this.mini.update((v) => !v);
  }
  private readonly adminApi = inject(AdminApi);
  /** ตัวเลขงานค้างข้างเมนู (ตู้ไม่ออนไลน์ · ปัญหา QR · คำขอ) — รีเฟรชทุกครั้งที่เปลี่ยนหน้า */
  protected readonly badges = signal<Record<string, number>>({});
  protected readonly session = inject(Session);
  protected readonly initial = computed(() => (this.session.me()?.display_name ?? 'A').trim().charAt(0).toUpperCase());
  protected readonly url = screenUrl;
  private readonly router = inject(Router);
  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04'), { replaceUrl: true }));
  }
  protected readonly areaLabel = computed(() => AREA_LABEL[this.area]);
  private readonly display = inject(DisplaySettings);
  /** โหมดง่ายลดเมนูเหลือ 3 รายการ "เฉพาะหน้าหลักของบทบาท" ตามแคนวาส (หน้าอื่นยังใช้แท็บเต็ม) */
  protected readonly tabs = computed(() => {
    const home: Partial<Record<Area, string>> = { officer: 'O01', head: 'L04', admin: 'D01' };
    return this.display.easyMode() && home[this.area] === this.code() ? TABS_EASY[this.area] ?? TABS[this.area] : TABS[this.area];
  });
  /** แถบ "ต้นแบบ" เฉพาะหน้าที่ยังเป็นข้อมูลจำลอง — ที่เหลือใช้ API จริงทั้งหมด */
  protected readonly mock = computed(() => MOCK_SCREENS.has(this.code() ?? ''));

  /** หน้าลูกปัจจุบันเป็นหน้าเต็มจอไหม (เช่น SOS) → ซ่อนแท็บล่าง */
  private readonly code = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.currentCode()),
      startWith(this.currentCode()),
    ),
  );
  private readonly refreshBadges = effect(() => {
    this.code();
    if (!this.isAdmin) return;
    this.adminApi
      .overview()
      .then((o) =>
        this.badges.set({
          D03: o.boxes.offline,
          D05: o.qr_issues.total,
          D13: o.agencies_pending,
          D15: o.technician_requests_open,
        }),
      )
      .catch(() => undefined);
  });
  protected readonly fullscreen = computed(() => {
    const c = this.code();
    return c ? screen(c).fullscreen === true : false;
  });
  protected readonly hideTabs = computed(() => {
    const c = this.code();
    return this.fullscreen() || (c ? screen(c).noTabs === true : false);
  });

  private currentCode(): string | undefined {
    let r = this.route.snapshot;
    while (r.firstChild) r = r.firstChild;
    return r.data['code'] as string | undefined;
  }
}
