import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, isDevMode } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiConfig } from '../core/api';
import { I18n, type Tr } from '../core/i18n';
import { screenUrl } from '../screens/registry';
import { type IconName } from '../shared/icon';
import { ResultView } from '../shared/result-view';
import { CallButtons } from './owner/call-buttons';

type Kind = 'offline' | 'not-found' | 'session';

interface Copy {
  icon: IconName;
  tone: 'neutral' | 'warn' | 'danger';
  title: Tr;
  body: Tr;
  note?: Tr;
  action: Tr;
}

const COPY: Record<Kind, Copy> = {
  offline: {
    icon: 'wifi',
    tone: 'warn',
    title: { th: 'ไม่มีอินเทอร์เน็ต', en: 'No internet connection' },
    body: { th: 'ตรวจสัญญาณ Wi-Fi หรือเน็ตมือถือ แล้วลองอีกครั้ง', en: 'Check your Wi-Fi or mobile data, then try again.' },
    note: { th: 'SOS ต้องใช้อินเทอร์เน็ต ถ้าฉุกเฉินให้โทร 191 / 1669', en: 'SOS needs internet. In an emergency call 191 / 1669.' },
    action: { th: 'ลองอีกครั้ง', en: 'Try again' },
  },
  'not-found': {
    icon: 'search',
    tone: 'neutral',
    title: { th: 'ไม่พบหน้านี้', en: 'Page not found' },
    body: { th: 'ลิงก์อาจผิด หรือหน้านี้ไม่ได้อยู่ในบัญชีของคุณ', en: 'The link may be wrong, or this page is not in your account.' },
    action: { th: 'กลับหน้าหลัก', en: 'Back to home' },
  },
  session: {
    icon: 'user',
    tone: 'warn',
    title: { th: 'หมดเวลาเข้าสู่ระบบ', en: 'Session expired' },
    body: { th: 'เพื่อความปลอดภัย กรุณาเข้าสู่ระบบใหม่ ข้อมูลของคุณไม่หาย', en: 'For your security, please sign in again. Your data is safe.' },
    note: { th: 'แจ้งเตือนที่เปิดไว้จะกลับมาทำงานหลังเข้าสู่ระบบ', en: 'Notifications resume after you sign in.' },
    action: { th: 'เข้าสู่ระบบอีกครั้ง', en: 'Sign in again' },
  },
};

/**
 * หน้า error สาธารณะ (ErrOffline · ErrNoAccess · ErrSession) — ใช้ ResultView ตัวเดียวกับหน้าแจ้งผลอื่น (A7)
 * ไอคอนทุกแบบมาจาก shared/icon.ts ไม่ใช้ตัวอักษรเป็นไอคอน
 */
@Component({
  selector: 'app-error-screen',
  imports: [ResultView, CallButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-result-view
      [icon]="copy().icon"
      [tone]="copy().tone"
      [role]="kind() === 'offline' ? 'alert' : 'status'"
      [title]="i18n.t(copy().title)"
      [body]="i18n.t(copy().body)"
      [note]="copy().note ? i18n.t(copy().note!) : ''"
      [primaryLabel]="i18n.t(copy().action)"
      [primaryLink]="primaryLink()"
      (primary)="retry()"
      [secondaryLabel]="secondaryLabel()"
      [secondaryLink]="secondaryLink()"
    >
      @if (kind() === 'offline') {
        <!-- ฉุกเฉินต้องโทรได้ทันที แม้ไม่มีอินเทอร์เน็ต (tel: ไม่ใช้เน็ต) -->
        <app-call-buttons class="calls-wide" />
      }
    </app-result-view>
  `,
  styles: `
    :host {
      display: flex;
      min-block-size: 100dvh;
      padding: calc(24px + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left));
      background: var(--bg);
    }
    .calls-wide {
      inline-size: 100%;
    }
  `,
})
export class ErrorScreen {
  protected readonly i18n = inject(I18n);
  private readonly route = inject(ActivatedRoute);
  private readonly doc = inject(DOCUMENT);
  private readonly api = inject(ApiConfig);
  /** เงื่อนไขเดียวกับ guard ของ /demo ใน app.routes.ts */
  protected readonly showDemo = computed(() => this.api.devTools() || isDevMode());
  protected readonly home = '/';
  protected readonly signin = screenUrl('A04');

  protected readonly kind = computed<Kind>(() => {
    const data = this.route.snapshot.data;
    const code = (data['kind'] as Kind | undefined) ?? (data['code'] as string | undefined);
    return code === 'offline' || code === 'E01' ? 'offline' : code === 'session' || code === 'E03' ? 'session' : 'not-found';
  });
  protected readonly copy = computed(() => COPY[this.kind()]);
  /** ปุ่มหลักเป็นลิงก์สำหรับ session/not-found · offline ใช้ปุ่ม "ลองอีกครั้ง" (ไม่รีโหลดทันที) */
  protected readonly primaryLink = computed(() => (this.kind() === 'offline' ? null : this.kind() === 'session' ? this.signin : this.home));
  /** ปุ่มรอง: not-found บนเครื่องเดโมมี "เปลี่ยนบทบาท" · หน้าอื่นกลับหน้าแรก */
  protected readonly secondaryLabel = computed(() =>
    this.showDemo() && this.kind() === 'not-found' ? this.i18n.t({ th: 'เปลี่ยนบทบาท', en: 'Switch role' }) : this.i18n.t({ th: 'กลับหน้าแรก', en: 'Go to start' }),
  );
  protected readonly secondaryLink = computed(() => (this.showDemo() && this.kind() === 'not-found' ? '/demo' : '/'));

  protected retry(): void {
    const win = this.doc.defaultView;
    if (!win) return;
    if (win.navigator.onLine) {
      let back = this.home;
      try {
        back = sessionStorage.getItem('smmb.after-offline') || this.home;
        sessionStorage.removeItem('smmb.after-offline');
      } catch {
        /* ใช้หน้าแรก */
      }
      win.location.assign(back);
    } else {
      win.location.reload();
    }
  }
}
