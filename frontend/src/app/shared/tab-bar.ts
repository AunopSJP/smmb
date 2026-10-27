import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, type IsActiveMatchOptions } from '@angular/router';
import { I18n } from '../core/i18n';
import { TabBadges } from '../core/tab-badges';
import { screenUrl, type TabDef } from '../screens/registry';
import { Icon } from './icon';

/** แท็บล่าง — แท็บที่เปิดอยู่เป็นสีแดง (ตาม wireframe) */
@Component({
  selector: 'app-tab-bar',
  imports: [RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav [attr.aria-label]="i18n.t({ th: 'เมนูหลัก', en: 'Main menu' })">
      @for (tab of tabs(); track tab.code) {
        <a
          [routerLink]="url(tab.code)"
          routerLinkActive="active"
          [routerLinkActiveOptions]="activeOptions(tab.code)"
          #rla="routerLinkActive"
          [attr.aria-current]="rla.isActive ? 'page' : null"
        >
          <app-icon [name]="tab.icon" [size]="24" />
          <span>
            {{ i18n.t(tab.label) }}
            @if (badges.counts()[tab.code]; as n) {
              ({{ n }})
            }
          </span>
        </a>
      }
    </nav>
  `,
  styles: `
    nav {
      display: flex;
      background: var(--surface);
      border-top: 1px solid var(--line);
      padding-bottom: env(safe-area-inset-bottom);
    }
    a {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 10px 4px 12px;
      font-size: 0.8125rem;
      text-decoration: none;
      color: var(--text-muted);
      min-height: 64px;
    }
    a.active {
      color: var(--brand);
      font-weight: 700;
    }
  `,
})
export class TabBar {
  protected readonly i18n = inject(I18n);
  protected readonly badges = inject(TabBadges);
  readonly tabs = input.required<TabDef[]>();
  protected readonly url = screenUrl;
  /**
   * แท็บแรก (path ว่าง) ต้องตรง path ทั้งหมด ไม่งั้นติดสถานะเปิดตลอด
   * ไม่สนใจ query (?state=… ของหน้าจำลอง) เวลาเทียบ
   */
  protected activeOptions(code: string): IsActiveMatchOptions {
    return {
      paths: screenUrl(code).split('/').length === 2 ? 'exact' : 'subset',
      queryParams: 'ignored',
      matrixParams: 'ignored',
      fragment: 'ignored',
    };
  }
}
