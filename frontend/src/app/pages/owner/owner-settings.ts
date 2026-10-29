import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OwnerApi, type BoxDetail, type TechnicianRequest } from '../../core/owner-api';
import { Session } from '../../core/session';
import { Toast } from '../../core/toast';
import { DisplaySettings, type TextSize, type Theme } from '../../core/display-settings';
import { I18n, type Lang, type Tr } from '../../core/i18n';
import { screenUrl } from '../../screens/registry';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { PushStatus } from '../../shared/push-status';
import { AccountActions } from '../auth/auth-account';

// ── H13 · ตั้งค่าตู้ ───────────────────────────────────────────

@Component({
  selector: 'app-owner-settings',
  imports: [RouterLink, PageHeader, Icon, AccountActions, PushStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + (box()?.house_no ?? '')"
      [title]="i18n.t({ th: 'ตั้งค่าตู้', en: 'Mailbox settings' })"
      [bell]="url('H14')"
    />
    <div class="stack grow">
      <app-push-status />
      @if (boxes().length > 1) {
        <div class="segmented chips" role="group">
          @for (b of boxes(); track b.id) {
            <button type="button" [attr.aria-pressed]="box()?.id === b.id" (click)="open(b.id)">{{ b.house_no }} · {{ b.name }}</button>
          }
        </div>
      }
      @if (box(); as b) {
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'ชื่อตู้', en: 'Name' }) }}</dt>
            <dd>
              @if (renaming()) {
                <input class="name-input" maxlength="50" [value]="draft()" (input)="draft.set($any($event.target).value)" />
                <span class="rename-actions">
                  <button type="button" class="link" (click)="renaming.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
                  <button type="button" class="link strong" [disabled]="!draft().trim()" (click)="rename()">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
                </span>
              } @else {
                {{ b.name }} <button type="button" class="link" (click)="startRename()">{{ i18n.t({ th: 'แก้', en: 'Edit' }) }}</button>
              }
            </dd>
            <dt>{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt><dd>{{ b.id }}</dd>
            <dt>{{ i18n.t({ th: 'แบต', en: 'Battery' }) }}</dt>
            <dd>{{ b.battery ? b.battery.pct + '%' : '—' }}{{ b.battery?.charging ? i18n.t({ th: ' · ชาร์จอยู่', en: ' · charging' }) : '' }}</dd>
            <dt>{{ i18n.t({ th: 'ผู้ดูแล', en: 'Covered by' }) }}</dt>
            <dd>{{ b.coverage.agency_names.join(', ') || i18n.t({ th: 'ยังไม่มีเจ้าหน้าที่ดูแล', en: 'No agency yet' }) }}</dd>
            <dt>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</dt>
            <dd>{{ windows(b) }}</dd>
            <dt>{{ i18n.t({ th: 'แพ็กเกจ', en: 'Plan' }) }}</dt>
            <dd>{{ i18n.t({ th: 'ฟรี', en: 'Free' }) }} <span class="muted small block">{{ i18n.t({ th: 'ไม่มีวันหมดอายุ', en: 'No end date' }) }}</span></dd>
          </dl>
        </section>
      }

      <nav class="list">
        @for (m of menu(); track m.code) {
          <a class="row" [routerLink]="url(m.code)">
            <span class="icon-bubble"><app-icon [name]="m.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(m.title) }}</strong>
              <span class="muted small block">{{ i18n.t(m.sub) }}</span>
            </span>
            @if (m.badge) {
              <span class="chip ok">{{ i18n.t(m.badge) }}</span>
            } @else {
              <app-icon name="chevronRight" [size]="18" />
            }
          </a>
        }
      </nav>

      <app-account-actions current="owner" from="H13" />

      <button type="button" class="btn secondary signout" (click)="signout()">
        {{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}
      </button>
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
    .name-input {
      width: 100%;
      min-height: 40px;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }
    .rename-actions {
      display: flex;
      gap: 12px;
      margin-top: 4px;
    }
    .link {
      border: 0;
      background: none;
      padding: 0 4px;
      font: inherit;
      color: var(--brand);
      cursor: pointer;
    }
    .link.strong {
      font-weight: 700;
    }
    .signout {
      margin-top: auto;
      color: var(--brand);
      box-shadow: inset 0 0 0 1.5px var(--line);
    }
  `,
})
export class OwnerSettings {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  private readonly api = inject(OwnerApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  protected readonly boxes = signal<{ id: string; name: string; house_no: string }[]>([]);
  protected readonly box = signal<BoxDetail | null>(null);
  protected readonly renaming = signal(false);
  protected readonly draft = signal('');

  constructor() {
    void this.api.boxes().then((b) => {
      this.boxes.set(b);
      if (b[0]) void this.open(b[0].id);
    });
  }

  protected async open(id: string): Promise<void> {
    this.box.set(await this.api.box(id).catch(() => null));
  }

  protected windows(b: BoxDetail): string {
    return b.patrol.windows.map((w) => w.join('–')).join(' · ') || '—';
  }

  protected startRename(): void {
    this.draft.set(this.box()?.name ?? '');
    this.renaming.set(true);
  }

  /** PATCH /boxes/:box_id { name } */
  protected async rename(): Promise<void> {
    const b = this.box();
    if (!b || !this.draft().trim()) return;
    try {
      await this.api.rename(b.id, this.draft().trim());
      this.renaming.set(false);
      await this.open(b.id);
      this.boxes.update((list) => list.map((x) => (x.id === b.id ? { ...x, name: this.draft().trim() } : x)));
      this.toast.show({ th: 'เปลี่ยนชื่อตู้แล้ว', en: 'Renamed' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่ได้', en: 'Couldn’t save' });
    }
  }

  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04')));
  }
  protected readonly menu = computed<{ code: string; icon: IconName; title: Tr; sub: Tr; badge?: Tr }[]>(() => {
    const pushOn = this.session.me()?.push.subscribed === true;
    return [
    { code: 'H13-b', icon: 'layers', title: { th: 'เปลี่ยน Wi-Fi บ้าน', en: 'Change home Wi-Fi' }, sub: { th: 'กดสั่งจากเว็บ ตู้จะเข้าโหมดตั้งค่าเอง', en: 'Tap here — the mailbox enters setup mode by itself' } },
    { code: 'H13-c', icon: 'user', title: { th: 'แจ้งช่าง', en: 'Request a technician' }, sub: { th: 'ให้ช่างนัดมาตั้งค่า / ซ่อม', en: 'A technician will set up or repair' } },
    { code: 'H14', icon: 'bell', title: { th: 'การแจ้งเตือน', en: 'Notifications' }, sub: pushOn ? { th: 'เครื่องนี้รับแจ้งเตือนอยู่', en: 'This device gets notifications' } : { th: 'เครื่องนี้ยังไม่ได้เปิด — แตะเพื่อเปิด', en: 'Off on this device — tap to turn on' }, ...(pushOn ? { badge: { th: 'เปิด', en: 'On' } } : {}) },
    { code: 'H13-d', icon: 'settings', title: { th: 'การแสดงผล', en: 'Display' }, sub: { th: 'ธีม · ภาษา · ขนาดตัวอักษร', en: 'Theme · language · text size' } },
  ];
  });
}

// ── H13-b · เปลี่ยน Wi-Fi บ้าน (สั่งจากเว็บ → ตู้ตัด Wi-Fi เดิมแล้วกลับเข้าโหมดตั้งค่า) ─────────────

@Component({
  selector: 'app-owner-wifi',
  imports: [RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ตั้งค่า', en: 'Settings' })" [title]="i18n.t({ th: 'เปลี่ยน Wi-Fi บ้าน', en: 'Change home Wi-Fi' })" [back]="url('H13')" />
    <div class="stack grow">
      @if (!loaded()) {
        <p class="muted">{{ i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
      } @else if (!box()) {
        <div class="card">{{ i18n.t({ th: 'ยังไม่มีตู้ที่ผูกกับบัญชีนี้', en: 'No mailbox is linked to this account yet' }) }}</div>
      } @else {
        @let w = box()!.wifi_reset;
        @if (w.status === 'pending') {
          <div class="card status">
            <strong>{{ i18n.t({ th: 'รอตู้รับคำสั่ง…', en: 'Waiting for the mailbox…' }) }}</strong>
            <small>{{ i18n.t({ th: 'ตู้ที่ออนไลน์จะรับคำสั่งภายในไม่กี่วินาที ถ้าตู้หลับอยู่จะรับตอนตื่นรอบถัดไป (สูงสุด 24 ชม.)', en: 'An online mailbox picks this up within seconds. A sleeping one gets it when it next wakes (up to 24 h).' }) }}</small>
          </div>
        } @else if (w.status === 'done') {
          <div class="card status ok">
            <strong>{{ i18n.t({ th: 'ตู้เข้าโหมดตั้ง Wi-Fi แล้ว', en: 'The mailbox is in setup mode' }) }}</strong>
          </div>
        } @else if (w.status === 'expired') {
          <div class="card status warn">
            <strong>{{ i18n.t({ th: 'ตู้ไม่ได้รับคำสั่ง (เกิน 24 ชม.)', en: 'The mailbox never received the command (over 24 h)' }) }}</strong>
            <small>{{ i18n.t({ th: 'ตรวจว่าตู้เปิดอยู่และมีสัญญาณ แล้วสั่งใหม่ หรือแจ้งช่าง', en: 'Check it is powered and has signal, then try again — or ask a technician.' }) }}</small>
          </div>
        }

        @if (w.status === 'pending' || w.status === 'done') {
          <ol class="card steps">
            @for (s of steps(w.ap_name); track $index; let i = $index) {
              <li class="now">
                <span class="num">{{ i + 1 }}</span>
                <span>
                  <strong>{{ i18n.t(s.title) }}</strong>
                  <small>{{ i18n.t(s.sub) }}</small>
                </span>
              </li>
            }
          </ol>
        } @else {
          <div class="card">
            <p>{{ i18n.t({ th: 'กดปุ่มด้านล่าง ตู้จะตัดการเชื่อมต่อ Wi-Fi เดิมแล้วปล่อย Wi-Fi ของตัวเองให้ตั้งค่าใหม่ — ไม่ต้องเปิดตู้หรือกดปุ่มที่ตัวตู้', en: 'Press the button below. The mailbox drops its current Wi-Fi and opens its own Wi-Fi so you can set a new one — no need to open the box or press anything on it.' }) }}</p>
            <p class="muted">{{ i18n.t({ th: 'ระหว่างนี้ตู้จะออฟไลน์ (ตรวจตู้/ส่งของไม่ได้) ถ้าไม่ตั้ง Wi-Fi ใหม่ใน 10 นาที ตู้จะกลับไปใช้ Wi-Fi เดิมเอง', en: 'The mailbox is offline meanwhile (no patrol checks or deliveries). If no new Wi-Fi is set within 10 minutes it goes back to the old one.' }) }}</p>
          </div>
        }

        <div class="actions">
          @if (w.status === 'pending') {
            <button type="button" class="btn secondary" [disabled]="busy()" (click)="cancel()">{{ i18n.t({ th: 'ยกเลิกคำสั่ง', en: 'Cancel' }) }}</button>
          } @else if (confirming()) {
            <p class="muted">{{ i18n.t({ th: 'ยืนยัน? ตู้จะออฟไลน์ทันทีที่รับคำสั่ง', en: 'Sure? The mailbox goes offline as soon as it gets this.' }) }}</p>
            <button type="button" class="btn" [disabled]="busy()" (click)="request()">{{ i18n.t({ th: 'ยืนยัน เปลี่ยน Wi-Fi', en: 'Yes, change Wi-Fi' }) }}</button>
            <button type="button" class="btn secondary" (click)="confirming.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
          } @else {
            <button type="button" class="btn" (click)="confirming.set(true)">{{ i18n.t({ th: 'เปลี่ยน Wi-Fi ตอนนี้', en: 'Change Wi-Fi now' }) }}</button>
          }
          <a class="btn secondary" [routerLink]="url('H13-c')">{{ i18n.t({ th: 'แจ้งช่างแทน', en: 'Ask a technician instead' }) }}</a>
        </div>
      }
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
    }
    .muted {
      color: var(--text-muted);
    }
    .status {
      display: flex;
      flex-direction: column;
      gap: 4px;
      small {
        color: var(--text-muted);
      }
      &.ok {
        border-color: var(--ok);
      }
      &.warn {
        border-color: var(--brand);
      }
    }
    .steps {
      list-style: none;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
      li {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      strong,
      small {
        display: block;
      }
      small {
        color: var(--text-muted);
      }
    }
    .num {
      display: grid;
      place-items: center;
      flex: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--brand);
      color: #fff;
      font-size: 0.8125rem;
      font-weight: 700;
    }
    .actions {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  `,
})
export class OwnerWifi {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  private readonly api = inject(OwnerApi);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(Toast);
  protected readonly box = signal<BoxDetail | null>(null);
  protected readonly loaded = signal(false);
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
    void this.load();
  }

  private async load(): Promise<void> {
    const boxes = await this.api.boxes().catch(() => []);
    const wanted = this.route.snapshot.queryParamMap.get('box');
    const id = boxes.find((b) => b.id === wanted)?.id ?? boxes[0]?.id;
    if (id) await this.refresh(id);
    this.loaded.set(true);
  }

  private async refresh(id: string): Promise<void> {
    const detail = await this.api.box(id).catch(() => null);
    if (detail) this.box.set(detail);
    // รอตู้รับคำสั่ง/เปลี่ยนสถานะ → ถามซ้ำทุก 3 วิ จนไม่ใช่ pending
    if (detail?.wifi_reset.status === 'pending') this.startPolling(id);
    else this.stopPolling();
  }

  private startPolling(id: string): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(id), 3000);
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  protected steps(apName: string): { title: Tr; sub: Tr }[] {
    return [
      { title: { th: 'ตู้ตัด Wi-Fi เดิมแล้ว', en: 'The mailbox dropped the old Wi-Fi' }, sub: { th: 'จะได้ยินเสียงปี๊บสั้น ๆ 3 ครั้ง', en: 'You will hear three short beeps' } },
      { title: { th: `มือถือต่อ Wi-Fi ชื่อ ${apName}`, en: `Join Wi-Fi “${apName}”` }, sub: { th: 'อยู่ใกล้ตู้ · ไม่มีรหัสผ่าน', en: 'Stay near the box · no password' } },
      { title: { th: 'เปิดเว็บ 192.168.4.1', en: 'Open 192.168.4.1' }, sub: { th: 'ถ้าหน้าตั้งค่าไม่เด้งขึ้นเอง', en: 'If the setup page does not pop up' } },
      { title: { th: 'เลือก Wi-Fi บ้าน (2.4 GHz) + ใส่รหัส', en: 'Pick home Wi-Fi (2.4 GHz) + password' }, sub: { th: 'ต้องทำภายใน 10 นาที ไม่งั้นตู้กลับไปใช้ Wi-Fi เดิม', en: 'Within 10 minutes, or it returns to the old Wi-Fi' } },
    ];
  }

  protected async request(): Promise<void> {
    const b = this.box();
    if (!b || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.requestWifiReset(b.id);
      this.confirming.set(false);
      await this.refresh(b.id);
    } catch {
      this.toast.show({ th: 'สั่งไม่สำเร็จ ลองใหม่อีกครั้ง', en: 'Could not send the command — try again' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    const b = this.box();
    if (!b || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.cancelWifiReset(b.id);
      await this.refresh(b.id);
    } catch {
      this.toast.show({ th: 'ยกเลิกไม่สำเร็จ', en: 'Could not cancel' });
    } finally {
      this.busy.set(false);
    }
  }
}

// ── H13-c · แจ้งช่างแล้ว ──────────────────────────────────────

@Component({
  selector: 'app-owner-technician',
  imports: [RouterLink, Icon, PageHeader, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ตั้งค่าตู้', en: 'Mailbox settings' })" [title]="i18n.t({ th: 'แจ้งช่าง', en: 'Request a technician' })" [back]="url('H13')" />
    <div class="stack page">
      @if (boxes().length > 1) {
        <label class="card field">
          <span>{{ i18n.t({ th: 'เลือกตู้', en: 'Mailbox' }) }}</span>
          <select [value]="boxId()" (change)="selectBox($event)">
            @for (box of boxes(); track box.id) { <option [value]="box.id">{{ box.house_no }} · {{ box.name }}</option> }
          </select>
        </label>
      }
      @if (activeRequest(); as request) {
        <span class="check"><app-icon name="check" [size]="30" /></span>
        <h1 class="center">{{ request.status === 'done' ? i18n.t({ th: 'ช่างดำเนินการแล้ว', en: 'Technician visit completed' }) : i18n.t({ th: 'ส่งคำขอแล้ว', en: 'Request sent' }) }}</h1>
        <p class="muted center">{{ request.status === 'open' ? i18n.t({ th: 'ทีมงานจะติดต่อกลับเพื่อนัดหมาย', en: 'The team will contact you to schedule a visit' }) : request.status === 'scheduled' ? i18n.t({ th: 'มีนัดหมายช่างแล้ว', en: 'A technician visit is scheduled' }) : i18n.t({ th: 'ปิดงานเรียบร้อย', en: 'The request is complete' }) }}</p>
        <section class="card">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'เรื่อง', en: 'Subject' }) }}</dt><dd>{{ reasonLabel(request.reason) }}</dd>
          @if (request.note) { <dt>{{ i18n.t({ th: 'รายละเอียด', en: 'Details' }) }}</dt><dd>{{ request.note }}</dd> }
          <dt>{{ i18n.t({ th: 'ส่งเมื่อ', en: 'Sent' }) }}</dt><dd>{{ request.created_at | date:'d MMM yyyy HH:mm' }}</dd>
          @if (request.scheduled_at) { <dt>{{ i18n.t({ th: 'นัดหมาย', en: 'Appointment' }) }}</dt><dd>{{ request.scheduled_at | date:'d MMM yyyy HH:mm' }}</dd> }
          @if (request.admin_note) { <dt>{{ i18n.t({ th: 'ข้อความจากทีมงาน', en: 'Team note' }) }}</dt><dd>{{ request.admin_note }}</dd> }
          <dt>{{ i18n.t({ th: 'เบอร์ติดต่อกลับ', en: 'Call-back number' }) }}</dt><dd>{{ phone }}</dd>
        </dl>
      </section>
      } @else {
        <p class="muted">{{ i18n.t({ th: 'เลือกเรื่องที่ต้องการให้ช่างช่วย ระบบจะส่งคำขอให้ทีมงานและแจ้งสถานะกลับในหน้านี้', en: 'Choose what you need help with. The team will receive the request and update its status here.' }) }}</p>
        <section class="card stack">
          @for (option of reasons; track option.value) {
            <label class="choice"><input type="radio" name="reason" [value]="option.value" [checked]="reason() === option.value" (change)="reason.set(option.value)" />{{ i18n.t(option.label) }}</label>
          }
          <label class="field">
            <span>{{ i18n.t({ th: 'รายละเอียดเพิ่มเติม (ถ้ามี)', en: 'Details (optional)' }) }}</span>
            <textarea maxlength="1000" rows="3" [value]="note()" (input)="setNote($event)"></textarea>
          </label>
        </section>
        @if (error()) { <p class="danger-text small" role="alert">{{ i18n.t({ th: 'โหลดหรือส่งคำขอไม่สำเร็จ อาจมีคำขอที่ยังเปิดอยู่แล้ว ลองโหลดหน้าใหม่', en: 'Could not load or send the request. An open request may already exist; reload the page.' }) }}</p> }
        <button type="button" class="btn end" [disabled]="sending() || !boxId()" (click)="submit()">
          {{ sending() ? i18n.t({ th: 'กำลังส่ง…', en: 'Sending…' }) : i18n.t({ th: 'ส่งคำขอช่าง', en: 'Send request' }) }}
        </button>
      }
      <a class="btn end" [routerLink]="url('H03')">{{ i18n.t({ th: 'กลับหน้าหลัก', en: 'Back to home' }) }}</a>
    </div>
  `,
  styles: `
    .page {
      flex: 1;
    }
    .check {
      align-self: center;
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      margin-top: 32px;
      border-radius: 50%;
      background: var(--ok-bg);
      color: var(--ok);
    }
    h1 {
      font-size: 1.375rem;
    }
    .center {
      text-align: center;
    }
    .end {
      margin-top: auto;
    }
    .field { display: flex; flex-direction: column; gap: 8px; }
    .field select, .field textarea { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--text); background: var(--surface); font: inherit; }
    .choice { display: flex; align-items: center; gap: 10px; }
    button:disabled { opacity: 0.6; }
  `,
})
export class OwnerTechnician {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  private readonly api = inject(OwnerApi);
  protected readonly phone = inject(Session).me()?.phone ?? '';
  protected readonly boxes = signal<{ id: string; name: string; house_no: string }[]>([]);
  protected readonly boxId = signal('');
  protected readonly requests = signal<TechnicianRequest[]>([]);
  protected readonly reason = signal<TechnicianRequest['reason']>('wifi_change');
  protected readonly note = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal(false);
  protected readonly activeRequest = computed(() => this.requests().find((request) => request.status !== 'done') ?? null);
  protected readonly reasons = [
    { value: 'wifi_change' as const, label: { th: 'เปลี่ยน Wi-Fi บ้าน', en: 'Change home Wi-Fi' } },
    { value: 'repair' as const, label: { th: 'ตู้ชำรุด / ไม่ออนไลน์', en: 'Repair / mailbox offline' } },
    { value: 'other' as const, label: { th: 'เรื่องอื่น', en: 'Other' } },
  ];

  constructor() {
    void this.api.boxes().then((boxes) => {
      this.boxes.set(boxes);
      const first = boxes[0];
      if (first) { this.boxId.set(first.id); void this.loadRequests(first.id); }
    }).catch(() => this.error.set(true));
  }

  protected reasonLabel(reason: TechnicianRequest['reason']): string {
    const choice = this.reasons.find((option) => option.value === reason);
    return choice ? this.i18n.t(choice.label) : reason;
  }

  protected selectBox(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.boxId.set(id);
    void this.loadRequests(id);
  }

  protected setNote(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  private async loadRequests(id: string): Promise<void> {
    try { this.requests.set(await this.api.technicianRequests(id)); this.error.set(false); }
    catch { this.error.set(true); }
  }

  protected async submit(): Promise<void> {
    const id = this.boxId();
    if (!id || this.sending()) return;
    this.sending.set(true);
    this.error.set(false);
    try {
      await this.api.requestTechnician(id, this.reason(), this.note().trim());
      await this.loadRequests(id);
    } catch {
      this.error.set(true);
    } finally {
      this.sending.set(false);
    }
  }
}

// ── H13-d · การแสดงผล ─────────────────────────────────────────

@Component({
  selector: 'app-owner-display',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="officer ? i18n.t({ th: 'บัญชี', en: 'Account' }) : i18n.t({ th: 'ตั้งค่า', en: 'Settings' })"
      [title]="i18n.t({ th: 'การแสดงผล', en: 'Display' })"
      [back]="url(officer ? 'O13' : 'H13')"
    />
    <div class="stack">
      <section class="card stack">
        <h2 class="head"><app-icon name="target" [size]="20" />{{ i18n.t({ th: 'ธีม', en: 'Theme' }) }}</h2>
        <div class="segmented" role="group">
          @for (o of themes; track o.v) {
            <button type="button" [attr.aria-pressed]="display.theme() === o.v" (click)="display.theme.set(o.v)">{{ i18n.t(o.label) }}</button>
          }
        </div>
      </section>

      <section class="card stack">
        <h2 class="head"><app-icon name="layers" [size]="20" />{{ i18n.t({ th: 'ภาษา', en: 'Language' }) }}</h2>
        <div class="segmented" role="group">
          @for (o of langs; track o.v) {
            <button type="button" [attr.aria-pressed]="display.lang() === o.v" (click)="display.lang.set(o.v)" [attr.lang]="o.v">{{ o.label }}</button>
          }
        </div>
      </section>

      <section class="card stack">
        <h2 class="head"><span class="t" aria-hidden="true">T</span>{{ i18n.t({ th: 'ขนาดตัวอักษร', en: 'Text size' }) }}</h2>
        <div class="segmented" role="group">
          @for (o of sizes; track o.v) {
            <button type="button" [attr.aria-pressed]="display.textSize() === o.v" (click)="display.textSize.set(o.v)">{{ i18n.t(o.label) }}</button>
          }
        </div>
        <div class="preview">
          <p class="muted small">{{ i18n.t({ th: 'ตัวอย่าง', en: 'Preview' }) }}</p>
          <p class="sample">{{ i18n.t({ th: 'ตู้ออนไลน์ ปกติดี', en: 'Online · all good' }) }}</p>
        </div>
      </section>

      @if (officer) {
        <!-- O13-b: เจ้าหน้าที่ตรวจตอนกลางคืน -->
        <label class="card toggle">
          <span>
            <strong>{{ i18n.t({ th: 'ธีมมืดอัตโนมัติตอนตรวจกลางคืน', en: 'Auto dark theme for night patrols' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: '18:00–06:00 · ไม่แสบตา ประหยัดแบต', en: '18:00–06:00 · easier on the eyes, saves battery' }) }}</span>
          </span>
          <input type="checkbox" class="switch" role="switch" [checked]="display.nightAutoDark()" (change)="display.nightAutoDark.set($any($event.target).checked)" />
        </label>
        @if (display.nightActive()) {
          <p class="muted small">{{ i18n.t({ th: 'ตอนนี้กลางคืน จึงใช้ธีมมืดอยู่', en: 'It’s night now, so the dark theme is on' }) }}</p>
        }
      } @else {
        <label class="card toggle">
          <span>
            <strong>{{ i18n.t({ th: 'หน้าหลักแบบเรียบง่าย', en: 'Simple home screen' }) }}</strong>
            <span class="muted small block">{{ i18n.t({ th: 'เหลือแค่สถานะตู้ เหตุการณ์ล่าสุด และปุ่ม SOS', en: 'Only mailbox status, latest event and the SOS button' }) }}</span>
          </span>
          <input type="checkbox" class="switch" role="switch" [checked]="display.simpleHome()" (change)="display.simpleHome.set($any($event.target).checked)" />
        </label>
      }
    </div>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
    }
    .t {
      width: 20px;
      text-align: center;
      font-weight: 700;
    }
    .preview {
      background: var(--bg);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
    }
    .sample {
      font-weight: 700;
      font-size: 1.125rem;
      color: var(--ok);
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }
    .block {
      display: block;
    }
  `,
})
/** H13-d (เจ้าของบ้าน) และ O13-b (เจ้าหน้าที่) ใช้หน้านี้ร่วมกัน — ต่างกันที่สวิตช์ล่างสุด */
export class OwnerDisplay {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  protected readonly url = screenUrl;
  protected readonly officer = inject(ActivatedRoute).snapshot.data['code'] === 'O13-b';
  protected readonly themes: { v: Theme; label: Tr }[] = [
    { v: 'light', label: { th: 'สว่าง', en: 'Light' } },
    { v: 'dark', label: { th: 'มืด', en: 'Dark' } },
    { v: 'system', label: { th: 'ตามเครื่อง', en: 'System' } },
  ];
  protected readonly langs: { v: Lang; label: string }[] = [
    { v: 'th', label: 'ไทย' },
    { v: 'en', label: 'English' },
  ];
  protected readonly sizes: { v: TextSize; label: Tr }[] = [
    { v: 'normal', label: { th: 'ปกติ', en: 'Normal' } },
    { v: 'large', label: { th: 'ใหญ่', en: 'Large' } },
    { v: 'xlarge', label: { th: 'ใหญ่มาก', en: 'Extra large' } },
  ];
}
