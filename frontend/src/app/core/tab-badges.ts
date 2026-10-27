import { computed, inject, Injectable } from '@angular/core';
import { AdminDemo } from './mock/admin-demo';
import { OfficerDemo } from './mock/officer-demo';

/** ตัวเลขบนแท็บล่าง เช่น "SOS (1)" — key = รหัสหน้าของแท็บ */
@Injectable({ providedIn: 'root' })
export class TabBadges {
  private readonly officer = inject(OfficerDemo);
  private readonly admin = inject(AdminDemo);

  readonly counts = computed<Record<string, number>>(() => ({
    O12: this.officer.sosBadge(),
    D05: this.admin.openQr().length,
  }));
}
