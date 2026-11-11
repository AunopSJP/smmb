import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { I18n, type Tr } from '../core/i18n';
import { Session } from '../core/session';
import { DisplaySettings } from '../core/display-settings';
import { screenUrl } from '../screens/registry';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';
import { PushStatus } from '../shared/push-status';

interface Option {
  type: string;
  label: Tr;
  hint: Tr;
}

/**
 * ตั้งค่าการแจ้งเตือน — หน้าเดียวใช้ได้ทุกบทบาท (ตามแคนวาส NotifSettings.dc.html)
 * ชนิดที่ปิดได้ต้องตรงกับ MUTABLE_NOTIFICATION_TYPES ของ backend · ที่เหลือเป็นความปลอดภัย ปิดไม่ได้
 */
@Component({
  selector: 'app-notif-settings',
  imports: [RouterLink, Icon, PageHeader, PushStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t(roleLabel())" [title]="i18n.t({ th: 'ตั้งค่าการแจ้งเตือน', en: 'Notification settings' })" [back]="back()" />

    <div class="stack grow">
      <app-push-status [required]="required()" [deviceLabel]="role()" />

      <section class="card stack easy-hide">
        <h2 class="head"><app-icon name="shield" [size]="20" />{{ i18n.t({ th: 'เครื่องที่เข้าสู่ระบบ', en: 'Signed-in devices' }) }}</h2>
        @for (d of devices(); track d.id) {
          <div class="device">
            <span class="grow">
              <strong>{{ d.label }}</strong>
              <span class="muted small block">{{ i18n.t({ th: 'เข้าเมื่อ ', en: 'First seen ' }) }}{{ day(d.first_seen_at) }} · {{ i18n.t({ th: 'ล่าสุด ', en: 'last ' }) }}{{ day(d.last_seen_at) }}</span>
            </span>
            @if (d.current) {
              <span class="chip ok">{{ i18n.t({ th: 'เครื่องนี้', en: 'This device' }) }}</span>
            }
          </div>
        } @empty {
          <p class="muted small">{{ i18n.t({ th: 'ยังไม่มีข้อมูลเครื่อง (เข้าสู่ระบบจากเบราว์เซอร์อื่นอีกครั้ง)', en: 'No device records yet (sign in from another browser to add one).' }) }}</p>
        }
      </section>

      @if (mutable().length) {
        <section class="card stack">
          <h2 class="head"><app-icon name="bell" [size]="20" />{{ i18n.t({ th: 'ชนิดที่อยากรับ', en: 'What to receive' }) }}</h2>
          @for (n of mutable(); track n.type) {
            <label class="toggle">
              <span>
                <strong>{{ i18n.t(n.label) }}</strong>
                <span class="muted small block easy-hide">{{ i18n.t(n.hint) }}</span>
              </span>
              <input
                type="checkbox"
                class="switch"
                role="switch"
                [checked]="!display.isMuted(n.type)"
                (change)="display.setMuted(n.type, !$any($event.target).checked)"
              />
            </label>
          }
        </section>
      }

      <section class="card stack always">
        <h2 class="head"><app-icon name="shield" [size]="20" />{{ i18n.t({ th: 'เกี่ยวกับความปลอดภัย', en: 'Safety alerts' }) }}</h2>
        <p>{{ i18n.t({ th: 'SOS · ตู้มีปัญหา/หลุด · QR ไม่ใช่ของระบบ · คำขอเข้าหน่วยงาน', en: 'SOS · mailbox problems/offline · non-system QR · agency join requests' }) }}</p>
        <span class="chip ok">{{ i18n.t({ th: 'เปิดเสมอ · ปิดไม่ได้', en: 'Always on · cannot disable' }) }}</span>
      </section>

      <p class="muted small">{{ i18n.t({ th: 'เปิดไม่ได้ หรือไม่เด้ง? กด "ตรวจแจ้งเตือน (ละเอียด)" ด้านบนเพื่อดูวิธีแก้ทีละขั้น', en: 'Can’t turn it on or nothing shows? Use “Check notifications (detailed)” above for step-by-step fixes.' }) }}</p>
      <a class="btn secondary push-end" [routerLink]="back()">{{ i18n.t({ th: 'กลับไปหน้าตั้งค่า', en: 'Back to settings' }) }}</a>
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 16px 16px calc(20px + env(safe-area-inset-bottom));
      max-inline-size: 720px;
      margin-inline: auto;
    }
    .grow { flex: 1; min-inline-size: 0; }
    .head { display: flex; align-items: center; gap: 8px; font-size: 1rem; }
    .block { display: block; }
    .toggle { display: flex; align-items: center; gap: 12px; padding-block: 8px; }
    .toggle > span { flex: 1; min-inline-size: 0; }
    .toggle + .toggle { border-block-start: 1px solid var(--line); }
    .device { display: flex; align-items: center; gap: 12px; padding-block: 8px; }
    .device + .device { border-block-start: 1px solid var(--line); }
    .always { border-color: var(--brand-text); }
    .ok { justify-self: start; }
    .push-end { margin-block-start: auto; }
  `,
})
export class NotifSettings {
  protected readonly i18n = inject(I18n);
  private readonly session = inject(Session);
  private readonly http = inject(HttpClient);
  protected readonly display = inject(DisplaySettings);
  protected readonly devices = signal<{ id: string; label: string; current: boolean; first_seen_at: string; last_seen_at: string }[]>([]);

  constructor() {
    void firstValueFrom(this.http.get<{ data: { id: string; label: string; current: boolean; first_seen_at: string; last_seen_at: string }[] }>('/api/v1/me/devices'))
      .then((r) => this.devices.set(r.data))
      .catch(() => undefined);
  }

  protected day(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
  }

  protected readonly role = computed<'owner' | 'officer' | 'head' | 'admin'>(() => {
    const roles = this.session.me()?.roles ?? [];
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('head')) return 'head';
    if (roles.includes('officer')) return 'officer';
    return 'owner';
  });

  protected readonly roleLabel = computed<Tr>(() => {
    switch (this.role()) {
      case 'admin':
        return { th: 'ผู้ดูแลระบบ', en: 'Administrator' };
      case 'head':
        return { th: 'หัวหน้าหน่วยงาน', en: 'Agency head' };
      case 'officer':
        return { th: 'เจ้าหน้าที่', en: 'Officer' };
      default:
        return { th: 'เจ้าของบ้าน', en: 'Homeowner' };
    }
  });

  protected readonly required = computed(() => this.role() === 'officer' || this.role() === 'head');
  protected readonly back = computed(() => screenUrl(this.role() === 'admin' ? 'D16' : this.role() === 'head' ? 'L11' : this.role() === 'officer' ? 'O13' : 'H13'));

  private readonly all: Option[] = [
    { type: 'inspected', label: { th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer inspection' }, hint: { th: 'ทุกครั้งที่ตรวจผ่านหน้าตู้', en: 'Each time the mailbox is checked' } },
    { type: 'delivered', label: { th: 'มีของมาส่ง', en: 'Parcel delivered' }, hint: { th: 'เมื่อไรเดอร์แจ้งส่งของที่ตู้', en: 'When a rider reports a drop-off' } },
    { type: 'low_battery', label: { th: 'แบตเตอรี่ตู้ใกล้หมด', en: 'Low mailbox battery' }, hint: { th: 'เตือนก่อนตู้ดับ', en: 'Warning before the box goes dark' } },
    { type: 'sos_taken', label: { th: 'มีเจ้าหน้าที่รับ SOS แล้ว', en: 'SOS taken by another officer' }, hint: { th: 'แจ้งเมื่อเพื่อนร่วมโซนรับเรื่องไปแล้ว', en: 'When a teammate has taken the case' } },
    { type: 'qr_health', label: { th: 'สุขภาพ QR รายวัน', en: 'Daily QR health' }, hint: { th: 'สรุป QR ที่ต้องดูแล', en: 'Summary of QR issues' } },
    { type: 'technician_scheduled', label: { th: 'นัดช่างแล้ว', en: 'Technician scheduled' }, hint: { th: 'วันเวลาที่ช่างจะมา', en: 'When the technician will visit' } },
    { type: 'technician_done', label: { th: 'ช่างทำงานเสร็จ', en: 'Technician finished' }, hint: { th: 'ผลการซ่อมหรือติดตั้ง', en: 'Repair or install result' } },
    { type: 'plan_expiring', label: { th: 'แพ็กเกจใกล้หมดอายุ', en: 'Plan expiring' }, hint: { th: 'เตือนก่อนหมด 7 วัน', en: '7 days before it ends' } },
    { type: 'box_service_opened', label: { th: 'ตู้เปิดให้บริการอีกครั้ง', en: 'Mailbox service resumed' }, hint: { th: 'หลังหยุดให้บริการชั่วคราว', en: 'After a temporary pause' } },
    { type: 'box_service_closed', label: { th: 'ตู้หยุดให้บริการ', en: 'Mailbox service paused' }, hint: { th: 'เมื่อผู้ดูแลระบบปิดตู้ชั่วคราว', en: 'When an admin pauses the box' } },
  ];

  protected readonly mutable = computed<Option[]>(() => {
    const types = new Set(
      this.role() === 'owner'
        ? ['inspected', 'delivered', 'low_battery', 'technician_scheduled', 'technician_done', 'plan_expiring', 'box_service_opened', 'box_service_closed']
        : this.role() === 'officer'
          ? ['sos_taken']
          : this.role() === 'head'
            ? ['sos_taken', 'qr_health', 'technician_scheduled', 'technician_done']
            : ['qr_health', 'technician_scheduled', 'technician_done', 'plan_expiring', 'box_service_opened', 'box_service_closed'],
    );
    return this.all.filter((o) => types.has(o.type));
  });
}
