import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AdminApi } from './admin-api';
import { OfficerSosApi } from './owner-api';
import { TabBadges } from './tab-badges';

describe('TabBadges', () => {
  it('counts open SOS from the backend on the officer routes', async () => {
    const events = new Subject<NavigationEnd>();
    const router = { url: '/officer', events };
    const officerSos = { list: vi.fn().mockResolvedValue([{ id: 'sos-1' }, { id: 'sos-2' }]) };
    const adminApi = { qrIssues: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: OfficerSosApi, useValue: officerSos },
        { provide: AdminApi, useValue: adminApi },
      ],
    });

    const badges = TestBed.inject(TabBadges);
    await vi.waitFor(() => expect(officerSos.list).toHaveBeenCalledWith('open'));

    expect(badges.counts()['O12']).toBe(2);
    expect(adminApi.qrIssues).not.toHaveBeenCalled();
  });

  it('counts unresolved QR issues from the backend on the admin routes', async () => {
    const events = new Subject<NavigationEnd>();
    const router = { url: '/admin/boxes', events };
    const officerSos = { list: vi.fn().mockResolvedValue([]) };
    const adminApi = { qrIssues: vi.fn().mockResolvedValue([{ id: 'qr-1' }, { id: 'qr-2' }, { id: 'qr-3' }]) };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: OfficerSosApi, useValue: officerSos },
        { provide: AdminApi, useValue: adminApi },
      ],
    });

    const badges = TestBed.inject(TabBadges);
    await vi.waitFor(() => expect(adminApi.qrIssues).toHaveBeenCalledOnce());

    expect(badges.counts()['D05']).toBe(3);
    expect(officerSos.list).not.toHaveBeenCalled();
  });
});
