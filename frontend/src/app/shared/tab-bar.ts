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
      border-block-start: 1px solid var(--line);
      padding-block-end: env(safe-area-inset-bottom);
      padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
    }
    a {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      min-inline-size: 0;
      padding: 8px 4px 10px;
      font-size: 0.75rem;
      line-height: 1.3;
      text-decoration: none;
      color: var(--text-muted);
      min-block-size: 60px;
      text-align: center;
      overflow-wrap: break-word;
    }
    a.active {
      color: var(--brand-text);
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
