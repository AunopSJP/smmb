import { TestBed } from '@angular/core/testing';
import { AdminApi } from '../core/admin-api';
import { I18n } from '../core/i18n';
import { BoxSetupQr, SETUP_QR_TTL_MS, setupQrLink } from './box-setup-qr';

describe('setupQrLink', () => {
  const secret = '65dafb799784ed3b28d608b1f06bc7201ab8097735360ae35682f339428ea35f';

  it('puts every value in the fragment (never the query string) and encodes it', () => {
    const link = setupQrLink('BX-00003', secret, 'https://hub.example.net/smmb-api');
    expect(link.startsWith('http://192.168.4.1/#')).toBe(true);
    expect(link).not.toContain('?');
    expect(link).toContain(`secret=${secret}`);
    expect(link).toContain('url=https%3A%2F%2Fhub.example.net%2Fsmmb-api');
  });

  it('strips trailing slashes from the server URL', () => {
    const link = setupQrLink('BX-00003', secret, 'https://hub.example.net/smmb-api///');
    expect(link).toContain('url=https%3A%2F%2Fhub.example.net%2Fsmmb-api');
    expect(link).not.toContain('%2F%2F%2F');
  });

  it('round-trips through URLSearchParams (what the board page reads)', () => {
    const params = new URLSearchParams(setupQrLink('BX-00003', secret, 'http://192.168.1.20:3000').split('#')[1]);
    expect(params.get('box')).toBe('BX-00003');
    expect(params.get('secret')).toBe(secret);
    expect(params.get('url')).toBe('http://192.168.1.20:3000');
  });
});

describe('BoxSetupQr', () => {
  const secret = '0123456789abcdef'.repeat(4);
  const api = { revealSecret: vi.fn() };

  beforeEach(() => {
    api.revealSecret.mockReset();
    TestBed.configureTestingModule({
      imports: [BoxSetupQr],
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: I18n, useValue: { t: (message: { th: string }) => message.th } },
      ],
    });
    TestBed.overrideComponent(BoxSetupQr, {
      set: { template: '<button id="show" (click)="show()">show</button><button id="hide" (click)="hide()">hide</button><output id="link">{{ link() ?? "" }}</output>' },
    });
  });

  const make = () => {
    const fixture = TestBed.createComponent(BoxSetupQr);
    fixture.componentRef.setInput('boxId', 'BX-00003');
    fixture.componentRef.setInput('serverUrl', 'https://hub.example.net/smmb-api/');
    fixture.detectChanges();
    return fixture;
  };

  it('reveals the secret once and builds the fragment link', async () => {
    api.revealSecret.mockResolvedValue({ box_id: 'BX-00003', device_secret: secret });
    const fixture = make();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('#show')!.click();
    await vi.waitFor(() => expect(api.revealSecret).toHaveBeenCalledWith('BX-00003'));
    await vi.waitFor(() => expect(host.querySelector('#link')!.textContent).toContain('secret='));
    fixture.detectChanges();
    expect(host.querySelector('#link')!.textContent).toBe(setupQrLink('BX-00003', secret, 'https://hub.example.net/smmb-api'));
    fixture.destroy();
  });

  it('hides the QR immediately on request and after two minutes', async () => {
    vi.useFakeTimers();
    try {
      api.revealSecret.mockResolvedValue({ box_id: 'BX-00003', device_secret: secret });
      const fixture = make();
      const host = fixture.nativeElement as HTMLElement;
      host.querySelector<HTMLButtonElement>('#show')!.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();
      expect(host.querySelector('#link')!.textContent).toContain('#box=BX-00003');

      host.querySelector<HTMLButtonElement>('#hide')!.click();
      fixture.detectChanges();
      expect(host.querySelector('#link')!.textContent).toBe('');

      host.querySelector<HTMLButtonElement>('#show')!.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();
      expect(host.querySelector('#link')!.textContent).toContain('#box=BX-00003');
      await vi.advanceTimersByTimeAsync(SETUP_QR_TTL_MS);
      fixture.detectChanges();
      expect(host.querySelector('#link')!.textContent).toBe('');
      fixture.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
