import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { I18n, type Tr } from '../core/i18n';
import { screenUrl } from '../screens/registry';
import { Icon, type IconName } from '../shared/icon';

type Kind = 'offline' | 'not-found' | 'session';

interface Copy {
  icon: IconName;
  title: Tr;
  body: Tr;
  note?: Tr;
  action: Tr;
}

const COPY: Record<Kind, Copy> = {
  offline: {
    icon: 'wifi',
    title: { th: 'ไม่มีอินเทอร์เน็ต', en: 'No internet connection' },
    body: { th: 'ตรวจสัญญาณ Wi-Fi หรือเน็ตมือถือ แล้วลองอีกครั้ง', en: 'Check your Wi-Fi or mobile data, then try again.' },
    note: { th: 'SOS ต้องใช้อินเทอร์เน็ต ถ้าฉุกเฉินให้โทร 191 / 1669', en: 'SOS needs internet. In an emergency call 191 / 1669.' },
    action: { th: 'ลองอีกครั้ง', en: 'Try again' },
  },
  'not-found': {
    icon: 'alert',
    title: { th: 'ไม่พบหน้านี้', en: 'Page not found' },
    body: { th: 'ลิงก์อาจผิด หรือหน้านี้ไม่ได้อยู่ในบัญชีของคุณ', en: 'The link may be wrong, or this page is not in your account.' },
    action: { th: 'กลับหน้าหลัก', en: 'Back to home' },
  },
  session: {
    icon: 'user',
    title: { th: 'หมดเวลาเข้าสู่ระบบ', en: 'Session expired' },
    body: { th: 'เพื่อความปลอดภัย กรุณาเข้าสู่ระบบใหม่ ข้อมูลของคุณไม่หาย', en: 'For your security, please sign in again. Your data is safe.' },
    note: { th: 'แจ้งเตือนที่เปิดไว้จะกลับมาทำงานหลังเข้าสู่ระบบ', en: 'Notifications resume after you sign in.' },
    action: { th: 'เข้าสู่ระบบอีกครั้ง', en: 'Sign in again' },
  },
};

/** หน้า error ตามแคนวาส: ErrOffline · ErrNoAccess · ErrSession */
@Component({
  selector: 'app-error-screen',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <span class="bubble"><app-icon [name]="copy().icon" [size]="40" /></span>
      <h1>{{ i18n.t(copy().title) }}</h1>
      <p>{{ i18n.t(copy().body) }}</p>
      @if (copy().note; as note) {
        <p class="note">{{ i18n.t(note) }}</p>
      }

      <section class="card adv-only tech">
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'รหัส', en: 'Code' }) }}</dt>
          <dd class="mono">{{ tech().code }}</dd>
          <dt>{{ i18n.t({ th: 'เส้นทาง', en: 'Path' }) }}</dt>
          <dd class="mono">{{ tech().path }}</dd>
          <dt>{{ i18n.t({ th: 'สถานะเบราว์เซอร์', en: 'Browser state' }) }}</dt>
          <dd class="mono">{{ tech().state }}</dd>
        </dl>
      </section>

      @if (kind() === 'offline') {
        <button type="button" class="btn" (click)="retry()">{{ i18n.t(copy().action) }}</button>
      } @else if (kind() === 'session') {
        <a class="btn" [routerLink]="signin">{{ i18n.t(copy().action) }}</a>
      } @else {
        <a class="btn" [routerLink]="home">{{ i18n.t(copy().action) }}</a>
        <a class="btn secondary" routerLink="/demo">{{ i18n.t({ th: 'เปลี่ยนบทบาท', en: 'Switch role' }) }}</a>
      }

      <a class="muted small" routerLink="/">{{ i18n.t({ th: 'กลับหน้าแรก', en: 'Go to start' }) }}</a>
    </div>
  `,
  styles: `
    :host { display: grid; place-items: center; min-block-size: 100dvh; padding: calc(24px + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left)); background: var(--bg); }
    .wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; inline-size: min(420px, 100%); text-align: center; }
    .bubble { display: grid; place-items: center; inline-size: 92px; block-size: 92px; border-radius: 46px; background: var(--icon-bg); color: var(--brand); }
    h1 { margin: 6px 0 0; font-size: 1.5rem; }
    p { margin: 0; color: var(--text-muted); line-height: 1.5; }
    .note { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface); border: 1px solid var(--line); }
    .btn { inline-size: 100%; }
    .muted { margin-block-start: 6px; }
    .tech { inline-size: 100%; text-align: start; }
  `,
})
export class ErrorScreen {
  protected readonly i18n = inject(I18n);
  private readonly route = inject(ActivatedRoute);
  private readonly doc = inject(DOCUMENT);
  protected readonly home = '/';
  protected readonly signin = screenUrl('A04');

  protected readonly kind = computed<Kind>(() => {
    const data = this.route.snapshot.data;
    const code = (data['kind'] as Kind | undefined) ?? (data['code'] as string | undefined);
    return code === 'offline' || code === 'E01' ? 'offline' : code === 'session' || code === 'E03' ? 'session' : 'not-found';
  });
  protected readonly copy = computed(() => COPY[this.kind()]);
  protected readonly tech = computed(() => {
    const win = this.doc.defaultView;
    const kind = this.kind();
    return {
      code: kind === 'offline' ? 'NET' : kind === 'session' ? '401 · SESSION_EXPIRED' : '404 · NOT_FOUND',
      path: win?.location.pathname ?? '—',
      state:
        kind === 'offline'
          ? `navigator.onLine=${win?.navigator.onLine ?? false}`
          : kind === 'session'
            ? 'cookie sid missing or expired'
            : `visibility=${win?.document.visibilityState ?? '—'}`,
    };
  });

  protected retry(): void {
    this.doc.defaultView?.location.reload();
  }
}
