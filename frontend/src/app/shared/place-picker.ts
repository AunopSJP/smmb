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

/** id ของ datalist ไม่ซ้ำเมื่อมีตัวเลือกพื้นที่มากกว่าหนึ่งชุดในหน้าเดียว */
let nextPlaceList = 0;

/** หาพื้นที่จากชื่อที่พิมพ์/เลือก (เทียบแบบไม่สนคำนำหน้าและช่องว่าง) */
function findByName<T extends { name: string }>(list: T[], text: string): T | undefined {
  const key = normPlace(text);
  return key ? list.find((x) => normPlace(x.name) === key) : undefined;
}

/**
 * ช่องเลือกพื้นที่ต่อเนื่อง จังหวัด → เขต/อำเภอ → แขวง/ตำบล
 * พิมพ์เพื่อค้นหาได้ (เช่น "ตา" → ตาก/ตรัง) หรือเลื่อนดูรายการจาก datalist ได้ด้วย
 * ใช้ร่วมกันทุกหน้า: สมัครเจ้าของบ้าน · ตั้งค่าบ้าน · สร้าง/แก้โซน · โปรไฟล์หน่วยงาน
 * ค่าที่เก็บเป็น "ชื่อมาตรฐาน" (ตรงกับที่เซิร์ฟเวอร์ตรวจ) · ที่อยู่เดิมที่พิมพ์เองและไม่ตรงตาราง → ขึ้นเตือนให้เลือกใหม่
 */
@Component({
  selector: 'app-place-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="field" [class.invalid]="tried() && !province()">
      <span>{{ i18n.t({ th: 'จังหวัด', en: 'Province' }) }}</span>
      <input
        type="text"
        autocomplete="off"
        [attr.list]="listId + '-province'"
        [placeholder]="i18n.t({ th: 'พิมพ์เพื่อค้นหา หรือเลือกจากรายการ', en: 'Type to search or pick from the list' })"
        [value]="province()"
        (change)="pickProvince($any($event.target).value)"
      />
      <datalist [id]="listId + '-province'">
        @for (p of provinces(); track p.id) {
          <option [value]="p.name"></option>
        }
      </datalist>
    </label>
    <div class="form-grid">
      <label class="field" [class.invalid]="tried() && !district()">
        <span>{{ i18n.t({ th: 'เขต / อำเภอ', en: 'District' }) }}</span>
        <input
          type="text"
          autocomplete="off"
          [disabled]="provinceId() === null"
          [attr.list]="listId + '-district'"
          [placeholder]="i18n.t({ th: 'พิมพ์เพื่อค้นหา หรือเลือกจากรายการ', en: 'Type to search or pick from the list' })"
          [value]="district()"
          (change)="pickDistrict($any($event.target).value)"
        />
        <datalist [id]="listId + '-district'">
          @for (d of districts(); track d.id) {
            <option [value]="d.name"></option>
          }
        </datalist>
      </label>
      <label class="field" [class.invalid]="tried() && subdistrictRequired() && !subdistrict()">
        <span>{{ subdistrictRequired() ? i18n.t({ th: 'แขวง / ตำบล', en: 'Subdistrict' }) : i18n.t({ th: 'แขวง / ตำบล (ไม่บังคับ)', en: 'Subdistrict (optional)' }) }}</span>
        <input
          type="text"
          autocomplete="off"
          [disabled]="districtId() === null"
          [attr.list]="listId + '-subdistrict'"
          [placeholder]="i18n.t({ th: 'พิมพ์เพื่อค้นหา หรือเลือกจากรายการ', en: 'Type to search or pick from the list' })"
          [value]="subdistrict()"
          (change)="pickSubdistrict($any($event.target).value)"
        />
        <datalist [id]="listId + '-subdistrict'">
          @for (s of subdistricts(); track s.id) {
            <option [value]="s.name"></option>
          }
        </datalist>
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

  protected readonly listId = `place-list-${++nextPlaceList}`;
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

  /** เลือกจังหวัดจากข้อความที่พิมพ์/เลือก — ไม่ตรงรายการ = ล้างค่า (ให้ขึ้นเตือนว่ายังไม่เลือก) */
  protected pickProvince(text: string): void {
    const p = findByName(this.provinces(), text);
    this.changed.emit({ province: p?.name ?? '', district: '', subdistrict: '', postal: '' });
  }

  protected pickDistrict(text: string): void {
    const d = findByName(this.districts(), text);
    this.changed.emit({ province: this.nameOfProvince(), district: d?.name ?? '', subdistrict: '', postal: '' });
  }

  protected pickSubdistrict(text: string): void {
    const s = findByName(this.subdistricts(), text);
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
