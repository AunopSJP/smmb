import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n } from '../core/i18n';
import { normPlace, PlaceApi, type PlaceDistrict, type PlaceProvince, type PlaceSubdistrict } from '../core/place-api';

/** สิ่งที่ส่งกลับเมื่อเลือกพื้นที่ — ชื่อมาตรฐานจากตารางกลาง (ชั้นที่ถูกล้างเพราะเปลี่ยนชั้นบนเป็น '') */
export interface PlaceChange {
  province: string;
  district: string;
  subdistrict: string;
  /** รหัสไปรษณีย์ของแขวง/ตำบลที่เลือก ('' = ยังไม่เลือกหรือไม่มีข้อมูล) */
  postal: string;
}

/**
 * Dropdown เลือกพื้นที่ต่อเนื่อง จังหวัด → เขต/อำเภอ → แขวง/ตำบล (ไม่ต้องพิมพ์เอง)
 * ใช้ร่วมกันทุกหน้า: สมัครเจ้าของบ้าน · ตั้งค่าบ้าน · สร้าง/แก้โซน · โปรไฟล์หน่วยงาน
 * ค่าที่เก็บเป็น "ชื่อมาตรฐาน" (ตรงกับที่เซิร์ฟเวอร์ตรวจ) · ที่อยู่เดิมที่พิมพ์เองและไม่ตรงตาราง → ขึ้นเตือนให้เลือกใหม่
 */
