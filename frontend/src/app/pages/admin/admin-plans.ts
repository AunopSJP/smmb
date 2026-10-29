import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, type OnInit } from '@angular/core';
import { apiError } from '../../core/api';
import { AdminApi, type AdminPlan, type AdminUserPlan } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { showDate, type PlanError, type PlanStatus } from '../../core/mock/plan-demo';
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

function todayInBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

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
          @for (p of activePlans(); track p.code) {
            <label><input type="radio" name="plan" [checked]="code() === p.code" (change)="code.set(p.code)" /> {{ i18n.t(name(p)) }}</label>
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
          <button type="button" class="btn secondary" [disabled]="saving()" (click)="editing.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
          <button type="button" class="btn" [disabled]="saving()" (click)="save()">{{ i18n.t({ th: saving() ? 'กำลังบันทึก…' : 'บันทึก', en: saving() ? 'Saving…' : 'Save' }) }}</button>
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
              <span class="muted small block">{{ i18n.t({ th: 'โดย ', en: 'by ' }) }}{{ h.set_by ?? i18n.t({ th: 'ระบบ', en: 'System' }) }}{{ h.note ? ' · ' + h.note : '' }}</span>
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
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  readonly userId = input.required<string>();

  protected readonly plans = signal<AdminPlan[]>([]);
  protected readonly history = signal<AdminUserPlan[]>([]);
  protected readonly current = computed(() => {
    const today = todayInBangkok();
    return this.history().find((row) => row.starts_at <= today && (row.ends_at === null || today <= row.ends_at));
  });
  protected readonly st = computed(() => {
    const current = this.current();
    if (!current) return PLAN_STATUS[this.history().length ? 'expired' : 'none'];
    if (!current.ends_at) return PLAN_STATUS.active;
    const remaining = (Date.parse(`${current.ends_at}T00:00:00Z`) - Date.parse(`${todayInBangkok()}T00:00:00Z`)) / 86_400_000;
    return PLAN_STATUS[remaining <= 7 ? 'expiring' : 'active'];
  });
  protected readonly activePlans = computed(() => this.plans().filter((plan) => plan.is_active));
  protected readonly editing = signal(false);
  protected readonly code = signal('free');
  protected readonly ends = signal('');
  protected readonly note = signal('');
  protected readonly error = signal<Tr | null>(null);
  protected readonly tomorrow = computed(() => {
    const date = new Date(`${todayInBangkok()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  protected readonly saving = signal(false);
  private requestSequence = 0;

  constructor() {
    effect(() => {
      const id = this.userId();
      const request = ++this.requestSequence;
      void this.load(id, request);
    });
  }

  private async load(userId: string, request: number): Promise<void> {
    try {
      const [plans, history] = await Promise.all([this.api.plans(), this.api.userPlans(userId)]);
      if (request !== this.requestSequence) return;
      this.plans.set(plans);
      this.history.set(history);
    } catch {
      if (request === this.requestSequence) this.toast.show({ th: 'โหลดประวัติแพ็กไม่ได้', en: 'Could not load plan history' });
    }
  }

  protected date(iso: string): string {
    return showDate(iso, this.i18n.lang());
  }

  protected planName(code: string): string {
    const plan = this.plans().find((item) => item.code === code);
    return plan ? this.i18n.t({ th: plan.name_th, en: plan.name_en }) : code;
  }

  protected name(plan: AdminPlan): Tr {
    return { th: plan.name_th, en: plan.name_en };
  }

  protected edit(): void {
    this.code.set(this.current()?.plan_code ?? 'free');
    this.ends.set('');
    this.note.set('');
    this.error.set(null);
    this.editing.set(true);
  }

  protected async save(): Promise<void> {
    const endsAt = this.ends();
    if (endsAt && endsAt <= todayInBangkok()) {
      this.error.set(PLAN_ERROR.BAD_END);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.history.set(await this.api.setUserPlan(this.userId(), {
        plan_code: this.code(),
        ...(endsAt ? { ends_at: endsAt } : {}),
        ...(this.note().trim() ? { note: this.note().trim() } : {}),
      }));
      this.editing.set(false);
      this.toast.show({ th: 'เปลี่ยนแพ็กเกจแล้ว', en: 'Plan changed' });
    } catch (err) {
      const code = apiError(err).code;
      this.error.set(code === 'NOT_OWNER' ? PLAN_ERROR.NOT_OWNER : code === 'PLAN_INACTIVE' ? PLAN_ERROR.PLAN_INACTIVE : code === 'PLAN_END_MUST_BE_FUTURE' ? PLAN_ERROR.BAD_END : { th: 'เปลี่ยนแพ็กเกจไม่ได้ · ลองโหลดข้อมูลใหม่', en: 'Could not change the plan · reload and try again' });
    } finally {
      this.saving.set(false);
    }
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
      @if (loading()) {
        <p class="muted">{{ i18n.t({ th: 'กำลังโหลดแพ็กเกจ…', en: 'Loading plans…' }) }}</p>
      } @else if (loadFailed()) {
        <section class="card stack" role="alert">
          <p>{{ i18n.t({ th: 'โหลดแพ็กเกจไม่ได้', en: 'Could not load plans' }) }}</p>
          <button type="button" class="btn secondary" (click)="load()">{{ i18n.t({ th: 'ลองใหม่', en: 'Try again' }) }}</button>
        </section>
      }
      <div class="list">
        @for (p of plans(); track p.code) {
          <div class="row plan">
            <span class="grow">
              <strong>{{ i18n.t(name(p)) }}</strong> <span class="muted small">({{ p.code }})</span>
              <span class="muted small block">
                {{ p.owners_count }} {{ i18n.t({ th: 'คนใช้อยู่', en: 'owners' }) }}{{ p.price_note ? ' · ' + p.price_note : '' }}
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
                <button type="button" class="mini" [disabled]="busy() !== null" (click)="setDefault(p.code)">{{ i18n.t({ th: 'ตั้งเป็นเริ่มต้น', en: 'Make default' }) }}</button>
              }
              @if (!p.is_default) {
                <button type="button" class="mini" [disabled]="busy() !== null" (click)="toggle(p.code, !p.is_active)">
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
          <p class="muted small">{{ i18n.t({ th: 'ยังไม่มีการชำระเงิน · รายการแพ็กเป็นข้อมูลกำกับและยังไม่เปลี่ยนสิทธิ์ฟีเจอร์ในระบบ', en: 'Payments are not enabled · plan entries are informational and do not change feature access' }) }}</p>
          @if (error(); as e) {
            <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
          }
          <div class="two">
            <button type="button" class="btn secondary" [disabled]="busy() !== null" (click)="adding.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
            <button type="submit" class="btn" [disabled]="busy() !== null">{{ i18n.t({ th: busy() === 'create' ? 'กำลังบันทึก…' : 'เพิ่ม', en: busy() === 'create' ? 'Saving…' : 'Add' }) }}</button>
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
export class AdminPlans implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly plans = signal<AdminPlan[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly code = signal('');
  protected readonly nameTh = signal('');
  protected readonly nameEn = signal('');
  protected readonly price = signal('');
  protected readonly error = signal<Tr | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.plans.set(await this.api.plans());
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected name(plan: AdminPlan): Tr {
    return { th: plan.name_th, en: plan.name_en };
  }

  protected startAdd(): void {
    this.code.set('');
    this.nameTh.set('');
    this.nameEn.set('');
    this.price.set('');
    this.error.set(null);
    this.adding.set(true);
  }

  protected async add(): Promise<void> {
    const note = this.price().trim();
    this.busy.set('create');
    this.error.set(null);
    try {
      await this.api.createPlan({ code: this.code(), name_th: this.nameTh(), name_en: this.nameEn(), ...(note ? { price_note: note } : {}) });
      this.adding.set(false);
      await this.load();
      this.toast.show({ th: 'เพิ่มแพ็กเกจแล้ว', en: 'Plan added' });
    } catch (err) {
      const code = apiError(err).code;
      this.error.set(code === 'PLAN_CODE_TAKEN' ? PLAN_ERROR.CODE_TAKEN : code === 'PLAN_CODE_INVALID' ? PLAN_ERROR.CODE_INVALID : code === 'PLAN_NAME_REQUIRED' ? PLAN_ERROR.NAME_REQUIRED : { th: 'เพิ่มแพ็กเกจไม่ได้ · ตรวจข้อมูลแล้วลองใหม่', en: 'Could not add the plan · check the details and try again' });
    } finally {
      this.busy.set(null);
    }
  }

  protected async setDefault(code: string): Promise<void> {
    this.busy.set(code);
    try {
      await this.api.updatePlan(code, { is_default: true });
      await this.load();
      this.toast.show({ th: 'ตั้งเป็นแพ็กเริ่มต้นแล้ว', en: 'Now the default plan' });
    } catch {
      this.toast.show({ th: 'ตั้งแพ็กเริ่มต้นไม่ได้', en: 'Could not set the default plan' });
    } finally {
      this.busy.set(null);
    }
  }

  protected async toggle(code: string, active: boolean): Promise<void> {
    this.busy.set(code);
    try {
      await this.api.updatePlan(code, { is_active: active });
      await this.load();
      this.toast.show(active ? { th: 'เปิดให้เลือกแล้ว', en: 'Offered again' } : { th: 'ปิดให้เลือกแล้ว', en: 'No longer offered' });
    } catch {
      this.toast.show({ th: 'เปลี่ยนสถานะแพ็กไม่ได้', en: 'Could not change the plan status' });
    } finally {
      this.busy.set(null);
    }
  }
}
