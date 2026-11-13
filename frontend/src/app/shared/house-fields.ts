import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { I18n } from '../core/i18n';
import { normalizePhone } from '../core/mock/auth-demo';
import { MapPin, type LatLng } from './map-pin';
import { emptyExtras, extrasPayload, extrasValid, ProfileExtras, type ExtrasForm } from './profile-extras';

/** ข้อมูลบ้านที่ละเอียดขึ้น (api.md §2.1 · ✅ 2026-11-04) — ใช้ใน A06 สมัคร และ A15 เพิ่มบทบาทเจ้าของบ้าน */
export interface HouseProfileForm {
  address_line: string;
  subdistrict: string;
  district: string;
  province: string;
  location: LatLng | null;
  emergency_name: string;
  emergency_phone: string;
  /** รายละเอียดเพิ่ม (✅ 2026-11-06) */
  extras: ExtrasForm;
}

export const emptyHouseProfile = (): HouseProfileForm => ({
  address_line: '',
  subdistrict: '',
  district: '',
  province: '',
  location: null,
  emergency_name: '',
  emergency_phone: '',
  extras: emptyExtras(),
});

/** ผู้ติดต่อฉุกเฉินต้องกรอกครบคู่ หรือไม่กรอกเลย */
export const emergencyOk = (p: HouseProfileForm) => {
  const name = p.emergency_name.trim();
  const phone = p.emergency_phone.trim();
  return (!name && !phone) || (!!name && !!normalizePhone(phone));
};

/** ที่อยู่บังคับ (แขวง/ตำบล เขต/อำเภอ จังหวัด) · หมุดและผู้ติดต่อฉุกเฉินไม่บังคับ */
export function houseProfileValid(p: HouseProfileForm): boolean {
  return !!(p.address_line.trim() && p.subdistrict.trim() && p.district.trim() && p.province.trim()) && emergencyOk(p) && extrasValid(p.extras, 'owner');
}

/** ขั้น "ที่อยู่บ้าน" ของฟอร์มสมัคร: บ้านเลขที่ + ที่อยู่ + แขวง/เขต/จังหวัด + รหัสไปรษณีย์ (5 หลัก) */
export function addressStepValid(houseNo: string, p: HouseProfileForm): boolean {
  return !!(houseNo.trim() && p.address_line.trim() && p.subdistrict.trim() && p.district.trim() && p.province.trim() && /^[0-9]{5}$/.test(p.extras.postal_code.trim()));
}

/** ขั้น "รายละเอียดบ้าน": ประเภทบ้าน + จำนวนผู้อยู่ + ผู้ติดต่อฉุกเฉินครบคู่/ว่างคู่ + อีเมล (ถ้ากรอก) ถูกรูปแบบ */
export function detailsStepValid(p: HouseProfileForm): boolean {
  return emergencyOk(p) && extrasValid(p.extras, 'owner');
}

/** แปลงเป็นฟิลด์ของ API (ค่าว่าง = ไม่ส่ง) */
export function houseProfilePayload(p: HouseProfileForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ['address_line', 'subdistrict', 'district', 'province'] as const) if (p[k].trim()) out[k] = p[k].trim();
  if (p.location) {
    out['lat'] = p.location.lat;
    out['lng'] = p.location.lng;
  }
  const phone = normalizePhone(p.emergency_phone);
  if (p.emergency_name.trim() && phone) {
    out['emergency_name'] = p.emergency_name.trim();
    out['emergency_phone'] = phone;
  }
  const profile = extrasPayload(p.extras, 'owner');
  if (Object.keys(profile).length) out['profile'] = profile;
  return out;
}

