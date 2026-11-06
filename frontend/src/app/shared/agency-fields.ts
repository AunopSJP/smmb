import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { I18n } from '../core/i18n';
import { MapPin, type LatLng } from './map-pin';

/**
 * ข้อมูลหน่วยงานที่ละเอียดขึ้น (✅ 2026-11-06) — ใช้ตอนสมัครหน่วยงาน (L01) และหน้าแก้ข้อมูลหน่วยงานของหัวหน้า (L10)
 * หมุดแสดงบนแผนที่ให้เจ้าของบ้านเห็นว่าหน่วยงานอยู่ตรงไหน (เฉพาะหน่วยงานที่แอดมินอนุมัติแล้ว)
 */
export interface AgencyDetailForm {
  subdistrict: string;
  district: string;
  province: string;
  postal_code: string;
  phone: string;
  email: string;
  contact_person: string;
  coverage_note: string;
  location: LatLng | null;
}

export const emptyAgencyDetail = (): AgencyDetailForm => ({
  subdistrict: '',
  district: '',
  province: '',
  postal_code: '',
  phone: '',
  email: '',
  contact_person: '',
  coverage_note: '',
  location: null,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** บังคับ จังหวัด + เขต/อำเภอ + เบอร์หน่วยงาน · รหัสไปรษณีย์/อีเมลถ้ากรอกต้องถูกรูปแบบ · หมุดแนะนำแต่ไม่บังคับ */
export function agencyDetailValid(f: AgencyDetailForm): boolean {
  if (!f.province.trim() || !f.district.trim() || f.phone.trim().length < 3) return false;
  if (f.postal_code.trim() && !/^[0-9]{5}$/.test(f.postal_code.trim())) return false;
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) return false;
  return true;
}

/** ฟิลด์ของ API (PATCH /agency · signup/agency) — แก้ไข: ช่องว่างส่ง '' เพื่อล้าง */
export function agencyDetailPayload(f: AgencyDetailForm, clearEmpty = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ['subdistrict', 'district', 'province', 'postal_code', 'phone', 'email', 'contact_person', 'coverage_note'] as const) {
    const v = f[k].trim();
    if (v) out[k] = v;
    else if (clearEmpty) out[k] = '';
  }
  if (f.location) {
    out['lat'] = f.location.lat;
    out['lng'] = f.location.lng;
  } else if (clearEmpty) {
    out['lat'] = null;
    out['lng'] = null;
  }
  return out;
}

@Component({
  selector: 'app-agency-fields',
  imports: [MapPin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-grid">
      <label class="field">
        <span>{{ i18n.t({ th: 'แขวง / ตำบล (ไม่บังคับ)', en: 'Subdistrict (optional)' }) }}</span>
        <input maxlength="100" [value]="value().subdistrict" (input)="set('subdistrict', $any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && !value().district.trim()">
        <span>{{ i18n.t({ th: 'เขต / อำเภอ', en: 'District' }) }}</span>
        <input maxlength="100" [value]="value().district" (input)="set('district', $any($event.target).value)" />
      </label>
    </div>
    <div class="form-grid">
      <label class="field" [class.invalid]="tried() && !value().province.trim()">
        <span>{{ i18n.t({ th: 'จังหวัด', en: 'Province' }) }}</span>
        <input maxlength="100" autocomplete="address-level1" [value]="value().province" (input)="set('province', $any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && !postalOk()">
        <span>{{ i18n.t({ th: 'รหัสไปรษณีย์', en: 'Postal code' }) }}</span>
        <input inputmode="numeric" maxlength="5" autocomplete="postal-code" [value]="value().postal_code" (input)="set('postal_code', $any($event.target).value.replace(/\\D/g, ''))" />
      </label>
    </div>
    <div class="form-grid">
      <label class="field" [class.invalid]="tried() && value().phone.trim().length < 3">
        <span>{{ i18n.t({ th: 'เบอร์โทรหน่วยงาน', en: 'Agency phone' }) }}</span>
        <input type="tel" inputmode="tel" maxlength="30" [value]="value().phone" (input)="set('phone', $any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && emailBad()">
        <span>{{ i18n.t({ th: 'อีเมลหน่วยงาน (ไม่บังคับ)', en: 'Agency email (optional)' }) }}</span>
        <input type="email" inputmode="email" maxlength="200" [value]="value().email" (input)="set('email', $any($event.target).value)" />
      </label>
    </div>
    <label class="field">
      <span>{{ i18n.t({ th: 'ผู้ประสานงาน (ไม่บังคับ)', en: 'Contact person (optional)' }) }}</span>
      <input maxlength="100" [value]="value().contact_person" (input)="set('contact_person', $any($event.target).value)" />
    </label>
    <label class="field">
      <span>{{ i18n.t({ th: 'พื้นที่ที่ดูแล (ไม่บังคับ)', en: 'Area you cover (optional)' }) }}</span>
      <input maxlength="300" [placeholder]="i18n.t({ th: 'เช่น หมู่ 1–5 ต.บางนา และหมู่บ้านสุขใจ', en: 'e.g. Moo 1–5 Bang Na and Sukjai Village' })" [value]="value().coverage_note" (input)="set('coverage_note', $any($event.target).value)" />
    </label>
    <div class="field">
      <span>{{ i18n.t({ th: 'ปักหมุดหน่วยงาน (แนะนำ)', en: 'Pin your agency (recommended)' }) }}</span>
      <small>{{ i18n.t({ th: 'เจ้าของบ้านจะเห็นหมุดนี้บนแผนที่ เพื่อเลือกว่าจะให้หน่วยงานไหนดูแลบ้านของตน (แสดงหลังแอดมินอนุมัติ)', en: 'Homeowners see this pin on a map to choose which agency should look after their house (shown after the admin approves)' }) }}</small>
      <app-map-pin [editable]="true" [value]="value().location" (valueChange)="set('location', $event)" />
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 14px;
    }
  `,
})
export class AgencyFields {
  protected readonly i18n = inject(I18n);
  readonly value = model.required<AgencyDetailForm>();
  readonly tried = input(false);
  protected readonly postalOk = computed(() => !this.value().postal_code.trim() || /^[0-9]{5}$/.test(this.value().postal_code.trim()));
  protected readonly emailBad = computed(() => !!this.value().email.trim() && !EMAIL_RE.test(this.value().email.trim()));

  protected set<K extends keyof AgencyDetailForm>(key: K, v: AgencyDetailForm[K]): void {
    this.value.update((p) => ({ ...p, [key]: v }));
  }
}
