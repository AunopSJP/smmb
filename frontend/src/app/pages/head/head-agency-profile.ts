import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HeadApi } from '../../core/head-api';
import { I18n } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { AgencyFields, agencyDetailPayload, agencyDetailValid, emptyAgencyDetail, type AgencyDetailForm } from '../../shared/agency-fields';
import { PageHeader } from '../../shared/page-header';

/**
 * L10 · ข้อมูลหน่วยงาน (✅ 2026-11-06) — หัวหน้าแก้ที่อยู่ ช่องทางติดต่อ และปักหมุดหน่วยงาน
 * หมุดแสดงบนแผนที่ให้เจ้าของบ้านเห็น (เฉพาะหน่วยงานที่แอดมินอนุมัติแล้ว)
 */
@Component({
  selector: 'app-head-agency-profile',
  imports: [PageHeader, AgencyFields],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="api.agency()?.name ?? ''" [title]="i18n.t({ th: 'ข้อมูลหน่วยงาน', en: 'Agency details' })" [back]="url('L04')" />
    <div class="stack grow">
      <label class="field" [class.invalid]="tried() && contact().trim().length < 3">
        <span>{{ i18n.t({ th: 'ช่องทางติดต่อ (แสดงให้คนที่ขอเข้าหน่วยงานเห็น)', en: 'Contact (shown to people asking to join)' }) }}</span>
        <input maxlength="200" [value]="contact()" (input)="contact.set($any($event.target).value)" />
      </label>
      <label class="field">
        <span>{{ i18n.t({ th: 'ที่ตั้งหน่วยงาน', en: 'Agency address' }) }}</span>
        <input maxlength="300" autocomplete="street-address" [value]="address()" (input)="address.set($any($event.target).value)" />
      </label>
      <app-agency-fields [(value)]="detail" [tried]="tried()" />
      @if (api.agency()?.status !== 'approved') {
        <p class="muted small">{{ i18n.t({ th: 'หมุดจะขึ้นบนแผนที่ของเจ้าของบ้านหลังแอดมินอนุมัติหน่วยงาน', en: 'The pin appears on the owners’ map after the admin approves your agency' }) }}</p>
      }
      <button type="button" class="btn push-end" [disabled]="busy()" (click)="save()">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
    </div>
  `,
})
export class HeadAgencyProfile {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(HeadApi);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly contact = signal('');
  protected readonly address = signal('');
  protected readonly detail = signal<AgencyDetailForm>(emptyAgencyDetail());
  protected readonly tried = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    void this.api
      .loadAgency()
      .then((a) => {
        const p = a.profile;
        this.contact.set(a.contact ?? '');
        this.address.set(p?.address ?? '');
        this.detail.set({
          subdistrict: p?.subdistrict ?? '',
          district: p?.district ?? '',
          province: p?.province ?? '',
          postal_code: p?.postal_code ?? '',
          phone: p?.phone ?? '',
          email: p?.email ?? '',
          contact_person: p?.contact_person ?? '',
          coverage_note: p?.coverage_note ?? '',
          location: p?.lat != null && p?.lng != null ? { lat: p.lat, lng: p.lng } : null,
        });
      })
      .catch(() => undefined);
  }

  /** PATCH /agency — ช่องว่างส่ง '' เพื่อล้าง */
  protected async save(): Promise<void> {
    this.tried.set(true);
    if (this.busy()) return;
    if (this.contact().trim().length < 3 || !agencyDetailValid(this.detail())) {
      this.toast.show({ th: 'กรอกช่องทางติดต่อ จังหวัด เขต/อำเภอ และเบอร์โทรให้ครบ', en: 'Fill in contact, province, district and phone' });
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.patch('/api/v1/agency', { contact: this.contact().trim(), address: this.address().trim(), ...agencyDetailPayload(this.detail(), true) }));
      await this.api.loadAgency();
      this.toast.show({ th: 'บันทึกแล้ว', en: 'Saved' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save' });
    } finally {
      this.busy.set(false);
    }
  }
}
