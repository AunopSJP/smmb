import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminApi, type AdminTechnicianRequest } from '../../core/admin-api';
import { DisplaySettings } from '../../core/display-settings';
import { I18n } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { PageHeader } from '../../shared/page-header';
import { screenUrl } from '../../screens/registry';

@Component({
  selector: 'app-admin-technician-requests',
  imports: [DatePipe, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน Smart Mailbox', en: 'Smart Mailbox admin' })" [title]="i18n.t({ th: 'คำขอช่าง', en: 'Technician requests' })" [back]="url('D16')" />
    <div class="stack">
      <div class="segmented chips easy-hide" role="group">
        @for (option of filters; track option.value) {
          <button type="button" [attr.aria-pressed]="filter() === option.value" (click)="filter.set(option.value); load()">{{ i18n.t(option.label) }}</button>
        }
      </div>
      @if (error()) { <p class="danger-text small" role="alert">{{ i18n.t({ th: 'โหลดหรือบันทึกคำขอไม่สำเร็จ ลองอีกครั้ง', en: 'Could not load or save requests. Try again.' }) }}</p> }
      <div class="reqs">
        @for (request of visible(); track request.id) {
          <article class="panel request">
            <div class="grow">
              <header class="rhead">
                <strong>{{ request.box_id }} · {{ request.house_no ?? i18n.t({ th: 'ยังไม่ระบุบ้าน', en: 'No house number' }) }}</strong>
                <span class="chip" [class.warn]="request.status === 'open'" [class.ok]="request.status === 'scheduled'">{{ i18n.t(statusLabel(request.status)) }}</span>
              </header>
              <span class="muted small block">{{ request.owner_name }} · {{ request.owner_phone }}</span>
              <a class="btn secondary easy-only call" [href]="'tel:' + request.owner_phone">{{ i18n.t({ th: 'โทรหาเจ้าของ', en: 'Call the owner' }) }}</a>
              <span class="small block">{{ reasonLabel(request.reason) }}</span>
              <span class="muted small block">{{ request.created_at | date:'d MMM yyyy HH:mm' }}</span>
              <span class="muted small block mono adv-only">{{ request.id }} · status={{ request.status }} · reason={{ request.reason }} · created_at={{ request.created_at }} · scheduled_at={{ request.scheduled_at ?? '—' }}</span>
              @if (request.note) { <p class="request-note">{{ request.note }}</p> }
              @if (request.status === 'open') {
                <label class="field">
                  <span>{{ i18n.t({ th: 'เวลานัดหมาย', en: 'Appointment time' }) }}</span>
                  <input type="datetime-local" [value]="scheduleValue(request.id)" (input)="setSchedule(request.id, $event)" />
                </label>
                <label class="field">
                  <span>{{ i18n.t({ th: 'ข้อความถึงเจ้าของ (ถ้ามี)', en: 'Message to owner (optional)' }) }}</span>
                  <input maxlength="500" [value]="noteValue(request.id)" (input)="setNote(request.id, $event)" />
                </label>
                <button type="button" class="btn" [disabled]="saving() === request.id || !scheduleValue(request.id)" (click)="schedule(request)">{{ i18n.t({ th: 'บันทึกนัดหมายและแจ้งเจ้าของ', en: 'Schedule and notify owner' }) }}</button>
              } @else if (request.status === 'scheduled') {
                <p class="small">{{ i18n.t({ th: 'นัด ', en: 'Scheduled ' }) }}{{ request.scheduled_at | date:'d MMM yyyy HH:mm' }}</p>
                <button type="button" class="btn secondary" [disabled]="saving() === request.id" (click)="complete(request)">{{ i18n.t({ th: 'ปิดงานช่าง', en: 'Complete request' }) }}</button>
              } @else if (request.admin_note) {
                <p class="muted small">{{ request.admin_note }}</p>
              }
            </div>
          </article>
        } @empty {
          <section class="panel"><p class="muted">{{ i18n.t({ th: 'ไม่มีคำขอช่างในสถานะนี้', en: 'No requests in this status' }) }}</p></section>
        }
      </div>
    </div>
  `,
  styles: `
    .grow { flex: 1; min-inline-size: 0; }
    .block { display: block; }
    .reqs { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (min-width: 1100px) { .reqs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .reqs > .panel:only-child { grid-column: 1 / -1; }
    .rhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-block-end: 4px; }
    .request-note { margin: 8px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .field { display: grid; gap: 6px; margin: 10px 0; }
    .field input { min-inline-size: 0; min-block-size: 40px; padding: 8px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font: inherit; }
    .segmented { flex-wrap: wrap; }
    .call { inline-size: auto; align-self: flex-start; margin-block: 6px; }
  `,
})
export class AdminTechnicianRequests implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  private readonly display = inject(DisplaySettings);
  protected readonly url = screenUrl;
  protected readonly rows = signal<AdminTechnicianRequest[]>([]);
  protected readonly filter = signal<'open' | 'scheduled' | 'done'>('open');
  protected readonly schedules = signal<Record<string, string>>({});
  protected readonly notes = signal<Record<string, string>>({});
  protected readonly saving = signal<string | null>(null);
  protected readonly error = signal(false);
  /** โหมดง่าย: ไม่แสดงงานที่ปิดแล้ว เพื่อให้เห็นเฉพาะงานที่ต้องทำ */
  protected readonly visible = computed(() => (this.display.easyMode() ? this.rows().filter((r) => r.status !== 'done') : this.rows()));
  protected readonly filters = [
    { value: 'open' as const, label: { th: 'รอจัดการ', en: 'Open' } },
    { value: 'scheduled' as const, label: { th: 'นัดแล้ว', en: 'Scheduled' } },
    { value: 'done' as const, label: { th: 'เสร็จแล้ว', en: 'Done' } },
  ];

  ngOnInit(): void { void this.load(); }

  protected async load(): Promise<void> {
    try {
      // โหมดง่าย: เห็นทั้งรอจัดการและนัดแล้วพร้อมกัน (ไม่มีตัวกรองให้กด)
      this.rows.set(await this.api.technicianRequests(this.display.easyMode() ? undefined : this.filter()));
      this.error.set(false);
    } catch { this.error.set(true); }
  }

  protected reasonLabel(reason: AdminTechnicianRequest['reason']): string {
    return this.i18n.t({
      wifi_change: { th: 'เปลี่ยน Wi-Fi บ้าน', en: 'Change home Wi-Fi' },
      repair: { th: 'ตู้ชำรุด / ไม่ออนไลน์', en: 'Repair / mailbox offline' },
      other: { th: 'เรื่องอื่น', en: 'Other' },
    }[reason]);
  }

  protected statusLabel(status: AdminTechnicianRequest['status']) {
    return { open: { th: 'รอจัดการ', en: 'Open' }, scheduled: { th: 'นัดแล้ว', en: 'Scheduled' }, done: { th: 'เสร็จแล้ว', en: 'Done' } }[status];
  }

  protected scheduleValue(id: string): string { return this.schedules()[id] ?? ''; }
  protected noteValue(id: string): string { return this.notes()[id] ?? ''; }
  protected setSchedule(id: string, event: Event): void { this.schedules.update((values) => ({ ...values, [id]: (event.target as HTMLInputElement).value })); }
  protected setNote(id: string, event: Event): void { this.notes.update((values) => ({ ...values, [id]: (event.target as HTMLInputElement).value })); }

  protected async schedule(request: AdminTechnicianRequest): Promise<void> {
    const localDate = this.scheduleValue(request.id);
    const scheduledAt = new Date(localDate);
    if (!localDate || Number.isNaN(scheduledAt.getTime())) return;
    await this.update(request, { status: 'scheduled', scheduled_at: scheduledAt.toISOString(), note: this.noteValue(request.id).trim() });
  }

  protected async complete(request: AdminTechnicianRequest): Promise<void> {
    await this.update(request, { status: 'done', ...(this.noteValue(request.id).trim() ? { note: this.noteValue(request.id).trim() } : {}) });
  }

  private async update(request: AdminTechnicianRequest, input: { status: 'scheduled' | 'done'; scheduled_at?: string; note?: string }): Promise<void> {
    this.saving.set(request.id);
    try {
      await this.api.updateTechnicianRequest(request.id, input);
      await this.load();
      this.toast.show({ th: 'อัปเดตคำขอแล้ว และแจ้งเจ้าของบ้านแล้ว', en: 'Request updated and owner notified' });
    } catch { this.error.set(true); }
    finally { this.saving.set(null); }
  }
}
