import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AdminApi } from './admin-api';
import { OfficerSosApi } from './owner-api';

const BADGE_REFRESH_MS = 10_000;
const ADMIN_ROUTE_PREFIX = '/admin';
const OFFICER_ROUTE_PREFIX = '/officer';
const AGENCY_ROUTE_PREFIX = '/agency';

/** ตัวเลขบนแท็บล่าง เช่น "SOS (1)" — key = รหัสหน้าของแท็บ */
@Injectable({ providedIn: 'root' })
export class TabBadges {
  private readonly router = inject(Router);
  private readonly admin = inject(AdminApi);
  private readonly officerSos = inject(OfficerSosApi);
  private readonly destroy = inject(DestroyRef);

  readonly counts = signal<Record<string, number>>({ O12: 0, D05: 0 });

  constructor() {
    const subscription = this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => void this.refresh());
    const timer = setInterval(() => void this.refresh(), BADGE_REFRESH_MS);
    this.destroy.onDestroy(() => {
      subscription.unsubscribe();
      clearInterval(timer);
    });
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const path = this.router.url.split('?')[0];
    if (path.startsWith(ADMIN_ROUTE_PREFIX)) {
      try {
        const issues = await this.admin.qrIssues();
        this.counts.update((current) => ({ ...current, D05: issues.length }));
      } catch {
        // Keep the last known count while the admin API is unavailable.
      }
      return;
    }

    if (path.startsWith(OFFICER_ROUTE_PREFIX) || path.startsWith(AGENCY_ROUTE_PREFIX)) {
      try {
        const cases = await this.officerSos.list('open');
        this.counts.update((current) => ({ ...current, O12: cases.length }));
      } catch {
        // Keep the last known count while the officer API is unavailable.
      }
    }
  }
}
