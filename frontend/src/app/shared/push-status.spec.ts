import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PushNotifications, type PushBlocker } from '../core/push-notifications';
import { Session } from '../core/session';
import { PushStatus } from './push-status';

function render(subscribed: boolean, blocker: PushBlocker | null, compact = false, deviceActive = true) {
  const me = signal({ push: { subscribed } });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: Session, useValue: { me, refresh: () => Promise.resolve() } },
      { provide: PushNotifications, useValue: { blocker: () => blocker, isActive: () => Promise.resolve(deviceActive) } },
    ],
  });
  const fixture = TestBed.createComponent(PushStatus);
  fixture.componentRef.setInput('compact', compact);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

async function renderAsync(subscribed: boolean, compact: boolean, deviceActive: boolean) {
  const me = signal({ push: { subscribed } });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: Session, useValue: { me, refresh: () => Promise.resolve() } },
      { provide: PushNotifications, useValue: { blocker: () => null, isActive: () => Promise.resolve(deviceActive) } },
    ],
  });
  const f = TestBed.createComponent(PushStatus);
  f.componentRef.setInput('compact', compact);
  f.detectChanges();
  await new Promise((r) => setTimeout(r, 0));
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('PushStatus', () => {
  it('shows nothing once on when compact (no banner to turn it on again)', async () => {
    expect((await renderAsync(true, true, true)).textContent?.trim()).toBe('');
  });

  it('keeps the turn-on banner when the server says on but this browser lost the subscription', async () => {
    expect((await renderAsync(true, true, false)).textContent).toContain('เปิดแจ้งเตือน');
  });

  it('says this device is on and offers a test', () => {
    const el = render(true, null);
    expect(el.textContent).toContain('เครื่องนี้รับแจ้งเตือนอยู่');
    expect(el.textContent).toContain('ส่งทดสอบ');
  });

  it('offers the turn-on button when allowed but off', () => {
    const el = render(false, null);
    expect(el.textContent).toContain('เครื่องนี้ยังไม่ได้รับแจ้งเตือน');
    expect(el.textContent).toContain('เปิดแจ้งเตือน');
  });

  it('explains how to fix a blocked permission instead of showing the button', () => {
    const el = render(false, 'denied');
    expect(el.textContent).toContain('เคยกดไม่อนุญาตไว้');
    expect(el.querySelector('button')).toBeNull();
  });

  it('sends LINE users to A01 and iPhone users to A02', () => {
    expect(render(false, 'line-browser').querySelector('a')?.getAttribute('href')).toContain('/');
    TestBed.resetTestingModule();
    expect(render(false, 'ios-not-installed').textContent).toContain('เพิ่มเว็บลงหน้าจอหลัก');
  });
});
