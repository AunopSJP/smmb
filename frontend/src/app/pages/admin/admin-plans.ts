import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, type Tr } from '../../core/i18n';
import { PlanDemo, showDate, type PlanError, type PlanStatus } from '../../core/mock/plan-demo';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';

// แพ็กเกจ (แอดมิน) — api.md §9.7 · design §17 · ไม่มีการชำระเงิน แอดมินเป็นคนตั้ง

export const PLAN_STATUS: Record<PlanStatus, { label: Tr; tone: '' | 'ok' | 'warn' | 'danger' }> = {
  active: { label: { th: 'ใช้อยู่', en: 'Active' }, tone: 'ok' },
  expiring: { label: { th: 'ใกล้หมดอายุ', en: 'Expiring' }, tone: 'warn' },
  expired: { label: { th: 'หมดอายุ', en: 'Expired' }, tone: 'danger' },
  none: { label: { th: 'ไม่มีแพ็ก', en: 'No plan' }, tone: 'danger' },
};

const PLAN_ERROR: Record<PlanError, Tr> = {
  PLAN_INACTIVE: { th: 'แพ็กนี้ปิดให้เลือกแล้ว', en: 'This plan is no longer offered' },
  NOT_OWNER: { th: 'แพ็กเกจมีเฉพาะบัญชีเจ้าของบ้าน', en: 'Only homeowner accounts have plans' },
  CODE_TAKEN: { th: 'รหัสแพ็กนี้มีแล้ว', en: 'This plan code already exists' },
  CODE_INVALID: { th: 'รหัสใช้ a–z, 0–9, _ ขึ้นต้นด้วยตัวอักษร (2–31 ตัว)', en: 'Code: a–z, 0–9, _ starting with a letter (2–31 chars)' },
  NAME_REQUIRED: { th: 'ใส่ชื่อทั้งไทยและอังกฤษ', en: 'Enter both Thai and English names' },
  BAD_END: { th: 'วันหมดอายุต้องหลังวันนี้', en: 'The end date must be after today' },
};

// ── ส่วนแพ็กเกจในหน้าผู้ใช้ D09 ─────────────────────────────

