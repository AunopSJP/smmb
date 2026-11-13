import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { I18n } from '../core/i18n';
import { emergencyOk, type HouseProfileForm } from './house-fields';
import { MapPin } from './map-pin';
import { CARE as CARE_OPTIONS, HOUSE_TYPES as HOUSE_TYPE_OPTIONS, houseTypeLabel, ProfileExtras, type ExtrasForm } from './profile-extras';

/**
 * ฟอร์มสมัครเจ้าของบ้าน แบ่งเป็นขั้นเล็ก ๆ (ใช้ใน A06) — ข้อมูลและกติกาตรวจเหมือนเดิมทุกอย่าง (`HouseProfileForm`)
 * แต่ละขั้นมีช่องที่ต้องกรอกไม่เกิน ~6 ช่อง · ของที่ไม่บังคับพับไว้ใน "เพิ่มภายหลังก็ได้"
 *   ขั้น 2 ที่อยู่บ้าน  → `SignupAddressStep`
 *   ขั้น 3 รายละเอียดบ้าน → `SignupDetailsStep`
 */

// ── ขั้น 2 · ที่อยู่บ้าน ───────────────────────────────────────────────

@Component({
  selector: 'app-signup-address-step',
  imports: [MapPin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="form-section">
      <h2 class="form-title">{{ i18n.t({ th: 'บ้านของคุณอยู่ที่ไหน', en: 'Where is your house?' }) }}</h2>
      <p class="form-hint">{{ i18n.t({ th: 'เจ้าหน้าที่ใช้ที่อยู่นี้มาหาคุณตอนกด SOS — เห็นเฉพาะตอนนั้นเท่านั้น', en: 'Officers use this to reach you during an SOS — only visible then' }) }}</p>
      <label class="field" [class.invalid]="tried() && !houseNo().trim()">
        <span>{{ i18n.t({ th: 'บ้านเลขที่', en: 'House number' }) }}</span>
        <input autocomplete="address-line1" [value]="houseNo()" (input)="houseNo.set($any($event.target).value)" />
      </label>
      <label class="field" [class.invalid]="tried() && !house().address_line.trim()">
        <span>{{ i18n.t({ th: 'ที่อยู่ (ซอย / ถนน / หมู่)', en: 'Address (soi / road / moo)' }) }}</span>
        <input maxlength="200" autocomplete="address-line2" [placeholder]="i18n.t({ th: 'เช่น ซอยสุขใจ 3 ถนนพหลโยธิน', en: 'e.g. Soi Sukjai 3, Phahonyothin Rd' })" [value]="house().address_line" (input)="set('address_line', $any($event.target).value)" />
      </label>
      <div class="form-grid">
        <label class="field" [class.invalid]="tried() && !house().subdistrict.trim()">
          <span>{{ i18n.t({ th: 'แขวง / ตำบล', en: 'Subdistrict' }) }}</span>
          <input maxlength="100" [value]="house().subdistrict" (input)="set('subdistrict', $any($event.target).value)" />
        </label>
        <label class="field" [class.invalid]="tried() && !house().district.trim()">
          <span>{{ i18n.t({ th: 'เขต / อำเภอ', en: 'District' }) }}</span>
          <input maxlength="100" [value]="house().district" (input)="set('district', $any($event.target).value)" />
        </label>
      </div>
      <div class="form-grid">
        <label class="field" [class.invalid]="tried() && !house().province.trim()">
          <span>{{ i18n.t({ th: 'จังหวัด', en: 'Province' }) }}</span>
          <input maxlength="100" autocomplete="address-level1" [value]="house().province" (input)="set('province', $any($event.target).value)" />
        </label>
        <label class="field" [class.invalid]="tried() && !postalOk()">
          <span>{{ i18n.t({ th: 'รหัสไปรษณีย์', en: 'Postal code' }) }}</span>
          <input inputmode="numeric" maxlength="5" autocomplete="postal-code" [value]="house().extras.postal_code" (input)="setExtra('postal_code', $any($event.target).value.replace(NON_DIGIT, ''))" />
        </label>
      </div>
    </section>

    <section class="form-section">
      <h2 class="form-title">
        {{ i18n.t({ th: 'ปักหมุดบ้านบนแผนที่', en: 'Pin your house on the map' }) }}
        <span class="opt-tag">{{ i18n.t({ th: 'แนะนำ · ไม่บังคับ', en: 'recommended · optional' }) }}</span>
      </h2>
      <p class="form-hint">{{ i18n.t({ th: 'ช่วยให้เจ้าหน้าที่มาถึงเร็วขึ้น เห็นเฉพาะตอนคุณกด SOS · ข้ามไปก่อนแล้วปักทีหลังในหน้าตั้งค่าได้', en: 'Helps officers arrive faster, visible only during an SOS · skip now and pin it later in Settings' }) }}</p>
      @if (mapOpen() || house().location) {
        <app-map-pin [editable]="true" [value]="house().location" (valueChange)="set('location', $event)" />
      } @else {
        <button type="button" class="btn secondary" (click)="mapOpen.set(true)">{{ i18n.t({ th: 'เปิดแผนที่เพื่อปักหมุด', en: 'Open the map to pin' }) }}</button>
      }
    </section>
  `,
  styleUrl: './signup-owner-steps.scss',
})
export class SignupAddressStep {
  protected readonly i18n = inject(I18n);
  protected readonly NON_DIGIT = /\D/g;
  readonly houseNo = model.required<string>();
  readonly house = model.required<HouseProfileForm>();
  /** กดถัดไปแล้ว — แสดงช่องที่ยังไม่ครบ */
  readonly tried = input(false);
  /** โหลดแผนที่ (Leaflet) เมื่อผู้ใช้ขอเท่านั้น — ขั้นนี้เบาลงสำหรับคนที่ข้ามหมุด */
  protected readonly mapOpen = signal(false);
  protected readonly postalOk = computed(() => /^[0-9]{5}$/.test(this.house().extras.postal_code.trim()));

  protected set<K extends keyof HouseProfileForm>(key: K, v: HouseProfileForm[K]): void {
    this.house.update((p) => ({ ...p, [key]: v }));
  }
  protected setExtra<K extends keyof ExtrasForm>(key: K, v: ExtrasForm[K]): void {
    this.house.update((p) => ({ ...p, extras: { ...p.extras, [key]: v } }));
  }
}

// ── ขั้น 3 · รายละเอียดบ้าน ────────────────────────────────────────────

@Component({
  selector: 'app-signup-details-step',
  imports: [ProfileExtras],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="form-section">
      <h2 class="form-title">{{ i18n.t({ th: 'เกี่ยวกับบ้านของคุณ', en: 'About your house' }) }}</h2>
      <fieldset class="field" [class.invalid]="tried() && !house().extras.house_type">
        <legend>{{ i18n.t({ th: 'ประเภทบ้าน', en: 'House type' }) }}</legend>
        <div class="chips">
          @for (t of houseTypes; track t.value) {
            <label class="chip-toggle">
              <input type="radio" name="house_type" [value]="t.value" [checked]="house().extras.house_type === t.value" (change)="setExtra('house_type', t.value)" />{{ i18n.t(t.label) }}
            </label>
          }
        </div>
      </fieldset>
      <div class="field" [class.invalid]="tried() && !residentsOk()">
        <label for="signup-residents">{{ i18n.t({ th: 'จำนวนผู้อยู่อาศัย (คน)', en: 'People living here' }) }}</label>
        <div class="stepper">
          <button type="button" class="step-btn" [attr.aria-label]="i18n.t({ th: 'ลดจำนวนผู้อยู่อาศัย', en: 'Fewer people' })" [disabled]="residents() <= 1" (click)="bump(-1)">−</button>
          <input id="signup-residents" type="number" inputmode="numeric" min="1" max="99" placeholder="—" [value]="house().extras.residents" (input)="setExtra('residents', $any($event.target).value)" />
          <button type="button" class="step-btn" [attr.aria-label]="i18n.t({ th: 'เพิ่มจำนวนผู้อยู่อาศัย', en: 'More people' })" [disabled]="residents() >= 99" (click)="bump(1)">+</button>
        </div>
      </div>
      <label class="field">
        <span>{{ i18n.t({ th: 'หมู่บ้าน / โครงการ / อาคาร (ถ้ามี)', en: 'Village / project / building (if any)' }) }}</span>
        <input maxlength="100" autocomplete="address-level3" [placeholder]="i18n.t({ th: 'เช่น หมู่บ้านสุขใจ', en: 'e.g. Sukjai Village' })" [value]="area()" (input)="setArea($any($event.target).value)" />
        <small>{{ i18n.t({ th: 'ช่วยให้เจ้าหน้าที่แยกบ้านเลขที่ซ้ำกันคนละหมู่บ้าน', en: 'Helps officers tell apart identical house numbers in different villages' }) }}</small>
      </label>
    </section>

    <section class="form-section">
      <h2 class="form-title">
        {{ i18n.t({ th: 'เพิ่มภายหลังก็ได้', en: 'You can add these later' }) }}
        <span class="opt-tag">{{ i18n.t({ th: 'ไม่บังคับ', en: 'optional' }) }}</span>
      </h2>

      <details class="opt form-section" [open]="careOpen() || hasCare()" (toggle)="careOpen.set($any($event.target).open)">
        <summary class="form-title">
          <span>{{ i18n.t({ th: 'ผู้ที่ต้องดูแลพิเศษ และจุดสังเกต', en: 'People needing extra care, and landmark' }) }}</span>
          @if (hasCare()) { <span class="done" aria-hidden="true">✓</span> }
        </summary>
        <div class="opt-body">
          <fieldset class="field">
            <legend>{{ i18n.t({ th: 'มีใครที่ต้องดูแลเป็นพิเศษไหม', en: 'Anyone who needs extra care?' }) }}</legend>
            <small>{{ i18n.t({ th: 'เจ้าหน้าที่เห็นเฉพาะตอนคุณกด SOS เพื่อเตรียมตัวก่อนไปถึง', en: 'Officers only see this during an SOS, to prepare before arriving' }) }}</small>
            <div class="chips">
              @for (c of careOptions; track c.value) {
                <label class="chip-toggle"><input type="checkbox" [checked]="house().extras.care.includes(c.value)" (change)="toggleCare(c.value, $any($event.target).checked)" />{{ i18n.t(c.label) }}</label>
              }
            </div>
          </fieldset>
          <label class="field">
            <span>{{ i18n.t({ th: 'จุดสังเกต / วิธีเข้าบ้าน', en: 'Landmark / how to find the house' }) }}</span>
            <input maxlength="200" [placeholder]="i18n.t({ th: 'เช่น ตรงข้ามร้านสะดวกซื้อ ประตูสีฟ้า', en: 'e.g. opposite the convenience store, blue gate' })" [value]="house().extras.landmark" (input)="setExtra('landmark', $any($event.target).value)" />
          </label>
        </div>
      </details>

      <details class="opt form-section" [class.invalid]="tried() && !emergencyValid()" [open]="emergencyOpen() || hasEmergency() || (tried() && !emergencyValid())" (toggle)="emergencyOpen.set($any($event.target).open)">
        <summary class="form-title">
          <span>{{ i18n.t({ th: 'ผู้ติดต่อฉุกเฉิน', en: 'Emergency contact' }) }}</span>
          @if (hasEmergency() && emergencyValid()) { <span class="done" aria-hidden="true">✓</span> }
        </summary>
        <div class="opt-body">
          <div class="form-grid">
            <label class="field">
              <span>{{ i18n.t({ th: 'ชื่อผู้ติดต่อ', en: 'Contact name' }) }}</span>
              <input maxlength="100" autocomplete="off" [value]="house().emergency_name" (input)="set('emergency_name', $any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'เบอร์โทร', en: 'Phone' }) }}</span>
              <input type="tel" inputmode="tel" autocomplete="off" [value]="house().emergency_phone" (input)="set('emergency_phone', $any($event.target).value)" />
            </label>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>{{ i18n.t({ th: 'เป็นใครของคุณ (เช่น ลูก)', en: 'Relation to you (e.g. child)' }) }}</span>
              <input maxlength="60" [value]="house().extras.emergency_relation" (input)="setExtra('emergency_relation', $any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'ช่วงเวลาที่ติดต่อได้', en: 'Best time to reach' }) }}</span>
              <input maxlength="100" [placeholder]="i18n.t({ th: 'เช่น หลัง 18:00', en: 'e.g. after 6 pm' })" [value]="house().extras.contact_time" (input)="setExtra('contact_time', $any($event.target).value)" />
            </label>
          </div>
          <p class="form-hint" [class.err]="tried() && !emergencyValid()">{{ i18n.t({ th: 'กรอกทั้งชื่อและเบอร์ หรือเว้นว่างทั้งคู่', en: 'Fill in both name and phone, or leave both empty' }) }}</p>
        </div>
      </details>

      <app-profile-extras kind="owner" part="personal" [value]="house().extras" (valueChange)="set('extras', $event)" [tried]="tried()" />
    </section>
  `,
  styleUrl: './signup-owner-steps.scss',
})
export class SignupDetailsStep {
  protected readonly i18n = inject(I18n);
  protected readonly houseTypes = HOUSE_TYPE_OPTIONS;
  protected readonly careOptions = CARE_OPTIONS;
  readonly house = model.required<HouseProfileForm>();
  /** หมู่บ้าน/ย่าน — ค่าเดียวกับ `area` ที่ส่งให้ API และ `profile.village` (เดิมถามสองช่องซ้ำกัน) */
  readonly area = model.required<string>();
  readonly tried = input(false);
  protected readonly careOpen = signal(false);
  protected readonly emergencyOpen = signal(false);
  protected readonly residents = computed(() => Number(this.house().extras.residents) || 0);
  protected readonly residentsOk = computed(() => {
    const n = Number(this.house().extras.residents);
    return Number.isInteger(n) && n >= 1 && n <= 99;
  });
  protected readonly hasCare = computed(() => this.house().extras.care.length > 0 || !!this.house().extras.landmark.trim());
  protected readonly hasEmergency = computed(() => {
    const h = this.house();
    return !!(h.emergency_name.trim() || h.emergency_phone.trim() || h.extras.emergency_relation.trim() || h.extras.contact_time.trim());
  });
  protected readonly emergencyValid = computed(() => emergencyOk(this.house()));

  protected set<K extends keyof HouseProfileForm>(key: K, v: HouseProfileForm[K]): void {
    this.house.update((p) => ({ ...p, [key]: v }));
  }
  protected setExtra<K extends keyof ExtrasForm>(key: K, v: ExtrasForm[K]): void {
    this.house.update((p) => ({ ...p, extras: { ...p.extras, [key]: v } }));
  }
  protected setArea(v: string): void {
    this.area.set(v);
    this.setExtra('village', v);
  }
  protected bump(delta: number): void {
    const next = Math.min(99, Math.max(1, this.residents() + delta));
    this.setExtra('residents', String(next));
  }
  protected toggleCare(tag: string, on: boolean): void {
    this.house.update((p) => ({
      ...p,
      extras: { ...p.extras, care: on ? [...new Set([...p.extras.care, tag])] : p.extras.care.filter((c) => c !== tag) },
    }));
  }
}

// ── ขั้นสุดท้าย · สรุปข้อมูลบ้านก่อนส่ง ─────────────────────────────────

/**
 * สรุปข้อมูลบ้านที่กรอก (บ้านเลขที่+ที่อยู่ · ประเภทบ้าน · หมุด) — แถวของบัญชี (ชื่อ/เบอร์) ใส่เป็น `<dt>/<dd>` ข้างในได้
 * ใช้ร่วมกันระหว่างสมัครเจ้าของบ้าน (A06) และเพิ่มบทบาทเจ้าของบ้าน (A15)
 */
@Component({
  selector: 'app-signup-house-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="kv">
      <ng-content />
      <dt>{{ i18n.t({ th: 'บ้าน', en: 'House' }) }}</dt><dd>{{ addressText() }}</dd>
      @if (typeText()) {
        <dt>{{ i18n.t({ th: 'ประเภทบ้าน', en: 'House type' }) }}</dt><dd>{{ typeText() }} · {{ house().extras.residents }} {{ i18n.t({ th: 'คน', en: 'people' }) }}</dd>
      }
      <dt>{{ i18n.t({ th: 'หมุดบนแผนที่', en: 'Map pin' }) }}</dt>
      <dd>{{ house().location ? i18n.t({ th: 'ปักแล้ว', en: 'Set' }) : i18n.t({ th: 'ยังไม่ได้ปัก (ปักทีหลังในหน้าตั้งค่าได้)', en: 'Not set (you can add it later in Settings)' }) }}</dd>
    </dl>
  `,
})
export class SignupHouseReview {
  protected readonly i18n = inject(I18n);
  readonly houseNo = input.required<string>();
  readonly house = input.required<HouseProfileForm>();
  protected readonly addressText = computed(() => {
    const h = this.house();
    return [this.houseNo().trim(), h.address_line.trim(), h.subdistrict.trim(), h.district.trim(), h.province.trim(), h.extras.postal_code.trim()].filter(Boolean).join(' ');
  });
  protected readonly typeText = computed(() => houseTypeLabel(this.house().extras.house_type, this.i18n));
}
