import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OwnerApi, type TechnicianRequest } from '../../core/owner-api';
import { Session } from '../../core/session';
import { Toast } from '../../core/toast';
import { I18n } from '../../core/i18n';
import { screenUrl } from '../../screens/registry';
import { BoxPicker } from '../../shared/box-picker';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { bkkClock } from '../../core/time';

@Component({
  selector: 'app-owner-technician',
  imports: [RouterLink, Icon, PageHeader, BoxPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'ตั้งค่าตู้', en: 'Mailbox settings' })" [title]="i18n.t({ th: 'แจ้งช่าง', en: 'Request a technician' })" [back]="url('H13')" />
    <div class="stack page">
      @if (boxes().length > 1) {
        <app-box-picker [boxes]="boxes()" [value]="boxId()" (pick)="pickBox($event)" />
      }
      @if (loaded() && !failed() && !boxes().length) {
        <section class="card nobox" role="status">
          <strong>{{ i18n.t({ th: 'ยังไม่ได้ผูกตู้', en: 'No mailbox linked yet' }) }}</strong>
          <span class="muted small">{{ i18n.t({ th: 'โปรดผูกตู้ก่อน จึงจะตั้งค่าตู้ได้ — สแกน QR เปิดใช้ตู้ที่อยู่ด้านในตู้', en: 'Link your mailbox first to change its settings — scan the activation QR inside the box' }) }}</span>
          <a class="btn" [routerLink]="url('A07')" [queryParams]="{ from: 'H13' }">{{ i18n.t({ th: 'ผูกตู้', en: 'Link a mailbox' }) }}</a>
        </section>
      } @else {
      @if (activeRequest(); as request) {
        <span class="check"><app-icon name="check" [size]="30" /></span>
        <h1 class="center">{{ request.status === 'done' ? i18n.t({ th: 'ช่างแก้ไขแล้ว', en: 'Technician visit completed' }) : i18n.t({ th: 'ส่งคำขอแล้ว', en: 'Request sent' }) }}</h1>
        <p class="muted center">{{ request.status === 'open' ? i18n.t({ th: 'ทีมงานจะติดต่อกลับเพื่อนัดหมาย', en: 'The team will contact you to schedule a visit' }) : request.status === 'scheduled' ? i18n.t({ th: 'มีนัดหมายช่างแล้ว', en: 'A technician visit is scheduled' }) : i18n.t({ th: 'ปิดงานเรียบร้อย', en: 'The request is complete' }) }}</p>
        <div class="st" role="list" [attr.aria-label]="i18n.t({ th: 'สถานะคำขอ', en: 'Request status' })">
          <span role="listitem" [class.on]="request.status === 'open'">{{ i18n.t({ th: 'รอรับเรื่อง', en: 'Waiting' }) }}</span>
          <span role="listitem" [class.on]="request.status === 'scheduled'">{{ i18n.t({ th: 'นัดแล้ว', en: 'Scheduled' }) }}</span>
          <span role="listitem" [class.on]="request.status === 'done'">{{ i18n.t({ th: 'เสร็จ', en: 'Done' }) }}</span>
        </div>
        @if (request.scheduled_at) {
          <section class="card appt">
            <span class="chip ok">{{ i18n.t({ th: 'นัดแล้ว', en: 'Scheduled' }) }}</span>
            <strong class="when">{{ dateTime(request.scheduled_at) }}</strong>
          </section>
        }
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'เรื่อง', en: 'Subject' }) }}</dt><dd>{{ reasonLabel(request.reason) }}</dd>
            @if (request.note) { <dt>{{ i18n.t({ th: 'รายละเอียด', en: 'Details' }) }}</dt><dd>{{ request.note }}</dd> }
            <dt>{{ i18n.t({ th: 'ส่งเมื่อ', en: 'Sent' }) }}</dt><dd>{{ dateTime(request.created_at) }}</dd>
            @if (request.scheduled_at) { <dt>{{ i18n.t({ th: 'นัดหมาย', en: 'Appointment' }) }}</dt><dd>{{ dateTime(request.scheduled_at) }}</dd> }
            @if (request.admin_note) { <dt>{{ i18n.t({ th: 'ข้อความจากทีมงาน', en: 'Team note' }) }}</dt><dd>{{ request.admin_note }}</dd> }
            <dt>{{ i18n.t({ th: 'เบอร์ติดต่อกลับ', en: 'Call-back number' }) }}</dt><dd>{{ phone }}</dd>
            <dt class="adv-only">{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt><dd class="adv-only">{{ request.box_id }}</dd>
          </dl>
        </section>
        <section class="card easy-hide">
          <ol class="tl">
            <li class="done"><span class="d">✓</span><span><b>{{ i18n.t({ th: 'ส่งคำขอแล้ว', en: 'Request sent' }) }}</b><small>{{ exact(request.created_at) }}</small></span></li>
            <li [class.done]="request.status !== 'open'"><span class="d">{{ request.status !== 'open' ? '✓' : '2' }}</span><span><b>{{ i18n.t({ th: 'ทีมงานรับเรื่องแล้ว', en: 'The team took it' }) }}</b><small>{{ request.status !== 'open' ? i18n.t({ th: 'รับเรื่องแล้ว', en: 'Accepted' }) : i18n.t({ th: 'รอรับเรื่อง', en: 'Waiting' }) }}</small></span></li>
            <li [class.done]="request.status === 'scheduled' || request.status === 'done'"><span class="d">{{ request.status === 'scheduled' || request.status === 'done' ? '✓' : '3' }}</span><span><b>{{ i18n.t({ th: 'นัดหมาย', en: 'Appointment' }) }}</b><small>{{ request.scheduled_at ? dateTime(request.scheduled_at) : i18n.t({ th: 'ยังไม่มีนัด', en: 'No appointment yet' }) }}</small></span></li>
            <li [class.done]="request.status === 'done'"><span class="d">{{ request.status === 'done' ? '✓' : '4' }}</span><span><b>{{ i18n.t({ th: 'ช่างมาที่บ้าน', en: 'Technician visits' }) }}</b><small>{{ request.status === 'done' ? i18n.t({ th: 'เสร็จแล้ว', en: 'Done' }) : i18n.t({ th: 'จะแจ้งเมื่อช่างออกเดินทาง', en: 'We will tell you when they set off' }) }}</small></span></li>
            <li [class.done]="request.status === 'done'"><span class="d">{{ request.status === 'done' ? '✓' : '5' }}</span><span><b>{{ i18n.t({ th: 'เสร็จงาน', en: 'Work complete' }) }}</b><small>{{ request.status === 'done' ? i18n.t({ th: 'ปิดงานแล้ว', en: 'Closed' }) : i18n.t({ th: 'แล้วให้คุณยืนยันว่าใช้ได้ปกติ', en: 'Then you confirm it works' }) }}</small></span></li>
          </ol>
        </section>
      } @else {
        <p class="muted">{{ i18n.t({ th: 'ช่างจะนัดวันเวลามาตั้งค่าหรือซ่อมตู้ให้ ไม่มีค่าใช้จ่ายในช่วงทดลอง', en: 'A technician will book a time to set up or repair the box — free during the trial.' }) }}</p>
        <h2 class="section-title">{{ i18n.t({ th: 'ต้องการให้ช่างทำอะไร', en: 'What do you need?' }) }}</h2>
        <section class="card stack">
          @for (option of reasons; track option.value) {
            <label class="choice"><input type="radio" name="reason" [value]="option.value" [checked]="reason() === option.value" (change)="reason.set(option.value)" />{{ i18n.t(option.label) }}</label>
          }
          <label class="field">
            <span>{{ i18n.t({ th: 'รายละเอียดเพิ่มเติม (ถ้ามี)', en: 'Details (optional)' }) }}</span>
            <textarea maxlength="1000" rows="3" [value]="note()" (input)="setNote($event)"></textarea>
          </label>
        </section>
        @if (error()) { <p class="danger-text small" role="alert">{{ i18n.t({ th: 'โหลดหรือส่งคำขอไม่สำเร็จ อาจมีคำขอที่ยังเปิดอยู่แล้ว โหลดหน้าใหม่', en: 'Could not load or send the request. An open request may already exist; reload the page.' }) }}</p> }
        <button type="button" class="btn" [disabled]="sending() || !boxId()" (click)="submit()">
          {{ sending() ? i18n.t({ th: 'กำลังส่ง…', en: 'Sending…' }) : i18n.t({ th: 'ส่งคำขอ', en: 'Send request' }) }}
        </button>
        @if (lastDone(); as done) {
          <!-- งานครั้งก่อนอยู่ใต้ฟอร์ม: ไม่แย่งความสนใจ/UPS กับการส่งคำขอใหม่ -->
          <h2 class="section-title">{{ i18n.t({ th: 'งานครั้งก่อน', en: 'Previous request' }) }}</h2>
          <section class="card done-note" role="status">
            <span class="done-ic"><app-icon name="check" [size]="26" /></span>
            <div>
              <strong>{{ i18n.t({ th: 'ช่างทำเสร็จแล้ว', en: 'The technician has finished' }) }}</strong>
              <span class="muted small block">{{ done.scheduled_at ? i18n.t({ th: 'นัด ', en: 'Appointment ' }) + dateTime(done.scheduled_at) : i18n.t({ th: 'ส่งเมื่อ ', en: 'Sent ' }) + dateTime(done.created_at) }} · {{ reasonLabel(done.reason) }}</span>
              @if (done.admin_note) { <span class="small block">{{ done.admin_note }}</span> }
              <span class="muted small block">{{ i18n.t({ th: 'งานนี้ใช้ได้ปกติไหม?', en: 'Did this fix work?' }) }}</span>
              @if (done.owner_result === 'ok') {
                <span class="chip ok block">{{ i18n.t({ th: 'ยืนยันแล้วว่าใช้งานได้ปกติ', en: 'Confirmed working' }) }}</span>
              } @else {
                <div class="two confirm-row">
                  <button type="button" class="btn" [disabled]="confirming() === done.id" (click)="confirmDone(done.id, 'ok')">{{ i18n.t({ th: 'ใช้งานได้ปกติ', en: 'It works now' }) }}</button>
                  <button type="button" class="btn secondary" [disabled]="confirming() === done.id" (click)="confirmDone(done.id, 'still_broken')">{{ i18n.t({ th: 'ยังมีปัญหา', en: 'Still a problem' }) }}</button>
                </div>
              }
            </div>
          </section>
        }
      }
      }
      <a class="back-link" [routerLink]="url('H03')">{{ i18n.t({ th: 'กลับหน้าหลัก', en: 'Back to home' }) }}</a>
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
      inline-size: 64px;
      block-size: 64px;
      margin-block-start: 32px;
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
    .back-link {
      display: block;
      margin-block-start: 2px;
      padding: 12px;
      border-radius: 12px;
      text-align: center;
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--text-muted);
      text-decoration: none;
    }
    @media (hover: hover) {
      .back-link:hover {
        background: var(--icon-bg);
        color: var(--text);
      }
    }
    .field { display: flex; flex-direction: column; gap: 8px; }
    .field select, .field textarea { inline-size: 100%; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--text); background: var(--surface); font: inherit; }
    .choice { display: flex; align-items: center; gap: 12px; min-block-size: 48px; padding: 10px 12px; border-radius: 12px; font-weight: 600; cursor: pointer; }
    @media (hover: hover) {
      .choice:hover { background: var(--icon-bg); }
    }
    .choice:has(input:checked) { background: var(--brand-lighter); color: var(--brand-dark); font-weight: 700; }
    button:disabled { opacity: 0.6; }
    .st {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      span {
        font-size: 0.75rem;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--icon-bg);
        color: var(--text-muted);
      }
      .on {
        background: var(--action-bg);
        color: var(--action-fg);
        font-weight: 700;
      }
    }
    .appt {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border: 2px solid var(--brand);
      box-shadow: none;
      .when { font-size: 1.3125rem; }
    }
    .tl {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      li {
        display: flex;
        gap: 12px;
        position: relative;
        padding-block-end: 12px;
        color: var(--text-muted);
        &:last-child { padding-block-end: 0; }
        &::before {
          content: '';
          position: absolute;
          inset-inline-start: 11px;
          inset-block-start: 26px;
          inset-block-end: 0;
          inline-size: 2px;
          background: var(--line);
        }
        &:last-child::before { display: none; }
        &.done { color: var(--text); }
      }
      .d {
        display: grid;
        place-items: center;
        flex: none;
        inline-size: 24px;
        block-size: 24px;
        border-radius: 50%;
        background: var(--icon-bg);
        color: var(--text-muted);
        font-size: 0.75rem;
        font-weight: 700;
      }
      .done .d { background: var(--ok); color: var(--surface); }
      b, small { display: block; }
      small { color: var(--text-muted); font-size: 0.8125rem; }
    }
    .done-note {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .confirm-row {
      margin-block-start: 10px;
      inline-size: 100%;
    }
    .done-ic {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 46px;
      block-size: 46px;
      border-radius: 50%;
      background: var(--ok-bg);
      color: var(--ok);
    }
  `,
})
export class OwnerTechnician {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  /** เวลานัด/ส่งคำขอ — fix TZ ไทย + ภาษา ไม่พึ่ง locale ของเครื่อง */
  protected dateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok',
    });
  }
  private readonly api = inject(OwnerApi);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(Toast);
  protected readonly phone = inject(Session).me()?.phone ?? '';
  protected readonly boxes = signal<{ id: string; name: string; house_no: string }[]>([]);
  protected readonly boxId = signal('');
  protected readonly requests = signal<TechnicianRequest[]>([]);
  protected readonly reason = signal<TechnicianRequest['reason']>('wifi_change');
  protected readonly note = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal(false);
  protected readonly activeRequest = computed(() => this.requests().find((request) => request.status !== 'done') ?? null);
  /** คำขอล่าสุดที่ปิดงานแล้ว — แสดงสรุปเหนือฟอร์มเมื่อไม่มีคำขอเปิดอยู่ */
  protected readonly lastDone = computed(() => this.requests().find((request) => request.status === 'done') ?? null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly reasons = [
    { value: 'repair' as const, label: { th: 'ตู้ไม่ออนไลน์ / ต่อ Wi-Fi ไม่ได้', en: 'Mailbox offline / cannot connect to Wi-Fi' } },
    { value: 'wifi_change' as const, label: { th: 'ย้ายตู้ / เปลี่ยน Wi-Fi บ้าน', en: 'Move the box / change home Wi-Fi' } },
    { value: 'other' as const, label: { th: 'QR หน้าตู้เสีย กล้องหรือเสียงปี๊บผิดปกติ หรือเรื่องอื่น', en: 'Damaged QR, camera or beeper problem, or something else' } },
  ];

  /** โหลดรายการตู้เสร็จแล้ว — ยังไม่มีตู้ = แจ้งช่างไม่ได้ ให้ผูกตู้ก่อน */
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    void this.api.boxes().then((boxes) => {
      this.boxes.set(boxes);
      this.loaded.set(true);
      const wanted = this.route.snapshot.queryParamMap.get('box');
      const first = boxes.find((b) => b.id === wanted) ?? boxes[0];
      if (first) { this.boxId.set(first.id); void this.loadRequests(first.id); }
    }).catch(() => { this.error.set(true); this.failed.set(true); });
  }

  protected reasonLabel(reason: TechnicianRequest['reason']): string {
    const choice = this.reasons.find((option) => option.value === reason);
    return choice ? this.i18n.t(choice.label) : reason;
  }

  protected exact(iso: string): string {
    return bkkClock(iso);
  }

  protected pickBox(id: string): void {
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

  /** ยืนยันผลงานช่าง: ok = จบงาน · still_broken = เปิดคำขอเดิมใหม่ */
  protected async confirmDone(id: string, result: 'ok' | 'still_broken'): Promise<void> {
    const boxId = this.boxId();
    if (!boxId || this.confirming()) return;
    this.confirming.set(id);
    try {
      await this.api.confirmTechnician(boxId, id, result);
      await this.loadRequests(boxId);
      this.toast.show(
        result === 'ok'
          ? { th: 'ยืนยันแล้ว ขอบคุณครับ', en: 'Confirmed — thank you' }
          : { th: 'แจ้งแล้ว ทีมงานจะติดต่อกลับ', en: 'Reported — the team will contact you' },
      );
    } catch {
      this.toast.show({ th: 'ยืนยันไม่สำเร็จ ลองอีกครั้ง', en: 'Could not confirm — try again' });
    } finally {
      this.confirming.set(null);
    }
  }
}

// ── H13-d · การแสดงผล ─────────────────────────────────────────
