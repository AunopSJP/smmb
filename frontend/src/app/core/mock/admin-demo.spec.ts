import { AdminDemo, newGroupCode } from './admin-demo';

describe('AdminDemo', () => {
  let d: AdminDemo;
  beforeEach(() => (d = new AdminDemo()));

  it('backup swap: cannot issue a new backup before the owner puts the old one up', () => {
    d.chooseFix('q2', 'swap');
    d.issueNewBackup('q2', 'post');
    expect(d.qrCase('q2')?.resolved).toBe(false);

    d.ownerPlacedBackup('q2');
    d.issueNewBackup('q2', 'post');
    expect(d.qrCase('q2')?.resolved).toBe(true);
    expect(d.openQr().some((c) => c.id === 'q2')).toBe(false);
  });

  it('reissue and fake QR need a technician before they can be marked fixed', () => {
    d.chooseFix('q3', 'reissue');
    d.resolve('q3');
    expect(d.qrCase('q3')?.resolved).toBe(false);
    d.dispatchTechnician('q3');
    d.resolve('q3');
    expect(d.qrCase('q3')?.resolved).toBe(true);

    d.resolve('q1');
    expect(d.qrCase('q1')?.resolved).toBe(false);
    d.dispatchTechnician('q1');
    d.resolve('q1');
    expect(d.qrCase('q1')?.resolved).toBe(true);
  });

  it('an admin cannot hold another role, and cannot change their own account', () => {
    expect(d.setRoles('U-0001', ['owner', 'admin'])).toBe('ADMIN_ROLE_EXCLUSIVE');
    expect(d.user('U-0001')?.roles).toEqual(['owner']);
    expect(d.setRoles('U-0900', ['owner'])).toBe('CANNOT_CHANGE_SELF');
    expect(d.resetPassword('U-0900')).toBeNull();
  });

  it('removing the officer role also removes head and agency', () => {
    expect(d.setRoles('U-0090', ['owner'])).toBeNull();
    const u = d.user('U-0090');
    expect(u?.is_head).toBe(false);
    expect(u?.agency).toBeUndefined();
  });

  it('password reset forces a change and signs out every device', () => {
    const temp = d.resetPassword('U-0001');
    expect(temp).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    expect(d.user('U-0001')).toMatchObject({ must_change_password: true, active_sessions: 0 });
  });

  it('approving an agency gives an 8-character group code once', () => {
    const code = d.approve('a3');
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(d.pendingAgencies()).toHaveLength(0);
    expect(d.approve('a3')).toBeNull();
    expect(newGroupCode()).not.toMatch(/[01ILO]/);
  });

  it('creating an agency: new phone gets a one-time password, existing owner keeps their account', () => {
    const fresh = d.createAgency('สภ.ใหม่', 'police', 'สถานี 02-1', 'ผู้กำกับ', '0855550000');
    expect(fresh).toMatchObject({ ok: true, temp_password: expect.stringMatching(/^[A-HJKMNP-Z2-9]{10}$/) });
    expect(d.searchUsers('0855550000')[0]).toMatchObject({ is_head: true, must_change_password: true });

    const owner = d.createAgency('รปภ.ใหม่', 'guard', 'ป้อม 1', 'สมศรี', '089-111-2222');
    expect(owner).toMatchObject({ ok: true, temp_password: null });
    expect(d.user('U-0001')?.roles).toEqual(['owner', 'officer']);

    expect(d.createAgency('x', 'other', 'ติดต่อ', 'y', '081-234-5678')).toEqual({ ok: false, code: 'ROLE_EXISTS' });
    expect(d.createAgency('x', 'other', 'ติดต่อ', 'y', '080-000-0000')).toEqual({ ok: false, code: 'ADMIN_ROLE_EXCLUSIVE' });
    expect(d.createAgency('x', 'other', '', 'y', '0855550001')).toEqual({ ok: false, code: 'INVALID' });
  });

  it('user search finds a phone number typed with or without dashes', () => {
    expect(d.searchUsers('0812345678').map((u) => u.id)).toEqual(['U-0101']);
    expect(d.searchUsers('081-234').map((u) => u.id)).toEqual(['U-0101']);
    expect(d.searchUsers('สมศรี').map((u) => u.id)).toEqual(['U-0001']);
  });
});
