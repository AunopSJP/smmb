import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { I18n, type Tr } from '../core/i18n';
import { ToastHost } from '../core/toast';
import { AREA_LABEL, screen, TABS, type Area } from '../screens/registry';
import { Icon, type IconName } from '../shared/icon';
import { TabBar } from '../shared/tab-bar';
import { screenUrl } from '../screens/registry';
import { Session } from '../core/session';
import { RouterLinkActive } from '@angular/router';

/** เมนูข้างของแอดมินบนจอคอม — จัดกลุ่มตามงาน */
const ADMIN_NAV: { title: Tr; items: { code: string; icon: IconName; label: Tr }[] }[] = [
  {
    title: { th: 'ภาพรวม', en: 'Overview' },
    items: [
      { code: 'D01', icon: 'home', label: { th: 'ภาพรวม', en: 'Overview' } },
      { code: 'D12', icon: 'bell', label: { th: 'แจ้งเตือน', en: 'Notifications' } },
    ],
  },
  {
    title: { th: 'ตู้', en: 'Boxes' },
    items: [
      { code: 'D03', icon: 'box', label: { th: 'ตู้ทั้งหมด', en: 'All boxes' } },
      { code: 'D05', icon: 'scan', label: { th: 'จัดการ QR', en: 'QR cases' } },
      { code: 'D10', icon: 'target', label: { th: 'ค่าตั้งค่าตู้', en: 'Mailbox config' } },
      { code: 'T01', icon: 'settings', label: { th: 'งานช่าง', en: 'Technician' } },
      { code: 'D15', icon: 'user', label: { th: 'คำขอช่าง', en: 'Technician requests' } },
    ],
  },
  {
    title: { th: 'ผู้ใช้และหน่วยงาน', en: 'People' },
    items: [
      { code: 'D09', icon: 'user', label: { th: 'ผู้ใช้', en: 'Users' } },
      { code: 'D13', icon: 'shield', label: { th: 'หน่วยงาน', en: 'Agencies' } },
      { code: 'D14', icon: 'list', label: { th: 'แพ็กเกจ', en: 'Plans' } },
    ],
  },
  {
    title: { th: 'ระบบ', en: 'System' },
    items: [{ code: 'D11', icon: 'list', label: { th: 'ประวัติระบบ', en: 'System log' } }],
  },
];

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
    <div class="frame" [class.admin-layout]="isAdmin" [style.--content-w]="contentWidth">
      @if (isAdmin) {
        <aside class="side" [attr.aria-label]="i18n.t({ th: 'เมนูแอดมิน', en: 'Admin menu' })">
          <p class="brand">Smart Mailbox <span>{{ i18n.t({ th: 'แอดมิน', en: 'Admin' }) }}</span></p>
          @for (g of adminNav; track g.title.en) {
            <p class="group">{{ i18n.t(g.title) }}</p>
            @for (it of g.items; track it.code) {
              <a [routerLink]="url(it.code)" routerLinkActive="active" [routerLinkActiveOptions]="{ paths: it.code === 'D01' ? 'exact' : 'subset', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' }">
                <app-icon [name]="it.icon" [size]="20" />
                <span>{{ i18n.t(it.label) }}</span>
              </a>
            }
          }
          <button type="button" class="out" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
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
      min-height: 100dvh;
      width: 100%;
      min-width: 0;
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
      .admin-layout .side {
        display: flex;
        flex-direction: column;
        gap: 2px;
        grid-row: 1 / span 3;
        position: sticky;
        top: 0;
        height: 100dvh;
        overflow-y: auto;
        padding: 20px 12px;
        background: var(--surface);
        border-right: 1px solid var(--line);
      }
      .admin-layout main {
        max-width: 1280px;
        margin-inline: 0;
        padding: 20px clamp(24px, 3vw, 48px) 48px;
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
      font-weight: 800;
      padding: 4px 12px 16px;
      color: var(--brand);
    }
    .brand span {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
    }
    .group {
      font-size: 0.6875rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
      padding: 14px 12px 4px;
    }
    .side a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: var(--radius-sm);
      color: var(--text);
      text-decoration: none;
      font-size: 0.9375rem;
    }
    .side a:hover {
      background: var(--brand-light);
    }
    .side a.active {
      background: var(--brand-light);
      color: var(--brand-dark);
      font-weight: 700;
    }
    .out {
      margin-top: auto;
      padding: 10px 12px;
      border: 1.5px solid var(--line);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--brand);
      font: inherit;
      cursor: pointer;
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
      min-width: 0;
      width: 100%;
      max-width: var(--content-w, 640px);
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
      width: 100%;
      max-width: var(--content-w, 640px);
      margin-inline: auto;
      border-radius: var(--radius) var(--radius) 0 0;
      overflow: hidden;
      position: sticky;
      bottom: 0;
      z-index: 2;
    }
    @media (max-width: 480px) {
      main {
        padding-inline: 12px;
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
  /** แอดมินใช้จอคอมเป็นหลัก → เต็มพื้นที่ (กำหนดใน CSS ≥1024px) · มือถือ/แท็บเล็ตยังเป็นเนื้อหาเดียวกว้าง 960 */
  protected readonly contentWidth = this.area === 'admin' || this.area === 'head' ? '960px' : '640px';
  protected readonly adminNav = ADMIN_NAV;
  protected readonly url = screenUrl;
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04')));
  }
  protected readonly areaLabel = computed(() => AREA_LABEL[this.area]);
  protected readonly tabs = computed(() => TABS[this.area]);
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
