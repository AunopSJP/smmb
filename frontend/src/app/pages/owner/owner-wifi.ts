import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OwnerApi, type BoxDetail } from '../../core/owner-api';
import { Toast } from '../../core/toast';
import { DisplaySettings } from '../../core/display-settings';
import { I18n, type Tr } from '../../core/i18n';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';
import { EmptyState, LoadingRows } from '../../shared/state-view';
import { bkkClock } from '../../core/time';

@Component({
  selector: 'app-owner-wifi',
  imports: [RouterLink, PageHeader, EmptyState, LoadingRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="box() ? i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + (box()!.house_no ?? '') + (display.advancedMode() ? ' · ' + box()!.id + ' · ' + box()!.name : multi() ? ' · ' + box()!.name : '') : i18n.t({ th: 'ตั้งค่า', en: 'Settings' })" [title]="i18n.t({ th: 'เปลี่ยน Wi-Fi บ้าน', en: 'Change home Wi-Fi' })" [back]="url('H13')" />
    <div class="stack grow">
      @if (!loaded()) {
        <app-loading-rows [rows]="2" [label]="i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' })" />
      } @else if (loadFailed()) {
        <app-empty-state kind="error" (retry)="retry()" />
      } @else if (!box()) {
        <app-empty-state [title]="i18n.t({ th: 'ยังไม่มีตู้ที่ผูกกับบัญชีนี้', en: 'No mailbox is linked to this account yet' })" [hint]="i18n.t({ th: 'ผูกตู้ก่อน แล้วจึงเปลี่ยน Wi-Fi ได้', en: 'Link a mailbox first, then you can change its Wi-Fi' })">
          <a class="btn" [routerLink]="url('A07')" [queryParams]="{ from: 'H13' }">{{ i18n.t({ th: 'ผูกตู้', en: 'Link a mailbox' }) }}</a>
        </app-empty-state>
      } @else {
        @let w = box()!.wifi_reset;
        @let boxOffline = box()!.status === 'offline';
        @if (boxOffline && (w.status === 'idle' || w.status === 'pending')) {
          <div class="card status warn">
            <strong>{{ i18n.t({ th: 'ตอนนี้ตู้ไม่ออนไลน์ — คำสั่งยังไปไม่ถึงตู้', en: 'The mailbox is offline — it cannot get the command yet' }) }}</strong>
            <small>{{ i18n.t({ th: 'ตู้จะรับคำสั่งเมื่อกลับมาออนไลน์ (ค้างไว้ได้สูงสุด 24 ชม.) ลองตรวจไฟของตู้ แผงโซลาร์ และ Wi-Fi เดิมก่อน ถ้าตู้เปิดอยู่แต่ต่อ Wi-Fi เดิมไม่ได้ ให้แจ้งช่างแทน', en: 'It will get the command once it is back online (kept for up to 24 h). Check the box power, the solar panel and the old Wi-Fi first. If it is powered but cannot join the old Wi-Fi, ask a technician instead.' }) }}</small>
          </div>
        }
        @if (w.status === 'pending') {
          <div class="card status">
            <strong>{{ i18n.t({ th: 'รอตู้รับคำสั่ง…', en: 'Waiting for the mailbox…' }) }}</strong>
            <small>{{ i18n.t({ th: 'ตู้ที่ออนไลน์จะรับคำสั่งภายในไม่กี่วินาที ถ้าตู้หลับอยู่จะรับตอนตื่นรอบถัดไป (สูงสุด 24 ชม.)', en: 'An online mailbox picks this up within seconds. A sleeping one gets it when it next wakes (up to 24 h).' }) }}</small>
          </div>
        } @else if (w.status === 'done') {
          <div class="card status ok">
            <strong>{{ i18n.t({ th: 'ตู้เข้าโหมดตั้ง Wi-Fi แล้ว', en: 'The mailbox is in setup mode' }) }}</strong>
            <small>{{ i18n.t({ th: 'ทำตามขั้นตอนด้านล่าง ตั้งเสร็จแล้วตู้จะกลับมาออนไลน์เอง — ดูสถานะที่หน้าหลัก', en: 'Follow the steps below. Once it is set the mailbox comes back online by itself — check the status on Home.' }) }}</small>
          </div>
        } @else if (w.status === 'expired') {
          <div class="card status warn">
            <strong>{{ i18n.t({ th: 'ตู้ไม่ได้รับคำสั่ง (เกิน 24 ชม.)', en: 'The mailbox never received the command (over 24 h)' }) }}</strong>
            <small>{{ i18n.t({ th: 'ตรวจสอบว่าตู้เปิดอยู่และมีสัญญาณ แล้วสั่งใหม่ หรือแจ้งช่าง', en: 'Check it is powered and has signal, then try again — or ask a technician.' }) }}</small>
          </div>
        }

        @if (display.advancedMode()) {
          <section class="card">
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'สถานะคำสั่ง', en: 'Command state' }) }}</dt><dd class="mono">{{ w.status }}</dd>
              <dt>{{ i18n.t({ th: 'ชื่อ AP', en: 'AP name' }) }}</dt><dd class="mono">{{ w.ap_name }}</dd>
              <dt>{{ i18n.t({ th: 'สั่งเมื่อ', en: 'Requested' }) }}</dt><dd class="mono">{{ w.requested_at ? exact(w.requested_at) : '—' }}</dd>
              <dt>{{ i18n.t({ th: 'ตู้รับคำสั่ง', en: 'Received' }) }}</dt><dd class="mono">{{ w.done_at ? exact(w.done_at) : '—' }}</dd>
            </dl>
          </section>
        }

        @if (w.status === 'done' || (w.status === 'pending' && !boxOffline)) {
          <!-- OwnWifi_E: 3 ขั้นสั้น -->
          <ol class="card steps easy-only easy-steps">
            <li><span class="num">1</span><span><strong>{{ i18n.t({ th: 'ต่อมือถือกับ Wi-Fi', en: 'Join Wi-Fi on your phone' }) }}</strong><small class="mono">{{ w.ap_name }}</small></span></li>
            <li><span class="num">2</span><span><strong>{{ i18n.t({ th: 'เปิดเว็บ', en: 'Open the page' }) }}</strong><small class="mono">192.168.4.1</small></span></li>
            <li><span class="num">3</span><span><strong>{{ i18n.t({ th: 'เลือก Wi-Fi บ้าน ใส่รหัส', en: 'Pick home Wi-Fi and enter the password' }) }}</strong></span></li>
          </ol>
          <ol class="card steps easy-hide">
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
        } @else if (w.status !== 'pending') {
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
          <a class="btn secondary" [routerLink]="url('H13-c')" [queryParams]="box() ? { box: box()!.id } : null">{{ i18n.t({ th: 'แจ้งช่างแทน', en: 'Ask a technician instead' }) }}</a>
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
        border-color: var(--brand-text);
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
      inline-size: 28px;
      block-size: 28px;
      border-radius: 50%;
      background: var(--action-bg);
      color: var(--action-fg);
      font-size: 0.8125rem;
      font-weight: 700;
    }
    .easy-steps {
      gap: 18px;
      .num {
        inline-size: 48px;
        block-size: 48px;
        font-size: 1.5rem;
      }
      strong {
        font-size: 1.125rem;
      }
    }
    .actions {
      margin-block-start: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  `,
})
export class OwnerWifi {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(OwnerApi);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(Toast);
  protected readonly box = signal<BoxDetail | null>(null);
  protected readonly loaded = signal(false);
  /** เจ้าของมีหลายตู้ — หัวหน้าต้องบอกชื่อตู้ (บ้านเลขที่อาจซ้ำกัน) */
  protected readonly multi = signal(false);
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
    void this.load();
  }

  protected readonly loadFailed = signal(false);

  protected retry(): void {
    this.loaded.set(false);
    void this.load();
  }

  private async load(): Promise<void> {
    const boxes = await this.api.boxes().catch(() => null);
    this.loadFailed.set(boxes === null);
    if (boxes === null) {
      this.loaded.set(true);
      return;
    }
    this.multi.set(boxes.length > 1);
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

  /** เวลาแบบมีวินาที (โหมดละเอียด) */
  protected exact(iso: string): string {
    return bkkClock(iso);
  }

  protected steps(apName: string): { title: Tr; sub: Tr }[] {
    return [
      { title: { th: 'ตู้ตัด Wi-Fi เดิมแล้ว', en: 'The mailbox dropped the old Wi-Fi' }, sub: { th: 'จะได้ยินเสียงปี๊บสั้น ๆ 3 ครั้ง', en: 'You will hear three short beeps' } },
      { title: { th: `มือถือต่อ Wi-Fi ชื่อ ${apName}`, en: `Join Wi-Fi “${apName}”` }, sub: { th: 'อยู่ใกล้ตู้ · ไม่มีรหัสผ่าน', en: 'Stay near the box · no password' } },
      { title: { th: 'เปิดเว็บ 192.168.4.1', en: 'Open 192.168.4.1' }, sub: { th: 'ถ้าหน้าตั้งค่าไม่เปิดขึ้นเอง', en: 'If the setup page does not pop up' } },
      { title: { th: 'เลือก Wi-Fi บ้าน (2.4 GHz) + ใส่รหัส', en: 'Pick home Wi-Fi (2.4 GHz) + password' }, sub: { th: 'ต้องทำภายใน 10 นาที หากไม่ทัน ตู้จะกลับไปใช้ Wi-Fi เดิม', en: 'Within 10 minutes, or it returns to the old Wi-Fi' } },
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
      this.toast.show({ th: 'สั่งไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not send the command — check your connection and try again' });
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
      this.toast.show({ th: 'ยกเลิกไม่สำเร็จ — รีเฟรชหน้าเพื่อดูสถานะล่าสุด', en: 'Could not cancel — refresh to see the latest status' });
    } finally {
      this.busy.set(false);
    }
  }
}

// ── H13-c · แจ้งช่างแล้ว ──────────────────────────────────────
