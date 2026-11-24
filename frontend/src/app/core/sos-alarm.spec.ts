import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveRefresh } from './live-refresh';
import { OfficerSosApi, type SosCard } from './owner-api';
import { SosAlarm } from './sos-alarm';

const card = (status: SosCard['status'], mine = false): SosCard => ({
  id: status,
  status,
  stage: 'zone',
  created_at: new Date().toISOString(),
  house_no: '1',
  owner: null,
  house: null,
  accepted_by: null,
  mine,
});

function setup(cases: SosCard[]) {
  const list = vi.fn().mockResolvedValue(cases);
  TestBed.configureTestingModule({
    providers: [
      { provide: OfficerSosApi, useValue: { list } },
      { provide: LiveRefresh, useValue: { ticks: { subscribe: () => ({ unsubscribe() {} }) } } },
    ],
  });
  return { alarm: TestBed.inject(SosAlarm), list };
}

describe('SosAlarm', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('rings while an SOS is still unaccepted', async () => {
    const { alarm } = setup([card('open')]);
    alarm.start();
    await vi.waitFor(() => expect(alarm.ringing()).toBe(true));
    alarm.stop();
  });

  it('stays quiet when every open SOS has been accepted', async () => {
    const { alarm, list } = setup([card('accepted', true)]);
    alarm.start();
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    expect(alarm.ringing()).toBe(false);
    alarm.stop();
  });

  it('stops ringing when watching ends', async () => {
    const { alarm } = setup([card('open')]);
    alarm.start();
    await vi.waitFor(() => expect(alarm.ringing()).toBe(true));
    alarm.stop();
    expect(alarm.ringing()).toBe(false);
  });

  it('asks for a tap while ringing but the browser has not unlocked sound', async () => {
    const { alarm } = setup([card('open')]);
    alarm.start();
    await vi.waitFor(() => expect(alarm.needsTap()).toBe(true));
    alarm.stop();
  });
});
