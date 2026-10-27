import { OwnerHomeState } from './owner-home-state';

describe('OwnerHomeState', () => {
  let s: OwnerHomeState;
  beforeEach(() => (s = new OwnerHomeState()));

  it('normal shows no alerts', () => {
    expect([s.showPushBanner(), s.noOfficer(), s.offline(), s.qrTask(), s.lowBattery(), s.noEvents()]).toEqual([
      false, false, false, false, false, false,
    ]);
    expect(s.taskCount()).toBe(0);
  });

  it('H03-b new user: push banner until turned on, no officer, no events', () => {
    s.set('new');
    expect(s.showPushBanner()).toBe(true);
    expect(s.noOfficer()).toBe(true);
    expect(s.noEvents()).toBe(true);
    s.pushOn.set(true);
    expect(s.showPushBanner()).toBe(false);
  });

  it('H03-c offline', () => {
    s.set('offline');
    expect(s.offline()).toBe(true);
    expect(s.taskCount()).toBe(0);
  });

  it('H03-d to-do: QR task disappears after "done", battery stays', () => {
    s.set('todo');
    expect(s.taskCount()).toBe(2);
    s.qrSwapped.set(true);
    expect(s.qrTask()).toBe(false);
    expect(s.taskCount()).toBe(1);
  });

  it('switching state brings finished tasks back for the demo', () => {
    s.set('todo');
    s.qrSwapped.set(true);
    s.set('todo');
    expect(s.taskCount()).toBe(2);
  });
});