@Component({
  selector: 'app-user-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card plan">
      <div class="head">
        <strong class="grow">{{ i18n.t({ th: 'แพ็กเกจ', en: 'Plan' }) }}</strong>
        <span class="chip" [class.ok]="st().tone === 'ok'" [class.warn]="st().tone === 'warn'" [class.danger]="st().tone === 'danger'">{{ i18n.t(st().label) }}</span>
      </div>
      @if (current(); as c) {
        <p>
          <strong>{{ planName(c.plan_code) }}</strong> · {{ i18n.t({ th: 'ตั้งแต่ ', en: 'since ' }) }}{{ date(c.starts_at) }}
          <br /><span class="muted small">{{ c.ends_at ? i18n.t({ th: 'ใช้ได้ถึง ', en: 'until ' }) + date(c.ends_at) : i18n.t({ th: 'ไม่มีวันหมดอายุ', en: 'No end date' }) }}</span>
        </p>
      }

      @if (editing()) {
        <fieldset class="options">
          <legend>{{ i18n.t({ th: 'เปลี่ยนเป็น', en: 'Change to' }) }}</legend>
          @for (p of plans.activePlans(); track p.code) {
            <label><input type="radio" name="plan" [checked]="code() === p.code" (change)="code.set(p.code)" /> {{ i18n.t(p.name) }}</label>
          }
        </fieldset>
        <label class="field">
          <span>{{ i18n.t({ th: 'ใช้ได้ถึง (ไม่ใส่ = ไม่หมดอายุ)', en: 'Ends on (empty = no end)' }) }}</span>
          <input type="date" [min]="tomorrow()" [value]="ends()" (input)="ends.set($any($event.target).value)" />
        </label>
        <label class="field">
          <span>{{ i18n.t({ th: 'หมายเหตุ (ไม่บังคับ)', en: 'Note (optional)' }) }}</span>
          <textarea maxlength="200" [value]="note()" (input)="note.set($any($event.target).value)"></textarea>
        </label>
        @if (error(); as e) {
          <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
        }
        <p class="muted small">{{ i18n.t({ th: 'เริ่มใช้วันนี้ · แพ็กเดิมปิดวันนี้และเก็บไว้ในประวัติ', en: 'Starts today · the old plan ends today and stays in the history' }) }}</p>
        <div class="two">
          <button type="button" class="btn secondary" (click)="editing.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
          <button type="button" class="btn" (click)="save()">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
        </div>
      } @else {
        <button type="button" class="btn secondary" (click)="edit()">{{ i18n.t({ th: 'เปลี่ยนแพ็กเกจ', en: 'Change plan' }) }}</button>
      }

      <details>
        <summary>{{ i18n.t({ th: 'ประวัติแพ็กเกจ', en: 'Plan history' }) }} ({{ history().length }})</summary>
        <ul class="history">
          @for (h of history(); track $index) {
            <li>
              <strong>{{ planName(h.plan_code) }}</strong> · {{ date(h.starts_at) }} – {{ h.ends_at ? date(h.ends_at) : i18n.t({ th: 'ปัจจุบัน', en: 'now' }) }}
              <span class="muted small block">{{ i18n.t({ th: 'โดย ', en: 'by ' }) }}{{ i18n.t(h.by) }}{{ h.note ? ' · ' + h.note : '' }}</span>
            </li>
          }
        </ul>
      </details>
      <p class="muted small">{{ i18n.t({ th: 'SOS และการตรวจตู้ใช้ได้เสมอ ไม่ขึ้นกับแพ็กเกจ', en: 'SOS and inspections always work, whatever the plan' }) }}</p>
    </section>
  `,
  styles: `
    .plan {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .grow {
      flex: 1;
    }
    .block {
      display: block;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    summary {
      cursor: pointer;
      font-weight: 700;
      min-height: 32px;
    }
    .history {
      list-style: none;
      margin: 8px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `,
})
export class UserPlan {
  protected readonly i18n = inject(I18n);
  protected readonly plans = inject(PlanDemo);
  private readonly toast = inject(Toast);
  readonly userId = input.required<string>();

  protected readonly current = computed(() => this.plans.current(this.userId()));
  protected readonly st = computed(() => PLAN_STATUS[this.plans.status(this.userId())]);
  protected readonly history = computed(() => this.plans.history(this.userId()));
  protected readonly editing = signal(false);
  protected readonly code = signal('free');
  protected readonly ends = signal('');
  protected readonly note = signal('');
  protected readonly error = signal<Tr | null>(null);
  protected readonly tomorrow = computed(() => new Date(Date.parse(this.plans.today()) + 86_400_000).toISOString().slice(0, 10));

  protected date(iso: string): string {
    return showDate(iso, this.i18n.lang());
  }

  protected planName(code: string): string {
    const p = this.plans.plan(code);
    return p ? this.i18n.t(p.name) : code;
  }

  protected edit(): void {
    this.code.set(this.current()?.plan_code ?? 'free');
    this.ends.set('');
    this.note.set('');
    this.error.set(null);
    this.editing.set(true);
  }

  /** ของจริง: PUT /admin/users/:id/plan { plan_code, ends_at?, note? } */
  protected save(): void {
    const e = this.plans.setPlan(this.userId(), true, this.code(), this.ends() || null, this.note(), { th: 'แอดมิน', en: 'Admin' });
    if (e) {
      this.error.set(PLAN_ERROR[e]);
      return;
    }
    this.editing.set(false);
    this.toast.show({ th: 'เปลี่ยนแพ็กเกจแล้ว', en: 'Plan changed' });
  }
}

// ── D14 · แพ็กเกจ (ไม่มีใน wireframe) ──────────────────────────

@Component({
  selector: 'app-admin-plans',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'แพ็กเกจ', en: 'Plans' })" [back]="url('D01')" />
    <div class="stack">
      <div class="list">
        @for (p of plans.plans(); track p.code) {
          <div class="row plan">
            <span class="grow">
              <strong>{{ i18n.t(p.name) }}</strong> <span class="muted small">({{ p.code }})</span>
              <span class="muted small block">
                {{ plans.ownersCount(p.code) }} {{ i18n.t({ th: 'คนใช้อยู่', en: 'owners' }) }}{{ p.price_note ? ' · ' + i18n.t(p.price_note) : '' }}
              </span>
              <span class="chips">
                @if (p.is_default) {
                  <span class="chip ok">{{ i18n.t({ th: 'เริ่มต้น', en: 'Default' }) }}</span>
                }
                @if (!p.is_active) {
                  <span class="chip">{{ i18n.t({ th: 'ปิดให้เลือก', en: 'Not offered' }) }}</span>
                }
              </span>
            </span>
            <span class="actions">
              @if (!p.is_default && p.is_active) {
                <button type="button" class="mini" (click)="setDefault(p.code)">{{ i18n.t({ th: 'ตั้งเป็นเริ่มต้น', en: 'Make default' }) }}</button>
              }
              @if (!p.is_default) {
                <button type="button" class="mini" (click)="toggle(p.code, !p.is_active)">
                  {{ p.is_active ? i18n.t({ th: 'ปิดให้เลือก', en: 'Stop offering' }) : i18n.t({ th: 'เปิดให้เลือก', en: 'Offer again' }) }}
                </button>
              }
            </span>
          </div>
        }
      </div>
      <p class="muted small">
        {{ i18n.t({ th: 'เริ่มต้น = แพ็กที่เจ้าของบ้านได้ตอนสมัคร (คนเดิมไม่เปลี่ยน) · ปิดให้เลือก = คนเดิมใช้ต่อได้ · แพ็กเริ่มต้นปิดไม่ได้', en: 'Default = given at sign-up (existing owners keep theirs) · not offered = existing owners keep it · the default cannot be switched off' }) }}
      </p>

      @if (adding()) {
        <form class="card stack" (submit)="$event.preventDefault(); add()">
          <strong>{{ i18n.t({ th: 'เพิ่มแพ็กเกจ', en: 'New plan' }) }}</strong>
          <label class="field">
            <span>{{ i18n.t({ th: 'รหัส (แก้ทีหลังไม่ได้)', en: 'Code (cannot change later)' }) }}</span>
            <input autocapitalize="off" spellcheck="false" placeholder="plus" [value]="code()" (input)="code.set($any($event.target).value)" />
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'ชื่อ (ไทย)', en: 'Name (Thai)' }) }}</span>
            <input [value]="nameTh()" (input)="nameTh.set($any($event.target).value)" />
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'ชื่อ (อังกฤษ)', en: 'Name (English)' }) }}</span>
            <input [value]="nameEn()" (input)="nameEn.set($any($event.target).value)" />
          </label>
          <label class="field">
            <span>{{ i18n.t({ th: 'ข้อความราคา (แสดงเฉย ๆ ไม่มีการชำระเงิน)', en: 'Price note (display only — no payments)' }) }}</span>
            <input [value]="price()" (input)="price.set($any($event.target).value)" />
          </label>
          <p class="muted small">{{ i18n.t({ th: 'ช่วงเดโมมีแค่แพ็กฟรี และเปิดทุกฟีเจอร์ — ฟีเจอร์ของแพ็กอื่นค่อยกำหนดตอนเพิ่มจริง', en: 'During the demo there is only Free, with every feature — other plans get their features when they are added' }) }}</p>
          @if (error(); as e) {
            <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
          }
          <div class="two">
            <button type="button" class="btn secondary" (click)="adding.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
            <button type="submit" class="btn">{{ i18n.t({ th: 'เพิ่ม', en: 'Add' }) }}</button>
          </div>
        </form>
      } @else {
        <button type="button" class="btn secondary" (click)="startAdd()">{{ i18n.t({ th: 'เพิ่มแพ็กเกจ', en: 'Add a plan' }) }}</button>
      }
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-width: 0;
    }
    .block {
      display: block;
    }
    .plan {
      align-items: flex-start;
    }
    .chips {
      display: flex;
      gap: 4px;
      margin-top: 4px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-end;
    }
    .mini {
      min-height: 36px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
  `,
})
export class AdminPlans {
  protected readonly i18n = inject(I18n);
  protected readonly plans = inject(PlanDemo);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly adding = signal(false);
  protected readonly code = signal('');
  protected readonly nameTh = signal('');
  protected readonly nameEn = signal('');
  protected readonly price = signal('');
  protected readonly error = signal<Tr | null>(null);

  protected startAdd(): void {
    this.code.set('');
    this.nameTh.set('');
    this.nameEn.set('');
    this.price.set('');
    this.error.set(null);
    this.adding.set(true);
  }

  /** ของจริง: POST /admin/plans { code, name_th, name_en, price_note? } */
  protected add(): void {
    const note = this.price().trim();
    const e = this.plans.addPlan(this.code(), { th: this.nameTh(), en: this.nameEn() }, note ? { th: note, en: note } : null);
    if (e) {
      this.error.set(PLAN_ERROR[e]);
      return;
    }
    this.adding.set(false);
    this.toast.show({ th: 'เพิ่มแพ็กเกจแล้ว', en: 'Plan added' });
  }

  /** ของจริง: PATCH /admin/plans/:code { is_default: true } */
  protected setDefault(code: string): void {
    this.plans.setDefault(code);
    this.toast.show({ th: 'ตั้งเป็นแพ็กเริ่มต้นแล้ว', en: 'Now the default plan' });
  }

  /** ของจริง: PATCH /admin/plans/:code { is_active } */
  protected toggle(code: string, active: boolean): void {
    this.plans.setActive(code, active);
    this.toast.show(active ? { th: 'เปิดให้เลือกแล้ว', en: 'Offered again' } : { th: 'ปิดให้เลือกแล้ว', en: 'No longer offered' });
  }
}
