import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { PushBlockedError, PushNotifications } from './push-notifications';

describe('PushNotifications', () => {
  const sub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  let subscriptionState: BehaviorSubject<typeof sub | null>;
  const swPush = {
    isEnabled: true,
    requestSubscription: vi.fn().mockResolvedValue(sub),
    get subscription() {
      return subscriptionState.asObservable();
    },
  };

  let push: PushNotifications;
  let http: HttpTestingController;
  let notification: { permission: NotificationPermission; requestPermission: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    subscriptionState = new BehaviorSubject<typeof sub | null>(null);
    notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') };
    vi.stubGlobal('Notification', notification);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SwPush, useValue: swPush }],
    });
    push = TestBed.inject(PushNotifications);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      TestBed.resetTestingModule();
    }
  });

  it('enable: gets the VAPID key, subscribes, and sends the subscription to the server', async () => {
    const done = push.enable('มือถือ');
    await vi.waitFor(() => expect(notification.requestPermission).toHaveBeenCalledOnce());
    const keyRequest = await vi.waitFor(() => http.expectOne('/api/v1/me/push/vapid-key'));
    keyRequest.flush({ public_key: 'KEY' });
    await vi.waitFor(() => expect(swPush.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'KEY' }));
    const req = await vi.waitFor(() => http.expectOne('/api/v1/me/push/subscriptions'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ endpoint: sub.endpoint, keys: { p256dh: 'p', auth: 'a' }, device_label: 'มือถือ' });
    req.flush({ ok: true });
    await done;
  });

  it('disable: tells the server, then unsubscribes the browser', async () => {
    subscriptionState.next(sub);
    const done = push.disable();
    const req = await vi.waitFor(() => http.expectOne('/api/v1/me/push/subscriptions'));
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ endpoint: sub.endpoint });
    req.flush({ ok: true });
    await done;
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('LINE in-app browser is blocked before asking for permission', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone) Line/14.0.0');
    expect(push.blocker()).toBe('line-browser');
    await expect(push.enable()).rejects.toBeInstanceOf(PushBlockedError);
  });

  it('permission denied is reported', () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() });
    expect(push.blocker()).toBe('denied');
  });
});