@Component({
  selector: 'app-place-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="field" [class.invalid]="tried() && !province()">
      <span>{{ i18n.t({ th: 'จังหวัด', en: 'Province' }) }}</span>
      <select [value]="provinceId() ?? ''" (change)="pickProvince($any($event.target).value)" autocomplete="address-level1">
        <option value="">{{ i18n.t({ th: 'เลือกจังหวัด', en: 'Select province' }) }}</option>
        @for (p of provinces(); track p.id) {
          <option [value]="p.id" [selected]="p.id === provinceId()">{{ p.name }}</option>
        }
      </select>
    </label>
    <div class="form-grid">
      <label class="field" [class.invalid]="tried() && !district()">
        <span>{{ i18n.t({ th: 'เขต / อำเภอ', en: 'District' }) }}</span>
        <select [disabled]="provinceId() === null" [value]="districtId() ?? ''" (change)="pickDistrict($any($event.target).value)">
          <option value="">{{ i18n.t({ th: 'เลือกเขต / อำเภอ', en: 'Select district' }) }}</option>
          @for (d of districts(); track d.id) {
            <option [value]="d.id" [selected]="d.id === districtId()">{{ d.name }}</option>
          }
        </select>
      </label>
      <label class="field" [class.invalid]="tried() && subdistrictRequired() && !subdistrict()">
        <span>{{ subdistrictRequired() ? i18n.t({ th: 'แขวง / ตำบล', en: 'Subdistrict' }) : i18n.t({ th: 'แขวง / ตำบล (ไม่บังคับ)', en: 'Subdistrict (optional)' }) }}</span>
        <select [disabled]="districtId() === null" [value]="subdistrictId() ?? ''" (change)="pickSubdistrict($any($event.target).value)">
          <option value="">{{ i18n.t({ th: 'เลือกแขวง / ตำบล', en: 'Select subdistrict' }) }}</option>
          @for (s of subdistricts(); track s.id) {
            <option [value]="s.id" [selected]="s.id === subdistrictId()">{{ s.name }}</option>
          }
        </select>
      </label>
    </div>
    @if (legacy()) {
      <p class="form-hint place-warn" role="alert">
        {{ i18n.t({ th: 'ที่อยู่เดิมไม่ตรงกับรายชื่อมาตรฐาน กรุณาเลือกจังหวัด เขต/อำเภอ แขวง/ตำบล ใหม่จากรายการ', en: 'Your saved address does not match the standard list. Please choose province, district and subdistrict again.' }) }}
      </p>
    }
    @if (loadFailed()) {
      <p class="form-hint place-warn" role="alert">{{ i18n.t({ th: 'โหลดรายชื่อพื้นที่ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่', en: 'Could not load the place list. Check your connection and try again.' }) }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 14px;
    }
    .place-warn {
      color: var(--warn, var(--text-muted));
    }
  `,
})
export class PlacePicker {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(PlaceApi);

  /** ค่าปัจจุบัน (ชื่อ) จากฟอร์มแม่ */
  readonly province = input('');
  readonly district = input('');
  readonly subdistrict = input('');
  /** false = แขวง/ตำบลไม่บังคับ (เช่น พื้นที่โซน/หน่วยงาน) */
  readonly subdistrictRequired = input(true);
  /** กดส่งแล้ว — ไฮไลต์ช่องที่ยังไม่เลือก */
  readonly tried = input(false);
  readonly changed = output<PlaceChange>();

  protected readonly provinces = signal<PlaceProvince[]>([]);
  protected readonly districts = signal<PlaceDistrict[]>([]);
  protected readonly subdistricts = signal<PlaceSubdistrict[]>([]);
  protected readonly loadFailed = signal(false);

  protected readonly provinceId = computed(() => this.provinces().find((p) => normPlace(p.name) === normPlace(this.province()))?.id ?? null);
  protected readonly districtId = computed(() => this.districts().find((d) => normPlace(d.name) === normPlace(this.district()))?.id ?? null);
  protected readonly subdistrictId = computed(() => this.subdistricts().find((s) => normPlace(s.name) === normPlace(this.subdistrict()))?.id ?? null);

  /** มีค่าที่พิมพ์ไว้เดิมแต่จับคู่กับตารางกลางไม่ได้ (รอรายการโหลดเสร็จก่อนค่อยเตือน) */
  protected readonly legacy = computed(() => {
    if (!this.provinces().length) return false;
    if (this.province() && this.provinceId() === null) return true;
    if (this.district() && this.provinceId() !== null && this.districts().length && this.districtId() === null) return true;
    if (this.subdistrict() && this.districtId() !== null && this.subdistricts().length && this.subdistrictId() === null) return true;
    return false;
  });

  constructor() {
    this.api.provinces().then((l) => this.provinces.set(l), () => this.loadFailed.set(true));
    // จังหวัดเปลี่ยน → โหลดเขต/อำเภอของจังหวัดนั้น
    effect(() => {
      const id = this.provinceId();
      untracked(() => {
        this.districts.set([]);
        if (id !== null) this.api.districts(id).then((l) => this.districts.set(l), () => this.loadFailed.set(true));
      });
    });
    // เขต/อำเภอเปลี่ยน → โหลดแขวง/ตำบล
    effect(() => {
      const id = this.districtId();
      untracked(() => {
        this.subdistricts.set([]);
        if (id !== null) this.api.subdistricts(id).then((l) => this.subdistricts.set(l), () => this.loadFailed.set(true));
      });
    });
  }

  protected pickProvince(v: string): void {
    const p = this.provinces().find((x) => String(x.id) === v);
    this.changed.emit({ province: p?.name ?? '', district: '', subdistrict: '', postal: '' });
  }

  protected pickDistrict(v: string): void {
    const d = this.districts().find((x) => String(x.id) === v);
    this.changed.emit({ province: this.nameOfProvince(), district: d?.name ?? '', subdistrict: '', postal: '' });
  }

  protected pickSubdistrict(v: string): void {
    const s = this.subdistricts().find((x) => String(x.id) === v);
    this.changed.emit({ province: this.nameOfProvince(), district: this.nameOfDistrict(), subdistrict: s?.name ?? '', postal: s?.zip ?? '' });
  }

  /** ใช้ชื่อมาตรฐานจากรายการ (ไม่ใช่ข้อความเดิมที่อาจมีคำนำหน้า) */
  private nameOfProvince(): string {
    return this.provinces().find((p) => p.id === this.provinceId())?.name ?? '';
  }
  private nameOfDistrict(): string {
    return this.districts().find((d) => d.id === this.districtId())?.name ?? '';
  }
}
