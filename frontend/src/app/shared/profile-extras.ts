import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { I18n, type Tr } from '../core/i18n';

/**
 * รายละเอียดเพิ่มที่ผู้ใช้กรอก (✅ 2026-11-06 "ข้อมูลตอนสมัครขอแบบละเอียด") — เก็บใน `Me.profile` (api.md §2)
 * ไม่เก็บเลขบัตรประชาชน (ไม่จำเป็นต่อระบบ)
 */
export interface ExtrasForm {
  title: string;
  first_name: string;
  last_name: string;
  nickname: string;
  email: string;
  postal_code: string;
  house_type: string;
  village: string;
  residents: string;
  care: string[];
  landmark: string;
  emergency_relation: string;
  contact_time: string;
  rank: string;
}

export const emptyExtras = (): ExtrasForm => ({
  title: '',
  first_name: '',
  last_name: '',
  nickname: '',
  email: '',
  postal_code: '',
  house_type: '',
  village: '',
  residents: '',
  care: [],
  landmark: '',
  emergency_relation: '',
  contact_time: '',
  rank: '',
});

/** ใส่ค่าจาก `Me.profile` ลงฟอร์ม (ฟิลด์ที่ไม่รู้จักข้าม) */
export function extrasFromProfile(p: Record<string, unknown> | null | undefined): ExtrasForm {
  const f = emptyExtras();
  if (!p) return f;
  for (const k of Object.keys(f) as (keyof ExtrasForm)[]) {
    const v = p[k];
    if (k === 'care') f.care = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    else if (typeof v === 'string') (f[k] as string) = v;
    else if (typeof v === 'number') (f[k] as string) = String(v);
  }
  return f;
}

export type ExtrasKind = 'owner' | 'officer' | 'head';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ตรวจฟอร์ม: เจ้าของบ้านบังคับ ประเภทบ้าน/รหัสไปรษณีย์/จำนวนผู้อยู่อาศัย · อีเมลถ้ากรอกต้องถูกรูปแบบ */
export function extrasValid(f: ExtrasForm, kind: ExtrasKind): boolean {
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) return false;
  if (f.postal_code.trim() && !/^[0-9]{5}$/.test(f.postal_code.trim())) return false;
  const n = Number(f.residents);
  if (f.residents.trim() && !(Number.isInteger(n) && n >= 1 && n <= 99)) return false;
  if (kind === 'owner') return !!f.house_type && /^[0-9]{5}$/.test(f.postal_code.trim()) && Number.isInteger(n) && n >= 1;
  return true;
}

/** แปลงเป็น `profile` ของ API — ส่งเฉพาะช่องที่กรอก และเฉพาะที่เกี่ยวกับบทบาท */
export function extrasPayload(f: ExtrasForm, kind: ExtrasKind): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (k: keyof ExtrasForm) => {
    const v = f[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  };
  (['title', 'first_name', 'last_name', 'nickname', 'email'] as const).forEach(put);
  if (kind === 'owner') {
    (['postal_code', 'house_type', 'village', 'landmark', 'emergency_relation', 'contact_time'] as const).forEach(put);
    if (f.residents.trim()) out['residents'] = Number(f.residents);
    if (f.care.length) out['care'] = f.care;
  }
  if (kind === 'officer') put('rank');
  return out;
}

const TITLES: { value: string; label: Tr }[] = [
  { value: 'mr', label: { th: 'นาย', en: 'Mr.' } },
  { value: 'mrs', label: { th: 'นาง', en: 'Mrs.' } },
  { value: 'ms', label: { th: 'นางสาว', en: 'Ms.' } },
  { value: 'other', label: { th: 'อื่น ๆ', en: 'Other' } },
];

export const HOUSE_TYPES: { value: string; label: Tr }[] = [
  { value: 'house', label: { th: 'บ้านเดี่ยว', en: 'Detached house' } },
  { value: 'townhome', label: { th: 'ทาวน์โฮม / ทาวน์เฮาส์', en: 'Townhome' } },
  { value: 'village', label: { th: 'บ้านในหมู่บ้านจัดสรร', en: 'Gated village house' } },
  { value: 'condo', label: { th: 'คอนโด / อพาร์ตเมนต์', en: 'Condo / apartment' } },
  { value: 'shop', label: { th: 'ร้านค้า / ตึกแถว', en: 'Shophouse' } },
  { value: 'other', label: { th: 'อื่น ๆ', en: 'Other' } },
];

