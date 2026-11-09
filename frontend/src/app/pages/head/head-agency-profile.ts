import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HeadApi, showGroupCode } from '../../core/head-api';
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
      <!-- รหัสกลุ่ม (ตามแคนวาส HeadProfile ทุกโหมด) -->
      <section class="card group">
        <span class="muted small">{{ i18n.t({ th: 'รหัสกลุ่ม (ให้เจ้าหน้าที่ใช้ขอเข้า)', en: 'Group code (your team uses it to join)' }) }}</span>
        <p class="code mono">{{ code() || '—' }}</p>
        <div class="two">
          <button type="button" class="btn secondary" (click)="copy()">{{ i18n.t({ th: 'คัดลอก', en: 'Copy' }) }}</button>
          <button type="button" class="btn secondary" [disabled]="busyCode()" (click)="rotate()">{{ i18n.t({ th: 'สร้างรหัสใหม่', en: 'New code' }) }}</button>
        </div>
        <p class="muted small easy-hide">{{ i18n.t({ th: 'สร้างรหัสใหม่แล้วรหัสเก่าใช้ไม่ได้ทันที · สมาชิกเดิมไม่กระทบ', en: 'A new code immediately stops the old one · existing members are unaffected' }) }}</p>
      </section>
      <p class="muted small mono adv-only meta">
        {{ api.agency()?.id }} · {{ api.agency()?.status }} · {{ i18n.t({ th: 'หัวหน้า ', en: 'heads ' }) }}{{ api.agency()?.heads?.length ?? 0 }}
        @if (api.agency()?.profile?.lat != null && api.agency()?.profile?.lng != null) {
          · lat {{ api.agency()?.profile?.lat }} lng {{ api.agency()?.profile?.lng }}
        } @else {
          · {{ i18n.t({ th: 'ยังไม่ปักหมุด', en: 'no pin' }) }}
        }
      </p>
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
  styles: `
    .group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      text-align: center;
    }
    .code {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--brand);
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .meta {
      margin: 0 2px;
      overflow-wrap: anywhere;
    }
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
  protected readonly busyCode = signal(false);
  protected readonly code = computed(() => showGroupCode(this.api.agency()?.group_code ?? null));

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

  protected copy(): void {
    void navigator.clipboard?.writeText(this.code()).catch(() => undefined);
    this.toast.show({ th: 'คัดลอกรหัสกลุ่มแล้ว', en: 'Group code copied' });
  }

  /** POST /agency/group-code/rotate — รหัสเก่าใช้ไม่ได้ทันที */
  protected async rotate(): Promise<void> {
    if (this.busyCode()) return;
    if (!confirm(this.i18n.t({ th: 'สร้างรหัสกลุ่มใหม่? รหัสเดิมจะใช้ไม่ได้ทันที', en: 'Create a new group code? The old one stops working immediately.' }))) return;
    this.busyCode.set(true);
    try {
      await this.api.rotateCode();
      await this.api.loadAgency();
      this.toast.show({ th: 'สร้างรหัสกลุ่มใหม่แล้ว', en: 'New group code created' });
    } catch {
      this.toast.show({ th: 'สร้างรหัสไม่สำเร็จ ลองอีกครั้ง', en: 'Could not create a new code' });
    } finally {
      this.busyCode.set(false);
    }
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
