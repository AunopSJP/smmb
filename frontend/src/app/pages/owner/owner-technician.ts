import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiError } from '../../core/api';
import { OwnerApi, type TechnicianRequest } from '../../core/owner-api';
import { Session } from '../../core/session';
import { Toast } from '../../core/toast';
import { I18n } from '../../core/i18n';
import { screenUrl } from '../../screens/registry';
import { BoxPicker } from '../../shared/box-picker';
import { Confirm } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { bkkClock, fmtWhen } from '../../core/time';

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
        @if (request.status !== 'done') {
          <button type="button" class="btn secondary" [disabled]="cancelling()" (click)="cancel(request)">
            {{ cancelling() ? i18n.t({ th: 'กำลังยกเลิก…', en: 'Cancelling…' }) : i18n.t({ th: 'ยกเลิกคำขอช่าง', en: 'Cancel this request' }) }}
          </button>
        }
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
              <!-- C7: แยก "นัด …" กับ "สาเหตุ" คนละบรรทัด ไม่ติดกันเป็นพืด -->
              <span class="muted small block">{{ done.scheduled_at ? i18n.t({ th: 'นัด ', en: 'Appointment ' }) + dateTime(done.scheduled_at) : i18n.t({ th: 'ส่งเมื่อ ', en: 'Sent ' }) + dateTime(done.created_at) }}</span>
              <span class="muted small block">{{ reasonLabel(done.reason) }}</span>
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
      font-size: var(--fs-lg);
    }
    .center {
      text-align: center;
    }
    .back-link {
      display: block;
      margin-block-start: 2px;
      padding: 12px;
      border-radius: var(--radius-sm);
      text-align: center;
      font-size: var(--fs-base);
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
    .choice { display: flex; align-items: center; gap: 12px; min-block-size: 48px; padding: 10px 12px; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer; }
    @media (hover: hover) {
      .choice:hover { background: var(--icon-bg); }
    }
    .choice:has(input:checked) { background: var(--brand-lighter); color: var(--brand-dark); font-weight: var(--fw-strong); }
    button:disabled { opacity: 0.6; }
    .st {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      span {
        font-size: var(--fs-xs);
        padding: 3px 10px;
        border-radius: var(--radius-lg);
        background: var(--icon-bg);
        color: var(--text-muted);
      }
      .on {
        background: var(--action-bg);
        color: var(--action-fg);
        font-weight: var(--fw-strong);
      }
    }
    .appt {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border: 2px solid var(--brand);
      box-shadow: none;
      .when { font-size: var(--fs-lg); }
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
        font-size: var(--fs-xs);
        font-weight: var(--fw-strong);
      }
      .done .d { background: var(--ok); color: var(--surface); }
      b, small { display: block; }
      small { color: var(--text-muted); font-size: var(--fs-sm); }
    }
    .done-note {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .done-note > div {
      flex: 1;
      min-inline-size: 0;
    }
    /* แต่ละข้อความขึ้นบรรทัดใหม่ — เดิมไม่มีกฎนี้ในไฟล์นี้ ข้อความเลยต่อกันเป็นพืด */
    .block {
      display: block;
      margin-block-start: 4px;
    }
    .chip.block {
      inline-size: fit-content;
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
  /** เวลานัด/ส่งคำขอ — ใช้รูปแบบกลาง A8 (วันนี้/เมื่อวาน/วันที่ + 24 ชม.) */
  protected dateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    return fmtWhen(iso, this.i18n.lang());
  }

  private readonly api = inject(OwnerApi);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(Confirm);
  protected readonly phone = inject(Session).me()?.phone ?? '';
  protected readonly boxes = signal<{ id: string; name: string; house_no: string }[]>([]);
  protected readonly boxId = signal('');
  protected readonly requests = signal<TechnicianRequest[]>([]);
  protected readonly reason = signal<TechnicianRequest['reason']>('wifi_change');
  protected readonly note = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal(false);
  protected readonly activeRequest = computed(() => this.requests().find((request) => request.status === 'open' || request.status === 'scheduled') ?? null);
  /** คำขอล่าสุดที่ปิดงานแล้ว — แสดงสรุปเหนือฟอร์มเมื่อไม่มีคำขอเปิดอยู่ */
  protected readonly lastDone = computed(() => {
    const done = this.requests().find((request) => request.status === 'done') ?? null;
    // เพิ่งยกเลิกคำขอที่ใหม่กว่า → ไม่ย้อนไปชวนยืนยันงานเก่า (ยกเว้นงานที่เคยเปิดใหม่เพราะ "ยังมีปัญหา")
    return this.requests()[0]?.status === 'cancelled' && done?.owner_result !== 'still_broken' ? null : done;
  });
  protected readonly confirming = signal<string | null>(null);
  protected readonly cancelling = signal(false);
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

  /** ยกเลิกคำขอที่ยังไม่ปิด — ถามยืนยันก่อน */
  protected async cancel(request: TechnicianRequest): Promise<void> {
    const boxId = this.boxId();
    if (!boxId || this.cancelling()) return;
    const at = request.scheduled_at;
    const ok = await this.confirm.ask({
      title: { th: 'ยกเลิกคำขอช่าง?', en: 'Cancel this technician request?' },
      body: at
        ? {
            th: `นัด ${fmtWhen(at, 'th')} จะถูกยกเลิก และทีมงานจะได้รับแจ้ง · ส่งคำขอใหม่ได้ภายหลัง`,
            en: `The visit (${fmtWhen(at, 'en')}) will be cancelled and the team will be told. You can send a new request later.`,
          }
        : { th: 'ทีมงานจะได้รับแจ้งว่าคุณยกเลิก · ส่งคำขอใหม่ได้ภายหลัง', en: 'The team will be told. You can send a new request later.' },
      confirm: { th: 'ยกเลิกคำขอ', en: 'Cancel request' },
      cancel: { th: 'ไม่ยกเลิก', en: 'Keep it' },
      danger: true,
    });
    if (!ok) return;
    this.cancelling.set(true);
    try {
      await this.api.cancelTechnician(boxId, request.id);
      await this.loadRequests(boxId);
      this.toast.show({ th: 'ยกเลิกคำขอช่างแล้ว', en: 'Technician request cancelled' });
    } catch (err) {
      if (apiError(err).code === 'TECHNICIAN_REQUEST_CLOSED') {
        await this.loadRequests(boxId);
        this.toast.show({ th: 'คำขอนี้ปิดไปแล้ว ยกเลิกไม่ได้', en: 'This request is already closed' });
      } else {
        this.toast.show({ th: 'ยกเลิกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not cancel — check your connection and try again' });
      }
    } finally {
      this.cancelling.set(false);
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
    } catch (err) {
      if (apiError(err).code === 'TECHNICIAN_REQUEST_ALREADY_OPEN') {
        await this.loadRequests(boxId);
        this.toast.show({ th: 'มีคำขอช่างที่ยังเปิดอยู่แล้ว', en: 'You already have an open technician request' });
      } else {
        this.toast.show({ th: 'ยืนยันไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not confirm — check your connection and try again' });
      }
    } finally {
      this.confirming.set(null);
    }
  }
}

// ── H13-d · การแสดงผล ─────────────────────────────────────────