export const CARE: { value: string; label: Tr }[] = [
  { value: 'elderly', label: { th: 'ผู้สูงอายุ', en: 'Elderly' } },
  { value: 'children', label: { th: 'เด็กเล็ก', en: 'Young children' } },
  { value: 'disabled', label: { th: 'ผู้พิการ', en: 'Person with disability' } },
  { value: 'bedridden', label: { th: 'ผู้ป่วยติดเตียง', en: 'Bedridden patient' } },
  { value: 'pregnant', label: { th: 'หญิงตั้งครรภ์', en: 'Pregnant' } },
  { value: 'pets', label: { th: 'สัตว์เลี้ยง (เช่น สุนัข)', en: 'Pets (e.g. dogs)' } },
];

/** ป้ายสำหรับแสดงผล (เช่น การ์ด SOS ของเจ้าหน้าที่) */
export const houseTypeLabel = (v: string | null | undefined, i18n: I18n): string => {
  const t = HOUSE_TYPES.find((x) => x.value === v);
  return t ? i18n.t(t.label) : '';
};
export const careLabel = (v: string, i18n: I18n): string => {
  const t = CARE.find((x) => x.value === v);
  return t ? i18n.t(t.label) : v;
};

@Component({
  selector: 'app-profile-extras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ทุกช่องในกลุ่มนี้ไม่บังคับ → พับไว้ ฟอร์มสมัครจะได้เหลือแต่ช่องที่ต้องกรอก (มีข้อมูลอยู่แล้ว/อีเมลผิด = กางให้เอง) -->
    <details class="group form-section opt" [open]="personalOpen() || hasPersonal()" (toggle)="personalOpen.set($any($event.target).open)">
      <summary class="form-title">
        {{ i18n.t({ th: 'ข้อมูลส่วนตัวเพิ่มเติม', en: 'More personal details' }) }}
        <span class="opt-tag">{{ i18n.t({ th: 'ไม่บังคับ · กรอกทีหลังได้', en: 'optional · can add later' }) }}</span>
      </summary>
      <div class="form-grid">
        <label class="field">
          <span>{{ i18n.t({ th: 'คำนำหน้า', en: 'Title' }) }}</span>
          <select [value]="value().title" (change)="set('title', $any($event.target).value)">
            <option value="">—</option>
            @for (t of titles; track t.value) { <option [value]="t.value" [selected]="value().title === t.value">{{ i18n.t(t.label) }}</option> }
          </select>
        </label>
        <label class="field">
          <span>{{ i18n.t({ th: 'ชื่อเล่น', en: 'Nickname' }) }}</span>
          <input maxlength="40" [value]="value().nickname" (input)="set('nickname', $any($event.target).value)" />
        </label>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>{{ i18n.t({ th: 'ชื่อจริง', en: 'First name' }) }}</span>
          <input maxlength="60" autocomplete="given-name" [value]="value().first_name" (input)="set('first_name', $any($event.target).value)" />
        </label>
        <label class="field">
          <span>{{ i18n.t({ th: 'นามสกุล', en: 'Last name' }) }}</span>
          <input maxlength="60" autocomplete="family-name" [value]="value().last_name" (input)="set('last_name', $any($event.target).value)" />
        </label>
      </div>
      <label class="field" [class.invalid]="emailBad()">
        <span>{{ i18n.t({ th: 'อีเมล (ไม่บังคับ)', en: 'Email (optional)' }) }}</span>
        <input type="email" inputmode="email" maxlength="200" autocomplete="email" [value]="value().email" (input)="set('email', $any($event.target).value)" />
        @if (emailBad()) { <small class="err">{{ i18n.t({ th: 'รูปแบบอีเมลไม่ถูกต้อง', en: 'That email looks wrong' }) }}</small> }
      </label>
    </details>

    @if (kind() === 'officer' && part() === 'all') {
      <section class="group form-section">
        <h2 class="form-title">{{ i18n.t({ th: 'ข้อมูลการปฏิบัติงาน', en: 'Duty details' }) }}</h2>
        <label class="field">
          <span>{{ i18n.t({ th: 'ยศ / ระดับ (ถ้ามี)', en: 'Rank / grade (if any)' }) }}</span>
          <input maxlength="100" [value]="value().rank" (input)="set('rank', $any($event.target).value)" />
        </label>
      </section>
    }

    @if (kind() === 'owner' && part() === 'all') {
      <section class="group form-section">
        <h2 class="form-title">{{ i18n.t({ th: 'รายละเอียดบ้าน', en: 'House details' }) }}</h2>
        <div class="form-grid">
          <label class="field" [class.invalid]="tried() && !value().house_type">
            <span>{{ i18n.t({ th: 'ประเภทบ้าน', en: 'House type' }) }}</span>
            <select [value]="value().house_type" (change)="set('house_type', $any($event.target).value)">
              <option value="">{{ i18n.t({ th: '— เลือก —', en: '— choose —' }) }}</option>
              @for (t of houseTypes; track t.value) { <option [value]="t.value" [selected]="value().house_type === t.value">{{ i18n.t(t.label) }}</option> }
            </select>
          </label>
          <label class="field" [class.invalid]="tried() && !postalOk()">
            <span>{{ i18n.t({ th: 'รหัสไปรษณีย์', en: 'Postal code' }) }}</span>
            <input inputmode="numeric" maxlength="5" autocomplete="postal-code" [value]="value().postal_code" (input)="set('postal_code', $any($event.target).value.replace(/\\D/g, ''))" />
          </label>
        </div>
        <label class="field">
          <span>{{ i18n.t({ th: 'หมู่บ้าน / โครงการ / อาคาร (ถ้ามี)', en: 'Village / project / building (if any)' }) }}</span>
          <input maxlength="100" [value]="value().village" (input)="set('village', $any($event.target).value)" />
        </label>
        <label class="field" [class.invalid]="tried() && !residentsOk()">
          <span>{{ i18n.t({ th: 'จำนวนผู้อยู่อาศัย (คน)', en: 'People living here' }) }}</span>
          <input type="number" inputmode="numeric" min="1" max="99" [value]="value().residents" (input)="set('residents', $any($event.target).value)" />
        </label>
        <fieldset class="field">
          <legend>{{ i18n.t({ th: 'มีใครที่ต้องดูแลเป็นพิเศษไหม (ไม่บังคับ)', en: 'Anyone who needs extra care? (optional)' }) }}</legend>
          <small>{{ i18n.t({ th: 'เจ้าหน้าที่เห็นเฉพาะตอนคุณกด SOS เพื่อเตรียมตัวก่อนไปถึง', en: 'Officers see this only during your SOS, to prepare before arriving' }) }}</small>
          <div class="chips">
            @for (c of careOptions; track c.value) {
              <label class="chip-toggle"><input type="checkbox" [checked]="value().care.includes(c.value)" (change)="toggleCare(c.value, $any($event.target).checked)" />{{ i18n.t(c.label) }}</label>
            }
          </div>
        </fieldset>
        <label class="field">
          <span>{{ i18n.t({ th: 'จุดสังเกต / วิธีเข้าบ้าน (ไม่บังคับ)', en: 'Landmark / how to find the house (optional)' }) }}</span>
          <input maxlength="200" [placeholder]="i18n.t({ th: 'เช่น ตรงข้ามร้านสะดวกซื้อ ประตูสีฟ้า', en: 'e.g. opposite the convenience store, blue gate' })" [value]="value().landmark" (input)="set('landmark', $any($event.target).value)" />
        </label>
        <div class="form-grid">
          <label class="field">
            <span>{{ i18n.t({ th: 'ผู้ติดต่อฉุกเฉินเป็นใคร (เช่น ลูก)', en: 'Emergency contact is your… (e.g. child)' }) }}</span>
            <input maxlength="60" [value]="value().emergency_relation" (input)="set('emergency_relation', $any($event.target).value)" />
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'ช่วงเวลาที่ติดต่อได้', en: 'Best time to reach you' }) }}</span>
            <input maxlength="100" [placeholder]="i18n.t({ th: 'เช่น หลัง 18:00', en: 'e.g. after 6 pm' })" [value]="value().contact_time" (input)="set('contact_time', $any($event.target).value)" />
          </label>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 14px;
    }
    details.opt > summary {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 10px;
      cursor: pointer;
      margin: 0;
    }
    details.opt > summary::-webkit-details-marker {
      display: none;
    }
    details.opt > summary::after {
      content: '+';
      margin-inline-start: auto;
      font-size: 1.25rem;
      line-height: 1;
      color: var(--brand-text);
    }
    details.opt[open] > summary::after {
      content: '−';
    }
    details.opt[open] > summary {
      margin-block-end: 12px;
    }
    .opt-tag {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--text-muted);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-block-start: 6px;
    }
    .err {
      color: var(--sos);
    }
  `,
})
export class ProfileExtras {
  protected readonly i18n = inject(I18n);
  readonly kind = input<ExtrasKind>('owner');
  /** `personal` = แสดงเฉพาะกลุ่ม "ข้อมูลส่วนตัวเพิ่มเติม" (ฟอร์มสมัครที่แยกรายละเอียดบ้านเป็นขั้นของตัวเอง) */
  readonly part = input<'all' | 'personal'>('all');
  readonly value = model.required<ExtrasForm>();
  readonly tried = input(false);
  protected readonly titles = TITLES;
  protected readonly houseTypes = HOUSE_TYPES;
  protected readonly careOptions = CARE;
  /** ผู้ใช้กางกลุ่ม "ข้อมูลส่วนตัวเพิ่มเติม" เอง — ไม่พับกลับระหว่างพิมพ์ */
  protected readonly personalOpen = signal(false);
  protected readonly hasPersonal = computed(() => {
    const v = this.value();
    return !!(v.title || v.first_name.trim() || v.last_name.trim() || v.nickname.trim() || v.email.trim());
  });
  protected readonly emailBad = computed(() => !!this.value().email.trim() && !EMAIL_RE.test(this.value().email.trim()));
  protected readonly postalOk = computed(() => /^[0-9]{5}$/.test(this.value().postal_code.trim()));
  protected readonly residentsOk = computed(() => {
    const n = Number(this.value().residents);
    return Number.isInteger(n) && n >= 1 && n <= 99;
  });

  protected set<K extends keyof ExtrasForm>(key: K, v: ExtrasForm[K]): void {
    this.value.update((p) => ({ ...p, [key]: v }));
  }

  protected toggleCare(tag: string, on: boolean): void {
    this.value.update((p) => ({ ...p, care: on ? [...new Set([...p.care, tag])] : p.care.filter((c) => c !== tag) }));
  }
}


/** รายละเอียดบ้านบนการ์ด SOS ของเจ้าหน้าที่ (เห็นเฉพาะตอน SOS เปิด) — ผู้ที่ต้องดูแลพิเศษแสดงเด่นเพื่อเตรียมตัว */
@Component({
  selector: 'app-sos-house-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (d(); as x) {
      <dl class="kv">
        @if (x.house_type) { <dt>{{ i18n.t({ th: 'ประเภทบ้าน', en: 'House type' }) }}</dt><dd>{{ type(x.house_type) }}</dd> }
        @if (x.village) { <dt>{{ i18n.t({ th: 'หมู่บ้าน/อาคาร', en: 'Village/building' }) }}</dt><dd>{{ x.village }}</dd> }
        @if (x.residents) { <dt>{{ i18n.t({ th: 'ผู้อยู่อาศัย', en: 'Residents' }) }}</dt><dd>{{ x.residents }} {{ i18n.t({ th: 'คน', en: 'people' }) }}</dd> }
        @if (x.care.length) { <dt>{{ i18n.t({ th: 'ต้องดูแลพิเศษ', en: 'Needs extra care' }) }}</dt><dd class="care">{{ careText(x.care) }}</dd> }
        @if (x.landmark) { <dt>{{ i18n.t({ th: 'จุดสังเกต', en: 'Landmark' }) }}</dt><dd>{{ x.landmark }}</dd> }
        @if (x.contact_time) { <dt>{{ i18n.t({ th: 'ติดต่อได้ช่วง', en: 'Reachable' }) }}</dt><dd>{{ x.contact_time }}</dd> }
      </dl>
    }
  `,
  styles: `
    .care {
      color: var(--sos);
      font-weight: 700;
    }
  `,
})
export class SosHouseDetails {
  protected readonly i18n = inject(I18n);
  readonly house = input<{ details?: { house_type: string | null; village: string | null; residents: number | null; care: string[]; landmark: string | null; emergency_relation: string | null; contact_time: string | null } } | null>(null);
  protected readonly d = computed(() => {
    const x = this.house()?.details;
    return x && (x.house_type || x.village || x.residents || x.care.length || x.landmark || x.contact_time) ? x : null;
  });
  protected type(v: string): string {
    return houseTypeLabel(v, this.i18n);
  }
  protected careText(list: string[]): string {
    return list.map((c) => careLabel(c, this.i18n)).join(' · ');
  }
}
