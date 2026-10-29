import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { I18n } from '../core/i18n';
import { ToastHost } from '../core/toast';
import { AREA_LABEL, screen, TABS, type Area } from '../screens/registry';
import { TabBar } from '../shared/tab-bar';

/** Screen codes that intentionally remain prototypes; currently all built screens use APIs. */
const MOCK_SCREENS = new Set<string>();

/**
 * โครงของแต่ละบทบาท: เนื้อหา · แท็บล่าง (ถ้าบทบาทนั้นมี)
 * พื้นที่เนื้อหาขยายตาม viewport ของอุปกรณ์ โดยไม่ล็อกความกว้างหน้าจอ
 */
@Component({
  selector: 'app-area-shell',
  imports: [RouterOutlet, RouterLink, TabBar, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="frame">
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
    .demo {
      display: block;
      text-align: center;
      font-size: 0.75rem;
      padding: 4px 16px;
      background: var(--brand-light);
      color: var(--brand-dark);
      text-decoration: none;
    }
    main {
      flex: 1;
      min-width: 0;
      width: 100%;
      padding: clamp(8px, 1.5vw, 24px) clamp(12px, 2vw, 32px) clamp(24px, 3vw, 40px);
      display: flex;
      flex-direction: column;
    }
    main.full {
      padding: 0;
    }
    /* หน้าลูกเต็มความสูง: อยู่ใน styles.scss (สไตล์ของ component นี้ไปไม่ถึงหน้าลูก) */
    app-tab-bar {
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
