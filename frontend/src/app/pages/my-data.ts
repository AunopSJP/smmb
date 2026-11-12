import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../core/i18n';
import { MyDataApi, type MySession } from '../core/my-data-api';
import {
  blockerText,
  canContinueFromPreview,
  canSubmitDelete,
  confirmPhrase,
  countLabel,
  myDataErrorText,
  RETAINED_NOTE,
  retainedLabel,
  type DeletePreview,
  type DeleteStep,
} from '../core/my-data-rules';
import { Session } from '../core/session';
import { Toast, ToastHost } from '../core/toast';
import { screenUrl } from '../screens/registry';
import { Confirm, ConfirmDialog } from '../shared/confirm-dialog';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';
import { EmptyState, LoadingRows } from '../shared/state-view';

/**
 * ข้อมูลของฉัน (/settings/my-data · ทุกบทบาท) — เครื่องที่ล็อกอิน · ส่งออกข้อมูล · ลบบัญชี 3 ขั้น
 * ใช้ API ตามข้อเสนอ F-002 (ยังไม่มีใน backend → ตอบ 404 = หน้านี้ขึ้น "ยังไม่เปิดให้ใช้" และลิงก์เมนูถูกซ่อน · ไม่มีข้อมูลปลอม)
 */
@Component({
  selector: 'app-my-data',
  imports: [RouterLink, PageHeader, Icon, EmptyState, LoadingRows, ConfirmDialog, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t(roleLabel())" [title]="i18n.t({ th: 'ข้อมูลของฉัน', en: 'My data' })" [back]="back()" />

    <div class="stack grow">
      @if (api.availability() === 'no') {
        <app-empty-state
          [title]="i18n.t({ th: 'ฟีเจอร์นี้ยังไม่เปิดให้ใช้', en: 'This feature isn’t available yet' })"
          [hint]="i18n.t({ th: 'การดูเครื่องที่ล็อกอิน ส่งออกข้อมูล และลบบัญชีกำลังเตรียมไว้ — ระหว่างนี้หากต้องการลบหรือขอข้อมูล ให้ติดต่อผู้ดูแลระบบ', en: 'Signed-in devices, data export and account deletion are being prepared — until then, contact the admin to delete your account or get your data' })"
        />

      } @else if (api.availability() === 'unknown') {
        @if (checking()) {
          <app-loading-rows [rows]="3" [label]="i18n.t({ th: 'กำลังตรวจ…', en: 'Checking…' })" />
        } @else {
          <app-empty-state kind="error" (retry)="check()" />
        }
      } @else {
        <!-- 1) เครื่องที่ล็อกอิน -->
        <section class="card stack">
          <h2 class="head"><app-icon name="shield" [size]="20" />{{ i18n.t({ th: 'เครื่องที่ล็อกอินอยู่', en: 'Signed-in devices' }) }}</h2>
          <p class="muted small easy-hide">{{ i18n.t({ th: 'เห็นเครื่องที่ไม่ใช่ของคุณ? กด “ออกจากเครื่องนั้น” แล้วเปลี่ยนรหัสผ่านทันที', en: 'See a device that isn’t yours? Sign it out, then change your password right away.' }) }}</p>
          @if (sessionsFailed()) {
            <app-empty-state kind="error" compact (retry)="loadSessions()" />
          } @else if (sessions() === null) {
            <app-loading-rows [rows]="2" [label]="i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' })" />
          } @else {
            <div class="devices">
              @for (s of sessions(); track s.id) {
                <div class="device">
                  <span class="grow">
                    <strong>{{ s.device_label || i18n.t({ th: 'ไม่ทราบเครื่อง', en: 'Unknown device' }) }}</strong>
                    <span class="muted small block">{{ i18n.t({ th: 'ใช้ล่าสุด ', en: 'Last used ' }) }}{{ when(s.last_used_at) }}</span>
                    <span class="muted small block adv-only">{{ i18n.t({ th: 'เข้าสู่ระบบ ', en: 'Signed in ' }) }}{{ when(s.created_at) }}@if (s.ip_hint) { · {{ s.ip_hint }} }</span>
                  </span>
                  @if (s.current) {
                    <span class="chip ok">{{ i18n.t({ th: 'เครื่องนี้', en: 'This device' }) }}</span>
                  } @else {
                    <button type="button" class="btn secondary sm" [disabled]="busy()" (click)="revoke(s)">{{ i18n.t({ th: 'ออกจากเครื่องนั้น', en: 'Sign it out' }) }}</button>
                  }
                </div>
              } @empty {
                <app-empty-state compact [title]="i18n.t({ th: 'ยังไม่มีข้อมูลเครื่อง', en: 'No devices listed yet' })" />
              }
            </div>
            @if (others() > 0) {
              <button type="button" class="btn secondary" [disabled]="busy()" (click)="revokeOthers()">{{ i18n.t({ th: 'ออกจากทุกเครื่องอื่น', en: 'Sign out all other devices' }) }}</button>
            }
          }
        </section>

        <!-- 2) ส่งออกข้อมูล -->
        <section class="card stack">
          <h2 class="head"><app-icon name="list" [size]="20" />{{ i18n.t({ th: 'ส่งออกข้อมูลของฉัน', en: 'Export my data' }) }}</h2>
          <p class="muted small">{{ i18n.t({ th: 'ได้ไฟล์ข้อมูลของบัญชีนี้เท่านั้น (โปรไฟล์ บทบาท ตู้ที่ผูก ประวัติที่เกี่ยวกับคุณ การแจ้งเตือน) ไม่รวมข้อมูลของคนอื่น', en: 'A file with this account’s data only (profile, roles, linked mailboxes, your history, notifications) — never anyone else’s' }) }}</p>
          <button type="button" class="btn secondary" [disabled]="busy()" (click)="exportData()">{{ i18n.t({ th: 'ส่งออกข้อมูล', en: 'Export data' }) }}</button>
          @if (exportLink(); as link) {
            <p class="info-box small" role="status">
              {{ i18n.t({ th: 'พร้อมแล้ว — ลิงก์ใช้ได้ครั้งเดียว ', en: 'Ready — one-time link ' }) }}
              <a class="link" [href]="link" target="_blank" rel="noopener">{{ i18n.t({ th: 'ดาวน์โหลด', en: 'Download' }) }}</a>
            </p>
          }
          @if (exportError(); as e) {
            <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
          }
        </section>

        <!-- 3) ลบบัญชี 3 ขั้น -->
        <section class="card stack danger-zone">
          <h2 class="head"><app-icon name="alert" [size]="20" />{{ i18n.t({ th: 'ลบบัญชีของฉัน', en: 'Delete my account' }) }}</h2>

          @switch (step()) {
            @case ('preview') {
              <p class="muted small">{{ i18n.t({ th: 'ขั้น 1 จาก 3 · ดูก่อนว่าอะไรจะถูกลบ — ลบแล้วกู้คืนไม่ได้', en: 'Step 1 of 3 · see what will be deleted — it can’t be undone' }) }}</p>
              @if (previewFailed()) {
                <app-empty-state kind="error" compact (retry)="loadPreview()" />
              } @else if (preview(); as p) {
                @if (p.blockers.length) {
                  <div class="info-box" role="alert">
                    <strong class="warn-text">{{ i18n.t({ th: 'ตอนนี้ลบไม่ได้', en: 'Can’t delete right now' }) }}</strong>
                    <ul class="plain">
                      @for (b of p.blockers; track b.code) {
                        <li>{{ i18n.t(blockerText(b.code)) }}<span class="adv-only mono"> · {{ b.code }}</span></li>
                      }
                    </ul>
                  </div>
                } @else {
                  <p class="small"><strong>{{ i18n.t({ th: 'จะถูกลบ', en: 'Will be deleted' }) }}</strong></p>
                  <ul class="plain">
                    @for (c of countEntries(p); track c.key) {
                      <li>{{ i18n.t(c.label) }}: <strong>{{ c.n }}</strong></li>
                    } @empty {
                      <li class="muted">{{ i18n.t({ th: 'ข้อมูลบัญชีและโปรไฟล์ของคุณ', en: 'Your account and profile data' }) }}</li>
                    }
                  </ul>
                }
                @if (p.retained.length) {
                  <div class="info-box small">
                    <strong>{{ i18n.t({ th: 'สิ่งที่จะไม่ถูกลบ', en: 'What will NOT be deleted' }) }}</strong>
                    <p>{{ i18n.t(retainedNote) }}</p>
                    <ul class="plain">
                      @for (r of p.retained; track r.kind) {
                        <li>{{ i18n.t(retainedLabel(r.kind)) }}</li>
                      }
                    </ul>
                  </div>
                }
                <button type="button" class="btn danger" [disabled]="!canContinue()" (click)="step.set('confirm')">{{ i18n.t({ th: 'ไปขั้นยืนยัน', en: 'Continue to confirm' }) }}</button>
              } @else {
                <app-loading-rows [rows]="2" [label]="i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' })" />
              }
            }
            @case ('confirm') {
              <p class="muted small">{{ i18n.t({ th: 'ขั้น 2 จาก 3 · ยืนยันตัวตน', en: 'Step 2 of 3 · confirm it’s you' }) }}</p>
              <label class="field">
                <span>{{ i18n.t({ th: 'พิมพ์คำว่า', en: 'Type the word' }) }} <strong class="mono">{{ phrase() }}</strong> {{ i18n.t({ th: 'เพื่อยืนยัน', en: 'to confirm' }) }}</span>
                <input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" [value]="typed()" (input)="typed.set($any($event.target).value)" />
              </label>
              <label class="field">
                <span>{{ i18n.t({ th: 'รหัสผ่านปัจจุบัน', en: 'Current password' }) }}</span>
                <input type="password" autocomplete="current-password" [value]="password()" (input)="password.set($any($event.target).value)" />
              </label>
              @if (deleteError(); as e) {
                <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
              }
              <div class="two">
                <button type="button" class="btn secondary" [disabled]="busy()" (click)="backToPreview()">{{ i18n.t({ th: 'ย้อนกลับ', en: 'Back' }) }}</button>
                <button type="button" class="btn danger" [disabled]="!canDelete()" (click)="deleteAccount()">{{ busy() ? i18n.t({ th: 'กำลังลบ…', en: 'Deleting…' }) : i18n.t({ th: 'ลบบัญชีถาวร', en: 'Delete permanently' }) }}</button>
              </div>
            }
            @case ('result') {
              <p class="muted small">{{ i18n.t({ th: 'ขั้น 3 จาก 3 · เสร็จแล้ว', en: 'Step 3 of 3 · done' }) }}</p>
              <div class="info-box" role="status">
                <strong>{{ i18n.t({ th: 'ลบบัญชีแล้ว', en: 'Account deleted' }) }}</strong>
                <p class="small">{{ i18n.t({ th: 'ออกจากระบบทุกเครื่องแล้ว · ข้อมูลที่ระบบต้องเก็บเป็นหลักฐานยังคงอยู่ตามที่แจ้งไว้', en: 'You were signed out everywhere · records the system must keep remain, as listed' }) }}</p>
              </div>
              <button type="button" class="btn" (click)="finish()">{{ i18n.t({ th: 'ไปหน้าเข้าสู่ระบบ', en: 'Go to sign-in' }) }}</button>
            }
          }
        </section>
      }
      <a class="btn secondary push-end" [routerLink]="back()">{{ i18n.t({ th: 'กลับไปหน้าตั้งค่า', en: 'Back to settings' }) }}</a>
    </div>
    <!-- หน้านี้อยู่นอก AreaShell จึงต้องมีกล่องยืนยันและ toast ของตัวเอง -->
    <app-confirm-dialog />
    <app-toast />
  `,
  styles: `
    :host {
      display: block;
      padding: 16px 16px calc(20px + env(safe-area-inset-bottom));
      max-inline-size: 720px;
      margin-inline: auto;
    }
    .grow { flex: 1; min-inline-size: 0; }
    .head { display: flex; align-items: center; gap: 8px; font-size: 1rem; }
    .block { display: block; }
    .device { display: flex; align-items: center; gap: 12px; padding-block: 8px; flex-wrap: wrap; }
    .device + .device { border-block-start: 1px solid var(--line); }
    .device .grow { min-inline-size: 12ch; }
    .sm { inline-size: auto; }
    .plain { margin: 4px 0 0; padding-inline-start: 20px; display: grid; gap: 4px; }
    .danger-zone { border: 1px solid var(--line-strong, var(--line)); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .push-end { margin-block-start: auto; }
  `,
})
export class MyData {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(MyDataApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  private readonly confirmDialog = inject(Confirm);

  protected readonly blockerText = blockerText;
  protected readonly retainedLabel = retainedLabel;
  protected readonly retainedNote = RETAINED_NOTE;

  protected readonly checking = signal(true);
  protected readonly busy = signal(false);
  protected readonly sessions = signal<MySession[] | null>(null);
  protected readonly sessionsFailed = signal(false);
  protected readonly others = computed(() => (this.sessions() ?? []).filter((s) => !s.current).length);
  protected readonly exportLink = signal<string | null>(null);
  protected readonly exportError = signal<Tr | null>(null);

  protected readonly step = signal<DeleteStep>('preview');
  protected readonly preview = signal<DeletePreview | null>(null);
  protected readonly previewFailed = signal(false);
  protected readonly typed = signal('');
  protected readonly password = signal('');
  protected readonly deleteError = signal<Tr | null>(null);
  protected readonly phrase = computed(() => confirmPhrase(this.i18n.lang()));
  protected readonly canContinue = computed(() => canContinueFromPreview(this.preview()));
  protected readonly canDelete = computed(() =>
    canSubmitDelete({ typed: this.typed(), password: this.password(), lang: this.i18n.lang(), blockers: this.preview()?.blockers ?? [], busy: this.busy() }),
  );

  protected readonly role = computed<'owner' | 'officer' | 'head' | 'admin'>(() => {
    const roles = this.session.me()?.roles ?? [];
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('head')) return 'head';
    if (roles.includes('officer')) return 'officer';
    return 'owner';
  });
  protected readonly roleLabel = computed<Tr>(() => {
    switch (this.role()) {
      case 'admin':
        return { th: 'ผู้ดูแลระบบ', en: 'Administrator' };
      case 'head':
        return { th: 'หัวหน้าหน่วยงาน', en: 'Agency head' };
      case 'officer':
        return { th: 'เจ้าหน้าที่', en: 'Officer' };
      default:
        return { th: 'เจ้าของบ้าน', en: 'Homeowner' };
    }
  });
  protected readonly back = computed(() => screenUrl(this.role() === 'admin' ? 'D16' : this.role() === 'head' ? 'L11' : this.role() === 'officer' ? 'O13' : 'H13'));

  constructor() {
    void this.check();
  }

  protected async check(): Promise<void> {
    this.checking.set(true);
    await this.api.probe();
    this.checking.set(false);
    if (this.api.availability() === 'yes') {
      void this.loadSessions();
      void this.loadPreview();
    }
  }

  protected async loadSessions(): Promise<void> {
    this.sessionsFailed.set(false);
    try {
      this.sessions.set(await this.api.sessions());
    } catch {
      this.sessionsFailed.set(true);
    }
  }

  protected async loadPreview(): Promise<void> {
    this.previewFailed.set(false);
    try {
      this.preview.set(await this.api.deletePreview());
    } catch {
      this.previewFailed.set(true);
    }
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  }

  protected countEntries(p: DeletePreview): { key: string; label: Tr; n: number }[] {
    return Object.entries(p.counts)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => ({ key, label: countLabel(key), n }));
  }

  private fail(err: unknown): Tr {
    const e = this.api.errorOf(err);
    return myDataErrorText(e.code, e.status);
  }

  protected async revoke(s: MySession): Promise<void> {
    const ok = await this.confirmDialog.ask({
      title: { th: `ออกจากเครื่อง “${s.device_label || 'ไม่ทราบเครื่อง'}” ใช่ไหม?`, en: `Sign out “${s.device_label || 'Unknown device'}”?` },
      body: { th: 'เครื่องนั้นจะต้องเข้าสู่ระบบใหม่', en: 'That device will have to sign in again.' },
      confirm: { th: 'ออกจากเครื่องนั้น', en: 'Sign it out' },
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.revoke(s.id);
      this.toast.show({ th: 'ออกจากเครื่องนั้นแล้ว', en: 'Device signed out' });
      await this.loadSessions();
    } catch (err) {
      this.toast.show(this.fail(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async revokeOthers(): Promise<void> {
    const ok = await this.confirmDialog.ask({
      title: { th: 'ออกจากทุกเครื่องอื่นใช่ไหม?', en: 'Sign out all other devices?' },
      body: { th: 'เครื่องนี้ยังใช้งานต่อได้ ส่วนเครื่องอื่นต้องเข้าสู่ระบบใหม่', en: 'This device stays signed in; the others must sign in again.' },
      confirm: { th: 'ออกจากทุกเครื่องอื่น', en: 'Sign them out' },
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await this.api.revokeOthers();
      this.toast.show({ th: `ออกจากระบบ ${r.revoked} เครื่องแล้ว`, en: `Signed out ${r.revoked} device(s)` });
      await this.loadSessions();
    } catch (err) {
      this.toast.show(this.fail(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async exportData(): Promise<void> {
    this.exportLink.set(null);
    this.exportError.set(null);
    this.busy.set(true);
    try {
      const r = await this.api.exportData();
      if ('url' in r) {
        this.exportLink.set(r.url);
      } else {
        const blob = new Blob([r.text], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'my-data.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        this.toast.show({ th: 'ส่งออกข้อมูลแล้ว — ดูไฟล์ในโฟลเดอร์ดาวน์โหลด', en: 'Exported — check your downloads folder' });
      }
    } catch (err) {
      this.exportError.set(this.fail(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected backToPreview(): void {
    this.deleteError.set(null);
    this.password.set('');
    this.typed.set('');
    this.step.set('preview');
    void this.loadPreview();
  }

  protected async deleteAccount(): Promise<void> {
    if (!this.canDelete()) return;
    this.busy.set(true);
    this.deleteError.set(null);
    try {
      await this.api.deleteAccount(this.password());
      this.password.set('');
      this.step.set('result');
      // ล้างสถานะฝั่งเว็บ (server ปิดทุก session แล้ว)
      await this.session.signout();
    } catch (err) {
      const e = this.api.errorOf(err);
      this.deleteError.set(myDataErrorText(e.code, e.status));
      // เหตุขวางเพิ่งเกิด (เช่น มี SOS เปิด) → กลับไปขั้นแรกให้เห็นเหตุผล
      if (e.code === 'DELETE_BLOCKED') this.backToPreview();
    } finally {
      this.busy.set(false);
    }
  }

  protected finish(): void {
    void this.router.navigateByUrl(screenUrl('A04'), { replaceUrl: true });
  }
}
