import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { AdminApi, type AdminBoxDetail } from '../../core/admin-api';
import { ApiConfig } from '../../core/api';
import { I18n } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { AdminBox } from './admin-boxes';

const config = {
  report_at: '23:30',
  scan_timeout_s: 20,
  max_attempts: 3,
  flash_when_dark: true,
  longpoll_wait_s: 50,
  windows: [['00:00', '23:59']] as [string, string][],
};

const boxDetail = (inSync: boolean): AdminBoxDetail => ({
  id: 'BX-00001',
  house_no: '7/1',
  name: 'บ้านตัวอย่าง',
  bound: true,
  status: 'sleeping',
  battery: null,
  last_seen_at: null,
  last_poll_at: null,
  fw: 'test',
  can_delete: false,
  service_active: true,
  registered_at: '2026-10-28T00:00:00.000Z',
  config: { config_ver: 12, config, box_config_ver: 12, in_sync: inSync },
  qr: [],
  reports: [],
  camera_diagnostics: null,
  auth_failures: [],
});

describe('AdminBox reset action', () => {
  it('confirms preservation, resets through the API, reloads sync state, and reports the result', async () => {
    const adminApi = {
      box: vi.fn().mockResolvedValueOnce(boxDetail(false)).mockResolvedValueOnce(boxDetail(true)),
      resetBoxConfig: vi.fn().mockResolvedValue({ box_id: 'BX-00001', config_ver: 12, config }),
    };
    const toast = { show: vi.fn() };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    TestBed.configureTestingModule({
      imports: [AdminBox],
      providers: [
        { provide: AdminApi, useValue: adminApi },
        { provide: ApiConfig, useValue: { apiBase: signal('/smmb-api') } },
        { provide: I18n, useValue: { t: (message: { th: string }) => message.th } },
        { provide: Toast, useValue: toast },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(AdminBox, { set: { template: '<button type="button" (click)="resetConfig()">Reset</button>' } });

    const fixture = TestBed.createComponent(AdminBox);
    fixture.componentRef.setInput('id', 'BX-00001');
    fixture.detectChanges();
    await vi.waitFor(() => expect(adminApi.box).toHaveBeenCalledOnce());
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button').click();
    await vi.waitFor(() => expect(adminApi.resetBoxConfig).toHaveBeenCalledWith('BX-00001'));
    await vi.waitFor(() => expect(toast.show).toHaveBeenCalledOnce());

    expect(adminApi.box).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('เจ้าของ, QR และประวัติไว้'));
    expect(toast.show).toHaveBeenCalledWith({ th: 'คืนค่าแล้ว · บอร์ดรับค่ากลางแล้ว', en: 'Restored · the board has applied shared settings' });
    fixture.destroy();
  });

  it('does not call the backend when the administrator cancels confirmation', async () => {
    const adminApi = { box: vi.fn().mockResolvedValue(boxDetail(false)), resetBoxConfig: vi.fn() };
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    TestBed.configureTestingModule({
      imports: [AdminBox],
      providers: [
        { provide: AdminApi, useValue: adminApi },
        { provide: ApiConfig, useValue: { apiBase: signal('/smmb-api') } },
        { provide: I18n, useValue: { t: (message: { th: string }) => message.th } },
        { provide: Toast, useValue: { show: vi.fn() } },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(AdminBox, { set: { template: '<button type="button" (click)="resetConfig()">Reset</button>' } });

    const fixture = TestBed.createComponent(AdminBox);
    fixture.componentRef.setInput('id', 'BX-00001');
    fixture.detectChanges();
    await vi.waitFor(() => expect(adminApi.box).toHaveBeenCalledOnce());
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();

    expect(adminApi.resetBoxConfig).not.toHaveBeenCalled();
    expect(adminApi.box).toHaveBeenCalledOnce();
    fixture.destroy();
  });
});