@Component({
  selector: 'app-house-fields',
  imports: [MapPin, ProfileExtras],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="form-section">
      <h2 class="form-title">{{ i18n.t({ th: 'ที่อยู่และตำแหน่งบ้าน', en: 'Address and location' }) }}</h2>
    <label class="field" [class.invalid]="tried() && !value().address_line.trim()">
      <span>{{ i18n.t({ th: 'ที่อยู่ (ซอย / ถนน / หมู่)', en: 'Address (soi / road / moo)' }) }}</span>
      <input maxlength="200" autocomplete="address-line2" [placeholder]="i18n.t({ th: 'เช่น ซอยสุขใจ 3 ถนนพหลโยธิน', en: 'e.g. Soi Sukjai 3, Phahonyothin Rd' })" [value]="value().address_line" (input)="set('address_line', $any($event.target).value)" />
    </label>
    <div class="form-grid">
      <label class="field" [class.invalid]="tried() && !value().subdistrict.trim()">
        <span>{{ i18n.t({ th: 'แขวง / ตำบล', en: 'Subdistrict' }) }}</span>
        <input maxlength="100" [value]="value().subdistrict" (input)="set('subdistrict', $any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && !value().district.trim()">
        <span>{{ i18n.t({ th: 'เขต / อำเภอ', en: 'District' }) }}</span>
        <input maxlength="100" [value]="value().district" (input)="set('district', $any($event.target).value)" />
      </label>
    </div>
    <label class="field" [class.invalid]="tried() && !value().province.trim()">
      <span>{{ i18n.t({ th: 'จังหวัด', en: 'Province' }) }}</span>
      <input maxlength="100" autocomplete="address-level1" [value]="value().province" (input)="set('province', $any($event.target).value)" />
    </label>

    <div class="field">
      <span>{{ i18n.t({ th: 'ปักหมุดบ้าน (แนะนำ)', en: 'Pin your house (recommended)' }) }}</span>
      <small>{{ i18n.t({ th: 'เจ้าหน้าที่เห็นตำแหน่งนี้เฉพาะตอนคุณกด SOS เพื่อมาถึงบ้านได้เร็วขึ้น', en: 'Officers see this only during your SOS, so they can reach you faster' }) }}</small>
      <app-map-pin [editable]="true" [value]="value().location" (valueChange)="set('location', $event)" />
    </div>

    </section>

    <app-profile-extras kind="owner" [value]="value().extras" (valueChange)="set('extras', $event)" [tried]="tried()" />

    <section class="form-section" [class.invalid]="tried() && !emergencyValid()">
      <h2 class="form-title">{{ i18n.t({ th: 'ผู้ติดต่อฉุกเฉิน (ไม่บังคับ)', en: 'Emergency contact (optional)' }) }}</h2>
      <div class="form-grid">
        <label class="field">
          <span>{{ i18n.t({ th: 'ชื่อผู้ติดต่อ', en: 'Contact name' }) }}</span>
          <input maxlength="100" autocomplete="off" [value]="value().emergency_name" (input)="set('emergency_name', $any($event.target).value)" />
        </label>
        <label class="field">
          <span>{{ i18n.t({ th: 'เบอร์โทร', en: 'Phone' }) }}</span>
          <input type="tel" inputmode="tel" autocomplete="off" [value]="value().emergency_phone" (input)="set('emergency_phone', $any($event.target).value)" />
        </label>
      </div>
      <p class="form-hint">{{ i18n.t({ th: 'กรอกทั้งชื่อและเบอร์ หรือเว้นว่างทั้งคู่', en: 'Fill in both name and phone, or leave both empty' }) }}</p>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      gap: 14px;
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 0;
    }
    legend {
      padding: 0;
      margin-block-end: 6px;
      font-weight: 600;
    }
  `,
})
export class HouseFields {
  protected readonly i18n = inject(I18n);
  readonly value = model.required<HouseProfileForm>();
  /** กดส่งแล้ว — แสดงช่องที่ยังไม่ครบ */
  readonly tried = input(false);

  protected emergencyValid(): boolean {
    return emergencyOk(this.value());
  }

  protected set<K extends keyof HouseProfileForm>(key: K, v: HouseProfileForm[K]): void {
    this.value.update((p) => ({ ...p, [key]: v }));
  }
}
