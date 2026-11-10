import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { of } from 'rxjs';
import { AppReset } from './app-reset';
import { Session, type Me } from './session';

const me = (id: string): Me =>
  ({
    id,
    roles: ['owner'],
    agency_status: null,
    name: 'ทดสอบ',
    display_name: 'ทดสอบ',
    phone: '0812345678',
    agency: null,
    push: { subscribed: false },
    prefs: { theme: 'system', lang: 'th', text_size: 'normal', simple_home: false, night_auto_dark: true, easy_mode: false, muted_types: [] },
    must_change_password: false,
    terms_update_required: false,
  }) as Me;

describe('Session', () => {
  let session: Session;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SwPush, useValue: { isEnabled: false, subscription: of(null) } }],
    });
    session = TestBed.inject(Session);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('a guard that ran before sign-up must not keep answering "not signed in" after refresh() (bounced new users to the sign-in page)', async () => {
    const first = session.ensure(); // เปิดลิงก์ที่ `/` ตอนยังไม่ล็อกอิน
    http.expectOne('/api/v1/me').flush({ code: 'NO_SESSION' }, { status: 401, statusText: 'Unauthorized' });
    expect(await first).toBeNull();

    const afterSignup = session.refresh(); // สมัครเสร็จ → cookie ถูกตั้งแล้ว
    http.expectOne('/api/v1/me').flush(me('U-1'));
    expect((await afterSignup)?.id).toBe('U-1');

    // guard ตัวถัดไปต้องเห็นบัญชีที่เพิ่งสมัคร ไม่ยิง /me ซ้ำ และไม่ใช่ null
    expect((await session.ensure())?.id).toBe('U-1');
    http.expectNone('/api/v1/me');
  });

  it('ensure() asks the server once; signing out makes guards answer null without another request', async () => {
    const first = session.ensure();
    http.expectOne('/api/v1/me').flush(me('U-2'));
    expect((await first)?.id).toBe('U-2');
    expect((await session.ensure())?.id).toBe('U-2');

    const out = session.signout();
    http.expectOne('/api/v1/auth/signout').flush({ ok: true });
    await out;
    expect(await session.ensure()).toBeNull();
  });

  it('signing out clears in-memory state of shared services (shared device)', async () => {
    const reset = TestBed.inject(AppReset);
    let cleared = false;
    reset.register(() => (cleared = true));

    const out = session.signout();
    http.expectOne('/api/v1/auth/signout').flush({ ok: true });
    await out;
    expect(cleared).toBe(true);
  });
});
