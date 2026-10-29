import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { I18n } from '../../core/i18n';
import { screenUrl } from '../../screens/registry';
import { RiderCode, RiderApi } from './rider';

const createRiderCode = (api: { open: ReturnType<typeof vi.fn> }, router: { navigateByUrl: ReturnType<typeof vi.fn> }) => {
  TestBed.configureTestingModule({
    imports: [RiderCode],
    providers: [
      { provide: RiderApi, useValue: api },
      { provide: Router, useValue: router },
      { provide: I18n, useValue: { t: (message: { th: string }) => message.th } },
    ],
  });
  TestBed.overrideComponent(RiderCode, {
    set: {
      template: `
        <input [value]="code()" (input)="code.set($any($event.target).value)" />
        <button type="button" [disabled]="!ready() || busy()" (click)="go()">Continue</button>
      `,
    },
  });
  return TestBed.createComponent(RiderCode);
};

describe('RiderCode user flow', () => {
  it('normalizes the printed code, asks the backend for a ticket, and opens delivery after success', async () => {
    const api = { open: vi.fn().mockResolvedValue(null) };
    const router = { navigateByUrl: vi.fn() };
    const fixture = createRiderCode(api, router);
    fixture.detectChanges();

    const root: unknown = fixture.nativeElement;
    if (!(root instanceof HTMLElement)) throw new Error('Rider code root was not rendered');
    const input = root.querySelector('input');
    const button = root.querySelector('button');
    if (!input || !button) throw new Error('Rider code controls were not rendered');
    input.value = 'h4kd - 9trw';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button.click();

    await vi.waitFor(() => expect(api.open).toHaveBeenCalledWith('/api/v1/public/codes/H4KD9TRW'));
    await vi.waitFor(() => expect(router.navigateByUrl).toHaveBeenCalledWith(screenUrl('R02')));
    fixture.destroy();
  });

  it('opens the service-closed screen when the backend refuses delivery', async () => {
    const api = { open: vi.fn().mockResolvedValue('BOX_SERVICE_CLOSED') };
    const router = { navigateByUrl: vi.fn() };
    const fixture = createRiderCode(api, router);
    fixture.detectChanges();

    const root: unknown = fixture.nativeElement;
    if (!(root instanceof HTMLElement)) throw new Error('Rider code root was not rendered');
    const input = root.querySelector('input');
    const button = root.querySelector('button');
    if (!input || !button) throw new Error('Rider code controls were not rendered');
    input.value = 'H4KD9TRW';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button.click();

    await vi.waitFor(() => expect(router.navigateByUrl).toHaveBeenCalledWith(screenUrl('R03-b')));
    fixture.destroy();
  });
});
